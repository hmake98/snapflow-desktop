# Claude Code Instructions for SnapFlow Desktop

Always loaded — keep this short and universal. Anything specific to `main/`, `renderer/`, or `supabase/` belongs in that directory's own `CLAUDE.md` (Claude Code loads those automatically when you touch a file there) — don't duplicate it here.

## Project Overview

**SnapFlow Desktop** — screenshot and session capture tool with team collaboration, multi-tenant workspaces, and sync to GitHub and Zoho Projects.

- **Framework:** Nextron (Next.js + Electron). Main entry: `app/main.js`, bundled from `main/main.ts`.
- **Language:** TypeScript.
- **UI:** Next.js (renderer process), Tailwind CSS, Radix UI, Framer Motion, Konva (annotation canvas).
- **State:** Zustand (`renderer/store/useStore.ts`).
- **Database / Auth / Storage:** Supabase.
- **AI provider SDKs:** `@anthropic-ai/sdk`, `openai` (Anthropic, OpenAI, Groq, Gemini — routed through `main/services/ai.ts`).

## Layout

```
main/       Electron main process — see main/CLAUDE.md
renderer/   Next.js app (renderer process) — see renderer/CLAUDE.md
supabase/   Migrations, RLS, email templates — see supabase/CLAUDE.md
resources/  Tray icons, entitlements, app-bootstrap.json
app/        Nextron build output. NEVER EDIT.
```

Two processes. **Cross only via IPC** — never import `main/` from `renderer/` or vice versa.

## Domain vocabulary and past decisions

- `CONTEXT.md` (repo root) — the domain glossary. Use its terms precisely; don't drift to a synonym it says to avoid.
- `docs/adr/` — Architecture Decision Records. Read the ones that touch the area you're working in before assuming _why_ something is built a certain way. If your change would contradict one, say so explicitly rather than silently overriding it.
- See `docs/agents/domain.md` for how to consume both.

## Issue tracker

Issues tracked as GitHub Issues (`hmake98/snapflow-desktop`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

## Run, build, and find logs

- `npm run dev` — Nextron dev server (Next.js + Electron, hot reload).
- `npm run build` — Next.js build only (CI validation, no installers).
- `npm run build:pack` — full production build with installers.
- Logs: `~/Library/Logs/SnapFlow/` (macOS), `%APPDATA%/SnapFlow/logs/` (Windows), `~/.config/SnapFlow/logs/` (Linux). Excerpt the relevant lines (last error stack + ~20 lines context) — never paste a whole log file:
  ```bash
  tail -500 ~/Library/Logs/SnapFlow/main.log | grep -B 2 -A 20 -i 'error\|failed\|exception'
  ```

## Coding standards

- **Comments:** default to none — names should carry meaning. Comment only when the _why_ is non-obvious (a workaround, a platform quirk, a hidden constraint). Never narrate _what_ the next line does.
- **Security:** never trust client-side auth checks — verify server-side. Don't hardcode URLs — use environment variables. `safeStorage`/`getSupabaseAdmin()` for service-role operations, never the client.
- **Formatting:** Prettier + ESLint via Husky pre-commit.

### Before committing

1. `npm run format`
2. `npm run lint`
3. `npm run type-check`
4. `npm run build` (CI validation)
5. No console errors in dev tools
6. No secrets in code or logs

### Git workflow

- Branch from `main`. Squash before merging.
- Conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
- Never force-push to `main`.

## Non-negotiables

Cheap enough to state here even for a purely conceptual task that touches no subdirectory.

- Never commit `.env` or log secrets (tokens, passwords, session IDs).
- Every user-facing Supabase query must filter by `workspace_id`, even though RLS also enforces it — defense in depth.
- Don't trust any specific file/function/package name in prose docs — including this repo's own — without checking it against the source first. This codebase's docs have drifted from the code before: `update-electron-app` vs. the actual `electron-updater` (ADR-0006), a Zoho token-validation stub that silently did nothing (ADR-0001/0002), a renamed `background.ts` → `main.ts` that stayed wrong in prose for months.

---

**Maintained By**: Team
