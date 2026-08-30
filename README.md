# Verelle

Verelle is a local-first, record-and-display chart for couples using the
Marquette Method. It records what the couple observed and lays it out as an
instructor-readable chart. It deliberately does **not** compute fertility
status, fertile windows, day classifications, or conception guidance (ADR 0001,
ADR 0011).

The repository is being rebuilt. What is on `main` today is the empty **Chart**
frame on both phones and nothing more: today's **Cycle** laid out as **Cycle
Day** columns, with an explicit empty state where the Observations will go.
Nothing is recordable yet. The MVP spec is
[issue #6](https://github.com/JacobStephens2/verelle/issues/6); its tickets are
sub-issues.

The v1 Rust workspace (`verelle-core`, `-crypto`, `-sync`, `-store`, `-ffi`,
`-cli`, `-server`, `-web`, `-auth`, `-api`), the Leptos CSR client, both Android
trees, and the iOS and watch surfaces were retired by ADR 0009. They are
preserved at the `v1-archive` tag and are not to be revived:

```sh
git checkout v1-archive
```

## Stack

Vite + TypeScript + Vue 3.5, with Capacitor shells for iOS and Android
(ADR 0009). The shells **bundle** their web assets and never live-load -
`server.url` is not set in `capacitor.config.ts` and must never be, because
recording has to work from a cold launch with no network (ADR 0010).
`scripts/verify-no-server-url.mjs` fails the build if it reappears, in the
source config or in either generated native config.

## Run it

Requires Node 22 or newer.

```sh
npm ci
npm run dev            # Vite dev server
npm test               # vitest
npm run typecheck      # vue-tsc
npm run build          # typecheck, build, and the server.url guard
npm run smoke:empty-chart   # puppeteer browser smoke against the real app
```

The browser smoke needs a Chrome binary. It looks at `/usr/bin/google-chrome`
by default; override with `VERELLE_CHROME_PATH`.

### The phones

```sh
npm run build
npx cap sync            # copies dist/ into both shells, regenerates their configs
npx cap open android    # or: cd android && ./gradlew assembleDebug
npx cap open ios        # requires macOS, Xcode, and CocoaPods
```

`npm run native:assets` does the build, the sync, and the `server.url` check in
one step.

## Layout

```text
src/chart/       the pure chart modules - no Evolu, no Vue, no DOM
src/components/  the Vue surface
scripts/         build guards and browser-smoke harnesses
docs/adrs/       the decisions; read the ones touching what you are changing
CONTEXT.md       the domain glossary - every term means what that file says
```

## Repository status

Pre-release health-adjacent software with no storage, no sync and no recording
yet. Do not entrust real data to it.
