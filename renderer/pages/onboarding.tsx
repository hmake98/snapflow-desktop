import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import type { Tenant, Workspace, OnboardingStatus } from "../types";
import { CenteredLayout, Section, FormRow } from "../components/layout";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/--+/g, "-");
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isMemberMode, setIsMemberMode] = useState(false);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [connectors, setConnectors] = useState<{ type: string }[]>([]);

  // Step 1: Tenant form
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");

  // Step 2 (invite) removed — invites are managed from Settings

  // Step 3: Workspace form
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");

  // Step 4: Connectors
  // GitHub OAuth state
  type GitHubOAuthStage = "idle" | "waiting" | "selecting" | "saving";
  interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
  }
  interface GitHubUser {
    login: string;
    name?: string;
    avatar_url?: string;
  }
  const [githubOAuthStage, setGitHubOAuthStage] =
    useState<GitHubOAuthStage>("idle");
  const [_githubUser, setGitHubUser] = useState<GitHubUser | null>(null);
  const [githubRepos, setGitHubRepos] = useState<GitHubRepo[]>([]);
  const [githubSelectedRepoId, setGitHubSelectedRepoId] = useState(0);
  const [_githubSelectedRepoName, setGitHubSelectedRepoName] = useState("");
  const [githubSelectedRepoFullName, setGitHubSelectedRepoFullName] =
    useState("");
  const [githubConnectorName, setGitHubConnectorName] = useState("");
  const [githubOAuthError, setGitHubOAuthError] = useState("");

  // Zoho OAuth state
  type ZohoOAuthStage = "idle" | "waiting" | "selecting" | "saving";
  interface ZohoPortal {
    id: string;
    name: string;
  }
  interface ZohoProject {
    id_string: string;
    name: string;
  }
  const [zohoOAuthStage, setZohoOAuthStage] = useState<ZohoOAuthStage>("idle");
  const [zohoPortals, setZohoPortals] = useState<ZohoPortal[]>([]);
  const [zohoProjects, setZohoProjects] = useState<ZohoProject[]>([]);
  const [zohoSelectedPortalId, setZohoSelectedPortalId] = useState("");
  const [zohoSelectedPortalName, setZohoSelectedPortalName] = useState("");
  const [zohoSelectedProjectId, setZohoSelectedProjectId] = useState("");
  const [zohoSelectedProjectName, setZohoSelectedProjectName] = useState("");
  const [zohoConnectorName, setZohoConnectorName] = useState("");
  const [zohoOAuthError, setZohoOAuthError] = useState("");

  const [connectedTypes, setConnectedTypes] = useState<Set<string>>(new Set());

  // Helper to update step and persist to DB
  async function updateStep(newStep: number) {
    setStep(newStep);
    try {
      await window.api.setOnboardingStep(newStep);
    } catch (err) {
      console.error("Error persisting onboarding step:", err);
    }
  }

  // Load initial onboarding status
  useEffect(() => {
    async function loadStatus() {
      try {
        // Check for member mode from query param or status
        const queryMode = router.query.mode as string;
        const result = await window.api.getOnboardingStatus();
        if (!result.success) {
          setError("Failed to load onboarding status");
          setLoading(false);
          return;
        }

        const status = result.data as OnboardingStatus;

        // If already complete, go to home
        if (status.isComplete) {
          router.push("/home");
          return;
        }

        // Detect member mode from query param or status.userType
        const isMember = queryMode === "member" || status.userType === "member";
        setIsMemberMode(isMember);

        // For member mode, start at step 4 (connectors)
        // Step 2 (invite) has been removed; skip over it if persisted
        let initialStep = isMember ? 4 : status.currentStep;
        if (initialStep === 2) initialStep = 3;
        setStep(initialStep);
        setTenant(status.tenant || null);
        setWorkspace(status.workspace || null);
        setLoading(false);
      } catch (err) {
        console.error("Error loading onboarding status:", err);
        setError("Failed to load onboarding");
        setLoading(false);
      }
    }

    if (router.isReady) {
      loadStatus();
    }
  }, [router.isReady, router.query.mode]);

  // Listen for Zoho OAuth success
  useEffect(() => {
    const unsubscribe = window.api.onZohoOAuthSuccess(async () => {
      try {
        const result = await window.api.getZohoPortals();
        if (result.success) {
          setZohoPortals(result.data || []);
          setZohoOAuthStage("selecting");
          setZohoOAuthError("");
        } else {
          setZohoOAuthError(result.error || "Failed to fetch portals");
          setZohoOAuthStage("idle");
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        setZohoOAuthError(msg);
        setZohoOAuthStage("idle");
      }
    });
    return unsubscribe;
  }, []);

  // Listen for Zoho OAuth error
  useEffect(() => {
    const unsubscribe = window.api.onZohoOAuthError((error: string) => {
      setZohoOAuthError(error);
      setZohoOAuthStage("idle");
    });
    return unsubscribe;
  }, []);

  // Listen for GitHub OAuth success
  useEffect(() => {
    const unsubscribe = window.api.onGitHubOAuthSuccess(async () => {
      try {
        const userResult = await window.api.getGitHubUser();
        const reposResult = await window.api.getGitHubRepositories();

        if (userResult.success && reposResult.success) {
          setGitHubUser(userResult.data || null);
          setGitHubRepos(reposResult.data || []);
          setGitHubOAuthStage("selecting");
          setGitHubOAuthError("");
        } else {
          setGitHubOAuthError(
            userResult.error || reposResult.error || "Failed to fetch data"
          );
          setGitHubOAuthStage("idle");
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        setGitHubOAuthError(msg);
        setGitHubOAuthStage("idle");
      }
    });
    return unsubscribe;
  }, []);

  // Listen for GitHub OAuth error
  useEffect(() => {
    const unsubscribe = window.api.onGitHubOAuthError((error: string) => {
      setGitHubOAuthError(error);
      setGitHubOAuthStage("idle");
    });
    return unsubscribe;
  }, []);

  // Handle tenant creation
  async function handleCreateTenant() {
    if (!tenantName.trim()) {
      setError("Organization name is required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const _slug = slugify(tenantName);
      const result = await window.api.createTenant(tenantName, "");

      if (!result.success) {
        setError(result.error || "Failed to create organization");
        setSaving(false);
        return;
      }

      const newTenant = result.data as Tenant;
      setTenant(newTenant);
      window.api.showNotification(
        "Organization Created",
        "Organization created successfully!"
      );
      // Proceed to step 3 (create workspace) — invite step removed
      await updateStep(3);
    } catch (err) {
      console.error("Error creating tenant:", err);
      setError("Failed to create organization");
    } finally {
      setSaving(false);
    }
  }

  // Handle workspace creation
  async function handleCreateWorkspace() {
    if (!workspaceName.trim()) {
      setError("Workspace name is required");
      return;
    }

    if (!tenant) {
      setError("Tenant not set");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const result = await window.api.createWorkspace(
        tenant.id,
        workspaceName,
        ""
      );

      if (!result.success) {
        setError(result.error || "Failed to create workspace");
        setSaving(false);
        return;
      }

      const newWorkspace = result.data as Workspace;
      setWorkspace(newWorkspace);
      // Set as the active workspace so the main process has the correct context
      // before the user reaches the connectors step or /home.
      await window.api.setActiveWorkspace(newWorkspace.id);
      window.api.showNotification(
        "Workspace Created",
        "Workspace created successfully!"
      );

      await updateStep(4);
    } catch (err) {
      console.error("Error creating workspace:", err);
      setError("Failed to create workspace");
    } finally {
      setSaving(false);
    }
  }

  // Handle GitHub OAuth Sign In
  async function handleGitHubSignIn() {
    setGitHubOAuthStage("waiting");
    setGitHubOAuthError("");

    try {
      const result = await window.api.githubSignIn();
      if (!result.success) {
        setGitHubOAuthError(result.error || "Failed to start OAuth");
        setGitHubOAuthStage("idle");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("Error starting GitHub OAuth:", error);
      setGitHubOAuthError(msg);
      setGitHubOAuthStage("idle");
    }
  }

  // Handle GitHub repository selection
  function handleGitHubRepoSelect(
    repoId: number,
    repoName: string,
    repoFullName: string
  ) {
    setGitHubSelectedRepoId(repoId);
    setGitHubSelectedRepoName(repoName);
    setGitHubSelectedRepoFullName(repoFullName);
  }

  // Handle cancel GitHub OAuth
  function handleGitHubCancelOAuth() {
    setGitHubOAuthStage("idle");
    setGitHubUser(null);
    setGitHubRepos([]);
    setGitHubSelectedRepoId(0);
    setGitHubSelectedRepoName("");
    setGitHubSelectedRepoFullName("");
    setGitHubConnectorName("");
    setGitHubOAuthError("");
  }

  // Handle Zoho OAuth Sign In
  async function handleZohoSignIn() {
    setZohoOAuthStage("waiting");
    setZohoOAuthError("");

    try {
      const result = await window.api.zohoSignIn();
      if (!result.success) {
        setZohoOAuthError(result.error || "Failed to start OAuth");
        setZohoOAuthStage("idle");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("Error starting Zoho OAuth:", error);
      setZohoOAuthError(msg);
      setZohoOAuthStage("idle");
    }
  }

  // Handle Zoho portal selection
  async function handleZohoPortalSelect(portalId: string, portalName: string) {
    setZohoSelectedPortalId(portalId);
    setZohoSelectedPortalName(portalName);
    setZohoSelectedProjectId("");
    setZohoSelectedProjectName("");

    try {
      const result = await window.api.getZohoProjects(portalId);
      if (result.success) {
        setZohoProjects(result.data || []);
      } else {
        setZohoOAuthError(result.error || "Failed to fetch projects");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("Error fetching projects:", error);
      setZohoOAuthError(msg);
    }
  }

  // Handle Zoho project selection
  function handleZohoProjectSelect(projectId: string, projectName: string) {
    setZohoSelectedProjectId(projectId);
    setZohoSelectedProjectName(projectName);
  }

  // Handle cancel Zoho OAuth
  function handleZohoCancelOAuth() {
    setZohoOAuthStage("idle");
    setZohoPortals([]);
    setZohoProjects([]);
    setZohoSelectedPortalId("");
    setZohoSelectedPortalName("");
    setZohoSelectedProjectId("");
    setZohoSelectedProjectName("");
    setZohoConnectorName("");
    setZohoOAuthError("");
  }

  // Handle adding GitHub connector via OAuth
  async function handleAddGitHubConnector() {
    if (!githubSelectedRepoId) {
      setGitHubOAuthError("Please select a repository");
      return;
    }

    setGitHubOAuthStage("saving");
    setGitHubOAuthError("");

    try {
      // Get the access token from the main process (fallback to empty if not available)
      let accessToken = "";
      try {
        const tokenResult = await window.api.getGitHubAccessToken?.();
        if (tokenResult?.success && tokenResult?.accessToken) {
          accessToken = tokenResult.accessToken;
        }
      } catch (_tokenError) {
        // Continue anyway - the token will be applied from pendingGitHubTokens in the IPC handler
      }

      const [owner, repo] = githubSelectedRepoFullName.split("/");
      const connectorName =
        githubConnectorName || `GitHub (${githubSelectedRepoFullName})`;

      const result = await window.api.addConnector(workspace?.id || "", {
        name: connectorName,
        type: "github",
        enabled: true,
        config: {
          accessToken,
          owner,
          repo,
        },
      });

      if (!result.success) {
        setGitHubOAuthError(result.error || "Failed to add GitHub connector");
        setGitHubOAuthStage("selecting");
        return;
      }

      setConnectedTypes((prev) => new Set(Array.from(prev).concat("github")));
      setConnectors([...connectors, { type: "github" }]);
      window.api.showNotification(
        "GitHub Connected",
        "GitHub connector added successfully!"
      );

      // Reset the form
      handleGitHubCancelOAuth();
    } catch (err) {
      console.error("Error adding GitHub connector:", err);
      setGitHubOAuthError("Failed to add GitHub connector");
      setGitHubOAuthStage("selecting");
    }
  }

  // Handle adding Zoho connector via OAuth
  async function handleAddZohoConnector() {
    if (!zohoSelectedPortalId || !zohoSelectedProjectId) {
      setZohoOAuthError("Please select both portal and project");
      return;
    }

    setZohoOAuthStage("saving");
    setZohoOAuthError("");

    try {
      // Get the Zoho tokens from the main process (fallback to empty if not available)
      let accessToken = "";
      let refreshToken = "";
      let apiDomain = "";
      try {
        const tokenResult = await window.api.getZohoAccessToken?.();
        if (tokenResult?.success) {
          accessToken = tokenResult.accessToken || "";
          refreshToken = tokenResult.refreshToken || "";
          apiDomain = tokenResult.apiDomain || "";
        }
      } catch (_tokenError) {
        // Continue anyway - the tokens will be applied from pendingZohoTokens in the IPC handler
      }

      const connectorName =
        zohoConnectorName ||
        `Zoho (${zohoSelectedPortalName} / ${zohoSelectedProjectName})`;

      const result = await window.api.addConnector(workspace?.id || "", {
        name: connectorName,
        type: "zoho",
        enabled: true,
        config: {
          accessToken,
          refreshToken,
          clientId: "",
          clientSecret: "",
          portalId: zohoSelectedPortalId,
          projectId: zohoSelectedProjectId,
          apiDomain,
        },
      });

      if (!result.success) {
        setZohoOAuthError(result.error || "Failed to add Zoho connector");
        setZohoOAuthStage("selecting");
        return;
      }

      setConnectedTypes((prev) => new Set(Array.from(prev).concat("zoho")));
      setConnectors([...connectors, { type: "zoho" }]);
      window.api.showNotification(
        "Zoho Connected",
        "Zoho connector added successfully!"
      );

      // Reset the form
      handleZohoCancelOAuth();
    } catch (err) {
      console.error("Error adding Zoho connector:", err);
      setZohoOAuthError("Failed to add Zoho connector");
      setZohoOAuthStage("selecting");
    }
  }

  // Handle completing onboarding
  async function handleComplete() {
    // Connectors are optional - can complete without any
    setSaving(true);
    setError("");

    try {
      const result = await window.api.completeOnboarding();
      if (!result.success) {
        setError(result.error || "Failed to complete onboarding");
        return;
      }

      await router.push("/home");
    } catch (err) {
      console.error("Error completing onboarding:", err);
      setError("Failed to complete onboarding");
    } finally {
      setSaving(false);
    }
  }

  // Handle skip connectors (go to home but incomplete)
  async function _handleSkipConnectors() {
    // Can skip connectors for now
    window.api.showNotification(
      "Connectors Skipped",
      "You can add connectors later in settings. Some features may be unavailable."
    );
    router.push("/home");
  }

  if (loading) {
    return (
      <>
        <Head>
          <title>SnapFlow – Onboarding</title>
        </Head>
        <CenteredLayout maxWidth="2xl" card={false}>
          <div className="text-center mb-6 space-y-2">
            <Skeleton className="h-7 w-72 mx-auto" />
            <Skeleton className="h-4 w-56 mx-auto" />
          </div>
          <div className="flex justify-between mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex flex-col items-center flex-1">
                <Skeleton className="w-8 h-8 rounded-full" />
                <Skeleton className="h-3 w-12 mt-1.5" />
              </div>
            ))}
          </div>
          <div className="card p-5 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-80" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </CenteredLayout>
      </>
    );
  }

  const stepList = isMemberMode ? [4, 5] : [1, 3, 4, 5];

  return (
    <>
      <Head>
        <title>SnapFlow – Onboarding</title>
      </Head>
      <CenteredLayout maxWidth="2xl" card={false}>
        <div className="text-center mb-6">
          <h1 className="text-display">
            {isMemberMode ? "Almost ready" : "Welcome to SnapFlow"}
          </h1>
          <p className="text-muted mt-1">
            {isMemberMode
              ? "Let's connect your tools"
              : "Let's set up your workspace in a few steps"}
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between mb-6">
          {stepList.map((s, idx) => {
            const displayNum = idx + 1;
            const isDone = step > s;
            const isActive = step === s;
            const label = isMemberMode
              ? s === 4
                ? "Connectors"
                : "Done"
              : s === 1
                ? "Organization"
                : s === 3
                  ? "Workspace"
                  : s === 4
                    ? "Connectors"
                    : "Done";
            return (
              <React.Fragment key={s}>
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                      isDone
                        ? "bg-blue-600 text-white"
                        : isActive
                          ? "bg-blue-600 text-white ring-2 ring-blue-500/30"
                          : "bg-gray-800 text-gray-500 border border-gray-700"
                    }`}
                  >
                    {isDone ? "✓" : displayNum}
                  </div>
                  <div
                    className={`text-2xs mt-1.5 font-medium ${
                      isDone || isActive ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {label}
                  </div>
                </div>
                {idx < stepList.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-2 ${
                      step > stepList[idx] ? "bg-blue-600" : "bg-gray-800"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Top nav (back / next) */}
        {step !== 5 && (
          <div className="flex justify-between items-center mb-4">
            {!isMemberMode ? (
              <Button
                onClick={() => {
                  const prev = step === 3 ? 1 : Math.max(1, step - 1);
                  updateStep(prev);
                }}
                variant="ghost"
                size="sm"
                disabled={step === 1}
              >
                ← Back
              </Button>
            ) : (
              <span />
            )}
            <span className="text-caption">
              {isMemberMode
                ? `Step ${step === 4 ? 1 : 2} of 2`
                : `Step ${step === 1 ? 1 : step === 3 ? 2 : 3} of 3`}
            </span>
            <Button
              onClick={() => {
                const next = step === 1 ? 3 : Math.min(5, step + 1);
                updateStep(next);
              }}
              variant="ghost"
              size="sm"
              disabled={
                isMemberMode
                  ? step === 5
                  : step === 4 ||
                    (step === 1 && !tenant) ||
                    (step === 3 && !workspace)
              }
            >
              Next →
            </Button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/25 text-red-300 rounded-md text-xs">
            {error}
          </div>
        )}

        {/* Step 1: Create Organization */}
        {step === 1 && !isMemberMode && (
          <Section
            title="Create your organization"
            description="An organization groups your team and workspaces."
          >
            <div className="space-y-3">
              <FormRow label="Organization name" htmlFor="tenantName" required>
                <Input
                  id="tenantName"
                  value={tenantName}
                  onChange={(e) => {
                    setTenantName(e.target.value);
                    setTenantSlug(slugify(e.target.value));
                  }}
                  placeholder="Acme Corp"
                />
              </FormRow>
              {tenantSlug && (
                <p className="text-caption">
                  Slug:{" "}
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">
                    {tenantSlug}
                  </code>
                </p>
              )}
              <Button
                onClick={handleCreateTenant}
                disabled={!tenantName.trim()}
                isLoading={saving}
                fullWidth
              >
                Continue
              </Button>
            </div>
          </Section>
        )}

        {/* Step 3: Create Workspace */}
        {step === 3 && !isMemberMode && (
          <Section
            title="Create a workspace"
            description="A workspace is a project within your organization."
          >
            <div className="space-y-3">
              <FormRow label="Workspace name" htmlFor="workspaceName" required>
                <Input
                  id="workspaceName"
                  value={workspaceName}
                  onChange={(e) => {
                    setWorkspaceName(e.target.value);
                    setWorkspaceSlug(slugify(e.target.value));
                  }}
                  placeholder="Web Application Project"
                />
              </FormRow>
              {workspaceSlug && (
                <p className="text-caption">
                  Slug:{" "}
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">
                    {workspaceSlug}
                  </code>
                </p>
              )}
              <Button
                onClick={handleCreateWorkspace}
                disabled={!workspaceName.trim()}
                isLoading={saving}
                fullWidth
              >
                Create workspace
              </Button>
            </div>
          </Section>
        )}

        {/* Step 4: Add Connectors */}
        {step === 4 && (
          <Section
            title="Connect your tools"
            description="Optional — add connectors to sync snaps, or set them up later in Settings."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {/* GitHub */}
              <div className="card-flat p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-h3">GitHub</h3>
                    {!connectedTypes.has("github") && (
                      <Badge variant="gray">Optional</Badge>
                    )}
                  </div>
                  {connectedTypes.has("github") && (
                    <Badge variant="success">Connected</Badge>
                  )}
                </div>

                {connectedTypes.has("github") ? (
                  <p className="text-caption">{githubSelectedRepoFullName}</p>
                ) : githubOAuthStage === "idle" ? (
                  <div className="space-y-3">
                    <p className="text-caption">
                      Sign in with GitHub to connect a repository.
                    </p>
                    <Button
                      onClick={handleGitHubSignIn}
                      variant="primary"
                      size="sm"
                      fullWidth
                    >
                      Sign in with GitHub
                    </Button>
                  </div>
                ) : githubOAuthStage === "waiting" ? (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-5 h-5 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    <div className="text-center">
                      <p className="text-sm text-gray-100 font-medium">
                        Authorizing…
                      </p>
                      <p className="text-caption mt-0.5">
                        Complete authorization in your browser
                      </p>
                    </div>
                    <Button
                      onClick={handleGitHubCancelOAuth}
                      variant="ghost"
                      size="xs"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : githubOAuthStage === "selecting" ||
                  githubOAuthStage === "saving" ? (
                  <div className="space-y-3">
                    <FormRow label="Repository" required>
                      <select
                        value={githubSelectedRepoId}
                        onChange={(e) => {
                          const repo = githubRepos.find(
                            (r) => r.id === parseInt(e.target.value)
                          );
                          if (repo) {
                            handleGitHubRepoSelect(
                              repo.id,
                              repo.name,
                              repo.full_name
                            );
                          }
                        }}
                        className="input"
                      >
                        <option value="">Choose a repository…</option>
                        {githubRepos.map((repo) => (
                          <option key={repo.id} value={repo.id}>
                            {repo.full_name}
                          </option>
                        ))}
                      </select>
                    </FormRow>
                    {githubOAuthError && (
                      <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-md px-2 py-1.5">
                        {githubOAuthError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={handleGitHubCancelOAuth}
                        variant="ghost"
                        size="sm"
                        fullWidth
                        disabled={githubOAuthStage === "saving"}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddGitHubConnector}
                        disabled={!githubSelectedRepoId}
                        isLoading={githubOAuthStage === "saving"}
                        size="sm"
                        fullWidth
                      >
                        Connect
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Zoho */}
              <div className="card-flat p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-h3">Zoho Projects</h3>
                    {!connectedTypes.has("zoho") && (
                      <Badge variant="gray">Optional</Badge>
                    )}
                  </div>
                  {connectedTypes.has("zoho") && (
                    <Badge variant="success">Connected</Badge>
                  )}
                </div>

                {connectedTypes.has("zoho") ? (
                  <p className="text-caption">
                    {zohoSelectedPortalName} / {zohoSelectedProjectName}
                  </p>
                ) : zohoOAuthStage === "idle" ? (
                  <div className="space-y-3">
                    <p className="text-caption">
                      Sign in with Zoho to connect a project.
                    </p>
                    <Button
                      onClick={handleZohoSignIn}
                      variant="primary"
                      size="sm"
                      fullWidth
                    >
                      Sign in with Zoho
                    </Button>
                  </div>
                ) : zohoOAuthStage === "waiting" ? (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-5 h-5 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin" />
                    <div className="text-center">
                      <p className="text-sm text-gray-100 font-medium">
                        Authorizing…
                      </p>
                      <p className="text-caption mt-0.5">
                        Complete authorization in your browser
                      </p>
                    </div>
                    <Button
                      onClick={handleZohoCancelOAuth}
                      variant="ghost"
                      size="xs"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : zohoOAuthStage === "selecting" ||
                  zohoOAuthStage === "saving" ? (
                  <div className="space-y-3">
                    <FormRow label="Portal" required>
                      <select
                        value={zohoSelectedPortalId}
                        onChange={(e) => {
                          const portal = zohoPortals.find(
                            (p) => p.id === e.target.value
                          );
                          if (portal) {
                            handleZohoPortalSelect(portal.id, portal.name);
                          }
                        }}
                        className="input"
                      >
                        <option value="">Choose a portal…</option>
                        {zohoPortals.map((portal) => (
                          <option key={portal.id} value={portal.id}>
                            {portal.name}
                          </option>
                        ))}
                      </select>
                    </FormRow>

                    {zohoSelectedPortalId && (
                      <FormRow label="Project" required>
                        <select
                          value={zohoSelectedProjectId}
                          onChange={(e) => {
                            const project = zohoProjects.find(
                              (p) => p.id_string === e.target.value
                            );
                            if (project) {
                              handleZohoProjectSelect(
                                project.id_string,
                                project.name
                              );
                            }
                          }}
                          className="input"
                        >
                          <option value="">Choose a project…</option>
                          {zohoProjects.map((project) => (
                            <option
                              key={project.id_string}
                              value={project.id_string}
                            >
                              {project.name}
                            </option>
                          ))}
                        </select>
                      </FormRow>
                    )}

                    {zohoOAuthError && (
                      <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-md px-2 py-1.5">
                        {zohoOAuthError}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        onClick={handleZohoCancelOAuth}
                        variant="ghost"
                        size="sm"
                        fullWidth
                        disabled={zohoOAuthStage === "saving"}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAddZohoConnector}
                        disabled={
                          !zohoSelectedPortalId || !zohoSelectedProjectId
                        }
                        isLoading={zohoOAuthStage === "saving"}
                        size="sm"
                        fullWidth
                      >
                        Connect
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <Button
              onClick={handleComplete}
              isLoading={saving}
              fullWidth
              size="md"
            >
              {connectors.length > 0
                ? "Continue to SnapFlow"
                : "Continue without connectors"}
            </Button>
          </Section>
        )}

        {/* Step 5: Completion */}
        {step === 5 && (
          <Section>
            <div className="text-center py-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 border border-green-500/30 mb-3">
                <svg
                  className="w-6 h-6 text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-h1">All set!</h2>
              <p className="text-muted mt-1.5 mb-5">
                Your workspace is ready. Let's start capturing.
              </p>
              <Button onClick={() => router.push("/home")} fullWidth size="md">
                Go to SnapFlow
              </Button>
            </div>
          </Section>
        )}
      </CenteredLayout>
    </>
  );
}
