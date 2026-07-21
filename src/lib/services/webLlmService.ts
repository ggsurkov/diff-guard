import { CreateMLCEngine, type MLCEngine } from "@mlc-ai/web-llm";
import type { ParsedDiff } from "../parser/diffParser";
import type { AiAnalysisResult } from "../types/generative";
import { SYSTEM_PROMPT, buildUserPrompt, extractAndParseJson, extractPartialAnalysis } from "./prompts";
import { isWebGpuSupported } from "./webgpu";

export const PRIMARY_MODEL_ID = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC";
export const FALLBACK_MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export interface EngineProgress {
  text: string;
  progress: number;
}

let engineInstance: MLCEngine | null = null;
let enginePromise: Promise<MLCEngine> | null = null;
let activeModelId: string | null = null;

export function getActiveModelId(): string | null {
  return activeModelId;
}

/**
 * Loads the WebLLM engine (only ever one at a time, cached for the session).
 * Falls back to a smaller model if the primary one fails to initialize.
 */
export function initEngine(onProgress: (progress: EngineProgress) => void): Promise<MLCEngine> {
  if (!isWebGpuSupported()) {
    return Promise.reject(new Error("WebGPU не поддерживается в этом браузере."));
  }
  if (enginePromise) return enginePromise;

  const load = async (): Promise<MLCEngine> => {
    const progressCallback = (report: { text: string; progress: number }): void => {
      onProgress({ text: report.text, progress: report.progress });
    };

    try {
      const engine = await CreateMLCEngine(PRIMARY_MODEL_ID, { initProgressCallback: progressCallback });
      activeModelId = PRIMARY_MODEL_ID;
      return engine;
    } catch (primaryError) {
      console.warn(`[diff-guard] Не удалось загрузить ${PRIMARY_MODEL_ID}, пробуем ${FALLBACK_MODEL_ID}`, primaryError);
      onProgress({ text: `Не удалось загрузить основную модель, пробуем запасную…`, progress: 0 });
      const engine = await CreateMLCEngine(FALLBACK_MODEL_ID, { initProgressCallback: progressCallback });
      activeModelId = FALLBACK_MODEL_ID;
      return engine;
    }
  };

  enginePromise = load()
    .then((engine) => {
      engineInstance = engine;
      return engine;
    })
    .catch((err: unknown) => {
      enginePromise = null;
      activeModelId = null;
      throw err;
    });

  return enginePromise;
}

export async function unloadEngine(): Promise<void> {
  if (engineInstance) {
    await engineInstance.unload();
  }
  engineInstance = null;
  enginePromise = null;
  activeModelId = null;
}

/**
 * Runs a streaming chat completion against the already-initialized engine and
 * parses the model's JSON response into AiAnalysisResult, reporting
 * best-effort partial results as tokens arrive.
 */
export async function analyzeDiff(
  diff: ParsedDiff,
  onChunk?: (partialResult: Partial<AiAnalysisResult>) => void,
): Promise<AiAnalysisResult> {
  if (!engineInstance) {
    throw new Error("WebLLM engine ещё не инициализирован — сначала вызовите initEngine().");
  }

  const { prompt, truncated } = buildUserPrompt(diff);
  if (truncated) {
    console.warn("[diff-guard] Diff превышает лимит контекста модели, отправлена усечённая версия.");
  }

  const completion = await engineInstance.chat.completions.create({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    stream: true,
    temperature: 0.2,
  });

  let accumulated = "";
  for await (const chunk of completion) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (!delta) continue;
    accumulated += delta;

    if (onChunk) {
      const partial = extractPartialAnalysis(accumulated);
      if (partial) onChunk(partial);
    }
  }

  const result = extractAndParseJson(accumulated);
  if (!result) {
    throw new Error("Модель вернула невалидный JSON — не удалось разобрать результат аудита.");
  }
  return result;
}
