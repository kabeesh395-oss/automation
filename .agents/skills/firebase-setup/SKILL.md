---
name: firebase-setup
description: >-
  Use when a project requires Firebase services (Auth, Firestore, Storage,
  Functions, Hosting). Handles project creation, SDK setup, security rules,
  and deployment configuration.
---

# Firebase Setup Skill

## Steps

1. **Check requirements** — confirm Firebase is actually needed (don't add by default).
2. **Project setup** — `firebase init` with only needed services.
3. **SDK integration** — add Firebase SDK to client/server code.
4. **Security rules** — write restrictive rules. NEVER `allow read, write: if true`.
5. **App Check** — enable where applicable.
6. **Environment config** — Firebase config via env vars, not hardcoded.
7. **Deploy** — `firebase deploy` for rules, functions, hosting.
8. **Verify** — test auth flows, data read/write, function invocations.

## Output
- Firebase configuration
- Security rules
- Integration code
- Deployment logs

## Never
- Use open security rules.
- Hardcode Firebase config in source.
- Enable services that aren't needed.
- Skip App Check for public-facing apps.
