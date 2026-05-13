# Workflow recipes

One recipe per common task. Each recipe lists the exact files to touch and the order. Avoids re-deriving the pattern every time.

## Add an IPC handler

1. **Pick the namespace.** Check `ipc-map.md` for the existing 21 namespaces. Only create a new one if your action does not fit any of them.
2. **Add the service method** in `main/services/<area>.ts`. Pure business logic, no IPC concerns.
3. **Add the handler** in `main/background.ts`:
   ```ts
   ipcMain.handle("namespace:action", async (_, { param }) => {
     try {
       const data = await someService.method(param);
       return { success: true, data };
     } catch (error) {
       return {
         success: false,
         error: error instanceof Error ? error.message : String(error),
       };
     }
   });
   ```
4. **Expose in `main/preload.ts`:**
   ```ts
   yourAction: (param: ParamType) => ipcRenderer.invoke("namespace:action", { param }),
   ```
5. **Call from renderer:**
   ```ts
   const result = await window.api.yourAction(param);
   if (!result.success) {
     /* surface result.error */
   }
   ```
6. Run `npm run type-check`. Renderer types auto-derive from `preload.ts`.

## Add a Supabase migration

1. Create `supabase/migrations/<YYYYMMDD>_<HHMMSS>_<description>.sql`. Date-prefixed; applied in lex order.
2. Write idempotent SQL (`IF NOT EXISTS`, `DROP ... IF EXISTS`).
3. Update RLS policies in the same file if the table is user-facing.
4. Apply locally: `supabase db push` or paste in Supabase Dashboard SQL editor.
5. If a service reads/writes the new column or table, update the service in `main/services/*.ts`.

## Add a renderer page

1. Create `renderer/pages/<name>.tsx`. Route is the filename.
2. Use Zustand from `renderer/store/useStore.ts` for app state.
3. Use `window.api.*` for any main-process call. Never import from `main/`.
4. If the page needs a custom window (overlay, picker), open it from `main/background.ts` via `BrowserWindow` and load by file path (Nextron: routes are static-exported).

## Debug a recording issue

1. Confirm macOS permission: `capture:check-permission` (cache cleared on app activation).
2. Check `main/services/recorder.ts` for the current state machine value.
3. Recording uses a **hidden BrowserWindow + `getUserMedia`**. The hidden window must `loadFile(blank.html)` — never `loadURL("data:...")`.
4. `ffmpeg-static` path resolution: `__dirname` is `app/` at runtime, not `app/services/`.
5. Logs: `~/Library/Logs/SnapFlow/` (macOS) or `%APPDATA%/SnapFlow/logs/` (Windows). **Excerpt** the relevant lines (last error stack + 20 lines context) — do not paste whole log files.

## Trace an invite / join

1. Sender flow: `workspace:invite-by-email` (or similar) → `workspace.ts` `inviteByEmail` → Supabase Admin API or OTP fallback → upsert into `pending_invites`.
2. Recipient flow: OAuth callback in `background.ts` `handleAuthCallback` → query `pending_invites` by email → route to `/join-workspace`.
3. Acceptance: `workspace:join` marks `accepted_at`, returns `{ alreadyOnboarded, nextPendingInvite }`. The renderer chains to the next invite if present.
4. Multi-invite is supported. Never rely on Supabase user metadata for invite state — it gets overwritten.

## Add an AI provider or change AI behavior

1. Provider routing lives in `main/services/ai.ts`. Type: `Provider = "groq" | "openai" | "gemini" | "anthropic"`.
2. API keys are stored via `secureConfig` (see `main/utils/secure-config.ts`). Never log them.
3. Per-provider behavior (snap-description, bug-report) is in `AiService` methods.
4. IPC surface is `ai:*` (see `ipc-map.md`).

## Excerpt logs for an AI session

Do not paste whole log files. Pattern:

```bash
tail -500 ~/Library/Logs/SnapFlow/main.log | grep -B 2 -A 20 -i 'error\|failed\|exception'
```

Paste the trimmed output. A 50k-line log file does not belong in a prompt.

## Find code without reading large files

- IPC handler → `ipc-map.md` to find the channel, `grep -n` for the line.
- Service method → `services.md` to find the file, then read by line range.
- Page → `pages.md`.

Read whole files only when the change is genuinely cross-cutting within that file.
