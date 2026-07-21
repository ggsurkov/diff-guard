export type AiMode = "webllm" | "ollama" | "mock";

export type EngineStatus =
  | { kind: "idle" }
  | { kind: "loading"; text: string; progress: number }
  | { kind: "ready" }
  | { kind: "no-webgpu" }
  | { kind: "error"; message: string };
