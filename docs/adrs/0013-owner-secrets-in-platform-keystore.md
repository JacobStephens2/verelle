# ADR 0013: owner secrets live in the platform keystore, never in web storage

- Status: accepted
- Date: 2026-08-25

## Decision

The `AppOwner` and `SharedOwner` secrets are stored in the platform keystore —
iOS Keychain and Android Keystore — reached from the WebView through a Capacitor
plugin. They are never written to `localStorage`, `sessionStorage`, IndexedDB,
or any other web-storage surface, and never logged.

## Context

Evolu derives everything from the owner secret: the owner id, the encryption
key, and the write key (ADR 0012). That secret is the only thing standing
between the couple and their data, in both directions.

**If it is lost, the chart is permanently unrecoverable.** There is no operator
recovery path and there must not be one — the same property that stops the
operator reading the data stops him restoring it.

Web storage is the wrong home for it. `localStorage` is readable by any script
on the origin, is not encrypted at rest, and is subject to eviction — iOS clears
web storage for apps unused for extended periods, which for this material means
silent, total, unrecoverable data loss on a phone that was simply left alone.

The `prototype/evolu-capacitor` spike used `localStorage` deliberately, because
it is throwaway. That choice must not be carried into Verelle.

## Consequences

Backup and recovery become a first-class product concern rather than an
afterthought: the couple needs a way to record the `SharedOwner` mnemonic
offline, and the UI must say plainly that losing it loses the chart. Pairing a
second phone means moving this material between devices, so the pairing design
(`CONTEXT.md`: a short code that never reaches the server) is constrained by
this ADR and cannot be settled independently of it.
