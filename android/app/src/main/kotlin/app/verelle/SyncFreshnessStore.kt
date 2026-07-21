package app.verelle

import android.content.Context

class SyncFreshnessStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun lastSuccessUnixMillis(): Long? = preferences
        .getLong(LAST_SUCCESS, 0L)
        .takeIf { it > 0L }

    fun recordSuccess(unixMillis: Long = System.currentTimeMillis()) {
        check(preferences.edit().putLong(LAST_SUCCESS, unixMillis).commit()) {
            "The sync freshness indicator could not be persisted"
        }
    }

    private companion object {
        const val PREFERENCES = "verelle-sync-freshness-v1"
        const val LAST_SUCCESS = "last_success_unix_millis"
    }
}
