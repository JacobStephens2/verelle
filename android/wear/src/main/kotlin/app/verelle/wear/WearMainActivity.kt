package app.verelle.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

class WearMainActivity : ComponentActivity(), MessageClient.OnMessageReceivedListener {
    private var response by mutableStateOf("Paired phone required")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { WearHome(response, ::sendReading, ::requestRecent) }
    }

    override fun onStart() {
        super.onStart()
        Wearable.getMessageClient(this).addListener(this)
        requestRecent()
    }

    override fun onStop() {
        Wearable.getMessageClient(this).removeListener(this)
        super.onStop()
    }

    override fun onMessageReceived(event: MessageEvent) {
        when (event.path) {
            ACK_PATH -> response = "Saved ${String(event.data)}"
            RECENT_RESPONSE_PATH -> response = recentLabel(event.data)
        }
    }

    private fun sendReading(reading: String) {
        response = "Sending $reading…"
        val payload = JSONObject()
            .put("date", LocalDate.now().toString())
            .put("reading", reading)
            .toString()
            .toByteArray()
        send(RECORD_PATH, payload)
    }

    private fun requestRecent() = send(RECENT_REQUEST_PATH, ByteArray(0))

    private fun send(path: String, payload: ByteArray) {
        Wearable.getNodeClient(this).connectedNodes.addOnSuccessListener { nodes ->
            if (nodes.isEmpty()) response = "Open Verelle on the paired Android phone"
            nodes.forEach { node ->
                Wearable.getMessageClient(this).sendMessage(node.id, path, payload)
            }
        }
    }

    private fun recentLabel(bytes: ByteArray): String = runCatching {
        val days = JSONArray(String(bytes))
        if (days.length() == 0) return@runCatching "No chart entries yet"
        val last = days.getJSONObject(days.length() - 1)
        val entries = last.getJSONArray("entries")
        val first = if (entries.length() > 0) entries.getString(0) else "No entries"
        "Day ${last.getLong("cycle_day")} · $first"
    }.getOrDefault("Recent chart unavailable")

    companion object {
        private const val RECORD_PATH = "/verelle/monitor/v1"
        private const val ACK_PATH = "/verelle/monitor-ack/v1"
        private const val RECENT_REQUEST_PATH = "/verelle/recent/request/v1"
        private const val RECENT_RESPONSE_PATH = "/verelle/recent/response/v1"
    }
}

@Composable
private fun WearHome(
    status: String,
    record: (String) -> Unit,
    refresh: () -> Unit,
) {
    MaterialTheme {
        Column(
            modifier = Modifier.fillMaxSize().padding(18.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        ) {
            Text("Verelle")
            Text(status, style = MaterialTheme.typography.caption2)
            listOf("LOW", "HIGH", "PEAK", "MISSED", "ERROR").forEach { reading ->
                Button(onClick = { record(reading) }, modifier = Modifier.fillMaxWidth()) {
                    Text(reading.lowercase().replaceFirstChar(Char::uppercase))
                }
            }
            Button(onClick = refresh) { Text("Refresh") }
        }
    }
}
