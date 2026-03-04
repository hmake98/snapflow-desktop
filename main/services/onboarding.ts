import { getSupabase } from "../utils/supabase";
import log from "electron-log";

export class OnboardingService {
  /**
   * Get the user's current onboarding progress
   */
  async getProgress(userId: string): Promise<{
    currentStep: number;
    isComplete: boolean;
  } | null> {
    log.info("[Onboarding Service] Getting progress for user:", userId);

    const supabase = getSupabase();
    if (!supabase) {
      log.warn("[Onboarding Service] Supabase not configured");
      return null;
    }

    const { data, error } = await supabase
      .from("onboarding_progress")
      .select("current_step, is_complete")
      .eq("user_id", userId)
      .single();

    if (error) {
      // PGRST116 = "not found" - user hasn't started onboarding yet
      if (error.code === "PGRST116") {
        log.info("[Onboarding Service] No onboarding progress found, initializing");
        return null;
      }
      log.error("[Onboarding Service] Error fetching progress:", error.message);
      return null;
    }

    return {
      currentStep: data.current_step,
      isComplete: data.is_complete,
    };
  }

  /**
   * Initialize onboarding progress for a user at step 1
   */
  async initializeProgress(userId: string): Promise<void> {
    log.info("[Onboarding Service] Initializing progress for user:", userId);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Onboarding Service] ✗ Supabase not configured");
      throw new Error("Supabase is not configured");
    }

    const { error } = await supabase
      .from("onboarding_progress")
      .insert({
        user_id: userId,
        current_step: 1,
        is_complete: false,
      });

    if (error) {
      // Ignore duplicate key error (user already initialized)
      if (error.message.includes("duplicate key")) {
        log.info("[Onboarding Service] Progress already initialized");
        return;
      }
      log.error("[Onboarding Service] ✗ Error initializing progress:", error.message);
      throw new Error(error.message);
    }

    log.info("[Onboarding Service] ✓ Progress initialized");
  }

  /**
   * Update the user's current onboarding step
   */
  async setStep(userId: string, step: number): Promise<void> {
    log.info("[Onboarding Service] Setting step for user:", userId, "Step:", step);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Onboarding Service] ✗ Supabase not configured");
      throw new Error("Supabase is not configured");
    }

    // First check if progress exists, if not initialize it
    const existing = await this.getProgress(userId);
    if (!existing) {
      await this.initializeProgress(userId);
    }

    const { error } = await supabase
      .from("onboarding_progress")
      .update({ current_step: step, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (error) {
      log.error("[Onboarding Service] ✗ Error updating step:", error.message);
      throw new Error(error.message);
    }

    log.info("[Onboarding Service] ✓ Step updated to:", step);
  }

  /**
   * Mark onboarding as complete
   */
  async complete(userId: string): Promise<void> {
    log.info("[Onboarding Service] Completing onboarding for user:", userId);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Onboarding Service] ✗ Supabase not configured");
      throw new Error("Supabase is not configured");
    }

    const { error } = await supabase
      .from("onboarding_progress")
      .update({
        current_step: 5,
        is_complete: true,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      log.error("[Onboarding Service] ✗ Error completing:", error.message);
      throw new Error(error.message);
    }

    log.info("[Onboarding Service] ✓ Onboarding completed");
  }

  /**
   * Reset onboarding progress (for testing or restart)
   */
  async reset(userId: string): Promise<void> {
    log.info("[Onboarding Service] Resetting progress for user:", userId);

    const supabase = getSupabase();
    if (!supabase) {
      log.error("[Onboarding Service] ✗ Supabase not configured");
      throw new Error("Supabase is not configured");
    }

    const { error } = await supabase
      .from("onboarding_progress")
      .update({
        current_step: 1,
        is_complete: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (error) {
      log.error("[Onboarding Service] ✗ Error resetting:", error.message);
      throw new Error(error.message);
    }

    log.info("[Onboarding Service] ✓ Progress reset");
  }
}

export const onboardingService = new OnboardingService();
