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

    if (imageContent.length === 0) {
      throw new Error("No screenshots available to generate a description.");
    }

    // ── Supplementary context lines ──────────────────────────────────────

    const contextLines: string[] = [];

    // Window / app context per screenshot
    const contexts = params.windowContexts ?? [];
    if (contexts.length > 0) {
      const unique = Array.from(
        new Map(contexts.map((c) => [c.appName, c])).values()
      );
      const appList = unique
        .map((c) => (c.url ? `${c.appName} (${c.url})` : c.appName))
        .join(", ");
      contextLines.push(`Applications visible: ${appList}`);

      // Add page/window titles for more context
      const titles = unique.map((c) => `"${c.windowTitle}"`).join(", ");
      contextLines.push(`Window titles: ${titles}`);
    }

    // Typed text
    const meaningfulTyped = params.typedTexts.filter((t) => {
      const stripped = t.replace(/\s/g, "");
      if (stripped.length < 2) return false;
      if (new Set(stripped.split("")).size === 1) return false;
      return true;
    });
    if (meaningfulTyped.length > 0) {
      contextLines.push(
        `Text typed: ${meaningfulTyped.map((t) => `"${t}"`).join(", ")}`
      );
    }

    const meaningfulShortcuts = params.shortcuts.filter(
      (s) => s !== "Tab" && s !== "Escape" && s !== "Enter"
    );
    if (meaningfulShortcuts.length > 0) {
      contextLines.push(
        `Keyboard shortcuts: ${Array.from(new Set(meaningfulShortcuts)).join(", ")}`
      );
    }

    const supplementary =
      contextLines.length > 0
        ? `\n\nSupplementary context (use only where consistent with screenshots):\n${contextLines.join("\n")}`
        : "";

    // ── Prompt ───────────────────────────────────────────────────────────

    const prompt = `You are a senior QA engineer writing a bug report for a development team. Analyse the following ${imageContent.length} screenshot${imageContent.length !== 1 ? "s" : ""} captured during a ${durationSec}-second QA session.${supplementary}

Your task: produce a complete, factual bug report based ONLY on what is observable in the screenshots. Do NOT invent details.

Respond with ONLY valid JSON — no markdown fences, no extra text:
{
  "title": "<one-line bug title, max 80 chars, present tense, e.g. 'Checkout button disabled after entering valid card'>",
  "summary": "<2–3 sentences describing the application/page, the sequence of states or interactions observed, and any visible error or unexpected behaviour>",
  "steps": [
    "<Step 1: Describe the first visible state or action>",
    "<Step 2: …>",
    "<Step N: Describe the final broken/unexpected state>"
  ],
  "expected": "<one sentence: what correct behaviour should look like>",
  "actual": "<one sentence: what the screenshots show instead — the defect>",
  "severity": "<one of: critical | high | medium | low>"
}

Severity guide — critical: app crash / data loss / security issue; high: core feature broken, no workaround; medium: feature partially works or has a workaround; low: cosmetic or minor UX issue.

Write all text in past tense. Be specific and factual.`;

    log.info(
      "[AI] Generating bug report — screenshots:",
      imageContent.length,
      "window contexts:",
      contexts.length
    );

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      ...imageContent,
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
