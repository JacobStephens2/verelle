package app.verelle

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/** Non-exportable P-256 device identity used in addition to the OPAQUE password proof. */
class DeviceSigningKey(
    private val alias: String = "verelle-device-signing-v1",
) {
    private val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    @Synchronized
    fun publicKeySpki(): ByteArray = getOrCreate().certificate.publicKey.encoded

    @Synchronized
    fun sign(message: ByteArray): ByteArray {
        val entry = getOrCreate()
        return Signature.getInstance(SIGNATURE_ALGORITHM).run {
            initSign(entry.privateKey)
            update(message)
            sign()
        }
    }

    private fun getOrCreate(): KeyStore.PrivateKeyEntry {
        (keyStore.getEntry(alias, null) as? KeyStore.PrivateKeyEntry)?.let { return it }
        val specification = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .build()
        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEY_STORE).run {
            initialize(specification)
            generateKeyPair()
        }
        return keyStore.getEntry(alias, null) as? KeyStore.PrivateKeyEntry
            ?: error("The device signing key could not be created")
    }

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val SIGNATURE_ALGORITHM = "SHA256withECDSA"
    }
}
