package app.verelle

import android.util.Base64
import app.verelle.ffi.LocalRepository
import app.verelle.ffi.accountLoginDeviceProof
import app.verelle.ffi.accountRegistrationDeviceProof
import app.verelle.ffi.opaqueAccountRecoveryFinish
import app.verelle.ffi.opaqueLoginFinish
import app.verelle.ffi.opaqueLoginStart
import app.verelle.ffi.opaqueRegistrationStart
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

data class AccountEnrollmentResult(
    val enrollment: SyncEnrollment,
    val recoveryCode: String,
    /** Non-null when account creation succeeded but the initial session did not. */
    val loginError: String? = null,
)

data class AccountRecoveryResult(
    val enrollment: SyncEnrollment,
    val recoveryCode: String,
    /** Non-null when recovery succeeded but the initial session did not. */
    val loginError: String? = null,
)

/** Runs the Android half of the shared RFC 9807 OPAQUE account protocol. */
class AccountEnrollmentClient(
    private val deviceId: String,
    private val deviceSigningKey: DeviceSigningKey = DeviceSigningKey(),
) {
    fun register(
        repository: LocalRepository,
        email: String,
        password: String,
    ): AccountEnrollmentResult {
        validatePassword(password)
        val normalizedEmail = email.trim().lowercase()
        val registration = withPasswordBytes(password, ::opaqueRegistrationStart)
        val started = post(
            REGISTRATION_START_PATH,
            JSONObject()
                .put("account_identifier", normalizedEmail)
                .put("registration_request", opaque(registration.request)),
        )
        val flowId = started.getString("flow_id")
        val material = withPasswordBytes(password) { passwordBytes ->
            repository.finishAccountRegistration(
                state = registration.state,
                password = passwordBytes,
                accountIdentifier = normalizedEmail,
                registrationResponse = decodeOpaque(started, "registration_response"),
            )
        }
        registration.state.fill(0)

        val datasetId = repository.datasetId()
        val proof = accountRegistrationDeviceProof(
            flowId = flowId,
            deviceId = deviceId,
            datasetId = datasetId,
            registrationUpload = material.registrationUpload,
        )
        val finished = post(
            REGISTRATION_FINISH_PATH,
            JSONObject()
                .put("flow_id", flowId)
                .put("device_id", deviceId)
                .put("dataset_id", datasetId)
                .put("registration_upload", opaque(material.registrationUpload))
                .put("device_public_key", opaque(deviceSigningKey.publicKeySpki()))
                .put("device_signature", opaque(deviceSigningKey.sign(proof)))
                .put("wrapped_account_key", opaque(material.wrappedAccountKey))
                .put("recovery_wrapped_account_key", opaque(material.recoveryWrappedAccountKey))
                .put("recovery_public_key", opaque(material.recoveryPublicKey))
                .put("wrapped_dataset_key", opaque(material.wrappedDatasetKey))
                .put(
                    "health_data_consent",
                    JSONObject()
                        .put("policy_version", HEALTH_DATA_CONSENT_VERSION)
                        .put("affirmative", true),
                ),
        )
        check(finished.getString("device_id") == deviceId) {
            "The account service returned a different device"
        }
        check(finished.getString("dataset_id") == datasetId) {
            "The account service returned a different encrypted dataset"
        }

        // Registration is already committed on the server. Always return the
        // recovery code and pinned enrollment metadata even if the immediate
        // login request is interrupted; the caller must persist both before
        // asking the user to acknowledge the recovery code.
        val baseEnrollment = SyncEnrollment(
            datasetId = datasetId,
            bearerToken = "",
            expiresAtUnixSeconds = 0,
            email = normalizedEmail,
            deviceId = deviceId,
            serverPublicKey = encode(material.serverPublicKey),
        )
        val login = runCatching { login(baseEnrollment, password) }
        return AccountEnrollmentResult(
            enrollment = login.getOrDefault(baseEnrollment),
            recoveryCode = material.recoveryCode,
            loginError = login.exceptionOrNull()?.message,
        )
    }

    fun login(enrollment: SyncEnrollment, password: String): SyncEnrollment {
        validatePassword(password)
        require(enrollment.email.isNotBlank() && enrollment.deviceId == deviceId) {
            "This installation has no password-login enrollment"
        }
        val login = withPasswordBytes(password, ::opaqueLoginStart)
        val started = post(
            LOGIN_START_PATH,
            JSONObject()
                .put("account_identifier", enrollment.email)
                .put("device_id", deviceId)
                .put("credential_request", opaque(login.request)),
        )
        val flowId = started.getString("flow_id")
        val finished = withPasswordBytes(password) { passwordBytes ->
            opaqueLoginFinish(
                state = login.state,
                password = passwordBytes,
                accountIdentifier = enrollment.email,
                credentialResponse = decodeOpaque(started, "credential_response"),
                expectedServerPublicKey = decode(enrollment.serverPublicKey),
            )
        }
        login.state.fill(0)
        val proof = accountLoginDeviceProof(
            flowId,
            decodeOpaque(started, "device_challenge"),
        )
        val session = post(
            LOGIN_FINISH_PATH,
            JSONObject()
                .put("flow_id", flowId)
                .put("credential_finalization", opaque(finished.credentialFinalization))
                .put("device_id", deviceId)
                .put("device_signature", opaque(deviceSigningKey.sign(proof))),
        )
        check(session.getString("device_id") == deviceId) {
            "The account service returned a different device"
        }
        return enrollment.copy(
            bearerToken = session.getJSONObject("access_token").getString("message"),
            expiresAtUnixSeconds = session.getLong("expires_at_unix_seconds"),
        )
    }

    /**
     * Replaces the account password, recovery code, and enrolled device after
     * proving possession of the offline recovery code. The account key remains
     * behind the Rust boundary throughout the exchange.
     */
    fun recover(
        repository: LocalRepository,
        localDataKeyManager: LocalDataKeyManager,
        enrollmentStore: SyncEnrollmentStore,
        pendingRecoveryStore: PendingAccountRecoveryStore,
        email: String,
        recoveryCode: String,
        newPassword: String,
    ): AccountRecoveryResult {
        require(repository.isPristine()) {
            "Recovery requires an empty local chart; export or remove local data first"
        }
        require(!pendingRecoveryStore.hasPending()) {
            "A previously started account recovery must be resumed first"
        }
        validatePassword(newPassword)
        val normalizedEmail = email.trim().lowercase()
        val registration = withPasswordBytes(newPassword, ::opaqueRegistrationStart)
        val started = try {
            post(
                RECOVERY_START_PATH,
                JSONObject()
                    .put("account_identifier", normalizedEmail)
                    .put("registration_request", opaque(registration.request)),
            )
        } catch (error: Exception) {
            registration.state.fill(0)
            throw error
        }
        val flowId = started.getString("flow_id")
        val datasetId = started.getString("dataset_id")
        val devicePublicKey = deviceSigningKey.publicKeySpki()
        val material = try {
            withPasswordBytes(newPassword) { passwordBytes ->
                opaqueAccountRecoveryFinish(
                    state = registration.state,
                    password = passwordBytes,
                    accountIdentifier = normalizedEmail,
                    registrationResponse = decodeOpaque(started, "registration_response"),
                    recoveryCode = recoveryCode,
                    recoveryWrappedAccountKey = decodeOpaque(
                        started,
                        "recovery_wrapped_account_key",
                    ),
                    wrappedDatasetKey = decodeOpaque(started, "wrapped_dataset_key"),
                    flowId = flowId,
                    deviceId = deviceId,
                    datasetId = datasetId,
                    recoveryChallenge = decodeOpaque(started, "recovery_challenge"),
                    devicePublicKey = devicePublicKey,
                )
            }
        } finally {
            registration.state.fill(0)
        }
        val deviceProof = accountRegistrationDeviceProof(
            flowId = flowId,
            deviceId = deviceId,
            datasetId = datasetId,
            registrationUpload = material.registrationUpload,
        )
        val finishRequest = JSONObject()
                .put("flow_id", flowId)
                .put("device_id", deviceId)
                .put("dataset_id", datasetId)
                .put("registration_upload", opaque(material.registrationUpload))
                .put("device_public_key", opaque(devicePublicKey))
                .put("device_signature", opaque(deviceSigningKey.sign(deviceProof)))
                .put("recovery_signature", opaque(material.recoverySignature))
                .put("wrapped_account_key", opaque(material.wrappedAccountKey))
                .put(
                    "recovery_wrapped_account_key",
                    opaque(material.recoveryWrappedAccountKey),
                )
                .put("wrapped_dataset_key", opaque(material.wrappedDatasetKey))
        val baseEnrollment = SyncEnrollment(
            datasetId = datasetId,
            bearerToken = "",
            expiresAtUnixSeconds = 0,
            email = normalizedEmail,
            deviceId = deviceId,
            serverPublicKey = encode(material.serverPublicKey),
        )
        val pending = PendingAccountRecovery(
            finishRequestJson = finishRequest.toString(),
            enrollment = baseEnrollment,
            recoveryCode = material.recoveryCode,
            recoveredDatasetKey = material.recoveredDatasetKey,
        )

        // The encrypted journal is durable before either the local identity or
        // the server account changes. It makes every later step replayable.
        try {
            pendingRecoveryStore.save(pending)
            try {
                if (repository.datasetId() != pending.enrollment.datasetId) {
                    repository.adoptRecoveredDataset(
                        pending.recoveredDatasetKey,
                        pending.enrollment.datasetId,
                    )
                }
            } catch (error: Exception) {
                // The server is unchanged at this point. A concurrent local
                // write makes this prepared journal definitively unusable and
                // safe to discard; storage/commit ambiguity retains it.
                if (
                    repository.datasetId() != pending.enrollment.datasetId &&
                    !repository.isPristine()
                ) {
                    pendingRecoveryStore.clearAfterAcknowledgement()
                }
                throw error
            }
            localDataKeyManager.replaceDataKey(pending.recoveredDatasetKey)
        } finally {
            material.recoveredDatasetKey.fill(0)
        }
        finishRecoveryRequest(pending)
        enrollmentStore.save(baseEnrollment)
        val login = runCatching {
            login(baseEnrollment, newPassword).also(enrollmentStore::save)
        }
        return AccountRecoveryResult(
            enrollment = login.getOrDefault(baseEnrollment),
            recoveryCode = material.recoveryCode,
            loginError = login.exceptionOrNull()?.message,
        )
    }

    /** Replays a journaled recovery after process death or an ambiguous HTTP response. */
    fun resumePendingRecovery(
        repository: LocalRepository,
        localDataKeyManager: LocalDataKeyManager,
        enrollmentStore: SyncEnrollmentStore,
        pendingRecoveryStore: PendingAccountRecoveryStore,
    ): AccountRecoveryResult? {
        val pending = pendingRecoveryStore.load() ?: return null
        try {
            adoptPendingLocally(repository, localDataKeyManager, pending)
            finishRecoveryRequest(pending)
            enrollmentStore.save(pending.enrollment)
            return AccountRecoveryResult(
                enrollment = pending.enrollment,
                recoveryCode = pending.recoveryCode,
                loginError = "Sign in with the replacement password to start encrypted sync",
            )
        } finally {
            pending.recoveredDatasetKey.fill(0)
        }
    }

    private fun adoptPendingLocally(
        repository: LocalRepository,
        localDataKeyManager: LocalDataKeyManager,
        pending: PendingAccountRecovery,
    ) {
        if (repository.datasetId() != pending.enrollment.datasetId) {
            repository.adoptRecoveredDataset(
                pending.recoveredDatasetKey,
                pending.enrollment.datasetId,
            )
        }
        localDataKeyManager.replaceDataKey(pending.recoveredDatasetKey)
    }

    private fun finishRecoveryRequest(pending: PendingAccountRecovery) {
        val finished = post(RECOVERY_FINISH_PATH, JSONObject(pending.finishRequestJson))
        check(finished.getString("device_id") == pending.enrollment.deviceId) {
            "The account service returned a different device"
        }
        check(finished.getString("dataset_id") == pending.enrollment.datasetId) {
            "The account service returned a different encrypted dataset"
        }
    }

    private fun post(path: String, body: JSONObject): JSONObject {
        val connection = URL("$API_ORIGIN$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json")
            val request = body.toString().toByteArray(Charsets.UTF_8)
            require(request.size <= MAX_BODY_BYTES) { "The account request is too large" }
            connection.outputStream.use { it.write(request) }
            val status = connection.responseCode
            val response = readBounded(
                if (status in 200..299) connection.inputStream else connection.errorStream,
            )
            if (status !in 200..299) {
                val reason = runCatching { JSONObject(response).getString("error") }.getOrNull()
                error("Account service rejected the request (HTTP $status${reason?.let { ": $it" } ?: ""})")
            }
            return JSONObject(response)
        } finally {
            connection.disconnect()
        }
    }

    private fun readBounded(stream: InputStream?): String {
        if (stream == null) return ""
        return stream.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(8 * 1024)
            var total = 0
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                require(total <= MAX_BODY_BYTES) { "The account response is too large" }
                output.write(buffer, 0, read)
            }
            output.toString(Charsets.UTF_8.name())
        }
    }

    private fun opaque(bytes: ByteArray): JSONObject = JSONObject().put("message", encode(bytes))

    private fun decodeOpaque(container: JSONObject, name: String): ByteArray =
        decode(container.getJSONObject(name).getString("message"))

    private fun encode(bytes: ByteArray): String =
        Base64.encodeToString(bytes, BASE64_FLAGS)

    private fun decode(value: String): ByteArray = Base64.decode(value, BASE64_FLAGS)

    private fun validatePassword(password: String) {
        require(password.length in 12..1024) { "Use a password between 12 and 1024 characters" }
    }

    private inline fun <T> withPasswordBytes(password: String, operation: (ByteArray) -> T): T {
        val bytes = password.toByteArray(Charsets.UTF_8)
        return try {
            operation(bytes)
        } finally {
            bytes.fill(0)
        }
    }

    companion object {
        private const val API_ORIGIN = "https://verelle.app"
        private const val REGISTRATION_START_PATH = "/api/v1/accounts/opaque/start"
        private const val REGISTRATION_FINISH_PATH = "/api/v1/accounts/opaque/finish"
        private const val LOGIN_START_PATH = "/api/v1/sessions/opaque/start"
        private const val LOGIN_FINISH_PATH = "/api/v1/sessions/opaque/finish"
        private const val RECOVERY_START_PATH = "/api/v1/recoveries/opaque/start"
        private const val RECOVERY_FINISH_PATH = "/api/v1/recoveries/opaque/finish"
        private const val HEALTH_DATA_CONSENT_VERSION = "2026-07-19"
        private const val BASE64_FLAGS = Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        private const val MAX_BODY_BYTES = 32 * 1024
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 60_000
    }
}
