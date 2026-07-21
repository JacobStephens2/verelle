package app.verelle

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun ReminderScreen(
    initialSettings: ReminderSettings,
    onSave: (enabled: Boolean, hour: Int, minute: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    var enabled by remember(initialSettings) { mutableStateOf(initialSettings.enabled) }
    var hour by remember(initialSettings) { mutableStateOf(initialSettings.hour.toString()) }
    var minute by remember(initialSettings) {
        mutableStateOf(initialSettings.minute.toString().padStart(2, '0'))
    }
    val validHour = hour.toIntOrNull()?.takeIf { it in 0..23 }
    val validMinute = minute.toIntOrNull()?.takeIf { it in 0..59 }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            "Reminder",
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            "Choose a local daily reminder. Delivery can be delayed by Android battery controls.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Daily reminder", style = MaterialTheme.typography.titleMedium)
            Switch(checked = enabled, onCheckedChange = { enabled = it })
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = hour,
                onValueChange = { hour = it.filter(Char::isDigit).take(2) },
                modifier = Modifier.weight(1f),
                label = { Text("Hour (0–23)") },
                singleLine = true,
            )
            OutlinedTextField(
                value = minute,
                onValueChange = { minute = it.filter(Char::isDigit).take(2) },
                modifier = Modifier.weight(1f),
                label = { Text("Minute") },
                singleLine = true,
            )
        }
        Button(
            onClick = { onSave(enabled, checkNotNull(validHour), checkNotNull(validMinute)) },
            enabled = validHour != null && validMinute != null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Save reminder")
        }
        if (initialSettings.enabled) {
            OutlinedButton(
                onClick = {
                    enabled = false
                    onSave(false, validHour ?: initialSettings.hour, validMinute ?: initialSettings.minute)
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Turn reminder off")
            }
        }
        Text(
            "Notifications never include chart values or fertility information.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
