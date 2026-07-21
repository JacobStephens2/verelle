package app.verelle

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.verelle.ffi.FfiEditableMarker
import app.verelle.ffi.LocalRepository
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import java.time.LocalDate
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class PendingRedaction(
    val datasetId: String,
    val date: String,
    val marker: FfiEditableMarker,
    val operationIds: List<String>,
)

/** Keystore-protected queue for retrying server ciphertext redaction. */
class PendingRedactionStore(
    context: Context,
    private val alias: String = "verelle-pending-redaction-wrap-v1",
    preferencesName: String = "verelle-pending-redaction-v1",
) {
    private val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    @Synchronized
    fun load(): PendingRedaction? {
        val ciphertext = preferences.getString(CIPHERTEXT, null)
        val iv = preferences.getString(IV, null)
        if (ciphertext == null && iv == null) return null
        check(ciphertext != null && iv != null) { "The redaction queue is incomplete" }
        check(keyStore.containsAlias(alias)) { "The redaction queue key is unavailable" }
        val bytes = Cipher.getInstance(TRANSFORMATION).run {
            init(
                Cipher.DECRYPT_MODE,
                keyStore.getKey(alias, null) as SecretKey,
                GCMParameterSpec(GCM_TAG_LENGTH_BITS, Base64.decode(iv, Base64.NO_WRAP)),
            )
            doFinal(Base64.decode(ciphertext, Base64.NO_WRAP))
        }
        return try {
            val value = JSONObject(String(bytes, Charsets.UTF_8))
            PendingRedaction(
                datasetId = value.getString("dataset_id"),
                date = value.getString("date"),
                marker = FfiEditableMarker.valueOf(value.getString("marker")),
                operationIds = value.getJSONArray("operation_ids").strings(),
            ).also(::validate)
        } finally {
            bytes.fill(0)
        }
    }

    @Synchronized
    fun save(pending: PendingRedaction) {
        validate(pending)
        check(load() == null) { "Finish the pending deletion before deleting another entry" }
        val bytes = JSONObject()
            .put("dataset_id", pending.datasetId)
            .put("date", pending.date)
            .put("marker", pending.marker.name)
            .put("operation_ids", JSONArray(pending.operationIds))
            .toString()
            .toByteArray(Charsets.UTF_8)
        try {
            val cipher = Cipher.getInstance(TRANSFORMATION).apply {
                init(Cipher.ENCRYPT_MODE, getOrCreateWrappingKey())
            }
            check(
                preferences.edit()
                    .putString(CIPHERTEXT, Base64.encodeToString(cipher.doFinal(bytes), Base64.NO_WRAP))
                    .putString(IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                    .commit(),
            ) { "The redaction queue could not be saved" }
        } finally {
            bytes.fill(0)
        }
    }

    @Synchronized
    fun clear() {
        check(preferences.edit().remove(CIPHERTEXT).remove(IV).commit()) {
            "The redaction queue could not be cleared"
        }
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
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

    private fun validate(pending: PendingRedaction) {
        require(UUID.fromString(pending.datasetId).toString() == pending.datasetId)
        require(LocalDate.parse(pending.date).toString() == pending.date)
        require(pending.operationIds.isNotEmpty() && pending.operationIds.size <= 100)
        pending.operationIds.forEach { require(UUID.fromString(it).toString() == it) }
    }

    private fun JSONArray.strings(): List<String> =
        (0 until length()).map(::getString)

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val CIPHERTEXT = "ciphertext"
        private const val IV = "iv"
    }
}

class RedactionClient {
    fun resume(
        repository: LocalRepository,
        enrollment: SyncEnrollment,
        store: PendingRedactionStore,
    ): Boolean {
        val pending = store.load() ?: return false
        require(enrollment.datasetId == pending.datasetId) {
            "The pending deletion belongs to a different encrypted dataset"
        }
        require(enrollment.bearerToken.isNotBlank()) { "Sign in to finish server deletion" }
        // Push the winning tombstone and every older local operation first, so
        // none of the identifiers can be uploaded after their redaction.
        SyncHttpClient().sync(repository, enrollment)
        post(pending, enrollment.bearerToken)
        repository.purgeMarkerHistory(
            pending.date,
            pending.marker,
            pending.operationIds,
        )
        store.clear()
        return true
    }

    private fun post(pending: PendingRedaction, bearerToken: String) {
        val path = "/api/v1/datasets/${pending.datasetId}/operation-redactions"
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
            val body = JSONObject()
                .put("operation_ids", JSONArray(pending.operationIds))
                .toString()
                .toByteArray(Charsets.UTF_8)
            connection.outputStream.use { it.write(body) }
            val status = connection.responseCode
            val response = readBounded(
                if (status in 200..299) connection.inputStream else connection.errorStream,
            )
            if (status !in 200..299) {
                val reason = runCatching { JSONObject(response).getString("error") }.getOrNull()
                error("Deletion service rejected the request (HTTP $status${reason?.let { ": $it" } ?: ""})")
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun readBounded(stream: InputStream?): String {
        if (stream == null) return ""
        return stream.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(4096)
            var total = 0
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                require(total <= MAX_BODY_BYTES) { "The deletion response is too large" }
                output.write(buffer, 0, read)
            }
            output.toString(Charsets.UTF_8.name())
        }
    }

    companion object {
        private const val API_ORIGIN = "https://verelle.app"
        private const val MAX_BODY_BYTES = 32 * 1024
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 60_000
    }
}
