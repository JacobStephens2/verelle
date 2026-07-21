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
    var message: String?
    private var watchBridge: WatchBridge?

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
        } catch {
            message = error.localizedDescription
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

private struct DatasetKeychain {
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
