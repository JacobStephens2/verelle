package app.verelle.core

import app.verelle.core.generated.BleedingIntensityInput
import app.verelle.core.generated.CycleBasisInput
import app.verelle.core.generated.EditableMarker as RustEditableMarker
import app.verelle.core.generated.LocalChartStore
import app.verelle.core.generated.MonitorReadingInput
import app.verelle.core.generated.PeakSourceInput

class LiveLocalChartClient private constructor(
    private val store: LocalChartStore,
) : LocalChartClient {
    override fun charts(): List<ChartCycle> = store.charts().mapGeneratedCharts()

    override fun recordCycleStart(
        date: String,
        basis: CycleBasis,
        methodCycleNumber: Int?,
        postpartumCycleNumber: Int?,
        recordedAtMs: Long,
    ) {
        store.recordCycleStart(
            date = date,
            basis = basis.toGenerated(),
            methodCycleNumber = methodCycleNumber?.toUInt(),
            postpartumCycleNumber = postpartumCycleNumber?.toUInt(),
            recordedAtMs = recordedAtMs,
        )
    }

    override fun recordMonitor(date: String, reading: MonitorReading, recordedAtMs: Long) {
        store.recordMonitor(date, reading.toGenerated(), recordedAtMs)
    }

    override fun recordBleeding(date: String, intensity: BleedingIntensity, recordedAtMs: Long) {
        store.recordBleeding(date, intensity.toGenerated(), recordedAtMs)
    }

    override fun recordNote(date: String, text: String, recordedAtMs: Long) {
        store.recordNote(date, text, recordedAtMs)
    }

    override fun recordUserMarkedPeak(date: String, source: PeakSource, recordedAtMs: Long) {
        store.recordUserMarkedPeak(date, source.toGenerated(), recordedAtMs)
    }

    override fun deleteMarker(date: String, marker: EditableMarker, recordedAtMs: Long) {
        store.deleteMarker(date, marker.toGenerated(), recordedAtMs)
    }

    override fun exportJson(): String = store.exportJson()

    override fun exportCsv(): String = store.exportCsv()

    override fun close() = store.close()

    companion object {
        fun open(
            databasePath: String,
            datasetId: String,
            deviceId: String,
            datasetKey: ByteArray,
        ): LiveLocalChartClient = LiveLocalChartClient(
            LocalChartStore.open(databasePath, datasetId, deviceId, datasetKey),
        )
    }
}

private fun List<app.verelle.core.generated.ChartCycle>.mapGeneratedCharts(): List<ChartCycle> =
    map { cycle ->
        ChartCycle(
            cycleId = cycle.cycleId,
            startDate = cycle.startDate,
            basis = cycle.basis,
            methodCycleNumber = cycle.methodCycleNumber.toInt(),
            postpartumCycleNumber = cycle.postpartumCycleNumber?.toInt(),
            days = cycle.days.map { day ->
                ChartDay(
                    date = day.date,
                    cycleDay = day.cycleDay.toInt(),
                    markers = day.markers,
                    observations = day.observations.map { observation ->
                        ChartObservation(
                            marker = observation.marker,
                            summary = observation.summary,
                        )
                    },
                    annotations = day.annotations,
                )
            },
        )
    }

private fun CycleBasis.toGenerated(): CycleBasisInput = when (this) {
    CycleBasis.Menses -> CycleBasisInput.MENSES
    CycleBasis.ArtificialPostpartum -> CycleBasisInput.ARTIFICIAL_POSTPARTUM
    CycleBasis.ReturnToCycles -> CycleBasisInput.RETURN_TO_CYCLES
}

private fun MonitorReading.toGenerated(): MonitorReadingInput = when (this) {
    MonitorReading.Low -> MonitorReadingInput.LOW
    MonitorReading.High -> MonitorReadingInput.HIGH
    MonitorReading.Peak -> MonitorReadingInput.PEAK
    MonitorReading.Missed -> MonitorReadingInput.MISSED
    MonitorReading.Error -> MonitorReadingInput.ERROR
}

private fun BleedingIntensity.toGenerated(): BleedingIntensityInput = when (this) {
    BleedingIntensity.Spotting -> BleedingIntensityInput.SPOTTING
    BleedingIntensity.Light -> BleedingIntensityInput.LIGHT
    BleedingIntensity.Moderate -> BleedingIntensityInput.MODERATE
    BleedingIntensity.Heavy -> BleedingIntensityInput.HEAVY
}

private fun PeakSource.toGenerated(): PeakSourceInput = when (this) {
    PeakSource.Monitor -> PeakSourceInput.MONITOR
    PeakSource.Mucus -> PeakSourceInput.MUCUS
    PeakSource.LhStrip -> PeakSourceInput.LH_STRIP
    PeakSource.Other -> PeakSourceInput.OTHER
}

private fun EditableMarker.toGenerated(): RustEditableMarker = when (this) {
    EditableMarker.CycleStart -> RustEditableMarker.CYCLE_START
    EditableMarker.Monitor -> RustEditableMarker.MONITOR
    EditableMarker.Bleeding -> RustEditableMarker.BLEEDING
    EditableMarker.Note -> RustEditableMarker.NOTE
    EditableMarker.UserMarkedPeak -> RustEditableMarker.USER_MARKED_PEAK
}
