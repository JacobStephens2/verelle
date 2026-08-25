#!/bin/bash
# PROTOTYPE. Throwaway.
# The diagnosis loop: rebuild the web assets, hot-swap them into the already
# installed simulator app, relaunch, and print what the probe reported.
# Skips xcodebuild entirely — the native shell never changes.
set -e
cd "$(dirname "$0")/.."

BUNDLE=com.verelle.probe
OUT=${OUT:-/tmp/probe-report.json}
rm -f /tmp/probe-*.json

VITE_PROBE_REPORT=http://localhost:4500/report npx vite build >/dev/null
APPDIR=$(xcrun simctl get_app_container booted $BUNDLE app)
rm -rf "$APPDIR/public/assets"
cp -R dist/assets "$APPDIR/public/assets"
cp dist/index.html "$APPDIR/public/index.html"

xcrun simctl terminate booted $BUNDLE 2>/dev/null || true
xcrun simctl launch booted $BUNDLE >/dev/null

for _ in $(seq 1 40); do
  sleep 0.5
  if [ -f /tmp/probe-final.json ] || [ -f /tmp/probe-boot-failed.json ]; then break; fi
done

if [ -f "$OUT" ]; then
  node -e '
    const fs = require("fs");
    const pick = ["/tmp/probe-boot-failed.json","/tmp/probe-after-loadQuery.json","/tmp/probe-booted.json"].find(p=>fs.existsSync(p)) ?? process.argv[1];
    const r = JSON.parse(fs.readFileSync(pick, "utf8"));
    console.log("stage:", r.stage);
    if (r.error) console.log("error:", r.error);
    if (r.log) console.log("log:\n  " + r.log.join("\n  "));
    if (r.opfs) console.log("opfs:", r.opfs.map(x => `${x.ok?"ok":"FAIL"} ${x.step}${x.ok?"":" -> "+x.detail}`).join("\n      "));
  ' "$OUT"
else
  echo "NO REPORT RECEIVED"
  exit 1
fi
