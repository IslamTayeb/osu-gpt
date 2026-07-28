import fs from "node:fs";
import path from "node:path";

/**
 * Pure config + parsing helpers, kept free of job/runtime imports so the status
 * route can use them without pulling in the whole runtime graph.
 */
export type Pin = {
  branch: string;
  sha: string;
  dcc: {
    sshHost: string;
    account: string;
    repo: string;
    env: string;
    hfHome: string;
    workDir: string;
  };
};

export function loadPin(): Pin {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "config", "mapperatorinator.pin.json"), "utf8"),
  ) as Pin;
}

/**
 * Preference order for GPUs, best first. bf16-capable cards run the CUDA-graph
 * decode path; the 2080s fall back to fp32 and are roughly 3x slower, but they
 * are almost always free, so they beat waiting in a queue.
 */
export const GPU_PREFERENCE: { partition: string; gres: string }[] = [
  { partition: "gpu-common", gres: "5000_ada" },
  { partition: "gpu-common", gres: "a5000" },
  { partition: "scavenger-gpu", gres: "6000_ada" },
  { partition: "scavenger-gpu", gres: "6000_ada_generation" },
  { partition: "scavenger-gpu", gres: "a6000" },
  { partition: "scavenger-gpu", gres: "5000_ada" },
  { partition: "scavenger-gpu", gres: "a5000" },
  { partition: "gpu-common", gres: "2080" },
  { partition: "scavenger-gpu", gres: "2080" },
];

export const FALLBACK_TARGET = { partition: "gpu-common", gres: "2080" };

/**
 * `gpuavail -m` prints lines like "  3   x  A5000:1", i.e. node count, GPU type,
 * and free GPUs per node. Types come back upper case; gres names are lower case.
 */
export function parseGpuAvail(output: string): Map<string, number> {
  const free = new Map<string, number>();
  for (const line of output.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+x\s+([A-Za-z0-9_]+):(\d+)/);
    if (!match) continue;
    const [, nodes, type, perNode] = match;
    const key = type.toLowerCase();
    free.set(key, (free.get(key) ?? 0) + Number(nodes) * Number(perNode));
  }
  return free;
}
