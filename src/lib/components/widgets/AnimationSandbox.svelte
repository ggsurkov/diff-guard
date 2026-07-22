<script lang="ts">
  import type { AnimationSandboxPayload } from "../../types/generative";
  import { appliedFixIds, applyFixToFile, fileSystemState } from "../../services/fileSystemService.svelte";

  interface Props {
    suggestionId: string;
    filePath: string;
    payload: AnimationSandboxPayload;
  }

  let { suggestionId, filePath, payload }: Props = $props();

  let copied = $state(false);
  let applyState: "idle" | "applying" | "error" = $state("idle");
  let applyError = $state<string | null>(null);

  // Same module-level reactive set InlineFixCard uses — shared source of
  // truth so DiffViewer can highlight the fixed line regardless of which
  // widget applied it.
  let isApplied = $derived(appliedFixIds.has(suggestionId));

  async function copyFix(): Promise<void> {
    await navigator.clipboard.writeText(payload.goodCode);
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
      await applyFixToFile(suggestionId, filePath, payload.badCode, payload.goodCode);
      applyState = "idle";
    } catch (err) {
      applyState = "error";
      applyError = err instanceof Error ? err.message : String(err);
    }
  }

  // Pure-CSS demo, no scripting needed inside the frame — keep the sandbox
  // fully locked down (no allow-scripts/allow-same-origin at all).
  function buildSrcDoc(css: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#111;overflow:hidden;}
.track{position:relative;height:100%;}
.box{position:absolute;top:50%;left:0;width:26px;height:26px;border-radius:6px;background:#4f8cff;transform:translateY(-50%);}
${css}
</style></head><body><div class="track"><div class="box"></div></div></body></html>`;
  }

  let badSrcDoc = $derived(buildSrcDoc(payload.badCss));
  let goodSrcDoc = $derived(buildSrcDoc(payload.goodCss));

  // Bumped by the Replay button and used as an {#key} on both <iframe>s below,
  // forcing Svelte to destroy and recreate the elements. That's the only
  // reliable way to restart CSS playback inside a `srcdoc` frame regardless of
  // whether the AI's CSS loops forever on its own or only fires once.
  let replayToken = $state(0);
  function replay(): void {
    replayToken += 1;
  }

  // Simulated (not measured) FPS samples — illustrates the typical difference
  // between a layout-triggering (margin) and a compositor-only (transform) animation.
  const badFpsSamples = [42, 35, 51, 22, 47, 18, 44, 26, 50, 21];
  const goodFpsSamples = [60, 59, 60, 58, 60, 60, 59, 60, 60, 59];

  function average(samples: number[]): number {
    return Math.round(samples.reduce((sum, v) => sum + v, 0) / samples.length);
  }

  let badAvg = average(badFpsSamples);
  let goodAvg = average(goodFpsSamples);
</script>

<div class="dg-sandbox">
  <div class="dg-sandbox__title">🎬 Песочница анимаций</div>

  <div class="dg-sandbox__problem">
    <span class="dg-sandbox__problem-icon">⚠️</span>
    <div>
      <p class="dg-sandbox__explanation">{payload.description}</p>
      <p class="dg-sandbox__why">
        💡 Почему это важно: анимация через margin/width нагружает CPU, а transform работает через композитные слои
        GPU (60 FPS).
      </p>
    </div>
  </div>

  <div class="dg-sandbox__cols">
    <div class="dg-sandbox__col">
      <span class="dg-sandbox__label dg-sandbox__label--bad">До · ~{badAvg} FPS</span>
      {#key replayToken}
        <iframe class="dg-sandbox__frame" title="Дёрганая анимация" sandbox="" srcdoc={badSrcDoc}></iframe>
      {/key}
      <div class="dg-sandbox__sparkline">
        {#each badFpsSamples as v, i (i)}
          <span class="dg-sandbox__bar dg-sandbox__bar--bad" style="height:{(v / 60) * 100}%"></span>
        {/each}
      </div>
    </div>

    <div class="dg-sandbox__col">
      <span class="dg-sandbox__label dg-sandbox__label--good">После · ~{goodAvg} FPS</span>
      {#key replayToken}
        <iframe class="dg-sandbox__frame" title="Плавная анимация" sandbox="" srcdoc={goodSrcDoc}></iframe>
      {/key}
      <div class="dg-sandbox__sparkline">
        {#each goodFpsSamples as v, i (i)}
          <span class="dg-sandbox__bar dg-sandbox__bar--good" style="height:{(v / 60) * 100}%"></span>
        {/each}
      </div>
    </div>
  </div>

  <button type="button" class="dg-sandbox__replay" onclick={replay}>🔄 Перезапустить анимацию</button>

  <details class="dg-sandbox__code">
    <summary class="dg-sandbox__code-summary">Показать сравнение кода</summary>
    <div class="dg-sandbox__code-cols">
      <div class="dg-sandbox__code-col">
        <span class="dg-sandbox__code-label dg-sandbox__code-label--bad">🔴 Текущий код</span>
        <pre class="dg-sandbox__code-block dg-sandbox__code-block--bad"><code>{payload.badCode}</code></pre>
      </div>
      <div class="dg-sandbox__code-col">
        <span class="dg-sandbox__code-label dg-sandbox__code-label--good">🟢 Предлагаемый фикс</span>
        <pre class="dg-sandbox__code-block dg-sandbox__code-block--good"><code>{payload.goodCode}</code></pre>
      </div>
    </div>
  </details>

  <div class="dg-sandbox__actions">
    <button type="button" class="dg-sandbox__copy" onclick={copyFix}>
      {copied ? "Скопировано ✓" : "📋 Скопировать фикс"}
    </button>
    {#if fileSystemState.dirHandle}
      {#if isApplied}
        <div class="dg-sandbox__applied">✅ Фикс успешно применён!</div>
      {:else}
        <button type="button" class="dg-sandbox__apply" onclick={applyToFile} disabled={applyState === "applying"}>
          {applyState === "applying" ? "Применяю…" : "💾 Применить фикс прямо в файл"}
        </button>
      {/if}
    {/if}
  </div>
  {#if applyState === "error"}
    <p class="dg-sandbox__status dg-sandbox__status--error">Не удалось применить фикс: {applyError}</p>
  {/if}
</div>

<style>
  .dg-sandbox {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0.35rem 0 0.6rem;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
  }

  .dg-sandbox__title {
    font-size: 0.8rem;
    font-weight: 600;
  }

  .dg-sandbox__problem {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid rgba(240, 136, 62, 0.4);
    border-radius: 6px;
    background: rgba(240, 136, 62, 0.08);
  }

  .dg-sandbox__problem-icon {
    flex: 0 0 auto;
    line-height: 1.4;
  }

  .dg-sandbox__explanation {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.4;
    color: #ddd;
  }

  .dg-sandbox__why {
    margin: 0.3rem 0 0;
    font-size: 0.74rem;
    line-height: 1.4;
    color: var(--dg-text-muted, #999);
  }

  .dg-sandbox__cols {
    display: flex;
    gap: 0.6rem;
  }

  .dg-sandbox__col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .dg-sandbox__label {
    font-size: 0.72rem;
    font-weight: 600;
  }

  .dg-sandbox__label--bad {
    color: #f85149;
  }

  .dg-sandbox__label--good {
    color: #3fb950;
  }

  .dg-sandbox__frame {
    width: 100%;
    height: 48px;
    border: none;
    border-radius: 6px;
    background: #111;
  }

  .dg-sandbox__sparkline {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 24px;
  }

  .dg-sandbox__bar {
    flex: 1;
    min-width: 2px;
    border-radius: 1px;
  }

  .dg-sandbox__bar--bad {
    background: #f85149;
  }

  .dg-sandbox__bar--good {
    background: #3fb950;
  }

  .dg-sandbox__replay {
    align-self: flex-start;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.78rem;
  }

  .dg-sandbox__replay:hover {
    border-color: var(--dg-accent, #4f8cff);
  }

  .dg-sandbox__code {
    border-top: 1px solid var(--dg-border, #444);
    padding-top: 0.5rem;
  }

  .dg-sandbox__code-summary {
    cursor: pointer;
    font-size: 0.78rem;
    color: var(--dg-text-muted, #999);
    user-select: none;
  }

  .dg-sandbox__code-summary:hover {
    color: var(--dg-accent, #4f8cff);
  }

  .dg-sandbox__code-cols {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }

  .dg-sandbox__code-col {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    border-radius: 6px;
    overflow: hidden;
  }

  .dg-sandbox__code-label {
    padding: 0.15rem 0.5rem 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    color: var(--dg-text-muted, #999);
  }

  .dg-sandbox__code-block {
    margin: 0;
    padding: 0.3rem 0.5rem 0.5rem;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.75rem;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .dg-sandbox__code-block--bad {
    background: rgba(248, 81, 73, 0.1);
    color: #ff8f88;
  }

  .dg-sandbox__code-block--good {
    background: rgba(63, 185, 80, 0.1);
    color: #6fda8c;
  }

  .dg-sandbox__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .dg-sandbox__copy,
  .dg-sandbox__apply {
    align-self: flex-start;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.78rem;
  }

  .dg-sandbox__copy:hover,
  .dg-sandbox__apply:hover {
    border-color: var(--dg-accent, #4f8cff);
  }

  .dg-sandbox__apply {
    border-color: rgba(63, 185, 80, 0.5);
  }

  .dg-sandbox__apply:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .dg-sandbox__applied {
    align-self: flex-start;
    padding: 0.3rem 0.7rem;
    border: 1px solid rgba(63, 185, 80, 0.5);
    border-radius: 6px;
    background: rgba(63, 185, 80, 0.15);
    color: #3fb950;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .dg-sandbox__status {
    margin: 0;
    font-size: 0.76rem;
  }

  .dg-sandbox__status--error {
    color: #f85149;
  }
</style>
