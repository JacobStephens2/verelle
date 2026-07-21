# Verelle for iPhone

The SwiftUI shell uses the same Rust `verelle-ffi` library and SQLite model as
Android. Generate the universal native framework and Xcode project before
building:

```sh
../scripts/build-ios-ffi.sh
xcodegen generate
xcodebuild -project Verelle.xcodeproj -scheme Verelle \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' test
```

Dataset keys are generated locally and retained in Keychain. The app records
and displays observations only; it does not calculate fertility status.
