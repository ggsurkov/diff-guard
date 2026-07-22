<script lang="ts">
  import type { DiffFile } from "../parser/diffParser";
  import type { OllamaConfig } from "../services/ollamaService";
  import type { AiMode, AuditRulesConfig, EngineStatus } from "../types/engine";
  import type { AiSuggestion, RiskLevel } from "../types/generative";
  import RiskHeatmap from "../components/widgets/RiskHeatmap.svelte";
  import AuditSettings from "../components/AuditSettings.svelte";
  import {
    fileSystemState,
    isFileSystemAccessSupported,
    selectProjectFolder,
  } from "../services/fileSystemService.svelte";

  interface Props {
    fileName: string;
    files: DiffFile[];
    mode: AiMode;
    engineStatus: EngineStatus;
    statusText: string;
    overallRisk: RiskLevel | null;
    suggestions: AiSuggestion[];
    isAuditing: boolean;
    webGpuSupported: boolean;
    ollamaConfig: OllamaConfig;
    auditRules: AuditRulesConfig;
    onModeChange: (mode: AiMode) => void;
    onOllamaConfigChange: (config: OllamaConfig) => void;
    onAuditRulesChange: (rules: AuditRulesConfig) => void;
    onRunAudit: () => void;
    onReset: () => void;
  }

  let {
    fileName,
    files,
    mode,
    engineStatus,
    statusText,
    overallRisk,
    suggestions,
    isAuditing,
    webGpuSupported,
    ollamaConfig,
    auditRules,
    onModeChange,
    onOllamaConfigChange,
    onAuditRulesChange,
    onRunAudit,
    onReset,
  }: Props = $props();

  const fsSupported = isFileSystemAccessSupported();
  let folderPickError = $state<string | null>(null);

  async function handlePickFolder(): Promise<void> {
    folderPickError = null;
    try {
      await selectProjectFolder();
    } catch (err) {
      folderPickError = err instanceof Error ? err.message : String(err);
    }
  }

  function suggestionCountFor(filePath: string): number {
    return suggestions.filter((s) => s.filePath === filePath).length;
  }

  function jumpToFile(index: number): void {
    document.getElementById(`dg-file-${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleBaseUrlInput(event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value;
    onOllamaConfigChange({ ...ollamaConfig, baseUrl: value });
  }

  function handleModelInput(event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value;
    onOllamaConfigChange({ ...ollamaConfig, model: value });
  }
</script>

<aside class="dg-sidebar">
  <div class="dg-sidebar__section">
    <span class="dg-sidebar__filename" title={fileName}>{fileName}</span>
    <button type="button" class="dg-sidebar__reset" onclick={onReset}>Загрузить другой diff</button>
  </div>

  <div class="dg-sidebar__section">
    <h2 class="dg-sidebar__heading">Движок ИИ</h2>
    <div class="dg-engine-toggle" role="radiogroup" aria-label="Режим ИИ-аудита">
      <button
        type="button"
        class="dg-engine-btn"
        class:dg-engine-btn--active={mode === "webllm"}
        disabled={!webGpuSupported}
        onclick={() => onModeChange("webllm")}
      >
        🌐 WebLLM (WebGPU)
      </button>
      <button
        type="button"
        class="dg-engine-btn"
        class:dg-engine-btn--active={mode === "ollama"}
        onclick={() => onModeChange("ollama")}
      >
        🚀 Local Ollama (11434)
      </button>
      <button
        type="button"
        class="dg-engine-btn"
        class:dg-engine-btn--active={mode === "mock"}
        onclick={() => onModeChange("mock")}
      >
        🧪 Mock Demo
      </button>
    </div>

    {#if mode === "ollama"}
      <div class="dg-ollama-config">
        <label class="dg-ollama-config__field">
          <span>Base URL</span>
          <input type="text" value={ollamaConfig.baseUrl} oninput={handleBaseUrlInput} />
        </label>
        <label class="dg-ollama-config__field">
          <span>Модель</span>
          <input type="text" value={ollamaConfig.model} oninput={handleModelInput} />
        </label>
      </div>
    {/if}
  </div>

  {#if fsSupported}
    <div class="dg-sidebar__section">
      <h2 class="dg-sidebar__heading">Локальные файлы</h2>
      {#if fileSystemState.folderName}
        <div class="dg-folder-status">📁 Привязано: <strong>{fileSystemState.folderName}</strong></div>
      {/if}
      <button type="button" class="dg-folder-btn" onclick={handlePickFolder}>
        {fileSystemState.folderName ? "Сменить папку проекта" : "📁 Привязать папку проекта"}
      </button>
      {#if folderPickError}
        <div class="dg-folder-error">{folderPickError}</div>
      {/if}
    </div>
  {/if}

  <div class="dg-sidebar__section">
    <AuditSettings rules={auditRules} disabled={isAuditing} onChange={onAuditRulesChange} />

    <button type="button" class="dg-run-btn" onclick={onRunAudit} disabled={isAuditing}>
      {isAuditing ? "Анализирую…" : "🤖 Запустить ИИ-Аудит"}
    </button>

    {#if mode !== "mock"}
      <div class="dg-status dg-status--{engineStatus.kind}">
        <span>{statusText}</span>
        {#if engineStatus.kind === "loading"}
          <div class="dg-status__bar"><div class="dg-status__bar-fill" style="width:{Math.round(engineStatus.progress * 100)}%"></div></div>
        {/if}
      </div>
    {/if}
  </div>

  {#if overallRisk}
    <div class="dg-sidebar__section">
      <RiskHeatmap {overallRisk} {suggestions} />
    </div>
  {/if}

  <div class="dg-sidebar__section dg-sidebar__section--files">
    <h2 class="dg-sidebar__heading">Файлы ({files.length})</h2>
    <nav class="dg-file-nav">
      {#each files as file, index (index)}
        <button type="button" class="dg-file-nav__item" onclick={() => jumpToFile(index)}>
          <span class="dg-file-nav__path" title={file.filePath}>
            {#if file.changeType === "renamed"}
              {file.oldFilePath} → {file.filePath}
            {:else}
              {file.filePath}
            {/if}
          </span>
          <span class="dg-file-nav__badge">{file.changeType}</span>
          {#if suggestionCountFor(file.filePath) > 0}
            <span class="dg-file-nav__count">{suggestionCountFor(file.filePath)}</span>
          {/if}
        </button>
      {/each}
    </nav>
  </div>
</aside>

<style>
  .dg-sidebar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    overflow-y: auto;
    padding: 1rem;
    border-right: 1px solid var(--dg-border, #333);
  }

  .dg-sidebar__section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--dg-border, #2a2a2a);
  }

  .dg-sidebar__section--files {
    flex: 1;
    min-height: 0;
    border-bottom: none;
    padding-bottom: 0;
  }

  .dg-sidebar__heading {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--dg-text-muted, #999);
  }

  .dg-sidebar__filename {
    font-size: 0.85rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dg-sidebar__reset {
    align-self: flex-start;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.78rem;
  }

  .dg-sidebar__reset:hover {
    border-color: var(--dg-accent, #4f8cff);
  }

  .dg-engine-toggle {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .dg-engine-btn {
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.8rem;
    text-align: left;
  }

  .dg-engine-btn--active {
    border-color: var(--dg-accent, #4f8cff);
    background: var(--dg-accent-bg, rgba(79, 140, 255, 0.08));
  }

  .dg-engine-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .dg-ollama-config {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.5rem;
    border: 1px solid var(--dg-border, #333);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.02);
  }

  .dg-ollama-config__field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.72rem;
    color: var(--dg-text-muted, #999);
  }

  .dg-ollama-config__field input {
    padding: 0.3rem 0.45rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 5px;
    background: #141414;
    color: inherit;
    font-size: 0.78rem;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  }

  .dg-run-btn {
    padding: 0.55rem 0.8rem;
    border: 1px solid var(--dg-accent, #4f8cff);
    border-radius: 6px;
    background: var(--dg-accent-bg, rgba(79, 140, 255, 0.08));
    color: inherit;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .dg-run-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .dg-status {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    font-size: 0.74rem;
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

  .dg-folder-status {
    font-size: 0.78rem;
    color: var(--dg-text-muted, #999);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dg-folder-btn {
    align-self: flex-start;
    padding: 0.4rem 0.7rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .dg-folder-btn:hover {
    border-color: var(--dg-accent, #4f8cff);
  }

  .dg-folder-error {
    font-size: 0.74rem;
    color: #f85149;
  }

  .dg-file-nav {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    overflow-y: auto;
  }

  .dg-file-nav__item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.55rem;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font-size: 0.78rem;
  }

  .dg-file-nav__item:hover {
    border-color: var(--dg-border, #444);
    background: rgba(255, 255, 255, 0.03);
  }

  .dg-file-nav__path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dg-file-nav__badge {
    flex: 0 0 auto;
    font-size: 0.65rem;
    text-transform: uppercase;
    color: var(--dg-text-muted, #999);
  }

  .dg-file-nav__count {
    flex: 0 0 auto;
    min-width: 1.2rem;
    padding: 0.05rem 0.35rem;
    border-radius: 999px;
    background: var(--dg-accent, #4f8cff);
    color: #0a0a0a;
    font-size: 0.68rem;
    font-weight: 700;
    text-align: center;
  }
</style>
