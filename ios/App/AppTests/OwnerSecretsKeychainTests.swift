@testable import App
import XCTest

final class OwnerSecretsKeychainTests: XCTestCase {
    private var keychain: OwnerSecretsKeychain!

    override func setUpWithError() throws {
        keychain = OwnerSecretsKeychain(
            service: "app.verelle.owner-secrets.tests.\(UUID().uuidString)"
        )
    }

    override func tearDownWithError() throws {
        try keychain.deleteAll()
    }

    func testJoinPersistsSharedOwnerAndPairingStateTogether() throws {
        let secret = Data((0..<32).map { UInt8($0) })
        try keychain.joinSharedOwner(secret)

        let loaded = try keychain.loadSharedOwnerRecord()
        XCTAssertEqual(loaded.secret, secret)
        XCTAssertEqual(loaded.pairingState, "shared")
    }

    func testLoadMigratesLegacySplitSharedOwnerAndPairingState() throws {
        let secret = Data((0..<32).map { UInt8($0) })
        try keychain.seedLegacySharedOwner(secret, pairingState: "shared")

        let migrated = try keychain.loadSharedOwnerRecord()
        XCTAssertEqual(migrated.secret, secret)
        XCTAssertEqual(migrated.pairingState, "shared")

        let bundled = try keychain.loadSharedOwnerRecord()
        XCTAssertEqual(bundled.secret, secret)
        XCTAssertEqual(bundled.pairingState, "shared")
    }

    func testLoadMigratesLegacySharedOwnerWithoutPairingStateAsUnpaired() throws {
        let secret = Data((0..<32).map { UInt8($0) })
        try keychain.seedLegacySharedOwner(secret, pairingState: nil)

        let migrated = try keychain.loadSharedOwnerRecord()
        XCTAssertEqual(migrated.secret, secret)
        XCTAssertEqual(migrated.pairingState, "unpaired")
    }

    func testRecordRoundTripKeepsPendingDistinctFromShared() throws {
        let secret = Data((0..<32).map { UInt8($0) })
        let pending = try SharedOwnerRecord(secret: secret, pairingState: "pending")
        let decoded = try SharedOwnerRecord.decode(pending.encode())
        XCTAssertEqual(decoded, pending)
        XCTAssertNotEqual(decoded.pairingState, "shared")
    }
}
