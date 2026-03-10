import React, { useEffect } from "react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { Toaster } from "sonner";
import { TooltipProvider } from "../components/ui/Tooltip";
import { SplashScreen } from "../components/ui/SplashScreen";

import "../styles/globals.css";

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = React.useState(false);
  const [hasInitialized, setHasInitialized] = React.useState(false);

  useEffect(() => {
    // Setup OAuth callback listener
    const unsubscribe = window.api.onNavigate((route: string) => {
      console.log("[App] Received navigate event:", route);
      console.log("[App] Current pathname:", router.pathname);
      router.push(route);
    });

    console.log("[App] onNavigate listener set up");
    return () => {
      unsubscribe();
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

        console.log(
          "[App] Auth check - isAuthenticated:",
          isAuthenticated,
          "pathname:",
          router.pathname
        );

        // If user IS authenticated but on auth page, redirect to home/onboarding
        if (isAuthenticated && router.pathname === "/auth") {
          console.log(
            "[App] User authenticated on /auth, checking onboarding status"
          );
          const onboardingResult = await window.api.getOnboardingStatus();
          if (onboardingResult.success && !onboardingResult.data?.isComplete) {
            console.log(
              "[App] Onboarding incomplete, redirecting to /onboarding"
            );
            await router.push("/onboarding");
          } else {
            console.log("[App] Onboarding complete, redirecting to /home");
            await router.push("/home");
          }
          return;
        }

        // Skip further auth checks for public routes
        if (publicRoutes.includes(router.pathname)) {
          console.log("[App] Public route, auth check skipped");
          setAuthChecked(true);
          setHasInitialized(true);
          return;
        }

        // User is NOT authenticated on protected route, redirect to auth
        if (!isAuthenticated) {
          console.log(
            "[App] Not authenticated on protected route, redirecting to /auth"
          );
          await router.push("/auth");
          setAuthChecked(true);
          setHasInitialized(true);
          return;
        }

        // User is authenticated on semi-protected route, skip onboarding check
        if (semiProtectedRoutes.includes(router.pathname)) {
          console.log("[App] Semi-protected route, auth check passed");
          setAuthChecked(true);
          setHasInitialized(true);
          return;
        }

        // User is authenticated, check onboarding status for non-auth, non-semi-protected routes
        if (
          !["/onboarding", ...semiProtectedRoutes].includes(router.pathname)
        ) {
          console.log("[App] Checking onboarding status");
          const onboardingResult = await window.api.getOnboardingStatus();

          if (onboardingResult.success && !onboardingResult.data?.isComplete) {
            // Onboarding incomplete, redirect to onboarding
            console.log(
              "[App] Onboarding incomplete, redirecting to /onboarding"
            );
            await router.push("/onboarding");
            return;
          }
        }

        console.log("[App] Auth check passed, setting authChecked to true");
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
      {!authChecked ? (
        <SplashScreen />
      ) : (
        <>
          <Component {...pageProps} />
          <Toaster
            position="top-right"
            theme="dark"
            toastOptions={{
              className: "rounded-xl text-gray-100 shadow-2xl",
              style: {
                background: "rgba(17, 24, 39, 0.98)",
                border: "1px solid rgba(75, 85, 99, 0.35)",
                color: "rgb(243 244 246)",
              },
              duration: 4000,
              classNames: {
                closeButton:
                  "!bg-gray-700 !border-gray-600 !text-gray-300 !cursor-pointer !pointer-events-auto !opacity-100 !z-10 hover:!bg-gray-600 hover:!text-gray-100",
              },
            }}
            closeButton
            richColors
            expand
            gap={8}
          />
        </>
      )}
    </TooltipProvider>
  );
}

export default MyApp;
