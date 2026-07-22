export type RiskLevel = "low" | "medium" | "high";

export interface InlineFixPayload {
  oldCode: string;
  newCode: string;
  explanation: string;
}

export interface AnimationSandboxPayload {
  /** Explanation shown in the banner above the animated preview. */
  description: string;
  /** Full CSS rule(s) for the sandbox's demo ".box" element, incl. @keyframes — drives the animated iframe preview. */
  badCss: string;
  goodCss: string;
  /** Real source snippet from the file, for the code-comparison view and for applyFixToFile find/replace. */
  badCode: string;
  goodCode: string;
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
