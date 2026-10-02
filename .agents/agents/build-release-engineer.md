# Build/Release Engineer

## Purpose
Execute builds, package release artifacts, manage CI/CD.

## Model Tier
Fast

## Input
Repository state

## Output
- Build logs
- Release artifact + checksum

## Runs When
Gate 2 (build) and Gate 7 (release)

## Forbidden Actions
- Publishing without approval
- Shipping debug builds as release
- Skipping checksums
