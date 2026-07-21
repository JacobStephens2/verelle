# Verelle Android

The Android-first Phase 2 walking skeleton is a Kotlin/Jetpack Compose app over
the same Rust chart, crypto, sync-operation, and SQLite store code used by the
workspace tests. It remains pre-release and must not yet be used as a chart of
record.

## Implemented local path

- Rust/UniFFI fixture replay with typed Kotlin chart records.
- Crash-safe local SQLite storage and encrypted outbox creation in Rust.
- A 32-byte local dataset key wrapped at rest by a non-exportable Android
  Keystore AES key; Android backup is disabled and the app requests no network
  permission.
- Cycle-start, monitor-reading, bleeding, explicit user-marked Peak, and note
  entry.
- Rust-rendered chart values and mechanical P/P+1/P+2/P+3 annotations.
- Confirmed deletion of the supported day entries, plus JSON and CSV sharing.
- A user-configured, local, inexact daily reminder whose notification contains
  no chart values or fertility information.

The remaining Phase 2 work includes the rest of the supplemental-observation
forms, production-grade navigation/accessibility polish, migration and storage
fault injection on Android itself, a physical-phone cold-start measurement, and
the real-day/instructor gates. Accounts, production sync, and couple sharing are
Phase 3 work and remain gated as described in the root plan.

## Toolchain

- JDK 17 or newer (Android Studio's bundled JDK works)
- Android SDK 36 and Build Tools 36.0.0
- Android NDK `28.2.13676358`
- Rust 1.85 or newer with `aarch64-linux-android` and
  `x86_64-linux-android` targets

UniFFI is pinned to `0.29.5`: it supports the repository's Rust 1.85 minimum,
whereas newer generator dependencies tested during the spike required a newer
compiler. Gradle invokes `scripts/build-android-bindings.sh`, which builds both
Android ABIs and generates Kotlin into `core/build/`; generated bindings and
native libraries are not edited or committed.

## Build and test

Set `ANDROID_SDK_ROOT` if the SDK is not in the platform-default location, then:

```sh
rustup target add aarch64-linux-android x86_64-linux-android
cd apps/android
./gradlew :app:testDebugUnitTest \
  :app:assembleDebug \
  :app:assembleDebugAndroidTest \
  :core:assembleDebugAndroidTest
```

With an emulator or phone visible to `adb`:

```sh
./gradlew connectedDebugAndroidTest
```

The device suite verifies golden-fixture parity through UniFFI, native SQLite
close/reopen persistence, export, and Compose chart rendering. The architecture
spike was exercised on an ARM64 Pixel 7 AVD running Android 16 / API 36.

To reproduce that AVD on an Apple Silicon Mac:

```sh
sdkmanager \
  'platforms;android-36' \
  'build-tools;36.0.0' \
  'ndk;28.2.13676358' \
  'system-images;android-36;google_apis;arm64-v8a'
echo no | avdmanager create avd \
  --name Verelle_Phone_API_36 \
  --package 'system-images;android-36;google_apis;arm64-v8a' \
  --device pixel_7
```

Clearing app data removes both the database and its wrapped local key. If the
Keystore material is missing while a database remains, startup fails closed
instead of silently creating a key that cannot decrypt the queued operations.
