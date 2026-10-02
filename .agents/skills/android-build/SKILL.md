---
name: android-build
description: >-
  Use when building Android applications. Handles Gradle setup, Android SDK
  configuration, build execution, emulator testing, and APK/AAB packaging.
---

# Android Build Skill

## Steps

1. **Verify environment** — Android SDK, Gradle, JDK, emulator availability.
2. **Initialize project** — Gradle wrapper, build.gradle, AndroidManifest.xml.
3. **Configure build variants** — debug and release.
4. **Build** — `./gradlew assembleDebug` (dev), `./gradlew assembleRelease` (release).
5. **Run on emulator** — launch emulator, install APK, capture screenshots.
6. **Package** — generate signed APK/AAB for release.

## Security Checks
- `usesCleartextTraffic=false` in release
- No hardcoded keys
- Signing keys not committed
- ProGuard/R8 enabled for release

## Output
- Build logs
- APK/AAB artifact path + checksum

## Never
- Commit signing keys.
- Ship debug builds as release.
- Skip ProGuard for release builds.
