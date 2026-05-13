# Coding standards

Rules that recur across every PR. Stable.

## IPC pattern

Every IPC handler in `main/background.ts` follows this exact shape:

```ts
ipcMain.handle("namespace:action", async (_, { param1, param2 }) => {
  try {
    const result = await someService.method(param1, param2);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
```

Rules:

- **Namespace prefix is required.** See `ipc-map.md` for the canonical list of 21 namespaces. Do not invent a new top-level namespace without checking that an existing one is wrong.
- **Return shape is always `{ success, data?, error? }`.** Renderer callers rely on this. Do not return raw values.
- **Wrap the entire handler body in try/catch.** No exceptions leak across the IPC boundary.
- **Business logic lives in services**, not in the handler. The handler is a thin adapter.
- **Expose via `main/preload.ts`** with a typed method on `window.api`. Renderer types are auto-derived from `preload.ts`.

## Service rules

- Each service is a class exported as a singleton: `export const fooService = new FooService();`.
- Services have **no side effects on import** (no `ipcMain.on`, no log spam, no I/O).
- All Supabase queries go through services. `background.ts` does not contain raw Supabase calls.
- Use `getSupabase()` for user-scoped queries; `getSupabaseAdmin()` for service-role operations (invite admin API, etc.).
- Always include `workspace_id` filters on user-facing queries (defense in depth — RLS also enforces).

## Naming

- IPC channels: `namespace:kebab-case-action`.
- Service methods: camelCase.
- File names: kebab-case for multi-word (`window-picker.ts`, `tray-icon-manager.ts`).
- Renderer pages: kebab-case matching the route.

## Error handling

- Never log secrets (tokens, passwords, session IDs).
- Throw `Error` with a human-readable message; handler converts to `{ success: false, error }`.
- For user-visible errors, return a message the renderer can display verbatim.

## Comments

- Default to no comments. Names should carry meaning.
- Comment only when the **why** is non-obvious (e.g., `data:` URL trap, macOS permission restart requirement, FFmpeg flag quirks).
- Never narrate **what** the next line does.

## Formatting

- Prettier + ESLint enforced via Husky pre-commit.
- Run `npm run format` then `npm run lint` before committing.
- Run `npm run type-check` to catch TS errors before push (CI does too).

## Before commit checklist

1. `npm run format`
2. `npm run lint`
3. `npm run type-check`
4. `npm run build` (CI validation)
5. No console errors in dev tools
6. No secrets in code or logs

## Git workflow

- Branch from `main`. Squash before merging.
- Conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`.
- Never force-push to `main`.
