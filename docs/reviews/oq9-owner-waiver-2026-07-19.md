# OQ-9 independent-review owner waiver

- Date: 2026-07-19 UTC
- Owner/reviewer identity supplied: Jacob Stephens
- Contact supplied: `jacob@stephens.page`
- Implementation target: `be5546b5d0c39f888a9db6654b163193041e9936`
- Review packet: commit `520c71b`,
  `docs/reviews/oq9-external-review-packet.md`
- Decision: authorize public activation with known incomplete security and
  lifecycle work

## Owner authorization

Jacob Stephens supplied this exact authorization in the project session:

> I waive the independent OQ-9 requirement and authorize enabling the incomplete
> public API despite the documented gaps.

Jacob previously identified himself for the review record as Jacob Stephens at
`jacob@stephens.page`.

## Scope and limits

This is an explicit product-owner waiver and risk acceptance. It is **not** an
independent applied-cryptography review, does not claim reviewer independence or
cryptographic qualifications, and does not resolve the findings in the OQ-9
external-review packet.

Activation exposes the RFC 9807 OPAQUE registration/login endpoints and the
authenticated blind-relay endpoints. The current Android and web applications
do not yet expose account enrollment, device public-key proof is incomplete,
server-key pin persistence is unfinished, application-level RFC vectors are
missing, and password change, recovery execution, partner lifecycle, unlink,
and deletion are not implemented end to end.

Public reachability does not authorize entering real health data, inviting
external beta users, or describing the incomplete lifecycle as production
ready. Those decisions require separate explicit acceptance after the relevant
implementation and operational gates.

## Activation and rollback record

The deployment may set:

```text
VERELLE_REVIEWED_API_ENABLED=true
VERELLE_OQ9_REVIEW_REFERENCE=https://github.com/JacobStephens2/verelle/blob/<waiver-commit>/docs/reviews/oq9-owner-waiver-2026-07-19.md
```

Immediate rollback is to restore `VERELLE_REVIEWED_API_ENABLED=false` and
restart `verelle-server`. The OPAQUE server setup must be retained across
rollback and subsequent activation; replacing it would invalidate the server
static key expected by enrolled clients.
