<script lang="ts">
  import type { DiffFile } from "../parser/diffParser";
  import type { AiSuggestion, RiskLevel } from "../types/generative";
  import { buildPrReport } from "../services/reportExport";

  interface Props {
    files: DiffFile[];
    overallRisk: RiskLevel | null;
    suggestions: AiSuggestion[];
  }

  let { files, overallRisk, suggestions }: Props = $props();

  let isOpen = $state(false);
  let copied = $state(false);

  let report = $derived(buildPrReport(files, overallRisk, suggestions));

  function open(): void {
    copied = false;
    isOpen = true;
  }

  function close(): void {
    isOpen = false;
  }

  async function copyReport(): Promise<void> {
    await navigator.clipboard.writeText(report);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 1500);
  }

  function handleOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") close();
  }
</script>

<svelte:window onkeydown={isOpen ? handleOverlayKeydown : undefined} />

<button type="button" class="dg-export-trigger" onclick={open}>📋 Экспорт отчёта для PR</button>

{#if isOpen}
  <div class="dg-export-overlay" role="presentation" onclick={close}>
    <div
      class="dg-export-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Экспорт отчёта для PR"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="dg-export-modal__header">
        <h2 class="dg-export-modal__title">Отчёт для Pull Request</h2>
        <button type="button" class="dg-export-modal__close" onclick={close} aria-label="Закрыть">✕</button>
      </div>
      <pre class="dg-export-modal__body">{report}</pre>
      <div class="dg-export-modal__footer">
        <button type="button" class="dg-export-modal__copy" onclick={copyReport}>
          {copied ? "Скопировано ✓" : "📋 Скопировать отчёт для PR"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dg-export-trigger {
    padding: 0.4rem 0.8rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .dg-export-trigger:hover {
    border-color: var(--dg-accent, #4f8cff);
  }

  .dg-export-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    z-index: 100;
    padding: 1.5rem;
  }

  .dg-export-modal {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(640px, 100%);
    max-height: 80vh;
    padding: 1rem 1.1rem;
    border: 1px solid var(--dg-border, #444);
    border-radius: 10px;
    background: var(--dg-code-bg, #1e1e1e);
  }

  .dg-export-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .dg-export-modal__title {
    margin: 0;
    font-size: 1rem;
  }

  .dg-export-modal__close {
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.9rem;
    opacity: 0.7;
  }

  .dg-export-modal__close:hover {
    opacity: 1;
  }

  .dg-export-modal__body {
    margin: 0;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--dg-border, #333);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.78rem;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .dg-export-modal__footer {
    display: flex;
    justify-content: flex-end;
  }

  .dg-export-modal__copy {
    padding: 0.45rem 0.8rem;
    border: 1px solid var(--dg-accent, #4f8cff);
    border-radius: 6px;
    background: var(--dg-accent-bg, rgba(79, 140, 255, 0.08));
    color: inherit;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 600;
  }
</style>
