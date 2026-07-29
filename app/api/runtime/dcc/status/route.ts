import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { NextResponse } from "next/server";
import { loadPin, parseGpuAvail } from "@/lib/runtime/dccConfig";
import { shq, ssh, sshReachable } from "@/lib/runtime/ssh";

export const runtime = "nodejs";

const exec = promisify(execFile);
const CACHE_MS = 30_000;

type Status = {
  reachable: boolean;
  detail?: string;
  freeGpus: { partition: string; type: string; count: number }[];
  pin: { expected: string; localActual?: string; clusterActual?: string; drift: boolean };
};

let cached: { at: number; value: Status } | null = null;

async function localHead(): Promise<string | undefined> {
  const dir = process.env.MAPPERATORINATOR_DIR
    ? path.resolve(process.env.MAPPERATORINATOR_DIR)
    : path.resolve(process.cwd(), "..", "Mapperatorinator");
  try {
    const { stdout } = await exec("git", ["-C", dir, "rev-parse", "--short", "HEAD"]);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

export async function GET() {
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.value);
  }

  let pin: ReturnType<typeof loadPin>;
  try {
    pin = loadPin();
  } catch (error) {
    // Most likely a fresh clone without config/dcc.local.json.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cluster config missing." },
      { status: 503 },
    );
  }
  const expected = pin.sha;
  const localActual = await localHead();

  const reachable = await sshReachable(pin.dcc.sshHost);
  if (!reachable.ok) {
    const value: Status = {
      reachable: false,
      detail: reachable.detail,
      freeGpus: [],
      pin: { expected, localActual, drift: !!localActual && !expected.startsWith(localActual) },
    };
    cached = { at: Date.now(), value };
    return NextResponse.json(value);
  }

  const freeGpus: Status["freeGpus"] = [];
  let clusterActual: string | undefined;
  try {
    const output = await ssh(
      pin.dcc.sshHost,
      "gpuavail -m -p gpu-common 2>/dev/null; echo ::SPLIT::; gpuavail -m -p scavenger-gpu 2>/dev/null; " +
        `echo ::SPLIT::; git -C ${shq(pin.dcc.repo)} rev-parse --short HEAD`,
      { timeoutMs: 30_000 },
    );
    const [common, scavenger, head] = output.split("::SPLIT::");
    for (const [partition, section] of [
      ["gpu-common", common],
      ["scavenger-gpu", scavenger],
    ] as const) {
      for (const [type, count] of parseGpuAvail(section ?? "")) {
        freeGpus.push({ partition, type, count });
      }
    }
    clusterActual = head?.trim();
  } catch {
    // Availability is advisory; a failure here shouldn't look like an outage.
  }

  const drift =
    (!!clusterActual && !expected.startsWith(clusterActual)) ||
    (!!localActual && !expected.startsWith(localActual));

  const value: Status = {
    reachable: true,
    freeGpus,
    pin: { expected, localActual, clusterActual, drift },
  };
  cached = { at: Date.now(), value };
  return NextResponse.json(value);
}
