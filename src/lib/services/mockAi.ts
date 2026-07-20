import type { ParsedDiff } from "../parser/diffParser";
import type { AiSuggestion, RiskLevel } from "../types/generative";

export type AiStreamEvent =
  | { kind: "risk"; overallRisk: RiskLevel }
  | { kind: "suggestion"; suggestion: AiSuggestion }
  | { kind: "done" };

interface AddLineRef {
  filePath: string;
  lineNumber: number;
}

function collectAddLines(diff: ParsedDiff): AddLineRef[] {
  const refs: AddLineRef[] = [];
  for (const file of diff.files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === "add" && line.lineNumber !== null) {
          refs.push({ filePath: file.filePath, lineNumber: line.lineNumber });
        }
      }
    }
  }
  return refs;
}

function buildMockSuggestions(diff: ParsedDiff): AiSuggestion[] {
  const addLines = collectAddLines(diff);
  if (addLines.length === 0) return [];

  const suggestions: AiSuggestion[] = [];
  const animationTarget = addLines[0]!;

  suggestions.push({
    id: "mock-animation-margin",
    filePath: animationTarget.filePath,
    lineTarget: animationTarget.lineNumber,
    type: "animation_sandbox",
    payload: {
      badCss: `.box{animation:jankMove 1.2s ease-in-out infinite alternate;}
@keyframes jankMove{from{margin-left:0;}to{margin-left:calc(100% - 26px);}}`,
      goodCss: `.box{animation:smoothMove 1.2s ease-in-out infinite alternate;}
@keyframes smoothMove{from{transform:translate(0,-50%);}to{transform:translate(calc(100% - 26px),-50%);}}`,
      explanation:
        "Анимация двигает элемент через `margin-left`, из-за чего браузер пересчитывает layout всей страницы на каждом кадре. Замена на `transform: translate()` переносит анимацию на compositor-поток — плавно и почти бесплатно по CPU.",
    },
  });

  const fixTarget = addLines[1] ?? addLines[0]!;
  suggestions.push({
    id: "mock-fix-use-effect-deps",
    filePath: fixTarget.filePath,
    lineTarget: fixTarget.lineNumber,
    type: "inline_fix",
    payload: {
      oldCode: "useEffect(() => {\n  fetchData();\n});",
      newCode: "useEffect(() => {\n  fetchData();\n}, []);",
      explanation:
        "Без массива зависимостей эффект выполняется на каждый рендер компонента, что приводит к лишним сетевым запросам. Пустой массив `[]` запускает эффект один раз при монтировании.",
    },
  });

  return suggestions;
}

function computeRisk(suggestions: AiSuggestion[]): RiskLevel {
  if (suggestions.length === 0) return "low";
  if (suggestions.length === 1) return "medium";
  return "high";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Stands in for a real WebLLM inference call: emits the same event shape
 * (risk first, then suggestions one by one) with artificial latency, so the
 * UI streaming path can be built and tested before the model is wired in.
 */
export async function* streamMockAnalysis(diff: ParsedDiff): AsyncGenerator<AiStreamEvent, void, unknown> {
  const suggestions = buildMockSuggestions(diff);

  await delay(600);
  yield { kind: "risk", overallRisk: computeRisk(suggestions) };

  for (const suggestion of suggestions) {
    await delay(700);
    yield { kind: "suggestion", suggestion };
  }

  yield { kind: "done" };
}
