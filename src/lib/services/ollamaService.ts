import type { ParsedDiff } from "../parser/diffParser";
import type { AiAnalysisResult } from "../types/generative";
import { SYSTEM_PROMPT, buildUserPrompt, extractAndParseJson, extractPartialAnalysis } from "./prompts";

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";

export interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export const DEFAULT_OLLAMA_CONFIG: OllamaConfig = {
  baseUrl: DEFAULT_OLLAMA_BASE_URL,
  model: DEFAULT_OLLAMA_MODEL,
};

interface OllamaTagsResponse {
  models?: Array<{ name?: unknown }>;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Reachability + model-list probe against a local Ollama server, used to
 * surface a friendly error ("is `ollama serve` running?") before spending
 * time on a request that will just hang or fail.
 */
export async function checkOllamaConnection(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/api/tags`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Ollama ответил ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as OllamaTagsResponse;
  const names: string[] = [];
  for (const entry of data.models ?? []) {
    if (typeof entry.name === "string") names.push(entry.name);
  }
  return names;
}

interface OllamaChatChunk {
  message?: { content?: unknown };
  done?: boolean;
  error?: string;
}

/**
 * Streams a chat completion from a local Ollama server (`/api/chat`, NDJSON
 * streaming) and parses the model's JSON reply the same way as the WebLLM
 * path (see prompts.ts) — the two engines share one prompt/parsing contract
 * so suggestion cards render identically regardless of which produced them.
 */
export async function analyzeDiff(
  diff: ParsedDiff,
  config: OllamaConfig,
  onChunk?: (partialResult: Partial<AiAnalysisResult>) => void,
): Promise<AiAnalysisResult> {
  const { prompt, truncated } = buildUserPrompt(diff);
  if (truncated) {
    console.warn("[diff-guard] Diff превышает лимит контекста модели, отправлена усечённая версия.");
  }

  const response = await fetch(`${trimTrailingSlash(config.baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      format: "json",
      options: { temperature: 0.2 },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama вернул ошибку: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
      if (!line) continue;

      let chunk: OllamaChatChunk;
      try {
        chunk = JSON.parse(line) as OllamaChatChunk;
      } catch {
        continue;
      }
      if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);

      const delta = typeof chunk.message?.content === "string" ? chunk.message.content : "";
      if (!delta) continue;
      accumulated += delta;

      if (onChunk) {
        const partial = extractPartialAnalysis(accumulated);
        if (partial) onChunk(partial);
      }
    }
  }

  const result = extractAndParseJson(accumulated);
  if (!result) {
    throw new Error("Ollama вернула невалидный JSON — не удалось разобрать результат аудита.");
  }
  return result;
}
