# Verelle lifecycle specifications

These documents are the Phase S design inputs required by
[`verelle-plan.md`](../plans/verelle-plan.md). They define invariants before
client/server schemas become compatibility promises.

Current status: **implementation draft, not externally signed off**. The sync
invariants exercised by the Rust workspace are testable now. The authentication,
key-membership, deletion-law, processor, and incident-response decisions remain
blocked on OQ-9 (applied-cryptography review) and OQ-10 (privacy-counsel
parameters). No production account or sync service should launch until the
matrix records those approvals.

- [Sync state machine](sync-state-machine.md)
- [Key and membership lifecycle](key-membership-lifecycle.md)
- [Data inventory, deletion, and retention](data-inventory-deletion-retention.md)
- [Shared invariant matrix](invariant-matrix.md)

Every migration must cite invariant IDs from the matrix. A document status of
“reviewed” means the named external gate is recorded with reviewer, date, scope,
and deviations; passing repository tests alone does not mean reviewed.

