import type { ParsedDiff } from "../parser/diffParser";
import type { AuditRulesConfig } from "../types/engine";
import { DEFAULT_AUDIT_RULES } from "../types/engine";
import type { AiAnalysisResult } from "../types/generative";
import { buildSystemPrompt, buildUserPrompt, extractAndParseJson, extractPartialAnalysis } from "./prompts";

export const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_API_VERSION = "2023-06-01";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

export interface AnthropicModelOption {
  id: string;
  label: string;
}

export const ANTHROPIC_MODEL_OPTIONS: AnthropicModelOption[] = [
  { id: "claude-fable-5", label: "Fable 5 - Most capable" },
  { id: "claude-sonnet-5", label: "Sonnet 5 - Cost efficient" },
];

export interface AnthropicConfig {
  apiKey: string;
  model: string;
}

export const DEFAULT_ANTHROPIC_CONFIG: AnthropicConfig = {
  apiKey: "",
  model: DEFAULT_ANTHROPIC_MODEL,
};

const STORAGE_KEY = "anthropicConfig";

/** Loads the saved API key + model from chrome.storage.local, falling back to defaults outside the extension. */
export async function loadAnthropicConfig(): Promise<AnthropicConfig> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY] as Partial<AnthropicConfig> | undefined;
    if (raw && typeof raw === "object") {
      return {
        apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
        model: typeof raw.model === "string" && raw.model ? raw.model : DEFAULT_ANTHROPIC_MODEL,
      };
    }
  } catch {
    // chrome.storage unavailable (e.g. dev server outside the extension) — use defaults
  }
  return { ...DEFAULT_ANTHROPIC_CONFIG };
}

/** Persists the API key + model to chrome.storage.local; failures are non-fatal (best-effort). */
export async function saveAnthropicConfig(config: AnthropicConfig): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: config });
  } catch {
    // best-effort persistence only
  }
}

interface AnthropicStreamEvent {
  type?: string;
  delta?: { type?: string; text?: unknown };
  error?: { message?: unknown };
}

interface AnthropicErrorBody {
  error?: { message?: unknown };
}

/**
 * Streams a chat completion from the Anthropic Messages API directly from
 * the browser. `anthropic-dangerous-direct-browser-access` opts into the
 * CORS response Anthropic otherwise withholds from browser-origin requests
 * (the API key lives in the page, which the header name is warning about).
 */
export async function analyzeDiff(
  diff: ParsedDiff,
  config: AnthropicConfig,
  onChunk?: (partialResult: Partial<AiAnalysisResult>) => void,
  rules: AuditRulesConfig = DEFAULT_AUDIT_RULES,
): Promise<AiAnalysisResult> {
  if (!config.apiKey.trim()) {
    throw new Error("Укажите Anthropic API Key в настройках сайдбара.");
  }

  const { prompt, truncated } = buildUserPrompt(diff);
  if (truncated) {
    console.warn("[diff-guard] Diff превышает лимит контекста модели, отправлена усечённая версия.");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 8192,
      stream: true,
      system: buildSystemPrompt(rules),
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok || !response.body) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as AnthropicErrorBody;
      if (typeof body.error?.message === "string") detail = body.error.message;
    } catch {
      // response body wasn't JSON — keep the status-line detail
    }
    throw new Error(`Anthropic API вернул ошибку: ${detail}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  for (; ;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let eventEnd = buffer.indexOf("\n\n");
    while (eventEnd !== -1) {
      const rawEvent = buffer.slice(0, eventEnd);
      buffer = buffer.slice(eventEnd + 2);
      eventEnd = buffer.indexOf("\n\n");

      const dataLine = rawEvent
        .split("\n")
        .map((line) => line.replace(/\r$/, ""))
        .find((line) => line.startsWith("data:"));
      if (!dataLine) continue;

      let event: AnthropicStreamEvent;
      try {
        event = JSON.parse(dataLine.slice(5).trim()) as AnthropicStreamEvent;
      } catch {
        continue;
      }

      if (event.type === "error") {
        const message = typeof event.error?.message === "string" ? event.error.message : "неизвестная ошибка потока";
        throw new Error(`Anthropic API: ${message}`);
      }

      if (event.type !== "content_block_delta" || event.delta?.type !== "text_delta") continue;
      const text = typeof event.delta.text === "string" ? event.delta.text : "";
      if (!text) continue;
      accumulated += text;

      if (onChunk) {
        const partial = extractPartialAnalysis(accumulated);
        if (partial) onChunk(partial);
      }
    }
  }

  const result = extractAndParseJson(accumulated);
  if (!result) {
    throw new Error("Anthropic API вернул невалидный JSON — не удалось разобрать результат аудита.");
  }
  return result;
}
