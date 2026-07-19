package app.verelle

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.verelle.ffi.replayFixture
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FixtureReplayInstrumentedTest {
    @Test
    fun regularFixtureCrossesUniFfiWithTheRustChartStructure() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val fixture = context.assets.open("regular-cycle.json")
            .bufferedReader()
            .use { it.readText() }

        val chart = replayFixture(fixture).single()

        assertEquals("2026-07-01", chart.startDate)
        assertEquals(4u, chart.methodCycleNumber)
        assertEquals(listOf("monitor", "user_marked_peak"), chart.days[2].markers)
        assertEquals(listOf("P"), chart.days[2].annotations)
        assertEquals(listOf("P+3"), chart.days[5].annotations)
    }
}
