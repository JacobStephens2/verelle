package app.verelle

import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

class ReminderTimeTest {
    @Test
    fun schedulesLaterTodayOrTomorrowInTheCurrentZone() {
        val zone = ZoneId.of("America/New_York")
        val morning = ZonedDateTime.of(2026, 7, 20, 6, 30, 0, 0, zone)
        assertEquals(
            ZonedDateTime.of(2026, 7, 20, 7, 0, 0, 0, zone),
            nextReminderTime(morning, 7, 0),
        )
        val evening = morning.withHour(8)
        assertEquals(
            ZonedDateTime.of(2026, 7, 21, 7, 0, 0, 0, zone),
            nextReminderTime(evening, 7, 0),
        )
    }
}
