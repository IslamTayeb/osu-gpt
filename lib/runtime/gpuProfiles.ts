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
    label: "RTX 2080 Ti — starts immediately",
    targets: [
      { partition: "gpu-common", gres: "2080" },
      { partition: "scavenger-gpu", gres: "2080" },
    ],
    medianWaitSec: 12,
    p90WaitSec: 31,
    startupSec: 35,
    secPerAudioMinute: 55,
    note: "Almost always free. No bf16, so it runs fp32 — slower per song, but you start now.",
  },
  bf16: {
    id: "bf16",
    label: "A5000 / A6000 (bf16) — ~3x faster, may queue",
    targets: [
      { partition: "gpu-common", gres: "a5000" },
      { partition: "scavenger-gpu", gres: "a5000" },
      { partition: "scavenger-gpu", gres: "a6000" },
      { partition: "scavenger-gpu", gres: "6000_ada" },
    ],
    medianWaitSec: 19,
    p90WaitSec: 1357,
    startupSec: 25,
    secPerAudioMinute: 12,
    note: "Usually starts fast, but one run in ten waits ~20 minutes. Best for big batches.",
  },
  auto: {
    id: "auto",
    label: "Whatever is free now",
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
    startupSec: 30,
    secPerAudioMinute: 30,
    note: "Takes a bf16 card when one is genuinely free, otherwise a 2080.",
  },
};

/**
 * 5000 Ada is deliberately absent above: it is the best card on paper but our
 * six attempts waited a median of 14 hours, so it is never worth picking.
 */
export const AVOIDED_GRES = new Set(["5000_ada", "6000_ada_generation"]);

export const DEFAULT_GPU_PROFILE: GpuProfileId = "fast-start";

/** Rough wall-clock for a batch, in seconds. Batches share one startup. */
export function estimateSeconds(
  profile: GpuProfile,
  audioDurationsMs: number[],
  batchSize = 8,
): { optimistic: number; typical: number } {
  if (audioDurationsMs.length === 0) return { optimistic: 0, typical: 0 };
  const totalMinutes = audioDurationsMs.reduce((sum, ms) => sum + ms / 60_000, 0);
  const batches = Math.ceil(audioDurationsMs.length / batchSize);
  const compute = batches * profile.startupSec + totalMinutes * profile.secPerAudioMinute;
  return {
    optimistic: Math.round(compute + profile.medianWaitSec),
    typical: Math.round(compute + profile.medianWaitSec * batches),
  };
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
