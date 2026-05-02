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

    const authTimeout = setTimeout(() => {
      setLoading(false);
      setError("Request timeout. Please check your connection and try again.");
    }, 30000);

    try {
      if (isLogin) {
        const result = await window.api.loginUser(
          formData.email,
          formData.password
        );
        clearTimeout(authTimeout);
        if (result.success) {
          const redirectTo = result.data?.redirectTo || "/home";
          try {
            await router.push(redirectTo);
          } catch {
            window.location.href = redirectTo;
          }
          return;
        } else {
          setError(getDisplayError(result.error || "Login failed"));
          setLoading(false);
        }
      } else {
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
          const redirectTo = result.data?.redirectTo || "/home";
          try {
            await router.push(redirectTo);
          } catch {
            window.location.href = redirectTo;
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

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    if (googleSigninTimeoutRef.current) {
      clearTimeout(googleSigninTimeoutRef.current);
    }
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
    } catch {
      clearTimeout(timeout);
      googleSigninTimeoutRef.current = null;
      setLoading(false);
      setError("Failed to initiate Google sign-in");
    }
  };

  const handleSwitch = () => {
    setIsLogin(!isLogin);
    setError("");
    setSuccess("");
    setFormData({ name: "", email: "", password: "", confirmPassword: "" });
  };

  const inputClass =
    "w-full px-4 py-2.5 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200 hover:border-gray-600 placeholder:text-gray-500 text-sm";

  return (
    <>
      <Head>
        <title>{isLogin ? "Login" : "Sign Up"} - SnapFlow</title>
      </Head>

      <div
        className="w-full overflow-hidden flex flex-col bg-slate-950 pt-8"
        style={{ height: "100vh" }}
      >
        {/* Two-column body */}
        <div className="flex-1 flex overflow-hidden">
          {/* ── Left brand panel ── */}
          <div className="w-[45%] flex-shrink-0 relative overflow-hidden flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border-r border-gray-800/50">
            {/* Decorative background glow */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center text-center px-12 select-none">
              {/* Logo */}
              <div className="w-20 h-20 mb-5">
                <img
                  src="/images/logo.png"
                  alt="SnapFlow"
                  className="w-full h-full object-contain drop-shadow-2xl"
                />
              </div>

              <h1 className="text-3xl font-bold text-gray-100 mb-2 tracking-tight">
                SnapFlow
              </h1>
              <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
                Capture screenshots, collaborate with your team, and sync to
                GitHub and Zoho — all in one place.
              </p>

              {/* Divider */}
              <div className="w-12 h-px bg-gray-700 my-8" />

              {/* Feature list */}
              <div className="flex flex-col gap-4 text-left w-full max-w-[260px]">
                {[
                  {
                    icon: (
                      <svg
                        className="w-4 h-4 text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    ),
                    title: "Screenshot Capture",
                    desc: "Full screen, area, or specific window",
                  },
                  {
                    icon: (
                      <svg
                        className="w-4 h-4 text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    ),
                    title: "Team Workspaces",
                    desc: "Collaborate with roles and permissions",
                  },
                  {
                    icon: (
                      <svg
                        className="w-4 h-4 text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    ),
                    title: "GitHub & Zoho Sync",
                    desc: "Push issues directly to your tools",
                  },
                ].map((feature) => (
                  <div key={feature.title} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {feature.icon}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-200">
                        {feature.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right form panel ── */}
          <div className="flex-1 flex items-center justify-center overflow-hidden bg-slate-950 px-6">
            <div className="w-full max-w-[360px]">
              {/* Form header */}
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-gray-100">
                  {isLogin ? "Welcome back" : "Create your account"}
                </h2>
                <p className="text-sm text-gray-400 mt-1.5">
                  {isLogin
                    ? "Sign in to continue to SnapFlow."
                    : "Get started for free — no credit card required."}
                </p>
              </div>

              {/* Alerts */}
              {error && (
                <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 flex-shrink-0 mt-px"
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
                <div className="mb-5 p-3.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-sm flex items-start gap-2.5">
                  <svg
                    className="w-4 h-4 flex-shrink-0 mt-px"
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

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <div>
                    <label
                      htmlFor="name"
                      className="block text-sm font-medium text-gray-300 mb-1.5"
                    >
                      Full name
                    </label>
                    <input
                      type="text"
                      id="name"
                      required={!isLogin}
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className={inputClass}
                      placeholder="John Doe"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
                  >
                    Email address
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
                    className={inputClass}
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-300 mb-1.5"
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
                    className={inputClass}
                    placeholder="••••••••"
                  />
                </div>

                {!isLogin && (
                  <div>
                    <label
                      htmlFor="confirmPassword"
                      className="block text-sm font-medium text-gray-300 mb-1.5"
                    >
                      Confirm password
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
                      className={inputClass}
                      placeholder="••••••••"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-800 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-all duration-200 text-sm mt-1"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-4 w-4 text-white"
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
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Please wait...
                    </span>
                  ) : isLogin ? (
                    "Sign in"
                  ) : (
                    "Create account"
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 border-t border-gray-800" />
                <span className="text-xs text-gray-600">or continue with</span>
                <div className="flex-1 border-t border-gray-800" />
              </div>

              {/* Google */}
              <button
                type="button"
                disabled={loading}
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 active:bg-gray-900 disabled:opacity-50 text-gray-100 font-medium py-2.5 rounded-lg transition-all duration-200 text-sm border border-gray-700"
              >
                <svg
                  className="w-4 h-4 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Sign in with Google
              </button>

              {/* Switch */}
              <p className="mt-6 text-center text-sm text-gray-500">
                {isLogin
                  ? "Don't have an account?"
                  : "Already have an account?"}{" "}
                <button
                  onClick={handleSwitch}
                  className="text-blue-400 hover:text-blue-300 font-medium transition-colors duration-200"
                >
                  {isLogin ? "Sign up for free" : "Sign in"}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
