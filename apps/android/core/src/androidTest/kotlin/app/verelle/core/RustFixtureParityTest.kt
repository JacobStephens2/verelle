package app.verelle.core

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class RustFixtureParityTest {
    @Test
    fun regularCycleCrossesUniFfiWithGoldenParity() {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        val fixtureJson = assets.open("regular-cycle.json").bufferedReader().use { it.readText() }

        val charts = LiveVerelleCoreClient().renderFixture(fixtureJson)

        assertEquals(1, charts.size)
        val chart = charts.single()
        assertEquals("2026-07-01", chart.startDate)
        assertEquals("menses", chart.basis)
        assertEquals(4, chart.methodCycleNumber)
        assertEquals(6, chart.days.size)
        assertEquals(listOf("P", "P+1", "P+2", "P+3"), chart.days.flatMap { it.annotations })
        assertTrue(chart.days[2].markers.contains("user_marked_peak"))
        assertTrue(chart.days[1].observations.any { it.summary == "Monitor · Missed" })
    }

    @Test
    fun localStorePersistsThroughRustAndExports() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val database = File(context.cacheDir, "verelle-${UUID.randomUUID()}.sqlite")
        val datasetId = UUID.randomUUID().toString()
        val datasetKey = ByteArray(32) { 11 }
        try {
            LiveLocalChartClient.open(
                database.absolutePath,
                datasetId,
                "android-instrumented-test",
                datasetKey,
            ).use { store ->
                store.recordCycleStart(
                    "2026-07-20",
                    CycleBasis.Menses,
                    1,
                    null,
                    100,
                )
                store.recordMonitor("2026-07-20", MonitorReading.Low, 101)
                store.recordUserMarkedPeak("2026-07-20", PeakSource.Monitor, 102)
                assertEquals("Monitor · Low", store.charts().single().days.single()
                    .observations.first { it.marker == "monitor" }.summary)
                assertTrue(store.exportCsv().contains("user_marked_peak"))
            }

            LiveLocalChartClient.open(
                database.absolutePath,
                datasetId,
                "android-instrumented-test",
                datasetKey,
            ).use { reopened ->
                assertEquals(listOf("P"), reopened.charts().single().days.single().annotations)
                assertTrue(reopened.exportJson().contains("2026-07-20"))
            }
        } finally {
            database.delete()
            File("${database.absolutePath}-shm").delete()
            File("${database.absolutePath}-wal").delete()
        }
    }
}
