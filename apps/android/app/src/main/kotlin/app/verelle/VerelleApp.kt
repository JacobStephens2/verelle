package app.verelle

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import app.verelle.core.ChartCycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private enum class Destination { Chart, Record, Reminder }

@Composable
fun VerelleApp(
    repository: LocalChartRepository,
    reminderScheduler: ReminderScheduler,
    requestNotificationPermission: (onResult: (Boolean) -> Unit) -> Unit,
    shareExport: (title: String, contents: String, mimeType: String) -> Unit,
) {
    var destination by remember { mutableStateOf(Destination.Chart) }
    var charts by remember { mutableStateOf<List<ChartCycle>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var pendingDelete by remember { mutableStateOf<Pair<String, String>?>(null) }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        charts = withContext(Dispatchers.IO) { repository.charts() }
    }

    fun mutate(successMessage: String, action: () -> Unit) {
        if (busy) return
        scope.launch {
            busy = true
            runCatching {
                withContext(Dispatchers.IO) { action() }
                reload()
            }.onSuccess {
                snackbar.showSnackbar(successMessage)
            }.onFailure { error ->
                snackbar.showSnackbar(error.message ?: "Could not save the observation")
            }
            busy = false
        }
    }

    fun export(title: String, mimeType: String, action: () -> String) {
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { action() } }
                .onSuccess { shareExport(title, it, mimeType) }
                .onFailure { error ->
                    snackbar.showSnackbar(error.message ?: "Could not export the chart")
                }
        }
    }

    LaunchedEffect(repository) {
        runCatching { reload() }.onFailure { error ->
            snackbar.showSnackbar(error.message ?: "Could not open the local chart")
            charts = emptyList()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = destination == Destination.Chart,
                    onClick = { destination = Destination.Chart },
                    icon = { Text("▦") },
                    label = { Text("Chart") },
                )
                NavigationBarItem(
                    selected = destination == Destination.Record,
                    onClick = { destination = Destination.Record },
                    icon = { Text("+") },
                    label = { Text("Record") },
                )
                NavigationBarItem(
                    selected = destination == Destination.Reminder,
                    onClick = { destination = Destination.Reminder },
                    icon = { Text("◷") },
                    label = { Text("Reminder") },
                )
            }
        },
    ) { padding ->
        val currentCharts = charts
        if (currentCharts == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else if (destination == Destination.Chart) {
            ChartScreen(
                charts = currentCharts,
                modifier = Modifier.padding(padding),
                onExportJson = {
                    export("Verelle JSON export", "application/json", repository::exportJson)
                },
                onExportCsv = {
                    export("Verelle CSV export", "text/csv", repository::exportCsv)
                },
                onDeleteMarker = { date, marker -> pendingDelete = date to marker },
            )
        } else if (destination == Destination.Record) {
            RecordScreen(
                charts = currentCharts,
                busy = busy,
                modifier = Modifier.padding(padding),
                onStartCycle = { date, number ->
                    mutate("Cycle started") { repository.startCycle(date, number) }
                },
                onRecordMonitor = { date, reading ->
                    mutate("Monitor reading saved") { repository.recordMonitor(date, reading) }
                },
                onRecordBleeding = { date, intensity ->
                    mutate("Bleeding saved") { repository.recordBleeding(date, intensity) }
                },
                onMarkPeak = { date ->
                    mutate("Peak day marked") { repository.markPeak(date) }
                },
                onRecordNote = { date, note ->
                    mutate("Note saved") { repository.recordNote(date, note) }
                },
            )
        } else {
            ReminderScreen(
                initialSettings = reminderScheduler.settings(),
                modifier = Modifier.padding(padding),
                onSave = { enabled, hour, minute ->
                    val save = {
                        mutate(if (enabled) "Reminder saved" else "Reminder turned off") {
                            reminderScheduler.update(enabled, hour, minute)
                        }
                    }
                    if (enabled) {
                        requestNotificationPermission { granted ->
                            if (granted) {
                                save()
                            } else {
                                scope.launch {
                                    snackbar.showSnackbar(
                                        "Notifications are disabled; reminder was not enabled",
                                    )
                                }
                            }
                        }
                    } else {
                        save()
                    }
                },
            )
        }
    }

    pendingDelete?.let { (date, marker) ->
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text("Delete observation?") },
            text = { Text("This removes the $marker entry recorded for $date from this local chart.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingDelete = null
                        mutate("Observation deleted") { repository.deleteMarker(date, marker) }
                    },
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text("Cancel") }
            },
        )
    }
}
