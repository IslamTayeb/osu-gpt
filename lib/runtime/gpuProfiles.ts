/**
 * GPU choices, with timings measured on this cluster rather than guessed.
 *
 * Queue waits come from 977 of our own past jobs over 30 days; throughput from
 * benchmark runs on a 3:07 song. The headline: a 2080 is ~3x slower to compute
 * but starts almost immediately, while the bf16 cards are only occasionally
 * free — so "worse" hardware usually wins on wall-clock.
 */
export type GpuProfileId = "fast-start" | "bf16" | "auto";

export type GpuProfile = {
  id: GpuProfileId;
  label: string;
  /** Ordered (partition, gres) candidates to try. */
  targets: { partition: string; gres: string }[];
  /** Typical submit-to-start delay, seconds (median of past jobs). */
  medianWaitSec: number;
  /** Bad-case start delay, seconds (p90). */
  p90WaitSec: number;
  /** Fixed per-cluster-job cost: python start, model load, encoder precompute. */
  startupSec: number;
  /** Marginal cost per minute of audio. */
  secPerAudioMinute: number;
  note: string;
};

export const GPU_PROFILES: Record<GpuProfileId, GpuProfile> = {
  "fast-start": {
    id: "fast-start",
    label: "RTX 2080 Ti",
    targets: [
      { partition: "gpu-common", gres: "2080" },
      { partition: "scavenger-gpu", gres: "2080" },
    ],
    medianWaitSec: 12,
    p90WaitSec: 31,
    // Measured on job 50905493: 165s elapsed for one 3.13-minute song, of which
    // generate() was 89.6s. So 165 - 89.6 = 75s fixed, 89.6 / 3.13 = 29s/minute.
    startupSec: 75,
    secPerAudioMinute: 29,
    note: "Almost always free. No bf16, so it runs fp32 — slower per song, but you start now.",
  },
  bf16: {
    id: "bf16",
    label: "A5000 / A6000 (bf16)",
    targets: [
      { partition: "gpu-common", gres: "a5000" },
      { partition: "scavenger-gpu", gres: "a5000" },
      { partition: "scavenger-gpu", gres: "a6000" },
      { partition: "scavenger-gpu", gres: "6000_ada" },
    ],
    medianWaitSec: 19,
    p90WaitSec: 1357,
    // NOT measured through this pipeline: an A5000 was never reachable to time
    // one (Slurm quoted a 14-hour wait). Both figures come from the hand-run
    // benchmarks, and secPerAudioMinute is corroborated by the token rates —
    // fast-start's measured 29 divided by the 384/159 tok/s ratio gives 12.
    startupSec: 25,
    secPerAudioMinute: 12,
    note: "Roughly 3x the throughput. Best when queueing a lot of songs.",
  },
  auto: {
    id: "auto",
    label: "Fastest card that is free",
    targets: [
      { partition: "gpu-common", gres: "a5000" },
      { partition: "scavenger-gpu", gres: "a5000" },
      { partition: "scavenger-gpu", gres: "a6000" },
      { partition: "scavenger-gpu", gres: "6000_ada" },
      { partition: "gpu-common", gres: "2080" },
      { partition: "scavenger-gpu", gres: "2080" },
    ],
    medianWaitSec: 15,
    p90WaitSec: 300,
    // This profile lands on a bf16 card when one is idle and a 2080 otherwise,
    // so it is the midpoint of the two above rather than a measurement of its
    // own. The old pair mixed bf16's startup with the 2080's per-minute rate.
    startupSec: 50,
    secPerAudioMinute: 20,
    note: "Takes a bf16 card when one is genuinely free, otherwise a 2080.",
  },
};

/**
 * 5000 Ada is deliberately absent above: it is the best card on paper but our
 * six attempts waited a median of 14 hours, so it is never worth picking.
 */
export const AVOIDED_GRES = new Set(["5000_ada", "6000_ada_generation"]);

export const DEFAULT_GPU_PROFILE: GpuProfileId = "fast-start";

/**
 * The whole cost model, in one line:
 *
 *   wallclock = batches × (queueWait + startupSec) + audioMinutes × secPerAudioMinute
 *
 * Two terms, because they scale differently. `startupSec` is fixed per Slurm
 * job — conda activate, torch import, model load, encoder warmup — and is paid
 * once however much audio rides along, which is the entire reason for batching.
 * `secPerAudioMinute` is the marginal decode cost and is the only term that
 * grows with song length.
 *
 * Calibration and its provenance live on each profile above.
 */
export function estimateSeconds(
  profile: GpuProfile,
  audioDurationsMs: number[],
  batchSize = 8,
  waitSec: number = profile.medianWaitSec,
): number {
  if (audioDurationsMs.length === 0) return 0;
  const totalMinutes = audioDurationsMs.reduce((sum, ms) => sum + ms / 60_000, 0);
  const batches = Math.ceil(audioDurationsMs.length / batchSize);
  const compute = batches * profile.startupSec + totalMinutes * profile.secPerAudioMinute;
  return Math.round(compute + waitSec * batches);
}

/** Slurm walltime limits, in seconds. The ceiling is what these partitions take. */
const MIN_WALLTIME_SEC = 900;
const MAX_WALLTIME_SEC = 2700;
/** Headroom over the estimate, for a cold HF cache or a slow node. */
const WALLTIME_MARGIN = 1.6;

/**
 * Walltime to request for one batch. The estimate is a median, so a limit set
 * to it exactly would kill half of all jobs. Asking for less than the old flat
 * 45 minutes is not just tidiness — Slurm backfills short jobs into gaps ahead
 * of long ones, so a batch that honestly declares 15 minutes starts sooner than
 * one that claims 45.
 */
export function walltimeSecFor(profile: GpuProfile, audioDurationsMs: number[]): number {
  const compute = estimateSeconds(profile, audioDurationsMs, audioDurationsMs.length || 1, 0);
  return Math.min(
    MAX_WALLTIME_SEC,
    Math.max(MIN_WALLTIME_SEC, Math.ceil(compute * WALLTIME_MARGIN)),
  );
}

/**
 * How much audio may ride in one batch. Past this the batch cannot finish
 * inside MAX_WALLTIME_SEC and Slurm kills it mid-run, so the queue splits
 * instead. Eight songs is well under the cap at normal lengths; it only bites
 * on hour-long mixes.
 */
export function maxBatchAudioMinutes(profile: GpuProfile): number {
  const budget = MAX_WALLTIME_SEC / WALLTIME_MARGIN - profile.startupSec;
  return Math.max(1, budget / profile.secPerAudioMinute);
}

/** Seconds to `HH:MM:SS`, the only format sbatch --time accepts unambiguously. */
export function toSlurmWalltime(seconds: number): string {
  const total = Math.max(60, Math.ceil(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * Single-letter units throughout, so "45s", "12m" and "1h 5m" read as one
 * scale. Past an hour the estimate is only good to a few minutes, so it is
 * rounded to 5 rather than implying we know it to the minute.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 59.5) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round((minutes % 60) / 5) * 5;
  if (rest === 60) return `${hours + 1}h`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
