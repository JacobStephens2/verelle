# ADR 0001: v1 is record-and-display only

- Status: superseded by ADR 0015 (Verelle computes the Marquette fertile window)
- Date: 2026-07-18
- Source: plan D1
- Amended by: ADR 0011 (mechanical transcription is not a fertility verdict)

## Decision

The v1 domain accepts user-recorded observations and performs only arithmetic
bookkeeping and mechanical annotations anchored to an explicit user event. It
does not expose a protocol engine, computed fertility status, fertile-window
boundary, eligibility result, or day advice.

`MonitorReading::Peak` is displayed as entered. It does not itself create a
post-Peak count. `ObservationValue::UserMarkedPeak` is the sole v1 anchor and
creates display labels P, P+1, P+2, and P+3.

## Consequences

Any interpreting feature goes through OQ-11 and cannot enter `verelle-core` as a
“helpful” UI property. CI fixtures include a monitor Peak without a user anchor
to enforce the boundary. Phase 7 still requires legal review of shipped copy and
the annotation set.

