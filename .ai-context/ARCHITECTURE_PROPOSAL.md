# `.ai-context/` — Architecture Proposal

Tailored to SnapFlow Desktop. Read alongside `README.md` (the runtime entry point) and `CLAUDE.md` (the canonical project doc).

This document is a one-time design record. It is **not** loaded into Claude sessions by default. Skim it once; the runtime artifacts in this directory are what matter day to day.

---

## 1. Problem statement

SnapFlow Desktop is an Electron + Nextron app. There is no LLM runtime to plug "middleware" into — the token waste this system targets is the cost of **Claude Code sessions working on this repo**.

Current waste hotspots (measured from the live tree):

| Hotspot                       | Size                                        | Token cost on naive read |
| ----------------------------- | ------------------------------------------- | ------------------------ |
| `main/background.ts`          | 4,959 lines, 99 IPC handlers, 21 namespaces | ~60k tokens              |
| `main/services/sync.ts`       | 1,093 lines                                 | ~14k                     |
| `main/services/connectors.ts` | 1,160 lines                                 | ~15k                     |
| `main/services/capture.ts`    | 1,108 lines                                 | ~14k                     |
| `main/services/workspace.ts`  | 722 lines                                   | ~9k                      |
| `CLAUDE.md` + `AGENTS.md`     | 314 + 314 lines, ~95% duplicate             | ~8k                      |

A session that asks "where does the GitHub OAuth callback happen?" today often loads `background.ts` whole (~60k tokens) when ~50 lines are relevant. Multiply by every cross-cutting question — sync, invites, recording, AI provider config — and a single afternoon of work pays for the same context dozens of times.

## 2. Goals (in priority order)

1. **Stop re-reading `background.ts`.** A 1-page IPC map replaces the read.
2. **Stop re-deriving project structure.** Static context files codify it.
3. **Stop duplicating `CLAUDE.md` and `AGENTS.md`.** One canonical source.
4. **Cheap selective loading.** Anchor file < 2k tokens; per-topic files load on demand.
5. **Stay cache-friendly.** Stable content first; volatile content moved out.

Non-goals: embeddings, vector retrieval, runtime middleware, log compression pipelines for FFmpeg/Docker/K8s (the spec listed these but they don't fit this repo). If those become needed they can be added in later phases.

## 3. Design — the 10 layers, mapped to SnapFlow

### Layer 1 — Static context (`.ai-context/*.md`)

Files in this directory. Each one is small, stable, and answers a recurring question without forcing a file read.

- `README.md` — entry point. Lists what to load when. Cache anchor.
- `architecture.md` — stack, process boundaries, build pipeline.
- `coding-standards.md` — IPC pattern, error shape, service rules.
- `services.md` — one-line index of every `main/services/*.ts` with line counts.
- `ipc-map.md` — all 99 IPC channels grouped by namespace, mapped to the service that implements them.
- `pages.md` — every `renderer/pages/*.tsx` with purpose.
- `workflows.md` — recipes for the common tasks (add IPC handler, add migration, add page, debug recording).
- `glossary.md` — Tenant, Workspace, Snap, Issue, Session, Collector — the domain vocabulary.

Total target: < 15k tokens. Loaded **selectively** — the agent reads `README.md` first, then 1-3 topic files.

### Layer 2 — Retrieval

No embeddings. The retrieval layer for a small, well-organized repo is **the index** (`ipc-map.md`, `services.md`, `pages.md`). Given a task, the agent picks 1-3 files instead of grepping.

When grep is still needed, the indices tell it which directories to scope to (`main/services/` vs `renderer/pages/`) — avoids `grep -r` over `node_modules` or `app/` build output.

A future phase can add `scripts/ai-context/dependency-graph.ts` that emits a JSON adjacency list (importer → imported) by walking imports. Useful only when refactors cross many files. Phase 1 ships without it.

### Layer 3 — Session summarization

Out of scope for Phase 1. Claude Code already auto-compresses long conversations. Don't reinvent.

What we **do** ship: encourage one-task-per-session and provide `workflows.md` recipes terse enough that re-opening a session and re-loading context costs < 2k tokens.

### Layer 4 — Context pruning

Two mechanical rules, enforced by file structure:

- **Stable on top, volatile on bottom.** Each file places non-changing facts first, "recent changes" last. Cache-friendly and easy to truncate.
- **Move volatile sections out of `CLAUDE.md`.** The "Recent Changes" section in `CLAUDE.md` should migrate to a separate `CHANGELOG.md`-style file (already exists at repo root). The user must approve this edit; not done in Phase 1.

### Layer 5 — Log compression

The spec listed FFmpeg / Docker / K8s logs. This repo only has Electron logs (`electron-log` → `~/Library/Logs/SnapFlow/`) and Nextron build output. No streaming pipeline.

Phase 1 ships a `workflows.md` recipe that tells the agent how to **excerpt** logs (tail + grep for error lines) rather than paste them whole. No code needed.

If a log volume problem materializes, add `scripts/ai-context/summarize-log.ts` (one-liner around `tail`+regex), but premature.

### Layer 6 — Token budget

The agent's host (Claude Code) already manages context window. The contribution of this layer is **per-file size discipline**:

- `README.md`: target < 1.5k tokens (always loaded).
- Per-topic file: < 3k tokens (loaded one or two at a time).
- `ARCHITECTURE_PROPOSAL.md` (this file): not loaded by default.

A `scripts/ai-context/check-sizes.sh` script can lint the directory and fail CI if a file balloons. Phase 1 ships the discipline; the script is Phase 2.

### Layer 7 — Task isolation

SnapFlow has natural seams: **capture**, **recording**, **sync**, **auth/onboarding**, **connectors (GitHub/Zoho)**, **AI provider config**. `ipc-map.md` and `services.md` group by these seams so a session focused on sync doesn't drag in recording files.

`workflows.md` recipes are scoped to one seam each.

### Layer 8 — Observability

For this scale of project, formal token analytics is overkill. The honest minimum:

- Track file sizes in `.ai-context/` (commit-time linter, Phase 2).
- Track `CLAUDE.md` and `AGENTS.md` size — they were the worst offenders. Keep both under 250 lines or consolidate.

### Layer 9 — Cache-friendly prompting

The prompt prefix the host (Claude Code) sends is the system prompt + `CLAUDE.md` + selected files. To stay cache-friendly:

- `CLAUDE.md` stays stable. Move "Recent Changes" out (see Layer 4).
- `.ai-context/*.md` files put stable headers and facts at the top.
- Avoid editorializing or reformatting these files casually — every change busts the cache.

### Layer 10 — Migration

The `.ai-context/` directory is additive. Nothing breaks if it's removed. Migration in three steps, only Step 1 done in Phase 1:

1. **Phase 1 (this PR).** Create `.ai-context/` directory + 8 files. Add a one-line pointer to `CLAUDE.md`. No existing file is rewritten.
2. **Phase 2.** Consolidate `CLAUDE.md` and `AGENTS.md` (95% duplicate). User decides whether `AGENTS.md` becomes a one-line pointer to `CLAUDE.md`, or vice versa.
3. **Phase 3.** Move "Recent Changes" from `CLAUDE.md` into `CHANGELOG.md`. Add `scripts/ai-context/check-sizes.sh`. Optional: dependency-graph generator.

## 4. Directory structure

```
.ai-context/
  README.md                  # Entry point. What to load when. Always read first.
  ARCHITECTURE_PROPOSAL.md   # This file. Read once, then ignore.
  architecture.md            # Stack + process boundaries.
  coding-standards.md        # IPC pattern, error shape, service rules.
  services.md                # main/services/*.ts inventory.
  ipc-map.md                 # 99 IPC channels grouped by namespace.
  pages.md                   # renderer/pages/*.tsx inventory.
  workflows.md               # Recipes for common tasks.
  glossary.md                # Domain vocabulary.
```

## 5. Example optimized prompt flow

**Task:** "Add a new IPC handler for exporting a snap as PDF."

Before:

- Read `CLAUDE.md` (~8k)
- Read `main/background.ts` (~60k) to see IPC pattern
- Read `main/preload.ts` (~8k) to see how to expose
- Read `main/services/issues.ts` (~4k) to see CRUD pattern
- Total: **~80k tokens** before writing a single line.

After:

- `CLAUDE.md` is already in system prompt.
- Read `.ai-context/README.md` (~1k) → points to `workflows.md`.
- Read `.ai-context/workflows.md` § "Add an IPC handler" (~500 tokens) → gives the exact pattern + which service file to extend.
- Read only the relevant service file targeted by line range (e.g., `issues.ts` lines 1-50 for class header, ~600 tokens).
- Total: **~2k tokens** before writing.

That's a ~40x reduction on this category of task. Recording, sync, connector, and onboarding tasks follow the same shape.

## 6. What this proposal does **not** claim

- It does not measure token reduction empirically. Numbers above are read-cost estimates, not benchmark results.
- It does not protect against an agent that ignores the index and grep-scans anyway. The artifacts are advisory, not enforced.
- It does not handle the in-app AI feature (`main/services/ai.ts`). That feature has its own runtime token costs (calls to Anthropic/OpenAI/Groq/Gemini SDKs) and would need a separate analysis if optimization there is the goal.

Phase 1 ships the static-context layer. Subsequent phases are gated on the user judging this useful.
