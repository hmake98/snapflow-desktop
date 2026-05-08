import React, { useEffect } from "react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { TooltipProvider } from "../components/ui/Tooltip";
import { SplashScreen } from "../components/ui/SplashScreen";
import { ToastHost } from "../components/ui/Toast";
// import { WindowPickerModal } from "../components/WindowPickerModal";
import { useStore } from "../store/useStore";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import type { UserRole } from "../types";
// import type { ShowPickerPayload } from "../types";

import "../styles/globals.css";

// Overlay/utility routes that don't need auth checks.
// Checked synchronously so these windows never flash the splash screen.
// IMPORTANT: every route that runs in its own BrowserWindow (not the main
// window) MUST be listed here so it skips the auth-check/splash-screen flow.
const OVERLAY_ROUTES = [
  "/area-capture",
  "/window-capture",
  "/recording-area-selector",
  "/recording-control",
  "/recording-overlay",
  "/session-hud",
  "/window-picker",
  "/auth",
  "/500",
];

// Routes that are utility/overlay windows — no traffic light bar on these.
const NO_TITLEBAR_ROUTES = [
  "/area-capture",
  "/window-capture",
  "/area-selector",
  "/recording-area-selector",
  "/recording-control",
  "/recording-overlay",
  "/session-hud",
  "/window-picker",
];

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  useNetworkStatus();
  const showTitleBar = !NO_TITLEBAR_ROUTES.some((r) =>
    router.pathname.startsWith(r)
  );
  // Use router.pathname (consistent between SSR and client) to avoid hydration mismatch.
  // Initialize synchronously for overlay routes so they never flash the splash screen.
  const isOverlay = OVERLAY_ROUTES.some((r) => router.pathname.includes(r));
  const [authChecked, setAuthChecked] = React.useState(isOverlay);
  const [hasInitialized, setHasInitialized] = React.useState(isOverlay);
  // const {
  //   setPickerPayload,
  //   setShowRecordingPicker,
  //   pickerPayload,
  //   showRecordingPicker,
  // } = useStore();
  const { setUser, setActiveWorkspace, setCurrentUserRole, resetStore } =
    useStore();

  // Notify main process of route changes so tray can enable/disable capture actions
  useEffect(() => {
    window.ipc.send("route:change", router.pathname);
  }, [router.pathname]);

  useEffect(() => {
    // Setup OAuth callback listener
    const unsubscribeNavigate = window.api.onNavigate((route: string) => {
      router.push(route);
    });

    // Session expiry — wipe all state and redirect to login so the next user
    // starts with a completely clean store instead of stale data.
    const unsubscribeExpired = window.api.onSessionExpired?.(() => {
      resetStore();
      router.push("/auth");
    });

    return () => {
      unsubscribeNavigate();
      unsubscribeExpired?.();
    };
  }, []);

  useEffect(() => {
    // Skip if router is not ready yet or already initialized
    if (!router.isReady || hasInitialized) {
      return;
    }

    const checkAuth = async () => {
      // Pages that don't require auth checks (includes overlay windows for capture)
      const publicRoutes = [
        "/auth",
        "/500",
        "/area-capture",
        "/window-capture",
        "/recording-area-selector",
        "/recording-control",
        "/recording-overlay",
        "/session-hud",
        "/window-picker",
      ];
      const semiProtectedRoutes = ["/join-workspace"]; // Auth required, but skip onboarding check

      try {
        // Wait for session initialization to complete (max 5 seconds)
        let isInitialized = false;
        let attempts = 0;
        const maxAttempts = 50; // 50 * 100ms = 5 seconds

        while (!isInitialized && attempts < maxAttempts) {
          const initResult = await window.api.isSessionInitialized();
          if (initResult.success && initResult.data) {
            isInitialized = true;
            break;
          }
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }

        if (!isInitialized) {
          console.warn(
            "[App] Session initialization timeout after 5 seconds, proceeding anyway"
          );
        }

        // Check if user is authenticated
        const userResult = await window.api.getUser();
        const isAuthenticated = userResult.success && userResult.data;


        // If user IS authenticated but on auth page, redirect to home/onboarding
        if (isAuthenticated && router.pathname === "/auth") {
          const onboardingResult = await window.api.getOnboardingStatus();
          if (onboardingResult.success && !onboardingResult.data?.isComplete) {
            await router.push("/onboarding");
          } else {
            await router.push("/home");
          }
          return;
        }

        // Skip further auth checks for public routes
        if (publicRoutes.includes(router.pathname)) {
          setAuthChecked(true);
          setHasInitialized(true);
          return;
        }

        // User is NOT authenticated on protected route, redirect to auth
        if (!isAuthenticated) {
          await router.push("/auth");
          setAuthChecked(true);
          setHasInitialized(true);
          return;
        }

        // User is authenticated on semi-protected route, skip onboarding check
        if (semiProtectedRoutes.includes(router.pathname)) {
          setAuthChecked(true);
          setHasInitialized(true);
          return;
        }

        // User is authenticated, check onboarding status for non-auth, non-semi-protected routes
        if (
          !["/onboarding", ...semiProtectedRoutes].includes(router.pathname)
        ) {
          const onboardingResult = await window.api.getOnboardingStatus();

          if (onboardingResult.success && !onboardingResult.data?.isComplete) {
            // Onboarding incomplete, redirect to onboarding
            await router.push("/onboarding");
            return;
          }
        }

        // ── Load user context into store atomically ────────────────────────
        // This ensures the Zustand store is populated as soon as auth is
        // confirmed — pages no longer need to re-fetch the user themselves.
        try {
          const [freshUser, workspacesResult] = await Promise.all([
            window.api.getUser(),
            window.api.getUserWorkspaces(),
          ]);

          if (freshUser.success && freshUser.data) {
            setUser(freshUser.data);
          }

          if (workspacesResult.success && workspacesResult.data?.length) {
            // Restore the previously active workspace (main process tracks it)
            // or fall back to the first workspace in the list.
            const activeResult = await window.api.getActiveWorkspaceId?.();
            const savedId = activeResult?.success ? activeResult.data : null;
            const list = workspacesResult.data;
            const toActivate =
              list.find((w) => w.id === savedId) ?? list[0];
            setActiveWorkspace(toActivate);
            setCurrentUserRole((toActivate.role ?? "member") as UserRole);
          }
        } catch (ctxErr) {
          console.error("[App] Failed to load user context into store:", ctxErr);
        }

        setAuthChecked(true);
        setHasInitialized(true);
      } catch (err) {
        console.error("Auth check error:", err);
        setAuthChecked(true);
        setHasInitialized(true);
      }
    };

    checkAuth();
  }, [router.isReady, hasInitialized]);

  return (
    <TooltipProvider delayDuration={300}>
      {showTitleBar && (
        <div
          className="fixed top-0 left-0 right-0 h-8 bg-gray-950 z-[9999]"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
      )}
      {!authChecked ? <SplashScreen /> : <Component {...pageProps} />}
      {/* In-app toast host — replaces native desktop notifications */}
      {!isOverlay && <ToastHost />}
      {/* Recording picker modal — commented out
      <WindowPickerModal
        isOpen={showRecordingPicker}
        initialPayload={pickerPayload}
        onSelect={async (source, setAsDefault) => {
          const result = await window.api.startRecordingWithSource({
            sourceId: source.id,
            sourceName: source.name,
            displayBounds: source.displayBounds || null,
            setAsDefault,
          });
          if (result.success) {
            setShowRecordingPicker(false);
            setPickerPayload(null);
            window.api.showNotification(
              "Recording Started",
              "Click the tray icon to stop recording"
            );
          }
          return result;
        }}
        onCancel={() => {
          setShowRecordingPicker(false);
          setPickerPayload(null);
          window.api.cancelRecording();
        }}
      />
      */}
    </TooltipProvider>
  );
}

export default MyApp;
