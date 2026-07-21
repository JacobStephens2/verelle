package app.verelle

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
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.verelle.ffi.FfiBleedingIntensity
import app.verelle.ffi.FfiCycleStartBasis
import app.verelle.ffi.FfiIntercourseKind
import app.verelle.ffi.FfiLhQualitative
import app.verelle.ffi.FfiMucusAppearance
import app.verelle.ffi.FfiMucusCategory
import app.verelle.ffi.FfiMucusSensation
import app.verelle.ffi.FfiPeakSource
import app.verelle.ffi.FfiTemperatureUnit
import app.verelle.ffi.LocalRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
internal fun SupplementalObservationForms(
    repository: LocalRepository,
    date: String,
    onSaved: suspend (String) -> Unit,
    onError: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }

    fun submit(success: String, action: () -> Unit) {
        if (busy) return
        busy = true
        scope.launch {
            try {
                withContext(Dispatchers.IO) { action() }
                onSaved(success)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                onError(error.message ?: "$success could not be saved")
            } finally {
                busy = false
            }
        }
    }

    var cycleBasis by remember { mutableStateOf(FfiCycleStartBasis.MENSES) }
    var methodCycle by remember { mutableStateOf("1") }
    var postpartumCycle by remember { mutableStateOf("") }
    ObservationSection("Cycle details") {
        EnumChips(FfiCycleStartBasis.entries, cycleBasis, { it.friendlyName() }) {
            cycleBasis = it
        }
        NumberField("Method cycle number (optional)", methodCycle) { methodCycle = it }
        NumberField("Postpartum cycle number (optional)", postpartumCycle) {
            postpartumCycle = it
        }
        Button(
            onClick = {
                submit("Cycle details saved") {
                    repository.recordCycleStartDetails(
                        date,
                        cycleBasis,
                        methodCycle.toUIntOrNull(),
                        postpartumCycle.toUIntOrNull(),
                    )
                }
            },
            enabled = !busy && (methodCycle.isBlank() || methodCycle.toUIntOrNull() != null) &&
                (postpartumCycle.isBlank() || postpartumCycle.toUIntOrNull() != null),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save cycle details") }
    }

    var mButtonTime by remember { mutableStateOf("07:00") }
    var monitorModel by remember { mutableStateOf("Clearblue") }
    var memoryReset by remember { mutableStateOf(false) }
    ObservationSection("Monitor setup") {
        Text("The chart displays the recorded six-hour window around the m-button time.")
        TimeField("M-button time", mButtonTime) { mButtonTime = it }
        OutlinedTextField(
            value = monitorModel,
            onValueChange = { monitorModel = it },
            label = { Text("Monitor model (optional)") },
            modifier = Modifier.fillMaxWidth(),
        )
        BooleanRow("Memory was reset", memoryReset) { memoryReset = it }
        Button(
            onClick = {
                submit("Monitor setup saved") {
                    repository.recordMonitorSetup(
                        date,
                        mButtonTime,
                        monitorModel.takeIf(String::isNotBlank),
                        memoryReset,
                    )
                }
            },
            enabled = !busy && mButtonTime.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save monitor setup") }
    }

    var e3g by remember { mutableStateOf("") }
    var numericLh by remember { mutableStateOf("") }
    ObservationSection("Quantitative hormones") {
        DecimalField("E3G", e3g) { e3g = it }
        DecimalField("LH", numericLh) { numericLh = it }
        Button(
            onClick = {
                submit("Hormone values saved") {
                    repository.recordQuantitativeHormones(
                        date,
                        e3g.toDoubleOrNull(),
                        numericLh.toDoubleOrNull(),
                        "ng/mL".takeIf { e3g.isNotBlank() },
                        "mIU/mL".takeIf { numericLh.isNotBlank() },
                    )
                }
            },
            enabled = !busy && (e3g.toDoubleOrNull() != null || numericLh.toDoubleOrNull() != null),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save hormone values") }
    }

    var lhQualitative by remember { mutableStateOf(FfiLhQualitative.NEGATIVE) }
    var lhBrand by remember { mutableStateOf("") }
    var tcRatio by remember { mutableStateOf("") }
    var lhTime by remember { mutableStateOf("") }
    var lhValid by remember { mutableStateOf(true) }
    ObservationSection("LH strip") {
        EnumChips(FfiLhQualitative.entries, lhQualitative, { it.friendlyName() }) {
            lhQualitative = it
        }
        OutlinedTextField(
            value = lhBrand,
            onValueChange = { lhBrand = it },
            label = { Text("Brand (optional)") },
            modifier = Modifier.fillMaxWidth(),
        )
        DecimalField("T/C ratio (optional)", tcRatio) { tcRatio = it }
        TimeField("Test time (optional)", lhTime) { lhTime = it }
        BooleanRow("Test valid", lhValid) { lhValid = it }
        Button(
            onClick = {
                submit("LH strip saved") {
                    repository.recordLhStrip(
                        date,
                        lhBrand.takeIf(String::isNotBlank),
                        lhQualitative,
                        tcRatio.toDoubleOrNull(),
                        null,
                        lhValid,
                        lhTime.takeIf(String::isNotBlank),
                    )
                }
            },
            enabled = !busy && (tcRatio.isBlank() || tcRatio.toDoubleOrNull() != null),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save LH strip") }
    }

    var bleeding by remember { mutableStateOf(FfiBleedingIntensity.MODERATE) }
    ObservationSection("Bleeding") {
        EnumChips(FfiBleedingIntensity.entries, bleeding, { it.friendlyName() }) { bleeding = it }
        Button(
            onClick = { submit("Bleeding saved") { repository.recordBleeding(date, bleeding) } },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save bleeding") }
    }

    var intercourse by remember { mutableStateOf(FfiIntercourseKind.INTERCOURSE) }
    var protected by remember { mutableStateOf<Boolean?>(null) }
    ObservationSection("Intercourse or genital contact") {
        EnumChips(FfiIntercourseKind.entries, intercourse, { it.friendlyName() }) {
            intercourse = it
        }
        NullableBooleanChips("Protection", protected) { protected = it }
        Button(
            onClick = {
                submit("Intercourse marker saved") {
                    repository.recordIntercourse(date, intercourse, protected)
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save marker") }
    }

    var sensation by remember { mutableStateOf<FfiMucusSensation?>(null) }
    var appearance by remember { mutableStateOf<FfiMucusAppearance?>(null) }
    var category by remember { mutableStateOf<FfiMucusCategory?>(null) }
    var baselineChange by remember { mutableStateOf<Boolean?>(null) }
    var confidence by remember { mutableStateOf("") }
    ObservationSection("Mucus observation") {
        Text("Sensation")
        NullableEnumChips(FfiMucusSensation.entries, sensation, { it.friendlyName() }) {
            sensation = it
        }
        Text("Appearance")
        NullableEnumChips(FfiMucusAppearance.entries, appearance, { it.friendlyName() }) {
            appearance = it
        }
        Text("Category you recorded")
        NullableEnumChips(FfiMucusCategory.entries, category, { it.friendlyName() }) {
            category = it
        }
        NullableBooleanChips("Baseline change", baselineChange) { baselineChange = it }
        NumberField("Confidence 0–100 (optional)", confidence) { confidence = it.take(3) }
        Button(
            onClick = {
                submit("Mucus observation saved") {
                    repository.recordMucus(
                        date,
                        sensation,
                        appearance,
                        category,
                        baselineChange,
                        confidence.toUByteOrNull(),
                    )
                }
            },
            enabled = !busy && (confidence.isBlank() || confidence.toIntOrNull() in 0..100),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save mucus observation") }
    }

    var temperature by remember { mutableStateOf("") }
    var temperatureUnit by remember { mutableStateOf(FfiTemperatureUnit.FAHRENHEIT) }
    var temperatureTime by remember { mutableStateOf("") }
    var sleepQuality by remember { mutableStateOf("") }
    var disturbed by remember { mutableStateOf(false) }
    ObservationSection("Temperature") {
        DecimalField("Temperature", temperature) { temperature = it }
        EnumChips(FfiTemperatureUnit.entries, temperatureUnit, { it.friendlyName() }) {
            temperatureUnit = it
        }
        TimeField("Time (optional)", temperatureTime) { temperatureTime = it }
        NumberField("Sleep quality 0–100 (optional)", sleepQuality) { sleepQuality = it.take(3) }
        BooleanRow("Disturbed reading", disturbed) { disturbed = it }
        Button(
            onClick = {
                submit("Temperature saved") {
                    repository.recordTemperature(
                        date,
                        checkNotNull(temperature.toDoubleOrNull()),
                        temperatureUnit,
                        temperatureTime.takeIf(String::isNotBlank),
                        sleepQuality.toUByteOrNull(),
                        disturbed,
                    )
                }
            },
            enabled = !busy && temperature.toDoubleOrNull() != null &&
                (sleepQuality.isBlank() || sleepQuality.toIntOrNull() in 0..100),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save temperature") }
    }

    var note by remember { mutableStateOf("") }
    ObservationSection("Note") {
        OutlinedTextField(
            value = note,
            onValueChange = { note = it },
            label = { Text("Note") },
            minLines = 2,
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = {
                val savedNote = note
                submit("Note saved") { repository.recordNote(date, savedNote) }
                note = ""
            },
            enabled = !busy && note.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Save note") }
    }

    var peakSource by remember { mutableStateOf(FfiPeakSource.MONITOR) }
    ObservationSection("Explicit user-marked Peak") {
        Text("This anchors mechanical P/P+ labels. A monitor Peak alone does not create it.")
        EnumChips(FfiPeakSource.entries, peakSource, { it.friendlyName() }) { peakSource = it }
        Button(
            onClick = {
                submit("User-marked Peak saved") {
                    repository.recordUserMarkedPeak(date, peakSource)
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Mark this date as Peak") }
    }
}

@Composable
private fun ObservationSection(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}

@Composable
private fun <T> EnumChips(values: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        values.forEach { value ->
            FilterChip(selected = value == selected, onClick = { onSelect(value) }, label = { Text(label(value)) })
        }
    }
}

@Composable
private fun <T> NullableEnumChips(
    values: List<T>,
    selected: T?,
    label: (T) -> String,
    onSelect: (T?) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FilterChip(selected = selected == null, onClick = { onSelect(null) }, label = { Text("Not recorded") })
        values.forEach { value ->
            FilterChip(selected = value == selected, onClick = { onSelect(value) }, label = { Text(label(value)) })
        }
    }
}

@Composable
private fun NullableBooleanChips(label: String, selected: Boolean?, onSelect: (Boolean?) -> Unit) {
    Text(label)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(null to "Not recorded", true to "Yes", false to "No").forEach { (value, text) ->
            FilterChip(selected = selected == value, onClick = { onSelect(value) }, label = { Text(text) })
        }
    }
}

@Composable
private fun BooleanRow(label: String, checked: Boolean, onChanged: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label)
        Switch(checked = checked, onCheckedChange = onChanged)
    }
}

@Composable
private fun NumberField(label: String, value: String, onChanged: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChanged(it.filter(Char::isDigit)) },
        label = { Text(label) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun DecimalField(label: String, value: String, onChanged: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChanged,
        label = { Text(label) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun TimeField(label: String, value: String, onChanged: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChanged,
        label = { Text("$label (HH:MM)") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        singleLine = true,
        modifier = Modifier.fillMaxWidth(),
    )
}

private fun Enum<*>.friendlyName(): String = name
    .lowercase()
    .split('_')
    .joinToString(" ") { word -> word.replaceFirstChar(Char::titlecase) }
