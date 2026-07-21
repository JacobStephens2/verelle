package app.verelle

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.SecureRandom
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class LocalDatasetIdentity(
    val datasetId: String,
    val deviceId: String,
    val datasetKey: ByteArray,
)

/** Keeps the local dataset key encrypted at rest by a non-exportable Keystore key. */
class LocalDatasetIdentityStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    @Synchronized
    fun loadOrCreate(existingDatabase: Boolean): LocalDatasetIdentity {
        val datasetId = preferences.getString(DATASET_ID, null)
        val deviceId = preferences.getString(DEVICE_ID, null)
        val ciphertext = preferences.getString(KEY_CIPHERTEXT, null)
        val iv = preferences.getString(KEY_IV, null)
        val values = listOf(datasetId, deviceId, ciphertext, iv)

        if (values.all { it != null }) {
            return LocalDatasetIdentity(
                datasetId = checkNotNull(datasetId),
                deviceId = checkNotNull(deviceId),
                datasetKey = decrypt(checkNotNull(ciphertext), checkNotNull(iv)),
            )
        }
        check(values.all { it == null }) { "Local dataset identity is incomplete" }
        check(!existingDatabase) {
            "Local dataset key is unavailable; refusing to replace it for an existing database"
        }

        val rawKey = ByteArray(DATASET_KEY_BYTES).also(SecureRandom()::nextBytes)
        val encrypted = encrypt(rawKey)
        val newDatasetId = UUID.randomUUID().toString()
        val newDeviceId = UUID.randomUUID().toString()
        val persisted = preferences.edit()
            .putString(DATASET_ID, newDatasetId)
            .putString(DEVICE_ID, newDeviceId)
            .putString(KEY_CIPHERTEXT, encrypted.first)
            .putString(KEY_IV, encrypted.second)
            .commit()
        check(persisted) { "Could not durably save the local dataset identity" }
        return LocalDatasetIdentity(newDatasetId, newDeviceId, rawKey)
    }

    private fun encrypt(rawKey: ByteArray): Pair<String, String> {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateWrappingKey())
        val ciphertext = cipher.doFinal(rawKey)
        return Base64.encodeToString(ciphertext, Base64.NO_WRAP) to
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
    }

    private fun decrypt(ciphertext: String, iv: String): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            getOrCreateWrappingKey(),
            GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
        )
        return cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP)).also { key ->
            check(key.size == DATASET_KEY_BYTES) { "Local dataset key has the wrong length" }
        }
    }

    private fun getOrCreateWrappingKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val existing = keyStore.getEntry(WRAPPING_KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
        if (existing != null) return existing.secretKey

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                WRAPPING_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val PREFERENCES = "verelle_local_dataset_v1"
        const val DATASET_ID = "dataset_id"
        const val DEVICE_ID = "device_id"
        const val KEY_CIPHERTEXT = "dataset_key_ciphertext"
        const val KEY_IV = "dataset_key_iv"
        const val DATASET_KEY_BYTES = 32
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val WRAPPING_KEY_ALIAS = "app.verelle.local_dataset_wrap.v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
