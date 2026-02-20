import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Store from "electron-store";
import log from "electron-log";

// Singleton pattern for Supabase Client in Electron
// Prevents multiple instances during hot-reload in development
declare global {
  var supabase: SupabaseClient | undefined;
}

// Get Supabase configuration from environment variables
const getSupabaseUrl = () => process.env.SUPABASE_URL || "";
const getSupabaseAnonKey = () => process.env.SUPABASE_ANON_KEY || "";

// Create a separate store for Supabase internal session management
const supabaseStore = new Store<Record<string, string>>({
  name: "snapflow-supabase-storage",
  defaults: {},
});

// Lazy initialization function for Supabase client
function initializeSupabase(): SupabaseClient | null {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (!supabaseUrl || !supabaseAnonKey) {
    log.warn(
      "⚠️ Supabase credentials not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file."
    );
    return null;
  }

  // Create Supabase client with auth configuration
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true, // Enable session persistence for automatic token refresh
      detectSessionInUrl: false,
      storage: {
        // Custom storage adapter that uses electron-store
        // This allows Supabase to persist its session data properly in Electron
        getItem: (key: string) => {
          if (typeof window !== "undefined") {
            return null; // In renderer process, let default localStorage handle it
          }
          // In main process, retrieve from electron-store
          const value = supabaseStore.get(key);
          return value || null;
        },
        setItem: (key: string, value: string) => {
          if (typeof window !== "undefined") {
            return; // In renderer process, let default localStorage handle it
          }
          // In main process, store in electron-store
          supabaseStore.set(key, value);
        },
        removeItem: (key: string) => {
          if (typeof window !== "undefined") {
            return; // In renderer process, let default localStorage handle it
          }
          // In main process, remove from electron-store
          supabaseStore.delete(key);
        },
      },
    },
  });

  if (process.env.NODE_ENV !== "production") {
    global.supabase = client;
  }

  return client;
}

// Export getter function that lazily initializes the client
export function getSupabase(): SupabaseClient | null {
  if (global.supabase) {
    return global.supabase;
  }
  return initializeSupabase();
}

// Export type for use in other files
export type { SupabaseClient };
