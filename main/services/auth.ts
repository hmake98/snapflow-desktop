import { getSupabase } from "../utils/supabase";
import { User as SupabaseUser } from "@supabase/supabase-js";
import log from "electron-log";

interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AuthService {
  /**
   * Create a new user account using Supabase Auth
   */
  async createUser(
    name: string,
    email: string,
    password: string
  ): Promise<User> {
    log.info("[Auth Service] === CREATE USER START ===");
    log.info("[Auth Service] Name:", name);
    log.info("[Auth Service] Email:", email);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Auth Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    log.info("[Auth Service] Calling supabase.auth.signUp...");
    // Sign up user with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name, // Store name in user metadata
        },
      },
    });

    if (error) {
      log.error("[Auth Service] ✗ SignUp error:", error.message);
      if (error.message.includes("already registered")) {
        throw new Error("User with this email already exists");
      }
      throw new Error(error.message);
    }

    if (!data.user) {
      log.error("[Auth Service] ✗ No user data returned");
      throw new Error("Failed to create user");
    }

    const user = this.mapSupabaseUser(data.user);
    log.info("[Auth Service] ✓ User created successfully");
    log.info("[Auth Service] User ID:", user.id);
    log.info("[Auth Service] === CREATE USER END ===");
    return user;
  }

  /**
   * Login with email and password using Supabase Auth
   */
  async login(email: string, password: string): Promise<User> {
    log.info("[Auth Service] === LOGIN START ===");
    log.info("[Auth Service] Email:", email);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Auth Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    log.info("[Auth Service] Calling supabase.auth.signInWithPassword...");
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      log.error("[Auth Service] ✗ Login error:", error.message);
      throw new Error("Invalid email or password");
    }

    if (!data.user) {
      log.error("[Auth Service] ✗ No user data returned");
      throw new Error("Failed to sign in");
    }

    const user = this.mapSupabaseUser(data.user);
    log.info("[Auth Service] ✓ Login successful");
    log.info("[Auth Service] User ID:", user.id);
    log.info("[Auth Service] === LOGIN END ===");
    return user;
  }

  /**
   * Get user by ID using Supabase Auth
   */
  async getUserById(userId: string): Promise<User | null> {
    const supabase = getSupabase();
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase.auth.admin.getUserById(userId);

    if (error || !data.user) {
      return null;
    }

    return this.mapSupabaseUser(data.user);
  }

  /**
   * Get user by email
   * Note: This requires RLS policies or admin access in Supabase
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const supabase = getSupabase();
    if (!supabase) {
      return null;
    }

    // Get current session user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.email === email) {
      return this.mapSupabaseUser(user);
    }

    return null;
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<User | null> {
    log.info("[Auth Service] Getting current user...");

    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Auth Service] Supabase not configured");
      return null;
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      log.error("[Auth Service] Error getting user:", error.message);
      return null;
    }

    if (!user) {
      log.info("[Auth Service] No current user");
      return null;
    }

    const mappedUser = this.mapSupabaseUser(user);
    log.info("[Auth Service] ✓ Current user:", mappedUser.email);
    return mappedUser;
  }

  /**
   * Check if any user exists (for initial setup)
   * Since Supabase handles users globally, we check if there's a current session
   */
  async hasAnyUser(): Promise<boolean> {
    const supabase = getSupabase();
    if (!supabase) {
      return false;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session !== null;
  }

  /**
   * Update user profile
   */
  async updateUser(
    userId: string,
    updates: Partial<Pick<User, "name" | "email">>
  ): Promise<User> {
    log.info("[Auth Service] === UPDATE USER START ===");
    log.info("[Auth Service] User ID:", userId);
    log.info("[Auth Service] Updates:", JSON.stringify(updates));

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Auth Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    const updateData: Record<string, unknown> = {};

    if (updates.email) {
      updateData.email = updates.email;
    }

    if (updates.name) {
      updateData.data = { name: updates.name };
    }

    log.info("[Auth Service] Calling supabase.auth.updateUser...");
    const { data, error } = await supabase.auth.updateUser(updateData);

    if (error) {
      log.error("[Auth Service] ✗ Update error:", error.message);
      if (error.message.includes("already in use")) {
        throw new Error("Email is already in use");
      }
      throw new Error(error.message);
    }

    if (!data.user) {
      log.error("[Auth Service] ✗ No user data returned");
      throw new Error("Failed to update user");
    }

    const user = this.mapSupabaseUser(data.user);
    log.info("[Auth Service] ✓ User updated successfully");
    log.info("[Auth Service] === UPDATE USER END ===");
    return user;
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    // First, verify current password by attempting to sign in
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("User not found");
    }

    // Re-authenticate with current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword,
    });

    if (signInError) {
      throw new Error("Invalid current password");
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  /**
   * Delete user account
   */
  async deleteUser(_userId: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    // Supabase doesn't have a direct client method to delete user
    // This typically requires admin access or a backend function
    // For now, we'll sign out the user
    await supabase.auth.signOut();

    // Note: To fully delete a user, you would need to:
    // 1. Create a Supabase Edge Function
    // 2. Call supabase.auth.admin.deleteUser(userId) from that function
    log.warn(
      "User deletion requires Supabase Edge Function. User signed out instead."
    );
  }

  /**
   * Logout - signs out user from Supabase
   */
  async logout(): Promise<void> {
    log.info("[Auth Service] === LOGOUT START ===");

    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Auth Service] Supabase not configured");
      return;
    }

    log.info("[Auth Service] Calling supabase.auth.signOut...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      log.error("[Auth Service] ✗ Logout error:", error.message);
    } else {
      log.info("[Auth Service] ✓ Logout successful");
    }
    log.info("[Auth Service] === LOGOUT END ===");
  }

  /**
   * Get current session
   */
  async getSession() {
    const supabase = getSupabase();
    if (!supabase) {
      return null;
    }

    const {
      data: { session },
      error: _error,
    } = await supabase.auth.getSession();
    return session;
  }

  /**
   * Set session (for restoring from storage)
   */
  async setSession(accessToken: string, refreshToken: string) {
    const supabase = getSupabase();
    if (!supabase) {
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw new Error(error.message);
    }

    return data.session;
  }

  /**
   * Helper: Map Supabase User to our User interface
   */
  private mapSupabaseUser(supabaseUser: SupabaseUser): User {
    return {
      id: supabaseUser.id,
      name:
        supabaseUser.user_metadata?.name ||
        supabaseUser.email?.split("@")[0] ||
        "User",
      email: supabaseUser.email!,
      createdAt: new Date(supabaseUser.created_at),
      updatedAt: new Date(supabaseUser.updated_at || supabaseUser.created_at),
    };
  }
}

export const authService = new AuthService();
