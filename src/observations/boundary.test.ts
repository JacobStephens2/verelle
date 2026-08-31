/**
 * Guards on the shape of the app rather than on its behaviour. Each one exists
 * because the thing it checks looks like tidy-up-able dead code and is not.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SRC = path.join(REPO_ROOT, "src");
const EVOLU_STORE = path.join(SRC, "observations", "evolu-store.ts");
const SYNC_ADAPTER = path.join(SRC, "sync");
const POLYFILLS = path.join(SRC, "evolu-polyfills.ts");
const IOS_OWNER_PLUGIN = path.join(
  REPO_ROOT,
  "ios",
  "App",
  "App",
  "OwnerSecretsPlugin.swift",
);
const ANDROID_OWNER_PLUGIN = path.join(
  REPO_ROOT,
  "android",
  "app",
  "src",
  "main",
  "java",
  "app",
  "verelle",
  "OwnerSecretsPlugin.java",
);

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(entryPath) : [entryPath];
    }),
  );
  return files.flat();
}

const relative = (file: string) => path.relative(REPO_ROOT, file);

describe("the Evolu boundaries", () => {
  it("confines Evolu to the observation store and owner lifecycle", async () => {
    const importers: string[] = [];
    for (const file of await filesUnder(SRC)) {
      if (file === EVOLU_STORE || file === POLYFILLS) continue;
      if (file.startsWith(SYNC_ADAPTER + path.sep)) continue;
      if (file.startsWith(path.join(SRC, "owners") + path.sep)) continue;
      if (/@evolu\//.test(await readFile(file, "utf8"))) importers.push(relative(file));
    }

    // The Chart projection has to stay a pure function of Observations plus
    // today (issue #9), and that only holds while Evolu is reachable from one
    // adapter boundary, except for the owner lifecycle that turns keystore
    // bytes into Evolu's AppOwner and SharedOwner. A view that imports it is
    // the first step to a query or owner conversion in a template.
    expect(importers).toEqual([]);
  });

  it("keeps Evolu out of every view", async () => {
    const views = (await filesUnder(SRC)).filter((file) => file.endsWith(".vue"));
    expect(views.length).toBeGreaterThan(0);

    for (const view of views) {
      expect(await readFile(view, "utf8")).not.toMatch(/@evolu\//);
    }
  });
});

describe("the two load-bearing Evolu configuration requirements", () => {
  it("installs Evolu's polyfills at the app entry point, ahead of everything else", async () => {
    // Without it the app dies before it opens a file: ReferenceError on iOS,
    // TypeError on Android (ADR 0012).
    const polyfills = await readFile(POLYFILLS, "utf8");
    expect(polyfills).toMatch(/@evolu\/common\/polyfills/);
    expect(polyfills).toMatch(/installPolyfills\(\)/);
    expect(polyfills).toMatch(/DisposableStack/);
    expect(polyfills).toMatch(/getOrInsertComputed/);

    // ES imports are hoisted, so the polyfill module has to be the entry
    // point's first import or it runs after Evolu has already been pulled in.
    const entry = await readFile(path.join(SRC, "main.ts"), "utf8");
    const firstImport = /^import .*$/m.exec(entry)?.[0];
    expect(firstImport).toBe('import "./evolu-polyfills";');
  });

  it("removes SharedWorker before Evolu's deps are created, and says why", async () => {
    // iOS 26's WKWebView exposes SharedWorker and it then fails silently under
    // capacitor://localhost: every query hangs forever with a clean console
    // (ADR 0012).
    const store = await readFile(EVOLU_STORE, "utf8");
    const deleteAt = store.indexOf("delete (globalThis");
    // The call site, not the comment above it that names the same function.
    const depsAt = store.indexOf("createVerelleEvoluDeps({");

    expect(deleteAt).toBeGreaterThan(-1);
    expect(depsAt).toBeGreaterThan(-1);
    expect(store.slice(deleteAt)).toMatch(/SharedWorker/);
    expect(deleteAt).toBeLessThan(depsAt);
    // The comment has to say why, and the ADR reference is the stable part
    // of it - reworded prose should not fail this test, a deleted rationale
    // should.
    expect(store.slice(0, deleteAt)).toMatch(/ADR 0012/);
  });
});

describe("the Owner secret", () => {
  it("reaches no web-storage surface anywhere in the app", async () => {
    // ADR 0013: web storage is readable by any script on the origin, is not
    // encrypted at rest, and is evicted from apps left unused - which for this
    // material is silent, total, unrecoverable data loss. The spike used
    // localStorage because it was throwaway; that choice does not cross over.
    const offences: string[] = [];
    for (const file of await filesUnder(SRC)) {
      if (file.endsWith(".test.ts")) continue;
      const contents = await readFile(file, "utf8");
      // Reads and writes, not prose. A comment saying why these are banned is
      // not a use of them, and a scan that flagged one would be deleted the
      // first time it cried wolf.
      for (const surface of [
        "localStorage",
        "sessionStorage",
        "indexedDB",
        "openDatabase",
        "caches",
        "cookieStore",
      ]) {
        if (new RegExp(`\\b${surface}\\s*[.[]`).test(contents)) {
          offences.push(`${relative(file)}: ${surface}`);
        }
      }
    }

    expect(offences).toEqual([]);
  });

  it("uses the iOS Keychain and Android Keystore behind the Capacitor adapter", async () => {
    const [ios, android, adapter] = await Promise.all([
      readFile(IOS_OWNER_PLUGIN, "utf8"),
      readFile(ANDROID_OWNER_PLUGIN, "utf8"),
      readFile(path.join(SRC, "owners", "capacitor-owner-secret-store.ts"), "utf8"),
    ]);

    expect(ios).toMatch(/kSecClassGenericPassword/);
    expect(ios).toMatch(/SecItemCopyMatching/);
    expect(ios).toMatch(/SecItem(?:Add|Update)/);
    expect(android).toMatch(/AndroidKeyStore/);
    expect(android).toMatch(/AES\/GCM\/NoPadding/);
    expect(android).toMatch(/Cipher\.ENCRYPT_MODE/);
    expect(adapter).toMatch(/registerPlugin<OwnerSecretsPlugin>/);
  });

  it("turns off bridge payload logging and never logs owner material itself", async () => {
    const config = await readFile(path.join(REPO_ROOT, "capacitor.config.ts"), "utf8");
    expect(config).toMatch(/loggingBehavior:\s*["']none["']/);

    const ownerFiles = [
      ...(await filesUnder(path.join(SRC, "owners"))).filter(
        (file) => !file.endsWith(".test.ts"),
      ),
      IOS_OWNER_PLUGIN,
      ANDROID_OWNER_PLUGIN,
    ];
    const loggingCalls: string[] = [];
    for (const file of ownerFiles) {
      const contents = await readFile(file, "utf8");
      if (/\b(?:console\.|CAPLog\.|Logger\.|Log\.)/.test(contents)) {
        loggingCalls.push(relative(file));
      }
    }

    expect(loggingCalls).toEqual([]);
  });

  it("contains no provisional or committed Owner secret", async () => {
    const trackedSourceFiles = (
      await filesUnder(SRC)
    ).filter((file) => !file.endsWith(".test.ts"));
    const offences: string[] = [];
    for (const file of trackedSourceFiles) {
      const contents = await readFile(file, "utf8");
      if (/\btestOwnerSecret\b/.test(contents)) offences.push(relative(file));

      // A committed BIP39 backup is a 24-word string literal. Prose and UI
      // paragraphs are not matched because they contain punctuation.
      if (/(["'`])(?:[a-z]+ ){23}[a-z]+\1/u.test(contents)) {
        offences.push(`${relative(file)}: 24-word phrase`);
      }
    }

    expect(offences).toEqual([]);
  });
});
