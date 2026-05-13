import React, { useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { CenteredLayout } from "../components/layout";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

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
  const githubSigninTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (googleSigninTimeoutRef.current) {
        clearTimeout(googleSigninTimeoutRef.current);
      }
      if (githubSigninTimeoutRef.current) {
        clearTimeout(githubSigninTimeoutRef.current);
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

  const handleGithubSignIn = async () => {
    setLoading(true);
    setError("");
    if (githubSigninTimeoutRef.current) {
      clearTimeout(githubSigninTimeoutRef.current);
    }
    const timeout = setTimeout(() => {
      setLoading(false);
      setError(
        "GitHub sign-in timeout. Please close the browser window and try again."
      );
    }, 120000);
    githubSigninTimeoutRef.current = timeout;
    try {
      const result = await window.api.githubUserSignIn();
      if (!result.success) {
        clearTimeout(timeout);
        githubSigninTimeoutRef.current = null;
        setLoading(false);
        setError(result.error || "GitHub sign-in failed");
      }
    } catch {
      clearTimeout(timeout);
      githubSigninTimeoutRef.current = null;
      setLoading(false);
      setError("Failed to initiate GitHub sign-in");
    }
  };

  const handleSwitch = () => {
    setIsLogin(!isLogin);
    setError("");
    setSuccess("");
    setFormData({ name: "", email: "", password: "", confirmPassword: "" });
  };

  return (
    <>
      <Head>
        <title>{isLogin ? "Login" : "Sign Up"} – SnapFlow</title>
      </Head>

      <CenteredLayout maxWidth="md">
        <div className="mb-5">
          <h1 className="text-h1">
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-caption mt-1">
            {isLogin
              ? "Sign in to continue to SnapFlow."
              : "Get started for free — no credit card required."}
          </p>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/25 text-red-300 rounded-md text-xs flex items-start gap-2">
            <svg
              className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/25 text-green-300 rounded-md text-xs flex items-start gap-2">
            <svg
              className="w-3.5 h-3.5 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isLogin && (
            <Input
              label="Full name"
              id="name"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="John Doe"
            />
          )}
          <Input
            label="Email address"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
            placeholder="john@example.com"
          />
          <Input
            label="Password"
            id="password"
            name="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            required
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            placeholder="••••••••"
          />
          {!isLogin && (
            <Input
              label="Confirm password"
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={formData.confirmPassword}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  confirmPassword: e.target.value,
                })
              }
              placeholder="••••••••"
            />
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            fullWidth
            isLoading={loading}
            className="mt-1"
          >
            {isLogin ? "Sign in" : "Create account"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 border-t border-gray-800" />
          <span className="text-2xs uppercase tracking-wider text-gray-600">
            or continue with
          </span>
          <div className="flex-1 border-t border-gray-800" />
        </div>

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="md"
            fullWidth
            disabled={loading}
            onClick={handleGoogleSignIn}
            leftIcon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            }
          >
            Sign in with Google
          </Button>

          <Button
            type="button"
            variant="outline"
            size="md"
            fullWidth
            disabled={loading}
            onClick={handleGithubSignIn}
            leftIcon={
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
                />
              </svg>
            }
          >
            Sign in with GitHub
          </Button>
        </div>

        <p className="mt-5 text-center text-xs text-gray-500">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={handleSwitch}
            className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            {isLogin ? "Sign up for free" : "Sign in"}
          </button>
        </p>
      </CenteredLayout>
    </>
  );
}
