package app.verelle

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import app.verelle.ffi.FfiEditableMarker
import app.verelle.ffi.LocalRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
internal fun LocalDataTools(
    repository: LocalRepository,
    date: String,
    enrolledForSync: Boolean,
    onChanged: suspend (String) -> Unit,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scheduler = remember { ReminderScheduler(context.applicationContext) }
    val enrollmentStore = remember { SyncEnrollmentStore(context.applicationContext) }
    val redactionStore = remember { PendingRedactionStore(context.applicationContext) }
    var settings by remember { mutableStateOf(scheduler.settings()) }
    var reminderEnabled by remember(settings) { mutableStateOf(settings.enabled) }
    var reminderHour by remember(settings) { mutableStateOf(settings.hour.toString()) }
    var reminderMinute by remember(settings) { mutableStateOf(settings.minute.toString().padStart(2, '0')) }
    var pendingReminderSave by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val pending = pendingReminderSave
        pendingReminderSave = null
        if (granted && pending != null) {
            runCatching { scheduler.update(true, pending.first, pending.second) }
                .onSuccess {
                    settings = scheduler.settings()
                    reminderEnabled = true
                }
                .onFailure { onError(it.message ?: "Reminder could not be saved") }
        } else if (!granted) {
            reminderEnabled = false
            onError("Notification permission was not granted")
        }
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Reminder", style = MaterialTheme.typography.titleMedium)
            Text("Android may delay this local reminder because of battery controls.")
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Daily reminder")
                Switch(checked = reminderEnabled, onCheckedChange = { reminderEnabled = it })
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = reminderHour,
                    onValueChange = { reminderHour = it.filter(Char::isDigit).take(2) },
                    label = { Text("Hour") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = reminderMinute,
                    onValueChange = { reminderMinute = it.filter(Char::isDigit).take(2) },
                    label = { Text("Minute") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
            }
            Button(
                onClick = {
                    val hour = checkNotNull(reminderHour.toIntOrNull())
                    val minute = checkNotNull(reminderMinute.toIntOrNull())
                    if (
                        reminderEnabled &&
                        Build.VERSION.SDK_INT >= 33 &&
                        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
                        PackageManager.PERMISSION_GRANTED
                    ) {
                        pendingReminderSave = hour to minute
                        permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        runCatching { scheduler.update(reminderEnabled, hour, minute) }
                            .onSuccess {
                                settings = scheduler.settings()
                                onError("Reminder settings saved")
                            }
                            .onFailure { onError(it.message ?: "Reminder could not be saved") }
                    }
                },
                enabled = reminderHour.toIntOrNull() in 0..23 && reminderMinute.toIntOrNull() in 0..59,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save reminder") }
            Text(
                "Notifications contain no chart values or fertility information.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Export", style = MaterialTheme.typography.titleMedium)
            Text("Create an explicit local export. It can contain sensitive health data.")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { shareExport(repository, "json", context::startActivity, onError, scope) },
                    modifier = Modifier.weight(1f),
                ) { Text("Share JSON") }
                Button(
                    onClick = { shareExport(repository, "csv", context::startActivity, onError, scope) },
                    modifier = Modifier.weight(1f),
                ) { Text("Share CSV") }
            }
        }
    }

    var marker by remember { mutableStateOf(FfiEditableMarker.NOTE) }
    var confirmation by remember { mutableStateOf("") }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Delete an observation", style = MaterialTheme.typography.titleMedium)
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FfiEditableMarker.entries.forEach { value ->
                    FilterChip(
                        selected = marker == value,
                        onClick = { marker = value },
                        label = { Text(value.displayName()) },
                    )
                }
            }
            OutlinedTextField(
                value = confirmation,
                onValueChange = { confirmation = it },
                label = { Text("Type DELETE") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedButton(
                onClick = {
                    confirmation = ""
                    scope.launch {
                        try {
                            val superseded = withContext(Dispatchers.IO) {
                                repository.deleteMarker(date, marker).also { ids ->
                                    if (!enrolledForSync && ids.isNotEmpty()) {
                                        repository.purgeMarkerHistory(date, marker, ids)
                                    } else if (enrolledForSync && ids.isNotEmpty()) {
                                        val enrollment = checkNotNull(enrollmentStore.load())
                                        redactionStore.save(
                                            PendingRedaction(
                                                enrollment.datasetId,
                                                date,
                                                marker,
                                                ids,
                                            ),
                                        )
                                        RedactionClient().resume(repository, enrollment, redactionStore)
                                    }
                                }
                            }
                            onChanged(
                                if (enrolledForSync && superseded.isNotEmpty())
                                    "Observation and superseded server ciphertext deleted"
                                else "Observation deleted",
                            )
                        } catch (error: CancellationException) {
                            throw error
                        } catch (error: Exception) {
                            onError(error.message ?: "Observation could not be deleted")
                        }
                    }
                },
                enabled = confirmation == "DELETE",
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Delete selected marker on $date") }
        }
    }
}

private fun shareExport(
    repository: LocalRepository,
    format: String,
    startActivity: (Intent) -> Unit,
    onError: (String) -> Unit,
    scope: kotlinx.coroutines.CoroutineScope,
) {
    scope.launch {
        try {
            val content = withContext(Dispatchers.IO) {
                if (format == "json") repository.exportJson() else repository.exportCsv()
            }
            val type = if (format == "json") "application/json" else "text/csv"
            startActivity(
                Intent.createChooser(
                    Intent(Intent.ACTION_SEND).apply {
                        this.type = type
                        putExtra(Intent.EXTRA_SUBJECT, "Verelle chart export.$format")
                        putExtra(Intent.EXTRA_TEXT, content)
                    },
                    "Share Verelle ${format.uppercase()} export",
                ),
            )
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            onError(error.message ?: "Export could not be created")
        }
    }
}

private fun FfiEditableMarker.displayName(): String = name
    .lowercase()
    .split('_')
    .joinToString(" ") { it.replaceFirstChar(Char::titlecase) }
