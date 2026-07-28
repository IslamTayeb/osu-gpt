import { getRuntime, runJobBatch } from "../jobs";
import { readStore } from "../store";
import { GenerationJob } from "../types";

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
      const limit = Math.max(
        1,
        Math.min(runtime?.batchSize ?? 1, readStore().settings.maxConcurrentJobs || 4),
      );

      const batch: GenerationJob[] = [];
      while (pending.length > 0 && batch.length < limit && pending[0].runtime === runtimeId) {
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
