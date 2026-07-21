package app.verelle.core

import app.verelle.core.generated.renderFixture as renderFixtureWithRust

class LiveVerelleCoreClient : VerelleCoreClient {
    override fun renderFixture(fixtureJson: String): List<ChartCycle> =
        renderFixtureWithRust(fixtureJson).map { cycle ->
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
}
