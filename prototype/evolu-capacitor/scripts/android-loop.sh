#!/bin/bash
# PROTOTYPE. Throwaway.
# Android counterpart of ios-loop.sh. Reads the probe's state out of logcat,
# because Android's https://localhost origin blocks a cleartext debug POST as
# mixed content — and logcat keeps working with the network off.
set -e
cd "$(dirname "$0")/.."
export JAVA_HOME=${JAVA_HOME:-"/Applications/Android Studio.app/Contents/jbr/Contents/Home"}
export ANDROID_HOME=${ANDROID_HOME:-"$HOME/Library/Android/sdk"}
export PATH="$ANDROID_HOME/platform-tools:$PATH"

BUNDLE=com.verelle.probe

if [ "${SKIP_BUILD:-}" != "1" ]; then
  VITE_PROBE_REPORT=${VITE_PROBE_REPORT:-http://10.0.2.2:4500/report} \
    npx vite build >/dev/null
  npx cap copy android >/dev/null
  (cd android && ./gradlew assembleDebug -q >/dev/null)
  adb install -r android/app/build/outputs/apk/debug/app-debug.apk >/dev/null
fi

adb shell am force-stop $BUNDLE
adb logcat -c
adb shell am start -n $BUNDLE/.MainActivity >/dev/null
sleep 12

# Keep the raw reports: the logcat ring buffer rotates and they are gone.
adb logcat -d 2>/dev/null | grep -o 'PROBE_REPORT {.*}' | sed 's/^PROBE_REPORT //' > /tmp/android-probe.jsonl
node -e '
  const s = require("fs").readFileSync("/tmp/android-probe.jsonl", "utf8");
  {
    const seen = new Map();
    for (const line of s.split("\n").filter(Boolean)) {
      try { const r = JSON.parse(line); seen.set(r.stage, r); } catch {}
    }
    for (const [stage, r] of seen) {
      if (["final","boot-failed","after-loadQuery"].includes(stage))
        console.log(`[${stage}]`, JSON.stringify({ detail: r.detail, error: r.error, rows: r.rows, devices: r.devices }));
    }
    const boot = seen.get("booted") ?? seen.get("boot-failed");
    if (boot && boot.log) console.log("log:\n  " + boot.log.join("\n  "));
    if (boot && boot.opfs && boot.opfs.length)
      console.log("opfs:", boot.opfs.every((x) => x.ok) ? "all ok" : JSON.stringify(boot.opfs.filter((x) => !x.ok)));
  }
'
