import type { DiffFile } from "../parser/diffParser";
import type { AiSuggestion, RiskLevel } from "../types/generative";

const RISK_LABEL: Record<RiskLevel, string> = {
  high: "🔴 High",
  medium: "🟡 Medium",
  low: "🟢 Low",
};

const RISK_WORD: Record<RiskLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const TYPE_LABEL: Record<AiSuggestion["type"], string> = {
  inline_fix: "Инлайн-фикс",
  animation_sandbox: "CSS-анимация",
  ux_tip: "UX-совет",
};

function describeSuggestion(suggestion: AiSuggestion): string {
  switch (suggestion.type) {
    case "inline_fix":
      return suggestion.payload.explanation;
    case "animation_sandbox":
      return suggestion.payload.explanation;
    case "ux_tip":
      return suggestion.payload.description;
  }
}

function buildSummary(overallRisk: RiskLevel, suggestions: AiSuggestion[]): string {
  if (suggestions.length === 0) {
    return "ИИ-аудит не обнаружил критичных замечаний в этом diff.";
  }
  const fileCount = new Set(suggestions.map((s) => s.filePath)).size;
  return (
    `ИИ-аудит нашёл ${suggestions.length} замечани${suggestions.length === 1 ? "е" : "й"} ` +
    `в ${fileCount} файл${fileCount === 1 ? "е" : "ах"}, общий риск изменений — ${RISK_WORD[overallRisk]}.`
  );
}

/**
 * Renders the current audit state as a Markdown report meant to be pasted
 * straight into a Pull Request description.
 */
export function buildPrReport(files: DiffFile[], overallRisk: RiskLevel | null, suggestions: AiSuggestion[]): string {
  const risk = overallRisk ?? "low";
  const lines: string[] = [];

  lines.push("## 🛡️ diff-guard — отчёт аудита", "");
  lines.push(`**Общий риск:** ${RISK_LABEL[risk]}`, "");

  lines.push(`### Проверенные файлы (${files.length})`, "");
  if (files.length === 0) {
    lines.push("_Файлы не найдены._");
  } else {
    for (const file of files) {
      const path = file.changeType === "renamed" ? `${file.oldFilePath} → ${file.filePath}` : file.filePath;
      lines.push(`- \`${path}\` (${file.changeType})`);
    }
  }
  lines.push("");

  lines.push(`### Замечания (${suggestions.length})`, "");
  if (suggestions.length === 0) {
    lines.push("_Критичных замечаний не найдено._");
  } else {
    suggestions.forEach((suggestion, index) => {
      lines.push(`${index + 1}. **${TYPE_LABEL[suggestion.type]}** — \`${suggestion.filePath}:${suggestion.lineTarget}\``);
      lines.push(`   ${describeSuggestion(suggestion)}`);
    });
  }
  lines.push("");

  lines.push("### Резюме для PR", "");
  lines.push(buildSummary(risk, suggestions));

  return lines.join("\n");
}
