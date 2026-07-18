# ADR 0002: JSON observation-to-chart golden fixtures

- Status: accepted
- Date: 2026-07-18
- Source: plan Phase 0/1 and NFR-7

## Decision

Fixtures are checked-in JSON containing complete serialized observations and a
compact expected chart structure: cycle metadata, every civil date/day number,
marker types, and annotation labels. Tests discover every `fixtures/*.json`,
fail if the directory is empty, and compare exact structures.

## Consequences

The format is readable outside Rust, can later drive UniFFI and web parity tests,
and makes additions reviewable. It intentionally asserts chart structure rather
than pixels; each native shell will add its own screenshot/accessibility suite.

