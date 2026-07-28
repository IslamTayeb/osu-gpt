import fs from "node:fs";
import path from "node:path";

/**
 * Logs live in per-job files rather than the store. Appending a line used to
 * rewrite the entire store.json (over a megabyte, once per line, per job).
 */
function logPath(jobId: string) {
  const dir = path.join(process.cwd(), ".data", "artifacts", jobId);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "job.log");
}

export function appendJobLog(jobId: string, line: string) {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  try {
    fs.appendFileSync(logPath(jobId), stamped, "utf8");
  } catch {
    // Logging must never take down a job.
  }
}

/** Read the tail of a job's log, newest content last. */
export function readJobLog(jobId: string, maxBytes = 32_768): string[] {
  const file = path.join(process.cwd(), ".data", "artifacts", jobId, "job.log");
  if (!fs.existsSync(file)) return [];
  const { size } = fs.statSync(file);
  const start = Math.max(0, size - maxBytes);
  const handle = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(size - start);
    fs.readSync(handle, buffer, 0, buffer.length, start);
    const lines = buffer.toString("utf8").split("\n").filter(Boolean);
    // A partial first line is likely when we start mid-file.
    return start > 0 ? lines.slice(1) : lines;
  } finally {
    fs.closeSync(handle);
  }
}
