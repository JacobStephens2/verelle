package app.verelle.wear

import android.app.PendingIntent
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

class VerelleComplicationService : SuspendingComplicationDataSourceService() {
    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? =
        complication(request.complicationType, WearSurfaceState.recent(this))

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        complication(type, "CD 8 · High")

    private fun complication(type: ComplicationType, value: String): ComplicationData? {
        val description = PlainComplicationText.Builder("Verelle: $value").build()
        val tapAction = PendingIntent.getActivity(
            this,
            0,
            Intent(this, WearMainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
                PlainComplicationText.Builder(value.take(7)).build(),
                description,
            ).setTapAction(tapAction).build()
            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(
                PlainComplicationText.Builder(value).build(),
                description,
            ).setTapAction(tapAction).build()
            else -> null
        }
    }
}
