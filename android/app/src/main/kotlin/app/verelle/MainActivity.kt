package app.verelle

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.verelle.ffi.FfiChart
import app.verelle.ffi.FfiChartDay
import app.verelle.ffi.FfiMonitorReading
import app.verelle.ffi.LocalRepository
import java.io.File
import java.time.LocalDate

class MainActivity : ComponentActivity() {
    private var localRepository: LocalRepository? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val repository = runCatching { openLocalRepository() }
        localRepository = repository.getOrNull()
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    repository.fold(
                        onSuccess = { RecordAndChartScreen(it) },
                        onFailure = {
                            RepositoryFailure(it.message ?: "Local storage could not be opened")
                        },
                    )
                }
            }
        }
    }

    override fun onDestroy() {
        localRepository?.close()
        localRepository = null
        super.onDestroy()
    }

    private fun openLocalRepository(): LocalRepository {
        val dataKey = LocalDataKeyManager(this).getOrCreateDataKey()
        return try {
            LocalRepository.open(
                databasePath = File(noBackupFilesDir, "verelle.sqlite").absolutePath,
                keyMaterial = dataKey,
                deviceId = LocalDeviceIdentity(this).getOrCreate(),
            )
        } finally {
            dataKey.fill(0)
        }
    }
}

@Composable
private fun RecordAndChartScreen(repository: LocalRepository) {
    var charts by remember(repository) {
        mutableStateOf(repository.charts())
    }
    var pendingCount by remember(repository) {
        mutableStateOf(repository.pendingOutboxCount())
    }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var methodCycleNumber by remember { mutableStateOf("1") }
    var reading by remember { mutableStateOf(FfiMonitorReading.LOW) }
    var message by remember { mutableStateOf<String?>(null) }

    fun reload() {
        charts = repository.charts()
        pendingCount = repository.pendingOutboxCount()
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item {
            Column(modifier = Modifier.padding(20.dp)) {
                Text("Verelle", style = MaterialTheme.typography.headlineMedium)
                Text(
                    "Synthetic testing only — export and recovery are not ready",
                    color = MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.testTag("safety-notice"),
                )
                Spacer(modifier = Modifier.height(12.dp))
                OutlinedTextField(
                    value = date,
                    onValueChange = { date = it },
                    label = { Text("Date (YYYY-MM-DD)") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("record-date"),
                )
                OutlinedTextField(
                    value = methodCycleNumber,
                    onValueChange = { methodCycleNumber = it.filter(Char::isDigit) },
                    label = { Text("Method cycle number") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("method-cycle-number"),
                )
                Button(
                    onClick = {
                        message = runCatching {
                            val cycleNumber = methodCycleNumber.toUIntOrNull()
                                ?: error("Enter a method cycle number")
                            repository.recordCycleStart(date, cycleNumber)
                            reload()
                            "Cycle start saved"
                        }.fold(
                            onSuccess = { it },
                            onFailure = { it.message ?: "Cycle start could not be saved" },
                        )
                    },
                    modifier = Modifier.testTag("save-cycle-start"),
                ) {
                    Text("Start cycle")
                }
                Text("Monitor reading", style = MaterialTheme.typography.titleMedium)
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                ) {
                    FfiMonitorReading.entries.forEach { option ->
                        FilterChip(
                            selected = reading == option,
                            onClick = { reading = option },
                            label = { Text(option.displayName()) },
                            modifier = Modifier.testTag("reading-${option.name.lowercase()}"),
                        )
                    }
                }
                Button(
                    onClick = {
                        message = runCatching {
                            repository.recordMonitorReading(date, reading)
                            reload()
                            "Monitor reading saved"
                        }.fold(
                            onSuccess = { it },
                            onFailure = { it.message ?: "Monitor reading could not be saved" },
                        )
                    },
                    modifier = Modifier.testTag("save-monitor-reading"),
                ) {
                    Text("Save reading")
                }
                message?.let {
                    Text(it, modifier = Modifier.testTag("save-message"))
                }
                Text(
                    "$pendingCount encrypted local operations waiting for future sync",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.testTag("pending-operations"),
                )
            }
            HorizontalDivider()
        }

        val chart = charts.lastOrNull()
        if (chart == null) {
            item {
                Text(
                    "Start a synthetic cycle to create the local chart.",
                    modifier = Modifier
                        .padding(20.dp)
                        .testTag("empty-chart"),
                )
            }
        } else {
            item { ChartHeader(chart) }
            items(chart.days, key = { it.date }) { day ->
                ChartDay(day)
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun ChartHeader(chart: FfiChart) {
    Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp)) {
        Text(
            "Cycle ${chart.methodCycleNumber} · ${chart.startDate}",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.testTag("chart-header"),
        )
        Text(
            "Recorded observations and mechanical annotations only",
            style = MaterialTheme.typography.bodySmall,
        )
    }
}

@Composable
private fun ChartDay(day: FfiChartDay) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp)
            .testTag("chart-day-${day.date}"),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("CD ${day.cycleDay}", fontWeight = FontWeight.SemiBold)
            Text(day.date, style = MaterialTheme.typography.bodySmall)
        }
        Column(modifier = Modifier.weight(2f)) {
            Text(day.entries.map { it.label }.ifEmpty { listOf("No entry") }.joinToString(" · "))
            if (day.annotations.isNotEmpty()) {
                Text(
                    day.annotations.joinToString(" · "),
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun RepositoryFailure(message: String) {
    Column(modifier = Modifier.padding(20.dp)) {
        Text("Local data unavailable", style = MaterialTheme.typography.headlineSmall)
        Text(message)
        Text("Do not record real data. Reinstall this test build to reset it.")
    }
}

private fun FfiMonitorReading.displayName(): String =
    name.lowercase().replaceFirstChar(Char::uppercase)
