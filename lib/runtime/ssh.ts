import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

/**
 * Shared connection multiplexing: the poller runs every few seconds, and a new
 * TCP+auth handshake each time would dominate the cost.
 */
function controlArgs() {
  return [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=6",
    "-o", "ControlMaster=auto",
    "-o", `ControlPath=${path.join(os.homedir(), ".ssh", "osugpt-%r@%h")}`,
    "-o", "ControlPersist=120",
  ];
}

export class SshUnavailableError extends Error {
  constructor(detail: string) {
    super(`Cannot reach the cluster over SSH (BatchMode): ${detail}`);
    this.name = "SshUnavailableError";
  }
}

function execute(
  command: string,
  args: string[],
  input?: string,
  timeoutMs = 120_000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new SshUnavailableError(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new SshUnavailableError(error.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1 });
    });
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

/** Run a command on the remote host. Rejects on connection or command failure. */
export async function ssh(
  host: string,
  command: string,
  options: { input?: string; timeoutMs?: number } = {},
): Promise<string> {
  const { stdout, stderr, code } = await execute(
    "ssh",
    [...controlArgs(), host, command],
    options.input,
    options.timeoutMs,
  );
  if (code !== 0) {
    // 255 is ssh's own transport failure code; anything else came from the
    // remote command, which is a different problem to report.
    if (code === 255) throw new SshUnavailableError(stderr.trim() || "connection failed");
    throw new Error(`Remote command failed (exit ${code}): ${stderr.trim() || stdout.trim()}`);
  }
  return stdout;
}

export async function sshReachable(host: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    await ssh(host, "true", { timeoutMs: 15_000 });
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function rsyncUp(host: string, localPaths: string[], remoteDir: string) {
  const { stderr, code } = await execute("rsync", [
    "-az", "-e", ["ssh", ...controlArgs()].join(" "),
    ...localPaths, `${host}:${remoteDir}`,
  ], undefined, 600_000);
  if (code !== 0) throw new Error(`Upload to ${host} failed: ${stderr.trim()}`);
}

export async function rsyncDown(host: string, remoteDir: string, localDir: string) {
  const { stderr, code } = await execute("rsync", [
    "-az", "-e", ["ssh", ...controlArgs()].join(" "),
    `${host}:${remoteDir}`, localDir,
  ], undefined, 600_000);
  if (code !== 0) throw new Error(`Download from ${host} failed: ${stderr.trim()}`);
}

/** Quote a value for safe interpolation into a remote shell command. */
export function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
