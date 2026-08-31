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

  it("reaches Privacy and about from the Chart", async () => {
    const app = renderedText(
      "App.vue",
      await readFile(path.join(REPO_ROOT, "src", "App.vue"), "utf8"),
    );

    expect(app).toContain('data-testid="open-privacy"');
  });

  it("states both halves of what the Relay operator knows", async () => {
    const privacyScreen = renderedText(
      "PrivacyAbout.vue",
      await readFile(path.join(REPO_ROOT, "src", "components", "PrivacyAbout.vue"), "utf8"),
    );

    // ADR 0012: content is unreadable; metadata is not. Paraphrase either half
    // and the screen over- or under-claims.
    expect(privacyScreen).toContain("The Relay operator cannot read Chart content.");
    expect(privacyScreen).toContain(
      "The Relay operator does learn that a given owner synced, when, and roughly how much.",
    );
  });

  it("does not imply the Relay learns nothing at all", async () => {
    const files = (await Promise.all(COPY_ROOTS.map(uiCopyFilesUnder))).flat();
    const overclaims: string[] = [];
    const forbiddenPhrases = ["learns nothing", "knows nothing", "sees nothing", "zero disclosure"];

    for (const file of files) {
      const text = renderedText(file, await readFile(file, "utf8")).toLowerCase();
      for (const phrase of forbiddenPhrases) {
        if (text.includes(phrase)) {
          overclaims.push(`${path.relative(REPO_ROOT, file)}: ${phrase}`);
        }
      }
    }

    expect(overclaims).toEqual([]);
  });

  it("states the irreversible consequence of losing the Owner secret from Privacy and about", async () => {
    const privacyScreen = renderedText(
      "PrivacyAbout.vue",
      await readFile(path.join(REPO_ROOT, "src", "components", "PrivacyAbout.vue"), "utf8"),
    );

    expect(privacyScreen).toContain(
      "The 24 Shared owner words you write down in Backup &amp; restore are an offline record of the Shared owner secret.",
    );
    expect(privacyScreen).not.toContain("The Owner secret is the 24 Shared owner words");
    expect(privacyScreen).toContain("If you lose these words, you lose the Chart.");
    expect(privacyScreen).toContain("Nobody can restore it.");
  });

  it("makes clear no account, email, or password is involved", async () => {
    const privacyScreen = renderedText(
      "PrivacyAbout.vue",
      await readFile(path.join(REPO_ROOT, "src", "components", "PrivacyAbout.vue"), "utf8"),
    );

    expect(privacyScreen).toMatch(/no account/i);
    expect(privacyScreen).toMatch(/no email/i);
    expect(privacyScreen).toMatch(/no password/i);
    expect(privacyScreen).toContain("Verelle does not ask for a name or contact information.");
    expect(privacyScreen).not.toMatch(/handing your identity/i);
  });
});
