# ADR 0006: Stripe on web; no mobile purchase surface in v1

- Status: accepted for v1 on 2026-07-20; recheck at each store submission
- Decision owner: Jacob Stephens

## Decision

Verelle sells optional encrypted synchronization on the web through Stripe Checkout at **$4.99/month or $39.99/year**. Local charting, on-device history, and export remain fully functional without payment. iOS, watchOS, Android, and Wear OS do not display prices, purchase links, or an alternative checkout flow in v1. They may recognize an entitlement attached to an account that the user obtained elsewhere.

The first closed beta runs with billing enforcement disabled. Enforcement may be enabled only after Stripe products, webhook signing, warning delivery, refund handling, and the test lifecycle are exercised against the deployed candidate.

## Current-policy check

This decision was checked against the rules in force on 2026-07-20:

- Apple Guideline 3.1.1 requires IAP for in-app feature unlocks, while the US storefront currently permits external-link calls to action. The Small Business Program commission is 15%. Verelle avoids a region-dependent mobile purchase UX entirely. <https://developer.apple.com/app-store/review/guidelines/> and <https://developer.apple.com/app-store/small-business-program/>
- Google Play’s policy still defaults to Play Billing for digital services unless an applicable alternative-billing or external-link program is used. Its US policy currently permits alternatives under the programs launched in December 2025, and service-fee terms changed for the US on 2026-06-30. Verelle does not enroll in or surface either mobile flow for v1. <https://support.google.com/googleplay/android-developer/answer/9858738> and <https://support.google.com/googleplay/android-developer/answer/15582165>

Store-review notes must explain that the app is a free local chart and that the hosted encrypted-sync service is optional. If either store requires its billing system merely for recognizing the web entitlement, enforcement stays off on that platform until a StoreKit/Play Billing adapter and server-side transaction verification are complete.

## Pricing check

The price sits between two current comparables: Read Your Body lists $2.69/month or $20.99/year, while Marquette NFP Pro lists $9.99/month or $59.99/year. Verelle provides less interpretation than either and keeps local use free, but carries encrypted multi-device and couple-sync infrastructure. The provisional middle price is retained for beta rather than optimized without demand evidence. <https://readyourbody.zendesk.com/hc/en-gb/articles/360015908200-How-much-does-the-app-cost-to-use> and <https://www.marquettenfppro.com/download>

## Consequences

- One audited payment integration and one refund path exist in v1.
- Mobile store policy cannot silently change checkout behavior by locale.
- Conversion is likely lower than a native purchase flow.
- The server entitlement boundary remains provider-neutral so StoreKit or Play Billing can be added without changing encrypted datasets.
