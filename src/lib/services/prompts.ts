import type { ParsedDiff } from "../parser/diffParser";
import type { AiAnalysisResult, AiSuggestion, RiskLevel } from "../types/generative";

export const SYSTEM_PROMPT = `Ты — Senior Frontend Code Auditor, проверяешь git diff перед мерджем.

Фокус ревью (в порядке приоритета):
1. React: замыкания и неполные/неверные массивы зависимостей useEffect/useMemo/useCallback.
2. Svelte 5: устаревший синтаксис (export let, $:, <slot>) вместо рун $state/$derived/$effect/$props.
3. CSS-производительность: анимации через margin/top/left/width вместо transform/opacity (layout thrashing).
4. TypeScript: использование any, отсутствие строгой типизации на границах модулей.
5. Утечки памяти: неотписанные подписки, таймеры, event-листенеры, забытые AbortController/cleanup.

Правила ответа:
- Отвечай ТОЛЬКО валидным JSON, без markdown-обрамления (без \`\`\`), без пояснений до или после JSON.
- Строго следуй схеме:
{
  "overallRisk": "low" | "medium" | "high",
  "suggestions": [
    {
      "id": "string, уникальный",
      "filePath": "string — путь файла, ровно как в диффе",
      "lineTarget": number — номер строки из диффа, к которой относится замечание,
      "type": "inline_fix" | "animation_sandbox" | "ux_tip",
      "payload": { ... поля зависят от type, см. ниже }
    }
  ]
}
- payload для "inline_fix": { "oldCode": string, "newCode": string, "explanation": string }
- payload для "animation_sandbox": { "badCss": string, "goodCss": string, "explanation": string }
- payload для "ux_tip": { "description": string }
- lineTarget обязан совпадать с номером added/context-строки, реально присутствующей в предоставленном диффе. Не придумывай filePath и lineTarget, которых нет во входных данных.
- Если явных проблем не найдено — верни "overallRisk": "low" и пустой массив "suggestions": [].`;

const MAX_DIFF_CHARS = 6000;

export interface UserPrompt {
  prompt: string;
  truncated: boolean;
}

/**
 * Serializes only the changed (+/-) lines to keep the prompt within the
 * context budget of a small local model — full unabridged diffs are not
 * sent (see .agents/harness/constraints.md).
 */
export function buildUserPrompt(diff: ParsedDiff): UserPrompt {
  const lines: string[] = [];
  for (const file of diff.files) {
    lines.push(`### ${file.filePath} (${file.changeType})`);
    for (const hunk of file.hunks) {
      lines.push(hunk.header);
      for (const line of hunk.lines) {
        if (line.type === "normal" || line.lineNumber === null) continue;
        const marker = line.type === "add" ? "+" : "-";
        lines.push(`${marker}${line.lineNumber}: ${line.content}`);
      }
    }
  }

  let body = lines.join("\n");
  let truncated = false;
  if (body.length > MAX_DIFF_CHARS) {
    body = body.slice(0, MAX_DIFF_CHARS);
    truncated = true;
  }

  const prompt = `Проанализируй следующий git diff и верни JSON-отчёт по описанной схеме.${
    truncated ? " (Diff обрезан по размеру — анализируй то, что есть.)" : ""
  }\n\n${body}`;

  return { prompt, truncated };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const closedFence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  if (closedFence) return closedFence[1] ?? trimmed;
  const openFence = /^```(?:json)?\s*/.exec(trimmed);
  if (openFence) return trimmed.slice(openFence[0].length);
  return trimmed;
}

/** Best-effort auto-closer for a truncated JSON document accumulated mid-stream. */
function repairPartialJson(text: string): string {
  let inString = false;
  let escapeNext = false;
  const stack: Array<"{" | "["> = [];

  for (const ch of text) {
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === "\\") {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
    }
  }

  let repaired = text;
  if (inString) repaired += '"';

  // Drop a dangling trailing comma or an incomplete "key": with no value yet.
  repaired = repaired.replace(/,\s*$/, "");
  repaired = repaired.replace(/"[^"]*"\s*:\s*$/, "");
  repaired = repaired.replace(/,\s*$/, "");

  for (let i = stack.length - 1; i >= 0; i -= 1) {
    repaired += stack[i] === "{" ? "}" : "]";
  }

  return repaired;
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function normalizeSuggestion(raw: unknown, index: number): AiSuggestion | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const filePath = readString(record, "filePath");
  const lineTarget = typeof record.lineTarget === "number" ? record.lineTarget : null;
  if (filePath === null || lineTarget === null) return null;

  const id = readString(record, "id") ?? `ai-${record.type ?? "suggestion"}-${index}`;
  const payload = record.payload;
  if (typeof payload !== "object" || payload === null) return null;
  const payloadRecord = payload as Record<string, unknown>;

  if (record.type === "inline_fix") {
    const oldCode = readString(payloadRecord, "oldCode");
    const newCode = readString(payloadRecord, "newCode");
    const explanation = readString(payloadRecord, "explanation");
    if (oldCode === null || newCode === null || explanation === null) return null;
    return { id, filePath, lineTarget, type: "inline_fix", payload: { oldCode, newCode, explanation } };
  }

  if (record.type === "animation_sandbox") {
    const badCss = readString(payloadRecord, "badCss");
    const goodCss = readString(payloadRecord, "goodCss");
    const explanation = readString(payloadRecord, "explanation");
    if (badCss === null || goodCss === null || explanation === null) return null;
    return { id, filePath, lineTarget, type: "animation_sandbox", payload: { badCss, goodCss, explanation } };
  }

  if (record.type === "ux_tip") {
    const description = readString(payloadRecord, "description");
    if (description === null) return null;
    return { id, filePath, lineTarget, type: "ux_tip", payload: { description } };
  }

  return null;
}

function normalizeSuggestions(raw: unknown): AiSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const result: AiSuggestion[] = [];
  raw.forEach((item, index) => {
    const suggestion = normalizeSuggestion(item, index);
    if (suggestion) result.push(suggestion);
  });
  return result;
}

/** Strict parse of a complete model response into a full AiAnalysisResult. */
export function extractAndParseJson(rawText: string): AiAnalysisResult | null {
  const cleaned = stripCodeFences(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const overallRisk = isRiskLevel(record.overallRisk) ? record.overallRisk : "medium";
  const suggestions = normalizeSuggestions(record.suggestions);
  return { overallRisk, suggestions };
}

/**
 * Best-effort parse of a still-streaming response. Returns whatever fields
 * are currently well-formed (only fully closed suggestions are included) so
 * the UI can render results as they arrive; returns null if nothing usable yet.
 */
export function extractPartialAnalysis(rawText: string): Partial<AiAnalysisResult> | null {
  const cleaned = stripCodeFences(rawText);
  const repaired = repairPartialJson(cleaned);

  let parsed: unknown;
  try {
    parsed = JSON.parse(repaired);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const result: Partial<AiAnalysisResult> = {};
  if (isRiskLevel(record.overallRisk)) result.overallRisk = record.overallRisk;

  const suggestions = normalizeSuggestions(record.suggestions);
  if (suggestions.length > 0) result.suggestions = suggestions;

  if (result.overallRisk === undefined && result.suggestions === undefined) return null;
  return result;
}
