import Foundation
import Security

struct MobileEnrollment: Codable, Equatable, Sendable {
    var datasetID: String
    var bearerToken: String
    var expiresAt: Int64
    var email: String
    var deviceID: String
    var serverPublicKey: Data

    var hasActiveSession: Bool {
        !bearerToken.isEmpty && expiresAt > Int64(Date().timeIntervalSince1970)
    }
}

struct RegistrationResult: Sendable {
    let enrollment: MobileEnrollment
    let recoveryCode: String
}

struct CoupleAcceptanceResult: Sendable {
    let enrollment: MobileEnrollment
    let datasetKey: Data
}

private struct PendingMobileRecovery: Codable, Sendable {
    let finishBody: Data
    let enrollment: MobileEnrollment
    let recoveryCode: String
    let datasetKey: Data
    let localAccountKeyWrap: Data
}

struct PendingMobileRedaction: Codable, Sendable {
    let date: String
    let markerRaw: String
    let operationIDs: [String]
}

enum MobileServiceError: LocalizedError {
    case invalidInput(String)
    case rejected(Int, String)
    case invalidResponse
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case let .invalidInput(message): message
        case let .rejected(status, message): "Verelle service rejected the request (HTTP \(status): \(message))"
        case .invalidResponse: "Verelle service returned an invalid response"
        case let .keychain(status): "Secure account storage failed (\(status))"
        }
    }
}

final class EnrollmentKeychain: @unchecked Sendable {
    private let account = "mobile-enrollment-v1"

    func load() throws -> MobileEnrollment? {
        guard let data = try read(service: Self.service, account: account) else { return nil }
        return try JSONDecoder().decode(MobileEnrollment.self, from: data)
    }

    func save(_ enrollment: MobileEnrollment) throws {
        try replace(
            service: Self.service,
            account: account,
            data: try JSONEncoder().encode(enrollment),
            accessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        )
    }

    func clear() throws {
        let status = SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.service,
            kSecAttrAccount as String: account,
        ] as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw MobileServiceError.keychain(status)
        }
    }

    private static let service = "app.verelle.mobile.account"
}

private final class PendingRecoveryKeychain: @unchecked Sendable {
    private let account = "pending-mobile-recovery-v1"
    private let service = "app.verelle.mobile.account"

    func load() throws -> PendingMobileRecovery? {
        guard let data = try read(service: service, account: account) else { return nil }
        return try JSONDecoder().decode(PendingMobileRecovery.self, from: data)
    }

    func save(_ pending: PendingMobileRecovery) throws {
        try replace(
            service: service,
            account: account,
            data: try JSONEncoder().encode(pending),
            accessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        )
    }

    func clear() throws {
        let status = SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ] as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw MobileServiceError.keychain(status)
        }
    }
}

final class PendingRedactionKeychain: @unchecked Sendable {
    private let account = "pending-redaction-v1"
    private let service = "app.verelle.mobile.account"

    func load() throws -> PendingMobileRedaction? {
        guard let data = try read(service: service, account: account) else { return nil }
        return try JSONDecoder().decode(PendingMobileRedaction.self, from: data)
    }

    func save(_ pending: PendingMobileRedaction) throws {
        try replace(
            service: service,
            account: account,
            data: try JSONEncoder().encode(pending),
            accessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        )
    }

    func clear() throws {
        let status = SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ] as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw MobileServiceError.keychain(status)
        }
    }
}

final class DeviceSigningIdentity: @unchecked Sendable {
    private let tag = Data("app.verelle.mobile.device-signing-v1".utf8)

    func publicKeySPKI() throws -> Data {
        let privateKey = try getOrCreate()
        guard
            let publicKey = SecKeyCopyPublicKey(privateKey),
            let raw = SecKeyCopyExternalRepresentation(publicKey, nil) as Data?,
            raw.count == 65
        else { throw MobileServiceError.invalidResponse }

        // ASN.1 SubjectPublicKeyInfo prefix for a P-256 uncompressed point.
        return Data([
            0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE,
            0x3D, 0x02, 0x01, 0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D,
            0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
        ]) + raw
    }

    func sign(_ message: Data) throws -> Data {
        let key = try getOrCreate()
        var error: Unmanaged<CFError>?
        guard let signature = SecKeyCreateSignature(
            key,
            .ecdsaSignatureMessageX962SHA256,
            message as CFData,
            &error
        ) as Data? else {
            if let error { throw error.takeRetainedValue() }
            throw MobileServiceError.invalidResponse
        }
        return signature
    }

    private func getOrCreate() throws -> SecKey {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: tag,
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecReturnRef as String: true,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess, let key = result as! SecKey? { return key }
        guard status == errSecItemNotFound else { throw MobileServiceError.keychain(status) }

        let attributes: [String: Any] = [
            kSecAttrKeyType as String: kSecAttrKeyTypeECSECPrimeRandom,
            kSecAttrKeySizeInBits as String: 256,
            kSecPrivateKeyAttrs as String: [
                kSecAttrIsPermanent as String: true,
                kSecAttrApplicationTag as String: tag,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            ],
        ]
        var error: Unmanaged<CFError>?
        guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
            if let error { throw error.takeRetainedValue() }
            throw MobileServiceError.invalidResponse
        }
        return key
    }
}

final class AccountSyncClient: @unchecked Sendable {
    private let origin = URL(string: "https://verelle.app")!
    private let identity = DeviceSigningIdentity()
    private let enrollmentStore = EnrollmentKeychain()
    private let recoveryStore = PendingRecoveryKeychain()

    func register(
        repository: LocalRepository,
        email: String,
        password: String,
        deviceID: String
    ) async throws -> RegistrationResult {
        try validate(password: password)
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard normalizedEmail.contains("@") else {
            throw MobileServiceError.invalidInput("Enter a valid email address")
        }
        var passwordData = Data(password.utf8)
        defer { passwordData.resetBytes(in: passwordData.indices) }
        let registration = try opaqueRegistrationStart(password: passwordData)
        let started = try await requestJSON(path: "/api/v1/accounts/opaque/start", body: [
            "account_identifier": normalizedEmail,
            "registration_request": opaque(registration.request),
        ])
        let flowID = try string(started, "flow_id")
        let response = try opaqueData(started, "registration_response")
        let material = try repository.finishAccountRegistration(
            state: registration.state,
            password: passwordData,
            accountIdentifier: normalizedEmail,
            registrationResponse: response
        )
        let datasetID = try repository.datasetId()
        let proof = try accountRegistrationDeviceProof(
            flowId: flowID,
            deviceId: deviceID,
            datasetId: datasetID,
            registrationUpload: material.registrationUpload
        )
        let publicKey = try identity.publicKeySPKI()
        let finished = try await requestJSON(path: "/api/v1/accounts/opaque/finish", body: [
            "flow_id": flowID,
            "device_id": deviceID,
            "dataset_id": datasetID,
            "registration_upload": opaque(material.registrationUpload),
            "device_public_key": opaque(publicKey),
            "device_signature": opaque(try identity.sign(proof)),
            "wrapped_account_key": opaque(material.wrappedAccountKey),
            "recovery_wrapped_account_key": opaque(material.recoveryWrappedAccountKey),
            "recovery_public_key": opaque(material.recoveryPublicKey),
            "wrapped_dataset_key": opaque(material.wrappedDatasetKey),
            "health_data_consent": ["policy_version": "2026-07-19", "affirmative": true],
        ])
        guard try string(finished, "device_id") == deviceID,
              try string(finished, "dataset_id") == datasetID else {
            throw MobileServiceError.invalidResponse
        }
        let base = MobileEnrollment(
            datasetID: datasetID,
            bearerToken: "",
            expiresAt: 0,
            email: normalizedEmail,
            deviceID: deviceID,
            serverPublicKey: material.serverPublicKey
        )
        let signedIn = try await login(enrollment: base, password: password)
        return RegistrationResult(enrollment: signedIn, recoveryCode: material.recoveryCode)
    }

    func login(enrollment: MobileEnrollment, password: String) async throws -> MobileEnrollment {
        try validate(password: password)
        var passwordData = Data(password.utf8)
        defer { passwordData.resetBytes(in: passwordData.indices) }
        let login = try opaqueLoginStart(password: passwordData)
        let started = try await requestJSON(path: "/api/v1/sessions/opaque/start", body: [
            "account_identifier": enrollment.email,
            "device_id": enrollment.deviceID,
            "credential_request": opaque(login.request),
        ])
        let flowID = try string(started, "flow_id")
        let finished = try opaqueLoginFinish(
            state: login.state,
            password: passwordData,
            accountIdentifier: enrollment.email,
            credentialResponse: try opaqueData(started, "credential_response"),
            expectedServerPublicKey: enrollment.serverPublicKey
        )
        let proof = try accountLoginDeviceProof(
            flowId: flowID,
            deviceChallenge: try opaqueData(started, "device_challenge")
        )
        let session = try await requestJSON(path: "/api/v1/sessions/opaque/finish", body: [
            "flow_id": flowID,
            "credential_finalization": opaque(finished.credentialFinalization),
            "device_id": enrollment.deviceID,
            "device_signature": opaque(try identity.sign(proof)),
        ])
        var updated = enrollment
        updated.bearerToken = try opaqueString(session, "access_token")
        updated.expiresAt = try integer(session, "expires_at_unix_seconds")
        return updated
    }

    func recover(
        repository: LocalRepository,
        email: String,
        recoveryCode: String,
        newPassword: String,
        deviceID: String
    ) async throws -> RegistrationResult {
        guard try repository.isPristine(), try recoveryStore.load() == nil else {
            throw MobileServiceError.invalidInput(
                "Recovery requires an empty local chart and no unfinished recovery"
            )
        }
        try validate(password: newPassword)
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        var passwordData = Data(newPassword.utf8)
        defer { passwordData.resetBytes(in: passwordData.indices) }
        let registration = try opaqueRegistrationStart(password: passwordData)
        let started = try await requestJSON(path: "/api/v1/recoveries/opaque/start", body: [
            "account_identifier": normalizedEmail,
            "registration_request": opaque(registration.request),
        ])
        let flowID = try string(started, "flow_id")
        let datasetID = try string(started, "dataset_id")
        let publicKey = try identity.publicKeySPKI()
        let material = try opaqueAccountRecoveryFinish(
            state: registration.state,
            password: passwordData,
            accountIdentifier: normalizedEmail,
            registrationResponse: try opaqueData(started, "registration_response"),
            recoveryCode: recoveryCode,
            recoveryWrappedAccountKey: try opaqueData(started, "recovery_wrapped_account_key"),
            wrappedDatasetKey: try opaqueData(started, "wrapped_dataset_key"),
            flowId: flowID,
            deviceId: deviceID,
            datasetId: datasetID,
            recoveryChallenge: try opaqueData(started, "recovery_challenge"),
            devicePublicKey: publicKey
        )
        let deviceProof = try accountRegistrationDeviceProof(
            flowId: flowID,
            deviceId: deviceID,
            datasetId: datasetID,
            registrationUpload: material.registrationUpload
        )
        let body: [String: Any] = [
            "flow_id": flowID,
            "device_id": deviceID,
            "dataset_id": datasetID,
            "registration_upload": opaque(material.registrationUpload),
            "device_public_key": opaque(publicKey),
            "device_signature": opaque(try identity.sign(deviceProof)),
            "recovery_signature": opaque(material.recoverySignature),
            "wrapped_account_key": opaque(material.wrappedAccountKey),
            "recovery_wrapped_account_key": opaque(material.recoveryWrappedAccountKey),
            "wrapped_dataset_key": opaque(material.wrappedDatasetKey),
        ]
        let base = MobileEnrollment(
            datasetID: datasetID,
            bearerToken: "",
            expiresAt: 0,
            email: normalizedEmail,
            deviceID: deviceID,
            serverPublicKey: material.serverPublicKey
        )
        let pending = PendingMobileRecovery(
            finishBody: try JSONSerialization.data(withJSONObject: body),
            enrollment: base,
            recoveryCode: material.recoveryCode,
            datasetKey: material.recoveredDatasetKey,
            localAccountKeyWrap: material.localAccountKeyWrap
        )
        try recoveryStore.save(pending)
        let recovered = try await finishRecovery(repository: repository, pending: pending)
        let signedIn = (try? await login(enrollment: recovered.enrollment, password: newPassword))
            ?? recovered.enrollment
        try enrollmentStore.save(signedIn)
        return RegistrationResult(enrollment: signedIn, recoveryCode: recovered.recoveryCode)
    }

    func resumeRecovery(repository: LocalRepository) async throws -> RegistrationResult? {
        guard let pending = try recoveryStore.load() else { return nil }
        return try await finishRecovery(repository: repository, pending: pending)
    }

    func sync(repository: LocalRepository, enrollment: MobileEnrollment) async throws -> (Int, Int) {
        guard enrollment.hasActiveSession else {
            throw MobileServiceError.invalidInput("Sign in again to synchronize")
        }
        let initial = try repository.syncBatch(maxOperations: 100)
        guard initial.datasetId == enrollment.datasetID else {
            throw MobileServiceError.invalidInput("The local chart does not match this account")
        }
        var pulled = try await pullAll(repository: repository, enrollment: enrollment, after: initial.afterCursor)
        var pushed = 0
        for _ in 0..<100 {
            let batch = try repository.syncBatch(maxOperations: 100)
            guard !batch.operations.isEmpty else { return (pushed, pulled) }
            let operations = batch.operations.map { operation in
                [
                    "operation_id": operation.operationId,
                    "key_epoch": operation.keyEpoch,
                    "envelope": operation.envelopeBase64url,
                ] as [String: Any]
            }
            let response = try await requestJSON(
                path: "/api/v1/datasets/\(enrollment.datasetID)/operations",
                body: ["operations": operations],
                bearer: enrollment.bearerToken
            )
            guard let acceptedRows = response["accepted"] as? [[String: Any]] else {
                throw MobileServiceError.invalidResponse
            }
            let accepted = try acceptedRows.map { try string($0, "operation_id") }
            guard Set(accepted) == Set(batch.operations.map(\.operationId)),
                  accepted.count == batch.operations.count else {
                throw MobileServiceError.invalidResponse
            }
            try repository.acknowledgePushed(operationIds: accepted)
            pushed += accepted.count
            let cursor = try repository.syncBatch(maxOperations: 1).afterCursor
            pulled += try await pullAll(repository: repository, enrollment: enrollment, after: cursor)
        }
        throw MobileServiceError.invalidResponse
    }

    func createCoupleInvite(
        repository: LocalRepository,
        enrollment: MobileEnrollment
    ) async throws -> String {
        let invite = try repository.createCoupleInvite()
        let response = try await requestJSON(path: "/api/v1/couple-invites", body: [
            "invite_id": invite.inviteId,
            "dataset_id": invite.datasetId,
            "verifier": ["message": invite.verifierBase64url],
        ], bearer: enrollment.bearerToken)
        guard try string(response, "invite_id") == invite.inviteId else {
            throw MobileServiceError.invalidResponse
        }
        return invite.inviteCode
    }

    func redact(
        operationIDs: [String],
        enrollment: MobileEnrollment
    ) async throws {
        for start in stride(from: 0, to: operationIDs.count, by: 100) {
            let end = min(start + 100, operationIDs.count)
            _ = try await requestJSON(
                path: "/api/v1/datasets/\(enrollment.datasetID)/operation-redactions",
                body: ["operation_ids": Array(operationIDs[start..<end])],
                bearer: enrollment.bearerToken
            )
        }
    }

    func acceptCoupleInvite(
        repository: LocalRepository,
        enrollment: MobileEnrollment,
        code: String
    ) async throws -> CoupleAcceptanceResult {
        guard try repository.isPristine() else {
            throw MobileServiceError.invalidInput("An invite can only replace an empty local chart")
        }
        let material = try repository.prepareCoupleInviteAcceptance(inviteCode: code)
        let response = try await requestJSON(path: "/api/v1/couple-invites/redeem", body: [
            "invite_id": material.inviteId,
            "verifier": ["message": material.verifierBase64url],
            "wrapped_dataset_key": opaque(material.wrappedDatasetKey),
        ], bearer: enrollment.bearerToken)
        guard try string(response, "dataset_id") == material.datasetId else {
            throw MobileServiceError.invalidResponse
        }
        try repository.adoptRecoveredDataset(
            keyMaterial: material.recoveredDatasetKey,
            datasetId: material.datasetId
        )
        var updated = enrollment
        updated.datasetID = material.datasetId
        return CoupleAcceptanceResult(enrollment: updated, datasetKey: material.recoveredDatasetKey)
    }

    func logout(enrollment: MobileEnrollment) async throws {
        _ = try await requestJSON(
            method: "DELETE",
            path: "/api/v1/sessions/current",
            body: nil,
            bearer: enrollment.bearerToken,
            expectedEmpty: true
        )
    }

    func deleteAccount(enrollment: MobileEnrollment) async throws -> String {
        let response = try await requestJSON(
            method: "DELETE",
            path: "/api/v1/accounts/current",
            body: nil,
            bearer: enrollment.bearerToken
        )
        return try string(response, "deletion_id")
    }

    private func finishRecovery(
        repository: LocalRepository,
        pending: PendingMobileRecovery
    ) async throws -> RegistrationResult {
        if try repository.datasetId() != pending.enrollment.datasetID {
            try repository.adoptRecoveredAccount(
                keyMaterial: pending.datasetKey,
                datasetId: pending.enrollment.datasetID,
                localAccountKeyWrap: pending.localAccountKeyWrap
            )
        }
        try DatasetKeychain().replace(pending.datasetKey)
        guard let body = try JSONSerialization.jsonObject(with: pending.finishBody) as? [String: Any] else {
            throw MobileServiceError.invalidResponse
        }
        let response = try await requestJSON(path: "/api/v1/recoveries/opaque/finish", body: body)
        guard try string(response, "dataset_id") == pending.enrollment.datasetID,
              try string(response, "device_id") == pending.enrollment.deviceID else {
            throw MobileServiceError.invalidResponse
        }
        try enrollmentStore.save(pending.enrollment)
        try recoveryStore.clear()
        return RegistrationResult(
            enrollment: pending.enrollment,
            recoveryCode: pending.recoveryCode
        )
    }

    private func pullAll(
        repository: LocalRepository,
        enrollment: MobileEnrollment,
        after: UInt64
    ) async throws -> Int {
        var cursor = after
        var pulled = 0
        for _ in 0..<100 {
            let response = try await requestJSON(
                method: "GET",
                path: "/api/v1/datasets/\(enrollment.datasetID)/operations?after=\(cursor)&limit=100",
                body: nil,
                bearer: enrollment.bearerToken
            )
            guard let rows = response["operations"] as? [[String: Any]] else {
                throw MobileServiceError.invalidResponse
            }
            let operations = try rows.map { row in
                guard let wire = row["operation"] as? [String: Any] else {
                    throw MobileServiceError.invalidResponse
                }
                return FfiSequencedTransportOperation(
                    serverSequence: try unsigned(row, "server_sequence"),
                    operation: FfiTransportOperation(
                        operationId: try string(wire, "operation_id"),
                        keyEpoch: try unsigned(wire, "key_epoch"),
                        envelopeBase64url: try string(wire, "envelope")
                    )
                )
            }
            let page = FfiPullPage(
                afterCursor: try unsigned(response, "after_cursor"),
                nextCursor: try unsigned(response, "next_cursor"),
                operations: operations,
                more: response["more"] as? Bool ?? false
            )
            try repository.applyPullPage(page: page)
            pulled += operations.count
            cursor = page.nextCursor
            if !page.more { return pulled }
        }
        throw MobileServiceError.invalidResponse
    }

    private func requestJSON(
        method: String = "POST",
        path: String,
        body: [String: Any]?,
        bearer: String? = nil,
        expectedEmpty: Bool = false
    ) async throws -> [String: Any] {
        guard let url = URL(string: path, relativeTo: origin) else {
            throw MobileServiceError.invalidInput("The service URL is invalid")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw MobileServiceError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = ((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?["error"] as? String
                ?? "request rejected"
            throw MobileServiceError.rejected(http.statusCode, message)
        }
        if expectedEmpty || data.isEmpty { return [:] }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw MobileServiceError.invalidResponse
        }
        return object
    }

    private func validate(password: String) throws {
        guard (12...1024).contains(password.count) else {
            throw MobileServiceError.invalidInput("Use a password between 12 and 1024 characters")
        }
    }
}

private func opaque(_ data: Data) -> [String: String] {
    ["message": data.base64URLEncodedString()]
}

private func string(_ object: [String: Any], _ key: String) throws -> String {
    guard let value = object[key] as? String, !value.isEmpty else {
        throw MobileServiceError.invalidResponse
    }
    return value
}

private func integer(_ object: [String: Any], _ key: String) throws -> Int64 {
    guard let value = object[key] as? NSNumber else { throw MobileServiceError.invalidResponse }
    return value.int64Value
}

private func unsigned(_ object: [String: Any], _ key: String) throws -> UInt64 {
    let value = try integer(object, key)
    guard value >= 0 else { throw MobileServiceError.invalidResponse }
    return UInt64(value)
}

private func opaqueData(_ object: [String: Any], _ key: String) throws -> Data {
    guard let nested = object[key] as? [String: Any] else { throw MobileServiceError.invalidResponse }
    return try Data(base64URL: string(nested, "message"))
}

private func opaqueString(_ object: [String: Any], _ key: String) throws -> String {
    guard let nested = object[key] as? [String: Any] else { throw MobileServiceError.invalidResponse }
    return try string(nested, "message")
}

private extension Data {
    init(base64URL: String) throws {
        var value = base64URL.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        value += String(repeating: "=", count: (4 - value.count % 4) % 4)
        guard let decoded = Data(base64Encoded: value) else { throw MobileServiceError.invalidResponse }
        self = decoded
    }

    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

private func read(service: String, account: String) throws -> Data? {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
        kSecReturnData as String: true,
        kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
        throw MobileServiceError.keychain(status)
    }
    return data
}

private func replace(service: String, account: String, data: Data, accessible: CFString) throws {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
    var insertion = query
    insertion[kSecValueData as String] = data
    insertion[kSecAttrAccessible as String] = accessible
    let status = SecItemAdd(insertion as CFDictionary, nil)
    guard status == errSecSuccess else { throw MobileServiceError.keychain(status) }
}
