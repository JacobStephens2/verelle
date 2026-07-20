package app.verelle

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Keeps a newly issued registration recovery code until explicit acknowledgement. */
class PendingRecoveryCodeStore(
    context: Context,
    private val alias: String = "verelle-pending-recovery-code-wrap-v1",
    preferencesName: String = "verelle-pending-recovery-code-v1",
) {
    private val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    @Synchronized
    fun load(): String? {
        val ciphertext = preferences.getString(CIPHERTEXT, null)
        val iv = preferences.getString(IV, null)
        if (ciphertext == null && iv == null) return null
        check(ciphertext != null && iv != null) { "The pending recovery code is incomplete" }
        check(keyStore.containsAlias(alias)) { "The pending recovery code key is unavailable" }
        val plaintext = Cipher.getInstance(TRANSFORMATION).run {
            init(
                Cipher.DECRYPT_MODE,
                keyStore.getKey(alias, null) as SecretKey,
                GCMParameterSpec(
                    GCM_TAG_LENGTH_BITS,
                    Base64.decode(iv, Base64.NO_WRAP),
                ),
            )
            doFinal(Base64.decode(ciphertext, Base64.NO_WRAP))
        }
        return try {
            String(plaintext, Charsets.UTF_8).also(::validate)
        } finally {
            plaintext.fill(0)
        }
    }

    @Synchronized
    fun save(code: String) {
        validate(code)
        val plaintext = code.toByteArray(Charsets.UTF_8)
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
            ) { "The pending recovery code could not be persisted" }
        } finally {
            plaintext.fill(0)
        }
    }

    @Synchronized
    fun clearAfterAcknowledgement() {
        check(preferences.edit().remove(CIPHERTEXT).remove(IV).commit()) {
            "The pending recovery code could not be removed"
        }
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
    }

    private fun validate(code: String) {
        require(code.length == 43 && code.all { it.isLetterOrDigit() || it == '-' || it == '_' }) {
            "The pending recovery code is invalid"
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

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val CIPHERTEXT = "ciphertext"
        private const val IV = "iv"
    }
}
