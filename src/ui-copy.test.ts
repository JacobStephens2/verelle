import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BOUNDARY_RULES } from "./chart/boundary-rules";
import { evaluateEligibilityWarnings } from "./chart/eligibility-warnings";

// ADR 0015: Verelle computes the Marquette fertile window, naming days
// fertile or infertile in the method's own words, but never gives advice.
// No UI string may call a day safe or unsafe, or tell a couple what they
// should do. This test stays; it is the cheapest executable form of the
// advice boundary, and the boundary is a regulatory one, not a matter of
// taste.
const FORBIDDEN = ["safe", "unsafe", "should"];

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
 * whole `.html` page. A component's `<script>` and `<style>` blocks, and HTML
 * comments, are not copy. */
function renderedText(file: string, contents: string): string {
  const raw = file.endsWith(".vue")
    ? [...contents.matchAll(/<template[^>]*>([\s\S]*?)<\/template>/g)]
        .map((match) => match[1])
        .join("\n")
    : contents;
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
}

function forbiddenWordsIn(text: string): string[] {
  const found: string[] = [];
  for (const word of FORBIDDEN) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) {
      found.push(word);
    }
  }
  return found;
}

describe("UI copy", () => {
  it("permits 'fertile' and 'infertile' while forbidding 'safe', 'unsafe', and 'should'", () => {
    expect(forbiddenWordsIn("Fertile window opens on day 6")).toEqual([]);
    expect(forbiddenWordsIn("Infertile day")).toEqual([]);
    expect(forbiddenWordsIn("This day is safe")).toEqual(["safe"]);
    expect(forbiddenWordsIn("Unsafe intercourse")).toEqual(["unsafe"]);
    expect(forbiddenWordsIn("You should avoid today")).toEqual(["should"]);
  });

  it("scans only rendered template text, ignoring script blocks, comments, and stylesheets", () => {
    const vueComponent = `
      <template>
        <!-- A template comment mentioning safe, unsafe, and should -->
        <p>Fertile window</p>
      </template>
      <script>
        // safe, unsafe, should in script
        const safe = true;
      </script>
      <style>
        /* safe-area-inset in style */
        .chart { padding-top: env(safe-area-inset-top); }
      </style>
    `;
    const vueText = renderedText("TestComponent.vue", vueComponent);
    expect(forbiddenWordsIn(vueText)).toEqual([]);
    expect(vueText.trim()).toBe("<p>Fertile window</p>");

    const htmlPage = `
      <!doctype html>
      <html>
        <head>
          <style>/* safe in stylesheet */ body { margin: 0; }</style>
          <script>// safe and should in script const safe = true;</script>
        </head>
        <body>
          <!-- unsafe in comment -->
          <p>Fertile window</p>
        </body>
      </html>
    `;
    const htmlText = renderedText("index.html", htmlPage);
    expect(forbiddenWordsIn(htmlText)).toEqual([]);
    expect(htmlText).toContain("<p>Fertile window</p>");
  });

  it("never applies an advice word to a day", async () => {
    const files = (await Promise.all(COPY_ROOTS.map(uiCopyFilesUnder))).flat();
    expect(files.length).toBeGreaterThan(0);

    const offences: string[] = [];
    for (const file of files) {
      const text = renderedText(file, await readFile(file, "utf8"));
      for (const word of forbiddenWordsIn(text)) {
        offences.push(`${path.relative(REPO_ROOT, file)}: ${word}`);
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
    expect(chart).not.toContain("Pairing in progress");
    expect(pairing).toContain("never reaches the Relay");
    expect(pairing).toContain("This Chart is not yet shared.");
    expect(pairing).toContain("Both phones show the same Chart");
    expect(pairing).toContain("Take a photo of the pairing code");
    expect(pairing).toContain("Backing out leaves this phone unpaired.");
  });

  it("does not claim that showing a pairing code marked the Chart shared", async () => {
    const pairing = await readFile(
      path.join(REPO_ROOT, "src", "components", "Pairing.vue"),
      "utf8",
    );
    expect(pairing).toContain("This phone could not show a pairing code. Try again.");
    expect(pairing).not.toMatch(
      /could not mark the Chart as shared/,
    );
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

  it("reaches Profile and Protocol choices from the Chart tools", async () => {
    const app = renderedText(
      "App.vue",
      await readFile(path.join(REPO_ROOT, "src", "App.vue"), "utf8"),
    );

    expect(app).toContain('data-testid="open-profile"');
    expect(app).toContain('data-testid="open-cycle-overlay"');
  });

  it("offers date of birth and eligibility circumstances in Profile without advice words", async () => {
    const profileScreen = renderedText(
      "ProfileSettings.vue",
      await readFile(path.join(REPO_ROOT, "src", "components", "ProfileSettings.vue"), "utf8"),
    );

    expect(profileScreen).toContain('data-testid="profile-dob"');
    expect(profileScreen).toContain('data-testid="profile-breastfeeding"');
    expect(profileScreen).toContain('data-testid="profile-postpartum"');
    expect(profileScreen).toContain('data-testid="profile-perimenopause"');
    expect(profileScreen).toContain('data-testid="profile-contraception-stop"');
    expect(forbiddenWordsIn(profileScreen)).toEqual([]);
  });

  it("offers Protocol family and Intention per Cycle in CycleOverlayDialog without advice words", async () => {
    const cycleScreen = renderedText(
      "CycleOverlayDialog.vue",
      await readFile(path.join(REPO_ROOT, "src", "components", "CycleOverlayDialog.vue"), "utf8"),
    );

    expect(cycleScreen).toContain('data-testid="protocol-family-select"');
    expect(cycleScreen).toContain('data-testid="protocol-version-display"');
    expect(cycleScreen).toContain('data-testid="intention-select"');
    expect(cycleScreen).toContain("Protocol family");
    expect(cycleScreen).toContain("Intention");
    expect(forbiddenWordsIn(cycleScreen)).toEqual([]);
  });

  it("explains day fertility in DayExplanation without advice words while naming boundary rule, protocol version, and published source", async () => {
    const dayExplanation = renderedText(
      "DayExplanation.vue",
      await readFile(path.join(REPO_ROOT, "src", "components", "DayExplanation.vue"), "utf8"),
    );

    expect(dayExplanation).toContain('data-testid="day-explanation"');
    expect(dayExplanation).toContain('data-testid="boundary-rule"');
    expect(dayExplanation).toContain('data-testid="protocol-version"');
    expect(dayExplanation).toContain('data-testid="rule-source-link"');
    expect(dayExplanation).toContain('data-testid="boundary-confidence"');
    expect(dayExplanation).toContain('data-testid="provisional-explanation"');
    expect(forbiddenWordsIn(dayExplanation)).toEqual([]);
  });

  it("contains no advice words in boundary rule descriptions and provisional requirements", () => {
    for (const rule of Object.values(BOUNDARY_RULES)) {
      expect(forbiddenWordsIn(rule.description)).toEqual([]);
      if (rule.provisionalRequirement) {
        expect(forbiddenWordsIn(rule.provisionalRequirement)).toEqual([]);
      }
    }
  });

  it("presents eligibility warnings in EligibilityWarnings without advice words", async () => {
    const warningsTemplate = renderedText(
      "EligibilityWarnings.vue",
      await readFile(path.join(REPO_ROOT, "src", "components", "EligibilityWarnings.vue"), "utf8"),
    );

    expect(warningsTemplate).toContain('data-testid="eligibility-warnings"');
    expect(warningsTemplate).toContain('data-testid="eligibility-warning"');
    expect(warningsTemplate).toContain('data-testid="warning-reason"');
    expect(warningsTemplate).toContain('data-testid="warning-limit"');
    expect(warningsTemplate).toContain('data-testid="warning-guidance"');
    expect(warningsTemplate).toContain('data-testid="warning-instructor-link"');
    expect(forbiddenWordsIn(warningsTemplate)).toEqual([]);
  });

  it("frames eligibility warning limits as limits of the method's published instructions and contains no advice words", () => {
    // Generate all 7 warnings
    const today = "2026-06-15";
    const profile = {
      dateOfBirth: "1975-01-01", // age 51
      breastfeeding: false,
      postpartum: true,
      perimenopause: true,
      hormonalContraceptionStop: "2026-05-01",
    };
    const cycle1 = {
      startDate: "2026-01-01",
      days: Array.from({ length: 20 }, (_, i) => ({
        civilDate: "2026-01-01",
        cycleDay: i + 1,
        monitorReading: null,
        markers: [],
        annotations: [],
        dayStatus: null,
      })),
      mucusPeak: null,
      fertileWindow: null,
    };
    const cycle2 = {
      startDate: "2026-01-21",
      days: Array.from({ length: 36 }, (_, i) => ({
        civilDate: "2026-01-21",
        cycleDay: i + 1,
        monitorReading: null,
        markers: [],
        annotations: [],
        dayStatus: null,
      })),
      mucusPeak: null,
      fertileWindow: null,
    };
    const currentCycle = {
      startDate: "2026-02-26",
      days: Array.from({ length: 5 }, (_, i) => ({
        civilDate: "2026-02-26",
        cycleDay: i + 1,
        monitorReading: null,
        markers: [],
        annotations: [],
        dayStatus: null,
      })),
      mucusPeak: null,
      fertileWindow: null,
    };

    const warnings = evaluateEligibilityWarnings([cycle1, cycle2, currentCycle], today, profile);

    // Verify all circumstances present
    expect(warnings.length).toBeGreaterThanOrEqual(5);

    for (const warning of warnings) {
      // Framing: Limit belongs to the method's published instructions, never the app
      expect(warning.instructionLimit).toMatch(/Marquette|Clearblue/i);
      expect(warning.instructionLimit).not.toMatch(/Verelle/i);
      expect(warning.reason).not.toMatch(/Verelle/i);

      // Advice words check
      expect(forbiddenWordsIn(warning.reason)).toEqual([]);
      expect(forbiddenWordsIn(warning.instructionLimit)).toEqual([]);
      expect(forbiddenWordsIn(warning.conservativeGuidance)).toEqual([]);

      // Route to finding an instructor
      expect(warning.instructorRoute.label).toMatch(/instructor/i);
      expect(warning.instructorRoute.url).toMatch(/^https?:\/\//);
    }
  });
});
