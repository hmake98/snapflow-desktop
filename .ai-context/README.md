# `.ai-context/` — Loading rules

Static context for AI coding assistants working on SnapFlow Desktop. **Load selectively.** Never read every file.

## Always loaded

`CLAUDE.md` (repo root) — canonical project doc. Already in the system prompt; do not re-read.

## Load on demand

Pick the file(s) that match the task. Stop there.

| You are about to...                           | Load                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Add or modify an IPC handler                  | `ipc-map.md`, `coding-standards.md`                                                                    |
| Touch a `main/services/*.ts` file             | `services.md` to find the file; `coding-standards.md` for the pattern                                  |
| Add or modify a renderer page                 | `pages.md`                                                                                             |
| Debug recording / capture flow                | `ipc-map.md` (capture + recording sections), `services.md` (capture, recorder, window-picker, overlay) |
| Touch sync, offline queue, or Supabase        | `services.md` (sync, workspace), `glossary.md` (Snap vs Issue)                                         |
| Touch auth, onboarding, invites               | `services.md` (auth, onboarding, workspace, tenant), `workflows.md`                                    |
| Add a Supabase migration                      | `workflows.md` § "Add a migration"                                                                     |
| Read or write `main/background.ts`            | `ipc-map.md` **first** — find the handler by name, read only the relevant range                        |
| Understand stack / build / process boundaries | `architecture.md`                                                                                      |

## Never load

- `ARCHITECTURE_PROPOSAL.md` — design record, not a runtime artifact. Read once if curious.
- `node_modules/`, `app/` (Nextron build output), `package-lock.json`, `dist/`, `release/`.

## Token budget

Each file in this directory is intentionally small (< 3k tokens). If a file grows past that, split it. The point is to avoid loading a 5k-line file when 100 tokens of structured index will do.

## Cache discipline

These files are designed to be cache-stable. Avoid casual reformatting, reordering, or whitespace churn — every edit invalidates the prompt cache for sessions that loaded this file.

Volatile content (recent changes, current sprint) does **not** belong here. It belongs in `CHANGELOG.md` or the git log.
