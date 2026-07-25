#!/usr/bin/env node
// Chrome Native Messaging host for diff-guard's "Claude CLI (Подписка)" mode.
// Talks to the extension over stdin/stdout using Chrome's 4-byte
// little-endian length-prefixed framing (see
// https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging),
// and shells out to the Claude Code CLI (`claude -p`) installed on this
// machine so audits run against an active subscription instead of billed
// Anthropic API tokens. Zero third-party deps — only Node builtins.
import { spawn } from "node:child_process";

const CLAUDE_TIMEOUT_MS = 5 * 60 * 1000;

function logError(text) {
  // stdout is reserved exclusively for framed native-messaging replies —
  // anything else written there corrupts the protocol, so diagnostics go to
  // stderr (visible in chrome://extensions "Errors" / native host logs).
  process.stderr.write(`[diff-guard native host] ${text}\n`);
}

function sendMessage(message) {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

function readMessages(onMessage) {
  let buffer = Buffer.alloc(0);

  process.stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    for (;;) {
      if (buffer.length < 4) break;
      const length = buffer.readUInt32LE(0);
      if (buffer.length < 4 + length) break;

      const payload = buffer.subarray(4, 4 + length);
      buffer = buffer.subarray(4 + length);

      let message;
      try {
        message = JSON.parse(payload.toString("utf8"));
      } catch (err) {
        logError(`Не удалось разобрать входящее сообщение: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      onMessage(message);
    }
  });

  // Chrome closes stdin when the extension port disconnects — exit cleanly
  // rather than hang around as an orphaned process.
  process.stdin.on("end", () => process.exit(0));
}

/**
 * Runs `claude -p` in print (non-interactive) mode, feeding the prompt via
 * stdin rather than argv — argv has a low length limit on some platforms
 * (diffs can be large) and stdin sidesteps all shell-quoting concerns since
 * no untrusted text ever becomes part of a command line.
 */
function runClaudeCli(fullPrompt) {
  return new Promise((resolve, reject) => {
    // `claude` resolves to a .cmd shim on Windows, which Node can only launch
    // through cmd.exe. Driving cmd.exe directly (rather than shell: true)
    // keeps our static, untrusted-content-free argv from being re-parsed by
    // a shell — the diff/prompt text still only ever reaches the child via
    // stdin, never the command line.
    const isWindows = process.platform === "win32";
    const child = isWindows
      ? spawn("cmd.exe", ["/d", "/s", "/c", "claude", "-p"], { windowsHide: true })
      : spawn("claude", ["-p"], { windowsHide: true });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`claude -p не ответил за ${CLAUDE_TIMEOUT_MS / 1000}с.`));
    }, CLAUDE_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new Error(
          `Не удалось запустить \`claude\`: ${err.message}. Установлен ли Claude Code CLI и есть ли он в PATH?`,
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude -p завершился с кодом ${code}: ${stderr || stdout || "нет вывода"}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}

/** Best-effort extraction of the JSON object from CLI output that may be wrapped in prose or code fences. */
function extractJsonPayload(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return candidate.trim();

  return candidate.slice(start, end + 1).trim();
}

async function handleMessage(message) {
  if (typeof message !== "object" || message === null) {
    sendMessage({ error: "Ожидался JSON-объект." });
    return;
  }

  if (message.type === "ping") {
    sendMessage({ status: "ok" });
    return;
  }

  const { compressedDiff, systemPrompt } = message;
  if (typeof compressedDiff !== "string" || typeof systemPrompt !== "string") {
    sendMessage({ error: "Ожидались строковые поля compressedDiff и systemPrompt." });
    return;
  }

  const fullPrompt = `${systemPrompt}\n\n${compressedDiff}`;

  try {
    const stdout = await runClaudeCli(fullPrompt);
    sendMessage({ result: extractJsonPayload(stdout) });
  } catch (err) {
    sendMessage({ error: err instanceof Error ? err.message : String(err) });
  }
}

readMessages((message) => {
  void handleMessage(message);
});
