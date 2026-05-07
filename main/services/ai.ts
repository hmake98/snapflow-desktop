/**
 * AI Service — multi-provider session description generator.
 *
 * Supported providers:
 *   groq      — Groq (LLaMA 4 Vision, free tier)
 *   openai    — OpenAI GPT-4o
 *   gemini    — Google Gemini 2.0 Flash (OpenAI-compat endpoint)
 *   anthropic — Anthropic Claude (claude-sonnet-4-6)
 *
 * Keys are stored locally in electron-store and never sent to SnapFlow servers.
 */

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import Store from "electron-store";
import fs from "fs";
import log from "electron-log";

// ── Provider definitions ─────────────────────────────────────────────────────

export type Provider = "groq" | "openai" | "gemini" | "anthropic";

interface ProviderConfig {
  label: string;
  model: string;
  baseURL?: string;
}

const PROVIDERS: Record<Provider, ProviderConfig> = {
  groq: {
    label: "Groq",
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    baseURL: "https://api.groq.com/openai/v1",
  },
  openai: {
    label: "OpenAI",
    model: "gpt-4o-mini",
  },
  gemini: {
    label: "Google Gemini",
    model: "gemini-2.0-flash",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  anthropic: {
    label: "Anthropic Claude",
    model: "claude-sonnet-4-6",
  },
};

// ── Store ────────────────────────────────────────────────────────────────────

interface AiStoreSchema {
  groqApiKey: string | null;
  openaiApiKey: string | null;
  geminiApiKey: string | null;
  anthropicApiKey: string | null;
  activeProvider: Provider | null;
}

const aiStore = new Store({
  name: "snapflow-ai-settings",
  defaults: {
    groqApiKey: null,
    openaiApiKey: null,
    geminiApiKey: null,
    anthropicApiKey: null,
    activeProvider: null,
  },
}) as any;

// ── Shared types ─────────────────────────────────────────────────────────────

export interface WindowContext {
  appName: string;
  windowTitle: string;
  url?: string;
}

export interface GenerateDescriptionParams {
  screenshotPaths: string[];
  typedTexts: string[];
  shortcuts: string[];
  clickCount: number;
  durationMs: number;
  windowContexts?: WindowContext[];
  timeline?: string;
  environment?: { os: string; screen: string; appVersion: string };
}

export interface BugReport {
  title: string;
  summary: string;
  steps: string[];
  expected: string;
  actual: string;
  severity: "critical" | "high" | "medium" | "low";
}

// ── Service ──────────────────────────────────────────────────────────────────

export class AiService {
  private storeKey(provider: Provider): keyof AiStoreSchema {
    return `${provider}ApiKey` as keyof AiStoreSchema;
  }

  // ── Key management ──────────────────────────────────────────────────────

  setApiKey(provider: Provider, key: string): void {
    aiStore.set(this.storeKey(provider), key.trim());
    // Auto-set as active provider if none is set yet
    if (!aiStore.get("activeProvider")) {
      aiStore.set("activeProvider", provider);
    }
    log.info(`[AI] ${provider} API key saved`);
  }

  clearApiKey(provider: Provider): void {
    aiStore.set(this.storeKey(provider), null);
    // If this was the active provider, switch to next available
    if (aiStore.get("activeProvider") === provider) {
      const next = this.firstConfiguredProvider([provider]);
      aiStore.set("activeProvider", next);
    }
    log.info(`[AI] ${provider} API key cleared`);
  }

  getStoredApiKey(provider: Provider): string | null {
    const envKey: Record<Provider, string | undefined> = {
      groq: process.env.GROQ_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
    };
    return envKey[provider] || (aiStore.get(this.storeKey(provider)) as string | null);
  }

  getMaskedKey(provider: Provider): string | null {
    const key = this.getStoredApiKey(provider);
    if (!key) return null;
    return key.slice(0, 7) + "…" + key.slice(-4);
  }

  isConfigured(provider?: Provider): boolean {
    if (provider) return !!this.getStoredApiKey(provider);
    return (["groq", "openai", "gemini", "anthropic"] as Provider[]).some(
      (p) => !!this.getStoredApiKey(p)
    );
  }

  // ── Active provider ─────────────────────────────────────────────────────

  getActiveProvider(): Provider | null {
    const stored = aiStore.get("activeProvider") as Provider | null;
    // Validate the stored provider still has a key
    if (stored && this.getStoredApiKey(stored)) return stored;
    // Fall back to first configured
    return this.firstConfiguredProvider();
  }

  setActiveProvider(provider: Provider): void {
    aiStore.set("activeProvider", provider);
    log.info(`[AI] Active provider set to: ${provider}`);
  }

  getAllStatus(): Record<Provider, { maskedKey: string | null; isActive: boolean }> {
    const active = this.getActiveProvider();
    return (["groq", "openai", "gemini", "anthropic"] as Provider[]).reduce(
      (acc, p) => {
        acc[p] = { maskedKey: this.getMaskedKey(p), isActive: p === active };
        return acc;
      },
      {} as Record<Provider, { maskedKey: string | null; isActive: boolean }>
    );
  }

  private firstConfiguredProvider(exclude: Provider[] = []): Provider | null {
    const order: Provider[] = ["groq", "openai", "gemini", "anthropic"];
    return order.find((p) => !exclude.includes(p) && !!this.getStoredApiKey(p)) ?? null;
  }

  // ── Generation ──────────────────────────────────────────────────────────

  async generateSessionDescription(
    params: GenerateDescriptionParams
  ): Promise<BugReport> {
    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error(
        "No AI provider configured. Add an API key in Settings → AI."
      );
    }

    const apiKey = this.getStoredApiKey(provider)!;
    log.info(`[AI] Generating with provider: ${provider}`);

    if (provider === "anthropic") {
      return this.generateWithAnthropic(apiKey, params);
    }
    return this.generateWithOpenAICompat(provider, apiKey, params);
  }

  // ── OpenAI-compatible providers (Groq, OpenAI, Gemini) ─────────────────

  private async generateWithOpenAICompat(
    provider: "groq" | "openai" | "gemini",
    apiKey: string,
    params: GenerateDescriptionParams
  ): Promise<BugReport> {
    const config = PROVIDERS[provider];
    const client = new OpenAI({
      apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });

    const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const filePath of params.screenshotPaths.slice(0, 6)) {
      try {
        const base64 = fs.readFileSync(filePath).toString("base64");
        imageContent.push({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${base64}` },
        });
      } catch (err) {
        log.warn("[AI] Could not read screenshot:", filePath, err);
      }
    }

    const { prompt, contextBlock } = this.buildPrompt(params, imageContent.length);
    const hasImages = imageContent.length > 0;

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      ...(hasImages ? imageContent : []),
      { type: "text", text: prompt },
    ];

    const response = await client.chat.completions.create({
      model: config.model,
      max_tokens: 600,
      messages: [{ role: "user", content }],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error(`Empty response from ${config.label}.`);
    return this.parseReport(raw);
  }

  // ── Anthropic Claude ────────────────────────────────────────────────────

  private async generateWithAnthropic(
    apiKey: string,
    params: GenerateDescriptionParams
  ): Promise<BugReport> {
    const client = new Anthropic({ apiKey });

    const imageBlocks: Anthropic.ImageBlockParam[] = [];
    for (const filePath of params.screenshotPaths.slice(0, 6)) {
      try {
        const base64 = fs.readFileSync(filePath).toString("base64");
        imageBlocks.push({
          type: "image",
          source: { type: "base64", media_type: "image/png", data: base64 },
        });
      } catch (err) {
        log.warn("[AI] Could not read screenshot:", filePath, err);
      }
    }

    const { prompt } = this.buildPrompt(params, imageBlocks.length);

    const content: Anthropic.ContentBlockParam[] = [
      ...imageBlocks,
      { type: "text", text: prompt },
    ];

    const response = await client.messages.create({
      model: PROVIDERS.anthropic.model,
      max_tokens: 600,
      messages: [{ role: "user", content }],
    });

    const raw =
      response.content.find((b) => b.type === "text")?.text?.trim() ?? "";
    if (!raw) throw new Error("Empty response from Claude.");
    return this.parseReport(raw);
  }

  // ── Shared prompt builder ───────────────────────────────────────────────

  private buildPrompt(
    params: GenerateDescriptionParams,
    imageCount: number
  ): { prompt: string; contextBlock: string } {
    const durationSec = Math.round(params.durationMs / 1000);
    const contextParts: string[] = [];

    if (params.environment) {
      contextParts.push(
        `Environment: ${params.environment.os} · ${params.environment.screen} · App v${params.environment.appVersion}`
      );
    }

    if (params.timeline) {
      contextParts.push(`\nActivity timeline:\n${params.timeline}`);
    } else {
      const contexts = params.windowContexts ?? [];
      if (contexts.length > 0) {
        const unique = Array.from(new Map(contexts.map((c) => [c.appName, c])).values());
        contextParts.push(
          `Applications: ${unique.map((c) => (c.url ? `${c.appName} (${c.url})` : c.appName)).join(", ")}`
        );
      }
      const meaningful = params.typedTexts.filter(
        (t) => t.replace(/\s/g, "").length >= 2 && new Set(t.replace(/\s/g, "").split("")).size > 1
      );
      if (meaningful.length > 0) {
        contextParts.push(`Text typed: ${meaningful.map((t) => `"${t}"`).join(", ")}`);
      }
      const shortcuts = params.shortcuts.filter(
        (s) => s !== "Tab" && s !== "Escape" && s !== "Enter"
      );
      if (shortcuts.length > 0) {
        contextParts.push(`Shortcuts used: ${Array.from(new Set(shortcuts)).join(", ")}`);
      }
    }

    const contextBlock = contextParts.join("\n");
    const imageNote =
      imageCount > 0
        ? `\n\nThe ${imageCount} screenshot${imageCount !== 1 ? "s" : ""} attached show the visual state at the moments marked "📸 Screenshot captured" in the timeline. Use them to confirm details, but derive steps FROM THE TIMELINE.`
        : "";

    const prompt = `You are a senior QA engineer writing a bug report from a recorded QA session.

${contextBlock}${imageNote}

Produce a complete, factual bug report. Base reproduction steps primarily on the activity timeline. Do NOT invent details not supported by the data.

Respond with ONLY valid JSON — no markdown fences, no extra text:
{
  "title": "<one-line bug title, max 80 chars>",
  "summary": "<2–3 sentences: what was tested, what the QA did, what unexpected behaviour was observed>",
  "steps": ["<Step 1>", "<Step 2>", "<Step N>"],
  "expected": "<one sentence: correct behaviour>",
  "actual": "<one sentence: what happened — the defect>",
  "severity": "<critical | high | medium | low>"
}

Severity: critical = crash/data loss/security; high = core feature broken; medium = partial/has workaround; low = cosmetic.
Write in past tense. Be specific and factual.`;

    return { prompt, contextBlock };
  }

  // ── JSON parser ─────────────────────────────────────────────────────────

  private parseReport(raw: string): BugReport {
    const jsonStr = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let report: BugReport;
    try {
      report = JSON.parse(jsonStr) as BugReport;
    } catch {
      log.warn("[AI] Failed to parse JSON, using fallback");
      report = {
        title: "Bug detected during QA session",
        summary: raw.slice(0, 300),
        steps: ["See screenshots for reproduction steps"],
        expected: "Application should function as designed",
        actual: "Unexpected behaviour observed — see screenshots",
        severity: "medium",
      };
    }

    report.title = report.title ?? "Untitled bug";
    report.steps = Array.isArray(report.steps) ? report.steps : [];
    report.severity = (["critical", "high", "medium", "low"] as const).includes(
      report.severity
    )
      ? report.severity
      : "medium";

    log.info("[AI] Bug report generated — severity:", report.severity);
    return report;
  }

  // ── Error helper ────────────────────────────────────────────────────────

  static friendlyError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("429") || msg.includes("quota") || msg.includes("Too Many Requests")) {
      return "AI quota exceeded — try again in a moment";
    }
    if (msg.includes("404") || msg.includes("not found")) {
      return "AI model unavailable — check your API key";
    }
    if (msg.includes("401") || msg.includes("403") || msg.includes("API key") || msg.includes("authentication")) {
      return "Invalid API key — update it in Settings → AI";
    }
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("ENOTFOUND")) {
      return "Network error — check your internet connection";
    }
    if (msg.includes("No AI provider")) {
      return "No AI provider configured — add a key in Settings → AI";
    }
    return "AI generation failed — edit manually";
  }
}

export const aiService = new AiService();
