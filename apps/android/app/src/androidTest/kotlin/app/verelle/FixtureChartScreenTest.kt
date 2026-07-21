package app.verelle

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.verelle.core.LiveVerelleCoreClient
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FixtureChartScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun rustRenderedFixtureAppearsOnTheChartScreen() {
        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        val fixture = assets.open("regular-cycle.json").bufferedReader().use { it.readText() }
        val charts = LiveVerelleCoreClient().renderFixture(fixture)

        composeRule.setContent {
            VerelleTheme { ChartScreen(charts) }
        }
        composeRule.onNodeWithText("Verelle").assertIsDisplayed()
        composeRule.onNodeWithText("Cycle 4").assertIsDisplayed()
        composeRule.onNodeWithText("Day 1").assertIsDisplayed()
        composeRule.onNodeWithText("Monitor · Missed").assertIsDisplayed()
        composeRule.onNodeWithText("P").assertIsDisplayed()
    }
}
