<script lang="ts">
  import DiffDropzone from "./lib/DiffDropzone.svelte";
  import DiffViewer from "./lib/DiffViewer.svelte";
  import Sidebar from "./lib/dashboard/Sidebar.svelte";
  import ExportReportModal from "./lib/components/ExportReportModal.svelte";
  import { parseDiff, type ParsedDiff } from "./lib/parser/diffParser";
  import { streamMockAnalysis } from "./lib/services/mockAi";
  import { isWebGpuSupported } from "./lib/services/webgpu";
  import {
    analyzeDiff as analyzeDiffWithOllama,
    checkOllamaConnection,
    DEFAULT_OLLAMA_CONFIG,
    type OllamaConfig,
  } from "./lib/services/ollamaService";
  import {
    analyzeDiff as analyzeDiffWithAnthropic,
    DEFAULT_ANTHROPIC_CONFIG,
    loadAnthropicConfig,
    saveAnthropicConfig,
    type AnthropicConfig,
  } from "./lib/services/anthropicService";
  import type { LoadedDiff } from "./lib/types";
  import type { AiMode, AuditRulesConfig, EngineStatus } from "./lib/types/engine";
  import { DEFAULT_AUDIT_RULES } from "./lib/types/engine";
  import type { AiAnalysisResult, AiSuggestion, RiskLevel } from "./lib/types/generative";

  let diff: LoadedDiff | null = $state(null);
  let parsed: ParsedDiff = $derived.by(() => (diff ? parseDiff(diff.content) : { files: [] }));

  const webGpuSupported = isWebGpuSupported();

  let mode: AiMode = $state(webGpuSupported ? "webllm" : "mock");
  let engineStatus: EngineStatus = $state(webGpuSupported ? { kind: "idle" } : { kind: "no-webgpu" });
  let ollamaConfig: OllamaConfig = $state({ ...DEFAULT_OLLAMA_CONFIG });
  let anthropicConfig: AnthropicConfig = $state({ ...DEFAULT_ANTHROPIC_CONFIG });
  let auditRules: AuditRulesConfig = $state({ ...DEFAULT_AUDIT_RULES });

  $effect(() => {
    void loadAnthropicConfig().then((config) => {
      anthropicConfig = config;
    });
  });

  let overallRisk: RiskLevel | null = $state(null);
  let suggestions: AiSuggestion[] = $state([]);
  let isAuditing = $state(false);

  let statusText = $derived.by(() => {
    switch (engineStatus.kind) {
      case "idle":
        if (mode === "ollama") return "Ollama ещё не проверена — подключение проверится при запуске аудита.";
        if (mode === "anthropic") return "Укажите Anthropic API Key в сайдбаре и запустите аудит.";
        return "Модель ещё не загружена — загрузится при первом запуске аудита.";
      case "loading":
        return `${engineStatus.text} (${Math.round(engineStatus.progress * 100)}%)`;
      case "ready":
        return "Готово к аудиту.";
      case "no-webgpu":
        return "WebGPU недоступен в этом браузере — используйте Ollama или Mock Demo.";
      case "error":
        return `Ошибка: ${engineStatus.message}`;
    }
  });

  function handleLoad(loaded: LoadedDiff): void {
    diff = loaded;
    overallRisk = null;
    suggestions = [];
  }

  function reset(): void {
    diff = null;
    overallRisk = null;
    suggestions = [];
  }

  function handleModeChange(newMode: AiMode): void {
    mode = newMode;
    engineStatus = newMode === "webllm" && !webGpuSupported ? { kind: "no-webgpu" } : { kind: "idle" };
  }

  function handleOllamaConfigChange(config: OllamaConfig): void {
    ollamaConfig = config;
  }

  function handleAnthropicConfigChange(config: AnthropicConfig): void {
    anthropicConfig = config;
    void saveAnthropicConfig(config);
  }

  function handleAuditRulesChange(rules: AuditRulesConfig): void {
    auditRules = rules;
  }

  function mergeStreamedResult(partial: Partial<AiAnalysisResult>, seenIds: Set<string>): void {
    if (partial.overallRisk) overallRisk = partial.overallRisk;
    if (partial.suggestions) {
      for (const suggestion of partial.suggestions) {
        if (!seenIds.has(suggestion.id)) {
          seenIds.add(suggestion.id);
          suggestions = [...suggestions, suggestion];
        }
      }
    }
  }

  function mergeFinalResult(result: AiAnalysisResult, seenIds: Set<string>): void {
    overallRisk = result.overallRisk;
    for (const suggestion of result.suggestions) {
      if (!seenIds.has(suggestion.id)) {
        seenIds.add(suggestion.id);
        suggestions = [...suggestions, suggestion];
      }
    }
  }

  async function runMockAudit(): Promise<void> {
    for await (const event of streamMockAnalysis(parsed)) {
      if (event.kind === "risk") {
        overallRisk = event.overallRisk;
      } else if (event.kind === "suggestion") {
        suggestions = [...suggestions, event.suggestion];
      }
    }
  }

  async function runWebLlmAudit(): Promise<void> {
    if (!webGpuSupported) {
      engineStatus = { kind: "no-webgpu" };
      return;
    }

    // Lazy-loaded: @mlc-ai/web-llm is several MB and must not bloat the
    // initial dashboard bundle for users who never touch WebLLM mode.
    const { initEngine, analyzeDiff } = await import("./lib/services/webLlmService");

    if (engineStatus.kind !== "ready") {
      engineStatus = { kind: "loading", text: "Инициализация…", progress: 0 };
      try {
        await initEngine((progress) => {
          engineStatus = { kind: "loading", text: progress.text, progress: progress.progress };
        });
        engineStatus = { kind: "ready" };
      } catch (err) {
        engineStatus = { kind: "error", message: err instanceof Error ? err.message : String(err) };
        return;
      }
    }

    const seenIds = new Set<string>();
    try {
      const result = await analyzeDiff(parsed, (partial) => mergeStreamedResult(partial, seenIds), auditRules);
      mergeFinalResult(result, seenIds);
    } catch (err) {
      engineStatus = { kind: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  async function runOllamaAudit(): Promise<void> {
    engineStatus = { kind: "loading", text: `Проверка подключения к Ollama (${ollamaConfig.baseUrl})…`, progress: 0 };
    try {
      await checkOllamaConnection(ollamaConfig.baseUrl);
      engineStatus = { kind: "ready" };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      engineStatus = {
        kind: "error",
        message: `Не удалось подключиться к Ollama на ${ollamaConfig.baseUrl}. Запущен ли \`ollama serve\`? (${detail})`,
      };
      return;
    }

    const seenIds = new Set<string>();
    try {
      const result = await analyzeDiffWithOllama(
        parsed,
        ollamaConfig,
        (partial) => mergeStreamedResult(partial, seenIds),
        auditRules,
      );
      mergeFinalResult(result, seenIds);
    } catch (err) {
      engineStatus = { kind: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  async function runAnthropicAudit(): Promise<void> {
    if (!anthropicConfig.apiKey.trim()) {
      engineStatus = { kind: "error", message: "Укажите Anthropic API Key в настройках сайдбара." };
      return;
    }

    engineStatus = { kind: "loading", text: `Запрос к Anthropic API (${anthropicConfig.model})…`, progress: 0 };

    const seenIds = new Set<string>();
    try {
      const result = await analyzeDiffWithAnthropic(
        parsed,
        anthropicConfig,
        (partial) => mergeStreamedResult(partial, seenIds),
        auditRules,
      );
      mergeFinalResult(result, seenIds);
      engineStatus = { kind: "ready" };
    } catch (err) {
      engineStatus = { kind: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  async function runAudit(): Promise<void> {
    if (isAuditing) return;
    isAuditing = true;
    overallRisk = null;
    suggestions = [];

    try {
      if (mode === "mock") {
        await runMockAudit();
      } else if (mode === "ollama") {
        await runOllamaAudit();
      } else if (mode === "anthropic") {
        await runAnthropicAudit();
      } else {
        await runWebLlmAudit();
      }
    } finally {
      isAuditing = false;
    }
  }
</script>

<main class="dg-dashboard">
  <header class="dg-dashboard__header">
    <h1 class="dg-dashboard__title">diff-guard</h1>
    <span class="dg-dashboard__subtitle">Локальный AI-аудитор Git diff</span>
    <div class="dg-dashboard__header-actions">
      <ExportReportModal files={parsed.files} {overallRisk} {suggestions} />
    </div>
  </header>

  {#if !diff}
    <div class="dg-dashboard__empty">
      <DiffDropzone onLoad={handleLoad} />
    </div>
  {:else}
    <div class="dg-dashboard__body">
      <Sidebar
        fileName={diff.fileName}
        files={parsed.files}
        {mode}
        {engineStatus}
        {statusText}
        {overallRisk}
        {suggestions}
        {isAuditing}
        {webGpuSupported}
        {ollamaConfig}
        {anthropicConfig}
        {auditRules}
        onModeChange={handleModeChange}
        onOllamaConfigChange={handleOllamaConfigChange}
        onAnthropicConfigChange={handleAnthropicConfigChange}
        onAuditRulesChange={handleAuditRulesChange}
        onRunAudit={runAudit}
        onReset={reset}
      />
      <DiffViewer content={diff.content} {parsed} {suggestions} />
    </div>
  {/if}
</main>

<style>
  .dg-dashboard {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .dg-dashboard__header {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    flex: 0 0 auto;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--dg-border, #333);
  }

  .dg-dashboard__title {
    margin: 0;
    font-size: 1.15rem;
  }

  .dg-dashboard__subtitle {
    font-size: 0.8rem;
    color: var(--dg-text-muted, #999);
  }

  .dg-dashboard__header-actions {
    margin-left: auto;
  }

  .dg-dashboard__empty {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .dg-dashboard__empty :global(.dg-dropzone) {
    width: min(560px, 90vw);
  }

  .dg-dashboard__body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 320px 1fr;
  }

  @media (max-width: 900px) {
    .dg-dashboard__body {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
      overflow-y: auto;
    }
  }

  .dg-dashboard__body :global(.dg-viewer) {
    margin: 1rem 1.25rem 1rem 1rem;
    border-radius: 10px;
  }
</style>
