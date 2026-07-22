import { compressDiffForAi, AI_DIFF_TRUNCATION_MARKER, type ParsedDiff } from "../parser/diffParser";
import type { AuditRulesConfig } from "../types/engine";
import { DEFAULT_AUDIT_RULES } from "../types/engine";
import type { AiAnalysisResult, AiSuggestion, RiskLevel } from "../types/generative";

/** Hard cap on findings returned to the UI — enforced both in the prompt and in code (see normalizeSuggestions). */
export const MAX_SUGGESTIONS = 3;

function buildFocusAreas(rules: AuditRulesConfig): string[] {
  const areas: string[] = [];

  if (rules.frameworkReactSvelte) {
    areas.push("React: замыкания и неполные/неверные массивы зависимостей useEffect/useMemo/useCallback.");
    areas.push("Svelte 5: устаревший синтаксис (export let, $:, <slot>) вместо рун $state/$derived/$effect/$props.");
    areas.push("Утечки памяти: неотписанные подписки, таймеры, event-листенеры, забытые AbortController/cleanup.");
  }
  if (rules.uiPerformance) {
    areas.push(
      "CSS/UI-производительность: анимации через margin/top/left/width вместо transform/opacity, layout thrashing и лишние reflow/repaint.",
    );
  }
  if (rules.typescriptSafety) {
    areas.push(
      "TypeScript: использование any, оператор ! (non-null assertion), небезопасные приведения типов (as), отсутствие строгой типизации на границах модулей.",
    );
  }
  if (rules.customRuleEnabled && rules.customRuleText.trim()) {
    areas.push(`Пользовательское правило: ${rules.customRuleText.trim()}`);
  }

  return areas;
}

/**
 * Builds the system prompt from the user's selected audit rule toggles (see
 * AuditSettings.svelte) — unchecked focus areas are dropped from the prompt
 * entirely rather than just de-prioritized, so the model doesn't waste its
 * limited output budget on findings the user opted out of.
 */
export function buildSystemPrompt(rules: AuditRulesConfig = DEFAULT_AUDIT_RULES): string {
  const focusAreas = buildFocusAreas(rules);
  const focusList =
    focusAreas.length > 0
      ? focusAreas.map((area, index) => `${index + 1}. ${area}`).join("\n")
      : "Общее ревью на баги, производительность и надёжность — без выделенного фокуса (все правила отключены пользователем).";

  return `Ты — Senior Frontend Code Auditor, проверяешь git diff перед мерджем.

Фокус ревью (в порядке приоритета):
${focusList}

Правила ответа:
- Отвечай ТОЛЬКО валидным JSON, без markdown-обрамления (без \`\`\`), без пояснений до или после JSON.
- Верни НЕ БОЛЕЕ 3 самых критичных замечаний на весь diff — не по одному на каждую строку. Отранжируй
  проблемы по реальному риску (баги, производительность, память) и включи только топ-3, остальное отбрось.
- Если ничего критичного не нашёл — лучше верни меньше замечаний или пустой список, чем натягивай мелкие
  придирки до значимых находок.
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
- payload для "animation_sandbox": {
    "description": string — подробное объяснение проблемы, например: "Анимация свойств margin-left и width
      вызывает пересчёт макета (reflow) на каждом кадре. Используйте transform: translate()/scale(), чтобы
      перенести анимацию на GPU.",
    "badCode": string — РЕАЛЬНАЯ строка/блок CSS из диффа, которую нужно заменить (например:
      "transition: margin-left 0.4s ease, width 0.4s ease;"). Обязана быть точной подстрокой, присутствующей
      в приведённом диффе, чтобы её можно было автоматически найти и заменить,
    "goodCode": string — оптимизированная замена для badCode (например:
      "transition: transform 0.4s ease;\ntransform: translate3d(0, 0, 0);"),
    "badCss": string, "goodCss": string — CSS-правила для класса ".box" (уже существующего в песочнице,
      отдельно от badCode/goodCode), которые ОБЯЗАНЫ включать @keyframes с бесконечным зацикленным движением,
      например: ".box{animation:jankMove 1.2s ease-in-out infinite alternate;}
      @keyframes jankMove{from{margin-left:0;}to{margin-left:calc(100% - 26px);}}". Эта анимация — только
      для наглядной демонстрации в песочнице, она должна проигрываться сама по себе сразу при загрузке;
      статичные стили, transition на :hover или любой другой эффект, требующий действия пользователя, недопустимы.
  }
- payload для "ux_tip": { "description": string }
- Каждая строка диффа промаркирована тегом в начале строки — это ЕДИНСТВЕННЫЙ источник номеров строк:
  "[L<номер>]" — реальный номер этой строки в НОВОМ файле (после применения диффа);
  "[DEL]" — строка была удалена и в новом файле не существует, у неё нет номера.
- lineTarget обязан быть числом из тега [L<номер>] ровно той строки, к которой относится замечание. Никогда не
  указывай lineTarget для строки с тегом [DEL] — такие строки не существуют в новом файле и не могут быть целью
  замечания. Не придумывай filePath и lineTarget, которых нет во входных данных.
- Если явных проблем не найдено — верни "overallRisk": "low" и пустой массив "suggestions": [].`;
}

export interface UserPrompt {
  prompt: string;
  truncated: boolean;
}

/**
 * Builds the user turn from a pre-compressed diff (see compressDiffForAi) to
 * stay within the context budget of a small local model — full unabridged
 * diffs are not sent (see .agents/harness/constraints.md).
 */
export function buildUserPrompt(diff: ParsedDiff): UserPrompt {
  const body = compressDiffForAi(diff);
  const truncated = body.includes(AI_DIFF_TRUNCATION_MARKER);

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
    const description = readString(payloadRecord, "description");
    const badCss = readString(payloadRecord, "badCss");
    const goodCss = readString(payloadRecord, "goodCss");
    const badCode = readString(payloadRecord, "badCode");
    const goodCode = readString(payloadRecord, "goodCode");
    if (description === null || badCss === null || goodCss === null || badCode === null || goodCode === null) {
      return null;
    }
    return {
      id,
      filePath,
      lineTarget,
      type: "animation_sandbox",
      payload: { description, badCss, goodCss, badCode, goodCode },
    };
  }

  if (record.type === "ux_tip") {
    const description = readString(payloadRecord, "description");
    if (description === null) return null;
    return { id, filePath, lineTarget, type: "ux_tip", payload: { description } };
  }

  return null;
}

/**
 * Identity key for a suggestion, independent of `id`. The model's `id` field
 * is unreliable across streamed chunks — a fallback id like `ai-inline_fix-2`
 * is derived from the suggestion's index in the (still-growing) partial JSON
 * array, so the same logical finding can get a different `id` on each parse
 * of the accumulating stream. filePath+lineTarget+type is what actually
 * identifies "the same card" to the user, so it's the dedup key everywhere
 * (see normalizeSuggestions below and the merge functions in App.svelte).
 */
export function suggestionKey(s: Pick<AiSuggestion, "filePath" | "lineTarget" | "type">): string {
  return `${s.filePath}:${s.lineTarget}:${s.type}`;
}

function normalizeSuggestions(raw: unknown): AiSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const result: AiSuggestion[] = [];
  const seenKeys = new Set<string>();
  raw.forEach((item, index) => {
    if (result.length >= MAX_SUGGESTIONS) return;
    const suggestion = normalizeSuggestion(item, index);
    if (!suggestion) return;
    const key = suggestionKey(suggestion);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    result.push(suggestion);
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
