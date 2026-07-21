package app.verelle

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import java.time.ZonedDateTime

data class ReminderSettings(val enabled: Boolean, val hour: Int, val minute: Int)

class ReminderScheduler(private val context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun settings(): ReminderSettings = ReminderSettings(
        enabled = preferences.getBoolean(ENABLED, false),
        hour = preferences.getInt(HOUR, DEFAULT_HOUR),
        minute = preferences.getInt(MINUTE, DEFAULT_MINUTE),
    )

    @SuppressLint("UseKtx")
    fun update(enabled: Boolean, hour: Int, minute: Int) {
        require(hour in 0..23)
        require(minute in 0..59)
        check(
            preferences.edit()
                .putBoolean(ENABLED, enabled)
                .putInt(HOUR, hour)
                .putInt(MINUTE, minute)
                .commit(),
        ) { "Could not save reminder settings" }
        if (enabled) scheduleNext() else cancel()
    }

    fun scheduleNext() {
        val settings = settings()
        if (!settings.enabled) return
        val triggerAt = nextReminderTime(ZonedDateTime.now(), settings.hour, settings.minute)
            .toInstant()
            .toEpochMilli()
        alarmManager().setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, reminderIntent())
    }

    fun cancel() = alarmManager().cancel(reminderIntent())

    fun showNotification() {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Chart reminders", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "User-configured reminders to open Verelle"
            },
        )
        val openApp = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        manager.notify(
            NOTIFICATION_ID,
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("Verelle reminder")
                .setContentText("Open Verelle to add today's observations.")
                .setContentIntent(openApp)
                .setAutoCancel(true)
                .build(),
        )
    }

    private fun alarmManager(): AlarmManager = context.getSystemService(AlarmManager::class.java)

    private fun reminderIntent(): PendingIntent = PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, ReminderReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    private companion object {
        const val PREFERENCES = "verelle_reminder_v1"
        const val ENABLED = "enabled"
        const val HOUR = "hour"
        const val MINUTE = "minute"
        const val DEFAULT_HOUR = 7
        const val DEFAULT_MINUTE = 0
        const val CHANNEL_ID = "verelle_chart_reminder"
        const val NOTIFICATION_ID = 1001
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        ReminderScheduler(context.applicationContext).run {
            showNotification()
            scheduleNext()
        }
    }
}

class ReminderRescheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (
            intent?.action == Intent.ACTION_BOOT_COMPLETED ||
            intent?.action == Intent.ACTION_TIME_CHANGED ||
            intent?.action == Intent.ACTION_TIMEZONE_CHANGED
        ) {
            ReminderScheduler(context.applicationContext).scheduleNext()
        }
    }
}
