/// PROTOTYPE. Throwaway.
// Evolu 8 is built on explicit resource management (`using`, DisposableStack)
// and on Map/WeakMap upsert methods. Neither WKWebView nor Android WebView has
// all of them yet, so without this the app throws before opening a single file:
//   iOS      ReferenceError: Can't find variable: DisposableStack
//   Android  TypeError: n.getOrInsertComputed is not a function
//
// Evolu ships these polyfills and its docs say to call this from the app entry
// point. Its own workers already call it; the main thread is the app's job.
import { installPolyfills } from "@evolu/common/polyfills";

installPolyfills();
