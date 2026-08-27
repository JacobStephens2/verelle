# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

Verelle uses a single shared domain context across its web app and its iOS and Android Capacitor shells. Treat these as delivery surfaces for one product rather than independent domain contexts.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adrs/`** — read ADRs that touch the area you're about to work in.

If either location doesn't exist, **proceed silently**. Don't flag its absence or suggest creating it upfront. The `/domain-modeling` skill creates domain documentation lazily when terms or decisions actually get resolved.

## File structure

```text
/
├── CONTEXT.md
├── docs/adrs/
├── src/
├── scripts/
├── android/
└── ios/
```

Do not introduce a `CONTEXT-MAP.md` or component-specific `CONTEXT.md` files unless the repository intentionally switches to a multi-context layout.

## Use the glossary's vocabulary

When your output names a domain concept—in an issue title, refactor proposal, hypothesis, or test name—use the term defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, reconsider whether you're inventing language the project doesn't use. If it represents a genuine gap, note it for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
