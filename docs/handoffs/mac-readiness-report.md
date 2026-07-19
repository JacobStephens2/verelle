# Mac readiness report

Audit timestamp: `2026-07-19T00:28:58-0400` (America/New_York)

## Checkout

- `HANDOFF_COMMIT`: `dc5d7338c1935375eb224c6b8b17d74223a96d4a`
- Branch: `mac-readiness-2026-07-19`
- Commit availability: present on `origin/main`
- Initial and post-checkout working tree: clean
- Host: macOS 26.5.2 (build 25F84), `arm64`

## Workstation inventory

| Component | Result |
|---|---|
| Xcode | 26.6 (build 17F113) |
| Swift | Apple Swift 6.3.3 (`swiftlang-6.3.3.1.3`, `clang-2100.1.1.101`), target `arm64-apple-macosx26.0` |
| Simulator availability | iOS 26.5 and watchOS 26.5 devices available; all listed devices were shut down |
| Rust | `rustc 1.97.0 (2d8144b78 2026-07-07)` |
| Cargo | `cargo 1.97.0 (c980f4866 2026-06-30)` |
| Installed Rust targets | `aarch64-apple-darwin`, `aarch64-apple-ios`, `aarch64-apple-ios-sim` |
| OpenTofu | Missing: `tofu` was not found |
| Ansible | Missing: `ansible` was not found |

Xcode, Swift, an iOS simulator runtime, and the required Apple Rust targets are
available for the future Phase 4 iOS implementation selected by OQ-2.
No tool was installed or upgraded during this audit. Homebrew 6.0.11 is
available; after Jacob's approval, the smallest package-manager installation
command for the two missing operator tools is:

```sh
brew install opentofu ansible
```

The repository does not currently pin OpenTofu or Ansible versions. Pin versions
before treating infrastructure setup as reproducible production tooling.

## Repository verification

All commands ran from the exact handoff commit with locked dependencies where
specified.

| Command | Result |
|---|---|
| `cargo fmt --all -- --check` | PASS; no formatting differences |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | PASS; no warnings |
| `cargo test --workspace --locked` | PASS; 25 tests passed, 0 failed, 0 ignored |
| `cargo run --locked -q -p verelle-cli -- validate-fixtures fixtures` | PASS; validated 2 fixture files |

The test count matches the handoff baseline. The two validated golden fixtures
were `fixtures/regular-cycle.json` and
`fixtures/artificial-and-return-cycle.json`.

Test breakdown: `verelle-core` 4 unit tests plus 1 golden-fixture test,
`verelle-crypto` 4, `verelle-store` 10, and `verelle-sync` 6. The CLI and doc-test
targets contained 0 additional tests.

Passing these local checks does not close OQ-9, OQ-10, the certified-instructor
chart review, any device acceptance gate, or an infrastructure/restore drill.

## Credential and SSH readiness

- `DIGITALOCEAN_TOKEN` available to the audit process: **false**.
- DigitalOcean API calls made: **none**.
- Local public keys found: one.
- Public-key path: `/Users/jacob/.ssh/id_ed25519.pub`.
- Public-key fingerprint: `MD5:ca:a9:84:d1:95:54:88:36:85:33:d1:6d:68:ae:95:fd`
  (ED25519).
- Registered-key match: **none**. The fingerprint does not match
  `drome-prod-admin`, `Jacob@pink`, or `jacob@MSI`.
- Private-key inspection: not performed because no public key matched a
  registered DigitalOcean key.

Before any DigitalOcean planning assignment, Jacob should upload a locally
controlled **public** key through the DigitalOcean console and then repeat the
fingerprint/owner/mode audit. The bootstrap token cannot create SSH keys. The
token must also be injected into the agent process without sending or storing
its value in chat or repository files.

## OQ-2 and recommendation

OQ-2 was resolved by Jacob on 2026-07-19 after the workstation audit:

- Founding phone 1: Android.
- Founding phone 2: iOS.
- Phase 2 walking-skeleton target: Android.
- Phase 4 second phone: iOS.
- Phase 8 watch platforms: Wear OS and watchOS.

**Recommendation: Android Phase 2 on Linux.** The Mac is technically ready for
the later iOS work, but no iOS/UniFFI spike should precede the selected Android
walking skeleton. DigitalOcean operator work is separately blocked by the
missing token injection, missing registered SSH-key match, missing OpenTofu and
Ansible, absent reviewed `infra/` configuration, and unresolved OQ-7.

## Actions explicitly not taken

- No DigitalOcean or other cloud API calls.
- No OpenTofu initialization, validation, plan, or apply.
- No cloud resource creation, modification, or deletion.
- No credential value, private key, or other secret was requested, printed,
  opened, copied, stored, or committed.
- No dependency or global-tool installation or upgrade.
- No signing, certificate, provisioning-profile, or bundle-identity change.
- No production-data or real-health-data use.
- No production authentication implementation and no temporary password or
  challenge protocol.
- No iOS/UniFFI spike, Android work, or DigitalOcean conditional assignment.
