#!/usr/bin/env bash
# Prove that one runtime-generated Shared owner converges through the real iOS
# and Android shells. Android joins the Shared owner, iOS records an
# Observation, and Android receives it through the Relay.
#
# This is the temporary #13 acceptance harness, not Pairing. The Shared owner
# exists only in this process and the two debug app launches. Product Pairing in
# #14 replaces both native debug injection paths and this script.
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(cd -- "$script_dir/.." && pwd)
android_sdk=${ANDROID_HOME:-"$HOME/Library/Android/sdk"}
adb="$android_sdk/platform-tools/adb"
emulator="$android_sdk/emulator/emulator"
java_home=${JAVA_HOME:-"/Applications/Android Studio.app/Contents/jbr/Contents/Home"}
derived_data="$repo/ios/DerivedData/CrossPlatformSyncSmoke"
emulator_pid=
ios_device=
android_test_pid=

cleanup() {
  if [ -n "$ios_device" ]; then
    xcrun simctl spawn "$ios_device" launchctl unsetenv \
      VERELLE_INTERIM_SHARED_OWNER >/dev/null 2>&1 || true
    xcrun simctl spawn "$ios_device" launchctl unsetenv \
      VERELLE_INTERIM_SHARED_OWNER_WORDS >/dev/null 2>&1 || true
  fi
  if [ -n "$android_test_pid" ]; then
    kill "$android_test_pid" >/dev/null 2>&1 || true
  fi
  if [ -n "$emulator_pid" ]; then
    kill "$emulator_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [ ! -x "$adb" ]; then
  echo "FAIL: Android adb was not found under $android_sdk"
  exit 1
fi

shared_owner=$(openssl rand -base64 32 | tr -d '\n')
expected_words=$(VERELLE_RUNTIME_OWNER="$shared_owner" node --input-type=module -e '
  import { OwnerSecret, ownerSecretToMnemonic } from "@evolu/common";
  const bytes = Uint8Array.from(Buffer.from(process.env.VERELLE_RUNTIME_OWNER, "base64"));
  process.stdout.write(ownerSecretToMnemonic(OwnerSecret.orThrow(bytes)).replaceAll(" ", ","));
')

cd "$repo"
npm run build
npx cap sync ios
npx cap sync android

android_serial=${VERELLE_ANDROID_SERIAL:-}
if [ -z "$android_serial" ]; then
  android_serial=$("$adb" devices | awk '$2 == "device" { print $1; exit }')
fi
if [ -z "$android_serial" ]; then
  if [ ! -x "$emulator" ]; then
    echo "FAIL: no Android device is connected and the emulator was not found"
    exit 1
  fi
  android_avd=${VERELLE_ANDROID_AVD:-$("$emulator" -list-avds | head -n 1)}
  if [ -z "$android_avd" ]; then
    echo "FAIL: no Android device or AVD is available"
    exit 1
  fi
  emulator_dns_args=()
  if command -v scutil >/dev/null 2>&1; then
    host_dns=$(scutil --dns \
      | awk '/nameserver\[[0-9]+\]/ { print $3 }' \
      | sort -u \
      | paste -sd, -)
    if [ -n "$host_dns" ]; then
      emulator_dns_args=(-dns-server "$host_dns")
    fi
  fi
  "$emulator" -avd "$android_avd" "${emulator_dns_args[@]}" \
    -no-window -no-audio -no-boot-anim \
    >/tmp/verelle-cross-platform-emulator.log 2>&1 &
  emulator_pid=$!
  "$adb" wait-for-device
  android_serial=$("$adb" devices | awk '$2 == "device" { print $1; exit }')
fi

boot_completed=
for _ in $(seq 1 120); do
  boot_completed=$("$adb" -s "$android_serial" shell getprop sys.boot_completed \
    2>/dev/null | tr -d '\r')
  if [ "$boot_completed" = "1" ]; then break; fi
  sleep 1
done
if [ "$boot_completed" != "1" ]; then
  echo "FAIL: Android device $android_serial did not finish booting"
  exit 1
fi
# A newly booted headless emulator can report boot completion while its
# lockscreen still owns accessibility. Unlock before UIAutomator starts.
"$adb" -s "$android_serial" shell input keyevent 82 >/dev/null
"$adb" -s "$android_serial" shell wm dismiss-keyguard >/dev/null
if ! "$adb" -s "$android_serial" shell ping -c 1 -W 2 free.evoluhq.com \
  >/dev/null 2>&1; then
  echo "FAIL: Android cannot resolve the Evolu Relay; check emulator DNS"
  exit 1
fi

ANDROID_HOME="$android_sdk" JAVA_HOME="$java_home" \
  "$repo/android/gradlew" -p "$repo/android" \
    :app:assembleDebug :app:assembleDebugAndroidTest --console=plain

"$adb" -s "$android_serial" install -r \
  "$repo/android/app/build/outputs/apk/debug/app-debug.apk" >/dev/null
"$adb" -s "$android_serial" install -r \
  "$repo/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk" >/dev/null
"$adb" -s "$android_serial" shell pm clear app.verelle >/dev/null
# Start Android's assertion first so it stays subscribed while iOS publishes.
# The test verifies the interim owner before waiting for the remote Observation.
"$adb" -s "$android_serial" shell am instrument -w -r \
  -e class app.verelle.ExampleInstrumentedTest#receivesObservationRecordedOnIos \
  -e sharedOwner "$shared_owner" \
  -e expectedWords "$expected_words" \
  app.verelle.test/androidx.test.runner.AndroidJUnitRunner \
  >/tmp/verelle-cross-platform-android-test.log &
android_test_pid=$!
sleep 5

ios_device=$(xcrun simctl list devices booted -j \
  | jq -r 'first(.devices[][] | select(.name | test("^iPhone")) | .udid)')
if [ -z "$ios_device" ] || [ "$ios_device" = "null" ]; then
  ios_device=$(xcrun simctl list devices available -j \
    | jq -r 'first(.devices[][] | select(.name | test("^iPhone")) | .udid)')
  if [ -z "$ios_device" ] || [ "$ios_device" = "null" ]; then
    echo "FAIL: no iPhone simulator is available"
    exit 1
  fi
  xcrun simctl boot "$ios_device"
fi
xcrun simctl bootstatus "$ios_device" -b
# Each run creates a different Shared owner. Remove the previous app container
# so a same-date row owned by an older run cannot make the recorder look edited
# when the new owner has not written anything.
xcrun simctl uninstall "$ios_device" app.verelle >/dev/null 2>&1 || true

xcrun simctl spawn "$ios_device" launchctl setenv \
  VERELLE_INTERIM_SHARED_OWNER "$shared_owner"
xcrun simctl spawn "$ios_device" launchctl setenv \
  VERELLE_INTERIM_SHARED_OWNER_WORDS "$expected_words"

xcodebuild -quiet test \
  -project "$repo/ios/App/App.xcodeproj" \
  -scheme App \
  -destination "id=$ios_device" \
  -derivedDataPath "$derived_data" \
  -only-testing:AppUITests/ObservationPersistenceUITests/testPublishesObservationForAndroid

xcresult=$(find "$derived_data/Logs/Test" -maxdepth 2 -type d -name '*.xcresult' \
  -print | sort | tail -n 1)
ios_passed=$(xcrun xcresulttool get test-results summary --path "$xcresult" \
  | jq -r '.passedTests')
if [ "$ios_passed" != "1" ]; then
  xcrun xcresulttool get test-results summary --path "$xcresult"
  echo "FAIL: the iOS cross-platform test did not pass"
  exit 1
fi
wait "$android_test_pid"
android_test_pid=
instrumentation_output=$(< /tmp/verelle-cross-platform-android-test.log)
if printf '%s\n' "$instrumentation_output" \
  | rg -q 'FAILURES|INSTRUMENTATION_FAILED|Process crashed'; then
  printf '%s\n' "$instrumentation_output"
  exit 1
fi
if ! printf '%s\n' "$instrumentation_output" | rg -q '^OK \(1 test\)$'; then
  printf '%s\n' "$instrumentation_output"
  echo "FAIL: Android did not report a completed cross-platform test"
  exit 1
fi

echo "ok: an iOS Observation converged onto Android through the Shared owner"
