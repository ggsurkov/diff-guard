<script lang="ts">
  import type { AiSuggestion, RiskLevel } from "../../types/generative";

  interface Props {
    overallRisk: RiskLevel;
    suggestions: AiSuggestion[];
  }

  let { overallRisk, suggestions }: Props = $props();

  const RISK_META: Record<RiskLevel, { emoji: string; label: string; modifier: string }> = {
    low: { emoji: "🟢", label: "Низкий риск", modifier: "dg-heatmap--low" },
    medium: { emoji: "🟡", label: "Средний риск", modifier: "dg-heatmap--medium" },
    high: { emoji: "🔴", label: "Высокий риск", modifier: "dg-heatmap--high" },
  };

  const TYPE_LABELS: Record<AiSuggestion["type"], string> = {
    inline_fix: "инлайн-фикс",
    animation_sandbox: "анимация",
    ux_tip: "UX-совет",
  };

  let meta = $derived(RISK_META[overallRisk]);
  let typesSummary = $derived(suggestions.map((s) => TYPE_LABELS[s.type]).join(", "));
</script>

<div class="dg-heatmap {meta.modifier}">
  <span class="dg-heatmap__emoji" aria-hidden="true">{meta.emoji}</span>
  <div class="dg-heatmap__body">
    <span class="dg-heatmap__label">{meta.label}</span>
    <span class="dg-heatmap__summary">
      {#if suggestions.length === 0}
        Замечаний не найдено
      {:else}
        Найдено замечаний: {suggestions.length} ({typesSummary})
      {/if}
    </span>
  </div>
</div>

<style>
  .dg-heatmap {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    border: 1px solid var(--dg-border, #444);
  }

  .dg-heatmap--low {
    background: rgba(63, 185, 80, 0.1);
    border-color: rgba(63, 185, 80, 0.4);
  }

  .dg-heatmap--medium {
    background: rgba(210, 153, 34, 0.12);
    border-color: rgba(210, 153, 34, 0.4);
  }

  .dg-heatmap--high {
    background: rgba(248, 81, 73, 0.12);
    border-color: rgba(248, 81, 73, 0.4);
  }

  .dg-heatmap__emoji {
    font-size: 1.4rem;
    line-height: 1;
  }

  .dg-heatmap__body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .dg-heatmap__label {
    font-weight: 600;
    font-size: 0.9rem;
  }

  .dg-heatmap__summary {
    font-size: 0.78rem;
    color: var(--dg-text-muted, #999);
  }
</style>
