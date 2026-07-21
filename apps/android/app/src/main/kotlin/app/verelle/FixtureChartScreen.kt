package app.verelle

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.verelle.core.ChartCycle
import app.verelle.core.ChartDay
import app.verelle.core.LiveVerelleCoreClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private sealed interface FixtureState {
    data object Loading : FixtureState
    data class Loaded(val charts: List<ChartCycle>) : FixtureState
    data class Failed(val reason: String) : FixtureState
}

@Composable
fun FixtureChartRoute(
    loadFixture: () -> String,
    modifier: Modifier = Modifier,
) {
    var state: FixtureState by remember { mutableStateOf(FixtureState.Loading) }
    LaunchedEffect(loadFixture) {
        state = withContext(Dispatchers.IO) {
            runCatching {
                LiveVerelleCoreClient().renderFixture(loadFixture())
            }.fold(
                onSuccess = FixtureState::Loaded,
                onFailure = { FixtureState.Failed(it.message ?: "Unable to render chart") },
            )
        }
    }

    Surface(modifier = modifier.fillMaxSize()) {
        when (val current = state) {
            FixtureState.Loading -> Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
                Text("Rendering chart…")
            }

            is FixtureState.Loaded -> ChartScreen(current.charts)
            is FixtureState.Failed -> ErrorScreen(current.reason)
        }
    }
}

@Composable
fun ChartScreen(
    charts: List<ChartCycle>,
    modifier: Modifier = Modifier,
    onExportJson: (() -> Unit)? = null,
    onExportCsv: (() -> Unit)? = null,
    onDeleteMarker: ((date: String, marker: String) -> Unit)? = null,
) {
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Spacer(Modifier.height(20.dp))
            Text(
                text = "Verelle",
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = "Your observations, clearly charted",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (onExportJson != null && onExportCsv != null) {
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onExportJson) { Text("Export JSON") }
                    OutlinedButton(onClick = onExportCsv) { Text("Export CSV") }
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        if (charts.isEmpty()) {
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text(
                            "Start your first cycle",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Use Record to mark cycle day 1. Verelle displays only what you enter.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        charts.forEach { chart ->
            item(key = chart.cycleId) { CycleHeader(chart) }
            items(chart.days, key = { "${chart.cycleId}:${it.date}:${it.cycleDay}" }) { day ->
                DayCard(day, onDeleteMarker)
            }
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

@Composable
private fun CycleHeader(chart: ChartCycle) {
    Column {
        Text(
            text = "Cycle ${chart.methodCycleNumber}",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = "Started ${chart.startDate} · ${chart.basis.replace('_', ' ')}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun DayCard(
    day: ChartDay,
    onDeleteMarker: ((date: String, marker: String) -> Unit)?,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.width(76.dp)) {
                Text(
                    text = "Day ${day.cycleDay}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = day.date,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (day.observations.isEmpty()) {
                    Text("No observations", style = MaterialTheme.typography.bodyMedium)
                } else {
                    day.observations.forEach { observation ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = observation.summary,
                                modifier = Modifier.weight(1f),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            if (
                                onDeleteMarker != null &&
                                observation.marker in EDITABLE_DAY_MARKERS
                            ) {
                                TextButton(
                                    onClick = { onDeleteMarker(day.date, observation.marker) },
                                ) {
                                    Text("Delete")
                                }
                            }
                        }
                    }
                }
                if (day.annotations.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        day.annotations.forEach { annotation -> AnnotationPill(annotation) }
                    }
                }
            }
        }
    }
}

private val EDITABLE_DAY_MARKERS = setOf("monitor", "bleeding", "note", "user_marked_peak")

@Composable
private fun AnnotationPill(annotation: String) {
    Text(
        text = annotation,
        modifier = Modifier
            .background(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = RoundedCornerShape(50),
            )
            .padding(horizontal = 9.dp, vertical = 4.dp),
        color = MaterialTheme.colorScheme.onPrimaryContainer,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Bold,
    )
}

@Composable
private fun ErrorScreen(reason: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Chart unavailable", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(reason, color = MaterialTheme.colorScheme.error)
    }
}
