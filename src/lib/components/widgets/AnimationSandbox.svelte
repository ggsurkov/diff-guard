<script lang="ts">
  import type { AnimationSandboxPayload } from "../../types/generative";

  interface Props {
    payload: AnimationSandboxPayload;
  }

  let { payload }: Props = $props();

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
  <p class="dg-sandbox__explanation">{payload.explanation}</p>

  <div class="dg-sandbox__cols">
    <div class="dg-sandbox__col">
      <span class="dg-sandbox__label dg-sandbox__label--bad">До · ~{badAvg} FPS</span>
      <iframe class="dg-sandbox__frame" title="Дёрганая анимация" sandbox="" srcdoc={badSrcDoc}></iframe>
      <div class="dg-sandbox__sparkline">
        {#each badFpsSamples as v, i (i)}
          <span class="dg-sandbox__bar dg-sandbox__bar--bad" style="height:{(v / 60) * 100}%"></span>
        {/each}
      </div>
    </div>

    <div class="dg-sandbox__col">
      <span class="dg-sandbox__label dg-sandbox__label--good">После · ~{goodAvg} FPS</span>
      <iframe class="dg-sandbox__frame" title="Плавная анимация" sandbox="" srcdoc={goodSrcDoc}></iframe>
      <div class="dg-sandbox__sparkline">
        {#each goodFpsSamples as v, i (i)}
          <span class="dg-sandbox__bar dg-sandbox__bar--good" style="height:{(v / 60) * 100}%"></span>
        {/each}
      </div>
    </div>
  </div>
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

  .dg-sandbox__explanation {
    margin: 0;
    font-size: 0.8rem;
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
</style>
