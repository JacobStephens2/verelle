import CryptoKit
import Foundation
import Security
import WatchConnectivity

@MainActor
@Observable
final class ChartModel {
    private(set) var repository: LocalRepository?
    private(set) var charts: [FfiChart] = []
    private(set) var pendingCount: UInt64 = 0
    private(set) var enrollment: MobileEnrollment?
    private(set) var lastSyncedAt: Date?
    private(set) var accountBusy = false
    var recoveryCode: String?
    var coupleInviteCode: String?
    var message: String?
    private var watchBridge: WatchBridge?
    private let accountClient = AccountSyncClient()
    private let enrollmentStore = EnrollmentKeychain()
    private let redactionStore = PendingRedactionKeychain()

    func open() async {
        do {
            let key = try DatasetKeychain().getOrCreate()
            let database = try databaseURL()
            let device = DeviceIdentity().getOrCreate()
            repository = try LocalRepository.open(
                databasePath: database.path,
                keyMaterial: key,
                deviceId: device
            )
            try reload()
            startWatchBridge()
            if let repository, let resumed = try await accountClient.resumeRecovery(repository: repository) {
                enrollment = resumed.enrollment
                recoveryCode = resumed.recoveryCode
                message = "Account recovery resumed. Store the replacement recovery code and sign in with the new password."
            }
            enrollment = try enrollmentStore.load()
            await resumeRedaction()
            if enrollment?.hasActiveSession == true {
                await syncNow(quiet: true)
            }
        } catch {
            message = error.localizedDescription
        }
    }

    func startWatchBridge() {
        guard watchBridge == nil, WCSession.isSupported() else { return }
        watchBridge = WatchBridge(model: self)
    }

    func recentWatchSummary() -> [[String: Any]] {
        charts.last?.days.suffix(5).map { day in
            [
                "date": day.date,
                "cycle_day": Int(day.cycleDay),
                "entries": day.entries.map(\.label),
            ]
        } ?? []
    }

    func recordCycleStart(date: String, number: UInt32) {
        perform { try $0.recordCycleStart(date: date, methodCycleNumber: number) }
    }

    func recordMonitor(date: String, reading: FfiMonitorReading) {
        perform { try $0.recordMonitorReading(date: date, reading: reading) }
    }

    func recordNote(date: String, text: String) {
        perform { try $0.recordNote(date: date, text: text) }
    }

    func recordBleeding(date: String, intensity: FfiBleedingIntensity) {
        perform { try $0.recordBleeding(date: date, intensity: intensity) }
    }

    func recordMucus(date: String, category: FfiMucusCategory) {
        perform {
            try $0.recordMucus(
                date: date,
                sensation: nil,
                appearance: nil,
                category: category,
                baselineChange: nil,
                confidence: nil
            )
        }
    }

    func recordTemperature(date: String, value: Double, unit: FfiTemperatureUnit) {
        perform {
            try $0.recordTemperature(
                date: date,
                value: value,
                unit: unit,
                time: nil,
                sleepQuality: nil,
                disturbed: false
            )
        }
    }

    func recordPeak(date: String, source: FfiPeakSource) {
        perform { try $0.recordUserMarkedPeak(date: date, source: source) }
    }

    func recordCycleStartDetails(
        date: String,
        basis: FfiCycleStartBasis,
        methodCycle: UInt32?,
        postpartumCycle: UInt32?
    ) {
        perform {
            try $0.recordCycleStartDetails(
                date: date,
                basis: basis,
                methodCycleNumber: methodCycle,
                postpartumCycleNumber: postpartumCycle
            )
        }
    }

    func recordMonitorSetup(date: String, time: String, model: String?, reset: Bool) {
        perform {
            try $0.recordMonitorSetup(
                date: date,
                mButtonTime: time,
                monitorModel: model,
                memoryReset: reset
            )
        }
    }

    func recordHormones(date: String, e3g: Double?, lh: Double?, e3gUnit: String?, lhUnit: String?) {
        perform {
            try $0.recordQuantitativeHormones(
                date: date,
                e3g: e3g,
                lh: lh,
                e3gUnit: e3gUnit,
                lhUnit: lhUnit
            )
        }
    }

    func recordLHStrip(date: String, result: FfiLhQualitative, ratio: Double?, numericLH: Double?) {
        perform {
            try $0.recordLhStrip(
                date: date,
                brand: nil,
                qualitative: result,
                tcRatio: ratio,
                numericLh: numericLH,
                valid: result != .invalid,
                testTime: nil
            )
        }
    }

    func recordIntercourse(date: String, kind: FfiIntercourseKind, protected: Bool?) {
        perform { try $0.recordIntercourse(date: date, kind: kind, protected: protected) }
    }

    func deleteMarker(date: String, marker: FfiEditableMarker) {
        guard let repository else { return }
        do {
            let superseded = try repository.deleteMarker(date: date, marker: marker)
            try reload()
            if let saved = enrollment, saved.hasActiveSession {
                try redactionStore.save(PendingMobileRedaction(
                    date: date,
                    markerRaw: marker.storageName,
                    operationIDs: superseded
                ))
                Task {
                    do {
                        await syncNow(quiet: true)
                        try await accountClient.redact(
                            operationIDs: superseded,
                            enrollment: saved
                        )
                        _ = try repository.purgeMarkerHistory(
                            date: date,
                            marker: marker,
                            operationIds: superseded
                        )
                        try reload()
                        try redactionStore.clear()
                        message = "Observation deleted and prior server ciphertext redacted"
                    } catch {
                        message = "The deletion is saved locally; server redaction will retry after sign-in: \(error.localizedDescription)"
                    }
                }
            } else {
                _ = try repository.purgeMarkerHistory(
                    date: date,
                    marker: marker,
                    operationIds: superseded
                )
                message = "Observation deleted locally"
            }
        } catch {
            message = error.localizedDescription
        }
    }

    func register(email: String, password: String) async {
        guard let repository else { return }
        await accountOperation {
            let result = try await accountClient.register(
                repository: repository,
                email: email,
                password: password,
                deviceID: DeviceIdentity().getOrCreate()
            )
            try enrollmentStore.save(result.enrollment)
            enrollment = result.enrollment
            recoveryCode = result.recoveryCode
            message = "Account created. Store the recovery code before relying on sync."
            await syncNow(quiet: true)
        }
    }

    func signIn(password: String) async {
        guard let saved = enrollment else {
            message = "This iPhone has no enrolled account. Recover the account on a new installation."
            return
        }
        await accountOperation {
            let signedIn = try await accountClient.login(enrollment: saved, password: password)
            try enrollmentStore.save(signedIn)
            enrollment = signedIn
            message = "Signed in securely"
            await syncNow(quiet: true)
        }
    }

    func recover(email: String, recoveryCode enteredCode: String, newPassword: String) async {
        guard let repository else { return }
        await accountOperation {
            let result = try await accountClient.recover(
                repository: repository,
                email: email,
                recoveryCode: enteredCode,
                newPassword: newPassword,
                deviceID: DeviceIdentity().getOrCreate()
            )
            try enrollmentStore.save(result.enrollment)
            enrollment = result.enrollment
            recoveryCode = result.recoveryCode
            try reload()
            message = result.enrollment.hasActiveSession
                ? "Account recovered and signed in. Store the replacement recovery code."
                : "Account recovered. Store the replacement recovery code, then sign in."
            await syncNow(quiet: true)
        }
    }

    func signOut() async {
        guard var saved = enrollment else { return }
        await accountOperation {
            if saved.hasActiveSession { try await accountClient.logout(enrollment: saved) }
            saved.bearerToken = ""
            saved.expiresAt = 0
            try enrollmentStore.save(saved)
            enrollment = saved
            message = "Signed out on this iPhone; local charting remains available"
        }
    }

    func syncNow(quiet: Bool = false) async {
        guard let repository, let saved = enrollment, saved.hasActiveSession else { return }
        if accountBusy && !quiet { return }
        if !quiet { accountBusy = true }
        do {
            let result = try await accountClient.sync(repository: repository, enrollment: saved)
            try reload()
            lastSyncedAt = Date()
            if !quiet { message = "Encrypted sync complete · \(result.0) sent · \(result.1) received" }
        } catch {
            if !quiet { message = error.localizedDescription }
        }
        if !quiet { accountBusy = false }
    }

    func createCoupleInvite() async {
        guard let repository, let saved = enrollment, saved.hasActiveSession else {
            message = "Sign in before creating a couple invite"
            return
        }
        await accountOperation {
            coupleInviteCode = try await accountClient.createCoupleInvite(
                repository: repository,
                enrollment: saved
            )
            message = "Share the invite code through a private channel"
        }
    }

    func acceptCoupleInvite(_ code: String) async {
        guard let repository, let saved = enrollment, saved.hasActiveSession else {
            message = "Sign in before accepting a couple invite"
            return
        }
        await accountOperation {
            let result = try await accountClient.acceptCoupleInvite(
                repository: repository,
                enrollment: saved,
                code: code
            )
            try DatasetKeychain().replace(result.datasetKey)
            try enrollmentStore.save(result.enrollment)
            enrollment = result.enrollment
            try reload()
            message = "The shared encrypted chart is ready"
            await syncNow(quiet: true)
        }
    }

    func deleteAccount() async {
        guard let saved = enrollment, saved.hasActiveSession else {
            message = "Sign in before deleting the server account"
            return
        }
        await accountOperation {
            let receipt = try await accountClient.deleteAccount(enrollment: saved)
            try enrollmentStore.clear()
            enrollment = nil
            message = "Server account deleted · receipt \(receipt). The local chart remains available for export."
        }
    }

    func exportJSON() -> String {
        (try? repository?.exportJson()) ?? "[]"
    }

    func exportCSV() -> String {
        (try? repository?.exportCsv()) ?? ""
    }

    private func perform(_ operation: (LocalRepository) throws -> Void) {
        guard let repository else {
            message = "Local chart storage is still opening"
            return
        }
        do {
            try operation(repository)
            try reload()
            message = "Observation saved on this iPhone"
            if enrollment?.hasActiveSession == true {
                Task { await syncNow(quiet: true) }
            }
        } catch {
            message = error.localizedDescription
        }
    }

    private func accountOperation(_ operation: () async throws -> Void) async {
        guard !accountBusy else { return }
        accountBusy = true
        do { try await operation() } catch { message = error.localizedDescription }
        accountBusy = false
    }

    private func resumeRedaction() async {
        guard
            let pending = try? redactionStore.load(),
            let repository,
            let saved = enrollment,
            saved.hasActiveSession,
            let marker = FfiEditableMarker(storageName: pending.markerRaw)
        else { return }
        do {
            await syncNow(quiet: true)
            try await accountClient.redact(operationIDs: pending.operationIDs, enrollment: saved)
            _ = try repository.purgeMarkerHistory(
                date: pending.date,
                marker: marker,
                operationIds: pending.operationIDs
            )
            try redactionStore.clear()
            try reload()
        } catch {
            message = "A pending server deletion will retry on the next launch: \(error.localizedDescription)"
        }
    }

    private func reload() throws {
        guard let repository else { return }
        charts = try repository.charts()
        pendingCount = try repository.pendingOutboxCount()
    }

    private func databaseURL() throws -> URL {
        let directory = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = false
        var mutableDirectory = directory
        try mutableDirectory.setResourceValues(values)
        return directory.appendingPathComponent("verelle.sqlite")
    }
}

private final class WatchBridge: NSObject, WCSessionDelegate, @unchecked Sendable {
    private weak var model: ChartModel?
    private let session = WCSession.default

    init(model: ChartModel) {
        self.model = model
        super.init()
        session.delegate = self
        session.activate()
    }

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {}

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }

    func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        let request = message["request"] as? String
        let date = message["date"] as? String
        let rawReading = message["reading"] as? String
        let reply = SendableReplyHandler(replyHandler)
        Task { @MainActor [weak self] in
            guard let self, let model else {
                reply.call(["error": "The iPhone chart is unavailable"])
                return
            }
            if request == "recent" {
                reply.call(["recent": model.recentWatchSummary()])
                return
            }
            guard
                let date,
                let raw = rawReading,
                let reading = Self.reading(raw)
            else {
                reply.call(["error": "The watch request is invalid"])
                return
            }
            model.recordMonitor(date: date, reading: reading)
            reply.call(["saved": date])
        }
    }

    private static func reading(_ value: String) -> FfiMonitorReading? {
        switch value {
        case "low": .low
        case "high": .high
        case "peak": .peak
        case "missed": .missed
        case "error": .error
        default: nil
        }
    }
}

private struct SendableReplyHandler: @unchecked Sendable {
    let call: ([String: Any]) -> Void

    init(_ call: @escaping ([String: Any]) -> Void) {
        self.call = call
    }
}

struct DatasetKeychain {
    private let account = "local-dataset-key-v1"

    func getOrCreate() throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.verelle.mobile",
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data, data.count == 32 {
            return data
        }
        guard status == errSecItemNotFound else { throw KeychainError(status) }
        let key = Data((0..<32).map { _ in UInt8.random(in: .min ... .max) })
        var insertion = query
        insertion.removeValue(forKey: kSecReturnData as String)
        insertion.removeValue(forKey: kSecMatchLimit as String)
        insertion[kSecValueData as String] = key
        insertion[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let inserted = SecItemAdd(insertion as CFDictionary, nil)
        guard inserted == errSecSuccess else { throw KeychainError(inserted) }
        return key
    }

    func replace(_ key: Data) throws {
        guard key.count == 32 else { throw KeychainError(errSecParam) }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "app.verelle.mobile",
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var insertion = query
        insertion[kSecValueData as String] = key
        insertion[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let inserted = SecItemAdd(insertion as CFDictionary, nil)
        guard inserted == errSecSuccess else { throw KeychainError(inserted) }
    }
}

private struct DeviceIdentity {
    func getOrCreate() -> String {
        let key = "verelle-device-id-v1"
        if let value = UserDefaults.standard.string(forKey: key) { return value }
        let value = UUID().uuidString.lowercased()
        UserDefaults.standard.set(value, forKey: key)
        return value
    }
}

private struct KeychainError: LocalizedError {
    let status: OSStatus
    init(_ status: OSStatus) { self.status = status }
    var errorDescription: String? { "Keychain operation failed (\(status))" }
}

private extension FfiEditableMarker {
    var storageName: String {
        switch self {
        case .cycleStart: "cycle_start"
        case .monitorSetup: "monitor_setup"
        case .monitor: "monitor"
        case .quantitativeHormones: "quantitative_hormones"
        case .lhStrip: "lh_strip"
        case .bleeding: "bleeding"
        case .intercourse: "intercourse"
        case .mucus: "mucus"
        case .temperature: "temperature"
        case .note: "note"
        case .userMarkedPeak: "user_marked_peak"
        }
    }

    init?(storageName: String) {
        switch storageName {
        case "cycle_start": self = .cycleStart
        case "monitor_setup": self = .monitorSetup
        case "monitor": self = .monitor
        case "quantitative_hormones": self = .quantitativeHormones
        case "lh_strip": self = .lhStrip
        case "bleeding": self = .bleeding
        case "intercourse": self = .intercourse
        case "mucus": self = .mucus
        case "temperature": self = .temperature
        case "note": self = .note
        case "user_marked_peak": self = .userMarkedPeak
        default: return nil
        }
    }
}
