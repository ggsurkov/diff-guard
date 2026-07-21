<script lang="ts">
  import { parseDiff } from "./parser/diffParser";
  import { streamMockAnalysis } from "./services/mockAi";
  import { isWebGpuSupported } from "./services/webgpu";
  import type { AiSuggestion, RiskLevel } from "./types/generative";
  import RiskHeatmap from "./components/widgets/RiskHeatmap.svelte";
  import InlineFixCard from "./components/widgets/InlineFixCard.svelte";
  import AnimationSandbox from "./components/widgets/AnimationSandbox.svelte";

  interface Props {
    content: string;
  }

  let { content }: Props = $props();

  let parsed = $derived(parseDiff(content));

  type AiMode = "webllm" | "mock";

  type EngineStatus =
    | { kind: "idle" }
    | { kind: "loading"; text: string; progress: number }
    | { kind: "ready" }
    | { kind: "no-webgpu" }
    | { kind: "error"; message: string };

  const webGpuSupported = isWebGpuSupported();

  let mode: AiMode = $state(webGpuSupported ? "webllm" : "mock");
  let engineStatus: EngineStatus = $state(webGpuSupported ? { kind: "idle" } : { kind: "no-webgpu" });

  let overallRisk: RiskLevel | null = $state(null);
  let suggestions: AiSuggestion[] = $state([]);
  let isAuditing = $state(false);

  let statusText = $derived.by(() => {
    switch (engineStatus.kind) {
      case "idle":
        return "Модель ещё не загружена — загрузится при первом запуске аудита.";
      case "loading":
        return `Загрузка весов модели: ${engineStatus.text} (${Math.round(engineStatus.progress * 100)}%)`;
      case "ready":
        return "Модель готова к аудиту.";
      case "no-webgpu":
        return "WebGPU недоступен в этом браузере — используйте режим Mock Demo.";
      case "error":
        return `Ошибка WebLLM: ${engineStatus.message}`;
    }
  });

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
    // initial side panel bundle for users who never touch WebLLM mode.
    const { initEngine, analyzeDiff } = await import("./services/webLlmService");

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
      const result = await analyzeDiff(parsed, (partial) => {
        if (partial.overallRisk) overallRisk = partial.overallRisk;
        if (partial.suggestions) {
          for (const suggestion of partial.suggestions) {
            if (!seenIds.has(suggestion.id)) {
              seenIds.add(suggestion.id);
              suggestions = [...suggestions, suggestion];
            }
          }
        }
      });

      overallRisk = result.overallRisk;
      for (const suggestion of result.suggestions) {
        if (!seenIds.has(suggestion.id)) {
          seenIds.add(suggestion.id);
          suggestions = [...suggestions, suggestion];
        }
      }
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
      } else {
        await runWebLlmAudit();
      }
    } finally {
      isAuditing = false;
    }
  }

  function suggestionsFor(filePath: string, lineNumber: number | null): AiSuggestion[] {
    if (lineNumber === null) return [];
    return suggestions.filter((s) => s.filePath === filePath && s.lineTarget === lineNumber);
  }
</script>

<div class="dg-viewer">
  <div class="dg-viewer__toolbar">
    <div class="dg-mode-toggle" role="radiogroup" aria-label="Режим ИИ-аудита">
      <button
        type="button"
        class="dg-mode-btn"
        class:dg-mode-btn--active={mode === "webllm"}
        disabled={!webGpuSupported}
        onclick={() => (mode = "webllm")}
      >
        ⚡ WebLLM (Локальный ИИ)
      </button>
      <button
        type="button"
        class="dg-mode-btn"
        class:dg-mode-btn--active={mode === "mock"}
        onclick={() => (mode = "mock")}
      >
        🧪 Mock Demo
      </button>
    </div>
    <button type="button" class="dg-viewer__audit-btn" onclick={runAudit} disabled={isAuditing}>
      {isAuditing ? "Анализирую…" : "🤖 Запустить ИИ-Аудит"}
    </button>
  </div>

  {#if mode === "webllm"}
    <div class="dg-status dg-status--{engineStatus.kind}">
      <span>{statusText}</span>
      {#if engineStatus.kind === "loading"}
        <div class="dg-status__bar"><div class="dg-status__bar-fill" style="width:{Math.round(engineStatus.progress * 100)}%"></div></div>
      {/if}
    </div>
  {/if}

  {#if overallRisk}
    <RiskHeatmap {overallRisk} {suggestions} />
  {/if}

  {#if parsed.files.length === 0}
    <p class="dg-viewer__fallback-note">Не удалось распознать формат git diff — показан исходный текст.</p>
    <pre class="dg-viewer__pre"><code>{content}</code></pre>
  {:else}
    {#each parsed.files as file, fileIndex (fileIndex)}
      <div class="dg-file">
        <div class="dg-file__header">
          {#if file.changeType === "renamed"}
            {file.oldFilePath} → {file.filePath}
          {:else}
            {file.filePath}
          {/if}
          <span class="dg-file__badge">{file.changeType}</span>
        </div>

        {#each file.hunks as hunk, hunkIndex (hunkIndex)}
          <div class="dg-hunk">
            <div class="dg-hunk__header">{hunk.header}</div>
            {#each hunk.lines as line, lineIndex (lineIndex)}
              <div class="dg-line dg-line--{line.type}">
                <span class="dg-line__num">{line.lineNumber ?? ""}</span>
                <span class="dg-line__marker">{line.type === "add" ? "+" : line.type === "delete" ? "-" : ""}</span>
                <span class="dg-line__content">{line.content}</span>
              </div>
              {#each suggestionsFor(file.filePath, line.lineNumber) as suggestion (suggestion.id)}
                <div class="dg-widget-slot">
                  {#if suggestion.type === "inline_fix"}
                    <InlineFixCard payload={suggestion.payload} />
                  {:else if suggestion.type === "animation_sandbox"}
                    <AnimationSandbox payload={suggestion.payload} />
                  {/if}
                </div>
              {/each}
            {/each}
          </div>
        {/each}
      </div>
    {/each}
  {/if}
</div>

<style>
  .dg-viewer {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.6rem;
    border: 1px solid var(--dg-border, #444);
    border-radius: 8px;
    background: var(--dg-code-bg, #1e1e1e);
  }

  .dg-viewer__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .dg-mode-toggle {
    display: flex;
    gap: 0.3rem;
  }

  .dg-mode-btn {
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .dg-mode-btn--active {
    border-color: var(--dg-accent, #4f8cff);
    background: var(--dg-accent-bg, rgba(79, 140, 255, 0.08));
  }

  .dg-mode-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .dg-viewer__audit-btn {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--dg-accent, #4f8cff);
    border-radius: 6px;
    background: var(--dg-accent-bg, rgba(79, 140, 255, 0.08));
    color: inherit;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .dg-viewer__audit-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .dg-status {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.45rem 0.6rem;
    border-radius: 6px;
    font-size: 0.76rem;
    border: 1px solid var(--dg-border, #444);
    color: var(--dg-text-muted, #999);
  }

  .dg-status--ready {
    border-color: rgba(63, 185, 80, 0.4);
    color: #3fb950;
  }

  .dg-status--error,
  .dg-status--no-webgpu {
    border-color: rgba(248, 81, 73, 0.4);
    color: #f85149;
  }

  .dg-status__bar {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .dg-status__bar-fill {
    height: 100%;
    background: var(--dg-accent, #4f8cff);
    transition: width 0.2s ease;
  }

  .dg-viewer__fallback-note {
    margin: 0;
    font-size: 0.8rem;
    color: var(--dg-text-muted, #999);
  }

  .dg-viewer__pre {
    margin: 0;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.8rem;
    line-height: 1.45;
    white-space: pre;
    color: var(--dg-code-text, #d4d4d4);
  }

  .dg-file {
    border: 1px solid var(--dg-border, #333);
    border-radius: 6px;
    overflow: scroll;
  }

  .dg-file__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    background: rgba(255, 255, 255, 0.04);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .dg-file__badge {
    font-size: 0.68rem;
    font-weight: 400;
    text-transform: uppercase;
    color: var(--dg-text-muted, #999);
  }

  .dg-hunk__header {
    padding: 0.2rem 0.6rem;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.72rem;
    color: var(--dg-text-muted, #999);
    background: rgba(255, 255, 255, 0.02);
  }

  .dg-line {
    display: flex;
    gap: 0.6rem;
    padding: 0 0.6rem;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.78rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .dg-line--add {
    background: rgba(63, 185, 80, 0.12);
  }

  .dg-line--delete {
    background: rgba(248, 81, 73, 0.12);
  }

  .dg-line__num {
    flex: 0 0 2.5rem;
    text-align: right;
    color: var(--dg-text-muted, #999);
    user-select: none;
  }

  .dg-line__marker {
    flex: 0 0 0.8rem;
    user-select: none;
  }

  .dg-line--add .dg-line__marker {
    color: #3fb950;
  }

  .dg-line--delete .dg-line__marker {
    color: #f85149;
  }

  .dg-line__content {
    flex: 1;
    min-width: 0;
  }

  .dg-widget-slot {
    padding: 0 0.6rem;
  }
</style>
