# 0005 — Remove the invite-team onboarding step, keep step numbers 1/3/4

## Status

Accepted (2026-03-04)

## Context

Onboarding originally had a dedicated "invite your team" step between tenant creation and workspace creation. It was removed as a separate step. `onboarding_progress.current_step` is a persisted integer per user, so renumbering the remaining steps down to 1/2/3 would have meant every in-flight user's persisted `current_step` (e.g. `3` meaning "workspace", or `4` meaning "connectors") would suddenly point at the wrong step.

## Decision

Keep the surviving steps at their original numbers — 1 = tenant, 3 = workspace, 4 = connectors — and just skip 2 in the UI's step sequence (`renderer/pages/onboarding.tsx`: `step === 1` advances directly to `step === 3`). Do not renumber to close the gap.

## Consequences

- No data migration was needed for `onboarding_progress` rows created before the change.
- The step sequence looks unintuitive to a new reader (1 → 3 → 4, no 2) unless they know why — this ADR is that context. `renderer/pages/onboarding.tsx`'s step-counter UI (`Step X of Y`) compensates by displaying a compressed 1-of-3 / 1-of-2 count rather than the raw step number.
- `mode=member` onboarding (invited users) skips straight to step 4, bypassing tenant/workspace creation entirely, since an invited member joins an existing workspace rather than creating one.
- If another step is ever removed, follow the same pattern: leave the gap, don't renumber.
