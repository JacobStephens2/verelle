# Sync state machine

Status: implementation draft, 2026-07-18. Cross-references: plan D11, NFR-1,
NFR-3; [key lifecycle](key-membership-lifecycle.md);
[deletion model](data-inventory-deletion-retention.md); [matrix](invariant-matrix.md).

## Model and trust boundary

A client owns a durable SQLite operation log, a materialized chart, an outbox,
and a server cursor. A server owns an append-only sequence space per couple and
stores opaque encrypted envelopes. The logical record key (`civil date + marker
type`), value, HLC, author, and tombstone are encrypted. The relay sees account,
couple, operation ID, sequence, key epoch, ciphertext size, and timestamps.

An operation is immutable:

```text
PlainOperation = op_id + RecordKey + VersionStamp + (Upsert | Tombstone)
VersionStamp   = physical_ms + logical_counter + device_id
TransportOp    = op_id + key_epoch + AES-256-GCM envelope
AAD            = envelope_version + key_epoch + couple_id + op_id
```

`op_id` is generated once and is the idempotency key. A retry never generates a
new ID. The same ID with different bytes is a hard invariant violation. AES-GCM
uses a fresh random 96-bit nonce on every encryption; re-encryption for a new
epoch produces a new envelope but preserves `op_id` and plaintext operation.

## Invariants

- **SYNC-I1 — acknowledged means durable.** Success is returned only after one
  SQLite transaction commits the plaintext operation, materialized winner, and
  encrypted outbox row. Encryption happens before this transaction. Any failure
  rolls back all three.
- **SYNC-I2 — idempotent push.** For a current member/current epoch, the relay
  assigns one sequence to an `op_id`. A duplicate with identical envelope returns
  that result; a duplicate with different envelope is rejected except during the
  explicit epoch-rotation protocol below.
- **SYNC-I3 — deterministic merge.** Highest `(physical_ms, logical, device_id)`
  wins. Exact ties use `op_id` only as a defensive total-order fallback. Upserts
  and tombstones use the same comparison.
- **SYNC-I4 — transactional pull cursor.** Decryption/validation, local operation
  insertion, materialization, outbox echo removal, and cursor-watermark update
  commit together. A crash exposes either the old state or the whole new page.
- **SYNC-I5 — visible gaps are valid.** Deleting ciphertext leaves sequence gaps.
  A pull page supplies `after_cursor`, visible operations, and an authenticated
  `next_cursor` watermark. The client validates every visible sequence is unique
  and inside `(after_cursor, next_cursor]`, then advances to the watermark.
- **SYNC-I6 — clock survives restart.** Every operation stores its HLC columns.
  On restart the clock is seeded from the maximum durable version before another
  local write; remote versions are observed before the next tick.
- **SYNC-I7 — the relay never merges.** It validates membership, entitlement,
  epoch, limits, and envelope shape only. It cannot inspect record keys.
- **SYNC-I8 — civil dates do not re-bucket.** Observation dates are persisted as
  the recording timezone’s civil date. Travel or timezone changes do not mutate
  earlier keys.
- **SYNC-I9 — stale epochs fail closed.** Once membership changes, pushes for an
  older epoch are rejected. Rotation reconciliation is completed before queued
  writes resume.
- **SYNC-I10 — bounded batches.** Clients and server cap operation count and
  envelope bytes; partial pages are safe because each page has a watermark.

## Client state machine

```text
Offline/Idle
  ├─ record/edit/delete → LocalCommit → Offline/Idle
  ├─ foreground/network → Pull
  └─ epoch notice       → RotationBarrier

Pull
  ├─ page committed, more=true → Pull
  ├─ page committed, caught up → DrainOutbox
  ├─ epoch mismatch            → RotationBarrier
  └─ transient failure         → Backoff

DrainOutbox
  ├─ push acknowledged → AckCommit → DrainOutbox or Idle
  ├─ response lost     → Backoff (same op IDs remain queued)
  ├─ epoch mismatch    → RotationBarrier
  └─ auth revoked      → SignedOut (local chart remains usable)

RotationBarrier
  → pull through server-provided pre-rotation barrier
  → remove echoed, already-accepted operations from outbox
  → obtain/install the authorized new epoch key
  → atomically re-encrypt all remaining queued operations
  → Pull, then DrainOutbox
```

### Local commit

1. Seed/advance the persisted HLC and construct an immutable operation.
2. Serialize it, generate a nonce, and encrypt with the current couple epoch key.
3. Begin SQLite `IMMEDIATE` transaction.
4. Insert operation (or prove an identical duplicate), recompute only its logical
   record winner, insert outbox envelope, and persist the HLC columns.
5. Commit, then acknowledge the UI. Disk-full, serialization, encryption, or
   transaction errors are reported as a failed write and never shown as saved.

The current `verelle-store` `BEGIN IMMEDIATE` transaction, injected-trigger,
storage-exhaustion, and concurrent-writer tests implement this boundary.
Platform shells must not add a second non-atomic queue.

### Push and response loss

The client reads a stable outbox batch and may increment attempt metadata. The
server transaction checks session/member/epoch and either inserts the envelope
with the next per-couple sequence or returns the existing identical row. The
client removes acknowledged IDs in one local transaction. If the response is
lost, nothing is removed; the identical retry is safe. A later pull echo also
removes its outbox row.

### Pull and bootstrap

The request is `after=<local cursor>`. The response contains ordered visible
operations, `next_cursor`, and `more`. On bootstrap `after=0`; the client replays
all visible operations through the same merge function. It never accepts a page
whose `after_cursor` differs from its durable cursor. Empty pages may advance the
cursor across redacted sequences.

An envelope must authenticate before its plaintext is parsed. The decrypted
operation ID must match visible transport metadata, and an upsert’s record key
and version must match its embedded observation. Any violation rejects the page
without cursor advancement.

### Concurrent edits and deletes

Edits are new operations; deletes are tombstone operations. Neither overwrites
history. Two devices holding the same decrypted op set converge regardless of
arrival order. A single-observation privacy deletion first commits a winning
tombstone, then submits the superseded op IDs for server redaction as described
in the deletion spec. The tombstone remains so a bootstrap does not resurrect
the record.

### Process-death points

Required crash tests cover: before encryption; before transaction; after
operation insert; after materialized update; after outbox insert; after commit
before UI response; after server insert before response; during pull before and
after cursor update; and during epoch re-encryption. SQLite rollback and relay
idempotency are the recovery mechanisms, not repair jobs.

## Epoch change mid-queue

The membership transaction increments the authoritative epoch and records a
barrier sequence. The remaining member may read historical epochs; the departed
member loses all server authorization immediately. The remaining device:

1. Pulls through the barrier with its existing historical keyring.
2. Removes queue entries whose IDs were already accepted before the barrier.
3. Installs the newly wrapped key after membership authorization.
4. Re-encrypts every still-queued plaintext operation with the new epoch and
   atomically replaces the outbox envelopes (`replace_outbox_batch`).
5. Retries push. No mixed-epoch batch is emitted.

If no remaining device is online, the dataset is read-only until one rotates the
key. Availability is sacrificed rather than accepting an old-epoch write.

## Retry and freshness policy

Foreground clients pull immediately on resume, on opaque push invalidation, and
after a successful local push. Transient failures use exponential backoff with
jitter and a cap, reset on a successful page. Background pushes contain only an
opaque collapse key and are never a correctness dependency. Every chart surface
shows last successful sync time; “local changes pending” is separate from that
timestamp.

## Limits and abuse controls

Exact values are server configuration, initially: at most 100 operations or
1 MiB per push/pull page, 256 KiB per envelope, unique op IDs, nonzero epoch,
session/member rate limits, and ciphertext-only request logging. Limit changes
are backward-compatible and do not alter convergence.

The client transport and blind-relay reference model enforce the nonzero epoch,
256 KiB envelope, 100-operation page, 1 MiB page, supported envelope shape, and
transport/envelope epoch match before any operation is accepted. The SQLite
outbox additionally rejects mixed epochs and requires a duplicate retry to
reuse the exact queued ciphertext.
