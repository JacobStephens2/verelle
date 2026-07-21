use chrono::NaiveDate;
use tempfile::NamedTempFile;
use uuid::Uuid;
use verelle_core::{BleedingIntensity, Observation, ObservationValue, VersionStamp};
use verelle_crypto::SecretKey;
use verelle_store::{RemoteOperation, RemotePage, Store};
use verelle_sync::{
    BlindRelay, OperationMutation, PlainOperation, RelayError, TransportOp, decrypt_operation,
    encrypt_operation,
};

fn upsert(
    date: NaiveDate,
    value: ObservationValue,
    device: &str,
    physical_ms: i64,
) -> PlainOperation {
    PlainOperation::upsert(Observation {
        id: Uuid::new_v4(),
        date,
        value,
        recorded_by: device.to_owned(),
        version: VersionStamp::new(physical_ms, 0, device),
    })
}

fn append(
    store: &mut Store,
    key: &SecretKey,
    epoch: u64,
    couple_id: Uuid,
    operation: &PlainOperation,
) -> TransportOp {
    let transport = encrypt_operation(key, epoch, couple_id, operation).unwrap();
    store.append_local(operation, &transport).unwrap();
    transport
}

fn pull_all(store: &mut Store, keyring: &[(u64, &SecretKey)], couple_id: Uuid, relay: &BlindRelay) {
    loop {
        let page = relay.pull(store.cursor().unwrap(), 100).unwrap();
        let more = page.more;
        let operations = page
            .operations
            .into_iter()
            .map(|sequenced| {
                let key = keyring
                    .iter()
                    .find_map(|(epoch, key)| {
                        (*epoch == sequenced.operation.key_epoch).then_some(*key)
                    })
                    .expect("test keyring contains every historical epoch");
                RemoteOperation {
                    server_seq: sequenced.server_seq,
                    operation: decrypt_operation(key, couple_id, &sequenced.operation).unwrap(),
                }
            })
            .collect();
        store
            .apply_remote_page(RemotePage {
                after_cursor: page.after_cursor,
                next_cursor: page.next_cursor,
                operations,
            })
            .unwrap();
        if !more {
            break;
        }
    }
}

fn push_all(store: &mut Store, relay: &mut BlindRelay) {
    let pending = store.pending_outbox(100).unwrap();
    let ids: Vec<_> = pending.iter().map(|operation| operation.op_id).collect();
    for operation in pending {
        relay.push(operation).unwrap();
    }
    store.acknowledge_pushed(&ids).unwrap();
}

#[test]
fn three_devices_converge_after_offline_edits_delete_and_response_loss() {
    let date = NaiveDate::from_ymd_opt(2026, 7, 20).unwrap();
    let couple_id = Uuid::new_v4();
    let key = SecretKey::random();
    let mut relay = BlindRelay::new(1);
    let mut first = Store::open_in_memory().unwrap();
    let mut second = Store::open_in_memory().unwrap();
    let mut third = Store::open_in_memory().unwrap();

    let first_edit = upsert(
        date,
        ObservationValue::Bleeding {
            intensity: BleedingIntensity::Light,
        },
        "device-a",
        100,
    );
    let second_edit = upsert(
        date,
        ObservationValue::Bleeding {
            intensity: BleedingIntensity::Moderate,
        },
        "device-b",
        100,
    );
    let note = upsert(
        date,
        ObservationValue::Note {
            text: "locally acknowledged while offline".to_owned(),
        },
        "device-a",
        101,
    );
    let delete = PlainOperation::tombstone(
        first_edit.record_key.clone(),
        VersionStamp::new(102, 0, "device-c"),
    );

    let first_wire = append(&mut first, &key, 1, couple_id, &first_edit);
    append(&mut first, &key, 1, couple_id, &note);
    append(&mut second, &key, 1, couple_id, &second_edit);
    append(&mut third, &key, 1, couple_id, &delete);

    // The relay commits device A's first write, but its response is lost. The
    // outbox must retain the exact envelope and its retry must be idempotent.
    let first_sequence = relay.push(first_wire.clone()).unwrap();
    assert_eq!(relay.push(first_wire).unwrap(), first_sequence);
    assert_eq!(first.pending_outbox(100).unwrap().len(), 2);

    push_all(&mut second, &mut relay);
    push_all(&mut first, &mut relay);
    push_all(&mut third, &mut relay);

    for store in [&mut first, &mut second, &mut third] {
        pull_all(store, &[(1, &key)], couple_id, &relay);
        assert!(store.pending_outbox(100).unwrap().is_empty());
        assert_eq!(store.cursor().unwrap(), relay.barrier_sequence());
    }

    let first_result = first.materialized_observations().unwrap();
    assert_eq!(first_result, second.materialized_observations().unwrap());
    assert_eq!(first_result, third.materialized_observations().unwrap());
    assert_eq!(first_result.len(), 1);
    let OperationMutation::Upsert {
        observation: expected_note,
    } = &note.mutation
    else {
        unreachable!("the helper always creates an upsert");
    };
    assert_eq!(&first_result[0], expected_note);
}

#[test]
fn bootstrap_and_restarted_cursor_do_not_resurrect_redacted_plaintext() {
    let file = NamedTempFile::new().unwrap();
    let date = NaiveDate::from_ymd_opt(2026, 7, 20).unwrap();
    let couple_id = Uuid::new_v4();
    let key = SecretKey::random();
    let mut relay = BlindRelay::new(1);
    let original = upsert(
        date,
        ObservationValue::Note {
            text: "delete me".to_owned(),
        },
        "device-a",
        1,
    );

    {
        let mut client = Store::open(file.path()).unwrap();
        append(&mut client, &key, 1, couple_id, &original);
        push_all(&mut client, &mut relay);
        pull_all(&mut client, &[(1, &key)], couple_id, &relay);
        assert_eq!(client.cursor().unwrap(), 1);
    }

    let tombstone = PlainOperation::tombstone(
        original.record_key.clone(),
        VersionStamp::new(2, 0, "device-a"),
    );
    {
        let mut restarted = Store::open(file.path()).unwrap();
        append(&mut restarted, &key, 1, couple_id, &tombstone);
        push_all(&mut restarted, &mut relay);
        relay.redact(&[original.op_id]);
        pull_all(&mut restarted, &[(1, &key)], couple_id, &relay);
        assert!(restarted.materialized_observations().unwrap().is_empty());

        let redacted = restarted
            .superseded_operation_ids(&original.record_key)
            .unwrap();
        assert_eq!(redacted, vec![original.op_id]);
        restarted
            .purge_redacted_operations(&original.record_key, &redacted)
            .unwrap();
    }

    let mut bootstrap = Store::open_in_memory().unwrap();
    pull_all(&mut bootstrap, &[(1, &key)], couple_id, &relay);
    assert_eq!(bootstrap.cursor().unwrap(), relay.barrier_sequence());
    assert!(bootstrap.materialized_observations().unwrap().is_empty());
    assert!(
        bootstrap
            .superseded_operation_ids(&original.record_key)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn offline_queue_rotates_atomically_and_old_epoch_replays_fail_closed() {
    let date = NaiveDate::from_ymd_opt(2026, 7, 20).unwrap();
    let couple_id = Uuid::new_v4();
    let old_key = SecretKey::random();
    let new_key = SecretKey::random();
    let mut relay = BlindRelay::new(1);
    let mut remaining = Store::open_in_memory().unwrap();

    let historical = upsert(
        date,
        ObservationValue::Note {
            text: "historical".to_owned(),
        },
        "remaining-device",
        1,
    );
    relay
        .push(encrypt_operation(&old_key, 1, couple_id, &historical).unwrap())
        .unwrap();

    let pending = upsert(
        date,
        ObservationValue::Bleeding {
            intensity: BleedingIntensity::Heavy,
        },
        "remaining-device",
        2,
    );
    let pending_old = append(&mut remaining, &old_key, 1, couple_id, &pending);
    relay.advance_epoch();
    assert_eq!(
        relay.push(pending_old.clone()),
        Err(RelayError::StaleEpoch {
            current: 2,
            received: 1
        })
    );

    let pending_new = encrypt_operation(&new_key, 2, couple_id, &pending).unwrap();
    remaining
        .replace_outbox_batch(std::slice::from_ref(&pending_new))
        .unwrap();
    push_all(&mut remaining, &mut relay);
    pull_all(
        &mut remaining,
        &[(1, &old_key), (2, &new_key)],
        couple_id,
        &relay,
    );
    assert_eq!(remaining.materialized_observations().unwrap().len(), 2);

    let stale_write = upsert(
        date,
        ObservationValue::Temperature {
            value: 36.5,
            unit: verelle_core::TemperatureUnit::Celsius,
            time: None,
            sleep_quality: None,
            disturbed: false,
        },
        "departed-or-restored-device",
        3,
    );
    let stale_wire = encrypt_operation(&old_key, 1, couple_id, &stale_write).unwrap();
    assert_eq!(
        relay.push(stale_wire),
        Err(RelayError::StaleEpoch {
            current: 2,
            received: 1
        })
    );
}
