---
name: security-scan
description: >-
  Use before PRs and at Gate 6. Runs secret scanning, dependency audits,
  SAST, and configuration checks. Produces security_report.json.
---

# Security Scan Skill

## Steps

1. **Secret scan** — run gitleaks (or equivalent) on the entire repo.
2. **Dependency audit** — `npm audit` / Gradle dependency check.
3. **SAST** — static analysis where tools are available.
4. **Configuration review**:
   - No debug flags in production
   - No open Firebase rules
   - No cleartext traffic enabled
   - No hardcoded credentials
   - No overly permissive CORS
5. **Generate report** — `security_report.json` following schema.
6. **Classify findings** — critical / high / medium / low.
7. **Create fix tasks** — for critical and high findings.

## Output
- `state/artifacts/security_report.json`
- Fix tasks for critical/high findings

## Never
- Ignore critical findings.
- Ship with known high-severity vulnerabilities.
- Disable security tools to "pass" the scan.
