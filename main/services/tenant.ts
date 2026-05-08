import { getSupabase } from "../utils/supabase";
import log from "electron-log";
import type { Tenant } from "../../renderer/types";

/**
 * Helper: Slugify a string
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class TenantService {
  /**
   * Create a new tenant
   */
  async createTenant(
    userId: string,
    name: string,
    description?: string
  ): Promise<Tenant> {

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Tenant Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    let slug = slugify(name);
    let originalSlug = slug;
    let attempt = 2;

    // Handle UNIQUE slug constraint by appending -2, -3, etc.
    while (true) {
      const { data: existing } = await supabase
        .from("tenants")
        .select("id")
        .eq("slug", slug)
        .single();

      if (!existing) {
        break; // slug is unique, use it
      }

      slug = `${originalSlug}-${attempt}`;
      attempt++;
    }


    const { data, error } = await supabase
      .from("tenants")
      .insert({
        name,
        slug,
        description: description || null,
        owner_id: userId,
      })
      .select()
      .single();

    if (error) {
      log.error("[Tenant Service] ✗ Create error:", error.message);

      // Provide user-friendly error messages for common constraint violations
      if (error.message.includes("tenants_name_key")) {
        throw new Error(
          `Organization name "${name}" is already taken. Please choose a different name.`
        );
      }
      if (error.message.includes("tenants_slug_key")) {
        throw new Error(
          "This organization name (or slug) is already taken. Please choose a different name."
        );
      }

      throw new Error(error.message);
    }

    if (!data) {
      log.error("[Tenant Service] ✗ No tenant data returned");
      throw new Error("Failed to create tenant");
    }

    const tenant = this.mapSupabaseTenant(data);
    return tenant;
  }

  /**
   * Get tenant by owner (user)
   */
  async getTenantByOwner(userId: string): Promise<Tenant | null> {

    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Tenant Service] Supabase not configured");
      return null;
    }

    // 1. Try as tenant owner first
    const { data: ownerData, error: ownerError } = await supabase
      .from("tenants")
      .select("*")
      .eq("owner_id", userId)
      .single();

    if (!ownerError && ownerData) {
      return this.mapSupabaseTenant(ownerData);
    }

    // 2. Fall back: look up tenant via workspace membership
    const { data: memberData, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace_id, workspaces:workspace_id(tenant_id)")
      .eq("user_id", userId)
      .limit(1)
      .single();

    if (memberError || !memberData) {
      return null;
    }

    const ws = memberData.workspaces as unknown as { tenant_id: string } | null;
    const tenantId = ws?.tenant_id;
    if (!tenantId) {
      log.warn(
        "[Tenant Service] Could not resolve tenant_id from workspace membership"
      );
      return null;
    }

    return this.getTenantById(tenantId);
  }

  /**
   * Get tenant by ID
   */
  async getTenantById(tenantId: string): Promise<Tenant | null> {

    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Tenant Service] Supabase not configured");
      return null;
    }

    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null;
      }
      log.error("[Tenant Service] Error fetching tenant:", error.message);
      return null;
    }

    return this.mapSupabaseTenant(data);
  }

  /**
   * Update tenant details (name and/or description)
   * Only the tenant owner or workspace admin can update
   */
  async updateTenant(
    tenantId: string,
    userId: string,
    updates: { name?: string; description?: string }
  ): Promise<Tenant> {

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Tenant Service] ✗ Supabase not configured");
      throw new Error(
        "Supabase is not configured. Please check your environment variables."
      );
    }

    // Verify user is the tenant owner or an admin in any workspace within the tenant
    const tenant = await this.getTenantById(tenantId);
    if (!tenant) {
      throw new Error("Tenant not found");
    }

    const isOwner = tenant.ownerId === userId;

    // Check if user is an admin in any workspace within this tenant
    let isAdmin = false;
    if (!isOwner) {
      const { data: adminMembers } = await supabase
        .from("workspace_members")
        .select(
          `
          id,
          workspace_id,
          workspaces(tenant_id)
        `
        )
        .eq("role", "admin")
        .eq("user_id", userId);

      isAdmin = (adminMembers || []).some(
        (m: any) => m.workspaces?.tenant_id === tenantId
      );
    }

    if (!isOwner && !isAdmin) {
      log.error(
        "[Tenant Service] ✗ User is not tenant owner or admin. Owner:",
        tenant.ownerId,
        "User:",
        userId
      );
      throw new Error(
        "Only the tenant owner or workspace admin can update tenant details"
      );
    }

    const updateData: Record<string, unknown> = {};

    // If name is being updated, also update the slug
    if (updates.name !== undefined) {
      updateData.name = updates.name;
      // Auto-generate slug from name
      let newSlug = slugify(updates.name);
      let originalSlug = newSlug;
      let attempt = 2;

      // Check for unique slug
      while (true) {
        const { data: existing } = await supabase
          .from("tenants")
          .select("id")
          .eq("slug", newSlug)
          .neq("id", tenantId) // Exclude current tenant
          .single();

        if (!existing) {
          break;
        }

        newSlug = `${originalSlug}-${attempt}`;
        attempt++;
      }

      updateData.slug = newSlug;
    }

    if (updates.description !== undefined) {
      updateData.description = updates.description || null;
    }


    const { data, error } = await supabase
      .from("tenants")
      .update(updateData)
      .eq("id", tenantId)
      .select()
      .single();

    if (error) {
      log.error("[Tenant Service] ✗ Update error:", error.message);
      throw new Error(error.message);
    }

    if (!data) {
      log.error("[Tenant Service] ✗ No tenant data returned");
      throw new Error("Failed to update tenant");
    }

    const updatedTenant = this.mapSupabaseTenant(data);
    return updatedTenant;
  }

  /**
   * Helper: Map Supabase row to Tenant interface
   */
  private mapSupabaseTenant(data: Record<string, unknown>): Tenant {
    return {
      id: data.id as string,
      name: data.name as string,
      slug: data.slug as string,
      description: (data.description as string) || undefined,
      logoUrl: (data.logo_url as string) || undefined,
      ownerId: data.owner_id as string,
      createdAt: data.created_at as string,
      updatedAt: data.updated_at as string,
    };
  }
}

export const tenantService = new TenantService();
