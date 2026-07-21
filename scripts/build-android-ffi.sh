#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
kotlin_out="${1:-$repo_root/android/app/build/generated/source/uniffi}"
jni_out="${2:-$repo_root/android/app/build/generated/jniLibs}"

ndk_root="${ANDROID_NDK_HOME:-${ANDROID_NDK_ROOT:-}}"
if [[ -z "$ndk_root" && -n "${ANDROID_HOME:-}" && -d "$ANDROID_HOME/ndk" ]]; then
    ndk_root="$(find -L "$ANDROID_HOME/ndk" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
fi
if [[ -z "$ndk_root" || ! -x "$ndk_root/ndk-build" ]]; then
    echo "Set ANDROID_NDK_HOME to an installed Android NDK." >&2
    exit 1
fi

mkdir -p "$kotlin_out" "$jni_out"

cd "$repo_root"
cargo build --locked --release -p verelle-ffi
case "$(uname -s)" in
    Darwin) host_library="$repo_root/target/release/libverelle_ffi.dylib" ;;
    Linux) host_library="$repo_root/target/release/libverelle_ffi.so" ;;
    *)
        echo "Unsupported UniFFI host platform: $(uname -s)" >&2
        exit 1
        ;;
esac
cargo run --locked -p uniffi-bindgen -- \
    generate \
    --library "$host_library" \
    --language kotlin \
    --no-format \
    --out-dir "$kotlin_out"

ANDROID_NDK_HOME="$ndk_root" cargo ndk \
    --platform 26 \
    --target arm64-v8a \
    --target x86_64 \
    --output-dir "$jni_out" \
    build --locked --release -p verelle-ffi
