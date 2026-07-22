<script lang="ts">
  import type { AuditRulesConfig } from "../types/engine";

  interface Props {
    rules: AuditRulesConfig;
    disabled: boolean;
    onChange: (rules: AuditRulesConfig) => void;
  }

  let { rules, disabled, onChange }: Props = $props();

  function toggle(key: "typescriptSafety" | "uiPerformance" | "frameworkReactSvelte" | "customRuleEnabled"): void {
    onChange({ ...rules, [key]: !rules[key] });
  }

  function handleCustomRuleInput(event: Event): void {
    const value = (event.currentTarget as HTMLTextAreaElement).value;
    onChange({ ...rules, customRuleText: value });
  }
</script>

<div class="dg-audit-settings">
  <h2 class="dg-audit-settings__heading">Правила аудита</h2>

  <label class="dg-audit-settings__row">
    <input type="checkbox" checked={rules.typescriptSafety} {disabled} onchange={() => toggle("typescriptSafety")} />
    <span class="dg-audit-settings__label">
      TypeScript Safety
      <span class="dg-audit-settings__hint">any, !, небезопасные приведения типов</span>
    </span>
  </label>

  <label class="dg-audit-settings__row">
    <input type="checkbox" checked={rules.uiPerformance} {disabled} onchange={() => toggle("uiPerformance")} />
    <span class="dg-audit-settings__label">
      UI Performance &amp; CSS
      <span class="dg-audit-settings__hint">layout thrashing, reflow/repaint, margin vs transform</span>
    </span>
  </label>

  <label class="dg-audit-settings__row">
    <input
      type="checkbox"
      checked={rules.frameworkReactSvelte}
      {disabled}
      onchange={() => toggle("frameworkReactSvelte")}
    />
    <span class="dg-audit-settings__label">
      Framework React/Svelte
      <span class="dg-audit-settings__hint">useEffect deps, замыкания, утечки памяти, Runes</span>
    </span>
  </label>

  <label class="dg-audit-settings__row">
    <input
      type="checkbox"
      checked={rules.customRuleEnabled}
      {disabled}
      onchange={() => toggle("customRuleEnabled")}
    />
    <span class="dg-audit-settings__label">Пользовательское правило</span>
  </label>

  {#if rules.customRuleEnabled}
    <textarea
      class="dg-audit-settings__custom"
      placeholder='Напр.: "Проверяй использование i18n"'
      value={rules.customRuleText}
      {disabled}
      oninput={handleCustomRuleInput}
    ></textarea>
  {/if}
</div>

<style>
  .dg-audit-settings {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .dg-audit-settings__heading {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--dg-text-muted, #999);
  }

  .dg-audit-settings__row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .dg-audit-settings__row input[type="checkbox"] {
    margin-top: 0.15rem;
    accent-color: var(--dg-accent, #4f8cff);
    cursor: pointer;
  }

  .dg-audit-settings__label {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .dg-audit-settings__hint {
    font-size: 0.7rem;
    color: var(--dg-text-muted, #999);
  }

  .dg-audit-settings__custom {
    resize: vertical;
    min-height: 2.4rem;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: #141414;
    color: inherit;
    font-size: 0.78rem;
    font-family: inherit;
  }
</style>
