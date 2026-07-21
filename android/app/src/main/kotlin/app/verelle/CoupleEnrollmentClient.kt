package app.verelle

import android.util.Base64
import app.verelle.ffi.LocalRepository
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

data class CoupleInviteResult(val inviteCode: String, val expiresAtUnixSeconds: Long)

/** Authenticated transport for the client-encrypted couple-invite protocol. */
class CoupleEnrollmentClient {
    fun create(repository: LocalRepository, enrollment: SyncEnrollment): CoupleInviteResult {
        requireActiveSession(enrollment)
        val invite = repository.createCoupleInvite()
        check(invite.datasetId == enrollment.datasetId) { "The invite dataset is not enrolled" }
        val response = post(
            COUPLE_INVITES_PATH,
            enrollment.bearerToken,
            JSONObject()
                .put("invite_id", invite.inviteId)
                .put("dataset_id", invite.datasetId)
                .put("verifier", opaque(invite.verifierBase64url)),
        )
        check(response.getString("invite_id") == invite.inviteId)
        check(response.getString("dataset_id") == invite.datasetId)
        return CoupleInviteResult(invite.inviteCode, response.getLong("expires_at_unix_seconds"))
    }

    fun accept(
        repository: LocalRepository,
        keyManager: LocalDataKeyManager,
        enrollmentStore: SyncEnrollmentStore,
        pendingStore: PendingCoupleAcceptanceStore,
        enrollment: SyncEnrollment,
        inviteCode: String,
    ): SyncEnrollment {
        requireActiveSession(enrollment)
        require(repository.isPristine()) {
            "An invite can only replace an empty chart; export or remove local entries first"
        }
        check(pendingStore.load() == null) { "A previous invite acceptance must finish first" }
        val material = repository.prepareCoupleInviteAcceptance(inviteCode.trim())
        val request = JSONObject()
            .put("invite_id", material.inviteId)
            .put("verifier", opaque(material.verifierBase64url))
            .put("wrapped_dataset_key", opaque(encode(material.wrappedDatasetKey)))
        val pending = PendingCoupleAcceptance(
            redeemRequestJson = request.toString(),
            enrollment = enrollment,
            targetDatasetId = material.datasetId,
            keyEpoch = material.keyEpoch,
            recoveredDatasetKey = material.recoveredDatasetKey,
        )
        try {
            pendingStore.save(pending)
            return finish(repository, keyManager, enrollmentStore, pendingStore, pending)
        } finally {
            material.recoveredDatasetKey.fill(0)
        }
    }

    fun resume(
        repository: LocalRepository,
        keyManager: LocalDataKeyManager,
        enrollmentStore: SyncEnrollmentStore,
        pendingStore: PendingCoupleAcceptanceStore,
    ): SyncEnrollment? {
        val pending = pendingStore.load() ?: return null
        return try {
            finish(repository, keyManager, enrollmentStore, pendingStore, pending)
        } finally {
            pending.recoveredDatasetKey.fill(0)
        }
    }

    private fun finish(
        repository: LocalRepository,
        keyManager: LocalDataKeyManager,
        enrollmentStore: SyncEnrollmentStore,
        pendingStore: PendingCoupleAcceptanceStore,
        pending: PendingCoupleAcceptance,
    ): SyncEnrollment {
        val response = post(
            COUPLE_INVITE_REDEEM_PATH,
            pending.enrollment.bearerToken,
            JSONObject(pending.redeemRequestJson),
        )
        check(response.getString("dataset_id") == pending.targetDatasetId) {
            "The account service returned a different shared dataset"
        }
        check(response.getLong("key_epoch").toULong() == pending.keyEpoch) {
            "The account service returned a different key epoch"
        }
        if (repository.datasetId() != pending.targetDatasetId) {
            repository.adoptRecoveredDataset(
                pending.recoveredDatasetKey,
                pending.targetDatasetId,
            )
        }
        keyManager.replaceDataKey(pending.recoveredDatasetKey)
        val updated = pending.enrollment.copy(datasetId = pending.targetDatasetId)
        enrollmentStore.save(updated)
        pendingStore.clear()
        return updated
    }

    private fun post(path: String, bearerToken: String, body: JSONObject): JSONObject {
        val connection = URL("$API_ORIGIN$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $bearerToken")
            val request = body.toString().toByteArray(Charsets.UTF_8)
            require(request.size <= MAX_BODY_BYTES) { "The invite request is too large" }
            connection.outputStream.use { it.write(request) }
            val status = connection.responseCode
            val response = readBounded(
                if (status in 200..299) connection.inputStream else connection.errorStream,
            )
            if (status !in 200..299) {
                val reason = runCatching { JSONObject(response).getString("error") }.getOrNull()
                error("Invite service rejected the request (HTTP $status${reason?.let { ": $it" } ?: ""})")
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
                require(total <= MAX_BODY_BYTES) { "The invite response is too large" }
                output.write(buffer, 0, read)
            }
            output.toString(Charsets.UTF_8.name())
        }
    }

    private fun opaque(encoded: String): JSONObject = JSONObject().put("message", encoded)

    private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, BASE64_FLAGS)

    private fun requireActiveSession(enrollment: SyncEnrollment) {
        require(enrollment.bearerToken.isNotBlank()) { "Sign in before managing a couple" }
    }

    companion object {
        private const val API_ORIGIN = "https://verelle.app"
        private const val COUPLE_INVITES_PATH = "/api/v1/couple-invites"
        private const val COUPLE_INVITE_REDEEM_PATH = "/api/v1/couple-invites/redeem"
        private const val BASE64_FLAGS = Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        private const val MAX_BODY_BYTES = 32 * 1024
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 60_000
    }
}
