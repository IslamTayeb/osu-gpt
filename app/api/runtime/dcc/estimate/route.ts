import { NextRequest, NextResponse } from "next/server";
import { loadPin, parseGpuAvail } from "@/lib/runtime/dccConfig";
import { GPU_PROFILES, GpuProfile, GpuProfileId } from "@/lib/runtime/gpuProfiles";
import { ssh } from "@/lib/runtime/ssh";

export const runtime = "nodejs";

const CACHE_MS = 20_000;

export type ProfileEstimate = {
  id: GpuProfileId;
  label: string;
  note: string;
  /** GPUs of this class free right now. */
  freeNow: number;
  /** Slurm's own guaranteed-by prediction, seconds from now (upper bound). */
  slurmWaitSec: number | null;
  /** What we actually expect to wait. */
  expectedWaitSec: number;
  medianWaitSec: number;
  p90WaitSec: number;
};

let cached: { at: number; value: ProfileEstimate[] } | null = null;

/** "Job 123 to start at 2026-07-29T02:55:05 a using ..." */
function parsePredictedStart(line: string): number | null {
  const match = line.match(/to start at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  const parsed = Date.parse(match[1]);
  return Number.isFinite(parsed) ? parsed / 1000 : null;
}

function expectedWait(profile: GpuProfile, freeNow: number, slurmWaitSec: number | null): number {
  // A free GPU right now means the scheduler can backfill us immediately, and
  // our own history says that takes seconds. Slurm's --test-only figure is the
  // time it can *guarantee*, which is far more pessimistic, so only lean on it
  // when nothing of this class is actually idle.
  if (freeNow > 0) return profile.medianWaitSec;
  if (slurmWaitSec === null) return profile.p90WaitSec;
  return Math.min(slurmWaitSec, profile.p90WaitSec * 4);
}

export async function GET(request: NextRequest) {
  if (!request.nextUrl.searchParams.has("fresh") && cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json({ profiles: cached.value, cached: true });
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
  const probes = Object.values(GPU_PROFILES).map((profile) => {
    const target = profile.targets[0];
    return (
      `sbatch --test-only -A ${pin.dcc.account} -p ${target.partition} ` +
      `--gres=gpu:${target.gres}:1 -c 8 --mem=48G -t 00:45:00 --wrap=true 2>&1 | head -1`
    );
  });

  let output: string;
  try {
    output = await ssh(
      pin.dcc.sshHost,
      [
        "date +%s",
        "echo ::S::",
        "gpuavail -m -p gpu-common 2>/dev/null",
        "echo ::S::",
        "gpuavail -m -p scavenger-gpu 2>/dev/null",
        "echo ::S::",
        probes.join("; echo ::S::; "),
      ].join("; "),
      { timeoutMs: 45_000 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cluster unreachable" },
      { status: 503 },
    );
  }

  const parts = output.split("::S::");
  const now = Number(parts[0]?.trim());
  const freeByGres = new Map<string, number>();
  for (const section of [parts[1], parts[2]]) {
    for (const [gres, count] of parseGpuAvail(section ?? "")) {
      freeByGres.set(gres, (freeByGres.get(gres) ?? 0) + count);
    }
  }

  const profiles = Object.values(GPU_PROFILES).map((profile, index) => {
    const freeNow = profile.targets.reduce(
      (sum, target) => sum + (freeByGres.get(target.gres) ?? 0),
      0,
    );
    const predicted = parsePredictedStart(parts[3 + index] ?? "");
    const slurmWaitSec =
      predicted !== null && Number.isFinite(now) ? Math.max(0, Math.round(predicted - now)) : null;
    return {
      id: profile.id,
      label: profile.label,
      note: profile.note,
      freeNow,
      slurmWaitSec,
      expectedWaitSec: expectedWait(profile, freeNow, slurmWaitSec),
      medianWaitSec: profile.medianWaitSec,
      p90WaitSec: profile.p90WaitSec,
    };
  });

  cached = { at: Date.now(), value: profiles };
  return NextResponse.json({ profiles, cached: false });
}
