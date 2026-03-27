import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import type { Tenant, Workspace, OnboardingStatus, UserRole } from "../types";
import { Button } from "../components/ui/Button";

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

  // Step 2: Invite form
  const [invites, setInvites] = useState<
    Array<{ id: string; email: string; role: Exclude<UserRole, "owner"> }>
  >([]);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newInviteRole, setNewInviteRole] =
    useState<Exclude<UserRole, "owner">>("dev");
  const [invitesSending, setInvitesSending] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

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

  const [connectorAddedType, setConnectorAddedType] = useState<string>("");

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
        const initialStep = isMember ? 4 : status.currentStep;
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
      console.log("[Onboarding] Zoho OAuth success");
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
      console.log("[Onboarding] Zoho OAuth error:", error);
      setZohoOAuthError(error);
      setZohoOAuthStage("idle");
    });
    return unsubscribe;
  }, []);

  // Listen for GitHub OAuth success
  useEffect(() => {
    const unsubscribe = window.api.onGitHubOAuthSuccess(async () => {
      console.log("[Onboarding] GitHub OAuth success");
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
      console.log("[Onboarding] GitHub OAuth error:", error);
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
      // Proceed to step 2 (invite team)
      await updateStep(2);
    } catch (err) {
      console.error("Error creating tenant:", err);
      setError("Failed to create organization");
    } finally {
      setSaving(false);
    }
  }

  // Handle adding invite row
  function handleAddInvite() {
    setInvites([
      ...invites,
      { id: Date.now().toString(), email: "", role: "dev" },
    ]);
  }

  // Handle removing invite row
  function handleRemoveInvite(id: string) {
    setInvites(invites.filter((inv) => inv.id !== id));
  }

  // Handle proceeding to next step (invites will be sent after workspace creation)
  async function handleProceedFromInvites() {
    await updateStep(3);
  }

  // Handle sending invites (called from handleCreateWorkspace after workspace is created)
  async function sendQueuedInvites(workspaceId: string) {
    if (invites.length === 0) {
      return; // Nothing to send
    }

    const validInvites = invites.filter((inv) => inv.email.trim());
    if (validInvites.length === 0) {
      return; // No valid emails
    }

    setInvitesSending(true);

    let successCount = 0;
    let failureCount = 0;

    for (const invite of validInvites) {
      try {
        const result = await window.api.inviteTeamMember(
          workspaceId,
          invite.email,
          invite.role
        );

        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (err) {
        failureCount++;
        console.error("Error inviting member:", err);
      }
    }

    setInvitesSending(false);

    if (failureCount > 0) {
      window.api.showNotification(
        "Invites Partially Sent",
        `Sent ${successCount} invite(s), ${failureCount} failed. You can retry from Settings.`
      );
    } else if (successCount > 0) {
      window.api.showNotification(
        "Invites Sent",
        `Sent ${successCount} invite(s) successfully!`
      );
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
      window.api.showNotification(
        "Workspace Created",
        "Workspace created successfully!"
      );

      // Send any queued invites for this workspace
      if (invites.length > 0) {
        await sendQueuedInvites(newWorkspace.id);
      }

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
    console.log("[Onboarding] Starting GitHub OAuth");
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
    console.log("[Onboarding] Repo selected:", repoId, repoFullName);
    setGitHubSelectedRepoId(repoId);
    setGitHubSelectedRepoName(repoName);
    setGitHubSelectedRepoFullName(repoFullName);
  }

  // Handle cancel GitHub OAuth
  function handleGitHubCancelOAuth() {
    console.log("[Onboarding] Canceling GitHub OAuth");
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
    console.log("[Onboarding] Starting Zoho OAuth");
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
    console.log("[Onboarding] Portal selected:", portalId, portalName);
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
    console.log("[Onboarding] Project selected:", projectId, projectName);
    setZohoSelectedProjectId(projectId);
    setZohoSelectedProjectName(projectName);
  }

  // Handle cancel Zoho OAuth
  function handleZohoCancelOAuth() {
    console.log("[Onboarding] Canceling Zoho OAuth");
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

      setConnectorAddedType("github");
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

      setConnectorAddedType("zoho");
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
    router.push("/home");
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
      <div className="h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-300">Loading onboarding...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>SnapFlow - Onboarding</title>
      </Head>
      <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
        {/* Native drag region */}
        <div
          className="h-11 flex-shrink-0 bg-gray-950"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto py-12 px-4">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-4xl font-bold text-gray-100 mb-2">
                {isMemberMode ? "Almost Ready" : "Welcome to SnapFlow"}
              </h1>
              <p className="text-gray-400">
                {isMemberMode
                  ? "Let's connect your tools"
                  : "Let's set up your workspace in a few steps"}
              </p>
            </div>

            {/* Step Indicator */}
            <div className="flex justify-between mb-8">
              {(isMemberMode ? [4, 5] : [1, 2, 3, 4, 5]).map((s, idx) => {
                // Map visible index (1-based) to display number
                const displayNum = idx + 1;
                // A visible step is "done" if the actual step has passed it
                const isDone = step > s;
                const isActive = step === s;
                const label = isMemberMode
                  ? s === 4
                    ? "Connectors"
                    : "Done"
                  : s === 1
                    ? "Org"
                    : s === 2
                      ? "Team"
                      : s === 3
                        ? "Workspace"
                        : s === 4
                          ? "Connectors"
                          : "Done";
                return (
                  <div key={s} className="flex flex-col items-center flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                        isDone || isActive
                          ? "bg-blue-600 text-white"
                          : "bg-gray-800 text-gray-500"
                      }`}
                    >
                      {isDone ? "✓" : displayNum}
                    </div>
                    <div
                      className={`text-xs mt-2 ${
                        isDone || isActive ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Navigation Header */}
            {step !== 5 && (
              <div className="flex justify-between items-center mb-8">
                {!isMemberMode && (
                  <Button
                    onClick={() => {
                      const prev = Math.max(1, step - 1);
                      updateStep(prev);
                    }}
                    variant="outline"
                    size="sm"
                    disabled={step === 1}
                  >
                    ← Back
                  </Button>
                )}
                <span className="text-sm text-gray-400 flex-1 text-center">
                  {isMemberMode
                    ? `Step ${step === 4 ? 1 : 2} of 2`
                    : `Step ${step === 1 ? 1 : step === 2 ? 2 : step === 3 ? 3 : 4} of 5`}
                </span>
                <Button
                  onClick={() => {
                    const next = Math.min(isMemberMode ? 5 : 5, step + 1);
                    updateStep(next);
                  }}
                  variant="outline"
                  size="sm"
                  disabled={isMemberMode ? step === 5 : step === 4}
                >
                  Next →
                </Button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Step 1: Create Organization (owner mode only) */}
            {step === 1 && !isMemberMode && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-800">
                <h2 className="text-2xl font-bold text-gray-100 mb-6">
                  Create Your Organization
                </h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Organization Name
                    </label>
                    <input
                      type="text"
                      value={tenantName}
                      onChange={(e) => {
                        setTenantName(e.target.value);
                        setTenantSlug(slugify(e.target.value));
                      }}
                      placeholder="Acme Corp"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  {tenantSlug && (
                    <div className="text-sm text-gray-400">
                      Slug:{" "}
                      <code className="bg-gray-800 px-2 py-1 rounded">
                        {tenantSlug}
                      </code>
                    </div>
                  )}
                  <Button
                    onClick={handleCreateTenant}
                    disabled={saving || !tenantName.trim()}
                    className="w-full"
                  >
                    {saving ? "Creating..." : "Next"}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Invite Team (owner mode only) */}
            {step === 2 && !isMemberMode && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-800">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-100">
                    Invite Your Team
                  </h2>
                  <span className="text-xs font-medium text-gray-500 bg-gray-800 px-2 py-1 rounded">
                    Optional
                  </span>
                </div>
                <p className="text-gray-400 mb-6">
                  Add team members now, or do it later from Settings
                </p>

                {/* Invite list */}
                {invites.length > 0 && (
                  <div className="mb-6 space-y-2">
                    {invites.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-300 truncate">
                            {invite.email || "(empty)"}
                          </p>
                          <p className="text-xs text-gray-500 capitalize">
                            {invite.role}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveInvite(invite.id)}
                          className="text-gray-500 hover:text-gray-300 text-sm font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add invite form */}
                {showInviteForm && (
                  <div className="space-y-3 mb-6 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        placeholder="team@example.com"
                        value={newInviteEmail}
                        onChange={(e) => setNewInviteEmail(e.target.value)}
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Role
                      </label>
                      <select
                        value={newInviteRole}
                        onChange={(e) =>
                          setNewInviteRole(
                            e.target.value as Exclude<UserRole, "owner">
                          )
                        }
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                      >
                        <option value="dev">Developer</option>
                        <option value="qa">QA</option>
                        <option value="pm">Product Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          if (newInviteEmail.trim()) {
                            handleAddInvite();
                            setNewInviteEmail("");
                            setNewInviteRole(
                              "dev" as Exclude<UserRole, "owner">
                            );
                          }
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
                        disabled={!newInviteEmail.trim()}
                      >
                        Add Invite
                      </Button>
                      <Button
                        onClick={() => setShowInviteForm(false)}
                        variant="outline"
                        className="flex-1"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-3">
                  {!showInviteForm && (
                    <Button
                      onClick={() => setShowInviteForm(true)}
                      variant="outline"
                      className="flex-1"
                    >
                      + Add Member
                    </Button>
                  )}
                  <Button
                    onClick={handleProceedFromInvites}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white"
                    disabled={invitesSending}
                  >
                    {invites.length === 0 ? "Skip for Now" : "Continue"}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Create Workspace (owner mode only) */}
            {step === 3 && !isMemberMode && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-800">
                <h2 className="text-2xl font-bold text-gray-100 mb-2">
                  Create a Workspace
                </h2>
                <p className="text-gray-400 mb-6">
                  A workspace is a project within your organization
                </p>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Workspace Name
                    </label>
                    <input
                      type="text"
                      value={workspaceName}
                      onChange={(e) => {
                        setWorkspaceName(e.target.value);
                        setWorkspaceSlug(slugify(e.target.value));
                      }}
                      placeholder="Web Application Project"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                  {workspaceSlug && (
                    <div className="text-sm text-gray-400">
                      Slug:{" "}
                      <code className="bg-gray-800 px-2 py-1 rounded">
                        {workspaceSlug}
                      </code>
                    </div>
                  )}
                  <Button
                    onClick={handleCreateWorkspace}
                    disabled={saving || !workspaceName.trim()}
                    className="w-full"
                  >
                    {saving ? "Creating..." : "Create Workspace"}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Add Connectors */}
            {step === 4 && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-800">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-2xl font-bold text-gray-100">
                    Connect Your Tools
                  </h2>
                </div>
                <p className="text-gray-400 text-sm mb-6">
                  Optional – add connectors to sync screenshots, or set them up
                  later in Settings
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* GitHub Card */}
                  <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-100">GitHub</h3>
                        {connectorAddedType !== "github" && (
                          <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded">
                            Optional
                          </span>
                        )}
                      </div>
                      {connectorAddedType === "github" && (
                        <span className="text-green-400 text-lg">✓</span>
                      )}
                    </div>

                    {connectorAddedType === "github" ? (
                      <div className="text-green-400 text-sm">
                        Connected: {githubSelectedRepoFullName}
                      </div>
                    ) : githubOAuthStage === "idle" ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-400 mb-4">
                          Sign in with your GitHub account to connect a
                          repository.
                        </p>
                        <Button
                          onClick={handleGitHubSignIn}
                          className="w-full py-2 text-sm"
                          variant="primary"
                        >
                          Sign In with GitHub
                        </Button>
                      </div>
                    ) : githubOAuthStage === "waiting" ? (
                      <div className="flex flex-col items-center space-y-4">
                        <div className="relative">
                          <div className="w-6 h-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-100 font-medium">
                            Authorizing with GitHub...
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Complete the authorization in your browser
                          </p>
                        </div>
                        <Button
                          onClick={handleGitHubCancelOAuth}
                          variant="outline"
                          size="sm"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : githubOAuthStage === "selecting" ||
                      githubOAuthStage === "saving" ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-200 mb-1">
                            Repository <span className="text-red-400">*</span>
                          </label>
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
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-gray-100 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                            <option value="">Choose a repository...</option>
                            {githubRepos.map((repo) => (
                              <option key={repo.id} value={repo.id}>
                                {repo.full_name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {githubOAuthError && (
                          <div className="text-xs text-red-300 bg-red-900/20 border border-red-800/20 p-2 rounded">
                            {githubOAuthError}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            onClick={handleGitHubCancelOAuth}
                            variant="outline"
                            className="flex-1 py-2 text-sm"
                            disabled={githubOAuthStage === "saving"}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleAddGitHubConnector}
                            disabled={
                              !githubSelectedRepoId ||
                              githubOAuthStage === "saving"
                            }
                            className="flex-1 py-2 text-sm"
                          >
                            {githubOAuthStage === "saving"
                              ? "Saving..."
                              : "Connect"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Zoho Card */}
                  <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-100">
                          Zoho Projects
                        </h3>
                        {connectorAddedType !== "zoho" && (
                          <span className="text-xs bg-orange-500/20 text-orange-300 px-2 py-1 rounded">
                            Optional
                          </span>
                        )}
                      </div>
                      {connectorAddedType === "zoho" && (
                        <span className="text-green-400 text-lg">✓</span>
                      )}
                    </div>

                    {connectorAddedType === "zoho" ? (
                      <div className="text-green-400 text-sm">
                        Connected: {zohoSelectedPortalName} /{" "}
                        {zohoSelectedProjectName}
                      </div>
                    ) : zohoOAuthStage === "idle" ? (
                      <div className="space-y-3">
                        <p className="text-sm text-gray-400 mb-4">
                          Sign in with your Zoho account to connect your
                          projects.
                        </p>
                        <Button
                          onClick={handleZohoSignIn}
                          className="w-full py-2 text-sm"
                          variant="primary"
                        >
                          Sign In with Zoho
                        </Button>
                      </div>
                    ) : zohoOAuthStage === "waiting" ? (
                      <div className="flex flex-col items-center space-y-4">
                        <div className="relative">
                          <div className="w-8 h-8 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin"></div>
                        </div>
                        <div className="text-center">
                          <p className="text-sm text-gray-100 font-medium">
                            Authorizing with Zoho...
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Complete the authorization in your browser
                          </p>
                        </div>
                        <Button
                          onClick={handleZohoCancelOAuth}
                          variant="outline"
                          size="sm"
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : zohoOAuthStage === "selecting" ||
                      zohoOAuthStage === "saving" ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-200 mb-1">
                            Portal <span className="text-red-400">*</span>
                          </label>
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
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-gray-100 rounded text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                          >
                            <option value="">Choose a portal...</option>
                            {zohoPortals.map((portal) => (
                              <option key={portal.id} value={portal.id}>
                                {portal.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {zohoSelectedPortalId && (
                          <div>
                            <label className="block text-xs font-medium text-gray-200 mb-1">
                              Project <span className="text-red-400">*</span>
                            </label>
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
                              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 text-gray-100 rounded text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                            >
                              <option value="">Choose a project...</option>
                              {zohoProjects.map((project) => (
                                <option
                                  key={project.id_string}
                                  value={project.id_string}
                                >
                                  {project.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {zohoOAuthError && (
                          <div className="text-xs text-red-300 bg-red-900/20 border border-red-800/20 p-2 rounded">
                            {zohoOAuthError}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Button
                            onClick={handleZohoCancelOAuth}
                            variant="outline"
                            className="flex-1 py-2 text-sm"
                            disabled={zohoOAuthStage === "saving"}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleAddZohoConnector}
                            disabled={
                              !zohoSelectedPortalId ||
                              !zohoSelectedProjectId ||
                              zohoOAuthStage === "saving"
                            }
                            className="flex-1 py-2 text-sm"
                          >
                            {zohoOAuthStage === "saving"
                              ? "Saving..."
                              : "Connect"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <Button onClick={handleComplete} className="w-full">
                    {connectors.length > 0
                      ? "Continue to SnapFlow"
                      : "Continue Without Connectors"}
                  </Button>
                  {connectors.length > 0 && (
                    <button
                      onClick={() => updateStep(4)}
                      className="text-sm text-gray-400 hover:text-gray-300 text-center"
                    >
                      Add another connector
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 5: Completion */}
            {step === 5 && (
              <div className="bg-gray-900 rounded-xl p-8 border border-gray-800 text-center">
                <div className="text-6xl mb-6">✓</div>
                <h2 className="text-3xl font-bold text-gray-100 mb-2">
                  All Set!
                </h2>
                <p className="text-gray-400 mb-8">
                  Your workspace is ready. Let's start capturing!
                </p>

                <Button onClick={() => router.push("/home")} className="w-full">
                  Go to SnapFlow
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
