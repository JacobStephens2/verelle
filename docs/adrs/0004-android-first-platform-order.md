# ADR 0004: Android is the first phone platform

- Status: accepted
- Date: 2026-07-20
- Source: plan OQ-2 / user device decision

## Decision

Both founding-couple phones are Android, so the Phase 2 walking skeleton is an
Android application using Kotlin, Jetpack Compose, and generated UniFFI
bindings over the Rust core. iOS is the Phase 4 second-phone platform.

The known founding watch is a Samsung Watch8 running Wear OS. iPhone and Apple
Watch test hardware are also available, and the likely next-user cohort makes
iOS/watchOS important, but both watch applications remain Phase 8 work after
the phone product proves itself.

## Consequences

The narrow architecture spike first proves Rust-to-Kotlin fixture replay, chart
parity, and an Android simulator build. That gate was satisfied locally on
2026-07-20, after which the shell expanded only into Phase 2 local capabilities:
persistent recording, chart display, deletion, export, and reminders. It does
not pull account auth, production sync, or watch UI ahead of their phases, and
tests use synthetic fixtures rather than real health data. The shared Rust
surface remains suitable for generated Swift bindings so the Android-first
choice does not create a second business-logic implementation.
