package app.verelle.core

data class ChartDay(
    val date: String,
    val cycleDay: Int,
    val markers: List<String>,
    val observations: List<ChartObservation>,
    val annotations: List<String>,
)

data class ChartObservation(
    val marker: String,
    val summary: String,
)

data class ChartCycle(
    val cycleId: String,
    val startDate: String,
    val basis: String,
    val methodCycleNumber: Int,
    val postpartumCycleNumber: Int?,
    val days: List<ChartDay>,
)

enum class CycleBasis {
    Menses,
    ArtificialPostpartum,
    ReturnToCycles,
}

enum class MonitorReading {
    Low,
    High,
    Peak,
    Missed,
    Error,
}

enum class BleedingIntensity {
    Spotting,
    Light,
    Moderate,
    Heavy,
}

enum class PeakSource {
    Monitor,
    Mucus,
    LhStrip,
    Other,
}

enum class EditableMarker {
    CycleStart,
    Monitor,
    Bleeding,
    Note,
    UserMarkedPeak,
}
