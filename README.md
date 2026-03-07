# SnapFlow Desktop

<p align="center">
  <strong>A powerful Electron-based screenshot capture and annotation tool with issue tracking and platform integrations</strong>
</p>

<p align="center">
  Capture, annotate, organize, and sync your screenshots to GitHub Issues and the cloud
</p>

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Usage Guide](#-usage-guide)
- [Project Structure](#-project-structure)
- [Available Scripts](#-available-scripts)
- [Release Process](#-release-process)
- [Code Quality](#-code-quality)
- [Troubleshooting](#-troubleshooting)
- [Development Team Guidelines](#-development-team-guidelines)
- [License](#-license)

---

## ✨ Features

> **Legend**: ✅ = Fully implemented | 🚧 = In development | 📋 = Planned

### Screenshot Capture (✅)

- 📸 **Full Screen Capture** - Capture entire display with multi-monitor support
- 🖥️ **Multi-Display Support** - Select specific screen to capture when using multiple monitors
- 🪟 **Window Capture** - Select and capture individual application windows with preview
- ✂️ **Region Selection** - Draw custom rectangular area to capture with transparent overlay
- 📋 **Auto Clipboard Copy** - Screenshots automatically copied to clipboard for instant pasting
- 🖥️ **High-DPI Support** - Perfect pixel-accurate captures on Retina displays using `nativeImage.crop()`
- 🔐 **Permission Management** - Checks and guides macOS Screen Recording permissions
- ⌨️ **Global Shortcuts** - Cmd+Shift+3 (Full Screen), Cmd+Shift+5 (Area) on macOS; Ctrl+Shift+3/5 on Windows/Linux

### Image Annotation (✅)

- ✏️ **Freehand Drawing** - Pen tool with customizable colors and stroke width
- 🔷 **Shape Tools** - Rectangles and circles with fill and stroke options
- ➡️ **Arrow Tool** - Directional arrows for pointing out specific areas
- 📝 **Text Tool** - Add and edit text labels with custom styling (coming soon)
- 🎨 **Color Picker** - 9 predefined colors plus custom color selection
- ↩️ **Undo/Redo** - Complete action history management
- 🖱️ **Selection & Transform** - Select, move, and resize drawn elements
- 🎨 **Konva.js Canvas** - Powerful 2D drawing engine for smooth annotations

### Issue Tracking (✅)

- 📋 **Create Issues** - Save captures as issues with title, description, and tags
- 🏷️ **Tag Management** - Organize issues with custom tags
- 🔍 **Smart Filtering** - Filter by type, status, tags, and search
- 📊 **Sort Options** - Sort by date or name in ascending/descending order
- 🖼️ **Preview Mode** - Full-resolution image preview with details sidebar
- 💾 **Local Storage** - Organized file structure: `~/SnapFlow/Users/{userId}/Captures/YYYY/MM/DD/{issueId}/`
- 📋 **Paste Bug Reports** - Copy formatted bug reports to clipboard with title, description, recording link, and platform links

### Platform Integrations (✅)

- 🐙 **GitHub Integration** - Create GitHub issues with embedded screenshots
  - OAuth-based authentication flow
  - Upload screenshots directly to repository
  - Automatic issue creation with description and labels
  - Support for up to 5 repository connectors
  - Connector validation and error handling
- 📊 **Zoho Projects Integration** - Create and manage bugs in Zoho Projects
  - OAuth-based authentication flow
  - Portal and project selection
  - Automatic bug creation with screenshot URL
  - Access token auto-refresh support
- ☁️ **Cloud Sync** - Sync issues and screenshots to Supabase Storage
  - Automatic file and thumbnail uploads
  - Sync history tracking
  - Per-issue sync status (local/syncing/synced/failed)
- 🔗 **External Links** - Store and access issue URLs on external platforms

### Security & Authentication (✅)

- 🔒 **User Authentication** - Email-based signup and login via Supabase Auth
- 🛡️ **Secure Session Management** - JWT-based authentication with automatic token refresh
- 💾 **Session Persistence** - Stay logged in across app restarts
- 🗄️ **Supabase Backend** - Secure cloud database with real-time capabilities
- 🔐 **Context Isolation** - Electron security best practices with IPC bridge

### User Experience (✅)

- 🎨 **Dark Mode UI** - Beautiful dark theme interface with Radix UI components
- ⚡ **System Tray** - Quick access to capture from menu bar (both white and dark icons)
- 🎬 **Smooth Animations** - Framer Motion transitions with custom animations (fade-in, slide, scale, shimmer, float)
- 🔔 **Toast Notifications** - User-friendly feedback with Sonner
- 💻 **Cross-Platform** - Full macOS, Windows, and Linux support with platform-specific builds
- 📱 **Responsive Design** - Adaptive layout for different screen sizes
- 📄 **Pagination** - Efficient browsing with customizable items per page (6, 12, 24, 48)
- 🪟 **Window Controls** - Draggable titlebar with minimize/maximize/close buttons
- ⌨️ **Keyboard Shortcuts** - Global hotkeys for quick capture and in-app shortcuts for editing
- 🏢 **Multi-Tenant Organizations** - Create and manage organizations with team members
- 📁 **Workspaces** - Multiple workspaces per organization for project isolation
- 📍 **Onboarding Flow** - Step-by-step guided setup for new users
- 👥 **User Management** - Invite team members with role-based access (admin/dev)

### Screen Recording (✅)

- 🎥 **Screen Recording** - Record full screen or individual windows with visual overlay
- 🖥️ **Screen/Window Selection** - Choose from available displays and application windows
- 📍 **Red Border Overlay** - Transparent, click-through red border showing recording area
- ⚡ **Quick Start** - Ctrl+Shift+R shortcut, tray menu, or tray icon double-click to start/stop
- 📌 **Default Source** - Save preferred recording source to skip selection next time
- 🖊️ **Recording Annotation** - Annotate recorded videos after capture
- 📋 **Permission Management** - Guides macOS users to grant Screen Recording permission

### Planned Features (📋)

- 🔄 **Additional Platform Integrations** - Jira, Linear, Asana, etc.
- 📤 **Export Options** - Export issues to PDF, ZIP archive
- 🌐 **Public Sharing** - Generate shareable links for issues
- 🔍 **Advanced Search** - Full-text search across descriptions
- 🏷️ **Smart Tags** - Auto-suggest tags based on content

---

## 🛠️ Tech Stack

### Frontend (Renderer Process)

- **Framework**: [Next.js](https://nextjs.org/) 16.x with [React](https://react.dev/) 19.x
- **Language**: [TypeScript](https://www.typescriptlang.org/) 5.9.x
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) 4.x
- **UI Components**: [Radix UI](https://www.radix-ui.com/) (Dialog, Select, Label, Tooltip, Slot, Visually Hidden)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/) 5.x
- **Canvas Library**: [Konva.js](https://konvajs.org/) 10.x with [React-Konva](https://konvajs.org/docs/react/) 19.x
- **Animations**: [Framer Motion](https://www.framer.com/motion/) 12.x
- **Notifications**: [Sonner](https://sonner.emilkowal.ski/) 2.x
- **Date Utilities**: [date-fns](https://date-fns.org/) 4.x
- **Icons**: [React Icons](https://react-icons.github.io/react-icons/) 5.x
- **UI Utilities**: [clsx](https://github.com/lukeed/clsx) 2.x, [class-variance-authority](https://cva.style/docs) 0.7.x

### Backend (Main Process)

- **Runtime**: [Electron](https://www.electronjs.org/) 40.x
- **Framework**: [Nextron](https://github.com/saltyshiomix/nextron) 9.5.x (Next.js + Electron)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL + Auth + Storage) via `@supabase/supabase-js` 2.x
- **Capture**: Native Electron `desktopCapturer` API with `nativeImage.crop()`
- **Image Processing**: [sharp](https://sharp.pixelplumbing.com/) 0.34.x for thumbnails and resizing
- **Storage**:
  - Local: [electron-store](https://github.com/sindresorhus/electron-store) 11.x for metadata + file system for captures
  - Cloud: Supabase Storage (`snapflow-public-bucket`)
- **HTTP Client**: [axios](https://axios-http.com/) 1.x (GitHub & Zoho API integrations)
- **Logging**: [electron-log](https://www.npmjs.com/package/electron-log) 5.x
- **Auto-Updates**: [electron-updater](https://www.electron.build/auto-update) 6.x

### Development Tools

- **Build Tool**: [electron-builder](https://www.electron.build/) 26.x
- **Package Manager**: npm (with package-lock.json)
- **Code Quality**: [ESLint](https://eslint.org/) 10.x with [@typescript-eslint](https://typescript-eslint.io/) 8.x
- **Code Formatting**: [Prettier](https://prettier.io/) 3.x
- **Pre-commit Hooks**: [Husky](https://typicode.github.io/husky/) 9.x
- **Staged Files Linting**: [lint-staged](https://github.com/okonet/lint-staged) 16.x
- **PostCSS**: [PostCSS](https://postcss.org/) 8.x with [Autoprefixer](https://github.com/postcss/autoprefixer) 10.x

---

## 📦 Prerequisites

- **Node.js**: 20.0.0 or higher
- **npm/yarn/pnpm**: Latest version
- **Supabase Account**: Free tier available at [supabase.com](https://supabase.com)
- **macOS**: 10.15+ (for Screen Recording permission)

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd snapflow-desktop
```

### 2. Install Dependencies

```bash
npm install
```

This will install all npm dependencies and prepare the app for development.

### 3. Setup Supabase

1. Create a Supabase project at [app.supabase.com](https://app.supabase.com)
2. Get your project credentials from **Settings** → **API**:
   - Project URL
   - anon/public key

3. Run the SQL schema to create database tables:
   - Go to **SQL Editor** in your Supabase Dashboard
   - Open `main/migrations/supabase-mvp-migration.sql` and copy the entire contents
   - Paste and run the SQL in the editor
   - This creates the `issues` and `sync_history` tables with RLS policies

4. Create a storage bucket for file uploads:
   - Go to **Storage** section in Supabase Dashboard
   - Click **New bucket**
   - Configure the bucket:
     - **Name**: `snapflow-public-bucket`
     - **Public**: Yes (checked)
     - **File size limit**: 52428800 (50MB)
     - **Allowed MIME types**: `image/png`, `image/jpeg`, `image/jpg`, `image/gif`, `image/webp`, `video/mp4`, `video/webm`, `video/quicktime`
   - Click **Create bucket**

5. Create a `.env` file in the project root:

   ```bash
   cp .env.example .env
   ```

6. Update `.env` with your Supabase credentials:

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   NODE_ENV=development
   ```

7. **(Optional)** For development, disable email confirmation in Supabase:
   - Go to **Authentication** → **Providers** → **Email**
   - Toggle "Enable Email Confirmations" to **OFF**

📖 **Migration files**: See `main/migrations/` for all SQL migration scripts

### 4. Run the Application

```bash
# Development mode with hot reload
npm run dev
```

### 5. First Run Setup

1. The app will open automatically
2. Create an account with your email and password
3. Complete the onboarding flow (create organization, workspace, and optional connectors)
4. Grant Screen Recording permission when prompted (macOS)
5. Start capturing screenshots from the system tray icon!

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Supabase Configuration
# Get these from https://app.supabase.com → Your Project → Settings → API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

# Node environment
NODE_ENV=development  # or "production" (no quotes needed)
```

**Note**: The `.env` file is automatically loaded by the main process. Use `.env.example` as a template.

### Supabase Setup

SnapFlow uses Supabase for:

- **Authentication**: Secure user signup/login with email/password
- **Session Management**: Automatic token refresh and persistence
- **Database**: Store issues and sync history with Row-Level Security
- **Storage**: Cloud file uploads with `snapflow-public-bucket`

**Required Setup:**

1. Create tables by running `main/migrations/supabase-mvp-migration.sql` in SQL Editor
2. Create storage bucket `snapflow-public-bucket` (see setup instructions above)
3. Storage RLS policies are included in the migration file

### Platform Connectors

#### GitHub Integration

1. Go to **Settings** → **Connectors** tab
2. Click **Add Connector**
3. Enter:
   - **Access Token**: Personal access token with `repo` scope
   - **Owner**: Repository owner username
   - **Repository**: Repository name
4. Click **Save** (connector will be validated automatically)
5. Supports up to 5 repository connectors

**Creating GitHub Token:**

1. Go to [GitHub Settings](https://github.com/settings/tokens) → Developer Settings → Personal Access Tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - `repo` - Full control of private repositories (required)
4. Generate and copy the token
5. Paste into SnapFlow connector form

**How it works:**

- Screenshots are uploaded to `.snapflow-screenshots/` folder in your repository
- Issue is created with screenshot embedded inline
- Tags are converted to GitHub labels
- Issue URL is stored for future reference

#### Zoho Projects Integration

1. Go to **Settings** → **Connectors** tab
2. Click **Connect Zoho**
3. Authorize via the Zoho OAuth browser window
4. Select your **Portal** and **Project**
5. Click **Save Connector**
6. Access tokens are automatically refreshed when expired

---

## 📖 Usage Guide

### Capturing Screenshots

#### From System Tray

1. Click the SnapFlow icon in your system tray
2. Select capture mode:
   - **Capture Full Screen** - Capture entire display
   - **Capture Area** - Draw selection rectangle with transparent overlay
3. Screenshot opens in annotation editor and is copied to clipboard

#### Area Selection

1. Semi-transparent overlay appears over your screen
2. Click and drag to select the area you want to capture
3. Release mouse to capture the selected region
4. Screenshot is automatically copied to clipboard
5. Press `ESC` to cancel

**Tips**:

- Screenshots are automatically copied to clipboard for instant pasting
- Perfect for sharing quickly in Slack, Discord, or any app (Cmd+V / Ctrl+V)
- High-DPI displays (Retina) are fully supported with pixel-perfect accuracy

### Annotating Screenshots

1. After capture, annotation editor opens automatically
2. Use tools from the left sidebar:
   - **Pen**: Freehand drawing
   - **Rectangle**: Draw rectangular shapes
   - **Circle**: Draw circular shapes
   - **Arrow**: Add directional arrows
   - **Text**: Add text labels
3. Customize colors and stroke width
4. Use **Undo/Redo** for mistakes
5. Click **Save** when done

### Managing Issues

#### Creating Issues

1. After annotation, fill in:
   - **Title**: Issue name
   - **Description**: Detailed description
   - **Tags**: Organize with custom tags
2. Click **Create Issue**
3. Issue appears in your dashboard

#### Viewing Issues

1. Open **Home** page
2. Use filters:
   - **Type**: All, Screenshots
   - **Status**: All, Local, Synced
   - **Tags**: Filter by tags
   - **Search**: Search by title or ID
3. Sort by date or name (ascending/descending)
4. Navigate pages and adjust items per page (6, 12, 24, or 48)
5. Click issue card to preview in full resolution

#### Syncing to GitHub

1. Make sure you have configured a GitHub connector in Settings
2. Open issue preview or click on an issue card
3. Click **Sync to GitHub** button
4. Select the connector/repository to sync to
5. Wait for sync to complete (toast notifications show progress)
6. View sync status badge and external link to GitHub issue

#### Cloud Sync

1. Issues are automatically synced to Supabase cloud storage
2. Files and thumbnails are uploaded to `snapflow-public-bucket`
3. Sync status is tracked per issue (local/syncing/synced/failed)
4. View sync history in Settings → Sync tab

#### Editing Issues

1. Click issue card to open preview dialog
2. Edit description by clicking **Edit** button
3. Add/remove tags using the chips input
4. Changes are saved automatically to local storage and Supabase

### Keyboard Shortcuts

#### Global Shortcuts (System-wide)

- **macOS**:
  - **Cmd + Shift + 3**: Capture full screen
  - **Cmd + Shift + 5**: Capture selected area
- **Windows/Linux**:
  - **Ctrl + Shift + 3**: Capture full screen
  - **Ctrl + Shift + 5**: Capture selected area

#### In-App Shortcuts

- **ESC**: Cancel area/window selection or close dialog
- **Cmd/Ctrl + V**: Paste captured screenshot (auto-copied to clipboard)
- **Cmd/Ctrl + Z**: Undo (in annotation editor)
- **Cmd/Ctrl + Shift + Z**: Redo (in annotation editor)

**Note**: Global shortcuts work even when the app is in the background, providing quick access to capture functionality.

---

## 📁 Project Structure

```
snapflow-desktop/
├── main/                          # Electron main process
│   ├── background.ts              # App lifecycle, IPC handlers, tray menu, OAuth servers
│   ├── preload.ts                 # Context bridge API (window.api)
│   ├── services/                  # Business logic modules
│   │   ├── auth.ts                # Supabase authentication
│   │   ├── capture.ts             # Screenshot capture with nativeImage
│   │   ├── connectors.ts          # GitHub & Zoho connector management
│   │   ├── github.ts              # GitHub OAuth & API service
│   │   ├── issues.ts              # Issue CRUD with local & cloud storage
│   │   ├── onboarding.ts          # Onboarding flow management
│   │   ├── sync.ts                # Supabase cloud sync service
│   │   ├── tenant.ts              # Multi-tenant organization management
│   │   ├── updater.ts             # Auto-update service
│   │   ├── workspace.ts           # Workspace management
│   │   └── zoho.ts                # Zoho OAuth & Projects API service
│   ├── utils/                     # Utilities
│   │   ├── supabase.ts            # Supabase client singleton
│   │   ├── session.ts             # Local session management
│   │   ├── storage.ts             # Local file system storage
│   │   ├── id-generator.ts        # Unique ID generation
│   │   └── tray-icon-manager.ts   # System tray icon management
│   ├── helpers/
│   │   └── create-window.ts       # BrowserWindow creation utility
│   └── migrations/                # SQL migration files
│       ├── add-user-profiles.sql
│       └── supabase-mvp-migration.sql
│
├── renderer/                      # Next.js frontend application
│   ├── pages/                     # React pages
│   │   ├── _app.tsx               # App wrapper with Zustand store, Sonner toast, Radix tooltip
│   │   ├── home.tsx               # Dashboard with issue gallery, filtering, pagination
│   │   ├── auth.tsx               # Login/signup page
│   │   ├── annotate.tsx           # Image annotation editor (Konva.js)
│   │   ├── annotate-recording.tsx # Video recording annotation editor
│   │   ├── area-capture.tsx       # Area selection capture mode
│   │   ├── area-selector.tsx      # Region selection overlay tool
│   │   ├── recording-area-selector.tsx # Area selector for screen recording
│   │   ├── recording-control.tsx  # Floating recording controls window
│   │   ├── window-capture.tsx     # Window capture with preview
│   │   ├── onboarding.tsx         # Multi-step onboarding flow
│   │   ├── settings.tsx           # Settings with tabs (Account, Connectors, Sync, General)
│   │   └── 500.tsx                # Error page
│   ├── components/
│   │   ├── ui/                    # Reusable UI components
│   │   │   ├── Button.tsx         # CVA-based button component
│   │   │   ├── Input.tsx          # Form input component
│   │   │   ├── Card.tsx           # Issue card component
│   │   │   ├── Badge.tsx          # Status badge component
│   │   │   ├── Dialog.tsx         # Radix UI dialog wrapper
│   │   │   ├── Select.tsx         # Custom select component
│   │   │   ├── ChipsInput.tsx     # Tag chips input component
│   │   │   ├── SearchInput.tsx    # Search input with suggestions
│   │   │   ├── FilterBar.tsx      # Issue filter controls
│   │   │   ├── Pagination.tsx     # Pagination with page size selector
│   │   │   ├── EmptyState.tsx     # Empty state placeholder
│   │   │   ├── Skeleton.tsx       # Loading skeleton component
│   │   │   ├── LocalImage.tsx     # Local file image renderer
│   │   │   ├── Tooltip.tsx        # Radix tooltip wrapper
│   │   │   ├── WindowControls.tsx # Draggable titlebar controls
│   │   │   ├── WorkspaceSwitcher.tsx # Workspace selection UI
│   │   │   └── index.ts           # Component exports
│   │   └── settings/              # Settings page components
│   │       ├── AccountSection.tsx      # Account info and logout
│   │       ├── DisplaysSection.tsx     # Display/monitor settings
│   │       ├── GitHubConnectorManager.tsx # GitHub OAuth connector
│   │       ├── SyncIndicators.tsx      # Sync status indicators
│   │       ├── UpdatesSection.tsx      # Auto-update settings
│   │       ├── UsersSection.tsx        # Team member management
│   │       ├── WorkspacesSection.tsx   # Workspace management
│   │       ├── ZohoConnectorManager.tsx # Zoho OAuth connector
│   │       └── index.ts               # Component exports
│   ├── store/
│   │   └── useStore.ts            # Zustand state management
│   ├── types/
│   │   └── index.ts               # TypeScript type definitions
│   ├── styles/
│   │   └── globals.css            # Global styles
│   ├── public/                    # Static assets
│   ├── next.config.js             # Next.js configuration
│   ├── tailwind.config.js         # Tailwind CSS configuration
│   └── tsconfig.json              # TypeScript config
│
├── resources/                     # App resources
│   ├── icon.png                   # App icon (macOS dock/taskbar)
│   ├── icon.icns                  # macOS app icon
│   ├── icon.ico                   # Windows app icon
│   ├── tray-icon.png              # System tray icon (normal, dark theme)
│   ├── tray-icon-white.png        # System tray icon (normal, light theme)
│   ├── tray-icon-record.png       # System tray icon (recording, dark theme)
│   ├── tray-icon-record-white.png # System tray icon (recording, light theme)
│   ├── tray-icon-stop.png         # System tray icon (stop, dark theme)
│   ├── tray-icon-stop-white.png   # System tray icon (stop, light theme)
│   └── entitlements.mac.plist     # macOS app entitlements
│
├── .github/                       # GitHub configuration
│   ├── copilot-instructions.md    # AI coding agent instructions
│   └── workflows/                 # CI/CD workflows
│       ├── ci.yml                 # Lint, format, type-check, build validation
│       └── release.yml            # Build and publish releases (triggered by tags)
├── .husky/                        # Git hooks
│   └── pre-commit                 # Pre-commit hook
├── app/                           # Build output (generated)
├── dist/                          # Distribution packages (generated)
│
├── CHANGELOG.md                   # Version history and release notes
├── package.json                   # Project dependencies & scripts
├── package-lock.json              # Dependency lock file
├── tsconfig.json                  # Root TypeScript config
├── electron-builder.yml           # Electron build configuration
├── eslint.config.mjs              # ESLint v10 flat config
├── .prettierrc.json               # Prettier formatting rules
├── .prettierignore                # Prettier ignore patterns
├── .lintstagedrc.json             # Lint-staged configuration
├── .gitignore                     # Git ignore patterns
├── .env.example                   # Environment template
└── .env                           # Environment variables (create this)
```

---

## 🔧 Available Scripts

### Development

```bash
npm run dev              # Start development server with hot reload
```

### Code Quality & Formatting

```bash
npm run format           # Format all files with Prettier
npm run format:check     # Check if files are formatted
npm run lint             # Run ESLint on all files (.js, .jsx, .ts, .tsx)
npm run lint:fix         # Run ESLint and auto-fix issues
npm run type-check       # Run TypeScript type checking (without emitting files)
```

### Build

```bash
npm run build:pack            # Build production app for all platforms (macOS/Windows/Linux)
npm run build    # Build without packaging (for CI validation)
```

### Git Hooks & Setup

```bash
npm run prepare          # Initialize Husky git hooks (runs automatically after npm install)
npm run postinstall      # Install electron-builder app deps (runs automatically after npm install)
```

---

## 📦 Release Process

SnapFlow uses GitHub Actions for automated builds and releases across macOS, Windows, and Linux platforms.

**Repository**: The workflows are configured for `harsh-simform/snapflow-desktop` repository.

### CI/CD Workflows

The project includes two GitHub Actions workflows in `.github/workflows/`:

#### 1. **CI Workflow** (`.github/workflows/ci.yml`)

- **Triggers**: Pushes and PRs to `main` and `develop` branches
- **Purpose**: Validate code quality and ensure builds work
- **Actions**:
  - Runs linter (`npm run lint`)
  - Runs format checking (`npm run format:check`)
  - Builds application on all platforms (macOS, Windows, Linux)
- **Note**: Builds succeed but does NOT publish artifacts

#### 2. **Release Workflow** (`.github/workflows/release.yml`)

- **Triggers**:
  - Git tags matching `v*.*.*` (e.g., `v1.0.0`)
  - Manual workflow dispatch with version input
- **Purpose**: Build and publish release artifacts
- **Actions**:
  - Creates `.env` file from GitHub secrets (SUPABASE_URL, SUPABASE_ANON_KEY)
  - Builds for macOS, Windows, and Linux in parallel
  - Creates/updates GitHub draft release with artifacts
  - Uploads platform-specific installers
  - Generates release notes from commit history

### Creating a Release

Follow these steps to create a new release:

#### Step 1: Update Version

Update the version in `package.json`:

```json
{
  "version": "1.0.0" // Update to your new version
}
```

Also update the DMG title in `electron-builder.yml` if needed:

```yaml
dmg:
  title: SnapFlow 1.0.0  // Match package.json version
```

#### Step 2: Commit Version Changes

```bash
git add package.json electron-builder.yml
git commit -m "chore: bump version to 1.0.0"
git push origin main
```

#### Step 3: Create and Push Git Tag

```bash
# Create annotated tag
git tag -a v1.0.0 -m "Release v1.0.0"

# Push tag to trigger release workflow
git push origin v1.0.0
```

**Important**: Ensure GitHub secrets are configured for the release workflow:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon/public key
- `GH_TOKEN` - GitHub token (automatically provided by GitHub Actions)

#### Step 4: Monitor Release Build

1. Go to your repository's **Actions** tab
2. Watch the "Build and Release" workflow progress
3. Build typically takes 10-15 minutes (runs on 3 platforms in parallel)

#### Step 5: Publish Release

Once the workflow completes:

1. Go to **Releases** in your GitHub repository
2. Find the draft release created by the workflow
3. Review the release notes (auto-generated from commits)
4. Edit release notes if needed
5. Click **Publish release**

### Release Artifacts

Each release includes installers for all platforms:

#### macOS (Universal - Intel + Apple Silicon)

- **DMG**: `SnapFlow-{version}-universal.dmg` - Standard installer
- **ZIP**: `SnapFlow-{version}-universal-mac.zip` - Portable archive
- **Auto-update files**: `.dmg.blockmap` for delta updates

#### Windows

- **NSIS Installer**: `SnapFlow Setup {version}.exe` - Standard installer
  - Supports both x64 and ia32 architectures
  - Customizable installation directory
  - Desktop and Start Menu shortcuts
- **Portable**: `SnapFlow {version}.exe` - No installation required

#### Linux

- **AppImage**: `SnapFlow-{version}.AppImage` - Universal Linux package
- **DEB**: `snapflow-desktop_{version}_amd64.deb` - Debian/Ubuntu installer
- **RPM**: `snapflow-desktop-{version}.x86_64.rpm` - RHEL/Fedora installer

### Release Checklist

Before creating a release, ensure:

- [ ] All features are complete and tested
- [ ] Version updated in `package.json` and `electron-builder.yml`
- [ ] All CI checks pass on `main` branch
- [ ] Changelog or release notes prepared
- [ ] Code is formatted (`npm run format`)
- [ ] Linting passes (`npm run lint`)
- [ ] Type checking passes (`npm run type-check`)
- [ ] Local build succeeds (`npm run build`)

### Manual Release (Alternative)

If you need to trigger a release without creating a tag:

1. Go to **Actions** tab in GitHub
2. Select "Build and Release" workflow
3. Click **Run workflow**
4. Enter version (e.g., `v1.0.0`)
5. Click **Run workflow** button

### Code Signing (Optional)

#### macOS Code Signing

For distributing outside the App Store, configure these secrets in GitHub:

```yaml
# In .github/workflows/release.yml
APPLE_ID: ${{ secrets.APPLE_ID }}
APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
CSC_LINK: ${{ secrets.MAC_CERTS }}
CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTS_PASSWORD }}
```

**Note**: Currently disabled in CI. Builds succeed without signing but may show "unidentified developer" warning on macOS.

#### Windows Code Signing

Add these secrets for Windows code signing:

```yaml
CSC_LINK: ${{ secrets.WIN_CERT }}
CSC_KEY_PASSWORD: ${{ secrets.WIN_CERT_PASSWORD }}
```

### Troubleshooting Releases

#### Build Fails with "GH_TOKEN not set"

**Solution**: This is expected behavior and has been fixed. The CI workflow now includes `GH_TOKEN` to satisfy electron-builder's CI detection.

#### Release Not Appearing

**Solution**: Check that:

1. Tag format is correct: `v*.*.*` (must start with `v`)
2. Workflow completed successfully (check Actions tab)
3. Draft release was created (check Releases tab)

#### Code Signing Warnings

**Solution**:

- **macOS**: Users may see "unidentified developer" warning. Users need to right-click → Open
- **Windows**: Users may see SmartScreen warning. Click "More info" → "Run anyway"
- **Production**: Configure code signing secrets for trusted distribution

#### Platform-Specific Build Fails

**Solution**:

1. Check the specific platform job logs in GitHub Actions
2. Common issues:
   - **macOS**: Code signing certificate issues
   - **Windows**: NSIS configuration problems
   - **Linux**: Missing dependencies (usually auto-installed)

---

## 🎨 Code Quality

SnapFlow uses a comprehensive code quality setup to maintain consistent code style and catch errors early:

### Pre-commit Hooks

Git hooks automatically run before each commit:

- **Lint-staged**: Runs ESLint and Prettier only on staged files
- **Type checking**: Ensures TypeScript types are valid
- **Formatting**: Auto-formats code with Prettier

### Manual Commands

```bash
# Format code
npm run format              # Format all files
npm run format:check        # Check formatting without modifying

# Linting
npm run lint                # Check for code issues
npm run lint:fix            # Auto-fix linting issues

# Type checking
npm run type-check          # Verify TypeScript types
```

### Configuration Files

- **`.prettierrc.json`** - Prettier formatting rules (print width 80, double quotes, tab width 2)
- **`.prettierignore`** - Files to skip formatting (node_modules, dist, app, .next, etc.)
- **`eslint.config.mjs`** - ESLint v10 flat config with TypeScript support
- **`.lintstagedrc.json`** - Lint-staged configuration (runs ESLint + Prettier on staged files)
- **`.husky/pre-commit`** - Pre-commit hook script (runs lint-staged)

---

## 🐛 Troubleshooting

### Area Capture Showing Wrong Region

**Problem**: Selected area doesn't match what appears in preview (zoomed in)

**Solution**: This should be fixed in the latest version using `nativeImage.crop()`. If still occurring:

```bash
# Update to latest version
git pull
npm install

# Clear cache and restart
rm -rf ~/Library/Application\ Support/SnapFlow
npm run dev
```

**Note**: The latest version uses `nativeImage.crop()` with direct coordinate mapping for pixel-perfect accuracy. This fix is implemented in `main/services/capture.ts`.

### Supabase Connection Issues

**Problem**: "Supabase credentials not configured" error

**Solution**:

```bash
# Check .env file exists
cat .env

# Should show:
# SUPABASE_URL=https://...
# SUPABASE_ANON_KEY=...

# Copy from example if missing
cp .env.example .env
# Then add your credentials
```

### Storage Bucket RLS Policy Error

**Problem**: `StorageApiError: new row violates row-level security policy` or "Storage bucket is not available"

**Root Cause**: The storage bucket doesn't exist or RLS policies are not configured properly.

**Solution**:

1. **Create the bucket manually** (bucket creation requires admin privileges):
   - Go to Supabase Dashboard → **Storage**
   - Click **New bucket**
   - Name: `snapflow-public-bucket`
   - Public: **Yes** (checked)
   - File size limit: **52428800** (50MB)
   - Click **Create bucket**

2. **Verify RLS policies are applied**:
   - Go to Supabase Dashboard → **SQL Editor**
   - Run the storage policies section from `main/migrations/supabase-mvp-migration.sql`
   - This ensures users can upload/read their own files

3. **Restart the application** and try syncing again

**Note**: Storage bucket creation cannot be done programmatically with RLS enabled. It must be created manually through the Supabase Dashboard.

**Reference**: See `main/services/sync.ts` for the storage upload implementation.

### Authentication Errors

**Problem**: "Invalid email or password" or signup issues

**Solution**:

1. Verify email confirmation is disabled for development:
   - Supabase Dashboard → Authentication → Providers → Email
   - Toggle "Enable Email Confirmations" to OFF
2. Check user exists in Supabase Dashboard → Authentication → Users
3. Try signing up with a new email address

### Session Not Persisting

**Problem**: App logs out after restart

**Solution**:

```bash
# Clear Electron cache
rm -rf ~/Library/Application\ Support/SnapFlow  # macOS
rm -rf ~/.config/SnapFlow                       # Linux

# Restart app
npm run dev
```

### Screenshot Capture Fails (macOS)

**Problem**: "Failed to get sources" error on macOS

**Solution**:

1. Open **System Preferences** → **Security & Privacy** → **Privacy**
2. Select **Screen Recording** from the left sidebar
3. Check the box next to **SnapFlow** (or Electron)
4. Restart the application

**Note**: macOS 10.15+ requires explicit Screen Recording permission.

### App Won't Start

**Problem**: Electron app crashes on startup

**Solution**:

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Electron cache
rm -rf ~/Library/Application\ Support/SnapFlow  # macOS
rm -rf ~/.config/SnapFlow                       # Linux

# Check Node.js version
node --version  # Should be 18+

# Run in development mode with logs
npm run dev
```

### Clipboard Not Working

**Problem**: Screenshots not automatically copying to clipboard

**Solution**:

1. Ensure you're running the latest version with clipboard support
2. Check console logs for "Image copied to clipboard" message
3. Try manually: After capture, the image should be available to paste (Cmd+V / Ctrl+V)
4. On macOS, check System Preferences → Security & Privacy for clipboard permissions

### Hot Reload Not Working

**Problem**: Changes don't reflect in development mode

**Solution**:

```bash
# Kill all Electron processes
pkill -9 Electron

# Restart dev server
npm run dev
```

---

## 👥 Development Team Guidelines

This is a private project. For team members working on the codebase:

### Development Workflow

1. Clone the repository: `git clone <repository-url>`
2. Install dependencies: `npm install`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Make your changes and ensure code quality:
   ```bash
   npm run format      # Format code
   npm run lint:fix    # Fix linting issues
   npm run type-check  # Verify types
   ```
5. Commit your changes (pre-commit hooks will run automatically)
6. Push to your branch: `git push origin feature/your-feature-name`
7. Create a Pull Request for review

### Code Quality Standards

The project enforces code quality through automated tools:

- Pre-commit hooks ensure all code is formatted and linted
- TypeScript type checking prevents type errors

### Documentation for Developers

- **README.md** (this file) - Complete setup, features, and troubleshooting guide
- **CHANGELOG.md** - Version history with detailed release notes
- **main/migrations/** - SQL migration files for database schema and RLS policies
- **.env.example** - Environment variables template
- **package.json** - Dependencies, scripts, and project metadata

---

## 📄 License

This is a private project. All rights reserved.

---

## 🙏 Acknowledgments

- [Nextron](https://github.com/saltyshiomix/nextron) - Amazing Next.js + Electron boilerplate
- [Supabase](https://supabase.com/) - Open source Firebase alternative
- [Radix UI](https://www.radix-ui.com/) - Accessible component primitives
- [Konva.js](https://konvajs.org/) - Powerful HTML5 Canvas library
- [Sharp](https://sharp.pixelplumbing.com/) - High performance image processing
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

---

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Contact the development team for assistance

---

<p align="center">
  Made with ❤️ by the SnapFlow Team
</p>
