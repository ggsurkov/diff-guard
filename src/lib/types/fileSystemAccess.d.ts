// lib.dom.d.ts ships the FileSystemDirectoryHandle/FileSystemFileHandle interfaces but not the
// window.showDirectoryPicker entry point yet — declare just enough of the picker API to type it.
interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: FileSystemHandle | "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
}

interface Window {
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
