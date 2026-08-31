import Capacitor
import Foundation
import Security

private enum OwnerSecretKey: String {
    case deviceOwner
    case sharedOwner
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
    ]

    private let keychain = OwnerSecretsKeychain()

    #if DEBUG
    // INTERIM (#13): the cross-platform acceptance harness hands one runtime-
    // generated Shared owner to both debug apps. This is not a product Pairing
    // path, is absent from release builds, and is deleted when #14 lands.
    private func interimSharedOwner() throws -> Data? {
        guard
            let encoded = ProcessInfo.processInfo.environment[
                "VERELLE_INTERIM_SHARED_OWNER"
            ]
        else { return nil }
        guard
            let secret = Data(base64Encoded: encoded),
            secret.count == 32
        else { throw OwnerSecretsError.invalidSecret }
        return secret
    }
    #endif

    @objc func loadOrCreate(_ call: CAPPluginCall) {
        do {
            let deviceOwner = try keychain.loadOrCreate(.deviceOwner)
            var sharedOwner = try keychain.loadOrCreate(.sharedOwner)
            #if DEBUG
            if let interim = try interimSharedOwner() {
                try keychain.replaceSharedOwner(interim)
                sharedOwner = interim
            }
            #endif
            call.resolve([
                "deviceOwner": deviceOwner.base64EncodedString(),
                "sharedOwner": sharedOwner.base64EncodedString(),
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
}

final class VerelleBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(OwnerSecretsPlugin())
    }
}
