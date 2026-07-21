#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
generated_dir="$repository_root/ios/Generated"
headers_dir="$generated_dir/Headers"
binding_dir="$generated_dir/Binding"
xcframework_path="$generated_dir/VerelleFFI.xcframework"
export IPHONEOS_DEPLOYMENT_TARGET="${IPHONEOS_DEPLOYMENT_TARGET:-17.0}"

mkdir -p "$headers_dir" "$binding_dir"
cd "$repository_root"

cargo build --release -p verelle-ffi
cargo run -p uniffi-bindgen -- generate \
  --library "$repository_root/target/release/libverelle_ffi.dylib" \
  --language swift \
  --no-format \
  --out-dir "$binding_dir"

cp "$binding_dir/verelle_ffiFFI.h" "$headers_dir/verelle_ffiFFI.h"
cp "$binding_dir/verelle_ffiFFI.modulemap" "$headers_dir/module.modulemap"
cp "$binding_dir/verelle_ffi.swift" "$generated_dir/verelle_ffi.swift"

cargo build --release -p verelle-ffi --target aarch64-apple-ios
cargo build --release -p verelle-ffi --target aarch64-apple-ios-sim

if [[ -e "$xcframework_path" ]]; then
  rm -rf "$xcframework_path"
fi
xcodebuild -create-xcframework \
  -library "$repository_root/target/aarch64-apple-ios/release/libverelle_ffi.a" \
  -headers "$headers_dir" \
  -library "$repository_root/target/aarch64-apple-ios-sim/release/libverelle_ffi.a" \
  -headers "$headers_dir" \
  -output "$xcframework_path"

swiftformat "$generated_dir/verelle_ffi.swift" >/dev/null 2>&1 || true
