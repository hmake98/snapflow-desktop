# SnapFlow Desktop

<p align="center">
  <strong>A powerful Electron-based screenshot capture and screen recording tool with team collaboration and platform integrations</strong>
</p>

<p align="center">
  Capture, annotate, organize, and sync your screenshots and recordings to GitHub Issues, Zoho Projects, and the cloud
</p>

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Release Process](#release-process)
- [Code Quality](#code-quality)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

> **Legend**: Fully implemented | In development | Planned

### Screenshot Capture

- Full Screen Capture — capture entire display with multi-monitor support
- Multi-Display Support — select specific screen when using multiple monitors
- Window Capture — select and capture individual application windows with preview
- Region Selection — draw custom rectangular area with transparent overlay
- Auto Clipboard Copy — screenshots automatically copied to clipboard
- High-DPI Support — pixel-accurate captures on Retina displays via `nativeImage.crop()`
- Permission Management — checks and guides macOS Screen Recording permissions
- Global Shortcuts — Cmd+Shift+3 (Full Screen), Cmd+Shift+5 (Area) on macOS; Ctrl+Shift+3/5 on Windows/Linux

### Image Annotation

- Freehand Drawing — pen tool with customizable colors and stroke width
- Shape Tools — rectangles and circles with fill and stroke options
- Arrow Tool — directional arrows for pointing out specific areas
- Color Picker — 9 predefined colors plus custom color selection
- Undo/Redo — complete action history management
- Konva.js Canvas — smooth 2D drawing engine

### Screen Recording

- Screen Recording — record full screen or selected windows with visual overlay
- Screen/Window Selection — choose from available displays and application windows
- Red Border Overlay — transparent, click-through border showing recording area
- Quick Start — Ctrl+Shift+R shortcut, tray menu, or tray icon click to start/stop
- Default Source — save preferred recording source to skip selection next time
- Recording Annotation — annotate recorded videos after capture

### Snap / Issue Tracking

- Create Snaps — save captures as snaps with title, description, and tags
- Tag Management — organize snaps with custom tags
- Smart Filtering — filter by type, status, tags, and search
- Sort Options — sort by date or name, ascending/descending
- Preview Mode — full-resolution image preview with details sidebar
- Local Storage — organized file structure under `~/SnapFlow/`
- Paste Bug Reports — copy formatted bug reports to clipboard

### Platform Integrations

- GitHub Integration — create GitHub issues with embedded screenshots via OAuth
- Zoho Projects Integration — create and manage bugs in Zoho Projects via OAuth
- Cloud Sync — sync snaps and screenshots to Supabase Storage
- Sync History — per-snap sync status (local / syncing / synced / failed)
- Offline Support — queue sync operations when offline, auto-process on reconnect

### Multi-Tenant Team Collaboration

- Organizations (Tenants) — create and manage organizations
- Workspaces — multiple workspaces per organization for project isolation
- Role-Based Access — roles: owner, admin, pm, dev, qa, client
- Team Invites — email-based invites via Supabase Auth (admin API + OTP fallback)
- Multi-Invite Support — multiple simultaneous pending invites tracked in DB, processed one at a time
- Multi-Org Support — workspace switcher groups workspaces by organization
- Onboarding Flow — step-by-step guided setup for new users and invited members

### Security & Authentication

- User Authentication — email/password and Google OAuth via Supabase Auth
- Secure Session Management — JWT with automatic token refresh
- Session Persistence — stay logged in across app restarts
- Row Level Security — all Supabase tables protected with RLS policies
- Context Isolation — Electron security best practices with IPC bridge

### User Experience

- Dark Mode UI — dark theme with Tailwind CSS
- System Tray — quick access to capture from menu bar
- Smooth Animations — Framer Motion transitions
- Toast Notifications — user-friendly feedback with Sonner
- Cross-Platform — macOS, Windows, and Linux
- Offline Banner — amber/green status banner for offline/syncing state

---

## Tech Stack

### Frontend (Renderer Process)

- **Framework**: Next.js 16.x with React 19.x
- **Language**: TypeScript 5.9.x
- **Styling**: Tailwind CSS 4.x
- **UI Components**: Radix UI (Dialog, Select, Label, Tooltip)
- **State Management**: Zustand 5.x
- **Canvas Library**: Konva.js 10.x with React-Konva
- **Animations**: Framer Motion 12.x
- **Notifications**: Sonner 2.x
- **Date Utilities**: date-fns 4.x

### Backend (Main Process)

- **Runtime**: Electron 40.x
- **Framework**: Nextron 9.5.x (Next.js + Electron)
- **Database**: Supabase (PostgreSQL + Auth + Storage) via `@supabase/supabase-js` 2.x
- **Capture**: Native Electron `desktopCapturer` + `nativeImage.crop()`
- **Image Processing**: sharp 0.34.x for thumbnails
- **Storage**: electron-store 11.x (local metadata) + Supabase Storage (cloud)
- **HTTP Client**: axios 1.x (GitHub & Zoho API)
- **Logging**: electron-log 5.x
- **Auto-Updates**: update-electron-app

### Development Tools

- **Build Tool**: electron-builder 26.x
- **Package Manager**: npm
- **Code Quality**: ESLint 10.x, Prettier 3.x
- **Pre-commit Hooks**: Husky 9.x + lint-staged 16.x

---

## Prerequisites

- **Node.js**: 20.0.0 or higher
- **npm**: Latest version
- **Supabase Account**: Free tier available at [supabase.com](https://supabase.com)
- **macOS**: 10.15+ for Screen Recording permission (Windows/Linux also supported)

---

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd snapflow-desktop
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Supabase

1. Create a Supabase project at [app.supabase.com](https://app.supabase.com)

2. Get your project credentials from **Settings → API**:
   - Project URL
   - anon/public key
   - service_role key (required for sending team invites)

3. Run the database migration:
   - Open `supabase/migrations/20260101000000_initial_schema.sql` in Supabase Dashboard SQL Editor and run it
   - Then run `supabase/migrations/20260331000001_pending_invites.sql` for multi-invite support

4. Create a storage bucket:
   - Go to **Storage** in Supabase Dashboard → **New bucket**
   - Name: `snapflow-public-bucket`, Public: Yes
   - Allowed MIME types: `image/png`, `image/jpeg`, `image/webp`, `video/mp4`, `video/webm`

5. Configure email templates (optional but recommended):
   - Templates are in `supabase/templates/`
   - Apply via Supabase Dashboard → **Authentication → Email Templates**
   - Or push via Supabase CLI: `supabase config push --experimental`

6. Create a `.env` file in the project root:

   ```bash
   cp .env.example .env
   ```

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Required for team invites
   NODE_ENV=development
   ```

### 4. Run the Application

```bash
npm run dev
```

### 5. First Run Setup

1. The app opens automatically
2. Sign up with email/password or Google OAuth
3. Complete onboarding: create organization → create workspace → (optional) connect GitHub/Zoho
4. Grant Screen Recording permission when prompted (macOS)
5. Start capturing from the system tray icon

---

## Configuration

### Environment Variables

```env
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
NODE_ENV=development

# Required for team invites (uses Supabase Admin API)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Optional — GitHub OAuth connector
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Optional — Zoho OAuth connector
ZOHO_CLIENT_ID=your-zoho-client-id
ZOHO_CLIENT_SECRET=your-zoho-client-secret
```

### Platform Connectors

#### GitHub Integration

1. Go to **Settings → Connectors**
2. Click **Add GitHub Connector**
3. Authenticate via OAuth or enter a personal access token with `repo` scope
4. Select the target repository
5. Up to 5 connectors supported

#### Zoho Projects Integration

1. Go to **Settings → Connectors**
2. Click **Connect Zoho**
3. Authorize via Zoho OAuth
4. Select your Portal and Project
5. Access tokens refresh automatically

---

## Usage Guide

### Capturing Screenshots

- Click the SnapFlow tray icon → **Capture Full Screen** or **Capture Area**
- Use global shortcuts: `Cmd+Shift+3` (full screen), `Cmd+Shift+5` (area)
- Screenshot opens in annotation editor and is copied to clipboard automatically

### Screen Recording

- Click the tray icon → **Record Screen**
- Select display or window (if multiple available)
- Area selector overlay appears — draw the region to record
- Click the tray icon again to start, then again to stop
- Recording opens in annotation editor

### Managing Snaps

- Open the **Home** page to see all snaps
- Filter by type, sync status, or tags; search by title
- Click a snap card to preview, edit description, or manage tags
- Click **Sync to GitHub** or **Sync to Zoho** to push to external platforms

### Team Collaboration

- Go to **Settings → Workspaces** to manage your organization and workspaces
- Go to **Settings → Team** to invite members by email with a role
- Invited users receive an email; after signing in they are shown the join-workspace screen
- If a user has multiple pending invites, they are shown one at a time in order
- Use the workspace switcher in the header to switch between workspaces (grouped by organization for multi-org users)

### Keyboard Shortcuts

| Shortcut               | Action                           |
| ---------------------- | -------------------------------- |
| `Cmd/Ctrl + Shift + 3` | Capture full screen              |
| `Cmd/Ctrl + Shift + 5` | Capture area                     |
| `Cmd/Ctrl + Shift + R` | Start/stop recording             |
| `ESC`                  | Cancel selection or close dialog |
| `Cmd/Ctrl + Z`         | Undo (annotation editor)         |
| `Cmd/Ctrl + Shift + Z` | Redo (annotation editor)         |

---

## Project Structure

```
snapflow-desktop/
├── main/                          # Electron main process
│   ├── background.ts              # App lifecycle, all IPC handlers, OAuth callback
│   ├── preload.ts                 # Context bridge (window.api)
│   ├── services/
│   │   ├── auth.ts                # Supabase auth (getSession is async)
│   │   ├── capture.ts             # Screenshot capture
│   │   ├── clipboard.ts           # Clipboard operations
│   │   ├── connectors.ts          # Connector CRUD
│   │   ├── github.ts              # GitHub OAuth & API
│   │   ├── issues.ts              # Snap CRUD with local & cloud storage
│   │   ├── onboarding.ts          # Onboarding progress tracking
│   │   ├── overlay.ts             # Capture overlay window
│   │   ├── recorder.ts            # Screen recording
│   │   ├── settings.ts            # App settings (storage path, shortcuts)
│   │   ├── sync.ts                # Supabase cloud sync
│   │   ├── tenant.ts              # Organization management
│   │   ├── updater.ts             # Auto-update via update-electron-app
│   │   ├── window-picker.ts       # Window selection
│   │   ├── workspace.ts           # Workspace + invite + pending_invites
│   │   └── zoho.ts                # Zoho OAuth & Projects API
│   ├── utils/
│   │   ├── supabase.ts            # getSupabase() + getSupabaseAdmin()
│   │   ├── session.ts             # Session management
│   │   ├── storage.ts             # File system storage
│   │   ├── id-generator.ts        # Unique ID generation
│   │   └── tray-icon-manager.ts   # Tray icon state (normal/ready/recording)
│   └── helpers/
│       └── create-window.ts       # BrowserWindow creation utility
│
├── renderer/                      # Next.js frontend
│   ├── pages/
│   │   ├── _app.tsx               # Global providers + useNetworkStatus
│   │   ├── home.tsx               # Dashboard with snaps gallery, offline support
│   │   ├── auth.tsx               # Login/signup
│   │   ├── annotate.tsx           # Image annotation editor (Konva.js)
│   │   ├── annotate-recording.tsx # Video annotation
│   │   ├── area-capture.tsx       # Area selection mode
│   │   ├── area-selector.tsx      # Region selection overlay
│   │   ├── recording-area-selector.tsx
│   │   ├── recording-control.tsx  # Floating recording controls
│   │   ├── recording-overlay.tsx  # Recording overlay window
│   │   ├── window-capture.tsx     # Window capture with preview
│   │   ├── window-picker.tsx      # Window picker modal page
│   │   ├── onboarding.tsx         # Onboarding (steps: tenant, workspace, connectors)
│   │   ├── join-workspace.tsx     # Invite acceptance + multi-invite chaining
│   │   ├── settings.tsx           # Settings (account, connectors, sync, general)
│   │   └── 500.tsx                # Error page
│   ├── components/
│   │   ├── ui/
│   │   │   ├── WorkspaceSwitcher.tsx  # Multi-org workspace switcher
│   │   │   ├── OfflineBanner.tsx      # Offline/sync status banner
│   │   │   ├── WindowControls.tsx     # Draggable titlebar
│   │   │   ├── Button.tsx, Input.tsx, Card.tsx, Badge.tsx
│   │   │   ├── Dialog.tsx, Select.tsx, ChipsInput.tsx
│   │   │   ├── FilterBar.tsx, Pagination.tsx, Skeleton.tsx
│   │   │   └── ...
│   │   └── settings/
│   │       ├── AccountSection.tsx
│   │       ├── DisplaysSection.tsx
│   │       ├── GitHubConnectorManager.tsx
│   │       ├── WorkspacesSection.tsx  # Org/workspace name editing (live UI update)
│   │       ├── UsersSection.tsx
│   │       ├── ZohoConnectorManager.tsx
│   │       └── ...
│   ├── hooks/
│   │   ├── useNetworkStatus.ts    # navigator.onLine → Zustand isOnline
│   │   └── useSyncQueue.ts        # Offline-aware sync wrapper
│   ├── store/
│   │   └── useStore.ts            # Zustand (user, workspace, snaps, isOnline, syncQueue)
│   └── types/
│       └── index.ts               # TypeScript types (WorkspaceWithRole includes tenantName)
│
├── supabase/
│   ├── migrations/
│   │   ├── 20260101000000_initial_schema.sql   # Full schema (tenants, workspaces, snaps, etc.)
│   │   └── 20260331000001_pending_invites.sql  # Multi-invite tracking table
│   ├── templates/                 # Branded email templates
│   │   ├── confirmation.html
│   │   ├── invite.html
│   │   ├── magic_link.html
│   │   └── recovery.html
│   └── config.toml                # Supabase CLI config
│
├── resources/
│   ├── blank.html                 # Required for recording window (mediaDevices needs file:// context)
│   ├── icon.png / icon.icns / icon.ico
│   └── tray-icon*.png             # Tray icons (normal/record/stop, dark/light variants)
│
├── .github/workflows/
│   ├── ci.yml                     # Lint, format, type-check, build
│   └── release.yml                # Build and publish releases on git tags
│
├── CLAUDE.md                      # Claude Code instructions
├── CHANGELOG.md                   # Version history
├── package.json                   # v1.1.8
├── electron-builder.yml           # Build config
└── .env                           # Secrets (create from .env.example)
```

---

## Available Scripts

```bash
# Development
npm run dev              # Start development server with hot reload

# Code quality
npm run format           # Format all files with Prettier
npm run format:check     # Check formatting without modifying
npm run lint             # Run ESLint
npm run lint:fix          # Auto-fix ESLint issues
npm run type-check       # TypeScript type checking

# Build
npm run build            # Next.js build only (CI validation)
npm run build:pack       # Full production build with installers

# Version bumping
npm run version:patch    # Bump patch version (1.0.0 → 1.0.1)
npm run version:minor    # Bump minor version (1.0.0 → 1.1.0)
npm run version:major    # Bump major version (1.0.0 → 2.0.0)
```

---

## Release Process

SnapFlow uses GitHub Actions for automated builds and releases.

### Creating a Release

#### 1. Update Version

```bash
npm run version:patch    # or version:minor / version:major
```

Update `electron-builder.yml` DMG title to match if needed.

#### 2. Commit and Tag

```bash
git add package.json electron-builder.yml
git commit -m "chore: release v1.x.x"
git tag -a v1.x.x -m "Release v1.x.x"
git push origin main --tags
```

This triggers the release workflow which builds for macOS, Windows, and Linux in parallel and creates a draft GitHub release.

#### 3. Publish

Go to **Releases** in GitHub, review the draft, and publish.

### Required GitHub Secrets

| Secret              | Purpose                         |
| ------------------- | ------------------------------- |
| `SUPABASE_URL`      | Injected into build `.env`      |
| `SUPABASE_ANON_KEY` | Injected into build `.env`      |
| `GH_TOKEN`          | Auto-provided by GitHub Actions |

### Release Artifacts

| Platform          | Files                                  |
| ----------------- | -------------------------------------- |
| macOS (Universal) | `.dmg`, `.zip`, `.dmg.blockmap`        |
| Windows           | NSIS installer `.exe`, portable `.exe` |
| Linux             | `.AppImage`, `.deb`, `.rpm`            |

### Release Checklist

- [ ] All features complete and tested locally
- [ ] `npm run format && npm run lint && npm run type-check` all pass
- [ ] `npm run build` succeeds
- [ ] Version updated in `package.json`
- [ ] CHANGELOG updated

---

## Code Quality

- **Prettier** — code formatting (`.prettierrc.json`)
- **ESLint** — linting (`eslint.config.mjs`, TypeScript-aware)
- **Husky + lint-staged** — runs ESLint and Prettier on staged files before each commit
- **TypeScript** — strict typing throughout

---

## Troubleshooting

### Screen Recording Permission Denied (macOS)

Go to **System Settings → Privacy & Security → Screen Recording**, enable SnapFlow, then **restart the app** (Electron requires a restart after granting this permission).

### `navigator.mediaDevices` is undefined in Recording Window

Recording windows must load via `file://` protocol — use `loadFile(blank.html)`, not `loadURL('data:...')`. Data URLs are not secure contexts and lack `mediaDevices`.

### `desktopCapturer.getSources()` Returns Empty Thumbnails

On macOS, calling this from the main process returns 0×0 thumbnails. Use the `captureFrameViaRenderer()` helper which runs in a hidden BrowserWindow instead.

### Invite Email Not Received

- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in `.env` — without it, invites fall back to OTP/magic-link
- Check Supabase Dashboard → **Authentication → Logs** for email delivery status

### Multiple Pending Invites

If a user was invited to multiple workspaces, they will be shown the join screens one at a time in the order the invites were created. Each workspace must be accepted separately before proceeding.

### App Logs

```bash
# macOS
~/Library/Logs/SnapFlow/main.log

# Windows
%APPDATA%\SnapFlow\logs\main.log

# Linux
~/.config/SnapFlow/logs/main.log
```

---

## License

See [LICENSE](LICENSE) for details.
