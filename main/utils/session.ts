/**
 * Session Manager — Main Process
 *
 * Responsibilities:
 *  1. On startup: ask Supabase for the existing session (reads from
 *     electron-store via the custom adapter — no network unless token expired).
 *  2. Validate the session user against the server; fall back to the locally
 *     cached AuthUser if the network is unavailable.
 *  3. Expose the current AuthUser synchronously to the rest of the main process.
 *  4. Listen to Supabase auth-state events to keep in-memory state current.
 *  5. On login/logout: update in-memory state + notify storage manager.
 *
 * What we deliberately DO NOT do here:
 *  • Mirror session tokens manually — the Supabase SDK + electron-store adapter
 *    in supabase.ts already own that persistence.
 *  • Refresh tokens manually — autoRefreshToken handles it automatically.
 */

import Store from "electron-store";
import log from "electron-log";
import { authService, type AuthUser } from "../services/auth";
import { getSupabase } from "./supabase";
import { storageManager } from "./storage";
import { syncService } from "../services/sync";

// ─── Persistent store (user profile cache only) ───────────────────────────────

interface SessionCache {
  userId: string | null;
  user: AuthUser | null;
  expiresAt: number | null; // UNIX timestamp in milliseconds
}

const sessionStore = new Store<SessionCache>({
  name: "snapflow-session",
  defaults: { userId: null, user: null, expiresAt: null },
});

// ─── SessionManager ───────────────────────────────────────────────────────────

class SessionManager {
  private currentUser: AuthUser | null = null;
  private listenerAttached = false;
  private isClearing = false;
  private initializationComplete = false;

  // ── Startup ────────────────────────────────────────────────────────────────

  /**
   * Restore session on app startup.
   *
   * Flow:
   *   getSession()  — reads tokens from electron-store (no network)
   *     └─ session found  → getUser() to validate with server
   *         ├─ success    → restore in-memory state, trigger background sync
   *         └─ offline    → fall back to cached user (best-effort)
   *     └─ no session    → clear stale cache, proceed to auth screen
   */
  async initialize(): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Session] Supabase not available — skipping session restore");
      return;
    }

    // getSession() is synchronous against the electron-store adapter.
    // It only hits the network if the access token is expired (to refresh it).
    let session: Awaited<
      ReturnType<typeof supabase.auth.getSession>
    >["data"]["session"];
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        if (error.status === 0) {
          // Network unreachable during startup — restore from cache offline
          log.warn("[Session] Network unreachable at startup, going offline");
          await this.restoreFromCache();
          this.attachAuthListener();
          return;
        }
        log.error("[Session] getSession error:", error.message);
        await this.clearUser();
        this.attachAuthListener();
        return;
      }
      session = data.session;
    } catch (err) {
      // Safety net — custom fetch converts network errors to AbortError, but
      // if something slips through we still don't want to crash startup.
      log.warn("[Session] getSession threw, going offline:", err);
      await this.restoreFromCache();
      this.attachAuthListener();
      return;
    }

    if (!session) {
      this.clearCache();
      this.attachAuthListener();
      return;
    }

    // Check if stored token has expired
    if (this.isTokenExpired()) {
      log.warn("[Session] Stored session token has expired");
      await this.clearUser();
      this.attachAuthListener();
      return;
    }

    // Session found — validate the user against the server.
    try {
      // Extract and cache token expiry time
      if (session.expires_at) {
        const expiresAt = session.expires_at * 1000; // Convert to milliseconds
        (sessionStore as any).set("expiresAt", expiresAt);
      }
      let user = await authService.getCurrentUser();

      if (!user) {
        // Server unreachable — try cached user
        user = this.getCachedUser();
        if (user) {
          log.warn(
            "[Session] Server unreachable — restoring from local cache:",
            user.email
          );
        }
      }

      if (user) {
        await this.applyUser(user);
        // Background cloud sync — non-blocking, best-effort. Pulls cloud snaps
        // for the user's primary workspace so that a fresh device sees synced
        // state on launch. The home page also fires syncFromCloud on workspace
        // activation, so this is belt-and-suspenders for the initial paint.
        this.syncFromCloudOnLogin(user.id).catch((err) =>
          log.warn("[Session] Background sync failed:", err)
        );
      } else {
        log.warn("[Session] Could not resolve user — clearing session");
        await this.clearUser();
      }
    } catch (err) {
      log.error("[Session] Error restoring session:", err);
      await this.clearUser();
    }

    this.attachAuthListener();
    this.initializationComplete = true;
  }

  // ── Auth state listener ────────────────────────────────────────────────────

  private attachAuthListener(): void {
    if (this.listenerAttached) return;

    const supabase = getSupabase();
    if (!supabase) {
      log.warn(
        "[Session] Cannot attach auth listener — Supabase not initialised"
      );
      return;
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      switch (event) {
        case "TOKEN_REFRESHED":
          // Tokens are already written back to electron-store by the SDK adapter.
          // Update the expiry time in our cache.
          if (session?.expires_at) {
            const expiresAt = session.expires_at * 1000; // Convert to milliseconds
            (sessionStore as any).set("expiresAt", expiresAt);
          }
          break;

        case "SIGNED_IN":
          if (session?.user) {
            const user = {
              id: session.user.id,
              name:
                session.user.user_metadata?.name ??
                session.user.email?.split("@")[0] ??
                "User",
              email: session.user.email!,
              createdAt: new Date(session.user.created_at),
              updatedAt: new Date(
                session.user.updated_at ?? session.user.created_at
              ),
            };

            if (user.id !== this.currentUser?.id) {
              log.info("[Session] SIGNED_IN:", user.email);
              await this.applyUser(user);
              if (session.expires_at) {
                const expiresAt = session.expires_at * 1000;
                (sessionStore as any).set("expiresAt", expiresAt);
              }
            }
          } else if (session) {
            log.warn("[Session] SIGNED_IN: No user in session");
          }
          break;

        case "SIGNED_OUT":
          log.info("[Session] SIGNED_OUT");
          await this.clearUser();
          break;
      }
    });

    this.listenerAttached = true;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Call after a successful login (email/password or OAuth).
   * Persists the user to cache and sets up storage paths.
   */
  async setUser(user: AuthUser): Promise<void> {
    await this.applyUser(user);
    this.attachAuthListener();

    // Pull cloud snaps for the user's primary workspace after explicit login.
    // Best-effort; never blocks the login flow.
    this.syncFromCloudOnLogin(user.id).catch((err) =>
      log.warn("[Session] Cloud sync after setUser failed:", err)
    );
  }

  getUser(): AuthUser | null {
    return this.currentUser;
  }

  getUserId(): string | null {
    return this.currentUser?.id ?? null;
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  isInitialized(): boolean {
    return this.initializationComplete;
  }

  /**
   * Synchronous pre-flight check — reads from cache without any network call.
   * Used by background.ts to decide the initial route before initialize() runs.
   */
  hasStoredSession(): boolean {
    return (sessionStore as any).get("userId") !== null;
  }

  /**
   * Sign the user out: clears in-memory + cached state and calls Supabase signOut.
   * Guarded against re-entrant calls from the SIGNED_OUT auth event.
   */
  async clearUser(): Promise<void> {
    if (this.isClearing) return;
    this.isClearing = true;

    try {
      this.currentUser = null;
      storageManager.clearCurrentUser();
      this.clearCache();

      try {
        await authService.logout();
      } catch (err) {
        log.error("[Session] Error during Supabase signOut:", err);
      }
    } finally {
      this.isClearing = false;
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Check if the stored token has expired (or is about to expire within 5 minutes).
   * Returns true if expired or expiry time is unknown.
   */
  private isTokenExpired(): boolean {
    const expiresAt =
      ((sessionStore as any).get("expiresAt") as number | undefined) ?? null;
    if (!expiresAt) return false; // No expiry info, assume valid

    const now = Date.now();
    const bufferMs = 5 * 60 * 1000; // 5-minute buffer
    return now + bufferMs >= expiresAt;
  }

  /**
   * Apply a resolved user: set in-memory state, update storage manager,
   * and write the user profile to the cache store.
   */
  private async applyUser(user: AuthUser): Promise<void> {
    this.currentUser = user;
    storageManager.setCurrentUser(user.id);
    await storageManager.ensureDirectories();
    this.writeCache(user);
  }

  /** Attempt to restore in-memory state from the local cache only. */
  private async restoreFromCache(): Promise<void> {
    const user = this.getCachedUser();
    if (user) {
      log.info("[Session] Restored from cache (offline):", user.email);
      this.currentUser = user;
      storageManager.setCurrentUser(user.id);
      await storageManager.ensureDirectories();
    }
  }

  private getCachedUser(): AuthUser | null {
    return ((sessionStore as any).get("user") as AuthUser | undefined) ?? null;
  }

  private writeCache(user: AuthUser): void {
    (sessionStore as any).set("user", user);
    (sessionStore as any).set("userId", user.id);
  }

  private clearCache(): void {
    (sessionStore as any).set("user", null);
    (sessionStore as any).set("userId", null);
    (sessionStore as any).set("expiresAt", null);
  }

  /**
   * Returns the session expiry time (UNIX timestamp in ms), or null if unavailable.
   * Used by the renderer to show expiry warnings.
   */
  getSessionExpiryTime(): number | null {
    return (
      ((sessionStore as any).get("expiresAt") as number | undefined) ?? null
    );
  }

  /**
   * Returns true if session is expiring within the next N minutes (default 30).
   */
  isSessionExpiringsoon(minutesBuffer: number = 30): boolean {
    const expiresAt = this.getSessionExpiryTime();
    if (!expiresAt) return false;

    const now = Date.now();
    const bufferMs = minutesBuffer * 60 * 1000;
    return now + bufferMs >= expiresAt;
  }

  /** Download cloud captures for the user after login — best-effort. */
  private async syncFromCloudOnLogin(userId: string): Promise<void> {
    try {
      const result = await syncService.fetchFromCloud(userId);
      if (!result.success) {
        log.warn(`[Session] Cloud sync errors: ${result.errors.join(", ")}`);
      }
    } catch (err) {
      log.error("[Session] Cloud sync failed:", err);
      // Don't rethrow — sync failure must never block login
    }
  }
}

export const sessionManager = new SessionManager();
