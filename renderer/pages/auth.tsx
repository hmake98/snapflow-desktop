import React, { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";

const getDisplayError = (errorMsg: string): string => {
  const msg = errorMsg.toLowerCase();
  if (
    msg.includes("unable to connect") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("connection")
  ) {
    return "Connection failed. Please check your internet and try again.";
  }
  return errorMsg;
};

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const googleSigninTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (googleSigninTimeoutRef.current) {
        clearTimeout(googleSigninTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    // Set a 30-second timeout for auth operations
    const authTimeout = setTimeout(() => {
      setLoading(false);
      setError("Request timeout. Please check your connection and try again.");
    }, 30000);

    try {
      if (isLogin) {
        // Login
        const result = await window.api.loginUser(
          formData.email,
          formData.password
        );

        clearTimeout(authTimeout);

        if (result.success) {
          // Navigate using Next.js router
          try {
            await router.push("/home");
          } catch (navError) {
            console.error("[AUTH] Navigation error:", navError);
            window.location.href = "/home";
          }
          return;
        } else {
          setError(getDisplayError(result.error || "Login failed"));
          setLoading(false);
        }
      } else {
        // Signup
        if (formData.password !== formData.confirmPassword) {
          clearTimeout(authTimeout);
          setError("Passwords do not match");
          setLoading(false);
          return;
        }

        const result = await window.api.createUser(
          formData.name,
          formData.email,
          formData.password
        );

        clearTimeout(authTimeout);

        if (result.success) {
          // User is automatically logged in after signup, redirect to home
          try {
            await router.push("/home");
          } catch (navError) {
            console.error("[AUTH] Navigation error:", navError);
            window.location.href = "/home";
          }
          return;
        } else {
          setError(getDisplayError(result.error || "Signup failed"));
          setLoading(false);
        }
      }
    } catch (err) {
      clearTimeout(authTimeout);
      console.error("[AUTH] Unexpected error:", err);
      setError("An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>{isLogin ? "Login" : "Sign Up"} - SnapFlow</title>
      </Head>
      <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
        {/* Native drag region */}
        <div
          className="h-11 flex-shrink-0 bg-gray-950"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />

        {/* Auth Content */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
          <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-gray-800">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-2xl mb-3">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-100 mb-1">
                SnapFlow
              </h1>
              <p className="text-gray-400 text-xs">
                {isLogin
                  ? "Welcome back! Please login to continue."
                  : "Create your account to get started."}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm flex items-start">
                <svg
                  className="w-5 h-5 mr-2 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-4 bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg text-sm flex items-start">
                <svg
                  className="w-5 h-5 mr-2 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {!isLogin && (
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-gray-300 mb-1"
                  >
                    Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    required={!isLogin}
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 hover:border-gray-600"
                    placeholder="John Doe"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 hover:border-gray-600"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  required
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 hover:border-gray-600"
                  placeholder="••••••••"
                />
              </div>

              {!isLogin && (
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-300 mb-1"
                  >
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    name="confirmPassword"
                    autoComplete="new-password"
                    required={!isLogin}
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        confirmPassword: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 hover:border-gray-600"
                    placeholder="••••••••"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-800 disabled:opacity-50 text-white font-semibold py-2 rounded-lg transition-all duration-200"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Please wait...
                  </span>
                ) : isLogin ? (
                  "Login"
                ) : (
                  "Create Account"
                )}
              </button>
            </form>

            <div className="my-4 flex items-center">
              <div className="flex-1 border-t border-gray-700"></div>
              <span className="px-3 text-xs text-gray-500">or</span>
              <div className="flex-1 border-t border-gray-700"></div>
            </div>

            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                setError("");

                // Clear any existing timeout
                if (googleSigninTimeoutRef.current) {
                  clearTimeout(googleSigninTimeoutRef.current);
                }

                // Set a 120-second timeout for the OAuth flow
                const timeout = setTimeout(() => {
                  setLoading(false);
                  setError(
                    "Google sign-in timeout. Please close the browser window and try again."
                  );
                }, 120000);

                googleSigninTimeoutRef.current = timeout;

                try {
                  const result = await window.api.googleSignIn();
                  if (!result.success) {
                    clearTimeout(timeout);
                    googleSigninTimeoutRef.current = null;
                    setLoading(false);
                    setError(result.error || "Google sign-in failed");
                  }
                  // The OAuth callback will handle navigation and clear timeout
                } catch (_err) {
                  clearTimeout(timeout);
                  googleSigninTimeoutRef.current = null;
                  setLoading(false);
                  setError("Failed to initiate Google sign-in");
                }
              }}
              className="w-full flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 active:bg-gray-900 text-gray-100 font-semibold py-2 rounded-lg transition-all duration-200"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError("");
                  setSuccess("");
                  setFormData({
                    name: "",
                    email: "",
                    password: "",
                    confirmPassword: "",
                  });
                }}
                className="text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors duration-200"
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Login"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
