#!/bin/bash
# PROTOTYPE. Throwaway.
# Criteria 2 and 3 without two physical phones: two simulators, one seeded
# SharedOwner, syncing through the inspecting relay so every frame is seen.
#
#   node scripts/inspect-relay.mjs &        # in another shell
#   node scripts/collector.mjs &
#   MNEMONIC="<24 words>" ./scripts/two-device-test.sh
set -e
cd "$(dirname "$0")/.."

BUNDLE=com.verelle.probe
A=${A:-"iPhone 17 Pro"}
B=${B:-"iPhone 17e"}
RELAY=${RELAY:-ws://localhost:4499}
MNEMONIC=${MNEMONIC:?set MNEMONIC to a 24-word shared owner mnemonic}
APP=${APP:?set APP to the built App.app path}

echo "== build: relay=$RELAY, seeded SharedOwner"
VITE_PROBE_REPORT=http://localhost:4500/report \
VITE_PROBE_RELAY="$RELAY" \
VITE_PROBE_SHARED_MNEMONIC="$MNEMONIC" \
  npx vite build >/dev/null

# The .app carries whatever web assets the last xcodebuild put there; refresh
# them from dist so both simulators run the build we just made.
rm -rf "$APP/public/assets"
cp -R dist/assets "$APP/public/assets"
cp dist/index.html "$APP/public/index.html"

for D in "$A" "$B"; do
  xcrun simctl boot "$D" >/dev/null 2>&1 || true
done
sleep 3

for D in "$A" "$B"; do
  echo "== $D: install + launch"
  xcrun simctl install "$D" "$APP" >/dev/null
  xcrun simctl terminate "$D" $BUNDLE >/dev/null 2>&1 || true
  rm -f /tmp/probe-final.json
  xcrun simctl launch "$D" $BUNDLE >/dev/null
  for _ in $(seq 1 30); do
    sleep 0.5
    [ -f /tmp/probe-final.json ] && break
  done
  if [ -f /tmp/probe-final.json ]; then
    node -e '
      const r = JSON.parse(require("fs").readFileSync("/tmp/probe-final.json","utf8"));
      console.log("   rows:", r.rows, " devices:", JSON.stringify(r.devices));
    '
  else
    echo "   NO REPORT"
  fi
done

echo
echo "== convergence is proven when the second device reports rows from BOTH devices."
echo "== ciphertext is proven by the inspect-relay output: printable% low, no leaks."
