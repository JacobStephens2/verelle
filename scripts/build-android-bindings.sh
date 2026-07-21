#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
    echo "usage: $0 JNI_OUTPUT_DIR KOTLIN_OUTPUT_DIR" >&2
    exit 2
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
jni_output=$1
kotlin_output=$2
sdk_root=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
ndk_version=${VERELLE_NDK_VERSION:-28.2.13676358}
ndk_root=${ANDROID_NDK_HOME:-$sdk_root/ndk/$ndk_version}
android_api=${VERELLE_ANDROID_MIN_API:-26}

case "$(uname -s)" in
    Darwin) ndk_host=darwin-x86_64 ;;
    Linux) ndk_host=linux-x86_64 ;;
    *)
        echo "unsupported Android build host: $(uname -s)" >&2
        exit 1
        ;;
esac

toolchain=$ndk_root/toolchains/llvm/prebuilt/$ndk_host
if [ ! -d "$toolchain" ]; then
    echo "Android NDK $ndk_version is missing at $ndk_root" >&2
    echo "Install it with sdkmanager 'ndk;$ndk_version'." >&2
    exit 1
fi

for rust_target in aarch64-linux-android x86_64-linux-android; do
    if ! rustup target list --installed | grep -qx "$rust_target"; then
        echo "Rust target $rust_target is missing; run rustup target add $rust_target" >&2
        exit 1
    fi
done

rm -rf "$jni_output" "$kotlin_output"
mkdir -p "$jni_output/arm64-v8a" "$jni_output/x86_64" "$kotlin_output"

cd "$repo_root"

arm64_linker=$toolchain/bin/aarch64-linux-android${android_api}-clang
env \
    CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$arm64_linker" \
    CC_aarch64_linux_android="$arm64_linker" \
    AR_aarch64_linux_android="$toolchain/bin/llvm-ar" \
    cargo build --locked --release -p verelle-ffi --target aarch64-linux-android
cp target/aarch64-linux-android/release/libverelle_ffi.so \
    "$jni_output/arm64-v8a/libverelle_ffi.so"

x86_64_linker=$toolchain/bin/x86_64-linux-android${android_api}-clang
env \
    CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$x86_64_linker" \
    CC_x86_64_linux_android="$x86_64_linker" \
    AR_x86_64_linux_android="$toolchain/bin/llvm-ar" \
    cargo build --locked --release -p verelle-ffi --target x86_64-linux-android
cp target/x86_64-linux-android/release/libverelle_ffi.so \
    "$jni_output/x86_64/libverelle_ffi.so"

cargo run --locked --release -p verelle-ffi --features cli --bin uniffi-bindgen -- \
    generate \
    --library "$jni_output/arm64-v8a/libverelle_ffi.so" \
    --language kotlin \
    --config crates/verelle-ffi/uniffi.toml \
    --out-dir "$kotlin_output" \
    --no-format
