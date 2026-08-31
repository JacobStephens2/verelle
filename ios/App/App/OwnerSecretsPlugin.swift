import Capacitor
import Foundation
import Security

enum OwnerSecretKey: String {
    case deviceOwner
    case sharedOwner
    case pairingState
}

enum OwnerSecretsError: Error {
    case keychain(OSStatus)
    case invalidSecret
}

/// One Keychain item: version byte, 32-byte Shared owner, UTF-8 pairing state.
struct SharedOwnerRecord: Equatable {
    static let version: UInt8 = 1
    static let secretByteCount = 32
    static let validPairingStates: Set<String> = ["unpaired", "pending", "shared"]

    let secret: Data
    let pairingState: String

    init(secret: Data, pairingState: String) throws {
        guard secret.count == Self.secretByteCount else { throw OwnerSecretsError.invalidSecret }
        guard Self.validPairingStates.contains(pairingState) else {
            throw OwnerSecretsError.invalidSecret
        }
        self.secret = secret
        self.pairingState = pairingState
    }

    func encode() -> Data {
        var data = Data([Self.version])
        data.append(secret)
        data.append(Data(pairingState.utf8))
        return data
    }

    static func decode(_ stored: Data) throws -> SharedOwnerRecord {
        guard stored.count > 1 + secretByteCount, stored.first == version else {
            throw OwnerSecretsError.invalidSecret
        }
        let secret = stored.subdata(in: 1..<(1 + secretByteCount))
        let stateData = stored.subdata(in: (1 + secretByteCount)..<stored.count)
        guard let pairingState = String(data: stateData, encoding: .utf8) else {
            throw OwnerSecretsError.invalidSecret
        }
        return try SharedOwnerRecord(secret: secret, pairingState: pairingState)
    }

    static func fromStored(
        _ stored: Data,
        legacyPairingState: String?
    ) throws -> (SharedOwnerRecord, migrated: Bool) {
        if stored.count == secretByteCount {
            let state = validPairingStates.contains(legacyPairingState ?? "")
                ? legacyPairingState!
                : "unpaired"
            return (try SharedOwnerRecord(secret: stored, pairingState: state), true)
        }
        return (try decode(stored), false)
    }
}

struct OwnerSecretsKeychain {
    private let service: String
    private let byteCount = SharedOwnerRecord.secretByteCount

    init(service: String = "app.verelle.owner-secrets") {
        self.service = service
    }

    func loadOrCreateDeviceOwner() throws -> Data {
        if let stored = try load(.deviceOwner) {
            guard stored.count == byteCount else { throw OwnerSecretsError.invalidSecret }
            return stored
        }

        var bytes = Data(count: byteCount)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, byteCount, buffer.baseAddress!)
        }
        guard status == errSecSuccess else { throw OwnerSecretsError.keychain(status) }
        try save(bytes, for: .deviceOwner)
        return bytes
    }

    func loadSharedOwnerRecord() throws -> SharedOwnerRecord {
        if let stored = try load(.sharedOwner) {
            let legacyState = try loadLegacyPairingState()
            let (record, migrated) = try SharedOwnerRecord.fromStored(
                stored,
                legacyPairingState: legacyState
            )
            if migrated {
                try save(record.encode(), for: .sharedOwner)
                try delete(.pairingState)
            }
            return record
        }

        var bytes = Data(count: byteCount)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, byteCount, buffer.baseAddress!)
        }
        guard status == errSecSuccess else { throw OwnerSecretsError.keychain(status) }
        let record = try SharedOwnerRecord(secret: bytes, pairingState: "unpaired")
        try save(record.encode(), for: .sharedOwner)
        return record
    }

    func replaceSharedOwner(_ secret: Data) throws {
        let currentState = (try? loadSharedOwnerRecord().pairingState) ?? "unpaired"
        try save(try SharedOwnerRecord(secret: secret, pairingState: currentState).encode(), for: .sharedOwner)
    }

    func joinSharedOwner(_ secret: Data) throws {
        try save(try SharedOwnerRecord(secret: secret, pairingState: "shared").encode(), for: .sharedOwner)
    }

    func setPairingState(_ value: String) throws {
        let current = try loadSharedOwnerRecord()
        try save(
            try SharedOwnerRecord(secret: current.secret, pairingState: value).encode(),
            for: .sharedOwner
        )
    }

    func seedLegacySharedOwner(_ secret: Data, pairingState: String?) throws {
        guard secret.count == byteCount else { throw OwnerSecretsError.invalidSecret }
        try save(secret, for: .sharedOwner)
        if let pairingState, let data = pairingState.data(using: .utf8) {
            try save(data, for: .pairingState)
        } else {
            try delete(.pairingState)
        }
    }

    func deleteAll() throws {
        try delete(.deviceOwner)
        try delete(.sharedOwner)
        try delete(.pairingState)
    }

    private func loadLegacyPairingState() throws -> String? {
        guard let stored = try load(.pairingState) else { return nil }
        return String(data: stored, encoding: .utf8)
    }

    private func load(_ key: OwnerSecretKey) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw OwnerSecretsError.keychain(status)
        }
        return data
    }

    private func save(_ secret: Data, for key: OwnerSecretKey) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        let attributes: [String: Any] = [kSecValueData as String: secret]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw OwnerSecretsError.keychain(updateStatus)
        }

        var add = query
        add[kSecValueData as String] = secret
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(add as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw OwnerSecretsError.keychain(addStatus) }
    }

    private func delete(_ key: OwnerSecretKey) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound { return }
        throw OwnerSecretsError.keychain(status)
    }
}

@objc(OwnerSecretsPlugin)
final class OwnerSecretsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "OwnerSecretsPlugin"
    let jsName = "OwnerSecrets"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadOrCreate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replaceSharedOwner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "joinSharedOwner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPairingState", returnType: CAPPluginReturnPromise),
    ]

    private let keychain = OwnerSecretsKeychain()

    @objc func loadOrCreate(_ call: CAPPluginCall) {
        do {
            let deviceOwner = try keychain.loadOrCreateDeviceOwner()
            let sharedOwner = try keychain.loadSharedOwnerRecord()
            call.resolve([
                "deviceOwner": deviceOwner.base64EncodedString(),
                "sharedOwner": sharedOwner.secret.base64EncodedString(),
                "pairingState": sharedOwner.pairingState,
            ])
        } catch {
            call.reject("Owner secrets are unavailable.", "KEYCHAIN_ERROR")
        }
    }

    @objc func replaceSharedOwner(_ call: CAPPluginCall) {
        guard
            let encoded = call.getString("sharedOwner"),
            let secret = Data(base64Encoded: encoded)
        else {
            call.reject("The Shared owner is invalid.", "INVALID_OWNER")
            return
        }

        do {
            try keychain.replaceSharedOwner(secret)
            call.resolve()
        } catch {
            call.reject("The Shared owner could not be saved.", "KEYCHAIN_ERROR")
        }
    }

    @objc func joinSharedOwner(_ call: CAPPluginCall) {
        guard
            let encoded = call.getString("sharedOwner"),
            let secret = Data(base64Encoded: encoded)
        else {
            call.reject("The Shared owner is invalid.", "INVALID_OWNER")
            return
        }

        do {
            try keychain.joinSharedOwner(secret)
            call.resolve()
        } catch {
            call.reject("The Shared owner could not be saved.", "KEYCHAIN_ERROR")
        }
    }

    @objc func setPairingState(_ call: CAPPluginCall) {
        guard
            let value = call.getString("pairingState"),
            SharedOwnerRecord.validPairingStates.contains(value)
        else {
            call.reject("Pairing state is invalid.", "INVALID_OWNER")
            return
        }

        do {
            try keychain.setPairingState(value)
            call.resolve()
        } catch {
            call.reject("Pairing state could not be saved.", "KEYCHAIN_ERROR")
        }
    }
}

final class VerelleBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(OwnerSecretsPlugin())
    }
}
