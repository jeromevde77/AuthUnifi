# CLAUDE.md

## Project: AuthUnifi

A **captive portal** (public guest hotspot login page) for **UniFi** and **TP-Link
Omada** controllers. A guest connects to the WiFi, the controller redirects them
here, they authenticate, and the portal authorizes their device on the controller.

**Login methods** (each can be enabled/disabled from the admin panel):
- **Email + Facebook like** — collects an email and invites a page like.
- **Local account (email + password)** — admin-managed accounts, each with its own
  (longer) authorization duration.
- **OAuth** — SmartSchool, Google, or Microsoft 365.

**Features:** collected emails stored in SQLite; admin panel at `/admin` (view/export
emails, toggle methods, manage access durations); per-group access duration (Google /
Microsoft / SmartSchool group membership → custom duration).

**Stack:** Node.js + Express + EJS + better-sqlite3 (no build step, ESM).

**Key files:**
- `src/server.js` — Express routes (portal, login, OAuth, admin).
- `src/controller.js` — dispatches to `unifi.js` / `omada.js` per `CONTROLLER_TYPE`,
  normalizes the controller's redirect params.
- `src/oauth.js` — generic OAuth2 + group lookup. `src/groups.js` — duration rules.
- `src/methods.js` — which login methods are enabled. `src/db.js` — SQLite.
- `views/` — EJS pages. `public/styles.css` — UI.

**Run:** `cp .env.example .env` (fill controller + Facebook + admin token), then
`npm install && npm start` (or `docker compose up -d --build`).

**Docs:** `README.md` (full config), `SYNOLOGY.md`, `RASPBERRYPI.md` (deployment).

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
