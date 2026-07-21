# Verelle incident response and breach-notification runbook

Status: operator-ready draft. Privacy counsel review, a named backup human, and a completed tabletop are required before closed beta.

## Targets and authority

- Detection to triage: no more than 24 hours.
- Suspected covered breach to privacy counsel: no more than 72 hours.
- Incident commander: Jacob Stephens. Backup incident commander: **must be named before beta**.
- Only the incident commander may rotate production secrets, disable account access, notify users, or engage processors. Preserving evidence never means logging request bodies, email addresses, tokens, ciphertext, recovery material, or decrypted chart data.

## Severity and classification

| Severity | Example | Immediate posture |
|---|---|---|
| SEV-1 | malicious client release; signing-key theft; client key material exposed; confirmed unauthorized account access | stop distribution, disable affected API capability, preserve metadata evidence, contact counsel/processors |
| SEV-2 | database/backup credential theft; server host compromise; Stripe webhook/secret compromise; deletion resurrection | isolate affected service, rotate credentials, block restores and billing mutation until reconciled |
| SEV-3 | availability loss, suspicious scans, failed backup, invalid push-token burst with no access evidence | stabilize, investigate, promote if confidentiality/integrity evidence appears |

Classify the affected surface separately: (A) network/account metadata, (B) encrypted chart ciphertext, (C) client/device key compromise, (D) malicious or mistaken client build, (E) billing data, (F) deletion/retention failure. Server compromise alone does not imply chart plaintext exposure, but account existence and couple metadata are treated as consumer health data.

## First hour

1. Open a UTC incident log outside the affected system. Record reporter, time, known systems, and hashes/IDs only.
2. Freeze deployments and backup deletion. Do not destroy logs or the suspected host.
3. Determine whether active exploitation continues. If yes, remove the host from the reverse proxy or set the reviewed API gate false; keep a static status page and local apps functional.
4. Snapshot provider audit logs and the compromised host using provider-supported forensic capture. Restrict copies to the incident team.
5. Rotate from a known-clean workstation in dependency order: Cloudflare/DNS, host SSH, database, S3/age recipients, OPAQUE setup if required, Stripe keys/webhook secret, Apple/Google credentials, GitHub signing/release credentials. Rotation of OPAQUE setup invalidates existing registrations and therefore requires the recovery/reset communication plan.
6. Revoke affected sessions/devices and invalidate build signing credentials. Never ask users to send recovery codes.

## Scenario playbooks

### Stolen server or backup credentials

- Disable the credential, inspect provider access logs, and identify objects/rows/time bounds accessed.
- Rotate database and S3 credentials; replace the backup encryption recipient if its private key may be exposed.
- Verify ciphertext, account metadata, deletion manifests, and billing metadata separately.
- Run a restore/deletion drill from a backup definitely predating the incident, then reapply the independent deletion manifest.

### Malicious client release

- Remove the version from distribution, revoke its signing path, and publish a minimum-supported-version block only if doing so will not strand local export.
- Treat any device key or chart plaintext accessible to that build as potentially exposed.
- Produce clean builds from a reviewed commit on isolated CI; compare dependency lockfiles and binary provenance.

### Stripe compromise

- Roll the API and webhook secrets, verify the new webhook endpoint, and pause checkout.
- Reconcile entitlement state from Stripe event IDs without importing card or health data.
- Refund only through Stripe; document event IDs and amounts, not health-account activity.

## Notification decision tree

Within 72 hours, counsel determines whether the event triggers the FTC Health Breach Notification Rule, Washington My Health My Data Act, another state consumer-health/privacy law, processor-contract notice, law-enforcement preservation, or store notice. Record the legal basis and clocks; do not infer “encrypted means no notice” when device keys, identifiers, or the client build may be involved.

Potential recipients are affected individuals, the FTC, state attorneys general/regulators, DigitalOcean, Cloudflare, AWS/S3 provider, Stripe, Apple, Google, and cyber-insurance/counsel. Use the shortest applicable statutory deadline. Processor contacts and current contract notice addresses are verified during each quarterly drill.

### User template

Subject: Important information about your Verelle account

“On [UTC date], Verelle identified [plain description]. The affected information was [categories], during [time range]. [State whether chart content was end-to-end encrypted and whether client keys were affected.] We contained the issue by [actions]. Please [specific action; never provide your recovery code]. Contact jacob@stephens.page with questions or accessibility needs. We will post material updates at verelle.app.”

## Recovery and closure

Traffic resumes only after credential rotation, clean build/deploy, database integrity checks, deletion-manifest reapplication, backup verification, public health/readiness checks, and a second-person review. Close the incident with root cause, exact affected scope, notification record, corrective-action owner/date, and a 30-day follow-up. Retain the minimized incident record under the counsel-approved schedule.

## Pre-beta tabletop

Exercise: a valid S3 credential and production database password appear in a public repository. Inject evidence that one old backup was downloaded and that the age private key was not present. The tabletop must test containment, evidence capture, manifest-safe restoration, the HBNR/MHMDA decision, user copy, and the backup-human handoff. Store the dated after-action report beside this runbook; every corrective action must be closed before beta.
