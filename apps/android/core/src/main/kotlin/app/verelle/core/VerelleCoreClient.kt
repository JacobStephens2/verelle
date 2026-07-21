package app.verelle.core

interface VerelleCoreClient {
    fun renderFixture(fixtureJson: String): List<ChartCycle>
}
