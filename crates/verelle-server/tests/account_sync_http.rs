use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header::AUTHORIZATION},
};
use chrono::NaiveDate;
use http_body_util::BodyExt;
use p256::{
    ecdsa::{Signature, SigningKey, signature::Signer},
    pkcs8::EncodePublicKey,
};
use rand::rngs::OsRng;
use serde::{Serialize, de::DeserializeOwned};
use sha2::{Digest, Sha256};
use sqlx_core::{query::query, row::Row};
use sqlx_postgres::Postgres;
use std::{env, time::Duration};
use tower::ServiceExt;
use uuid::Uuid;
use verelle_api::{
    AccountDeletionResponse, ApiErrorBody, CoupleInviteCreateRequest, CoupleInviteCreateResponse,
    CoupleInviteRedeemRequest, CoupleInviteRedeemResponse, DatasetUnlinkRequest,
    DatasetUnlinkResponse, HEALTH_DATA_CONSENT_VERSION, HealthDataConsent, LoginFinishRequest,
    LoginFinishResponse, LoginStartRequest, LoginStartResponse, OpaqueMessage, PullResponse,
    PushRequest, PushResponse, RegistrationFinishRequest, RegistrationFinishResponse,
    RegistrationStartRequest, RegistrationStartResponse, TransportOperation,
    dataset_operations_path, login_device_proof_message, registration_device_proof_message,
};
use verelle_auth::{
    account_credential_identifier, client_login_finish, client_login_start,
    client_registration_finish, client_registration_start, derive_account_wrapping_key,
    generate_server_setup,
};
use verelle_core::{CycleStartBasis, Observation, ObservationValue, VersionStamp};
use verelle_crypto::{RecoveryCode, SecretKey, recovery_public_key, wrap_secret_key};
use verelle_server::{
    accounts::{AuthService, account_router},
    database::Database,
    http_api::authenticated_sync_router,
    relay::PostgresRelay,
};
use verelle_sync::{PlainOperation, decrypt_operation, encrypt_operation};

static DATABASE_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn post_json<T: Serialize, R: DeserializeOwned>(
    router: &Router,
    uri: &str,
    bearer: Option<&str>,
    body: &T,
) -> (StatusCode, R) {
    let mut builder = Request::builder()
        .method("POST")
        .uri(uri)
        .header("content-type", "application/json");
    if let Some(bearer) = bearer {
        builder = builder.header(AUTHORIZATION, format!("Bearer {bearer}"));
    }
    let response = router
        .clone()
        .oneshot(
            builder
                .body(Body::from(serde_json::to_vec(body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
#[ignore = "requires an isolated TEST_DATABASE_URL"]
#[allow(clippy::too_many_lines)] // One linear two-account protocol transcript is easiest to audit.
async fn couple_invite_redeems_once_and_discards_only_a_pristine_joiner_dataset() {
    let _database_guard = DATABASE_TEST_LOCK.lock().await;
    let database_url = env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL is required");
    let database = Database::connect(&database_url, 4, Duration::from_secs(2))
        .await
        .unwrap();
    database.migrate().await.unwrap();
    query::<Postgres>(
        "TRUNCATE couple_invites, deletion_manifest_datasets, deletion_manifests, \
         account_consents, auth_start_attempts, opaque_auth_flows, account_sessions, \
         dataset_key_wraps, dataset_memberships, account_devices, accounts, \
         encrypted_operations, sync_datasets CASCADE",
    )
    .execute(database.pool())
    .await
    .unwrap();

    let owner_account = Uuid::new_v4();
    let owner_device = Uuid::new_v4();
    let owner_dataset = Uuid::new_v4();
    let partner_account = Uuid::new_v4();
    let partner_device = Uuid::new_v4();
    let partner_dataset = Uuid::new_v4();
    let owner_token = [11_u8; 32];
    let partner_token = [12_u8; 32];
    let owner_bearer = OpaqueMessage::from_bytes(&owner_token).message;
    let partner_bearer = OpaqueMessage::from_bytes(&partner_token).message;

    for (account_id, identifier) in [(owner_account, [21_u8; 32]), (partner_account, [22_u8; 32])] {
        query::<Postgres>(
            "INSERT INTO accounts (account_id, identifier_hash, opaque_password_file, \
             wrapped_account_key, recovery_wrapped_account_key) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(account_id)
        .bind(identifier.as_slice())
        .bind([1_u8].as_slice())
        .bind([2_u8].as_slice())
        .bind([3_u8].as_slice())
        .execute(database.pool())
        .await
        .unwrap();
    }
    for (device_id, account_id) in [
        (owner_device, owner_account),
        (partner_device, partner_account),
    ] {
        query::<Postgres>(
            "INSERT INTO account_devices (device_id, account_id, public_key) \
             VALUES ($1, $2, $3)",
        )
        .bind(device_id)
        .bind(account_id)
        .bind([4_u8].as_slice())
        .execute(database.pool())
        .await
        .unwrap();
    }
    for (dataset_id, account_id) in [
        (owner_dataset, owner_account),
        (partner_dataset, partner_account),
    ] {
        query::<Postgres>("INSERT INTO sync_datasets (dataset_id, current_epoch) VALUES ($1, 1)")
            .bind(dataset_id)
            .execute(database.pool())
            .await
            .unwrap();
        query::<Postgres>(
            "INSERT INTO dataset_memberships (dataset_id, account_id, role) \
             VALUES ($1, $2, 'owner')",
        )
        .bind(dataset_id)
        .bind(account_id)
        .execute(database.pool())
        .await
        .unwrap();
        query::<Postgres>(
            "INSERT INTO dataset_key_wraps (dataset_id, account_id, key_epoch, wrapped_key) \
             VALUES ($1, $2, 1, $3)",
        )
        .bind(dataset_id)
        .bind(account_id)
        .bind([5_u8].as_slice())
        .execute(database.pool())
        .await
        .unwrap();
    }
    for (account_id, device_id, token) in [
        (owner_account, owner_device, owner_token),
        (partner_account, partner_device, partner_token),
    ] {
        query::<Postgres>(
            "INSERT INTO account_sessions \
             (session_id, account_id, device_id, token_hash, expires_at) \
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + INTERVAL '1 hour')",
        )
        .bind(Uuid::new_v4())
        .bind(account_id)
        .bind(device_id)
        .bind(Sha256::digest(token).as_slice())
        .execute(database.pool())
        .await
        .unwrap();
    }

    let router =
        account_router(AuthService::new(database.clone(), generate_server_setup()).unwrap());
    let invite_id = Uuid::new_v4();
    let verifier = [33_u8; 32];
    let create_request = CoupleInviteCreateRequest {
        invite_id,
        dataset_id: owner_dataset,
        verifier: OpaqueMessage::from_bytes(&verifier),
    };
    let (status, created): (_, CoupleInviteCreateResponse) = post_json(
        &router,
        verelle_api::COUPLE_INVITES_PATH,
        Some(&owner_bearer),
        &create_request,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(created.dataset_id, owner_dataset);

    let redeem_request = CoupleInviteRedeemRequest {
        invite_id,
        verifier: OpaqueMessage::from_bytes(&verifier),
        wrapped_dataset_key: OpaqueMessage::from_bytes(&[44_u8; 64]),
    };
    let (status, redeemed): (_, CoupleInviteRedeemResponse) = post_json(
        &router,
        verelle_api::COUPLE_INVITE_REDEEM_PATH,
        Some(&partner_bearer),
        &redeem_request,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(redeemed.dataset_id, owner_dataset);
    assert_eq!(redeemed.key_epoch, 1);
    let (status, retry): (_, CoupleInviteRedeemResponse) = post_json(
        &router,
        verelle_api::COUPLE_INVITE_REDEEM_PATH,
        Some(&partner_bearer),
        &redeem_request,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(retry, redeemed);

    let members = query::<Postgres>(
        "SELECT COUNT(*)::BIGINT AS count FROM dataset_memberships \
         WHERE dataset_id = $1 AND removed_at IS NULL",
    )
    .bind(owner_dataset)
    .fetch_one(database.pool())
    .await
    .unwrap()
    .get::<i64, _>("count");
    assert_eq!(members, 2);
    let old_dataset = query::<Postgres>(
        "SELECT COUNT(*)::BIGINT AS count FROM sync_datasets WHERE dataset_id = $1",
    )
    .bind(partner_dataset)
    .fetch_one(database.pool())
    .await
    .unwrap()
    .get::<i64, _>("count");
    assert_eq!(old_dataset, 0);
    let stored_verifier =
        query::<Postgres>("SELECT verifier_hash FROM couple_invites WHERE invite_id = $1")
            .bind(invite_id)
            .fetch_one(database.pool())
            .await
            .unwrap()
            .get::<Vec<u8>, _>("verifier_hash");
    assert_eq!(stored_verifier, Sha256::digest(verifier).as_slice());
    assert_ne!(stored_verifier, verifier);

    let unlink_request = DatasetUnlinkRequest {
        request_id: Uuid::new_v4(),
        dataset_id: owner_dataset,
        expected_epoch: 1,
        wrapped_dataset_key: OpaqueMessage::from_bytes(&[71_u8; 64]),
    };
    let (status, unlinked): (_, DatasetUnlinkResponse) = post_json(
        &router,
        verelle_api::DATASET_UNLINK_PATH,
        Some(&owner_bearer),
        &unlink_request,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(unlinked.key_epoch, 2);
    assert_eq!(unlinked.departed_account_id, partner_account);
    let (status, retry): (_, DatasetUnlinkResponse) = post_json(
        &router,
        verelle_api::DATASET_UNLINK_PATH,
        Some(&owner_bearer),
        &unlink_request,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(retry, unlinked);

    let state = query::<Postgres>(
        "SELECT current_epoch, rotation_barrier_sequence, \
         (SELECT COUNT(*)::BIGINT FROM dataset_memberships membership \
          WHERE membership.dataset_id = sync_datasets.dataset_id AND removed_at IS NULL) AS members \
         FROM sync_datasets WHERE dataset_id = $1",
    )
    .bind(owner_dataset)
    .fetch_one(database.pool())
    .await
    .unwrap();
    assert_eq!(state.get::<i64, _>("current_epoch"), 2);
    assert_eq!(state.get::<i64, _>("members"), 1);
    assert_eq!(state.get::<i64, _>("rotation_barrier_sequence"), 0);
    let partner_active_sessions = query::<Postgres>(
        "SELECT COUNT(*)::BIGINT AS count FROM account_sessions \
         WHERE account_id = $1 AND revoked_at IS NULL",
    )
    .bind(partner_account)
    .fetch_one(database.pool())
    .await
    .unwrap()
    .get::<i64, _>("count");
    assert_eq!(partner_active_sessions, 0);
}

async fn delete_json<R: DeserializeOwned>(
    router: &Router,
    uri: &str,
    bearer: &str,
) -> (StatusCode, R) {
    let response = router
        .clone()
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(uri)
                .header(AUTHORIZATION, format!("Bearer {bearer}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
#[ignore = "requires an isolated TEST_DATABASE_URL"]
#[allow(clippy::too_many_lines)] // One linear protocol transcript is easier to audit intact.
async fn opaque_account_and_authenticated_http_sync_round_trip() {
    let _database_guard = DATABASE_TEST_LOCK.lock().await;
    let database_url = env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL is required");
    let database = Database::connect(&database_url, 4, Duration::from_secs(2))
        .await
        .unwrap();
    database.migrate().await.unwrap();
    query::<Postgres>(
        "TRUNCATE deletion_manifest_datasets, deletion_manifests, account_consents, \
         auth_start_attempts, \
         opaque_auth_flows, account_sessions, dataset_key_wraps, \
         dataset_memberships, account_devices, accounts, encrypted_operations, sync_datasets CASCADE",
    )
    .execute(database.pool())
    .await
    .unwrap();

    let server_setup = generate_server_setup();
    let auth = AuthService::new(database.clone(), server_setup).unwrap();
    let router = account_router(auth.clone()).merge(authenticated_sync_router(
        PostgresRelay::new(database.clone()),
        auth.clone(),
    ));
    let email = "founder@example.com";
    let password = b"correct horse battery staple";
    let credential_identifier = account_credential_identifier(email).unwrap();
    let device_signing_key = SigningKey::random(&mut OsRng);
    let device_public_key = device_signing_key
        .verifying_key()
        .to_public_key_der()
        .unwrap();
    let device_id = Uuid::new_v4();
    let dataset_id = Uuid::new_v4();

    let registration = client_registration_start(password).unwrap();
    let (status, registration_started): (_, RegistrationStartResponse) = post_json(
        &router,
        verelle_api::REGISTRATION_START_PATH,
        None,
        &RegistrationStartRequest {
            account_identifier: email.to_owned(),
            registration_request: OpaqueMessage::from_bytes(&registration.request),
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let registration_finished = client_registration_finish(
        &registration.state,
        password,
        &credential_identifier,
        &registration_started.registration_response.decode().unwrap(),
    )
    .unwrap();
    let wrapping_key = SecretKey::from_bytes(
        derive_account_wrapping_key(registration_finished.export_key.clone()).unwrap(),
    );
    let account_data_key = SecretKey::random();
    let dataset_key = SecretKey::random();
    let recovery_code = RecoveryCode::generate();
    let registration_proof = registration_device_proof_message(
        registration_started.flow_id,
        device_id,
        dataset_id,
        &registration_finished.upload,
    );
    let registration_signature: Signature = device_signing_key.sign(&registration_proof);
    let registration_finish_request = RegistrationFinishRequest {
        flow_id: registration_started.flow_id,
        device_id,
        dataset_id,
        registration_upload: OpaqueMessage::from_bytes(&registration_finished.upload),
        device_public_key: OpaqueMessage::from_bytes(device_public_key.as_bytes()),
        device_signature: OpaqueMessage::from_bytes(&registration_signature.to_bytes()),
        wrapped_account_key: OpaqueMessage::from_bytes(
            &wrap_secret_key(
                &wrapping_key,
                1,
                b"account/password-wrap",
                &account_data_key,
            )
            .unwrap()
            .to_bytes(),
        ),
        recovery_wrapped_account_key: OpaqueMessage::from_bytes(
            &wrap_secret_key(
                &recovery_code.wrapping_key().unwrap(),
                1,
                b"account/recovery-wrap",
                &account_data_key,
            )
            .unwrap()
            .to_bytes(),
        ),
        recovery_public_key: OpaqueMessage::from_bytes(
            &recovery_public_key(&account_data_key).unwrap(),
        ),
        wrapped_dataset_key: OpaqueMessage::from_bytes(
            &wrap_secret_key(&account_data_key, 1, b"dataset/account-wrap", &dataset_key)
                .unwrap()
                .to_bytes(),
        ),
        health_data_consent: HealthDataConsent {
            policy_version: HEALTH_DATA_CONSENT_VERSION.to_owned(),
            affirmative: true,
        },
    };
    let mut invalid_device_proof = registration_finish_request.clone();
    invalid_device_proof.device_signature.message = OpaqueMessage::from_bytes(&[7_u8; 64]).message;
    let (status, _): (_, ApiErrorBody) = post_json(
        &router,
        verelle_api::REGISTRATION_FINISH_PATH,
        None,
        &invalid_device_proof,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let mut refused_consent = registration_finish_request.clone();
    refused_consent.health_data_consent.affirmative = false;
    let (status, _): (_, ApiErrorBody) = post_json(
        &router,
        verelle_api::REGISTRATION_FINISH_PATH,
        None,
        &refused_consent,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, account): (_, RegistrationFinishResponse) = post_json(
        &router,
        verelle_api::REGISTRATION_FINISH_PATH,
        None,
        &registration_finish_request,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(account.device_id, device_id);
    assert_eq!(account.dataset_id, dataset_id);

    let login = client_login_start(password).unwrap();
    let (status, login_started): (_, LoginStartResponse) = post_json(
        &router,
        verelle_api::LOGIN_START_PATH,
        None,
        &LoginStartRequest {
            account_identifier: email.to_owned(),
            device_id,
            credential_request: OpaqueMessage::from_bytes(&login.request),
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let login_finished = client_login_finish(
        &login.state,
        password,
        &credential_identifier,
        &login_started.credential_response.decode().unwrap(),
        &registration_finished.server_public_key,
    )
    .unwrap();
    let login_challenge = login_started.device_challenge.decode().unwrap();
    let login_proof = login_device_proof_message(login_started.flow_id, &login_challenge);
    let login_signature: Signature = device_signing_key.sign(&login_proof);
    let (status, session): (_, LoginFinishResponse) = post_json(
        &router,
        verelle_api::LOGIN_FINISH_PATH,
        None,
        &LoginFinishRequest {
            flow_id: login_started.flow_id,
            credential_finalization: OpaqueMessage::from_bytes(&login_finished.finalization),
            device_id: account.device_id,
            device_signature: OpaqueMessage::from_bytes(&login_signature.to_bytes()),
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(session.account_id, account.account_id);
    let bearer = session.access_token.message;

    let repeated_start = RegistrationStartRequest {
        account_identifier: email.to_owned(),
        registration_request: OpaqueMessage::from_bytes(&registration.request),
    };
    for _ in 0..8 {
        let (status, _): (_, RegistrationStartResponse) = post_json(
            &router,
            verelle_api::REGISTRATION_START_PATH,
            None,
            &repeated_start,
        )
        .await;
        assert_eq!(status, StatusCode::OK);
    }
    let (status, _): (_, ApiErrorBody) = post_json(
        &router,
        verelle_api::REGISTRATION_START_PATH,
        None,
        &repeated_start,
    )
    .await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);

    let operation = PlainOperation::upsert(Observation {
        id: Uuid::new_v4(),
        date: NaiveDate::from_ymd_opt(2026, 7, 19).unwrap(),
        value: ObservationValue::CycleStart {
            cycle_id: Uuid::new_v4(),
            basis: CycleStartBasis::Menses,
            method_cycle_number: Some(1),
            postpartum_cycle_number: None,
        },
        recorded_by: account.device_id.to_string(),
        version: VersionStamp::new(1, 0, account.device_id.to_string()),
    });
    let encrypted = encrypt_operation(&dataset_key, 1, account.dataset_id, &operation).unwrap();
    let operations_path = dataset_operations_path(account.dataset_id);
    let (status, pushed): (_, PushResponse) = post_json(
        &router,
        &operations_path,
        Some(&bearer),
        &PushRequest {
            operations: vec![TransportOperation::from_transport(&encrypted)],
        },
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(pushed.accepted[0].server_sequence, 1);

    let response = router
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("{operations_path}?after=0&limit=100"))
                .header(AUTHORIZATION, format!("Bearer {bearer}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let page: PullResponse =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let transport_page = page.into_transport_page().unwrap();
    assert_eq!(transport_page.next_cursor, 1);
    assert_eq!(
        decrypt_operation(
            &dataset_key,
            account.dataset_id,
            &transport_page.operations[0].operation,
        )
        .unwrap(),
        operation
    );

    let (status, deletion): (_, AccountDeletionResponse) =
        delete_json(&router, verelle_api::CURRENT_ACCOUNT_PATH, &bearer).await;
    assert_eq!(status, StatusCode::OK);
    assert!(!deletion.deletion_id.is_nil());
    let deletion_datasets = query::<Postgres>(
        "SELECT COUNT(*)::BIGINT AS count FROM deletion_manifest_datasets \
         WHERE deletion_id = $1 AND dataset_id = $2",
    )
    .bind(deletion.deletion_id)
    .bind(dataset_id)
    .fetch_one(database.pool())
    .await
    .unwrap()
    .get::<i64, _>("count");
    assert_eq!(deletion_datasets, 1);
    let live_accounts = query::<Postgres>("SELECT COUNT(*)::BIGINT AS count FROM accounts")
        .fetch_one(database.pool())
        .await
        .unwrap()
        .get::<i64, _>("count");
    assert_eq!(live_accounts, 0);
    let live_datasets = query::<Postgres>("SELECT COUNT(*)::BIGINT AS count FROM sync_datasets")
        .fetch_one(database.pool())
        .await
        .unwrap()
        .get::<i64, _>("count");
    assert_eq!(live_datasets, 0);

    let response = router
        .oneshot(
            Request::builder()
                .uri(format!("{operations_path}?after=0&limit=100"))
                .header(AUTHORIZATION, format!("Bearer {bearer}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
