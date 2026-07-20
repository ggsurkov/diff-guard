<script lang="ts">
  import type { LoadedDiff } from "./types";

  interface Props {
    onLoad: (diff: LoadedDiff) => void;
  }

  let { onLoad }: Props = $props();

  let isDragOver = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  async function readFile(file: File): Promise<void> {
    const content = await file.text();
    onLoad({ fileName: file.name, content });
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    isDragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void readFile(file);
    }
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(): void {
    isDragOver = false;
  }

  function handleInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      void readFile(file);
    }
    target.value = "";
  }

  function openFilePicker(): void {
    fileInput?.click();
  }
</script>

<div
  class="dg-dropzone"
  class:dg-dropzone--active={isDragOver}
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  role="button"
  tabindex="0"
  onclick={openFilePicker}
  onkeydown={(e) => e.key === "Enter" && openFilePicker()}
>
  <p class="dg-dropzone__text">
    Перетащите сюда <code>.diff</code> / <code>.patch</code> файл
    <br />или нажмите, чтобы выбрать файл
  </p>
  <button type="button" class="dg-dropzone__button" onclick={(e) => { e.stopPropagation(); openFilePicker(); }}>
    Выбрать файл
  </button>
  <input
    bind:this={fileInput}
    type="file"
    accept=".diff,.patch,text/plain"
    class="dg-dropzone__input"
    onchange={handleInputChange}
  />
</div>

<style>
  .dg-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    border: 2px dashed var(--dg-border, #555);
    border-radius: 8px;
    cursor: pointer;
    text-align: center;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }

  .dg-dropzone--active {
    border-color: var(--dg-accent, #4f8cff);
    background-color: var(--dg-accent-bg, rgba(79, 140, 255, 0.08));
  }

  .dg-dropzone__text {
    margin: 0;
    color: var(--dg-text-muted, #999);
    font-size: 0.9rem;
  }

  .dg-dropzone__button {
    padding: 0.4rem 1rem;
    border: 1px solid var(--dg-border, #555);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .dg-dropzone__button:hover {
    border-color: var(--dg-accent, #4f8cff);
  }

  .dg-dropzone__input {
    display: none;
  }
</style>
