# Store declaration worksheet

Status: prepared answers; verify in the live consoles at submission because question wording changes. Answers must remain consistent with the published privacy policy.

## Apple privacy nutrition label

- Health & Fitness — Health: **collected**, linked to account when sync is enabled, used for app functionality; not used for tracking.
- Contact Info — Email Address: entered for account authentication and Stripe checkout, linked to account; not used for tracking. The Verelle server stores a one-way credential identifier rather than the address.
- Identifiers — User ID and Device ID: collected for account, security, couple membership, and sync; linked; not tracking.
- Purchases — Purchase History: Stripe subscription/customer/status identifiers for app functionality; linked; not tracking.
- Diagnostics — Crash Data: Apple store-native diagnostics only, not a third-party SDK. Declare collection according to the App Store Connect diagnostic setting actually enabled.
- Other Data — encrypted operation IDs, cursor/key epoch, consent and deletion receipts, security metadata: app functionality, security, and legal compliance; linked; not tracking.

No precise location, contacts, photos, browsing history, advertising data, or cross-company tracking. watchOS mirrors only user-requested recent entries and quick records through the paired phone.

## Google Play Data Safety

- Health info: collected and optionally shared only with the user-authorized partner; required for chart/sync feature, encrypted in transit and end-to-end at the application layer, deletion available.
- Email address: collected for account access; optional because local-only use exists; encrypted in transit; deletion available.
- User IDs / Device IDs: collected for account security and sync; optional with local-only use; deletion available.
- Purchase history: collected for subscription entitlement through Stripe; optional; deletion/retention per policy.
- App interactions and diagnostics: minimal service/sync metadata and Play-native crash information; no analytics or ads SDK.
- Data is not sold, not used for advertising, and not shared for third-party purposes. A partner is a user-directed recipient, not an advertising/data-broker share.

## Google Play Health Apps declaration

- Category: menstrual/reproductive health charting.
- Function: users manually record and display cycle dates, monitor/hormone readings, bleeding, mucus, temperature, intercourse, notes, and user-marked Peak events.
- The app does not interpret data, predict fertility, identify fertile windows, recommend contraception, diagnose, or provide medical advice.
- Evidence/support: published privacy policy, in-app consent, account and observation deletion, local-only mode, E2EE architecture, and contact address.

## Submission verification

- [ ] Privacy-policy URL is public without sign-in.
- [ ] In-app delete works on the reviewed production build.
- [ ] Screenshots and listing copy contain no “fertile,” “infertile,” “safe day,” effectiveness, diagnose, or treatment claim.
- [ ] Apple and Google answers match actual billing enforcement, crash reporting, Cloudflare proxying, push providers, and beta configuration.
- [ ] Mobile purchase behavior matches ADR 0006 in every storefront.
- [ ] Counsel-approved MHMDA/HBNR wording and partner-sharing treatment are reflected.
