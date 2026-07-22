export type DiffLineType = "add" | "delete" | "normal";

export interface DiffLine {
  type: DiffLineType;
  /** Line's position in the OLD file. Null for "add" lines (they don't exist in the old file). */
  oldLineNumber: number | null;
  /** Line's position in the NEW file. Null for "delete" lines (they don't exist in the new file). */
  newLineNumber: number | null;
  content: string;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export type DiffFileChangeType = "added" | "deleted" | "modified" | "renamed";

export interface DiffFile {
  filePath: string;
  oldFilePath: string | null;
  changeType: DiffFileChangeType;
  hunks: Hunk[];
}

export interface ParsedDiff {
  files: DiffFile[];
}

const FILE_HEADER_RE = /^diff --git a\/(.+) b\/(.+)$/;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function extractPath(headerLine: string): string | null {
  const raw = headerLine.slice(4).trim();
  if (raw === "/dev/null") return null;
  const tabIndex = raw.indexOf("\t");
  const withoutTimestamp = tabIndex === -1 ? raw : raw.slice(0, tabIndex);
  return withoutTimestamp.replace(/^[ab]\//, "");
}

export function parseDiff(raw: string): ParsedDiff {
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let currentHunk: Hunk | null = null;
  let oldLineCounter = 0;
  let newLineCounter = 0;

  const finishFile = (): void => {
    if (currentFile) files.push(currentFile);
    currentFile = null;
    currentHunk = null;
  };

  // A trailing newline is a file terminator, not a blank content line — strip
  // exactly one so it doesn't get parsed as a phantom context line.
  const lines = raw.endsWith("\n") ? raw.slice(0, -1).split("\n") : raw.split("\n");

  for (const rawLine of lines) {
    const fileHeaderMatch = FILE_HEADER_RE.exec(rawLine);
    if (fileHeaderMatch) {
      finishFile();
      currentFile = {
        filePath: fileHeaderMatch[2] ?? "unknown",
        oldFilePath: fileHeaderMatch[1] ?? null,
        changeType: "modified",
        hunks: [],
      };
      continue;
    }

    if (!currentFile) {
      // Bare unified diff without a `diff --git` header (single-file patch).
      if (rawLine.startsWith("--- ")) {
        currentFile = {
          filePath: extractPath(rawLine) ?? "unknown",
          oldFilePath: null,
          changeType: "modified",
          hunks: [],
        };
      }
      continue;
    }

    if (rawLine.startsWith("new file mode")) {
      currentFile.changeType = "added";
      currentFile.oldFilePath = null;
      continue;
    }
    if (rawLine.startsWith("deleted file mode")) {
      currentFile.changeType = "deleted";
      continue;
    }
    if (rawLine.startsWith("rename from ")) {
      currentFile.changeType = "renamed";
      currentFile.oldFilePath = rawLine.slice("rename from ".length).trim();
      continue;
    }
    if (rawLine.startsWith("rename to ")) {
      currentFile.filePath = rawLine.slice("rename to ".length).trim();
      continue;
    }
    if (rawLine.startsWith("index ") || rawLine.startsWith("Binary files ") || rawLine.startsWith("similarity index")) {
      continue;
    }
    if (rawLine.startsWith("--- ")) {
      if (currentFile.oldFilePath === null) {
        currentFile.oldFilePath = extractPath(rawLine);
      }
      continue;
    }
    if (rawLine.startsWith("+++ ")) {
      const path = extractPath(rawLine);
      if (path) currentFile.filePath = path;
      continue;
    }

    const hunkMatch = HUNK_HEADER_RE.exec(rawLine);
    if (hunkMatch) {
      currentHunk = { header: rawLine, lines: [] };
      currentFile.hunks.push(currentHunk);
      oldLineCounter = Number(hunkMatch[1]);
      newLineCounter = Number(hunkMatch[2]);
      continue;
    }

    if (!currentHunk) continue;

    if (rawLine.startsWith("\\")) {
      // "\ No newline at end of file" marker — not a real content line.
      currentHunk.lines.push({ type: "normal", oldLineNumber: null, newLineNumber: null, content: rawLine });
      continue;
    }

    if (rawLine.startsWith("+")) {
      currentHunk.lines.push({
        type: "add",
        oldLineNumber: null,
        newLineNumber: newLineCounter,
        content: rawLine.slice(1),
      });
      newLineCounter += 1;
    } else if (rawLine.startsWith("-")) {
      currentHunk.lines.push({
        type: "delete",
        oldLineNumber: oldLineCounter,
        newLineNumber: null,
        content: rawLine.slice(1),
      });
      oldLineCounter += 1;
    } else {
      const content = rawLine.startsWith(" ") ? rawLine.slice(1) : rawLine;
      currentHunk.lines.push({ type: "normal", oldLineNumber: oldLineCounter, newLineNumber: newLineCounter, content });
      oldLineCounter += 1;
      newLineCounter += 1;
    }
  }

  finishFile();
  return { files };
}

/** Lines of unchanged context kept on each side of a kept `+` line when compressing for the LLM. */
const AI_CONTEXT_RADIUS = 2;
/** ~1500 tokens for code-like content — see .agents/harness/constraints.md on context budgeting. */
const MAX_AI_DIFF_CHARS = 6000;
export const AI_DIFF_TRUNCATION_MARKER = "\n…diff обрезан по лимиту токенов…";

/**
 * Collapses one hunk down to the lines worth showing the model: pure-deletion
 * hunks (no `+` line at all) carry little signal for a frontend review and
 * become a one-line summary; hunks with real additions keep only those lines
 * plus a couple of lines of surrounding context, with "…" gaps in between.
 */
function collapseHunkForAi(hunk: Hunk): string[] {
  const { lines } = hunk;
  if (!lines.some((line) => line.type === "add")) {
    const removedCount = lines.filter((line) => line.type === "delete").length;
    return removedCount > 0 ? [`… удалённый блок без новых строк (${removedCount} строк) …`] : [];
  }

  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, index) => {
    if (line.type !== "add") return;
    for (let offset = -AI_CONTEXT_RADIUS; offset <= AI_CONTEXT_RADIUS; offset += 1) {
      const neighbor = index + offset;
      if (neighbor >= 0 && neighbor < lines.length) keep[neighbor] = true;
    }
  });

  const out: string[] = [];
  let lastKeptIndex = -2;
  lines.forEach((line, index) => {
    if (!keep[index]) return;
    if (index !== lastKeptIndex + 1) out.push("…");
    lastKeptIndex = index;
    out.push(formatLineForAi(line));
  });
  return out;
}

/**
 * Renders one diff line for the LLM prompt with an explicit `[L<n>]` tag
 * holding its real NEW-file line number — the only number the model is
 * allowed to echo back as `lineTarget` (see buildSystemPrompt in prompts.ts).
 * Deleted lines have no new-file line number, so they're tagged `[DEL]`
 * instead of a number, so the model can't mistake an old-file line number
 * for a targetable new-file one.
 */
function formatLineForAi(line: DiffLine): string {
  const marker = line.type === "add" ? "+" : line.type === "delete" ? "-" : " ";
  const tag = line.newLineNumber !== null ? `[L${line.newLineNumber}]` : "[DEL]";
  return `${tag} ${marker} ${line.content}`;
}

/**
 * Compresses a parsed diff into a compact, token-budgeted text block for the
 * LLM prompt: drops deletion-only noise, keeps only real additions with a
 * touch of context, and hard-caps the total size.
 */
export function compressDiffForAi(parsedDiff: ParsedDiff): string {
  const blocks: string[] = [];

  for (const file of parsedDiff.files) {
    const fileLines: string[] = [];
    for (const hunk of file.hunks) {
      const collapsed = collapseHunkForAi(hunk);
      if (collapsed.length === 0) continue;
      fileLines.push(hunk.header, ...collapsed);
    }
    if (fileLines.length === 0) continue;
    blocks.push(`### ${file.filePath} (${file.changeType})`, ...fileLines);
  }

  let text = blocks.join("\n");
  if (text.length > MAX_AI_DIFF_CHARS) {
    text = text.slice(0, MAX_AI_DIFF_CHARS) + AI_DIFF_TRUNCATION_MARKER;
  }
  return text;
}
