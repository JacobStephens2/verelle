# Install the synthetic Verelle build on an Android phone

Prepared: 2026-07-19 (UTC)

This is a debug-signed, pre-release build for synthetic testing. It is not a
production app and must not hold real health data. Export and recovery are not
ready, so uninstalling or clearing app storage permanently removes its test
records.

## Prepared artifact

- APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Application ID: `app.verelle`
- Version: `0.2.0-local-recording` (`versionCode` 2)
- Minimum Android version: Android 8 / API 26
- Included ABIs: arm64-v8a, armeabi-v7a, x86, x86_64
- Size: 18 MiB
- SHA-256: `cf9144b2f6fa431254c46c4d026f383a0f4966d8fda7d655cc746c486460b311`

## Install

1. On the phone, enable Developer options and USB debugging, then connect it to
   this Linux machine and accept the phone's RSA authorization prompt.
2. Confirm that exactly the intended phone is listed:

   ```sh
   adb devices -l
   ```

3. From the repository root, verify and install the prepared build:

   ```sh
   sha256sum android/app/build/outputs/apk/debug/app-debug.apk
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

4. Open Verelle from the launcher. The red synthetic-testing warning must be
   visible. Start a synthetic cycle, save a monitor reading, force-stop the app,
   and reopen it. The chart and pending-operation count should remain.

## Measure the real-phone cold start

With the phone unlocked and Verelle force-stopped, run this three times:

```sh
adb shell am force-stop app.verelle
adb shell am start -W -n app.verelle/.MainActivity
```

Record each `TotalTime`. The Phase 2 target is less than 2,000 ms on the actual
phone; keep the individual results rather than reporting only the fastest one.

If installation reports `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, another build with
a different signing key is installed. Uninstalling it fixes the signature
conflict but irreversibly deletes that installation's local test data:

```sh
adb uninstall app.verelle
adb install android/app/build/outputs/apk/debug/app-debug.apk
```
