#!/usr/bin/env bash
# Launch the built iOS app on a simulator, record an Observation through the
# rendered controls, kill the process, and assert the Observation survives a
# cold relaunch.
#
# Compiling is not launching, and alive is not painted: a blank WebView passes
# any liveness check. ChartFrame.vue logs the frame's laid-out bounding box on
# mount, and Capacitor bridges that to the app's stdout rather than to os_log,
# so the launch is attached to a pty and this waits for a line reporting the
# full set of cycle day columns at a non-zero size.
#
# A paint breadcrumb alone would also pass if Evolu silently hung. The native
# UI test drives all four mandatory fields through WebKit accessibility, waits
# for the saved Monitor reading in the Chart, terminates the process, launches
# it again, and reads that same value back from the Chart and recording screen.
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

console=$(mktemp -t verelle-app-console)
cleanup() {
  rm -f "$console"
}
trap cleanup EXIT

bundle_id=app.verelle
painted='verelle: chart frame painted, 42 cycle day columns, [1-9][0-9]*x[1-9][0-9]*'
paint_timeout_seconds=90
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

  : > "$console"
  xcrun simctl launch --console-pty "$device" "$bundle_id" > "$console" 2>&1 &
  launch_pid=$!

  for _ in $(seq 1 "$paint_timeout_seconds"); do
    if grep -qE "$painted" "$console"; then break; fi
    sleep 1
  done

  # Evidence for a human, not the assertion: a headless simulator often hands
  # back a white frame for a WebView it has in fact laid out.
  xcrun simctl io "$device" screenshot "$screenshot" || true
  kill "$launch_pid" 2>/dev/null || true

  if grep -E "$painted" "$console"; then
    echo "ok: the chart frame painted in the WebView on attempt $attempt"

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

    xcrun simctl io "$device" screenshot "$screenshot" || true
    echo "FAIL: the recorded Observation did not survive a cold iOS relaunch"
    exit 1
  fi

  echo "attempt $attempt: the chart frame never reported painting"
  cat "$console"
done

echo "FAIL: the chart frame never reported painting at a non-zero size in $attempts attempts"
exit 1
