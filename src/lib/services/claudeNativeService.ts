import type { ParsedDiff } from "../parser/diffParser";
import type { AuditRulesConfig } from "../types/engine";
import { DEFAULT_AUDIT_RULES } from "../types/engine";
import type { AiAnalysisResult } from "../types/generative";
import { buildSystemPrompt, buildUserPrompt, extractAndParseJson } from "./prompts";

/** Must match "name" in native-host/com.diff_guard.bridge.json (see native-host/install.js). */
export const CLAUDE_NATIVE_HOST = "com.diff_guard.bridge";

interface NativePingResponse {
  status?: unknown;
  error?: unknown;
}

interface NativeAuditResponse {
  result?: unknown;
  error?: unknown;
}

/**
 * Wraps chrome.runtime.sendNativeMessage's callback API in a Promise.
 * sendNativeMessage opens a short-lived connection to the native host, sends
 * one message, and closes after the single response — no explicit
 * connect/disconnect bookkeeping needed here.
 */
function sendNativeMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(CLAUDE_NATIVE_HOST, message as object, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || "Нативный хост недоступен."));
        return;
      }
      resolve(response as T);
    });
  });
}

/**
 * Returns this extension's own ID (chrome.runtime.id) so the UI can show a
 * ready-to-copy `node native-host/install.js <id>` command instead of
 * sending the user to chrome://extensions to find it by hand. Returns null
 * outside an extension context (e.g. a plain browser tab during local dev).
 */
export function getExtensionId(): string | null {
  try {
    return typeof chrome !== "undefined" && chrome.runtime?.id ? chrome.runtime.id : null;
  } catch {
    return null;
  }
}

/**
 * Pings the native host to find out whether it's installed and `claude` is
 * reachable before the user commits to an audit run — mirrors
 * checkOllamaConnection's role for the Ollama engine. A missing/unregistered
 * host surfaces as chrome.runtime.lastError rather than a rejected response,
 * so any failure (timeout included) is treated as "not connected".
 */
export async function testConnection(timeoutMs = 3000): Promise<boolean> {
  try {
    const response = await Promise.race([
      sendNativeMessage<NativePingResponse>({ type: "ping" }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Нативный хост не ответил вовремя.")), timeoutMs);
      }),
    ]);
    return response?.status === "ok";
  } catch {
    return false;
  }
}

/**
 * Sends the diff to the native host, which shells out to `claude -p` on the
 * user's machine — the audit runs against an active Claude Code subscription
 * instead of billed Anthropic API tokens, and without a local HTTP server.
 * Unlike the Ollama/Anthropic engines this isn't streamed: the host only
 * replies once the CLI process exits, so there's no onChunk callback here.
 */
export async function analyzeDiff(
  diff: ParsedDiff,
  rules: AuditRulesConfig = DEFAULT_AUDIT_RULES,
): Promise<AiAnalysisResult> {
  const { prompt, truncated } = buildUserPrompt(diff);
  if (truncated) {
    console.warn("[diff-guard] Diff превышает лимит контекста модели, отправлена усечённая версия.");
  }

  const response = await sendNativeMessage<NativeAuditResponse>({
    compressedDiff: prompt,
    systemPrompt: buildSystemPrompt(rules),
  });

  if (response?.error) {
    throw new Error(`Claude Native Host вернул ошибку: ${String(response.error)}`);
  }

  const rawResult = typeof response?.result === "string" ? response.result : "";
  const result = extractAndParseJson(rawResult);
  if (!result) {
    throw new Error("Claude CLI вернул невалидный JSON — не удалось разобрать результат аудита.");
  }
  return result;
}
