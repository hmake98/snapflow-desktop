# SnapFlow — Supabase Email Templates

Four HTML email templates for the Supabase project. Each one is branded for SnapFlow (dark theme, blue accent) and deep-links back into the desktop app via the `snapflow://` custom protocol.

---

## Templates

| File                  | Supabase template slot | Trigger                                                   |
| --------------------- | ---------------------- | --------------------------------------------------------- |
| `confirm-signup.html` | **Confirm signup**     | User creates a new account                                |
| `invite-user.html`    | **Invite user**        | Admin invites a team member to a workspace                |
| `magic-link.html`     | **Magic Link**         | OTP / passwordless sign-in (also used as invite fallback) |
| `reset-password.html` | **Reset Password**     | User requests a password reset                            |

---

## How to apply

### 1. Open the Supabase Dashboard

Go to your project → **Authentication** → **Email Templates** (left sidebar).

### 2. For each template

1. Select the template slot from the table above.
2. Open the corresponding `.html` file and copy the entire contents.
3. Paste it into the **Message body (HTML)** field.
4. Set the **Subject line** (see subjects below).
5. Click **Save**.

### Suggested subject lines

| Template       | Subject                                            |
| -------------- | -------------------------------------------------- |
| Confirm signup | `Confirm your SnapFlow account`                    |
| Invite user    | `You've been invited to join a SnapFlow workspace` |
| Magic Link     | `Your SnapFlow sign-in link`                       |
| Reset Password | `Reset your SnapFlow password`                     |

---

## Redirect URL configuration (critical for desktop app)

The templates use `{{ .ConfirmationURL }}` which Supabase builds using your **Site URL** and **Redirect URLs** settings. You must configure these so the link opens the Electron app instead of a web browser.

### Step 1 — Set Site URL

**Authentication** → **URL Configuration** → **Site URL**

```
snapflow://auth/callback
```

### Step 2 — Add allowed Redirect URLs

**Authentication** → **URL Configuration** → **Redirect URLs** → **Add URL**

Add all of the following:

```
snapflow://auth/callback
snapflow://auth/callback/**
http://localhost:3000/auth/callback
http://localhost:3000/**
```

> The `localhost:3000` entries are needed for GitHub and Zoho OAuth connectors which use an HTTP callback server running locally.

### Step 3 — Verify the deep link scheme is registered

The `snapflow://` protocol is registered in `electron-builder.yml`:

```yaml
protocols:
  - name: SnapFlow
    schemes:
      - snapflow
```

And handled in `main/background.ts` via `app.on('open-url')` (macOS) and `app.on('second-instance')` (Windows/Linux). No changes needed there.

---

## How the redirect flow works

```
User clicks link in email
        ↓
Supabase verifies token
        ↓
Redirects to snapflow://auth/callback?access_token=...&refresh_token=...&type=...
        ↓
OS hands the deep link to the SnapFlow desktop app
        ↓
main/background.ts handleOAuthCallback() exchanges the code / sets the session
        ↓
Renderer is navigated to /home (or /onboarding for new accounts)
```

---

## Template variables used

Supabase injects these automatically — do not change them:

| Variable                 | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `{{ .ConfirmationURL }}` | Full verification / magic-link URL with token   |
| `{{ .Email }}`           | Recipient email address                         |
| `{{ .Token }}`           | Raw token (available if you need it separately) |
| `{{ .SiteURL }}`         | Your configured Site URL                        |

---

## Email provider note

By default, Supabase uses its own SMTP relay which has a rate limit of **2 emails per hour** in development. For production, configure a custom SMTP provider (Resend, Postmark, SendGrid, etc.) under **Authentication** → **SMTP Settings**.
