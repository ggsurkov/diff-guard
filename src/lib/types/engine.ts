export type AiMode = "webllm" | "ollama" | "anthropic" | "mock";

export type EngineStatus =
  | { kind: "idle" }
  | { kind: "loading"; text: string; progress: number }
  | { kind: "ready" }
  | { kind: "no-webgpu" }
  | { kind: "error"; message: string };

/** Which review focus areas are folded into the system prompt for the next audit run. */
export interface AuditRulesConfig {
  typescriptSafety: boolean;
  uiPerformance: boolean;
  frameworkReactSvelte: boolean;
  customRuleEnabled: boolean;
  customRuleText: string;
}

export const DEFAULT_AUDIT_RULES: AuditRulesConfig = {
  typescriptSafety: true,
  uiPerformance: true,
  frameworkReactSvelte: true,
  customRuleEnabled: false,
  customRuleText: "",
};
