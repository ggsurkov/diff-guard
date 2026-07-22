/**
 * Wraps the File System Access API so InlineFixCard can write AI fixes
 * straight back to disk. Module-level $state (Svelte 5 "universal reactivity")
 * so every component that imports `fileSystemState` reacts to the same
 * picked-folder without prop drilling it through Sidebar/DiffViewer.
 */
export const fileSystemState = $state<{
  dirHandle: FileSystemDirectoryHandle | null;
  folderName: string | null;
}>({
  dirHandle: null,
  folderName: null,
});

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** Opens the native directory picker and binds the chosen folder as the write target for fixes. */
export async function selectProjectFolder(): Promise<void> {
  if (!isFileSystemAccessSupported()) {
    throw new Error("File System Access API не поддерживается в этом браузере (нужен Chrome/Edge).");
  }
  const handle = await window.showDirectoryPicker!({ mode: "readwrite" });
  fileSystemState.dirHandle = handle;
  fileSystemState.folderName = handle.name;
}

export function clearProjectFolder(): void {
  fileSystemState.dirHandle = null;
  fileSystemState.folderName = null;
}

async function resolveFileHandle(root: FileSystemDirectoryHandle, relativePath: string): Promise<FileSystemFileHandle> {
  const parts = relativePath.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.length === 0) {
    throw new Error(`Некорректный путь к файлу: "${relativePath}".`);
  }

  let dir = root;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part);
  }
  return dir.getFileHandle(parts[parts.length - 1]!);
}

/**
 * Replaces the first occurrence of `oldCode` with `newCode` in the given file
 * (relative to the bound project folder) and writes the result back to disk.
 */
export async function applyFixToFile(relativePath: string, oldCode: string, newCode: string): Promise<void> {
  const root = fileSystemState.dirHandle;
  if (!root) {
    throw new Error("Папка проекта не привязана — сначала выберите её кнопкой в панели.");
  }

  const fileHandle = await resolveFileHandle(root, relativePath);
  const file = await fileHandle.getFile();
  const text = await file.text();

  if (!text.includes(oldCode)) {
    throw new Error("Исходный фрагмент кода не найден в файле — возможно, файл уже был изменён.");
  }

  const updated = text.replace(oldCode, newCode);
  const writable = await fileHandle.createWritable();
  await writable.write(updated);
  await writable.close();
}
