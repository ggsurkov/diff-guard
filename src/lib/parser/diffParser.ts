export type DiffLineType = "add" | "delete" | "normal";

export interface DiffLine {
  type: DiffLineType;
  lineNumber: number | null;
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
      currentHunk.lines.push({ type: "normal", lineNumber: null, content: rawLine });
      continue;
    }

    if (rawLine.startsWith("+")) {
      currentHunk.lines.push({ type: "add", lineNumber: newLineCounter, content: rawLine.slice(1) });
      newLineCounter += 1;
    } else if (rawLine.startsWith("-")) {
      currentHunk.lines.push({ type: "delete", lineNumber: oldLineCounter, content: rawLine.slice(1) });
      oldLineCounter += 1;
    } else {
      const content = rawLine.startsWith(" ") ? rawLine.slice(1) : rawLine;
      currentHunk.lines.push({ type: "normal", lineNumber: newLineCounter, content });
      oldLineCounter += 1;
      newLineCounter += 1;
    }
  }

  finishFile();
  return { files };
}
