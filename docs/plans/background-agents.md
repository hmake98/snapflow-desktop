# Plan: Background Agents (multi-repo issue → PR)

## Status

Draft. Nothing built. Assumptions about existing code are **unverified** — check each against source before implementing (see "Assumptions to verify").

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

For each approved repo:

- Create or update a GitHub issue in that repo containing: the Snap content and capture links, the repo-specific part of the plan, and the **contract slice** of the other involved repos (API shapes, types).
- Trigger that repo's configured runner (Claude Code GitHub Action, Copilot coding agent, or `workflow_dispatch` on a workflow the customer owns).

The fixer sees only its own repo plus the contract slice. Sufficient for most bugs; insufficient for atomic cross-repo refactors (non-goal v1).

### PR tracking

Store Agent Run → per-repo PR URL, status, CI state. Show on the Snap. PR descriptions cross-link siblings and state ordering ("merge after acme/api#123").

## Data model (sketch)

Tables, all with `workspace_id` + RLS + defensive app-level filtering:

- `linked_repos` — see above.
- `repo_indexes` — `linked_repo_id`, `content`, `commit_sha`, `built_at`.
- `agent_runs` — `snap_id`, `status` (`triaging` \| `awaiting_approval` \| `dispatched` \| `done` \| `failed`), `triage_plan` (jsonb), `created_by`.
- `agent_run_repos` — `agent_run_id`, `linked_repo_id`, `issue_url`, `pr_url`, `status`, `depends_on`.

Migrations go under `supabase/migrations/` per `supabase/CLAUDE.md`. Triage and dispatch run in the main process (or an edge function if we need webhooks); renderer talks via new IPC channels only.

## IPC surface (sketch)

New channel namespace `agent:*` (do not reuse legacy `issue:*`):

- `agent:linkRepo`, `agent:unlinkRepo`, `agent:listRepos`
- `agent:refreshIndex`
- `agent:triage` (snapId) → Triage Plan
- `agent:approve` (runId, edited plan) → dispatch
- `agent:getRun`, `agent:listRuns`

## Phases

1. **Linked Repos** — GitHub App, `linked_repos`, settings UI. Standalone value: Workspace knows its repos.
2. **Repo Index** — builder, cache, webhook refresh.
3. **Triage + approval UI** — useful even with no fixer ("which repo owns this bug?").
4. **Dispatch + PR tracking** — per-repo runner trigger, cross-linked PRs, status on the Snap.
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
| Cost surprise                                               | v1 uses customer's own runner/API key; triage is one call per run, capped input via Repo Index                                                 |

## Hard cases deferred

- Contract changes that must land atomically in two repos.
- Shared libraries (version bump and publish ordering).
- Monorepo + polyrepo mixes (index per package path).
- Issues needing config or data fixes rather than code.

## Open questions

1. Separate `linked_repos` table vs. extending the GitHub Connector?
2. Where does triage run: Electron main process (user's machine, only while app is open) or a server-side function (works when closed)? v1 is fine in main; auto-pickup requires server-side.
3. Which runner is the default dispatch target, and how does a Workspace configure it?
4. Who may trigger an Agent Run: any `member`, or `admin`/`owner` only?
5. Does Zoho-only Workspace get anything from this, or is it GitHub-only?
6. Do we need an ADR for "orchestrate existing runners rather than host our own"? Probably yes before phase 4.

## Assumptions to verify

Per repo non-negotiables, confirm against source before relying on any of these:

- The GitHub Connector's current auth model and where its token is stored.
- That `main/services/ai.ts` can return structured (JSON) output for the chosen provider(s).
- That the Session timeline actually records network calls (not just events and screenshots) in `main/services/debug-collector/`.
- How Snap → GitHub issue Sync stores the issue URL (needed to link PRs back).
- Existing IPC registration pattern in `main/CLAUDE.md` before adding `agent:*`.
