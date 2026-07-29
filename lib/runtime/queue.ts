import { getRuntime, runJobBatch } from "../jobs";
import { readStore } from "../store";
import { GenerationJob } from "../types";
import { DEFAULT_GPU_PROFILE, GPU_PROFILES, maxBatchAudioMinutes } from "./gpuProfiles";

/**
 * A small in-process queue. Before this, submitting a selection fired one
 * inference process per track simultaneously, which would happily try to run
 * hundreds at once.
 */
const pending: GenerationJob[] = [];
let draining = false;

export function enqueueJobs(jobs: GenerationJob[]) {
  pending.push(...jobs);
  void drain();
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (pending.length > 0) {
      // Group consecutive jobs that share a runtime so they ride in one batch.
      const runtimeId = pending[0].runtime;
      const runtime = getRuntime(runtimeId);
      const limit = Math.max(1, runtime?.batchSize ?? 1);

      // Cap the batch by audio length as well as by count: a batch that cannot
      // finish inside its Slurm walltime gets killed mid-run, losing every map
      // in it, so long songs ride in smaller groups.
      const store = readStore();
      const profile = GPU_PROFILES[store.settings.gpuProfile] ?? GPU_PROFILES[DEFAULT_GPU_PROFILE];
      const minutesBudget = maxBatchAudioMinutes(profile);
      const minutesOf = (job: GenerationJob) =>
        (store.tracks.find((track) => track.id === job.trackId)?.durationMs ?? 210_000) / 60_000;

      const batch: GenerationJob[] = [];
      let batchMinutes = 0;
      while (pending.length > 0 && batch.length < limit && pending[0].runtime === runtimeId) {
        const next = minutesOf(pending[0]);
        // Always take at least one, even an over-long song: better to attempt it
        // than to wedge the queue on a track that can never be scheduled.
        if (batch.length > 0 && batchMinutes + next > minutesBudget) break;
        batchMinutes += next;
        batch.push(pending.shift()!);
      }
      await runJobBatch(batch);
    }
  } finally {
    draining = false;
  }
}

export function queueDepth() {
  return pending.length;
}
