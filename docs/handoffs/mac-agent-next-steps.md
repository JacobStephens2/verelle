# Mac agent handoff: next steps

Prepared 2026-07-19. This is a bounded handoff for an agent running on Jacob's
MacBook. The immediate objective is to establish a trustworthy operator/Apple
workstation and report readiness. It is **not** authorization to provision
DigitalOcean resources, implement production authentication, or start an iOS
shell before the platform choice is recorded.

## Required input from Jacob

Jacob must provide one exact, pushed Git commit as `HANDOFF_COMMIT`. Do not work
from an uncommitted directory copy or assume that the current `main` is the
handoff point. The Linux workspace had uncommitted implementation and document
move changes when these directions were written.

Jacob must also provide the OQ-2 answer before Phase 2 begins:

- founding couple's two phone platforms;
- which phone is the first walking-skeleton target;
- watch platforms, if already known.

If that answer is absent, complete only the readiness audit below and stop.

## Scope and safety rules

1. Never request, print, paste, log, or commit the DigitalOcean token. A report
   may say only whether it is available to the process.
2. Never print, copy, upload, or otherwise expose a private SSH key. Fingerprints,
   public-key paths, and public keys are non-secret; still record only what is
   needed.
3. Do not create, modify, or delete DigitalOcean resources. Do not run
   `tofu plan` until a locally controlled SSH key matches a registered
   DigitalOcean key. Never run `tofu apply` without a separate, explicit
   instruction from Jacob after he reviews a saved plan.
4. Do not store credentials in this repository, `.env`, `.tfvars`, plan files
   committed to Git, shell history, or agent messages. The DigitalOcean provider
   must receive `DIGITALOCEAN_TOKEN` through the process environment.
5. Do not implement a temporary email/password API or home-grown challenge
   protocol. Production authentication remains blocked by OQ-9 and ADR 0003.
6. Do not mark OQ-9, OQ-10, the instructor review, a device gate, or an
   infrastructure drill complete based on a local test.
7. Work on a dedicated branch from the exact handoff commit. Do not rebase,
   force-push, or edit the same branch concurrently with the Linux agent.
8. Preserve Verelle's v1 boundary: record and display only. No computed fertility
   status, window, eligibility, day classification, or advice.

## Known DigitalOcean state

- Team: `Jacob Stephens`, personal account, one team; Jacob is Owner.
- Bootstrap token name: `nightloch-terraform-bootstrap-2026-07-18`.
- Expiration: 2026-08-18.
- Token has 27 custom scopes: 26 approved baseline scopes plus the
  DigitalOcean-required `snapshot:read` dependency.
- Confirmed absent: `api:*`, `domain:*`, `billing:*`, `droplet:admin`, all SSH-key
  create/update/delete scopes, `spaces*`, `database:*`, and VPC
  create/update/delete scopes.
- No DigitalOcean infrastructure, billing, DNS, team, or authentication state
  was changed during bootstrap.
- Registered SSH keys:

  | Name | MD5 fingerprint |
  |---|---|
  | `drome-prod-admin` | `8e:b3:ab:9a:d4:a4:a7:e1:8b:e2:f5:19:75:e4:17:07` |
  | `Jacob@pink` | `ac:49:b4:f8:71:4a:2b:42:36:9c:f0:0b:3a:b6:9d:8d` |
  | `jacob@MSI` | `c8:4a:06:4c:75:9e:17:93:76:e8:cb:64:04:06:3f:e2` |

The Linux host has `/home/jacob/.ssh/id_ed25519` with mode `600`, but its public
fingerprint is `ad:8d:b3:9f:81:c4:f3:e1:13:2a:b3:f7:5c:34:c8:82`; it matches none
of the registered keys. The MacBook may hold the registered `Jacob@pink` key.

## Step 1: establish an isolated checkout

Substitute the commit Jacob provides. Do not invent it.

```sh
git fetch origin --prune
git switch --detach HANDOFF_COMMIT
git switch -c mac-readiness-2026-07-19
git status --short --branch
git rev-parse HEAD
```

The working tree must be clean before continuing. If the commit is unavailable
from `origin`, stop and ask Jacob to push it. Do not reconstruct the Linux
working tree manually.

## Step 2: read the controlling documents

Read these completely before changing files:

1. `README.md`
2. `docs/plans/verelle-plan.md`
3. every file in `docs/specs/`
4. every file in `docs/adrs/`
5. `docs/verelle.md`
6. `docs/marquette-method-business-logic-specification-for-verelle.md` sections
   3, 5, 6, and 8 for v1 vocabulary only; do not implement its protocol rules.

Treat the invariant matrix's pending/external rows as real gates.

## Step 3: reproduce the repository baseline

Record versions, but do not upgrade dependencies during this audit.

```sh
sw_vers
xcodebuild -version
swift --version
xcrun simctl list devices available
rustc --version
cargo --version
rustup target list --installed
tofu version
ansible --version
```

Missing OpenTofu or Ansible is reportable and non-blocking for the Apple walking
skeleton. Missing/full-incompatible Xcode is blocking if iOS is the Phase 2
target. Do not install global packages without Jacob's approval; propose the
smallest reproducible installation command in the report instead.

Run the repository gates:

```sh
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cargo run --locked -q -p verelle-cli -- validate-fixtures fixtures
```

The expected baseline when this handoff was written was 25 passing Rust tests
and two validated golden fixture files. A different count is acceptable only if
the provided handoff commit intentionally changed it; explain the difference.

## Step 4: verify secret availability without revealing it

The preferred handoff is for Jacob to launch the Mac agent from an environment
that already contains `DIGITALOCEAN_TOKEN`, or to use the agent product's secret
injection. Check presence only:

```sh
if [[ -n "${DIGITALOCEAN_TOKEN:-}" ]]; then
  echo "DIGITALOCEAN_TOKEN: available"
else
  echo "DIGITALOCEAN_TOKEN: unavailable"
fi
```

Do not run `env`, `printenv DIGITALOCEAN_TOKEN`, `echo` on the value, shell
tracing, or a verbose provider command. If unavailable, record that fact and ask
Jacob to relaunch/inject it. Do not ask him to send the value in chat.

Do not make an API call during this step. Key matching comes first.

## Step 5: match a locally controlled SSH key

List fingerprints of public keys without displaying private material:

```sh
find "$HOME/.ssh" -maxdepth 1 -type f -name '*.pub' -print0 |
  while IFS= read -r -d '' key_path; do
    printf '%s  ' "$key_path"
    ssh-keygen -E md5 -lf "$key_path"
  done
```

Compare with the three registered fingerprints above. For a match, verify the
corresponding private-key file exists and has owner-only permissions; do not
open or print it. Record only registered name, public-key path, private-key path,
fingerprint, owner, and mode.

If none match, stop. Recommend that Jacob upload a locally controlled **public**
key through the DigitalOcean console. The bootstrap token deliberately cannot
create SSH keys. Do not upload anything without explicit authorization, and
never upload a private key.

## Step 6: write the readiness report and stop

Create `docs/handoffs/mac-readiness-report.md` with:

- exact `HANDOFF_COMMIT`, branch, macOS version, architecture, and timestamp;
- Xcode/Swift/Rust/OpenTofu/Ansible versions or missing-tool findings;
- exact repository verification results;
- `DIGITALOCEAN_TOKEN` availability as a boolean only;
- SSH-key match result and non-secret paths/fingerprint;
- OQ-2 answer, if Jacob supplied it;
- recommendation: iOS Phase 2, Android Phase 2 on Linux, or blocked;
- a clear list of actions not taken: no cloud API calls, plan, apply, resource
  mutation, secret output, signing change, or production-data use.

Commit only this report on the readiness branch and give Jacob the commit SHA.
Do not begin the conditional work below automatically.

## Conditional next assignment: iPhone is the Phase 2 target

Begin only after Jacob explicitly assigns it and the readiness report is
accepted. First implement a narrow architecture spike, not the full screen set:

1. Add a `verelle-ffi` crate that exposes a minimal, typed UniFFI surface over
   chart fixture replay. Keep domain and merge logic in Rust.
2. Generate Swift bindings reproducibly from a checked-in command/script; do not
   hand-edit generated sources.
3. Add an iOS Swift test target that loads one golden fixture through UniFFI and
   verifies the same compact chart structure as Rust.
4. Add a minimal SwiftUI simulator screen that renders cycle date/day number,
   entered monitor marker, and explicit P/P+1/P+2/P+3 annotations from that
   fixture.
5. Prove an iOS-simulator round trip and record build/test commands and timing.

Spike exclusions: accounts, server sync, push, Stripe, production key custody,
reminders, full record UI, visual branding, watch app, and real health data.
Review the spike before expanding to the complete Phase 2 walking skeleton.

## Conditional next assignment: DigitalOcean operator

This is later Phase 3 work. Begin only after all of the following are true:

- the repository contains reviewed `infra/` OpenTofu configuration;
- OQ-7 has a recorded deploy-target ADR;
- a local SSH key matches a registered DigitalOcean key;
- Jacob explicitly authorizes a plan against a named commit and environment.

Then run formatting, initialization, and validation first. A plan must be saved
outside Git, contain no token, use the exact reviewed commit, and be delivered to
Jacob for review. `tofu apply` is a separate authorization and must never be
inferred from permission to plan. Revoke the bootstrap token after the approved
bootstrap or no later than 2026-08-18.
