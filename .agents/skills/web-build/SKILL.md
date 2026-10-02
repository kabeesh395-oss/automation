---
name: web-build
description: >-
  Use when building web applications. Handles project setup (Vite/Next.js),
  development server, production builds, and web deployment artifacts.
---

# Web Build Skill

## Steps

1. **Verify environment** — Node.js, npm/yarn, framework CLI.
2. **Initialize project** — use `npx -y` with appropriate generator, non-interactive mode.
3. **Set up dev server** — `npm run dev` for local development.
4. **Build production** — `npm run build`, verify output.
5. **Test in browser** — use browser agent to verify key flows.
6. **Package** — web bundle, static assets, container if needed.

## Framework Selection
- Simple static site → vanilla HTML/CSS/JS
- SPA → Vite + React/Vue
- SSR/Full-stack → Next.js
- User preference overrides defaults.

## Output
- Build logs
- Production bundle path + size
- Browser verification screenshots

## Never
- Use TailwindCSS unless user explicitly requests it.
- Skip production build validation.
- Deploy to production without approval.
