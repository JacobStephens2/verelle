package app.verelle

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.verelle.core.BleedingIntensity
import app.verelle.core.ChartCycle
import app.verelle.core.MonitorReading
import java.time.LocalDate

@Composable
fun RecordScreen(
    charts: List<ChartCycle>,
    busy: Boolean,
    onStartCycle: (date: String, methodCycleNumber: Int) -> Unit,
    onRecordMonitor: (date: String, reading: MonitorReading) -> Unit,
    onRecordBleeding: (date: String, intensity: BleedingIntensity) -> Unit,
    onMarkPeak: (date: String) -> Unit,
    onRecordNote: (date: String, note: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    var methodCycleNumber by remember { mutableStateOf("1") }
    var monitorReading by remember { mutableStateOf(MonitorReading.Low) }
    var bleedingIntensity by remember { mutableStateOf(BleedingIntensity.Moderate) }
    var note by remember { mutableStateOf("") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Record", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.SemiBold)
        Text(
            "Verelle records and displays your entries. It does not interpret fertility status.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedTextField(
            value = date,
            onValueChange = { date = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Date (YYYY-MM-DD)") },
            singleLine = true,
        )

        if (charts.isEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Mark cycle day 1", style = MaterialTheme.typography.titleLarge)
                    OutlinedTextField(
                        value = methodCycleNumber,
                        onValueChange = { methodCycleNumber = it.filter(Char::isDigit) },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Method cycle number") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                    )
                    Button(
                        onClick = {
                            methodCycleNumber.toIntOrNull()?.let { onStartCycle(date, it) }
                        },
                        enabled = !busy && (methodCycleNumber.toIntOrNull() ?: 0) > 0,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Start cycle")
                    }
                }
            }
        } else {
            ObservationCard(title = "Monitor reading") {
                ChoiceRow(
                    choices = MonitorReading.entries,
                    selected = monitorReading,
                    label = { it.name },
                    onSelect = { monitorReading = it },
                )
                Button(
                    onClick = { onRecordMonitor(date, monitorReading) },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Save monitor reading")
                }
            }

            ObservationCard(title = "Bleeding") {
                ChoiceRow(
                    choices = BleedingIntensity.entries,
                    selected = bleedingIntensity,
                    label = { it.name },
                    onSelect = { bleedingIntensity = it },
                )
                Button(
                    onClick = { onRecordBleeding(date, bleedingIntensity) },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Save bleeding")
                }
            }

            ObservationCard(title = "User-marked Peak") {
                Text(
                    "This explicit entry anchors the mechanical P, P+1, P+2, and P+3 labels. A monitor Peak reading alone does not mark it.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Button(
                    onClick = { onMarkPeak(date) },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Mark this as Peak day")
                }
            }

            ObservationCard(title = "Note") {
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Note") },
                    minLines = 2,
                )
                Button(
                    onClick = {
                        onRecordNote(date, note)
                        note = ""
                    },
                    enabled = !busy && note.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Save note")
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun ObservationCard(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            content()
        }
    }
}

@Composable
private fun <T> ChoiceRow(
    choices: List<T>,
    selected: T,
    label: (T) -> String,
    onSelect: (T) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        choices.forEach { choice ->
            FilterChip(
                selected = choice == selected,
                onClick = { onSelect(choice) },
                label = { Text(label(choice)) },
            )
        }
    }
}
