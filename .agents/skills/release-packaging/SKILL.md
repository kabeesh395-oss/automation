---
name: release-packaging
description: >-
  Use at the final stage to package release artifacts. Handles APK/AAB signing,
  web bundles, container images, checksumming, and release documentation.
---

# Release Packaging Skill

## Steps

1. **Verify all gates passed** — Gates 1–6 must be `pass` before packaging.
2. **Build release artifact**:
   - Android: signed APK/AAB (`./gradlew assembleRelease` or `bundleRelease`)
   - Web: production bundle (`npm run build`)
   - Backend: container image or deployment package
3. **Checksum** — SHA256 hash of the artifact.
4. **Generate release notes** — from commit history since last release.
5. **Write verification_report.json** — summary of all gate results with evidence.
6. **Create PR** — `feature/*` → `development` with full report.
7. **Stage for approval** — publishing requires human approval.

## Output
- Release artifact (APK/AAB, web bundle, or container)
- Artifact checksum
- `state/artifacts/verification_report.json`
- Release notes
- PR

## Gate 7 Check
- Valid artifact exists
- Checksum computed and recorded
- Artifact path documented

## Never
- Publish without human approval.
- Ship without all gates passing.
- Skip the checksum step.
- Include debug symbols in release artifacts.
