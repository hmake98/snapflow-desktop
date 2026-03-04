import { getSupabase, getSupabaseAdmin } from "../utils/supabase";
import log from "electron-log";
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceMemberWithUser,
  UserRole,
} from "../../renderer/types";
import { authService } from "./auth";

/**
 * Helper: Slugify a string
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class WorkspaceService {
  /**
   * Create a new workspace within a tenant
   * Automatically adds the creator as an 'admin' member
   */
  async createWorkspace(
    userId: string,
    tenantId: string,
    name: string,
    description?: string
  ): Promise<Workspace> {
    log.info("[Workspace Service] === CREATE WORKSPACE START ===");
    log.info("[Workspace Service] User ID:", userId);
    log.info("[Workspace Service] Tenant ID:", tenantId);
    log.info("[Workspace Service] Workspace name:", name);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Workspace Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    let slug = slugify(name);
    let originalSlug = slug;
    let attempt = 2;

    // Handle UNIQUE(tenant_id, slug) constraint by appending -2, -3, etc.
    while (true) {
      const { data: existing } = await supabase
        .from("workspaces")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("slug", slug)
        .single();

      if (!existing) {
        break; // slug is unique within tenant, use it
      }

      slug = `${originalSlug}-${attempt}`;
      attempt++;
    }

    log.info("[Workspace Service] Using slug:", slug);

    // Insert workspace
    const { data: workspaceData, error: workspaceError } = await supabase
      .from("workspaces")
      .insert({
        tenant_id: tenantId,
        name,
        slug,
        description: description || null,
        created_by: userId,
      })
      .select()
      .single();

    if (workspaceError) {
      log.error(
        "[Workspace Service] ✗ Create workspace error:",
        workspaceError.message
      );

      // Provide user-friendly error messages for common constraint violations
      if (
        workspaceError.message.includes("workspaces_tenant_id_slug_key") ||
        workspaceError.message.includes("unique constraint")
      ) {
        throw new Error(
          `A workspace with the name "${name}" already exists in this organization. Please choose a different name.`
        );
      }

      throw new Error(workspaceError.message);
    }

    if (!workspaceData) {
      log.error("[Workspace Service] ✗ No workspace data returned");
      throw new Error("Failed to create workspace");
    }

    const workspace = this.mapSupabaseWorkspace(workspaceData);

    // Auto-add creator as admin member
    log.info("[Workspace Service] Adding creator as admin member");
    const { error: memberError } = await supabase
      .from("workspace_members")
      .insert({
        workspace_id: workspace.id,
        user_id: userId,
        role: "admin",
      });

    if (memberError) {
      log.error(
        "[Workspace Service] ✗ Error adding creator as member:",
        memberError.message
      );
      // Don't throw — workspace was created, member add just failed (maybe duplicate)
      // Let the workspace be created anyway
    } else {
      log.info("[Workspace Service] ✓ Creator added as admin member");
    }

    log.info("[Workspace Service] ✓ Workspace created successfully");
    log.info("[Workspace Service] Workspace ID:", workspace.id);
    log.info("[Workspace Service] === CREATE WORKSPACE END ===");
    return workspace;
  }

  /**
   * List all workspaces in a tenant
   */
  async listWorkspaces(tenantId: string): Promise<Workspace[]> {
    log.info("[Workspace Service] Listing workspaces for tenant:", tenantId);

    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Workspace Service] Supabase not configured");
      return [];
    }

    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("[Workspace Service] Error listing workspaces:", error.message);
      return [];
    }

    return (data || []).map((ws) => this.mapSupabaseWorkspace(ws));
  }

  /**
   * Get workspace by ID
   */
  async getWorkspaceById(id: string): Promise<Workspace | null> {
    log.info("[Workspace Service] Getting workspace by ID:", id);

    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Workspace Service] Supabase not configured");
      return null;
    }

    const { data, error } = await supabase
      .from("workspaces")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        log.info("[Workspace Service] Workspace not found");
        return null;
      }
      log.error("[Workspace Service] Error fetching workspace:", error.message);
      return null;
    }

    return this.mapSupabaseWorkspace(data);
  }

  /**
   * Add a member to a workspace
   */
  async addMember(
    workspaceId: string,
    userId: string,
    role: UserRole
  ): Promise<WorkspaceMember> {
    log.info("[Workspace Service] Adding member to workspace");
    log.info("[Workspace Service] Workspace ID:", workspaceId);
    log.info("[Workspace Service] User ID:", userId);
    log.info("[Workspace Service] Role:", role);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Workspace Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    const { data, error } = await supabase
      .from("workspace_members")
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        role,
      })
      .select()
      .single();

    if (error) {
      log.error("[Workspace Service] ✗ Error adding member:", error.message);
      throw new Error(error.message);
    }

    if (!data) {
      log.error("[Workspace Service] ✗ No member data returned");
      throw new Error("Failed to add member");
    }

    const member = this.mapSupabaseWorkspaceMember(data);
    log.info("[Workspace Service] ✓ Member added successfully");
    return member;
  }

  /**
   * List all members in a workspace
   */
  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    log.info("[Workspace Service] Listing members for workspace:", workspaceId);

    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Workspace Service] Supabase not configured");
      return [];
    }

    const { data, error } = await supabase
      .from("workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("joined_at", { ascending: true });

    if (error) {
      log.error("[Workspace Service] Error listing members:", error.message);
      return [];
    }

    return (data || []).map((m) => this.mapSupabaseWorkspaceMember(m));
  }

  /**
   * List all members in a workspace with their user details (name, email)
   */
  async listMembersWithUsers(
    workspaceId: string
  ): Promise<WorkspaceMemberWithUser[]> {
    log.info(
      "[Workspace Service] Listing members with user details for workspace:",
      workspaceId
    );

    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Workspace Service] Supabase not configured");
      return [];
    }

    const { data, error } = await supabase
      .from("workspace_members")
      .select("id, workspace_id, user_id, role, joined_at")
      .eq("workspace_id", workspaceId)
      .order("joined_at", { ascending: true });

    if (error) {
      log.error(
        "[Workspace Service] Error listing members with users:",
        error.message
      );
      throw new Error(error.message);
    }

    // Resolve user details for each member via auth service
    const members = await Promise.all(
      (data || []).map(async (row) => {
        let userName = "Unknown";
        let userEmail = "";
        try {
          const authUser = await authService.getUserById(row.user_id as string);
          if (authUser) {
            userName = authUser.name;
            userEmail = authUser.email;
          }
        } catch {
          // silently fall back to defaults
        }
        return {
          id: row.id as string,
          workspaceId: row.workspace_id as string,
          userId: row.user_id as string,
          role: row.role as UserRole,
          joinedAt: row.joined_at as string,
          user: {
            id: row.user_id as string,
            name: userName,
            email: userEmail,
          },
        } satisfies WorkspaceMemberWithUser;
      })
    );

    return members;
  }

  /**
   * Remove a member from a workspace
   */
  async removeMember(workspaceId: string, userId: string): Promise<void> {
    log.info("[Workspace Service] Removing member from workspace");
    log.info("[Workspace Service] Workspace ID:", workspaceId);
    log.info("[Workspace Service] User ID:", userId);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Workspace Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    const { error } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId);

    if (error) {
      log.error("[Workspace Service] ✗ Error removing member:", error.message);
      throw new Error(error.message);
    }

    log.info("[Workspace Service] ✓ Member removed successfully");
  }

  /**
   * Update a member's role in a workspace
   */
  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: UserRole
  ): Promise<WorkspaceMember> {
    log.info("[Workspace Service] Updating member role");
    log.info("[Workspace Service] Workspace ID:", workspaceId);
    log.info("[Workspace Service] User ID:", userId);
    log.info("[Workspace Service] New role:", role);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Workspace Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    const { data, error } = await supabase
      .from("workspace_members")
      .update({ role })
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      log.error(
        "[Workspace Service] ✗ Error updating member role:",
        error.message
      );
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Member not found");
    }

    const member = this.mapSupabaseWorkspaceMember(data);
    log.info("[Workspace Service] ✓ Member role updated successfully");
    return member;
  }

  /**
   * Invite a user by email to a workspace
   * Uses Supabase admin API if SUPABASE_SERVICE_ROLE_KEY is available
   * Falls back to OTP-based invite otherwise
   */
  async inviteByEmail(
    workspaceId: string,
    email: string,
    role: UserRole
  ): Promise<void> {
    log.info("[Workspace Service] Inviting user by email to workspace");
    log.info("[Workspace Service] Workspace ID:", workspaceId);
    log.info("[Workspace Service] Email:", email);
    log.info("[Workspace Service] Role:", role);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Workspace Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    // ── Path 1: admin client via service-role key ──────────────────────────
    // auth.admin.inviteUserByEmail uses the "Invite user" email template
    // configured in the Supabase dashboard (Authentication → Emails → Invite user).
    // This requires SUPABASE_SERVICE_ROLE_KEY to be set in .env.
    const adminClient = getSupabaseAdmin();
    if (adminClient) {
      try {
        const { error } = await adminClient.auth.admin.inviteUserByEmail(
          email,
          {
            redirectTo: "snapflow://auth/callback",
            data: {
              invited_to_workspace: workspaceId,
              invited_role: role,
            },
          }
        );

        if (error) {
          log.warn(
            "[Workspace Service] Admin invite error, falling back to OTP:",
            error.message
          );
          // fall through to OTP path below
        } else {
          log.info(
            "[Workspace Service] ✓ Invite sent via admin API to:",
            email
          );
          return;
        }
      } catch (err) {
        log.warn(
          "[Workspace Service] Admin invite threw, falling back to OTP:",
          err
        );
        // fall through
      }
    }

    // ── Path 2: OTP / Magic Link fallback (no service-role key available) ──
    // Uses the "Magic link" email template from the Supabase dashboard.
    // shouldCreateUser: true creates the account if the email is new.
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: "snapflow://auth/callback",
          data: {
            invited_to_workspace: workspaceId,
            invited_role: role,
          },
        },
      });

      if (error) {
        log.error("[Workspace Service] ✗ OTP invite error:", error.message);
        throw new Error(`Failed to send invite to ${email}: ${error.message}`);
      }

      log.info("[Workspace Service] ✓ Invite sent via OTP to:", email);
    } catch (err) {
      log.error("[Workspace Service] ✗ OTP invite failed:", err);
      throw err;
    }
  }

  /**
   * Update workspace details (name and/or description)
   * Only workspace admins can update
   */
  async updateWorkspace(
    workspaceId: string,
    userId: string,
    updates: { name?: string; description?: string }
  ): Promise<Workspace> {
    log.info("[Workspace Service] === UPDATE WORKSPACE START ===");
    log.info("[Workspace Service] Workspace ID:", workspaceId);
    log.info("[Workspace Service] User ID:", userId);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Workspace Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    // Check if user is an admin in this workspace
    const { data: memberData, error: memberError } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .single();

    if (memberError || !memberData) {
      log.error("[Workspace Service] ✗ User is not a member of this workspace");
      throw new Error("You are not a member of this workspace");
    }

    if (memberData.role !== "admin") {
      log.error(
        "[Workspace Service] ✗ User is not an admin. Role:",
        memberData.role
      );
      throw new Error("Only workspace admins can update workspace details");
    }

    // Get current workspace to verify it exists
    const workspace = await this.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const updateData: Record<string, unknown> = {};

    // If name is being updated, also update the slug
    if (updates.name !== undefined) {
      updateData.name = updates.name;
      // Auto-generate slug from name
      let newSlug = slugify(updates.name);
      let originalSlug = newSlug;
      let attempt = 2;

      // Check for unique slug within tenant
      while (true) {
        const { data: existing } = await supabase
          .from("workspaces")
          .select("id")
          .eq("tenant_id", workspace.tenantId)
          .eq("slug", newSlug)
          .neq("id", workspaceId) // Exclude current workspace
          .single();

        if (!existing) {
          break;
        }

        newSlug = `${originalSlug}-${attempt}`;
        attempt++;
      }

      updateData.slug = newSlug;
      log.info("[Workspace Service] New slug:", newSlug);
    }

    if (updates.description !== undefined) {
      updateData.description = updates.description || null;
    }

    log.info("[Workspace Service] Updates:", updateData);

    const { data, error } = await supabase
      .from("workspaces")
      .update(updateData)
      .eq("id", workspaceId)
      .select()
      .single();

    if (error) {
      log.error("[Workspace Service] ✗ Update error:", error.message);
      throw new Error(error.message);
    }

    if (!data) {
      log.error("[Workspace Service] ✗ No workspace data returned");
      throw new Error("Failed to update workspace");
    }

    const updatedWorkspace = this.mapSupabaseWorkspace(data);
    log.info("[Workspace Service] ✓ Workspace updated successfully");
    log.info("[Workspace Service] === UPDATE WORKSPACE END ===");
    return updatedWorkspace;
  }

  /**
   * Delete a workspace (admin only)
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    log.info("[Workspace Service] === DELETE WORKSPACE START ===");
    log.info("[Workspace Service] Workspace ID:", workspaceId);
    log.info("[Workspace Service] User ID:", userId);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Workspace Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    // Check if user is an admin in this workspace
    const { data: memberData, error: memberError } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .single();

    if (memberError || !memberData) {
      throw new Error("You are not a member of this workspace");
    }
    if (memberData.role !== "admin") {
      throw new Error("Only workspace admins can delete workspaces");
    }

    const { error } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", workspaceId);

    if (error) {
      log.error("[Workspace Service] ✗ Delete error:", error.message);
      throw new Error(error.message);
    }

    log.info("[Workspace Service] ✓ Workspace deleted successfully");
    log.info("[Workspace Service] === DELETE WORKSPACE END ===");
  }

  /**
   * Get all workspaces a user is a member of (across all tenants)
   */
  async getUserWorkspaces(
    userId: string
  ): Promise<(Workspace & { role: UserRole })[]> {
    log.info("[Workspace Service] Getting all workspaces for user:", userId);

    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Workspace Service] Supabase not configured");
      return [];
    }

    // Step 1: Get all (workspace_id, role) pairs for this user
    const { data: memberRows, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", userId);

    if (memberError) {
      log.error(
        "[Workspace Service] Error fetching user workspace memberships:",
        memberError.message
      );
      return [];
    }

    if (!memberRows || memberRows.length === 0) return [];

    // Step 2: Fetch workspace details for all workspace_ids
    const workspaceIds = memberRows.map((r) => r.workspace_id as string);
    const { data: wsRows, error: wsError } = await supabase
      .from("workspaces")
      .select("*")
      .in("id", workspaceIds);

    if (wsError) {
      log.error(
        "[Workspace Service] Error fetching workspace details:",
        wsError.message
      );
      return [];
    }

    // Step 3: Merge role into each workspace
    return (wsRows || []).map((ws) => {
      const membership = memberRows.find((r) => r.workspace_id === ws.id);
      return {
        ...this.mapSupabaseWorkspace(ws as Record<string, unknown>),
        role: (membership?.role ?? "dev") as UserRole,
      };
    });
  }

  /**
   * Helper: Map Supabase workspace row to Workspace interface
   */
  private mapSupabaseWorkspace(data: Record<string, unknown>): Workspace {
    return {
      id: data.id as string,
      tenantId: data.tenant_id as string,
      name: data.name as string,
      slug: data.slug as string,
      description: (data.description as string) || undefined,
      createdBy: data.created_by as string,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }

  /**
   * Helper: Map Supabase workspace_member row to WorkspaceMember interface
   */
  private mapSupabaseWorkspaceMember(
    data: Record<string, unknown>
  ): WorkspaceMember {
    return {
      id: data.id as string,
      workspaceId: data.workspace_id as string,
      userId: data.user_id as string,
      role: data.role as UserRole,
      joinedAt: data.joined_at as string,
    };
  }
}

export const workspaceService = new WorkspaceService();
