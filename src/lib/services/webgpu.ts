export function isWebGpuSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
