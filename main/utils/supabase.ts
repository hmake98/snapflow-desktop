/**
 * Supabase Client — Main Process (Electron)
 *
 * Key design decisions based on the official Supabase docs:
 *
 * 1. STORAGE  — electron-store is used as a custom storage adapter so the
 *    Supabase SDK can persist & restore sessions across app restarts without
 *    touching the renderer's localStorage.
 *
 * 2. FETCH    — A custom fetch wrapper converts every network/timeout error
 *    into a DOMException("…", "AbortError").  Supabase's internal
 *    `_handleRequest` catches all thrown errors as AuthRetryableFetchError,
 *    preventing raw TypeErrors from leaking as unhandled rejections.
 *
 * 3. AUTO-REFRESH — autoRefreshToken is kept ON.  The custom fetch above
 *    ensures that refresh failures on poor networks are handled gracefully.
 *
 * 4. SINGLETON — one client instance per process, stored on `global` in dev
 *    so hot-reload doesn't create duplicate clients.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Store from "electron-store";
import log from "electron-log";

// ─── Global singleton (prevents duplicates during hot-reload) ────────────────
declare global {
  var __supabaseClient: SupabaseClient | undefined;
}

// ─── electron-store for session persistence ──────────────────────────────────
const supabaseStore = new Store<Record<string, string>>({
  name: "snapflow-supabase-storage",
  defaults: {},
});

// ─── Network-error helpers ───────────────────────────────────────────────────

/**
 * Returns true when `err` is a connectivity/timeout error from Node's undici
 * HTTP stack or any well-known network-failure code.
 */
function isNetworkOrTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const msg = err.message.toLowerCase();
  if (
    msg.includes("fetch failed") ||
    msg.includes("connect timeout") ||
    msg.includes("network request failed") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound")
  ) {
    return true;
  }

  // undici surfaces the real code on err.cause
  const cause = (err as NodeJS.ErrnoException & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as NodeJS.ErrnoException).code ?? "";
    // UND_ERR_CONNECT_TIMEOUT, UND_ERR_SOCKET, etc.
    if (
      code.startsWith("UND_ERR") ||
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "ETIMEDOUT"
    ) {
      return true;
    }
  }

  return false;
}

// ─── Custom fetch with timeout ───────────────────────────────────────────────

/**
 * Wraps the global `fetch` with an AbortController-based timeout and silent
 * network-error handling.
 *
 * WHY we return a fake Response instead of throwing:
 *
 * Supabase's `_handleRequest` (fetch.js) has this structure:
 *
 *   try {
 *     result = await fetcher(url, options);
 *   } catch (e) {
 *     console.error(e);          ← THIS is the source of all the noise
 *     throw new AuthRetryableFetchError(...);
 *   }
 *   if (!result.ok) {
 *     await handleError(result); ← silent path — no console.error
 *   }
 *
 * If we throw, the catch block runs console.error before re-throwing as
 * AuthRetryableFetchError.  With autoRefreshToken ticking every 30 s and
 * each failed tick retrying multiple times, that produces dozens of
 * console.error lines per minute when offline.
 *
 * If instead we RETURN a fake not-ok Response (status 0, ok: false),
 * _handleRequest takes the `if (!result.ok)` branch.  handleError() sees a
 * looksLikeFetchResponse-compatible object with status 0, throws
 * AuthRetryableFetchError internally — completely silently, zero console output.
 */
function buildFetchWithTimeout(timeoutMs: number) {
  /** Minimal object that satisfies Supabase's looksLikeFetchResponse() check. */
  const networkErrorResponse = {
    ok: false as const,
    status: 0,
    headers: new Headers(),
    json: async () => ({
      error: "network_error",
      error_description: "Network request failed (offline/unreachable)",
    }),
    text: async () => "network_error",
  } as unknown as Response;

  return async (
    url: RequestInfo | URL,
    options?: RequestInit
  ): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (err) {
      if (
        isNetworkOrTimeoutError(err) ||
        (err instanceof Error &&
          (err.name === "AbortError" || err.name === "TimeoutError"))
      ) {
        // Return a fake not-ok Response — bypasses the catch(e){console.error(e)}
        // block in Supabase's _handleRequest entirely.
        return networkErrorResponse;
      }
      // Non-network errors (programming mistakes, etc.) should still surface.
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}

// ─── electron-store storage adapter ─────────────────────────────────────────

/**
 * Supabase docs recommend a custom `storage` adapter when running outside a
 * browser (no localStorage).  This adapter stores all Supabase auth keys in
 * a dedicated electron-store file ("snapflow-supabase-storage").
 *
 * The `typeof window !== "undefined"` guard makes the adapter a no-op in
 * renderer frames — the renderer uses its own localStorage-backed client.
 */
const electronStoreAdapter = {
  getItem(key: string): string | null {
    if (typeof window !== "undefined") return null;
    return ((supabaseStore as any).get(key) as string | undefined) ?? null;
  },
  setItem(key: string, value: string): void {
    if (typeof window !== "undefined") return;
    (supabaseStore as any).set(key, value);
  },
  removeItem(key: string): void {
    if (typeof window !== "undefined") return;
    (supabaseStore as any).delete(key);
  },
};

// ─── Client factory ───────────────────────────────────────────────────────────

function createSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    log.warn(
      "[Supabase] ⚠️  SUPABASE_URL / SUPABASE_ANON_KEY not set — " +
        "Supabase features will be unavailable. Check your .env file."
    );
    return null;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      /**
       * autoRefreshToken — keep ON so the SDK proactively refreshes the JWT
       * before it expires.  Our custom fetch converts network failures to
       * AbortError so the background refresh loop never crashes the process.
       */
      autoRefreshToken: true,

      /**
       * persistSession — keep ON so the SDK writes updated tokens back to
       * our electron-store adapter after every successful refresh.
       */
      persistSession: true,

      /**
       * detectSessionInUrl — OFF in Electron (no browser URL bar).
       */
      detectSessionInUrl: false,

      /**
       * Custom storage backed by electron-store so sessions survive restarts.
       */
      storage: electronStoreAdapter,
    },

    global: {
      /**
       * 10-second timeout.  Any error (including undici's ConnectTimeoutError)
       * is normalised to AbortError so Supabase handles it without leaking
       * noisy stack traces to the console.
       */
      fetch: buildFetchWithTimeout(10_000),
    },
  });

  log.info("[Supabase] Client initialised ✓");
  return client;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the singleton Supabase client for the main process.
 *
 * Lazily created on first call; stored on `global` in development so
 * Nextron hot-reload doesn't create duplicate instances.
 */
export function getSupabase(): SupabaseClient | null {
  if (global.__supabaseClient) {
    return global.__supabaseClient;
  }

  const client = createSupabaseClient();
  if (!client) return null;

  // Cache on global so hot-reload doesn't spawn duplicate clients.
  if (process.env.NODE_ENV !== "production") {
    global.__supabaseClient = client;
  }

  return client;
}

/**
 * Returns a Supabase client initialised with the service-role key.
 * This bypasses Row-Level Security and grants access to auth.admin APIs
 * (e.g. inviteUserByEmail).  Only use in the main process — never expose
 * to the renderer.
 *
 * Returns null if SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    log.warn(
      "[Supabase] ⚠️  SUPABASE_SERVICE_ROLE_KEY not set — " +
        "admin operations (e.g. invite emails) will be unavailable."
    );
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: buildFetchWithTimeout(10_000),
    },
  });
}

export type { SupabaseClient };
