import { appendLog, exportArtifacts, setJobState } from "../jobs";
import { readStore } from "../store";
import { audioCachePaths } from "../audio";
import { dccRuntime } from "./dcc";
import { enqueueJobs } from "./queue";
import fs from "node:fs";

/**
 * Cluster jobs outlive this process, so on boot re-attach to anything still on
 * Slurm rather than resubmitting it. Jobs that never got that far go back in
 * the queue.
 */
export function reconcileOnBoot() {
  const store = readStore();
  const unfinished = store.jobs.filter(
    (job) => job.status === "queued" || job.status === "running",
  );
  if (unfinished.length === 0) return;

  const resumable = unfinished.filter((job) => job.runtime === "dcc" && job.dcc?.slurmJobId);
  const restartable = unfinished.filter((job) => !resumable.includes(job));

  for (const job of resumable) {
    const track = store.tracks.find((candidate) => candidate.id === job.trackId);
    if (!track) continue;
    const { audioPath } = audioCachePaths(track);
    const context = {
      job,
      track,
      audioPath,
      appendLog: (line: string) => appendLog(job.id, line),
    };
    void dccRuntime
      .resume?.(job, context)
      .then(() => {
        const finished = readStore().jobs.find((candidate) => candidate.id === job.id);
        if (finished?.status === "completed") exportArtifacts(finished, track);
      })
      .catch((error: unknown) => {
        setJobState(job.id, {
          status: "failed",
          error: `Lost track of this job after a restart: ${
            error instanceof Error ? error.message : String(error)
          }`,
          finishedAt: new Date().toISOString(),
        });
      });
  }

  // Only requeue work whose audio is still cached; otherwise it re-downloads,
  // which is fine, but log it so the reason is visible.
  for (const job of restartable) {
    const track = store.tracks.find((candidate) => candidate.id === job.trackId);
    if (track && !fs.existsSync(audioCachePaths(track).audioPath)) {
      appendLog(job.id, "Requeued after a restart; audio will be fetched again.");
    }
  }
  if (restartable.length > 0) enqueueJobs(restartable);
}
