package app.verelle.wear

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester

internal object WearSurfaceState {
    private const val PREFERENCES = "verelle-watch-surface-v1"
    private const val RECENT = "recent"

    fun recent(context: Context): String = context
        .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        .getString(RECENT, null)
        ?: "Open phone to sync"

    fun update(context: Context, value: String) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(RECENT, value.take(80))
            .apply()
        TileService.getUpdater(context).requestUpdate(VerelleTileService::class.java)
        ComplicationDataSourceUpdateRequester.create(
            context,
            ComponentName(context, VerelleComplicationService::class.java),
        ).requestUpdateAll()
    }
}
