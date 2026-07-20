package app.verelle

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Crash-recovery journal written before the server recovery transaction.
 *
 * It retains the exact idempotent finish request, the recovered dataset key,
 * and the one-time replacement code under an independent Android Keystore key.
 * It is cleared only after the user acknowledges the replacement code.
 */
data class PendingAccountRecovery(
    val finishRequestJson: String,
    val enrollment: SyncEnrollment,
    val recoveryCode: String,
    val recoveredDatasetKey: ByteArray,
)

class PendingAccountRecoveryStore(
    context: Context,
    private val alias: String = "verelle-pending-recovery-wrap-v1",
    preferencesName: String = "verelle-pending-recovery-v1",
) {
    private val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    @Synchronized
    fun hasPending(): Boolean =
        preferences.contains(CIPHERTEXT) || preferences.contains(IV)

    @Synchronized
    fun load(): PendingAccountRecovery? {
        val ciphertext = preferences.getString(CIPHERTEXT, null)
        val iv = preferences.getString(IV, null)
        if (ciphertext == null && iv == null) return null
        check(ciphertext != null && iv != null) { "The pending recovery journal is incomplete" }
        check(keyStore.containsAlias(alias)) { "The pending recovery journal key is unavailable" }
        val plaintext = decrypt(ciphertext, iv)
        return try {
            decode(String(plaintext, Charsets.UTF_8))
        } finally {
            plaintext.fill(0)
        }
    }

    @Synchronized
    fun save(pending: PendingAccountRecovery) {
        validate(pending)
        val plaintext = JSONObject()
            .put("finish_request_json", pending.finishRequestJson)
            .put("dataset_id", pending.enrollment.datasetId)
            .put("email", pending.enrollment.email)
            .put("device_id", pending.enrollment.deviceId)
            .put("server_public_key", pending.enrollment.serverPublicKey)
            .put("recovery_code", pending.recoveryCode)
            .put(
                "recovered_dataset_key",
                Base64.encodeToString(pending.recoveredDatasetKey, BASE64_FLAGS),
            )
            .toString()
            .toByteArray(Charsets.UTF_8)
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION).apply {
                init(Cipher.ENCRYPT_MODE, getOrCreateWrappingKey())
            }
            val ciphertext = cipher.doFinal(plaintext)
            check(
                preferences.edit()
                    .putString(CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                    .putString(IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                    .commit(),
            ) { "The pending recovery journal could not be persisted" }
        } finally {
            plaintext.fill(0)
        }
    }

    /** Clear only after the replacement recovery code is stored offline. */
    @Synchronized
    fun clearAfterAcknowledgement() {
        check(preferences.edit().remove(CIPHERTEXT).remove(IV).commit()) {
            "The pending recovery journal could not be removed"
        }
        if (keyStore.containsAlias(alias)) {
            keyStore.deleteEntry(alias)
        }
    }

    private fun decrypt(encodedCiphertext: String, encodedIv: String): ByteArray {
        val wrappingKey = keyStore.getKey(alias, null) as? SecretKey
            ?: error("The pending recovery journal key is unavailable")
        return Cipher.getInstance(TRANSFORMATION).run {
            init(
                Cipher.DECRYPT_MODE,
                wrappingKey,
                GCMParameterSpec(
                    GCM_TAG_LENGTH_BITS,
                    Base64.decode(encodedIv, Base64.NO_WRAP),
                ),
            )
            doFinal(Base64.decode(encodedCiphertext, Base64.NO_WRAP))
        }
    }

    private fun getOrCreateWrappingKey(): SecretKey {
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        val specification = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setKeySize(256)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE).run {
            init(specification)
            generateKey()
        }
    }

    private fun decode(json: String): PendingAccountRecovery {
        val value = JSONObject(json)
        val enrollment = SyncEnrollment(
            datasetId = value.getString("dataset_id"),
            bearerToken = "",
            expiresAtUnixSeconds = 0,
            email = value.getString("email"),
            deviceId = value.getString("device_id"),
            serverPublicKey = value.getString("server_public_key"),
        )
        return PendingAccountRecovery(
            finishRequestJson = value.getString("finish_request_json"),
            enrollment = enrollment,
            recoveryCode = value.getString("recovery_code"),
            recoveredDatasetKey = Base64.decode(
                value.getString("recovered_dataset_key"),
                BASE64_FLAGS,
            ),
        ).also(::validate)
    }

    private fun validate(pending: PendingAccountRecovery) {
        require(pending.recoveredDatasetKey.size == 32) {
            "The pending recovered dataset key is invalid"
        }
        require(pending.recoveryCode.length == 43 && pending.recoveryCode.isBase64Url()) {
            "The pending replacement recovery code is invalid"
        }
        require(pending.finishRequestJson.toByteArray(Charsets.UTF_8).size <= MAX_BODY_BYTES) {
            "The pending recovery request is too large"
        }
        val request = JSONObject(pending.finishRequestJson)
        val datasetId = UUID.fromString(pending.enrollment.datasetId)
        val deviceId = UUID.fromString(pending.enrollment.deviceId)
        require(datasetId.toString() == pending.enrollment.datasetId) {
            "The pending recovery dataset is invalid"
        }
        require(deviceId.toString() == pending.enrollment.deviceId) {
            "The pending recovery device is invalid"
        }
        require(request.getString("dataset_id") == pending.enrollment.datasetId) {
            "The pending recovery request has a different dataset"
        }
        require(request.getString("device_id") == pending.enrollment.deviceId) {
            "The pending recovery request has a different device"
        }
        require(pending.enrollment.email.contains('@')) {
            "The pending recovery email is invalid"
        }
        require(
            pending.enrollment.serverPublicKey.length in 32..512 &&
                pending.enrollment.serverPublicKey.isBase64Url(),
        ) { "The pending recovery server key is invalid" }
    }

    private fun String.isBase64Url(): Boolean =
        all { it.isLetterOrDigit() || it == '-' || it == '_' }

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val BASE64_FLAGS = Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        private const val MAX_BODY_BYTES = 32 * 1024
        private const val CIPHERTEXT = "ciphertext"
        private const val IV = "iv"
    }
}
