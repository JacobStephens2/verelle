// Run before anything imports Evolu, on both platforms. Evolu 8 is built on
// explicit resource management (`using`, `DisposableStack`) and on the Map
// upsert methods, and neither WebView has all of them. Without this call the
// app dies before it opens a single file:
//
//   iOS      -> ReferenceError: Can't find variable: DisposableStack
//   Android  -> TypeError: ...getOrInsertComputed is not a function
//
// Evolu's own workers already call it; only the main thread is the app's job.
// This looks like dead code and is not (ADR 0012,
// prototype/evolu-capacitor/VERDICT.md).
import { installPolyfills } from "@evolu/common/polyfills";

installPolyfills();
