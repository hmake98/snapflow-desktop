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

export interface GenerateDescriptionParams {
  screenshotPaths: string[];
  typedTexts: string[];
  shortcuts: string[];
  clickCount: number;
  durationMs: number;
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
  ): Promise<string> {
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

    // Build image content parts (base64 data URIs, up to 4 screenshots)
    const imageContent: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const filePath of params.screenshotPaths.slice(0, 4)) {
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

    if (imageContent.length === 0 && params.typedTexts.length === 0) {
      throw new Error("Not enough session data to generate a description.");
    }

    // Build activity context
    const activityLines: string[] = [];
    if (params.typedTexts.length > 0) {
      activityLines.push(
        `Text typed: ${params.typedTexts.map((t) => `"${t}"`).join(", ")}`
      );
    }
    const meaningfulShortcuts = params.shortcuts.filter(
      (s) => s !== "Tab" && s !== "Escape"
    );
    if (meaningfulShortcuts.length > 0) {
      activityLines.push(`Keyboard actions: ${meaningfulShortcuts.join(", ")}`);
    }
    if (params.clickCount > 0) {
      activityLines.push(`Mouse clicks: ${params.clickCount}`);
    }

    const activityContext =
      activityLines.length > 0
        ? `\nUser activity:\n${activityLines.join("\n")}`
        : "";

    const prompt = `${
      imageContent.length > 0
        ? `These ${imageContent.length} screenshot${imageContent.length !== 1 ? "s" : ""} were captured during a ${durationSec}-second testing or debugging session.`
        : `This was a ${durationSec}-second testing or debugging session.`
    }${activityContext}

Write a technical description (3–5 sentences) for a QA engineer or developer reviewing this session. Your description must:
1. Identify the application, page, or feature visible in the screenshots
2. Describe the sequence of actions performed (what was navigated, searched, typed, or clicked — be specific)
3. Note any visible errors, warnings, failed states, loading issues, or unexpected UI behavior observed
4. Provide enough context for a developer to reproduce the scenario or understand what was being tested

Be specific and factual. Write in past tense. Focus on observable facts: actual UI states, error messages, form interactions, and navigation steps visible in the screenshots. Do not speculate beyond what is visible or recorded.`;

    log.info(
      "[AI] Generating description — screenshots:",
      imageContent.length,
      "typed blocks:",
      params.typedTexts.length
    );

    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      ...imageContent,
      { type: "text", text: prompt },
    ];

    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 180,
      messages: [{ role: "user", content }],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response from Groq.");

    log.info("[AI] Description generated successfully");
    return text;
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
