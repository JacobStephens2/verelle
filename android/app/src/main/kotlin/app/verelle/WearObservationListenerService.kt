package app.verelle

import app.verelle.ffi.FfiMonitorReading
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/** Paired-phone bridge for the Wear OS quick-record shell. */
class WearObservationListenerService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        when (event.path) {
            RECORD_PATH -> record(event)
            RECENT_REQUEST_PATH -> sendRecent(event.sourceNodeId)
        }
    }

    private fun record(event: MessageEvent) {
        val value = runCatching { JSONObject(String(event.data, Charsets.UTF_8)) }.getOrNull()
            ?: return
        val date = runCatching { LocalDate.parse(value.getString("date")) }.getOrNull() ?: return
        val reading = runCatching {
            FfiMonitorReading.valueOf(value.getString("reading"))
        }.getOrNull() ?: return
        runCatching {
            LocalRepositoryProvider(this).open().use { repository ->
                repository.recordMonitorReading(date.toString(), reading)
            }
            VerelleSyncWorker.enqueue(this)
            Wearable.getMessageClient(this).sendMessage(
                event.sourceNodeId,
                RECORD_ACK_PATH,
                date.toString().toByteArray(),
            )
        }
    }

    private fun sendRecent(nodeId: String) {
        runCatching {
            val recent = LocalRepositoryProvider(this).open().use { repository ->
                repository.charts().lastOrNull()?.days?.takeLast(5).orEmpty().map { day ->
                    JSONObject()
                        .put("date", day.date)
                        .put("cycle_day", day.cycleDay.toLong())
                        .put("entries", JSONArray(day.entries.map { it.label }))
                }
            }
            Wearable.getMessageClient(this).sendMessage(
                nodeId,
                RECENT_RESPONSE_PATH,
                JSONArray(recent).toString().toByteArray(Charsets.UTF_8),
            )
        }
    }

    companion object {
        const val RECORD_PATH = "/verelle/monitor/v1"
        const val RECORD_ACK_PATH = "/verelle/monitor-ack/v1"
        const val RECENT_REQUEST_PATH = "/verelle/recent/request/v1"
        const val RECENT_RESPONSE_PATH = "/verelle/recent/response/v1"
    }
}
