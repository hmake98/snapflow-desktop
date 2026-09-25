# 0006 — `electron-updater` is the current auto-update mechanism

## Status

Accepted (current state as of 2026-09-24 audit)

## Context

The update mechanism has changed twice and the docs only ever recorded the first switch:

1. Originally a custom in-house updater service.
2. 2026-03-07: replaced with the `update-electron-app` package (recorded in root `CLAUDE.md`'s changelog at the time: "Removed custom updater service, integrated `update-electron-app`").
3. At some undocumented point after that, the app switched again to `electron-updater` directly (`main/services/updater.ts` imports `autoUpdater` from `electron-updater`; `package.json` lists `electron-updater` as a dependency and does **not** list `update-electron-app` at all).

Nobody updated the docs for step 3. Root `CLAUDE.md` said "Uses `update-electron-app` package (not `electron-updater`)" until this audit — the exact opposite of the current code.

## Decision

Treat `electron-updater` (`UpdaterService` in `main/services/updater.ts`) as the current, documented mechanism. The `update:*` IPC namespace (`update:check`, `update:check-manual`, `update:download`, `update:get-info`, `update:install`) wraps it.

## Consequences

- Any doc or comment still referencing `update-electron-app` is stale — there is no trace of that package in `package.json` today.
- No rationale for the second switch (electron-updater vs. update-electron-app) was ever recorded, so it isn't captured here either — this ADR documents _what is true now_, not _why it changed_. If that context resurfaces, add it here.
- This is a second confirmed case (alongside ADR-0001/0002's Zoho findings) of root `CLAUDE.md` drifting from the code it describes. Treat any specific package/file/function name in prose docs as unverified until checked against the source.
