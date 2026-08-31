import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

// ADR 0001 and ADR 0011: Verelle records and displays, and never interprets.
// No UI string may apply any of these to a day. This test exists in v1 and
// stays; it is the cheapest executable form of the record-and-display
// boundary, and the boundary is a regulatory one, not a matter of taste.
const FORBIDDEN = ["fertile", "infertile", "safe", "should"];

// Where user-visible text lives: Vue templates and the app shell. Restricted
// to those on purpose - a comment in a .ts file explaining why a word is
// banned is not a UI string, and neither is `env(safe-area-inset-top)` in a
// stylesheet. A scan that flagged those would be deleted the first time it
// cried wolf.
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const COPY_ROOTS = [path.join(REPO_ROOT, "src"), path.join(REPO_ROOT, "index.html")];

async function uiCopyFilesUnder(entryPath: string): Promise<string[]> {
  const stats = await readdir(entryPath, { withFileTypes: true }).catch(() => null);
  if (stats === null) return /\.(vue|html)$/.test(entryPath) ? [entryPath] : [];

  const files: string[] = [];
  for (const entry of stats) {
    files.push(...(await uiCopyFilesUnder(path.join(entryPath, entry.name))));
  }
  return files;
}

/** The rendered part of a file: a Vue single-file component's template, or a
 * whole `.html` page. A component's `<script>` and `<style>` blocks are not
 * copy. */
function renderedText(file: string, contents: string): string {
  if (!file.endsWith(".vue")) return contents;
  return [...contents.matchAll(/<template[^>]*>([\s\S]*?)<\/template>/g)]
    .map((match) => match[1])
    .join("\n");
}

describe("UI copy", () => {
  it("never applies an interpretation word to a day", async () => {
    const files = (await Promise.all(COPY_ROOTS.map(uiCopyFilesUnder))).flat();
    expect(files.length).toBeGreaterThan(0);

    const offences: string[] = [];
    for (const file of files) {
      const text = renderedText(file, await readFile(file, "utf8"));
      for (const word of FORBIDDEN) {
        if (new RegExp(`\\b${word}\\b`, "i").test(text)) {
          offences.push(`${path.relative(REPO_ROOT, file)}: ${word}`);
        }
      }
    }

    expect(offences).toEqual([]);
  });

  it("states the irreversible consequence of losing the Shared owner", async () => {
    const backupScreen = renderedText(
      "BackupRestore.vue",
      await readFile(path.join(REPO_ROOT, "src", "components", "BackupRestore.vue"), "utf8"),
    );

    expect(backupScreen).toContain("If you lose these words, you lose the Chart.");
    expect(backupScreen).toContain("Nobody can restore it.");
  });

  it("states whether this phone is on a shared Chart", async () => {
    const chart = renderedText(
      "ChartFrame.vue",
      await readFile(path.join(REPO_ROOT, "src", "components", "ChartFrame.vue"), "utf8"),
    );
    const pairing = renderedText(
      "Pairing.vue",
      await readFile(path.join(REPO_ROOT, "src", "components", "Pairing.vue"), "utf8"),
    );

    expect(chart).toContain("This Chart is only on this phone");
    expect(chart).toContain("Shared Chart");
    expect(pairing).toContain("never reaches the Relay");
  });
});
