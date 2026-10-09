# Plan: Background Agents (multi-repo issue → PR)

## Status

Draft. Nothing built. Pipeline design and implementation tickets (BA-1 to BA-11) added. Assumptions about existing code are **unverified** — check each against source before implementing (see "Assumptions to verify").

## Summary

A Workspace links several GitHub repositories (backend, frontend, services, shared libs). When a Snap is synced as a GitHub issue and a human approves it, an agent:

1. **Triages** which repos the fix lands in, using the Snap's captures plus an index of each repo.
2. Shows the plan to a human for approval.
3. **Dispatches** one fixer per approved repo, producing one PR per repo, cross-linked and ordered.
4. Tracks the PRs back on the Snap.

The differentiator is the input: Snaps carry screenshots, annotations, and Session timelines (events, network calls). Generic coding agents do not get that context.

## Goals

- Link N repos to a Workspace with a role and description each.
- Route a Snap to the correct repo(s) with a stated rationale and confidence.
- Human approval gate before any code-writing agent runs.
- One PR per affected repo, cross-linked, with dependency order.
- No code custody by SnapFlow in v1: fixers run in each repo's own CI with the customer's own credentials.

## Non-goals (v1)

- Hosting our own sandboxed coding agent / multi-repo checkout runner.
- Fully automatic pickup with no human click.
- Atomic cross-repo changes (breaking contract changes, shared-lib refactors).
- Non-GitHub hosts (GitLab, Bitbucket).
- Billing or metering of LLM usage (needed only if we start running inference ourselves).

## Vocabulary

Uses `CONTEXT.md` terms. Do not drift: Workspace (not "project"), Snap (not "issue", except where the GitHub issue itself is meant), Connector (not "integration").

New terms to add to `CONTEXT.md` if this proceeds:

- **Linked Repo** — a GitHub repository attached to a Workspace for agent work. Not the same as a Connector (a Connector is the tracker link Snaps sync to).
- **Repo Index** — cached, compact summary of a Linked Repo used for triage.
- **Triage Plan** — the agent's proposed set of affected Linked Repos, with rationale, confidence, and order.
- **Agent Run** — one triage + dispatch lifecycle for a Snap.

## Architecture

```
Snap (+ captures, annotations, Session timeline)
        │  user: "Send to agent"
        ▼
  Triage (LLM, one call)  ◄── Repo Index per Linked Repo
        │
        ▼
  Triage Plan ──► human approve / edit / pick repo
        │
        ▼
  Dispatch per repo ──► repo's own CI runs the fixer
        │                (plan + contract slice of other repos)
        ▼
  PRs (one per repo, cross-linked, ordered) ──► tracked on Snap
```

### Linked Repos

Per Workspace, N rows:

| Field             | Notes                                                           |
| ----------------- | --------------------------------------------------------------- |
| `workspace_id`    | Required filter on every query, even with RLS                   |
| `repo_full_name`  | `owner/name`                                                    |
| `role`            | `frontend` \| `backend` \| `service` \| `shared-lib` \| `other` |
| `description`     | One or two sentences; feeds triage                              |
| `default_branch`  |                                                                 |
| `contract_path`   | Optional: OpenAPI / GraphQL schema / shared-types file          |
| `installation_id` | GitHub App installation                                         |
| `runner`          | `claude-code` (v1 default). Others later.                       |
| `runner_status`   | `not_installed` \| `workflow_pr_open` \| `ready` \| `error`     |

Auth: **GitHub App installation** per repo, not PATs. Least privilege (contents read, issues, pull requests, actions dispatch). Credentials stay out of the renderer; follow the existing OS-keychain pattern (recent commit `bcab32d`) for anything stored locally, and `getSupabaseAdmin()` for service-role access server-side.

Open question: extend the existing GitHub Connector or add a separate table. Leaning separate table, since a Connector is one-per-tracker and Linked Repos are many-per-Workspace.

### Repo Index

Compact, cached summary per Linked Repo. Contents:

- README / architecture notes
- Route and endpoint list; page or screen list for frontends
- Key modules and directories
- Contract file excerpt (API shapes, shared types)

Built via the GitHub API (no clone). Refreshed on push webhook, with a nightly fallback. Target a few thousand tokens per repo so triage fits comfortably with N repos. Never feed full repo contents to triage.

### Triage

Single LLM call, routed through the existing provider layer (`main/services/ai.ts`).

Input: Snap title/description, annotations, Session timeline (URLs, network calls, errors), all Repo Indexes.

Output (structured):

```json
{
  "affected": [
    { "repo": "acme/api", "rationale": "...", "confidence": 0.82, "order": 1 },
    {
      "repo": "acme/web",
      "rationale": "...",
      "confidence": 0.7,
      "order": 2,
      "dependsOn": ["acme/api"]
    }
  ],
  "noCodeChange": false,
  "notes": "..."
}
```

Routing trail for UI bugs: screenshot → page → API call seen in the Session timeline → backend handler. This is the main accuracy lever.

Low overall confidence → do not propose; ask the human to choose repos.

### Approval gate

Plan is shown in the renderer before anything is dispatched. User can approve, remove or add repos, reorder, and edit per-repo instructions. This is the cheapest guard against the most expensive failure (wrong routing).

### Dispatch (v1: orchestrate, don't run)

The default runner is the **Claude Code GitHub Action**, running in each Linked Repo's own CI with the **customer's own Anthropic API key** (bring your own key). See "BYOK with Claude Code" below.

For each approved repo:

- Create or update a GitHub issue in that repo containing: the Snap content and capture links, the repo-specific part of the plan, and the **contract slice** of the other involved repos (API shapes, types).
- Trigger the runner by mentioning `@claude` in the issue, or via `workflow_dispatch` on the workflow installed in that repo.

The fixer sees only its own repo plus the contract slice. Sufficient for most bugs; insufficient for atomic cross-repo refactors (non-goal v1).

### BYOK with Claude Code

**Decision:** the key lives in the customer's GitHub, never with SnapFlow.

| Concern          | Where it lives                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Anthropic key    | GitHub Actions secret `ANTHROPIC_API_KEY` in each Linked Repo (or an org-level secret shared across repos)            |
| Workflow file    | `.github/workflows/snapflow-agent.yml` in each Linked Repo, added by a PR that SnapFlow opens and the customer merges |
| Billing          | The customer's Anthropic account, directly                                                                            |
| SnapFlow storage | Nothing. No key, no key hash, no copy.                                                                                |

Triage is separate: it uses the user's own provider key already stored locally by `main/services/ai.ts` (Anthropic is one of the supported providers), so it is also BYOK with no new storage.

**Setup flow ("Set up Claude Code" per Linked Repo):**

1. SnapFlow opens a PR adding `snapflow-agent.yml` (triggers on `@claude` issue mentions and `workflow_dispatch`; minimal permissions: `contents`, `pull-requests`, `issues` write).
2. The customer merges it and adds the `ANTHROPIC_API_KEY` secret in GitHub. SnapFlow shows a link to the repo's secrets page and a short instruction. It cannot add or read the secret.
3. SnapFlow sets `runner_status = ready` after a **test dispatch** succeeds (a no-op run that checks the workflow starts and the key authenticates). A failed run shows `error` with the run link.

Constraints and consequences:

- The key must be an Anthropic API key. Do not use a claude.ai subscription login for a third-party product; check Anthropic's current terms before shipping.
- SnapFlow cannot see key validity, spend, or rate limits. The only signal is the Action run result, surfaced on the Agent Run.
- Customers own spend controls. Document recommended limits (API key spend cap, workflow timeout, `max-turns`).
- Prompt-injection surface is the Action's, not ours: restrict who can trigger it (collaborators only) and keep its token scoped to that repo.
- A hosted runner using the Claude Agent SDK would need server-side key custody. That is a later option, not v1 (see Non-goals), and needs an ADR before it starts.

### PR tracking

Store Agent Run → per-repo PR URL, status, CI state. Show on the Snap. PR descriptions cross-link siblings and state ordering ("merge after acme/api#123").

## Multi-agent pipeline (per repo)

Once a repo's part of the Triage Plan is approved, a single repo-side workflow resolves it through a fixed sequence of **specialised agents**. Each stage is its own GitHub Actions job running the Claude Code Action with its own prompt, tool allow-list, token permissions and budget. Stages hand off through a small run artifact, not through shared chat context.

```
Snap + approved plan
   │
   ▼
 0 Intake gate ──► 1 Planner ──► 2 Ticket writer ──► 3 Implementer
                                                        │
        ┌───────────────────────────────────────────────┘
        ▼
 4 Test writer ──► 5 Quality gates + Reviewer ──► 6 Commit (pre-commit hooks)
        ▲                      │ findings                    │
        └──────────────────────┴──── bounded fix loop ◄─────┘
                                                             ▼
                                         7 Push (pre-push hooks) ──► 8 PR to target branch
```

### Why separate agents, not one long session

- **Least privilege per stage.** Planner, Ticket writer and Reviewer are read-only. Only Implementer and Test writer can write files. Only the final PR job gets `pull-requests: write`. A prompt-injected Snap cannot reach a stage that can push.
- **Independent verification.** The Test writer works from the ticket's acceptance criteria and edge cases, not from the Implementer's reasoning, so tests do not simply restate the implementation. The Reviewer sees only the diff, ticket and gate output.
- **Deterministic control.** Retries, budgets, gates and ordering live in the workflow, not in a model's judgement.
- **Resumable and cheap to retry.** A failed stage re-runs alone from the previous artifact.
- **Cost visibility.** Per-stage turn and time caps, reported on the Agent Run.

Trade-off: more workflow YAML and artifact plumbing than one session. Accepted, because the alternative cannot enforce the permission split.

### Stages

| #   | Stage                        | Agent role and output                                                                                                                                                                                                               | Permissions                                   | Exit gate                                                                    |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| 0   | **Intake gate**              | Deterministic, no LLM. Validates the payload, run id, target branch exists, no live run for this Snap+repo, repo has a lint/test config (or `.snapflow/agent.yml`), key present.                                                    | read                                          | Any failure → `needs_human` with the reason. No tokens spent.                |
| 1   | **Planner**                  | Reads the repo and the contract slice. Writes `plan.md`: root-cause hypothesis, files to touch, **edge cases**, risks, out-of-scope. May answer `no_code_change` or `needs_clarification`.                                          | read                                          | Plan names concrete files and lists edge cases, or the run stops.            |
| 2   | **Ticket writer**            | Turns plan + Snap into the **ticket document**: problem, evidence (capture links, timeline excerpts), acceptance criteria, edge cases, out-of-scope, test notes. Posted as the issue body and reused as the PR description source.  | read, `issues: write`                         | Acceptance criteria are testable statements; no secrets or raw tokens.       |
| 3   | **Implementer**              | Makes the minimal change on a new branch, following repo conventions (reads `CLAUDE.md` / `AGENTS.md` if present). Writes no tests.                                                                                                 | `contents: write`, shell limited to repo cmds | Diff stays inside planned files and size cap.                                |
| 4   | **Test writer**              | Writes unit tests from the **ticket**, not the diff. Covers each acceptance criterion and edge case. Then runs them against the base commit (must **fail**) and the branch (must **pass**).                                         | `contents: write`, test files only            | Fail-before / pass-after proven. If no test framework exists, skip and flag. |
| 5   | **Quality gates + Reviewer** | Deterministic gates first (format, lint, type-check, build, full tests, secret scan, forbidden-path and diff-size checks). Then a read-only Reviewer agent checks the diff against ticket and plan and returns structured findings. | read                                          | Gates green and no `blocker` findings. Otherwise → fix loop.                 |
| 6   | **Commit**                   | A real `git commit` so the repo's **pre-commit hooks** run (lint-staged, prettier, eslint). Hook output is captured. Hook rewrites are part of the commit.                                                                          | `contents: write`                             | Hooks pass. Failure → fix loop with the hook output.                         |
| 7   | **Push**                     | A real `git push` so the repo's **pre-push hooks** run (type-check, tests, build). Never force-push.                                                                                                                                | `contents: write`                             | Hooks pass and push succeeds. Failure → fix loop.                            |
| 8   | **Pull request**             | Opens the PR against the **target branch**, using the ticket as the body, cross-links sibling PRs, states merge order, applies labels, requests reviewers per CODEOWNERS. Never merges.                                             | `pull-requests: write`                        | PR exists. Run marked `pr_open`.                                             |

### Fix loop and budgets

- Stages 5, 6 and 7 feed failures back to the Implementer (or Test writer if a test is at fault) with the exact tool output, never a paraphrase.
- Bounded: at most **3 fix iterations per run**, and a global per-run cap on turns, wall-clock time and Action minutes. Same failure signature twice in a row → stop early.
- On exhaustion: no PR is opened. The run goes to `needs_human`, the branch is kept, and a comment on the issue lists what failed and the last tool output.
- A per-stage `max-turns` and timeout are set in the workflow, so a stuck agent cannot burn the customer's key.

### Hooks and quality policy

- **Hooks are never bypassed.** The workflow denies `git commit --no-verify`, `git push --no-verify`, `git push --force*`, `HUSKY=0` and edits to `.husky/`, `.git/hooks`, CI config and lint config via the agent's tool deny-list. A diff touching those paths fails the forbidden-path gate regardless.
- **Hooks must actually be installed in the runner.** Stage 0 checks that `core.hooksPath` or the repo's hook install step ran (for example `npm ci` triggering `prepare`). If the repo has hooks but they are not installed, the run stops with `needs_human` instead of silently skipping them.
- **Repos without hooks** fall back to the commands in `.snapflow/agent.yml` (`format`, `lint`, `typecheck`, `test`, `build`) so gate coverage is the same.
- Gate order is cheapest first: format → lint → type-check → unit tests → build → secret scan → LLM review.
- Reviewer findings carry a severity (`blocker`, `major`, `nit`). Only `blocker` and `major` loop back. `nit`s go in the PR as notes.

### Per-repo configuration (`.snapflow/agent.yml`, committed by the customer)

```yaml
target_branch: main # PR base. Falls back to the Linked Repo default_branch.
branch_prefix: snapflow/
commands:
  format: npm run format:check
  lint: npm run lint
  typecheck: npm run type-check
  test: npm test
  build: npm run build
protected_paths: # agent may not modify these
  - .github/**
  - .husky/**
  - "**/*.lock"
limits:
  max_files_changed: 15
  max_diff_lines: 600
  max_fix_iterations: 3
  stage_timeout_minutes: 20
```

SnapFlow reads this file; it is never trusted from Snap content. Missing file → conservative defaults and `needs_human` if no test or lint command can be found.

### Target branch rules

- PR base is `target_branch` from the config, else the Linked Repo `default_branch`. The Triage Plan cannot override it.
- Branch name is deterministic: `snapflow/<run-id>-<repo-short>` so re-runs are idempotent.
- If the base moved during the run, rebase once. A conflict → `needs_human` (no force-push, no auto-resolve in v1).
- If the target branch is protected, the PR is still opened; merge rules stay the customer's.

### Edge cases

**Input and intake**

- Vague or empty Snap, no reproduction steps → Planner returns `needs_clarification`; a comment asks for specifics. No code is written.
- Snap needs no code change (config, data, user error) → `no_code_change`, run closes with the explanation.
- Duplicate trigger (double click, webhook redelivery, `@claude` mention plus dispatch) → idempotency key `(snap_id, repo, plan_hash)`; a second run while one is live is rejected.
- Snap or issue edited or deleted mid-run → the run uses the snapshot taken at dispatch; the result notes that the source changed.
- Very large Session timeline or many captures → summarised before the Planner; the full links stay in the ticket.
- Snap content tries to instruct the agent ("ignore previous instructions", "print secrets", "edit the workflow") → treated as data, flagged by the Reviewer, and blocked by the stage permissions and deny-list.
- Secrets or personal data visible in screenshots or timelines → redaction pass before the ticket is written; the ticket and PR must never include tokens, auth headers or full cookies.

**Planning and implementation**

- Fix needs files outside `protected_paths` or beyond the size caps → stop with `needs_human` and the plan, rather than a partial change.
- Change needs a dependency add, lockfile change, migration or generated code → blocked in v1 unless explicitly allowed in config; flagged in the plan instead.
- Monorepo → Planner scopes to a package path; commands run in that path.
- Fix really belongs in a sibling repo → Planner reports it; the Orchestrator (SnapFlow) re-triages rather than the agent editing outside its repo.
- Implementer touches files not named in the plan → scope-drift check fails the gate.
- Human pushes to the agent's branch mid-run → the run aborts at the next stage boundary and never overwrites human commits.

**Tests**

- No test framework in the repo → skip Test writer, mark the PR "no tests added" with the reason; do not invent a framework.
- Tests pass on the base commit (do not prove the bug) → rejected; Test writer retries once, then flags "cannot reproduce".
- Flaky tests → a failing gate is re-run once; a pass-then-fail pattern is reported as flaky, not fixed by the agent.
- Agent weakens or deletes existing tests or assertions → blocked by the Reviewer and by a "test files may only be added or extended" gate.
- Slow suites → stage timeout; the run reports which command timed out.

**Hooks and quality**

- Hook fails repeatedly with the same output → early stop (same signature twice).
- Hook modifies files (formatters) → included in the commit; the diff gate runs after hooks.
- Hooks depend on tools missing in the runner (`node`, `husky`, `lint-staged`) → Stage 0 detects and stops with a precise message.
- Pre-push runs the whole test suite and exceeds the timeout → `needs_human`; never skipped.
- Commit signing, DCO or conventional-commit enforcement → the commit message template comes from config; unsigned commits where signing is required stop the run.

**Platform, keys and cost**

- Missing or invalid `ANTHROPIC_API_KEY`, spend cap or rate limit → the run fails at the first LLM call with the Action's error surfaced; `runner_status = error`.
- Org-level secret not exposed to this repo → same failure, with a hint to check secret visibility.
- Fork or untrusted trigger → the workflow only runs for collaborators with write access.
- GitHub rate limits or an Actions outage → retry with backoff on SnapFlow's side; stage state is not lost.
- Action run cancelled by a human → `cancelled`, branch kept, no PR.
- Token expiry for the GitHub App installation → refreshed per call; a revoked installation marks all runs for that repo `failed` with a reconnect prompt.

**Multi-repo**

- Upstream repo's PR fails or is closed → downstream runs are held at `dispatched` with `blocked_by`; never merged out of order.
- One repo done, another failed → per-repo status; the Snap shows partial success. No auto-merge anywhere.
- Contract slice changes between dispatch and PR → the downstream PR description records the commit SHA of the slice it used.
- Two Snaps touching the same files in the same repo → the second run rebases onto the first's target; conflicts → `needs_human`.

### Run states

`queued → intake → planning → ticketed → implementing → testing → reviewing → committing → pushing → pr_open`

Terminal side states: `no_code_change`, `needs_clarification`, `needs_human`, `failed`, `cancelled`. Each per-repo row carries `stage`, `fix_iterations` and `last_error`; the run status is derived from its rows.

### Observability

- Per stage: status, duration, turns, estimated tokens, last tool output (redacted), link to the Action run. Shown on the Snap's Agent Run view.
- Logs never contain keys, tokens or full Snap payloads (`electron-log` in the app; Action logs are the customer's).
- The ticket, plan and review findings are attached to the PR so a human reviewer sees the same reasoning the agents used.

### Testing strategy for this feature (SnapFlow side)

Unit tests (Jest or Vitest, whichever the repo adopts; confirm before adding a framework, since none is verified yet):

- Triage output parsing and validation, including malformed JSON, unknown repos and low confidence.
- Run state machine: every legal and illegal transition, terminal states, derived run status from per-repo rows.
- Idempotency key and duplicate-trigger rejection.
- Workflow generator: snapshot test of `snapflow-agent.yml` per config; asserts per-stage permissions, deny-list entries and timeouts.
- `.snapflow/agent.yml` parsing: defaults, invalid values, protected-path matching, size caps.
- Budget and fix-loop logic: iteration cap, same-signature early stop.
- Redaction of tokens and secrets in tickets and logs.
- IPC handlers: `{ success, data?, error? }` shape, `workspace_id` filtering, role checks.

Integration: a fixture repo plus a faked GitHub API for the dispatch, status and PR-link tracking path. A real end-to-end run against a sandbox repo is a manual release check, not a unit test.

### Delivery pipeline for this feature

Implementation → unit tests → format, lint, type-check, build → pre-commit hooks (Husky: prettier, eslint) → pre-push hooks → PR to `main`. Each ticket below ships as its own small PR so review stays tractable.

## Implementation tickets

Ordered by dependency. Each ticket is a vertical slice with acceptance criteria and its own tests.

| ID    | Ticket                          | Scope                                                                                                                                 | Acceptance criteria                                                                                                       |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| BA-1  | Linked Repos data + IPC         | Migration for `linked_repos` with RLS, service, `agent:linkRepo/unlinkRepo/listRepos`, `workspace_id` filter everywhere.              | Link, list, unlink work; cross-Workspace access denied in tests; migration reviewed per `supabase/CLAUDE.md`.             |
| BA-2  | GitHub App auth                 | Installation flow, short-lived token minting, token never reaches renderer or logs.                                                   | Token scoped to one repo; expiry and revoke handled; no secrets in logs.                                                  |
| BA-3  | Runner setup + check            | `agent:setupRunner` opens the workflow PR, `agent:checkRunner` test-dispatches, `runner_status` transitions.                          | Bad or missing key shows `error` with a link; ready only after a successful test run.                                     |
| BA-4  | Workflow + config generator     | Generate `snapflow-agent.yml` and `.snapflow/agent.yml` defaults with per-stage jobs, permissions, deny-list, budgets.                | Snapshot tests pass; denied commands and protected paths present; stage permissions match the table above.                |
| BA-5  | Repo Index builder              | GitHub API based summary per repo, cached with commit sha, webhook plus nightly refresh.                                              | Fits the token budget; never indexes secrets or ignored paths; stale index detected by sha.                               |
| BA-6  | Triage + approval UI            | `agent:triage` via `ai.ts` structured output, plan editor, confidence threshold.                                                      | Low confidence asks the human; `noCodeChange` handled; nothing dispatches before approval.                                |
| BA-7  | Run state machine + persistence | `agent_runs`, `agent_run_repos`, stage fields, idempotency key, derived status.                                                       | All transitions tested; duplicate trigger rejected; partial failure visible.                                              |
| BA-8  | Dispatch + stage reporting      | Create issue with ticket, trigger runner, ingest stage status from Action runs and webhooks.                                          | Per-stage status, duration and run link appear on the Snap; cancel works.                                                 |
| BA-9  | PR tracking and ordering        | Store PR URL, CI state, `depends_on`, cross-link text, hold downstream runs when upstream is not green.                               | Out-of-order merge is never suggested; sibling links correct; SHA of contract slice recorded.                             |
| BA-10 | Redaction and safety            | Redact secrets in tickets and logs; prompt-injection test fixtures; forbidden-path policy.                                            | Fixtures with injected instructions never reach a write-capable stage; secret patterns removed from ticket and PR bodies. |
| BA-11 | Docs and ADR                    | ADR "orchestrate customer-owned Claude Code runners, BYOK, no key custody"; add terms to `CONTEXT.md`; update `main/docs/ipc-map.md`. | ADR merged before BA-8; vocabulary matches `CONTEXT.md`.                                                                  |

Every ticket's definition of done: tests added and green, `npm run format`, `npm run lint`, `npm run type-check`, `npm run build`, Husky pre-commit and pre-push hooks pass, PR targets `main`.

## Data model (sketch)

Tables, all with `workspace_id` + RLS + defensive app-level filtering:

- `linked_repos` — see above.
- `repo_indexes` — `linked_repo_id`, `content`, `commit_sha`, `built_at`.
- `agent_runs` — `snap_id`, `status` (`triaging` \| `awaiting_approval` \| `dispatched` \| `done` \| `failed`), `triage_plan` (jsonb), `created_by`.
- `agent_run_repos` — `agent_run_id`, `linked_repo_id`, `issue_url`, `pr_url`, `status`, `stage`, `fix_iterations`, `last_error`, `blocked_by`, `depends_on`, `idempotency_key` (unique).
- `agent_run_stages` — `agent_run_repo_id`, `stage`, `status`, `started_at`, `duration_ms`, `turns`, `action_run_url`. Redacted metadata only, no model output or tokens.

Migrations go under `supabase/migrations/` per `supabase/CLAUDE.md`. Triage and dispatch run in the main process (or an edge function if we need webhooks); renderer talks via new IPC channels only.

## IPC surface (sketch)

New channel namespace `agent:*` (do not reuse legacy `issue:*`):

- `agent:linkRepo`, `agent:unlinkRepo`, `agent:listRepos`
- `agent:setupRunner` (linkedRepoId) → opens the workflow PR
- `agent:checkRunner` (linkedRepoId) → test dispatch, updates `runner_status`
- `agent:refreshIndex`
- `agent:triage` (snapId) → Triage Plan
- `agent:approve` (runId, edited plan) → dispatch
- `agent:getRun`, `agent:listRuns`

## Phases

1. **Linked Repos** — GitHub App, `linked_repos`, settings UI. Standalone value: Workspace knows its repos. Includes the "Set up Claude Code" flow and runner check, so repos are dispatch-ready before triage ships.
2. **Repo Index** — builder, cache, webhook refresh.
3. **Triage + approval UI** — useful even with no fixer ("which repo owns this bug?").
4. **Multi-agent pipeline + PR tracking** — workflow generator (BA-4), per-repo Claude Code stages, fix loop, hooks policy, cross-linked PRs, status on the Snap.
5. **Later, only if used**: auto-pickup rules (label, severity, confidence threshold), hosted multi-repo runner, atomic cross-repo changes.

Phases 1–3 carry little risk and can ship independently.

## Risks and mitigations

| Risk                                                        | Mitigation                                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt injection via Snap text, annotations, or screenshots | Treat all Snap content as untrusted; human approval gate; fixers run with scoped repo permissions only; never give triage tool or write access |
| Wrong routing                                               | Confidence threshold; approval gate; rationale shown                                                                                           |
| Cross-tenant leakage                                        | `workspace_id` filter everywhere; per-Workspace installations; indexes never shared across Workspaces                                          |
| Token/credential exposure                                   | GitHub App, short-lived installation tokens; nothing in renderer or logs                                                                       |
| Junk PRs from vague Snaps                                   | Triage can return `noCodeChange`; require minimum description/context before offering "Send to agent"                                          |
| Partial failure (one repo's PR red)                         | Per-repo status on the run; ordering and `dependsOn` visible; no auto-merge                                                                    |
| Agent bypasses hooks or CI rules                            | Deny-list for `--no-verify`, `HUSKY=0`, force-push and hook/CI/lint config edits; forbidden-path gate; Stage 0 verifies hooks are installed    |
| Infinite or runaway fix loop                                | 3 fix iterations, same-failure early stop, per-stage turns and timeout, global per-run budget                                                  |
| Agent weakens tests to go green                             | Tests only added or extended; fail-before / pass-after proof; Reviewer checks for removed assertions                                           |
| Cost surprise                                               | Customer's own Anthropic key per repo (BYOK); triage is one call per run with capped input via Repo Index; document spend caps and `max-turns` |
| Customer forgets or misconfigures the key                   | Test dispatch gates `runner_status = ready`; "Send to agent" is disabled for repos that are not ready                                          |

## Hard cases deferred

- Contract changes that must land atomically in two repos.
- Shared libraries (version bump and publish ordering).
- Monorepo + polyrepo mixes (index per package path).
- Issues needing config or data fixes rather than code.

## Open questions

1. Separate `linked_repos` table vs. extending the GitHub Connector?
2. Where does triage run: Electron main process (user's machine, only while app is open) or a server-side function (works when closed)? v1 is fine in main; auto-pickup requires server-side.
3. ~~Which runner is the default dispatch target?~~ Resolved: Claude Code Action with the customer's own key (see "BYOK with Claude Code"). Still open: org-level vs per-repo secret guidance, and whether other runners are offered later.
4. Who may trigger an Agent Run: any `member`, or `admin`/`owner` only?
5. Does Zoho-only Workspace get anything from this, or is it GitHub-only?
6. Do we need an ADR for "orchestrate existing runners rather than host our own"? Yes: BA-11, before BA-8.
7. Stages as separate Actions jobs (current design) vs one Claude Code session using subagents: jobs give enforceable permission splits but add plumbing. Revisit only if artifact hand-off proves too heavy.
8. Should the Test writer run before the Implementer (strict TDD) for bug fixes? Current order follows the requested flow (implement, then test) with a fail-before proof; strict TDD would remove the need for that proof.
9. Which unit test framework does this repo use or adopt? None is verified; check before BA-7 onward.

## Assumptions to verify

Per repo non-negotiables, confirm against source before relying on any of these:

- The GitHub Connector's current auth model and where its token is stored.
- That `main/services/ai.ts` can return structured (JSON) output for the chosen provider(s).
- That the Session timeline actually records network calls (not just events and screenshots) in `main/services/debug-collector/`.
- How Snap → GitHub issue Sync stores the issue URL (needed to link PRs back).
- Existing IPC registration pattern in `main/CLAUDE.md` before adding `agent:*`.
- Current `anthropics/claude-code-action` inputs, trigger events, required permissions, and whether a `workflow_dispatch` test run is practical.
- Whether the Claude Code Action can be configured per job with distinct tool allow/deny lists and `max-turns`, and how to hand artifacts between jobs.
- That the target repos' Husky hooks run in a CI checkout (`prepare` script, `core.hooksPath`) and are not disabled by `CI=true`.
- Anthropic's current terms on API keys vs. subscription logins in third-party products.
- That the GitHub App can open a PR adding a workflow file (needs `workflows` permission, which is a sensitive scope; confirm it is acceptable or fall back to showing the file for the customer to commit).
