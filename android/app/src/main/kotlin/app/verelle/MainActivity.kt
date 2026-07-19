package app.verelle

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.verelle.ffi.FfiChart
import app.verelle.ffi.FfiChartDay
import app.verelle.ffi.replayFixture

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val chartResult = remember {
                        runCatching {
                            val fixture = assets.open("regular-cycle.json")
                                .bufferedReader()
                                .use { it.readText() }
                            replayFixture(fixture).single()
                        }
                    }
                    chartResult.fold(
                        onSuccess = { VerelleChart(it) },
                        onFailure = { ChartLoadFailure(it.message ?: "Unknown error") },
                    )
                }
            }
        }
    }
}

@Composable
private fun VerelleChart(chart: FfiChart) {
    Column(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text("Verelle", style = MaterialTheme.typography.headlineMedium)
            Text(
                text = "Cycle ${chart.methodCycleNumber} · ${chart.startDate}",
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                text = "Recorded observations and mechanical annotations only",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        HorizontalDivider()
        LazyColumn {
            items(chart.days, key = { it.date }) { day ->
                ChartDay(day)
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun ChartDay(day: FfiChartDay) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("CD ${day.cycleDay}", fontWeight = FontWeight.SemiBold)
            Text(day.date, style = MaterialTheme.typography.bodySmall)
        }
        Column(modifier = Modifier.weight(2f)) {
            Text(day.markers.ifEmpty { listOf("No entry") }.joinToString(" · "))
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
private fun ChartLoadFailure(message: String) {
    Column(modifier = Modifier.padding(20.dp)) {
        Text("Chart unavailable", style = MaterialTheme.typography.headlineSmall)
        Text(message)
    }
}
