# 0002 — Zoho delete-sync is a hard delete; GitHub delete-sync is a soft close

## Status

Accepted (interim)

## Context

`issue:delete` (`main/main.ts`) cleans up a Snap's external tracker records before deleting it locally:

- GitHub: `connectorService.closeGitHubIssue` — closes the issue, history and reopen option preserved.
- Zoho: `connectorService.deleteZohoBug` — permanently deletes the bug via Zoho's `DELETE` bugs endpoint.

`ZohoService.updateBug` only accepts `title`/`description` — there is no status/state field wired up, so there is currently no way to "close" a Zoho bug the way GitHub issues are closed. Deleting is the only available action.

This asymmetry was found during a functional-gap audit (2026-09-24) and left as-is rather than guessed at, since building a Zoho "close" flow requires confirming the correct status field/value against Zoho's Bugs API, which wasn't verifiable at audit time.

## Decision

Keep Zoho delete-sync as a permanent delete for now. Do not attempt a speculative "soft close" for Zoho without confirming the API contract.

## Consequences

- Deleting a Snap synced to both connectors is recoverable on GitHub (reopen the closed issue) but **not** recoverable on Zoho — the bug is gone for good.
- The delete confirmation dialog (`renderer/pages/home.tsx`) only shows a generic "cannot be undone" warning; it does not currently call out that Zoho-side history is unrecoverable while GitHub-side history is.

## Revisit when

Zoho's bug status field/values are confirmed and `ZohoService.updateBug` gains real status-change support — then Zoho delete-sync should close (not delete) the bug, matching GitHub's behavior.
