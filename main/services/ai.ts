/**
 * AI Service — generates natural-language session descriptions
 * using Groq's vision API (LLaMA 4 Scout).
 *
 * Free tier: 30 req/min, 14,400 req/day — no billing required.
 * Get a free key at: https://console.groq.com/keys
 */

import OpenAI from "openai";
import Store from "electron-store";
import fs from "fs";
import log from "electron-log";

const aiStore = new Store({
  name: "snapflow-ai-settings",
  defaults: { groqApiKey: null },
}) as any;

// Vision model available on Groq free tier
const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

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
  /** Per-screenshot window/app context captured at capture time */
  windowContexts?: WindowContext[];
  /**
   * Pre-built chronological activity narrative from the renderer's groupTimeline().
   * When present this is used as the PRIMARY prompt context; screenshots are
   * visual evidence only.  Format:
   *   +0s  ↳ Navigated to: Chrome — "Login"
   *   +3s  ⌨ Typed: "user@example.com"
   *   +5s  🖱 Left-clicked
   *   +6s  📸 Screenshot captured
   */
  timeline?: string;
  /** Host environment captured at session start */
  environment?: { os: string; screen: string; appVersion: string };
}

/**
 * Structured bug report produced by the LLM.
 * All fields are derived from visual analysis of the screenshots.
 */
export interface BugReport {
  /** Short one-line bug title (≤ 80 chars) */
  title: string;
  /** 2–3 sentence summary of what was observed */
  summary: string;
  /** Numbered reproduction steps inferred from the screenshot sequence */
  steps: string[];
  /** What the correct / expected behaviour should have been */
  expected: string;
  /** What actually happened (the defect) */
  actual: string;
  /** Rough severity estimate: critical → high → medium → low */
  severity: "critical" | "high" | "medium" | "low";
}

export class AiService {
  private getApiKey(): string | null {
    return (
      process.env.GROQ_API_KEY || (aiStore.get("groqApiKey") as string | null)
    );
  }

  isConfigured(): boolean {
    return !!this.getApiKey();
  }

  setApiKey(key: string): void {
    aiStore.set("groqApiKey", key.trim());
    log.info("[AI] Groq API key saved");
  }

  clearApiKey(): void {
    aiStore.set("groqApiKey", null);
    log.info("[AI] Groq API key cleared");
  }

  getStoredApiKey(): string | null {
    return aiStore.get("groqApiKey") as string | null;
  }

  async generateSessionDescription(
    params: GenerateDescriptionParams
  ): Promise<BugReport> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        "Groq API key not configured. Set GROQ_API_KEY in your .env file."
      );
    }

    const client = new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const durationSec = Math.round(params.durationMs / 1000);

    // Build image content parts (base64 data URIs, up to 6 screenshots)
    const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const filePath of params.screenshotPaths.slice(0, 6)) {
      try {
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString("base64");
        imageContent.push({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${base64}` },
        });
      } catch (err) {
        log.warn("[AI] Could not read screenshot:", filePath, err);
      }
    }

    if (imageContent.length === 0 && !params.timeline) {
      throw new Error("No session data available to generate a description.");
    }

    // ── Build context block ───────────────────────────────────────────────

    const contextParts: string[] = [];

    // Environment line
    if (params.environment) {
      contextParts.push(
        `Environment: ${params.environment.os} · ${params.environment.screen} · App v${params.environment.appVersion}`
      );
    }

    // Primary: structured activity timeline (text-first strategy)
    if (params.timeline) {
      contextParts.push(`\nActivity timeline:\n${params.timeline}`);
    } else {
      // Fallback when no timeline: reconstruct from individual fields
      const contexts = params.windowContexts ?? [];
      if (contexts.length > 0) {
        const unique = Array.from(
          new Map(contexts.map((c) => [c.appName, c])).values()
        );
        contextParts.push(
          `Applications: ${unique.map((c) => (c.url ? `${c.appName} (${c.url})` : c.appName)).join(", ")}`
        );
      }
      const meaningfulTyped = params.typedTexts.filter((t) => {
        const s = t.replace(/\s/g, "");
        return s.length >= 2 && new Set(s.split("")).size > 1;
      });
      if (meaningfulTyped.length > 0) {
        contextParts.push(
          `Text typed: ${meaningfulTyped.map((t) => `"${t}"`).join(", ")}`
        );
      }
      const meaningfulShortcuts = params.shortcuts.filter(
        (s) => s !== "Tab" && s !== "Escape" && s !== "Enter"
      );
      if (meaningfulShortcuts.length > 0) {
        contextParts.push(
          `Shortcuts used: ${Array.from(new Set(meaningfulShortcuts)).join(", ")}`
        );
      }
    }

    const contextBlock =
      contextParts.length > 0 ? contextParts.join("\n") : "";

    // ── Prompt ───────────────────────────────────────────────────────────
    // Text-first strategy: the activity timeline is the ground-truth source.
    // Screenshots are visual evidence to confirm or elaborate details.
    // The model must not invent steps or errors not supported by the data.

    const hasImages = imageContent.length > 0;
    const imageNote = hasImages
      ? `\n\nThe ${imageContent.length} screenshot${imageContent.length !== 1 ? "s" : ""} attached show the visual state at the moments marked "📸 Screenshot captured" in the timeline. Use them to confirm details and describe visible UI elements, but derive the sequence of steps FROM THE TIMELINE, not the images alone.`
      : "";

    const prompt = `You are a senior QA engineer writing a bug report from a recorded QA session.

${contextBlock}${imageNote}

Your task: produce a complete, factual bug report. Base the reproduction STEPS primarily on the activity timeline above. Use the screenshots to confirm visible UI states. Do NOT invent details not supported by the data.

Respond with ONLY valid JSON — no markdown fences, no extra text:
{
  "title": "<one-line bug title, max 80 chars, e.g. 'Checkout button stays disabled after entering valid card'>",
  "summary": "<2–3 sentences: what app/page was being tested, what the QA did, and what unexpected behaviour was observed>",
  "steps": [
    "<Step 1: Opening state or navigation>",
    "<Step 2: Action taken (match typed text, clicks, shortcuts from timeline)>",
    "<Step N: The broken or unexpected final state>"
  ],
  "expected": "<one sentence: what correct behaviour should look like>",
  "actual": "<one sentence: what actually happened — the defect>",
  "severity": "<one of: critical | high | medium | low>"
}

Severity guide — critical: app crash / data loss / security; high: core feature broken, no workaround; medium: feature partial or has workaround; low: cosmetic or minor UX.

Write in past tense. Be specific and factual. If there is no clear bug, describe what was tested and note it appeared to function correctly.`;

    log.info(
      "[AI] Generating bug report — screenshots:",
      imageContent.length,
      "has timeline:",
      !!params.timeline
    );

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      ...(hasImages ? imageContent : []),
      { type: "text", text: prompt },
    ];

    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content }],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error("Empty response from Groq.");

    // Parse the JSON — strip any accidental fences the model may still add
    const jsonStr = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let report: BugReport;
    try {
      report = JSON.parse(jsonStr) as BugReport;
    } catch {
      // If JSON parse fails, build a fallback report from the raw text
      log.warn("[AI] Failed to parse JSON from model, using fallback");
      report = {
        title: "Bug detected during QA session",
        summary: raw.slice(0, 300),
        steps: ["See screenshots for reproduction steps"],
        expected: "Application should function as designed",
        actual: "Unexpected behaviour observed — see screenshots",
        severity: "medium",
      };
    }

    // Ensure required fields exist
    report.title = report.title ?? "Untitled bug";
    report.steps = Array.isArray(report.steps) ? report.steps : [];
    report.severity = (["critical", "high", "medium", "low"] as const).includes(
      report.severity
    )
      ? report.severity
      : "medium";

    log.info(
      "[AI] Bug report generated successfully — severity:",
      report.severity
    );
    return report;
  }

  /** Returns a short user-facing message for common API errors. */
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
      return "AI model unavailable — check your GROQ_API_KEY";
    }
    if (msg.includes("401") || msg.includes("403") || msg.includes("API key")) {
      return "Invalid Groq API key — update GROQ_API_KEY in your .env file";
    }
    if (
      msg.includes("network") ||
      msg.includes("fetch") ||
      msg.includes("ENOTFOUND")
    ) {
      return "Network error — check your internet connection";
    }
    return "AI generation failed — edit manually";
  }
}

export const aiService = new AiService();
