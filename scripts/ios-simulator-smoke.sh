#!/usr/bin/env bash
# Launch the built iOS app on a simulator, record an Observation through the
# rendered controls, kill the process, and assert the Observation survives a
# cold relaunch.
#
# Compiling is not launching, and alive is not painted: a blank WebView passes
# a process-liveness check. The native UI test drives all four mandatory fields
# through WebKit accessibility, waits
# for the saved Monitor reading in the Chart, terminates the process, launches
# it again, and reads that same value back from the Chart and recording screen.
# It is also the paint check: Capacitor bridge logging is deliberately disabled
# because debug logging includes plugin payloads, and OwnerSecrets payloads
# contain Owner secret material that must never be logged (ADR 0013).
#
# The whole boot-install-launch is retried, because the hosted macOS runners
# fairly often hand back a simulator that never finishes booting - it sits on
# "Waiting on System App" and then reports Status=4294967295 without failing
# the command. A second attempt on a freshly erased device clears it.
#
# Run with: scripts/ios-simulator-smoke.sh <path to App.app> [screenshot path]
set -euo pipefail

app_path=${1:?usage: ios-simulator-smoke.sh <path to App.app> [screenshot path]}
screenshot=${2:-verelle-launch.png}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
project="$script_dir/../ios/App/App.xcodeproj"

app_dir=$(cd -- "$(dirname -- "$app_path")" && pwd)
app_path="$app_dir/$(basename -- "$app_path")"
case "$app_path" in
  */Build/Products/*) derived_data=${app_path%%/Build/Products/*} ;;
  *)
    echo "FAIL: App.app must be inside an Xcode derived-data Build/Products directory"
    exit 1
    ;;
esac

bundle_id=app.verelle
attempts=2

# An iPhone the runner already has. Creating a device instead costs a fresh
# MobileAsset migration on first boot, which is where the boot tends to stall.
device=$(xcrun simctl list devices available -j \
  | jq -r 'first(.devices[][] | select(.name | test("^iPhone")) | .udid)')
if [ -z "$device" ] || [ "$device" = "null" ]; then
  echo "FAIL: the runner has no available iPhone simulator"
  xcrun simctl list devices available
  exit 1
fi
echo "Using simulator $device"

for attempt in $(seq 1 "$attempts"); do
  xcrun simctl shutdown "$device" >/dev/null 2>&1 || true
  xcrun simctl erase "$device" >/dev/null 2>&1 || true
  xcrun simctl boot "$device" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$device" || true

  xcrun simctl install "$device" "$app_path"

  xcrun simctl launch "$device" "$bundle_id" >/dev/null
  sleep 2
  # Evidence for a human, not the assertion: the accessibility-driven UI test
  # below is what fails if the WebView did not paint or Evolu hung.
  xcrun simctl io "$device" screenshot "$screenshot" || true

  if xcodebuild -quiet test \
    -project "$project" \
    -scheme App \
    -destination "id=$device" \
    -derivedDataPath "$derived_data"; then
    # Xcode closes the app when the UI test runner exits. Open it once more
    # so the artifact shows the same persisted state the test just asserted.
    xcrun simctl launch "$device" "$bundle_id" >/dev/null
    sleep 2
    xcrun simctl io "$device" screenshot "$screenshot" || true
    echo "ok: the recorded Observation survived a cold iOS relaunch"
    exit 0
  fi

  echo "attempt $attempt: the WebView persistence test failed"
done

echo "FAIL: the recorded Observation did not survive a cold iOS relaunch"
exit 1
