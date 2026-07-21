package app.verelle

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.verelle.ffi.FfiEpochKeyMaterial
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Durable, replayable journal written before an invite is redeemed remotely. */
data class PendingCoupleAcceptance(
    val redeemRequestJson: String,
    val enrollment: SyncEnrollment,
    val targetDatasetId: String,
    val keyEpoch: ULong,
    val recoveredDatasetKey: ByteArray,
    val recoveredKeyring: List<FfiEpochKeyMaterial>,
)

class PendingCoupleAcceptanceStore(
    context: Context,
    private val alias: String = "verelle-pending-couple-wrap-v1",
    preferencesName: String = "verelle-pending-couple-v1",
) {
    private val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    @Synchronized
    fun load(): PendingCoupleAcceptance? {
        val ciphertext = preferences.getString(CIPHERTEXT, null)
        val iv = preferences.getString(IV, null)
        if (ciphertext == null && iv == null) return null
        check(ciphertext != null && iv != null) { "The pending couple journal is incomplete" }
        check(keyStore.containsAlias(alias)) { "The pending couple journal key is unavailable" }
        val plaintext = decrypt(ciphertext, iv)
        return try {
            decode(String(plaintext, Charsets.UTF_8))
        } finally {
            plaintext.fill(0)
        }
    }

    @Synchronized
    fun save(pending: PendingCoupleAcceptance) {
        validate(pending)
        val plaintext = JSONObject()
            .put("redeem_request_json", pending.redeemRequestJson)
            .put("target_dataset_id", pending.targetDatasetId)
            .put("key_epoch", pending.keyEpoch.toString())
            .put("recovered_dataset_key", encode(pending.recoveredDatasetKey))
            .put("recovered_keyring", JSONArray().also { array ->
                pending.recoveredKeyring.forEach { item ->
                    array.put(JSONObject().put("key_epoch", item.keyEpoch.toString()).put("key_material", encode(item.keyMaterial)))
                }
            })
            .put("enrollment", encodeEnrollment(pending.enrollment))
            .toString()
            .toByteArray(Charsets.UTF_8)
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION).apply {
                init(Cipher.ENCRYPT_MODE, getOrCreateWrappingKey())
            }
            check(
                preferences.edit()
                    .putString(CIPHERTEXT, Base64.encodeToString(cipher.doFinal(plaintext), Base64.NO_WRAP))
                    .putString(IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                    .commit(),
            ) { "The pending couple journal could not be persisted" }
        } finally {
            plaintext.fill(0)
        }
    }

    @Synchronized
    fun clear() {
        check(preferences.edit().remove(CIPHERTEXT).remove(IV).commit()) {
            "The pending couple journal could not be removed"
        }
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
    }

    private fun decrypt(ciphertext: String, iv: String): ByteArray {
        val key = keyStore.getKey(alias, null) as? SecretKey
            ?: error("The pending couple journal key is unavailable")
        return Cipher.getInstance(TRANSFORMATION).run {
            init(
                Cipher.DECRYPT_MODE,
                key,
                GCMParameterSpec(GCM_TAG_LENGTH_BITS, Base64.decode(iv, Base64.NO_WRAP)),
            )
            doFinal(Base64.decode(ciphertext, Base64.NO_WRAP))
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

    private fun decode(json: String): PendingCoupleAcceptance {
        val value = JSONObject(json)
        val enrollment = value.getJSONObject("enrollment").let {
            SyncEnrollment(
                datasetId = it.getString("dataset_id"),
                bearerToken = it.getString("bearer_token"),
                expiresAtUnixSeconds = it.getLong("expires_at_unix_seconds"),
                email = it.getString("email"),
                deviceId = it.getString("device_id"),
                serverPublicKey = it.getString("server_public_key"),
            )
        }
        return PendingCoupleAcceptance(
            redeemRequestJson = value.getString("redeem_request_json"),
            enrollment = enrollment,
            targetDatasetId = value.getString("target_dataset_id"),
            keyEpoch = value.getString("key_epoch").toULong(),
            recoveredDatasetKey = decodeBytes(value.getString("recovered_dataset_key")),
            recoveredKeyring = value.getJSONArray("recovered_keyring").let { array ->
                (0 until array.length()).map { index ->
                    array.getJSONObject(index).let { item ->
                        FfiEpochKeyMaterial(item.getString("key_epoch").toULong(), decodeBytes(item.getString("key_material")))
                    }
                }
            },
        ).also(::validate)
    }

    private fun validate(pending: PendingCoupleAcceptance) {
        require(pending.recoveredDatasetKey.size == 32) { "The invited dataset key is invalid" }
        require(pending.keyEpoch > 0uL) { "The invited key epoch is unsupported" }
        require(pending.recoveredKeyring.any {
            it.keyEpoch == pending.keyEpoch && it.keyMaterial.contentEquals(pending.recoveredDatasetKey)
        }) { "The invited current key is missing from the historical keyring" }
        require(pending.enrollment.bearerToken.isNotBlank()) { "Sign in before accepting an invite" }
        require(UUID.fromString(pending.targetDatasetId).toString() == pending.targetDatasetId) {
            "The invited dataset identifier is invalid"
        }
        require(JSONObject(pending.redeemRequestJson).getString("invite_id").isNotBlank()) {
            "The pending invite request is invalid"
        }
    }

    private fun encodeEnrollment(enrollment: SyncEnrollment): JSONObject = JSONObject()
        .put("dataset_id", enrollment.datasetId)
        .put("bearer_token", enrollment.bearerToken)
        .put("expires_at_unix_seconds", enrollment.expiresAtUnixSeconds)
        .put("email", enrollment.email)
        .put("device_id", enrollment.deviceId)
        .put("server_public_key", enrollment.serverPublicKey)

    private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, BASE64_FLAGS)

    private fun decodeBytes(value: String): ByteArray = Base64.decode(value, BASE64_FLAGS)

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val BASE64_FLAGS = Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
        private const val CIPHERTEXT = "ciphertext"
        private const val IV = "iv"
    }
}
