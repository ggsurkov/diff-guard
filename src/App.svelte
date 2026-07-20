<script lang="ts">
  import DiffDropzone from "./lib/DiffDropzone.svelte";
  import DiffViewer from "./lib/DiffViewer.svelte";
  import type { LoadedDiff } from "./lib/types";

  let diff: LoadedDiff | null = $state(null);

  function handleLoad(loaded: LoadedDiff): void {
    diff = loaded;
  }

  function reset(): void {
    diff = null;
  }
</script>

<main class="dg-app">
  <header class="dg-app__header">
    <h1 class="dg-app__title">diff-guard</h1>
    {#if diff}
      <button type="button" class="dg-app__reset" onclick={reset}>Загрузить другой файл</button>
    {/if}
  </header>

  {#if diff}
    <p class="dg-app__filename">{diff.fileName}</p>
    <DiffViewer content={diff.content} />
  {:else}
    <DiffDropzone onLoad={handleLoad} />
  {/if}
</main>

<style>
  .dg-app {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: 0.75rem;
    box-sizing: border-box;
    padding: 1rem;
  }

  .dg-app__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dg-app__title {
    margin: 0;
    font-size: 1.1rem;
  }

  .dg-app__reset {
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .dg-app__filename {
    margin: 0;
    font-size: 0.8rem;
    color: var(--dg-text-muted, #999);
  }
</style>
