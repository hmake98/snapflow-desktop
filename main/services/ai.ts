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
  }

  clearApiKey(provider: Provider): void {
    aiStore.set(this.storeKey(provider), null);
    // If this was the active provider, switch to next available
    if (aiStore.get("activeProvider") === provider) {
      const next = this.firstConfiguredProvider([provider]);
      aiStore.set("activeProvider", next);
    }
  }

  getStoredApiKey(provider: Provider): string | null {
    return aiStore.get(this.storeKey(provider)) as string | null;
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
  }

  getAllStatus(): Record<
    Provider,
    { maskedKey: string | null; isActive: boolean }
  > {
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
    return (
      order.find((p) => !exclude.includes(p) && !!this.getStoredApiKey(p)) ??
      null
    );
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

    if (provider === "anthropic") {
      return this.generateWithAnthropic(apiKey, params);
    }
    return this.generateWithOpenAICompat(provider, apiKey, params);
  }

  /**
   * Refine a user-written bug note + screenshot into a structured bug report.
   *
   * **Requires `userNotes`.** A screenshot alone doesn't carry intent —
   * the AI has no way to know what the user was doing, what they expected,
   * or whether anything is actually wrong. The notes are the source of
   * truth for that; the screenshot grounds visual specifics (error text,
   * UI state). If notes are missing or too short this method throws so
   * the UI can keep the button hidden / show a clear message.
   *
   * Accepts either an absolute `filePath` on disk or a base64 `dataUrl`
   * (what the annotate page holds before the snap is saved).
   * Returns markdown text the caller drops straight into the description
   * field.
   */
  static readonly MIN_NOTES_LENGTH = 20;

  async generateScreenshotDescription(input: {
    filePath?: string;
    dataUrl?: string;
    userNotes?: string;
  }): Promise<string> {
    const trimmedNotes = (input.userNotes ?? "").trim();
    if (trimmedNotes.length < AiService.MIN_NOTES_LENGTH) {
      throw new Error(
        `Write a description first (at least ${AiService.MIN_NOTES_LENGTH} characters) — the AI needs your notes to know what's actually going wrong.`
      );
    }

    const provider = this.getActiveProvider();
    if (!provider) {
      throw new Error(
        "No AI provider configured. Add an API key in Settings → AI."
      );
    }

    const apiKey = this.getStoredApiKey(provider)!;

    // Resolve image bytes to a data URL (works for all OpenAI-compat providers)
    let dataUrl = input.dataUrl;
    let base64: string | null = null;
    let mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" =
      "image/png";

    if (!dataUrl && input.filePath) {
      try {
        const buf = fs.readFileSync(input.filePath);
        base64 = buf.toString("base64");
        const lower = input.filePath.toLowerCase();
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg"))
          mediaType = "image/jpeg";
        else if (lower.endsWith(".gif")) mediaType = "image/gif";
        else if (lower.endsWith(".webp")) mediaType = "image/webp";
        dataUrl = `data:${mediaType};base64,${base64}`;
      } catch (err) {
        throw new Error(
          `Could not read screenshot: ${(err as Error).message}`,
          {
            cause: err,
          }
        );
      }
    }

    if (!dataUrl) {
      throw new Error("No screenshot provided.");
    }

    // Extract base64 + media type from the data URL when we got one directly
    if (!base64) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mt = match[1] as typeof mediaType;
        if (
          mt === "image/png" ||
          mt === "image/jpeg" ||
          mt === "image/gif" ||
          mt === "image/webp"
        ) {
          mediaType = mt;
        }
        base64 = match[2];
      }
    }

    const prompt = `You are a senior QA engineer turning a tester's rough notes plus a screenshot into a clean, structured bug report.

The tester wrote these notes (this is the SOURCE OF TRUTH for intent, expected behaviour, and what they observed — preserve their meaning):

"""
${trimmedNotes}
"""

The attached screenshot shows the on-screen state. Use it to ground visual specifics — exact error text, button labels, visible values, layout problems — but do NOT invent intent or steps that aren't in the notes or visible in the image.

Reply with markdown only — no preamble, no code fences. Use this exact structure, and OMIT any section the inputs don't support (don't fabricate to fill it in):

## Summary
<2–3 sentences combining the tester's notes with what the screenshot confirms>

## Steps to Reproduce
1. <only steps the tester mentioned or that are clearly implied>
2. ...

## Expected Behavior
<one sentence — only if the notes describe an expectation>

## Actual Behavior
<one sentence — describe the defect using notes + on-screen evidence>

## Severity
<critical | high | medium | low — pick based on impact described or visible>

Severity guide: critical = crash/data loss/security; high = core feature broken; medium = partial/has workaround; low = cosmetic.`;

    if (provider === "anthropic") {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: PROVIDERS.anthropic.model,
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64!,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      });
      const text =
        response.content.find((b) => b.type === "text")?.text?.trim() ?? "";
      if (!text) throw new Error("Empty response from Claude.");
      return text;
    }

    const config = PROVIDERS[provider];
    const client = new OpenAI({
      apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });

    const response = await client.chat.completions.create({
      model: config.model,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error(`Empty response from ${config.label}.`);
    return raw;
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

    const { prompt, contextBlock: _contextBlock } = this.buildPrompt(
      params,
      imageContent.length
    );
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
    const _durationSec = Math.round(params.durationMs / 1000);
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
        const unique = Array.from(
          new Map(contexts.map((c) => [c.appName, c])).values()
        );
        contextParts.push(
          `Applications: ${unique.map((c) => (c.url ? `${c.appName} (${c.url})` : c.appName)).join(", ")}`
        );
      }
      const meaningful = params.typedTexts.filter(
        (t) =>
          t.replace(/\s/g, "").length >= 2 &&
          new Set(t.replace(/\s/g, "").split("")).size > 1
      );
      if (meaningful.length > 0) {
        contextParts.push(
          `Text typed: ${meaningful.map((t) => `"${t}"`).join(", ")}`
        );
      }
      const shortcuts = params.shortcuts.filter(
        (s) => s !== "Tab" && s !== "Escape" && s !== "Enter"
      );
      if (shortcuts.length > 0) {
        contextParts.push(
          `Shortcuts used: ${Array.from(new Set(shortcuts)).join(", ")}`
        );
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

    return report;
  }

  // ── Error helper ────────────────────────────────────────────────────────

  static friendlyError(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("429") ||
      msg.includes("quota") ||
      msg.includes("Too Many Requests")
    ) {
      return "AI quota exceeded — try again in a moment";
    }
    if (msg.includes("404") || msg.includes("not found")) {
      return "AI model unavailable — check your API key";
    }
    if (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("API key") ||
      msg.includes("authentication")
    ) {
      return "Invalid API key — update it in Settings → AI";
    }
    if (
      msg.includes("network") ||
      msg.includes("fetch") ||
      msg.includes("ENOTFOUND")
    ) {
      return "Network error — check your internet connection";
    }
    if (msg.includes("No AI provider")) {
      return "No AI provider configured — add a key in Settings → AI";
    }
    return "AI generation failed — edit manually";
  }
}

export const aiService = new AiService();
