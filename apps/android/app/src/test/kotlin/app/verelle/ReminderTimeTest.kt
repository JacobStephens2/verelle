package app.verelle

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class ReminderTimeTest {
    private val zone = ZoneId.of("America/New_York")

    @Test
    fun schedulesLaterTodayOrTomorrow() {
        val morning = ZonedDateTime.of(2026, 7, 20, 6, 30, 0, 0, zone)
        assertEquals(
            ZonedDateTime.of(2026, 7, 20, 7, 0, 0, 0, zone),
            nextReminderTime(morning, 7, 0),
        )

        val after = ZonedDateTime.of(2026, 7, 20, 7, 1, 0, 0, zone)
        assertEquals(
            ZonedDateTime.of(2026, 7, 21, 7, 0, 0, 0, zone),
            nextReminderTime(after, 7, 0),
        )
    }
}
