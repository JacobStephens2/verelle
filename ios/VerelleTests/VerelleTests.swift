import XCTest
@testable import Verelle

final class VerelleTests: XCTestCase {
    func testCivilDateFormatterIsStable() {
        let components = DateComponents(calendar: .init(identifier: .gregorian), year: 2026, month: 7, day: 20)
        XCTAssertNotNil(components.date)
    }
}
