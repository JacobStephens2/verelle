# Key and membership lifecycle

Status: **draft; OQ-9 external review is open. Do not ship production accounts
from this document yet.** Cross-references: plan D5/D8, FR-7, NFR-2;
[sync](sync-state-machine.md); [matrix](invariant-matrix.md).

## Cryptographic objects

| Object | Generated/held | Purpose |
|---|---|---|
| Device identity key | platform secure hardware/keystore when possible | authenticate an enrolled installation and wrap device-delivered key material |
| Account authentication secret | client password path only | input to the reviewed augmented PAKE; never transmitted or stored as a reusable verifier |
| Account wrapping key | client only | wrap the account data key; domain-separated from authentication |
| Account data key | client keyring | protect account-owned key bundles and local-to-account import metadata |
| Couple data key, per epoch | authorized member device keyrings | encrypt health operations for one couple dataset |
| Recovery code | generated client-side, user offline custody | derive a recovery wrapping key; server never stores the code or reusable derivative |

All symmetric keys are 256 bits. Health envelopes use AES-256-GCM with version,
epoch, random 96-bit nonce, and contextual AAD. Keys are zeroized when practical;
platform secure storage and OS file protection remain required controls.

## Authentication decision requiring review

The intended production direction is an augmented PAKE with a published,
reviewed construction (candidate: RFC 9807 OPAQUE), with Argon2id as the
memory-hard password step and protocol/export keys domain-separated into auth
and account-key wrapping uses. The server stores only the PAKE registration
record and cannot use it directly as a bearer credential. Successful login
produces an opaque, random server session; only its hash is stored server-side.

The repository’s `derive_account_secrets` implements and tests the local
Argon2id + HKDF separation and envelope primitives. It does **not** implement a
PAKE or authorize sending `auth_key()` to a server. Selecting exact suite,
parameters, library, recovery interaction, and downgrade policy is an OQ-9
review deliverable. Plain email/password submission to an Axum endpoint and a
home-grown HMAC challenge are prohibited fallbacks.

## Account creation and first device

1. Normalize/confirm email without placing it in application logs.
2. Client performs PAKE registration, creates account data key and recovery
   code, wraps the account key for password-export and recovery paths, and
   creates a signed device-enrollment record.
3. Server atomically stores account metadata, PAKE record, wrapped blobs, device
   public identity, and hashed session. It never receives data keys.
4. Client verifies it can unwrap the account key before signup is considered
   complete, displays the recovery code once, and requires explicit custody
   acknowledgement.

Local-only use creates only a local dataset/key. Account creation is optional.

## Local-only to account import

Import is resumable, not falsely distributed-atomic:

1. Freeze an immutable snapshot of local plaintext operations and keep the
   original local dataset intact.
2. Stage a durable import record containing snapshot IDs and destination
   account/couple, then encrypt all operations into its current epoch.
3. Push idempotently until every ID is echoed through pull.
4. In one local transaction mark import complete and switch the active dataset.
5. Offer deletion of the old local copy only after export/verification. A crash
   at any prior point resumes from staged IDs and cannot lose the local chart.

## Couple invite and link

- Exactly two active accounts are allowed.
- Invite codes are random, single-use, expire after 15 minutes, are rate-limited,
  and reveal no chart data.
- The acceptor and inviter both confirm the other’s displayed, verified email
  identity before keys flow.
- An authorized inviter device creates epoch 1 couple key and wraps it separately
  to each member’s account/device path. The server stores opaque wrapped copies.
- Membership becomes active only after both wraps and confirmations commit.
  Failure leaves no half-linked data flow.

## Additional device enrollment

An existing authorized device or recovery flow approves the new device. The new
device displays a short authentication string/QR-derived confirmation; the old
device wraps the account/couple keyring to its device public key. Enrollment is
audited. Email possession alone and operator support are insufficient.

Device revocation removes server sessions and future key-bundle access
immediately. It cannot retract plaintext or keys already present on that device;
the UI states this limitation. Revocation advances the couple epoch when the
device could hold the current couple key.

## Password change and recovery

A password change completes a fresh PAKE registration and rewraps the unchanged
account key under the new export/wrapping material in one server compare-and-swap.
The old login record/sessions are revoked after the client verifies the new wrap.
Couple ciphertext is not rewritten.

Recovery options are only:

1. offline recovery code unwraps the account key and establishes fresh PAKE and
   device records; or
2. an active partner re-shares the couple key to a newly authenticated account
   device after an explicit identity warning.

Support cannot reset encryption or substitute a key. Losing all devices,
recovery code, and partner recovery makes ciphertext unrecoverable by design.

## Unlink and epoch advance

The server membership transaction is the authorization boundary:

1. Authenticate the request and determine the remaining/departing members.
2. Increment authoritative epoch and write audit event + barrier sequence.
3. Revoke the departing member’s sessions, push registrations, future pulls,
   pushes, and key-bundle reads in the same transaction.
4. Mark the new epoch `rotation_pending`; all operation pushes are paused.
5. An authorized remaining device generates a fresh random couple key, uploads
   wraps only for remaining authorized devices, and activates the epoch.
6. Remaining clients reconcile/re-encrypt queued writes per SYNC-I9.

Old epoch keys remain in the remaining member’s historical keyring so existing
ciphertext remains readable. The departed member may retain history already
downloaded; unlink cannot erase another person’s phone. They receive no new key
and cannot obtain post-unlink ciphertext from the server.

Offline tests must include remaining device, departed device, restored backup,
old session replay, accepted-write/response-loss at the barrier, and a malicious
relay replaying old key bundles.

## Whole-dataset destruction and one-account deletion

Destroying the couple dataset requires the ownership/confirmation policy in the
deletion spec and immediately revokes all dataset keys/sessions. Deleting one
account follows unlink first when another member remains; it does not silently
destroy the other subject’s shared dataset. Wrapped keys belonging solely to the
deleted account are removed and manifested.

## Watch enrollment (post-1.0 compatibility path)

A watch is a constrained child device, never an implicit trust extension. Its
paired phone approves enrollment, creates a distinct device ID/key, and wraps
only the current epoch key to it. The server records it as a revocable device
with narrow sync capability. Unpair, phone device revocation, or couple unlink
revokes its sessions and advances epoch as applicable. Quick-record creates a
normal op ID/HLC and uses the same outbox; it is not a phone-only shadow record.

## Required review record

OQ-9 sign-off must record reviewer, qualifications/scheme pedigree, date, threat
model, exact PAKE suite/library/versions, Argon2 parameters, device-key algorithms,
key-wrap format, recovery design, deviations, test vectors, and all unresolved
findings. Until then the spec status remains draft and server auth remains absent.

