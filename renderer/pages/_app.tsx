import React, { useEffect } from "react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { Toaster } from "sonner";
import { TooltipProvider } from "../components/ui/Tooltip";

import "../styles/globals.css";

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [authChecked, setAuthChecked] = React.useState(false);

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
    // Skip if router is not ready yet
    if (!router.isReady) {
      return;
    }

    const checkAuth = async () => {
      const publicRoutes = ["/auth", "/500"];

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
          return;
        }

        // User is NOT authenticated on protected route, redirect to auth
        if (!isAuthenticated) {
          console.log(
            "[App] Not authenticated on protected route, redirecting to /auth"
          );
          await router.push("/auth");
          return;
        }

        // User is authenticated, check onboarding status for non-auth routes
        if (router.pathname !== "/onboarding") {
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
      } catch (err) {
        console.error("Auth check error:", err);
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, [router.isReady, router.pathname]);

  return (
    <TooltipProvider delayDuration={300}>
      {authChecked && <Component {...pageProps} />}
      <Toaster
        position="top-right"
        theme="dark"
        toastOptions={{
          className:
            "rounded-xl border border-gray-800/50 bg-gray-900/95 backdrop-blur-xl text-gray-100 shadow-2xl cursor-pointer",
          style: {
            background: "rgba(17, 24, 39, 0.95)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(75, 85, 99, 0.3)",
          },
          duration: 4000,
        }}
        closeButton
        richColors
      />
    </TooltipProvider>
  );
}

export default MyApp;
