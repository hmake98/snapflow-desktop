# SnapFlow Desktop

A cross-platform desktop app for screenshot capture, screen recording, annotation, and team collaboration — with sync to GitHub Issues, Zoho Projects, and the cloud.

Built with **Electron + Next.js** (Nextron), **Supabase**, and **TypeScript**.

---

## Features

- **Screenshot capture** — full screen, area selection, or individual window; auto-copied to clipboard
- **Screen recording** — full screen or window, red overlay border during recording, remembers the last-used source
- **Annotation editor** — freehand drawing, shapes, arrows, color picker, undo/redo (Konva.js)
- **AI session review** — auto-generates bug descriptions from recorded sessions; choice of Groq, OpenAI, Google Gemini, or Anthropic Claude (API key entered per-provider in Settings, not via `.env`)
- **Snap management** — create, tag, filter, search, and preview captures locally
- **Cloud sync** — sync snaps to Supabase Storage with per-snap status (local / syncing / synced / failed)
- **GitHub integration** — create issues with embedded screenshots via OAuth
- **Zoho Projects integration** — create bugs (with embedded screenshot) via OAuth
- **Multi-tenant workspaces** — organizations → workspaces → snaps; roles: owner, admin, member
- **Team invites** — email invites with multi-invite chaining (multiple pending invites processed in order)
- **Offline support** — sync queue drains automatically on reconnect
- **Auto-updates** — background update check and install via electron-updater

---

## Tech Stack

| Layer        | Technologies                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Renderer     | Next.js 16, React 19, TypeScript 6, Tailwind CSS 4, Zustand, Konva.js, Framer Motion, Radix UI |
| Main process | Electron 43, Nextron, electron-store, electron-log, electron-updater, sharp, ffmpeg-static     |
| Database     | Supabase (PostgreSQL + Auth + Storage), Row Level Security                                     |
| AI           | Groq, OpenAI, Google Gemini, or Anthropic Claude (user-selected, user-supplied API key)        |
| Integrations | GitHub OAuth + REST API, Zoho OAuth + Projects API                                             |
| Build        | electron-builder 26, GitHub Actions                                                            |
| Code quality | ESLint, Prettier, Husky + lint-staged, TypeScript                                              |

Electron is pinned to `^43.x` (not latest 44) — Electron 44 removed the synchronous clipboard API this app's screenshot-copy feature depends on.

---

## Prerequisites

- Node.js 20 (matches CI)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) and a [Supabase](https://supabase.com) project (free tier works)
- (Optional) GitHub OAuth app and/or Zoho API credentials for integrations

---

## Quick Start

```bash
git clone <repository-url>
cd snapflow-desktop
npm install
cp .env.example .env   # fill in your credentials
npm run dev
```

On first launch, complete the onboarding: create an organization → workspace → (optionally) connect GitHub/Zoho. On macOS, grant Screen Recording permission when prompted and restart the app.

### Supabase Setup

1. Create a project at [app.supabase.com](https://app.supabase.com) and run `supabase link` in the repo root
2. Apply migrations: `supabase db push --linked`
3. Create the storage bucket declared in `supabase/config.toml`: `supabase seed buckets --linked`
4. Copy credentials from **Project Settings → API** into your `.env`

---

## Environment Variables

```env
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # required for team invites

# Optional — GitHub sync connector (NOT the "Sign in with GitHub" login button,
# which uses Supabase Auth's GitHub provider — configure that in the Supabase
# Dashboard under Authentication → Providers, not here)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Optional — Zoho integration
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=

NODE_ENV=development
```

AI provider keys (Groq/OpenAI/Gemini/Anthropic) are **not** env vars — they're entered per-provider in Settings → AI and stored locally via `electron-store`.

---

## Available Scripts

```bash
npm run dev            # development server + Electron with hot reload
npm run build          # Next.js build only (used in CI)
npm run build:pack     # full production build with installers

npm run lint            # ESLint
npm run lint:fix        # ESLint with auto-fix
npm run format           # Prettier (write)
npm run format:check     # Prettier (check only)
npm run type-check       # TypeScript (no emit)

npm run version:patch   # bump patch version in package.json (local only, doesn't trigger CI)
npm run version:minor   # bump minor version
npm run version:major   # bump major version
```

---

## Project Structure

```
snapflow-desktop/
├── main/
│   ├── main.ts                  # Electron entry, IPC handlers, OAuth callbacks
│   ├── preload.ts               # Context bridge (window.api)
│   ├── services/
│   │   ├── ai.ts                # AI session description (Groq/OpenAI/Gemini/Anthropic)
│   │   ├── auth.ts              # Supabase auth (session management)
│   │   ├── capture.ts           # Screenshot + ffmpeg recording
│   │   ├── clipboard.ts         # Bug report clipboard formatting
│   │   ├── connectors.ts        # GitHub/Zoho connector CRUD + issue/bug sync + screenshot embedding
│   │   ├── debug-collector/     # Debug log collection utilities
│   │   ├── github.ts            # GitHub OAuth (token exchange, user, repos)
│   │   ├── issues.ts            # Snap CRUD (local + cloud)
│   │   ├── onboarding.ts        # Onboarding progress (persistent, per-user)
│   │   ├── overlay.ts           # Red border overlay window shown while recording
│   │   ├── recorder.ts          # Recording state machine
│   │   ├── settings.ts          # App settings (electron-store)
│   │   ├── sync.ts              # Supabase Storage sync
│   │   ├── tenant.ts            # Organization management
│   │   ├── updater.ts           # Auto-update (electron-updater)
│   │   ├── window-picker.ts     # Available screens/windows list, remembers default source
│   │   ├── workspace.ts         # Workspace + invite + pending_invites
│   │   └── zoho.ts              # Zoho OAuth & bug creation/update/delete
│   ├── utils/
│   │   ├── secure-config.ts     # Bootstrap secrets → encrypt → electron-store
│   │   ├── supabase.ts          # getSupabase() / getSupabaseAdmin()
│   │   ├── session.ts           # JWT session helpers
│   │   ├── storage.ts           # File system helpers
│   │   └── tray-icon-manager.ts # Tray icon state
│   └── helpers/
│       └── create-window.ts     # BrowserWindow factory
│
├── renderer/
│   ├── pages/
│   │   ├── _app.tsx             # Global providers, auth guard, network status
│   │   ├── home.tsx             # Snaps dashboard
│   │   ├── auth.tsx             # Login / signup
│   │   ├── onboarding.tsx       # Guided setup (org → workspace → connectors)
│   │   ├── join-workspace.tsx   # Invite acceptance with multi-invite chaining
│   │   ├── settings.tsx         # Account, connectors, sync, workspace settings
│   │   ├── annotate.tsx         # Image annotation editor
│   │   ├── annotate-recording.tsx
│   │   ├── annotate-session.tsx # AI-assisted session review and annotation
│   │   ├── session-hud.tsx      # In-session HUD overlay
│   │   ├── area-capture.tsx / area-selector.tsx
│   │   ├── window-capture.tsx / window-picker.tsx
│   │   └── recording-*.tsx      # Recording control, overlay, area selector
│   ├── components/
│   │   ├── layout/              # AppShell, PageContent, PageHeader, Section, CenteredLayout
│   │   ├── ui/                  # Button, Card, Dialog, Select, Avatar, ProfileDropdown, WorkspaceSwitcher, …
│   │   ├── settings/            # AccountSection, GitHubConnectorManager, WorkspacesSection, …
│   │   └── WindowPickerModal.tsx
│   ├── hooks/
│   │   ├── useNetworkStatus.ts  # navigator.onLine → Zustand
│   │   └── useSyncQueue.ts      # Offline-aware sync queue
│   ├── store/useStore.ts        # Zustand (user, workspace, snaps, isOnline, syncQueue)
│   └── types/index.ts
│
├── supabase/
│   ├── migrations/              # SQL migrations (apply in order via `supabase db push`)
│   ├── templates/               # Branded email templates
│   └── config.toml              # Local dev stack + declared storage buckets
│
├── resources/                   # Icons, tray images, entitlements.mac.plist, app-bootstrap.json
├── .github/workflows/
│   ├── ci.yml                   # Lint + format check + build on push/PR to main/develop
│   └── release.yml              # Manual: validate → bump minor → build all platforms → publish release
├── electron-builder.yml
└── package.json
```

---

## Release Process

Releases are **manual only** — go to **Actions → Build and Release → Run workflow**. There is no tag-push or patch/major trigger: the workflow always bumps the **minor** version, builds all three platforms, and publishes a GitHub release. `npm run version:patch`/`version:major` are for local/manual version bumps outside this workflow.

### Required GitHub Secrets

| Secret                                  | Purpose                                                        |
| --------------------------------------- | -------------------------------------------------------------- |
| `SUPABASE_URL`                          | Bundled into the app at build time                             |
| `SUPABASE_ANON_KEY`                     | Bundled into the app at build time                             |
| `SUPABASE_SERVICE_ROLE_KEY`             | Bundled into the app at build time                             |
| `CLIENT_ID` / `CLIENT_SECRET`           | GitHub OAuth connector (mapped to `GITHUB_CLIENT_ID`/`SECRET`) |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` | Zoho OAuth connector                                           |
| `GITHUB_TOKEN`                          | Auto-provided — GitHub release creation                        |

Secrets are written to `resources/app-bootstrap.json` by CI, read by `secure-config.ts` at first launch, encrypted into `electron-store`, then the bootstrap file is deleted. Builds are not code-signed (no `CSC_LINK`/notarization secrets configured).

### Release Artifacts

| Platform            | Files                        |
| ------------------- | ---------------------------- |
| macOS (x64 + arm64) | `.dmg`, `.zip`               |
| Windows (x64)       | NSIS `.exe`, portable `.exe` |
| Linux (x64)         | `.AppImage`, `.deb`, `.rpm`  |

---

## Troubleshooting

**Screen Recording permission denied (macOS)** — Go to System Settings → Privacy & Security → Screen Recording, enable SnapFlow, then **restart the app** (Electron requires a full restart after this permission is granted).

**`navigator.mediaDevices` undefined in recording window** — Recording windows must load via `file://`. Use `loadFile('blank.html')`, never `loadURL('data:...')`.

**`desktopCapturer` returns empty thumbnails on macOS** — Call it from a hidden BrowserWindow renderer via `captureFrameViaRenderer()`, not from the main process.

**Invite email not received** — Verify `SUPABASE_SERVICE_ROLE_KEY` is set. Without it, invites fall back to OTP/magic-link. Check Supabase Dashboard → Authentication → Logs.

**Storage upload fails with "row-level security policy"** — The storage bucket needs RLS policies in addition to being created; `supabase seed buckets` only creates the bucket, it doesn't attach policies. Check `supabase/migrations/` for a `storage.objects` policy migration and run `supabase db push --linked`.

**App logs**

```
macOS:   ~/Library/Logs/SnapFlow/main.log
Windows: %APPDATA%\SnapFlow\logs\main.log
Linux:   ~/.config/SnapFlow/logs/main.log
```

---

## License

MIT — see [LICENSE](LICENSE) for details.
