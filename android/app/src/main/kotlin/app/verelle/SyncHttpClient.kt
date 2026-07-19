package app.verelle

import app.verelle.ffi.FfiPullPage
import app.verelle.ffi.FfiSequencedTransportOperation
import app.verelle.ffi.FfiTransportOperation
import app.verelle.ffi.LocalRepository
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class SyncHttpException(message: String, val retryable: Boolean) : Exception(message)

data class SyncResult(val pushed: Int, val pulled: Int)

class SyncHttpClient {
    fun sync(repository: LocalRepository, enrollment: SyncEnrollment): SyncResult {
        val initialBatch = repository.syncBatch(MAX_OPERATIONS.toUInt())
        check(initialBatch.datasetId == enrollment.datasetId) {
            "The enrolled dataset does not match the local encrypted store"
        }

        var pulled = pullUntilCaughtUp(repository, enrollment, initialBatch.afterCursor)
        var pushed = 0
        repeat(MAX_PUSH_BATCHES) {
            val pending = repository.syncBatch(MAX_OPERATIONS.toUInt())
            if (pending.operations.isEmpty()) {
                return SyncResult(pushed = pushed, pulled = pulled)
            }
            val accepted = push(enrollment, pending.operations)
            val queuedIds = pending.operations.map { it.operationId }.toSet()
            check(
                accepted.isNotEmpty() &&
                    accepted.toSet().size == accepted.size &&
                    accepted.toSet() == queuedIds,
            ) {
                "The sync acknowledgement is invalid"
            }
            repository.acknowledgePushed(accepted)
            pushed += accepted.size
            pulled += pullUntilCaughtUp(
                repository,
                enrollment,
                repository.syncBatch(MAX_OPERATIONS.toUInt()).afterCursor,
            )
        }
        if (repository.syncBatch(1u).operations.isEmpty()) {
            return SyncResult(pushed = pushed, pulled = pulled)
        }
        throw SyncHttpException("The sync request exceeded the push batch limit", retryable = true)
    }

    private fun pullUntilCaughtUp(
        repository: LocalRepository,
        enrollment: SyncEnrollment,
        initialCursor: ULong,
    ): Int {
        var cursor = initialCursor
        var pulled = 0
        repeat(MAX_PULL_PAGES) {
            val page = pull(enrollment, cursor)
            repository.applyPullPage(page)
            pulled += page.operations.size
            cursor = page.nextCursor
            if (!page.more) return pulled
        }
        throw SyncHttpException("The sync response exceeded the page limit", retryable = true)
    }

    private fun push(
        enrollment: SyncEnrollment,
        operations: List<FfiTransportOperation>,
    ): List<String> {
        val body = JSONObject().put(
            "operations",
            JSONArray().apply {
                operations.forEach { operation ->
                    put(
                        JSONObject()
                            .put("operation_id", operation.operationId)
                            .put("key_epoch", operation.keyEpoch.toLong())
                            .put("envelope", operation.envelopeBase64url),
                    )
                }
            },
        )
        val response = request(
            method = "POST",
            path = operationsPath(enrollment.datasetId),
            bearerToken = enrollment.bearerToken,
            body = body.toString(),
        )
        val accepted = JSONObject(response).getJSONArray("accepted")
        return buildList(accepted.length()) {
            for (index in 0 until accepted.length()) {
                add(accepted.getJSONObject(index).getString("operation_id"))
            }
        }
    }

    private fun pull(enrollment: SyncEnrollment, afterCursor: ULong): FfiPullPage {
        val response = request(
            method = "GET",
            path = "${operationsPath(enrollment.datasetId)}?after=$afterCursor&limit=$MAX_OPERATIONS",
            bearerToken = enrollment.bearerToken,
            body = null,
        )
        val value = JSONObject(response)
        val operations = value.getJSONArray("operations")
        return FfiPullPage(
            afterCursor = unsigned(value, "after_cursor"),
            nextCursor = unsigned(value, "next_cursor"),
            operations = buildList(operations.length()) {
                for (index in 0 until operations.length()) {
                    val sequenced = operations.getJSONObject(index)
                    val operation = sequenced.getJSONObject("operation")
                    add(
                        FfiSequencedTransportOperation(
                            serverSequence = unsigned(sequenced, "server_sequence"),
                            operation = FfiTransportOperation(
                                operationId = operation.getString("operation_id"),
                                keyEpoch = unsigned(operation, "key_epoch"),
                                envelopeBase64url = operation.getString("envelope"),
                            ),
                        ),
                    )
                }
            },
            more = value.getBoolean("more"),
        )
    }

    private fun request(
        method: String,
        path: String,
        bearerToken: String,
        body: String?,
    ): String {
        val connection = URL("$API_ORIGIN$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Authorization", "Bearer $bearerToken")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                val bytes = body.toByteArray(Charsets.UTF_8)
                check(bytes.size <= MAX_REQUEST_BYTES) { "The sync request is too large" }
                connection.outputStream.use { it.write(bytes) }
            }

            val status = connection.responseCode
            val response = readBounded(
                if (status in 200..299) connection.inputStream else connection.errorStream,
            )
            if (status !in 200..299) {
                throw SyncHttpException(
                    message = "The sync service returned HTTP $status",
                    retryable = status == 408 || status == 425 || status == 429 || status >= 500,
                )
            }
            return response
        } catch (error: SyncHttpException) {
            throw error
        } catch (error: Exception) {
            throw SyncHttpException(error.message ?: "The sync request failed", retryable = true)
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
                if (total > MAX_RESPONSE_BYTES) {
                    throw SyncHttpException("The sync response is too large", retryable = false)
                }
                output.write(buffer, 0, read)
            }
            output.toString(Charsets.UTF_8.name())
        }
    }

    private fun unsigned(value: JSONObject, name: String): ULong {
        val number = value.getLong(name)
        require(number >= 0) { "$name is negative" }
        return number.toULong()
    }

    private fun operationsPath(datasetId: String): String =
        "/api/v1/datasets/$datasetId/operations"

    companion object {
        private const val API_ORIGIN = "https://verelle.app"
        private const val MAX_OPERATIONS = 100
        private const val MAX_PULL_PAGES = 100
        private const val MAX_PUSH_BATCHES = 100
        private const val MAX_REQUEST_BYTES = 1_500_000
        private const val MAX_RESPONSE_BYTES = 1_500_000
        private const val CONNECT_TIMEOUT_MS = 5_000
        private const val READ_TIMEOUT_MS = 15_000
    }
}
