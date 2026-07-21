package app.verelle

import java.time.ZonedDateTime

internal fun nextReminderTime(now: ZonedDateTime, hour: Int, minute: Int): ZonedDateTime {
    require(hour in 0..23)
    require(minute in 0..59)
    val today = now.withHour(hour).withMinute(minute).withSecond(0).withNano(0)
    return if (today.isAfter(now)) today else today.plusDays(1)
}
