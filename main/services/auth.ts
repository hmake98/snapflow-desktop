/**
 * Auth Service — Main Process
 *
 * Thin wrapper around Supabase Auth for the main process.
 * All network calls go through the custom fetch in supabase.ts which
 * normalises connectivity errors to AbortError, so we never need to
 * catch raw undici errors here — Supabase wraps them first.
 *
 * Public surface used by session.ts and background.ts:
 *   createUser / login / logout / getCurrentUser / updateUser /
 *   changePassword / deleteUser / googleSignIn / exchangeCodeForSession /
 *   getSession / setSession / hasAnyUser / getUserById
 */

import { User as SupabaseUser } from "@supabase/supabase-js";
import log from "electron-log";
import { getSupabase } from "../utils/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map a Supabase SDK user object to our lightweight AuthUser shape. */
function mapUser(u: SupabaseUser): AuthUser {
  return {
    id: u.id,
    name: u.user_metadata?.name ?? u.email?.split("@")[0] ?? "User",
    email: u.email!,
    createdAt: new Date(u.created_at),
    updatedAt: new Date(u.updated_at ?? u.created_at),
  };
}

/**
 * Returns a configured Supabase client or throws a consistent error.
 * Avoids repeating the same null-check boilerplate in every method.
 */
function requireSupabase() {
  const client = getSupabase();
  if (!client) {
    throw new Error(
      "Supabase is not configured. Please check your environment variables."
    );
  }
  return client;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class AuthService {
  // ── Account creation ────────────────────────────────────────────────────────

  async createUser(
    name: string,
    email: string,
    password: string
  ): Promise<AuthUser> {
    log.info("[Auth] createUser →", email);
    const supabase = requireSupabase();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });

    if (error) {
      log.error("[Auth] signUp error:", error.message);
      if (error.message.toLowerCase().includes("already registered")) {
        throw new Error("An account with this email already exists.");
      }
      throw new Error(error.message);
    }

    if (!data.user) throw new Error("Sign-up succeeded but no user returned.");

    const user = mapUser(data.user);
    log.info("[Auth] ✓ createUser", user.id);
    return user;
  }

  // ── Sign-in ──────────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<AuthUser> {
    log.info("[Auth] login →", email);
    const supabase = requireSupabase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      log.error("[Auth] signIn error:", error.message);
      const msg = error.message.toLowerCase();
      if (
        msg.includes("invalid_credentials") ||
        msg.includes("invalid login")
      ) {
        throw new Error("Invalid email or password.");
      }
      throw new Error(error.message);
    }

    if (!data.user) throw new Error("Sign-in succeeded but no user returned.");

    const user = mapUser(data.user);
    log.info("[Auth] ✓ login", user.id);
    return user;
  }

  // ── Lookup ───────────────────────────────────────────────────────────────────

  /**
   * Look up a user by ID.
   *
   * Strategy (anon-key safe):
   *  1. If the requested ID matches the currently-authenticated user, return
   *     their live session data — zero extra queries.
   *  2. Otherwise query the `user_profiles` table which is readable by any
   *     authenticated user (populated by a DB trigger on auth.users).
   *     This avoids using auth.admin.getUserById which requires the service-role key.
   */
  async getUserById(userId: string): Promise<AuthUser | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    // Fast path: current user
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user;
      if (sessionUser && sessionUser.id === userId) {
        return mapUser(sessionUser);
      }
    } catch {
      // ignore, fall through
    }

    // Slow path: query public user_profiles table
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, name, email")
        .eq("id", userId)
        .single();

      if (error || !data) return null;

      return {
        id: data.id as string,
        name:
          (data.name as string) ||
          (data.email as string).split("@")[0] ||
          "User",
        email: data.email as string,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Returns the locally-cached user matching the given email by comparing
   * against the current Supabase session user.  No separate DB query needed.
   */
  async getUserByEmail(email: string): Promise<AuthUser | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.email === email) return mapUser(user);
    return null;
  }

  // ── Current session / user ───────────────────────────────────────────────────

  /**
   * Returns the locally-cached session from the electron-store adapter.
   * Does NOT make a network request.
   */
  async getSession() {
    const supabase = getSupabase();
    if (!supabase) return null;

    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  }

  /**
   * Validates the current JWT with the Supabase server (network call).
   * Returns null instead of throwing when the network is unavailable —
   * the caller (session.ts) decides whether to fall back to the cached user.
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    const supabase = getSupabase();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        // status === 0 means network unreachable (AbortError path from our custom fetch)
        if (error.status === 0) {
          log.warn("[Auth] getUser: server unreachable, returning null");
          return null;
        }
        log.error("[Auth] getUser error:", error.message);
        return null;
      }

      return data.user ? mapUser(data.user) : null;
    } catch {
      // Safety net — should not normally reach here because our custom fetch
      // converts all network errors to AbortError before Supabase sees them.
      log.warn("[Auth] getUser threw unexpectedly, returning null");
      return null;
    }
  }

  /**
   * Explicitly restores a session from stored tokens.
   * The SDK will attempt a network refresh if the access token is expired.
   * Returns both the session and the user object for efficient OAuth flows.
   */
  async setSession(accessToken: string, refreshToken: string) {
    const supabase = requireSupabase();

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw new Error(error.message);

    // Extract user from session to avoid subsequent network calls
    const user = data.session?.user ? mapUser(data.session.user) : null;
    return { session: data.session, user };
  }

  /** Returns true when there is an active Supabase session (no network call). */
  async hasAnyUser(): Promise<boolean> {
    const session = await this.getSession();
    return session !== null;
  }

  // ── Account management ───────────────────────────────────────────────────────

  async updateUser(
    _userId: string,
    updates: Partial<Pick<AuthUser, "name" | "email">>
  ): Promise<AuthUser> {
    log.info("[Auth] updateUser", updates);
    const supabase = requireSupabase();

    const payload: Record<string, unknown> = {};
    if (updates.email) payload.email = updates.email;
    if (updates.name) payload.data = { name: updates.name };

    const { data, error } = await supabase.auth.updateUser(payload);

    if (error) {
      log.error("[Auth] updateUser error:", error.message);
      if (error.message.toLowerCase().includes("already in use")) {
        throw new Error("That email address is already in use.");
      }
      throw new Error(error.message);
    }

    if (!data.user) throw new Error("Update succeeded but no user returned.");

    const user = mapUser(data.user);
    log.info("[Auth] ✓ updateUser", user.id);
    return user;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const supabase = requireSupabase();

    // Verify current password by re-authenticating first.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) throw new Error("No authenticated user found.");

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) throw new Error("Current password is incorrect.");

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);

    log.info("[Auth] ✓ changePassword");
  }

  /**
   * Signs the user out.  Full account deletion requires a server-side Edge
   * Function (supabase.auth.admin.deleteUser) — out of scope for the client.
   */
  async deleteUser(_userId: string): Promise<void> {
    log.warn(
      "[Auth] deleteUser: client can only sign out. " +
        "Full deletion requires a Supabase Edge Function."
    );
    await this.logout();
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────────

  /**
   * Returns the OAuth redirect URL to be opened in the system browser.
   * After the user completes the flow, the app handles the deep-link callback
   * via exchangeCodeForSession.
   */
  async googleSignIn(): Promise<string> {
    log.info("[Auth] googleSignIn");
    const supabase = requireSupabase();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "snapflow://auth/callback",
        skipBrowserRedirect: true,
      },
    });

    if (error) throw new Error(error.message);
    if (!data?.url) throw new Error("Failed to generate Google OAuth URL.");

    log.info("[Auth] ✓ googleSignIn URL generated");
    return data.url;
  }

  /** Exchange the PKCE code from the deep-link callback for a live session. */
  async exchangeCodeForSession(callbackUrl: string) {
    log.info("[Auth] exchangeCodeForSession");
    const supabase = requireSupabase();

    const { data, error } =
      await supabase.auth.exchangeCodeForSession(callbackUrl);
    if (error) throw new Error(error.message);

    log.info("[Auth] ✓ exchangeCodeForSession");
    return data.session;
  }

  // ── Sign-out ─────────────────────────────────────────────────────────────────

  async logout(): Promise<void> {
    log.info("[Auth] logout");
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      log.error("[Auth] signOut error:", error.message);
    } else {
      log.info("[Auth] ✓ logout");
    }
  }
}

export const authService = new AuthService();
