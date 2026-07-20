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

private const val ANDROID_KEY_STORE = "AndroidKeyStore"
private const val WRAP_TRANSFORMATION = "AES/GCM/NoPadding"
private const val GCM_TAG_LENGTH_BITS = 128

class LocalDataKeyManager(
    context: Context,
    private val alias: String = "verelle-local-data-wrap-v1",
    preferencesName: String = "verelle-local-key-v1",
) {
    private val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    @Synchronized
    fun getOrCreateDataKey(): ByteArray {
        val encodedCiphertext = preferences.getString(CIPHERTEXT, null)
        val encodedIv = preferences.getString(IV, null)

        if ((encodedCiphertext == null) != (encodedIv == null)) {
            error("The protected local key is incomplete")
        }
        if (encodedCiphertext != null && !keyStore.containsAlias(alias)) {
            error("The device key needed to open local data is unavailable")
        }
        if (encodedCiphertext != null && encodedIv != null) {
            return decrypt(encodedCiphertext, encodedIv)
        }

        val dataKey = ByteArray(32).also(SecureRandom()::nextBytes)
        try {
            persistDataKey(dataKey)
            return dataKey.copyOf()
        } finally {
            dataKey.fill(0)
        }
    }

    /**
     * Atomically replaces the Keystore-wrapped local data key after native
     * recovery has successfully adopted the matching server dataset ID.
     * The caller remains responsible for zeroizing [dataKey].
     */
    @Synchronized
    fun replaceDataKey(dataKey: ByteArray) {
        require(dataKey.size == 32) { "The recovered local data key has an invalid size" }
        persistDataKey(dataKey)
    }

    private fun persistDataKey(dataKey: ByteArray) {
        val cipher = Cipher.getInstance(WRAP_TRANSFORMATION).apply {
            init(Cipher.ENCRYPT_MODE, getOrCreateWrappingKey())
        }
        val ciphertext = cipher.doFinal(dataKey)
        val committed = preferences.edit()
            .putString(CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .putString(IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .commit()
        check(committed) { "The protected local key could not be persisted" }
    }

    private fun decrypt(encodedCiphertext: String, encodedIv: String): ByteArray {
        val wrappingKey = keyStore.getKey(alias, null) as? SecretKey
            ?: error("The device key needed to open local data is unavailable")
        val cipher = Cipher.getInstance(WRAP_TRANSFORMATION).apply {
            init(
                Cipher.DECRYPT_MODE,
                wrappingKey,
                GCMParameterSpec(GCM_TAG_LENGTH_BITS, Base64.decode(encodedIv, Base64.NO_WRAP)),
            )
        }
        return cipher.doFinal(Base64.decode(encodedCiphertext, Base64.NO_WRAP))
            .also { check(it.size == 32) { "The local data key has an invalid size" } }
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

    companion object {
        private const val CIPHERTEXT = "wrapped_key"
        private const val IV = "wrapping_iv"
    }
}

class LocalDeviceIdentity(
    context: Context,
    preferencesName: String = "verelle-local-device-v1",
) {
    private val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)

    @Synchronized
    fun getOrCreate(): String {
        preferences.getString(DEVICE_ID, null)?.let { return it }
        val deviceId = UUID.randomUUID().toString()
        check(preferences.edit().putString(DEVICE_ID, deviceId).commit()) {
            "The local device identity could not be persisted"
        }
        return deviceId
    }

    companion object {
        private const val DEVICE_ID = "device_id"
    }
}
