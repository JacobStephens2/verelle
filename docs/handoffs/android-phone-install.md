# Install the founder-test Verelle build on an Android phone

Prepared: 2026-07-20 (UTC)

This is a debug-signed, pre-release founder-test build. It can create an account,
sign in again on an enrolled installation, or recover an account onto a fresh
installation using OPAQUE and an Android Keystore-backed device key. It
synchronizes end-to-end encrypted records. It is not a production release: save
the displayed recovery code offline before entering health data, and do not
uninstall or clear app storage without first confirming recovery/export.

## Prepared artifact

- APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- Application ID: `app.verelle`
- Version: `0.4.0-account-recovery` (`versionCode` 4)
- Minimum Android version: Android 8 / API 26
- Included ABIs: arm64-v8a, armeabi-v7a, x86, x86_64
- Size: 18.8 MiB (19,741,345 bytes)
- SHA-256: `56dabc66f1bbed5bce56d9be222bd4f99e6528ea57244e8cdccb4d4d8e9ffae0`

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

4. Open Verelle from the launcher. On a fresh installation, create an account or
   recover an existing one with its offline recovery code. Password sign-in is
   available after this installation is enrolled. Keep every newly issued
   recovery code offline. Start a cycle, save a monitor reading, force-stop the
   app, and reopen it. The chart should remain and the encrypted
   pending-operation count should drain after sync.

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
