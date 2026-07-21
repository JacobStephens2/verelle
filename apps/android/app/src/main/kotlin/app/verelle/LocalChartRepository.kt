package app.verelle

import android.content.Context
import app.verelle.core.BleedingIntensity
import app.verelle.core.ChartCycle
import app.verelle.core.CycleBasis
import app.verelle.core.EditableMarker
import app.verelle.core.LiveLocalChartClient
import app.verelle.core.MonitorReading
import app.verelle.core.PeakSource

class LocalChartRepository(context: Context) : AutoCloseable {
    private val client: LiveLocalChartClient

    init {
        val database = context.getDatabasePath(DATABASE_NAME)
        check(database.parentFile?.mkdirs() != false || database.parentFile?.isDirectory == true) {
            "Could not create the local database directory"
        }
        val identity = LocalDatasetIdentityStore(context).loadOrCreate(database.exists())
        client = try {
            LiveLocalChartClient.open(
                databasePath = database.absolutePath,
                datasetId = identity.datasetId,
                deviceId = identity.deviceId,
                datasetKey = identity.datasetKey,
            )
        } finally {
            identity.datasetKey.fill(0)
        }
    }

    fun charts(): List<ChartCycle> = client.charts()

    fun startCycle(date: String, methodCycleNumber: Int) {
        client.recordCycleStart(
            date = date,
            basis = CycleBasis.Menses,
            methodCycleNumber = methodCycleNumber,
            postpartumCycleNumber = null,
            recordedAtMs = System.currentTimeMillis(),
        )
    }

    fun recordMonitor(date: String, reading: MonitorReading) {
        client.recordMonitor(date, reading, System.currentTimeMillis())
    }

    fun recordBleeding(date: String, intensity: BleedingIntensity) {
        client.recordBleeding(date, intensity, System.currentTimeMillis())
    }

    fun recordNote(date: String, note: String) {
        client.recordNote(date, note, System.currentTimeMillis())
    }

    fun markPeak(date: String) {
        client.recordUserMarkedPeak(date, PeakSource.Monitor, System.currentTimeMillis())
    }

    fun deleteMarker(date: String, marker: String) {
        val editable = when (marker) {
            "monitor" -> EditableMarker.Monitor
            "bleeding" -> EditableMarker.Bleeding
            "note" -> EditableMarker.Note
            "user_marked_peak" -> EditableMarker.UserMarkedPeak
            else -> error("This observation cannot be deleted from the Android screen yet")
        }
        client.deleteMarker(date, editable, System.currentTimeMillis())
    }

    fun exportJson(): String = client.exportJson()

    fun exportCsv(): String = client.exportCsv()

    override fun close() = client.close()

    private companion object {
        const val DATABASE_NAME = "verelle.sqlite"
    }
}
