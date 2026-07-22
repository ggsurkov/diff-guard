<script lang="ts">
  import type { ParsedDiff } from "./parser/diffParser";
  import type { AiSuggestion } from "./types/generative";
  import InlineFixCard from "./components/widgets/InlineFixCard.svelte";
  import AnimationSandbox from "./components/widgets/AnimationSandbox.svelte";

  interface Props {
    content: string;
    parsed: ParsedDiff;
    suggestions: AiSuggestion[];
  }

  let { content, parsed, suggestions }: Props = $props();

  function suggestionsFor(filePath: string, lineNumber: number | null): AiSuggestion[] {
    if (lineNumber === null) return [];
    return suggestions.filter((s) => s.filePath === filePath && s.lineTarget === lineNumber);
  }
</script>

<div class="dg-viewer">
  {#if parsed.files.length === 0}
    <p class="dg-viewer__fallback-note">Не удалось распознать формат git diff — показан исходный текст.</p>
    <pre class="dg-viewer__pre"><code>{content}</code></pre>
  {:else}
    {#each parsed.files as file, fileIndex (fileIndex)}
      <div class="dg-file" id="dg-file-{fileIndex}">
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
                    <InlineFixCard filePath={suggestion.filePath} payload={suggestion.payload} />
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
    gap: 0.85rem;
    padding: 0.85rem;
    border: 1px solid var(--dg-border, #444);
    border-radius: 10px;
    background: var(--dg-code-bg, #1e1e1e);
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
    border-radius: 8px;
    overflow: hidden;
    scroll-margin-top: 0.85rem;
  }

  .dg-file__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    font-size: 0.82rem;
    font-weight: 600;
    position: sticky;
    top: 0;
  }

  .dg-file__badge {
    font-size: 0.68rem;
    font-weight: 400;
    text-transform: uppercase;
    color: var(--dg-text-muted, #999);
  }

  .dg-hunk__header {
    padding: 0.2rem 0.75rem;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.72rem;
    color: var(--dg-text-muted, #999);
    background: rgba(255, 255, 255, 0.02);
  }

  .dg-line {
    display: flex;
    gap: 0.6rem;
    padding: 0 0.75rem;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    font-size: 0.8rem;
    line-height: 1.55;
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
    flex: 0 0 2.8rem;
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
    padding: 0 0.75rem;
  }
</style>
