# SnapFlow Desktop

A cross-platform desktop app for screenshot capture, screen recording, annotation, and team collaboration — with sync to GitHub Issues, Zoho Projects, and the cloud.

Built with **Electron + Next.js** (Nextron), **Supabase**, and **TypeScript**.

---

## Features

- **Screenshot capture** — full screen, area selection, or individual window; auto-copied to clipboard
- **Screen recording** — full screen or window, red overlay border during recording, default source memory
- **Annotation editor** — freehand drawing, shapes, arrows, color picker, undo/redo (Konva.js)
- **AI session review** — auto-generates bug descriptions from recorded sessions via Groq (llama-4-scout)
- **Snap management** — create, tag, filter, search, and preview captures locally
- **Cloud sync** — sync snaps to Supabase Storage with per-snap status (local / syncing / synced / failed)
- **GitHub integration** — create issues with embedded screenshots via OAuth
- **Zoho Projects integration** — create bugs/tasks via OAuth
- **Multi-tenant workspaces** — organizations → workspaces → snaps; roles: owner, admin, pm, dev, qa, client
- **Team invites** — email invites with multi-invite chaining (multiple pending invites processed in order)
- **Offline support** — sync queue drains automatically on reconnect
- **Auto-updates** — background update check and install via electron-updater

---

## Tech Stack

| Layer        | Technologies                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------- |
| Renderer     | Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand, Konva.js, Framer Motion, Radix UI |
| Main process | Electron 42, Nextron, electron-store, electron-log, electron-updater, sharp, ffmpeg-static   |
| Database     | Supabase (PostgreSQL + Auth + Storage), Row Level Security                                   |
| AI           | Groq API (llama-4-scout vision model)                                                        |
| Integrations | GitHub OAuth + REST API, Zoho OAuth + Projects API                                           |
| Build        | electron-builder 26, GitHub Actions                                                          |
| Code quality | ESLint, Prettier, Husky + lint-staged, TypeScript strict                                     |

---

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
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

1. Create a project at [app.supabase.com](https://app.supabase.com)
2. Run migrations in order from `supabase/migrations/` via the SQL editor
3. Create a public storage bucket named `snapflow-public-bucket` (allowed types: `image/*`, `video/*`)
4. Copy credentials from **Project Settings → API** into your `.env`

---

## Environment Variables

```env
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # required for team invites

# Optional — GitHub integration
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Optional — Zoho integration
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=

NODE_ENV=development
```

---

## Available Scripts

```bash
npm run dev            # development server + Electron with hot reload
npm run build          # Next.js build only (used in CI)
npm run build:pack     # full production build with installers

npm run lint           # ESLint
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier (write)
npm run format:check   # Prettier (check only)
npm run type-check     # TypeScript (no emit)

npm run version:patch  # bump patch version in package.json
npm run version:minor  # bump minor version
npm run version:major  # bump major version
```

---

## Project Structure

```
snapflow-desktop/
├── main/
│   ├── main.ts                  # Electron entry, IPC handlers, OAuth callbacks
│   ├── preload.ts               # Context bridge (window.api)
│   ├── services/
│   │   ├── ai.ts                # AI session description via Groq
│   │   ├── auth.ts              # Supabase auth (session management)
│   │   ├── capture.ts           # Screenshot + ffmpeg recording
│   │   ├── clipboard.ts         # Bug report clipboard formatting
│   │   ├── connectors.ts        # GitHub / Zoho connector CRUD
│   │   ├── debug-collector/     # Debug log collection utilities
│   │   ├── github.ts            # GitHub OAuth & Issues API
│   │   ├── issues.ts            # Snap CRUD (local + cloud)
│   │   ├── onboarding.ts        # Onboarding progress (persistent, per-user)
│   │   ├── overlay.ts           # Recording overlay window
│   │   ├── recorder.ts          # Recording state machine
│   │   ├── settings.ts          # App settings (electron-store)
│   │   ├── sync.ts              # Supabase Storage sync
│   │   ├── tenant.ts            # Organization management
│   │   ├── updater.ts           # Auto-update (electron-updater)
│   │   ├── window-picker.ts     # Available screens/windows list
│   │   ├── workspace.ts         # Workspace + invite + pending_invites
│   │   └── zoho.ts              # Zoho OAuth & Projects API
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
│   │   ├── ui/                  # Button, Card, Dialog, Select, Badge, OfflineBanner, WorkspaceSwitcher, …
│   │   └── settings/            # AccountSection, GitHubConnectorManager, WorkspacesSection, …
│   ├── hooks/
│   │   ├── useNetworkStatus.ts  # navigator.onLine → Zustand
│   │   └── useSyncQueue.ts      # Offline-aware sync queue
│   ├── store/useStore.ts        # Zustand (user, workspace, snaps, isOnline, syncQueue)
│   └── types/index.ts
│
├── supabase/
│   ├── migrations/              # SQL migrations (apply in order)
│   ├── templates/               # Branded email templates
│   └── config.toml
│
├── resources/                   # Icons, tray images, entitlements.mac.plist, app-bootstrap.json
├── .github/workflows/
│   ├── ci.yml                   # Lint + type-check + build on every push
│   └── release.yml              # Build all platforms + publish release on tag
├── electron-builder.yml
└── package.json                 # v1.1.9
```

---

## Release Process

### Manual trigger (recommended)

Go to **Actions → Build and Release → Run workflow**, choose `patch / minor / major`. The workflow bumps the version, commits, tags, builds for all three platforms, and publishes a GitHub release.

### Tag push

```bash
npm run version:patch     # or minor / major
git add package.json && git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z && git push origin main --tags
```

### Required GitHub Secrets

| Secret                                      | Purpose                                 |
| ------------------------------------------- | --------------------------------------- |
| `SUPABASE_URL`                              | Bundled into the app at build time      |
| `SUPABASE_ANON_KEY`                         | Bundled into the app at build time      |
| `SUPABASE_SERVICE_ROLE_KEY`                 | Bundled into the app at build time      |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth connector                  |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET`     | Zoho OAuth connector                    |
| `GITHUB_TOKEN`                              | Auto-provided — GitHub release creation |

Secrets are written to `resources/app-bootstrap.json` by CI, read by `secure-config.ts` at first launch, encrypted into `electron-store`, then the bootstrap file is deleted.

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

**App logs**

```
macOS:   ~/Library/Logs/SnapFlow/main.log
Windows: %APPDATA%\SnapFlow\logs\main.log
Linux:   ~/.config/SnapFlow/logs/main.log
```

---

## License

See [LICENSE](LICENSE) for details.
