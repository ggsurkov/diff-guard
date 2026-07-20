<script lang="ts">
  interface Props {
    content: string;
  }

  let { content }: Props = $props();
</script>

<div class="dg-viewer">
  <pre class="dg-viewer__pre"><code>{content}</code></pre>
</div>

<style>
  .dg-viewer {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--dg-border, #444);
    border-radius: 8px;
    background: var(--dg-code-bg, #1e1e1e);
  }

  .dg-viewer__pre {
    margin: 0;
    padding: 0.75rem 1rem;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.8rem;
    line-height: 1.45;
    white-space: pre;
    color: var(--dg-code-text, #d4d4d4);
  }
</style>
