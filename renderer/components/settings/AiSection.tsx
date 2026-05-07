import React, { useState, useEffect } from "react";

type Provider = "groq" | "openai" | "gemini" | "anthropic";

interface ProviderMeta {
  label: string;
  description: string;
  keyPlaceholder: string;
  docsHint: string;
  icon: React.ReactNode;
}

const PROVIDERS: Record<Provider, ProviderMeta> = {
  groq: {
    label: "Groq",
    description: "LLaMA 4 Vision — free tier, no billing required",
    keyPlaceholder: "gsk_••••••••••••••••••••••••••••••••",
    docsHint: "console.groq.com/keys",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 110-16 8 8 0 010 16zm-1-5h2v2h-2zm0-8h2v6h-2z" />
      </svg>
    ),
  },
  openai: {
    label: "OpenAI",
    description: "GPT-4o mini — pay-as-you-go",
    keyPlaceholder: "sk-••••••••••••••••••••••••••••••••",
    docsHint: "platform.openai.com/api-keys",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 004.981 4.18a5.985 5.985 0 00-3.998 2.9 6.046 6.046 0 00.743 7.097 5.98 5.98 0 00.51 4.911 6.051 6.051 0 006.515 2.9A5.985 5.985 0 0013.26 24a6.056 6.056 0 005.772-4.206 5.99 5.99 0 003.997-2.9 6.056 6.056 0 00-.747-7.073zM13.26 22.43a4.476 4.476 0 01-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 00.392-.681v-6.737l2.02 1.168a.071.071 0 01.038.052v5.583a4.504 4.504 0 01-4.494 4.494zM3.6 18.304a4.47 4.47 0 01-.535-3.014l.142.085 4.783 2.759a.771.771 0 00.78 0l5.843-3.369v2.332a.08.08 0 01-.033.062L9.74 19.95a4.5 4.5 0 01-6.14-1.646zM2.34 7.896a4.485 4.485 0 012.366-1.973V11.6a.766.766 0 00.388.676l5.815 3.355-2.02 1.168a.076.076 0 01-.071 0l-4.83-2.786A4.504 4.504 0 012.34 7.872zm16.597 3.855l-5.843-3.369 2.02-1.168a.076.076 0 01.071 0l4.83 2.786a4.494 4.494 0 01-.676 8.108V12.47a.79.79 0 00-.402-.72zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 00-.785 0L9.409 9.23V6.897a.066.066 0 01.028-.061l4.83-2.787a4.5 4.5 0 016.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 01-.038-.057V6.075a4.5 4.5 0 017.375-3.453l-.142.08L8.704 5.46a.795.795 0 00-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
      </svg>
    ),
  },
  gemini: {
    label: "Google Gemini",
    description: "Gemini 2.0 Flash — generous free tier",
    keyPlaceholder: "AIza••••••••••••••••••••••••••••••••",
    docsHint: "aistudio.google.com/apikey",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
  },
  anthropic: {
    label: "Anthropic Claude",
    description: "Claude Sonnet 4.6 — state-of-the-art vision",
    keyPlaceholder: "sk-ant-••••••••••••••••••••••••••••••••",
    docsHint: "console.anthropic.com/settings/keys",
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.827 3.52l8.093 14.013a2.103 2.103 0 01-1.826 3.147H3.906a2.103 2.103 0 01-1.826-3.147L10.173 3.52a2.103 2.103 0 013.654 0z" />
      </svg>
    ),
  },
};

const PROVIDER_ORDER: Provider[] = ["groq", "openai", "gemini", "anthropic"];

interface ProviderStatus {
  maskedKey: string | null;
  isActive: boolean;
}

interface ProviderCardProps {
  provider: Provider;
  status: ProviderStatus;
  onSave: (provider: Provider, key: string) => Promise<void>;
  onClear: (provider: Provider) => Promise<void>;
  onSetActive: (provider: Provider) => Promise<void>;
}

function ProviderCard({ provider, status, onSave, onClear, onSetActive }: ProviderCardProps) {
  const meta = PROVIDERS[provider];
  const [input, setInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = (type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    if (!input.trim()) return;
    setSaving(true);
    try {
      await onSave(provider, input.trim());
      setInput("");
      showToast("success", "Key saved");
    } catch {
      showToast("error", "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await onClear(provider);
      showToast("success", "Key removed");
    } catch {
      showToast("error", "Failed to remove");
    } finally {
      setClearing(false);
    }
  };

  const isConfigured = !!status.maskedKey;

  return (
    <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-700/40">
        <div className="w-5 h-5 bg-gray-700/60 border border-gray-600/50 rounded flex items-center justify-center flex-shrink-0 text-gray-400">
          {meta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-semibold text-gray-300">{meta.label}</span>
          <span className="text-xs text-gray-600 ml-2 font-normal">{meta.description}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {status.isActive && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25">
              Active
            </span>
          )}
          {isConfigured && !status.isActive && (
            <button
              onClick={() => onSetActive(provider)}
              className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              Set active
            </button>
          )}
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            isConfigured
              ? "bg-gray-700/50 text-gray-400 border-gray-600/40"
              : "bg-gray-800/60 text-gray-600 border-gray-700/30"
          }`}>
            {isConfigured ? "Configured" : "Not set"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Existing key row */}
        {isConfigured && (
          <div className="flex items-center gap-2.5 px-3 py-2 bg-gray-900/50 border border-gray-700/30 rounded-lg">
            <svg className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <span className="text-[11px] text-gray-500 font-mono flex-1 min-w-0 truncate">{status.maskedKey}</span>
            <button
              onClick={handleClear}
              disabled={clearing}
              className="text-[11px] text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors flex-shrink-0"
            >
              {clearing ? "Removing…" : "Remove"}
            </button>
          </div>
        )}

        {/* Key input row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? "text" : "password"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder={isConfigured ? "Replace with new key…" : meta.keyPlaceholder}
              className="w-full h-8 px-3 pr-9 bg-gray-900/60 border border-gray-600/40 rounded-lg text-xs text-gray-100 placeholder-gray-600 font-mono focus:outline-none focus:border-gray-500/60 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400 transition-colors"
            >
              {showKey ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !input.trim()}
            className="h-8 px-3 bg-gray-700/60 hover:bg-gray-700 border border-gray-600/50 rounded-lg text-xs font-medium text-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0 flex items-center gap-1.5"
          >
            {saving ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
                Saving…
              </>
            ) : "Save"}
          </button>
          {toast && (
            <span className={`text-xs flex-shrink-0 ${toast.type === "success" ? "text-green-400" : "text-red-400"}`}>
              {toast.msg}
            </span>
          )}
        </div>

        {/* Docs hint */}
        <p className="text-[10px] text-gray-600">
          Get your key at <span className="text-gray-500">{meta.docsHint}</span>
        </p>
      </div>
    </div>
  );
}

export function AiSection() {
  const [statuses, setStatuses] = useState<Record<Provider, ProviderStatus>>({
    groq: { maskedKey: null, isActive: false },
    openai: { maskedKey: null, isActive: false },
    gemini: { maskedKey: null, isActive: false },
    anthropic: { maskedKey: null, isActive: false },
  });

  useEffect(() => {
    loadStatuses();
  }, []);

  const loadStatuses = async () => {
    const result = await window.api.aiGetAllStatus();
    if (result?.success && result.data) {
      setStatuses(result.data as Record<Provider, ProviderStatus>);
    }
  };

  const handleSave = async (provider: Provider, key: string) => {
    const result = await window.api.aiSetKey(provider, key);
    if (!result?.success) throw new Error(result?.error ?? "Failed");
    await loadStatuses();
  };

  const handleClear = async (provider: Provider) => {
    const result = await window.api.aiClearKey(provider);
    if (!result?.success) throw new Error(result?.error ?? "Failed");
    await loadStatuses();
  };

  const handleSetActive = async (provider: Provider) => {
    const result = await window.api.aiSetActiveProvider(provider);
    if (!result?.success) throw new Error(result?.error ?? "Failed");
    await loadStatuses();
  };

  const configuredCount = Object.values(statuses).filter((s) => s.maskedKey).length;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">AI Providers</span>
          <span className="text-[11px] text-gray-600">{configuredCount} of 4 configured</span>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Configure one or more providers. The <span className="text-gray-300">active</span> provider is used to auto-generate bug report descriptions in session review. Keys are stored locally and never sent to SnapFlow servers.
        </p>
      </div>

      {PROVIDER_ORDER.map((p) => (
        <ProviderCard
          key={p}
          provider={p}
          status={statuses[p]}
          onSave={handleSave}
          onClear={handleClear}
          onSetActive={handleSetActive}
        />
      ))}
    </div>
  );
}
