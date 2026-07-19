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

data class SyncEnrollment(
    val datasetId: String,
    val bearerToken: String,
    val expiresAtUnixSeconds: Long,
    val email: String = "",
    val deviceId: String = "",
    val serverPublicKey: String = "",
)

class SyncEnrollmentStore(
    context: Context,
    private val alias: String = "verelle-sync-enrollment-wrap-v1",
    preferencesName: String = "verelle-sync-enrollment-v1",
) {
    private val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    @Synchronized
    fun load(): SyncEnrollment? {
        val ciphertext = preferences.getString(CIPHERTEXT, null)
        val iv = preferences.getString(IV, null)
        if (ciphertext == null && iv == null) return null
        check(ciphertext != null && iv != null) { "The protected sync enrollment is incomplete" }
        check(keyStore.containsAlias(alias)) { "The sync credential key is unavailable" }

        val plaintext = decrypt(ciphertext, iv)
        return try {
            decode(String(plaintext, Charsets.UTF_8))
        } finally {
            plaintext.fill(0)
        }
    }

    @Synchronized
    fun save(enrollment: SyncEnrollment) {
        validate(enrollment)
        val plaintext = JSONObject()
            .put("dataset_id", enrollment.datasetId)
            .put("bearer_token", enrollment.bearerToken)
            .put("expires_at_unix_seconds", enrollment.expiresAtUnixSeconds)
            .put("email", enrollment.email)
            .put("device_id", enrollment.deviceId)
            .put("server_public_key", enrollment.serverPublicKey)
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
            ) { "The protected sync enrollment could not be persisted" }
        } finally {
            plaintext.fill(0)
        }
    }

    /**
     * Removes the locally provisioned sync credential and its wrapping key.
     *
     * This only forgets the credential on this device. Server-side session
     * revocation remains part of the account lifecycle rather than this local
     * persistence primitive.
     */
    @Synchronized
    fun clear() {
        check(
            preferences.edit()
                .remove(CIPHERTEXT)
                .remove(IV)
                .commit(),
        ) { "The protected sync enrollment could not be removed" }
        if (keyStore.containsAlias(alias)) {
            keyStore.deleteEntry(alias)
        }
    }

    private fun decrypt(encodedCiphertext: String, encodedIv: String): ByteArray {
        val wrappingKey = keyStore.getKey(alias, null) as? SecretKey
            ?: error("The sync credential key is unavailable")
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

    private fun decode(json: String): SyncEnrollment {
        val value = JSONObject(json)
        return SyncEnrollment(
            datasetId = value.getString("dataset_id"),
            bearerToken = value.getString("bearer_token"),
            expiresAtUnixSeconds = value.getLong("expires_at_unix_seconds"),
            email = value.optString("email"),
            deviceId = value.optString("device_id"),
            serverPublicKey = value.optString("server_public_key"),
        ).also(::validate)
    }

    private fun validate(enrollment: SyncEnrollment) {
        val parsedDatasetId = UUID.fromString(enrollment.datasetId)
        require(parsedDatasetId.toString() == enrollment.datasetId) {
            "The dataset ID must be a canonical UUID"
        }
        val pendingFirstLogin = enrollment.bearerToken.isEmpty() && enrollment.expiresAtUnixSeconds == 0L
        val activeSession = enrollment.bearerToken.length in 32..512 && enrollment.expiresAtUnixSeconds > 0L
        require(pendingFirstLogin || activeSession) { "The sync session is invalid" }
        require(enrollment.bearerToken.all { it.isLetterOrDigit() || it == '-' || it == '_' }) {
            "The sync token is invalid"
        }
        if (enrollment.email.isNotEmpty() || enrollment.deviceId.isNotEmpty() || enrollment.serverPublicKey.isNotEmpty()) {
            require(enrollment.email.contains('@')) { "The enrolled account email is invalid" }
            val parsedDeviceId = UUID.fromString(enrollment.deviceId)
            require(parsedDeviceId.toString() == enrollment.deviceId) {
                "The enrolled device ID must be a canonical UUID"
            }
            require(enrollment.serverPublicKey.length in 32..512) { "The server key pin is invalid" }
            require(enrollment.serverPublicKey.all { it.isLetterOrDigit() || it == '-' || it == '_' }) {
                "The server key pin is invalid"
            }
        } else {
            require(!pendingFirstLogin) { "Pending login requires account enrollment metadata" }
        }
    }

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val CIPHERTEXT = "ciphertext"
        private const val IV = "iv"
    }
}
