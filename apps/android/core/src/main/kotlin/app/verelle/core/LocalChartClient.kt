package app.verelle.core

interface LocalChartClient : AutoCloseable {
    fun charts(): List<ChartCycle>

    fun recordCycleStart(
        date: String,
        basis: CycleBasis,
        methodCycleNumber: Int?,
        postpartumCycleNumber: Int?,
        recordedAtMs: Long,
    )

    fun recordMonitor(date: String, reading: MonitorReading, recordedAtMs: Long)

    fun recordBleeding(date: String, intensity: BleedingIntensity, recordedAtMs: Long)

    fun recordNote(date: String, text: String, recordedAtMs: Long)

    fun recordUserMarkedPeak(date: String, source: PeakSource, recordedAtMs: Long)

    fun deleteMarker(date: String, marker: EditableMarker, recordedAtMs: Long)

    fun exportJson(): String

    fun exportCsv(): String
}
