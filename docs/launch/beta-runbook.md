# Closed-beta runbook

Do not begin until every Phase 7 launch criterion except beta metrics is green.

Target 10–20 consenting couples using synthetic data for onboarding, then their own data only after the privacy/legal gates close. Run for at least two full weeks on the release candidate.

Collect only aggregate/store-native operational measures: invited accounts, active accounts, session/crash counts, sync latency/error histograms, backup freshness, and support incidents. Do not add analytics SDKs or log chart content. The release gate is at least 99.5% crash-free sessions across the final two weeks, zero acknowledged-write loss, a current restore/deletion drill, and a passing 100-VU k6 profile.

Every participant receives: local-only and E2EE limitations, recovery-code custody instructions, partner-unlink limitations, plaintext-export warning, deletion instructions, support contact, and the statement that Verelle records/displays facts without interpretation or medical advice.

Stop the beta for any suspected write loss, deletion resurrection, unauthorized partner access, client key exposure, privacy-policy mismatch, or interpreting copy. Treat write loss and unauthorized disclosure as incident-response events, not ordinary feedback.
