import XCTest

final class ObservationPersistenceUITests: XCTestCase {
    private let launchTimeout: TimeInterval = 30
    private let saveTimeout: TimeInterval = 8

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testRecordedObservationSurvivesColdRelaunch() throws {
        let app = XCUIApplication()
        app.launch()

        // WebKit exposes aria-pressed buttons and checkboxes as accessibility
        // Switches. Select only values that are off so this test is safe to
        // repeat against an app container left behind by a previous run.
        let mandatoryFields = ["High", "Heavy", "Mark my Peak", "Intercourse"]
            .map { app.switches[$0] }
        let high = mandatoryFields[0]
        XCTAssertTrue(
            high.waitForExistence(timeout: launchTimeout),
            "The recording screen never became interactive"
        )
        for field in mandatoryFields where field.value as? String != "1" {
            field.tap()
        }
        app.buttons["Save"].tap()

        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Saved '")).firstMatch
                .waitForExistence(timeout: saveTimeout),
            "Saving the Observation was never visibly confirmed"
        )
        let recordedChartDay = app.buttons.matching(
            NSPredicate(format: "label CONTAINS 'Monitor reading High'")
        ).firstMatch
        XCTAssertTrue(
            recordedChartDay.waitForExistence(timeout: launchTimeout),
            "The recorded Monitor reading never appeared on an accessible Chart day"
        )

        // XCUIApplication.terminate() kills the app process, matching a swipe
        // from the app switcher. A second launch is a real WebKit/OPFS cold
        // relaunch, not a browser reload or a new in-memory store.
        app.terminate()
        app.launch()

        XCTAssertTrue(
            recordedChartDay.waitForExistence(timeout: launchTimeout),
            "The recorded Monitor reading disappeared after a cold relaunch"
        )
        for field in mandatoryFields {
            XCTAssertEqual(
                field.value as? String,
                "1",
                "The recording screen did not come back showing the saved \(field.label)"
            )
        }
    }
}
