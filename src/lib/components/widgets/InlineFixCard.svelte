<script lang="ts">
  import type { InlineFixPayload } from "../../types/generative";
  import { appliedFixIds, applyFixToFile, fileSystemState } from "../../services/fileSystemService.svelte";

  interface Props {
    suggestionId: string;
    filePath: string;
    payload: InlineFixPayload;
  }

  let { suggestionId, filePath, payload }: Props = $props();

  let copied = $state(false);
  let applyState: "idle" | "applying" | "error" = $state("idle");
  let applyError = $state<string | null>(null);

  // Source of truth for "was this fix written to disk" — a module-level
  // reactive set (not local component state) so the applied status survives
  // this card being destroyed/recreated and is visible to DiffViewer too
  // (it highlights the corresponding line using the same set).
  let isApplied = $derived(appliedFixIds.has(suggestionId));

  async function copyFix(): Promise<void> {
    await navigator.clipboard.writeText(payload.newCode);
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 1500);
  }

  async function applyToFile(): Promise<void> {
    if (isApplied || applyState === "applying") return;
    applyState = "applying";
    applyError = null;
    try {
      await applyFixToFile(suggestionId, filePath, payload.oldCode, payload.newCode);
      applyState = "idle";
    } catch (err) {
      applyState = "error";
      applyError = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<div class="dg-fix">
  <div class="dg-fix__title">🤖 ИИ-фикс</div>
  <p class="dg-fix__explanation">{payload.explanation}</p>
  <div class="dg-fix__diff">
    <div class="dg-fix__col dg-fix__col--old">
      <span class="dg-fix__label">До</span>
      <pre class="dg-fix__code">{payload.oldCode}</pre>
    </div>
    <div class="dg-fix__col dg-fix__col--new">
      <span class="dg-fix__label">После</span>
      <pre class="dg-fix__code">{payload.newCode}</pre>
    </div>
  </div>
  <div class="dg-fix__actions">
    <button type="button" class="dg-fix__copy" onclick={copyFix}>
      {copied ? "Скопировано ✓" : "Скопировать фикс"}
    </button>
    {#if fileSystemState.dirHandle}
      {#if isApplied}
        <div class="dg-fix__applied">✅ Фикс успешно применён к файлу</div>
      {:else}
        <button type="button" class="dg-fix__apply" onclick={applyToFile} disabled={applyState === "applying"}>
          {applyState === "applying" ? "Применяю…" : "💾 Применить фикс прямо в файл"}
        </button>
      {/if}
    {/if}
  </div>
  {#if applyState === "error"}
    <p class="dg-fix__status dg-fix__status--error">Не удалось применить фикс: {applyError}</p>
  {/if}
</div>

<style>
  .dg-fix {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0.35rem 0 0.6rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--dg-accent, #4f8cff);
    border-radius: 8px;
    background: var(--dg-accent-bg, rgba(79, 140, 255, 0.08));
  }

  .dg-fix__title {
    font-size: 0.8rem;
    font-weight: 600;
  }

  .dg-fix__explanation {
    margin: 0;
    font-size: 0.8rem;
    color: var(--dg-text-muted, #999);
  }

  .dg-fix__diff {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .dg-fix__col {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border-radius: 6px;
    overflow: hidden;
  }

  .dg-fix__col--old {
    background: rgba(248, 81, 73, 0.1);
  }

  .dg-fix__col--new {
    background: rgba(63, 185, 80, 0.1);
  }

  .dg-fix__label {
    padding: 0.15rem 0.5rem 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    color: var(--dg-text-muted, #999);
  }

  .dg-fix__code {
    margin: 0;
    padding: 0.3rem 0.5rem 0.5rem;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.75rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .dg-fix__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .dg-fix__copy,
  .dg-fix__apply {
    align-self: flex-start;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.78rem;
  }

  .dg-fix__copy:hover,
  .dg-fix__apply:hover {
    border-color: var(--dg-accent, #4f8cff);
  }

  .dg-fix__apply {
    border-color: rgba(63, 185, 80, 0.5);
  }

  .dg-fix__apply:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .dg-fix__applied {
    align-self: flex-start;
    padding: 0.3rem 0.7rem;
    border: 1px solid rgba(63, 185, 80, 0.5);
    border-radius: 6px;
    background: rgba(63, 185, 80, 0.15);
    color: #3fb950;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .dg-fix__status {
    margin: 0;
    font-size: 0.76rem;
  }

  .dg-fix__status--error {
    color: #f85149;
  }
</style>
