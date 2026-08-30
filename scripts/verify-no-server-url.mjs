// ADR 0010: the native shells bundle their assets and never live-load. This
// fails the build if a `server` url appears anywhere it would take effect -
// the source Capacitor config, or either generated native config.
//
// It is a build gate rather than a code review note because the failure it
// guards is invisible on a developer's desk: with signal, a live-loading shell
// behaves identically to a bundled one. It only shows up as a dead app in
// airplane mode, which is precisely when the app is being used.
//
// Run with: npm run verify:no-server-url
import { readFile } from "node:fs/promises";

const sourceConfig = "capacitor.config.ts";
const nativeConfigs = [
  "ios/App/App/capacitor.config.json",
  "android/app/src/main/assets/capacitor.config.json",
];

const failures = [];

async function readIfPresent(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

const source = await readIfPresent(sourceConfig);
if (source === null) {
  failures.push(`${sourceConfig}: missing`);
} else {
  // Comments in this file explain why `server.url` is absent, so match the
  // `server:` key itself rather than the words. A url only takes effect under
  // that key, so catching the key catches the url.
  if (/^\s*server\s*:/m.test(stripComments(source))) {
    failures.push(`${sourceConfig}: declares a server config`);
  }
}

for (const file of nativeConfigs) {
  const text = await readIfPresent(file);
  if (text === null) continue; // Platform not added on this machine.

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    failures.push(`${file}: not valid JSON (${error.message})`);
    continue;
  }
  if (parsed.server !== undefined) {
    failures.push(`${file}: has a "server" key (${JSON.stringify(parsed.server)})`);
  }
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

if (failures.length > 0) {
  console.error("server.url must never be set - see ADR 0010:");
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}

console.log("ok: no server url in the Capacitor config or the native configs");
