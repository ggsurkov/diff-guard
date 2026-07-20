export type RiskLevel = "low" | "medium" | "high";

export interface InlineFixPayload {
  oldCode: string;
  newCode: string;
  explanation: string;
}

export interface AnimationSandboxPayload {
  badCss: string;
  goodCss: string;
  explanation: string;
}

export interface UxTipPayload {
  description: string;
}

interface BaseSuggestion {
  id: string;
  filePath: string;
  lineTarget: number;
}

export interface InlineFixSuggestion extends BaseSuggestion {
  type: "inline_fix";
  payload: InlineFixPayload;
}

export interface AnimationSandboxSuggestion extends BaseSuggestion {
  type: "animation_sandbox";
  payload: AnimationSandboxPayload;
}

export interface UxTipSuggestion extends BaseSuggestion {
  type: "ux_tip";
  payload: UxTipPayload;
}

export type AiSuggestion = InlineFixSuggestion | AnimationSandboxSuggestion | UxTipSuggestion;

export interface AiAnalysisResult {
  overallRisk: RiskLevel;
  suggestions: AiSuggestion[];
}
