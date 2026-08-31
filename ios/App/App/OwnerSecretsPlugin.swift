import Capacitor
import Foundation
import Security

private enum OwnerSecretKey: String {
    case deviceOwner
    case sharedOwner
    case pairingState
}

private enum OwnerSecretsError: Error {
    case keychain(OSStatus)
    case invalidSecret
}

private struct OwnerSecretsKeychain {
    private let service = "app.verelle.owner-secrets"
    private let byteCount = 32

    func loadOrCreate(_ key: OwnerSecretKey) throws -> Data {
        if let stored = try load(key) {
            guard stored.count == byteCount else { throw OwnerSecretsError.invalidSecret }
            return stored
        }

        var bytes = Data(count: byteCount)
        let status = bytes.withUnsafeMutableBytes { buffer in
            SecRandomCopyBytes(kSecRandomDefault, byteCount, buffer.baseAddress!)
        }
        guard status == errSecSuccess else { throw OwnerSecretsError.keychain(status) }
        try save(bytes, for: key)
        return bytes
    }

    func replaceSharedOwner(_ secret: Data) throws {
        guard secret.count == byteCount else { throw OwnerSecretsError.invalidSecret }
        try save(secret, for: .sharedOwner)
    }

    func joinSharedOwner(_ secret: Data) throws {
        guard secret.count == byteCount else { throw OwnerSecretsError.invalidSecret }
        try save(secret, for: .sharedOwner)
        try savePairingState("shared")
    }

    func loadPairingState() throws -> String {
        guard let stored = try load(.pairingState) else { return "unpaired" }
        guard let value = String(data: stored, encoding: .utf8), value == "shared" else {
            return "unpaired"
        }
        return value
    }

    func savePairingState(_ value: String) throws {
        guard let data = value.data(using: .utf8) else { throw OwnerSecretsError.invalidSecret }
        try save(data, for: .pairingState)
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
}

@objc(OwnerSecretsPlugin)
final class OwnerSecretsPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "OwnerSecretsPlugin"
    let jsName = "OwnerSecrets"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadOrCreate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "replaceSharedOwner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "joinSharedOwner", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markShared", returnType: CAPPluginReturnPromise),
    ]

    private let keychain = OwnerSecretsKeychain()

    @objc func loadOrCreate(_ call: CAPPluginCall) {
        do {
            let deviceOwner = try keychain.loadOrCreate(.deviceOwner)
            let sharedOwner = try keychain.loadOrCreate(.sharedOwner)
            call.resolve([
                "deviceOwner": deviceOwner.base64EncodedString(),
                "sharedOwner": sharedOwner.base64EncodedString(),
                "pairingState": try keychain.loadPairingState(),
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

    @objc func markShared(_ call: CAPPluginCall) {
        do {
            try keychain.savePairingState("shared")
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
