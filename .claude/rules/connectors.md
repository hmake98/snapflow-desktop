---
paths:
  - "main/services/connectors.ts"
  - "main/services/github.ts"
  - "main/services/zoho.ts"
  - "renderer/components/settings/GitHubConnectorManager.tsx"
  - "renderer/components/settings/ZohoConnectorManager.tsx"
---

# GitHub / Zoho connectors

Cross-cutting — this rule loads for either side because the two connectors are asymmetric on purpose (documented, not accidental) and a change to one side should be checked against the other before assuming parity.

- IPC surface: `connector:*` (14 channels) — full list in `main/docs/ipc-map.md`.
- **Attachments differ:** GitHub uploads the screenshot as a real committed file (`uploadScreenshotToGitHub` in `connectors.ts`); Zoho has no attachment-upload endpoint wired up and instead embeds the Supabase public URL as an `<img>` in the bug's HTML description. This is deliberate — see ADR-0001 (`docs/adr/`) before "fixing" it; building real Zoho attachment upload needs API research this codebase hasn't done yet.
- **Delete differs:** deleting a Snap synced to GitHub closes the issue (reversible); deleting one synced to Zoho hard-deletes the bug (not reversible) — `ZohoService.updateBug` has no status field to close it with instead. See ADR-0002. Don't assume you can make these symmetric without extending the Zoho API layer first.
- `main/CLAUDE.md` § "Two separate GitHub OAuth integrations" — the connector's GitHub OAuth app is not the same one used for login. Don't reuse credentials or code paths between them.
- `connectors.ts` is 1100+ lines — read by method/line-range, not whole (see `main/docs/services.md`).
