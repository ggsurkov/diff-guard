#!/usr/bin/env node
// Registers native-host/index.js as a Chrome Native Messaging host so
// chrome.runtime.sendNativeMessage('com.diff_guard.bridge', ...) can reach it
// from the diff-guard extension. Run once per machine:
//   node native-host/install.js <extension_id>
// <extension_id> is the 32-char id shown for diff-guard on chrome://extensions
// (enable Developer Mode to see it for an unpacked/dev build) — the
// dashboard's sidebar also shows it with a "copy install command" button
// once the extension is loaded (see claudeNativeService.getExtensionId).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST_NAME = "com.diff_guard.bridge";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Baked in automatically after the first successful install (see
// persistDefaultExtensionId below) so a later double-click of install.bat /
// install.sh with no argument reuses the same extension ID instead of
// failing — that's what makes those "double-click installer" scripts work.
const DEFAULT_EXTENSION_ID = "elglhbpgchlbgddlfoainflmpblhihho";

function fail(message) {
  console.error(`[diff-guard] ${message}`);
  process.exit(1);
}

const extensionId = process.argv[2] || DEFAULT_EXTENSION_ID;
if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
  fail(
    "Использование: node native-host/install.js <extension_id>\n" +
      "  <extension_id> — 32-символьный ID расширения с chrome://extensions (включите режим разработчика),\n" +
      "  либо скопируйте готовую команду в сайдбаре дашборда (режим \"Claude CLI\", когда хост не подключен).",
  );
}

/**
 * Rewrites this file's own DEFAULT_EXTENSION_ID constant to the ID just used
 * — so the next run (e.g. a plain double-click of install.bat/install.sh,
 * with no argument) targets the same extension without the user having to
 * look up or retype the ID again.
 */
function persistDefaultExtensionId(id) {
  if (id === DEFAULT_EXTENSION_ID) return;
  const source = fs.readFileSync(__filename, "utf8");
  const pattern = /const DEFAULT_EXTENSION_ID = "[a-p]{0,32}";/;
  if (!pattern.test(source)) return;
  fs.writeFileSync(__filename, source.replace(pattern, `const DEFAULT_EXTENSION_ID = "${id}";`), "utf8");
}

/** Windows launches the manifest's "path" directly via CreateProcess — it can't run a .js file, so wrap it in a .bat that resolves `node` from PATH. */
function writeWindowsWrapper() {
  const wrapperPath = path.join(__dirname, "run-host.bat");
  const indexPath = path.join(__dirname, "index.js");
  fs.writeFileSync(wrapperPath, `@echo off\r\nnode "${indexPath}" %*\r\n`, "utf8");
  return wrapperPath;
}

function buildHostManifest(execPath) {
  return {
    name: HOST_NAME,
    description: "diff-guard Claude CLI Native Host",
    path: execPath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}

function installWindows(hostManifestPath) {
  const keyPath = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`;
  execFileSync("reg", ["add", keyPath, "/ve", "/t", "REG_SZ", "/d", hostManifestPath, "/f"], { stdio: "inherit" });
  return keyPath;
}

function installViaCopy(targetDir, hostManifestPath) {
  fs.mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, `${HOST_NAME}.json`);
  fs.copyFileSync(hostManifestPath, targetPath);
  return targetPath;
}

function main() {
  const platform = process.platform;
  const execPath = platform === "win32" ? writeWindowsWrapper() : path.join(__dirname, "index.js");

  if (platform !== "win32") {
    try {
      fs.chmodSync(execPath, 0o755);
    } catch (err) {
      logWarn(`Не удалось выставить +x на ${execPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const hostManifest = buildHostManifest(execPath);
  const hostManifestPath = path.join(__dirname, `${HOST_NAME}.json`);
  fs.writeFileSync(hostManifestPath, JSON.stringify(hostManifest, null, 2), "utf8");

  if (platform === "win32") {
    const keyPath = installWindows(hostManifestPath);
    console.log(`[diff-guard] Ветка реестра создана: HKCU\\...\\${keyPath.split("\\").pop()}`);
  } else if (platform === "darwin") {
    const targetDir = path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
    );
    const target = installViaCopy(targetDir, hostManifestPath);
    console.log(`[diff-guard] Манифест хоста скопирован в ${target}`);
  } else {
    const targetDir = path.join(os.homedir(), ".config", "google-chrome", "NativeMessagingHosts");
    const target = installViaCopy(targetDir, hostManifestPath);
    console.log(`[diff-guard] Манифест хоста скопирован в ${target}`);
  }

  console.log(`[diff-guard] Нативный хост "${HOST_NAME}" зарегистрирован для chrome-extension://${extensionId}/`);
  console.log(`[diff-guard] Исполняемый файл: ${execPath}`);

  persistDefaultExtensionId(extensionId);
  if (extensionId !== DEFAULT_EXTENSION_ID) {
    console.log(`[diff-guard] ID сохранён как значение по умолчанию — install.bat/install.sh теперь можно запускать без аргумента.`);
  }
}

function logWarn(text) {
  console.warn(`[diff-guard] ${text}`);
}

main();
