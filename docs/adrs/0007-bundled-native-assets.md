# ADR 0007: native shells bundle their assets and never live-load

- Status: accepted
- Date: 2026-08-25

## Decision

Verelle's iOS and Android Capacitor shells ship the built web app as bundled
assets. `server.url` is not set. Web changes reach phones through a store or
TestFlight/internal-track release, not by redeploying a website.

## Context

Chart35 sets `server.url` so both store binaries are thin WebViews that load the
live site, which lets web changes ship without an app rebuild. Verelle cannot
inherit this, because recording an observation must succeed with zero network
connectivity — the observation is taken from a first-morning monitor reading
inside a fixed testing window, on whatever signal the bathroom has.

A live-loading shell cannot meet that. Its first navigation is an HTTP request,
so cold launch offline fails outright. On iOS it fails even warm: WKWebView runs
service workers only when the app declares `WKAppBoundDomains` and sets
`limitsNavigationsToAppBoundDomains`, so no precache exists at all. See
JacobStephens2/chart35#51.

## Consequences

Shipping a fix requires a build and an upload, so the release loop is slower and
the two clients must be assumed to be at different versions. In exchange, the
app opens and records on a dead network, on first launch and every launch, which
is the product's core promise. If an over-the-air update mechanism is wanted
later it must keep the bundled copy as the boot path, never replace it.
