# PROTOTYPE — Evolu under Capacitor. Throwaway.

**This is not Verelle.** It is a disposable probe that answers one question:

> Can Evolu (SQLite-WASM + SQLite3MultipleCiphers on the OPFS SAH-Pool VFS)
> initialise, persist, and sync inside a Capacitor WebView on physical iOS
> and Android devices, with `server.url` unset and assets bundled?

Nothing here is meant to survive. No tests, no error handling beyond what keeps
it runnable, no abstractions. See `VERDICT.md` for the answer and
`RUNBOOK.md` for how to reproduce it on devices.

Branch: `prototype/evolu-capacitor`. Do not merge to main.
