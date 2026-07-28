import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureTrackAudio } from "./audio";
import { appendJobLog } from "./jobLogs";
import { readStore, updateStore } from "./store";
import { Artifact, GenerationJob, GeneratorParams, ModelVersion, Track } from "./types";
import { dccRuntime } from "./runtime/dcc";
import { localRuntime } from "./runtime/local";
import { GenerationRuntime, JobContext } from "./runtime/types";

const ARTIFACT_EXTENSIONS = new Set([".osu", ".osz", ".json", ".txt", ".log"]);
const RETENTION_DAYS = 7;

const runtimes: Record<GenerationJob["runtime"], GenerationRuntime> = {
  local: localRuntime,
  dcc: dccRuntime,
};

export function appendLog(jobId: string, line: string) {
  appendJobLog(jobId, line);
}

export function setJobState(jobId: string, patch: Partial<GenerationJob>) {
  updateStore((store) => {
    const job = store.jobs.find((candidate) => candidate.id === jobId);
    if (job) Object.assign(job, patch);
  });
}

export function collectArtifacts(jobId: string, dir: string): Artifact[] {
  if (!fs.existsSync(dir)) return [];
  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString();
  const createdAt = new Date().toISOString();

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ARTIFACT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .filter((entry) => entry.name !== "job.log")
    .map((entry) => {
      const absolute = path.join(dir, entry.name);
      return {
        id: crypto.createHash("sha1").update(`${jobId}:${entry.name}`).digest("hex").slice(0, 24),
        jobId,
        fileName: entry.name,
        storage: "local" as const,
        relativePath: path.relative(process.cwd(), absolute),
        sizeBytes: fs.statSync(absolute).size,
        expiresAt,
        createdAt,
      };
    });
}

/**
 * osu!lazer has no Songs folder — it imports an .osz when the file is opened.
 * So rather than asking for a path, hand the file to the app directly.
 */
function importIntoOsu(oszPath: string, jobId: string) {
  if (process.platform !== "darwin") return;
  try {
    execFileSync("open", ["-a", "osu!", oszPath], { timeout: 20_000 });
    appendLog(jobId, "Sent to osu! for import.");
  } catch (error) {
    appendLog(jobId, `Could not open in osu!: ${error instanceof Error ? error.message : error}`);
  }
}

/** Copy finished beatmaps into the user's export folder and/or hand them to osu!. */
export function exportArtifacts(job: GenerationJob, track: Track) {
  const settings = readStore().settings;
  const exportDir = settings.exportDir;

  if (settings.openInOsu) {
    for (const artifact of job.artifacts) {
      if (path.extname(artifact.fileName).toLowerCase() === ".osz" && artifact.relativePath) {
        importIntoOsu(path.resolve(process.cwd(), artifact.relativePath), job.id);
      }
    }
  }

  if (!exportDir) return;
  try {
    fs.mkdirSync(exportDir, { recursive: true });
  } catch (error) {
    appendLog(job.id, `Could not create export folder: ${error instanceof Error ? error.message : error}`);
    return;
  }

  for (const artifact of job.artifacts) {
    if (path.extname(artifact.fileName).toLowerCase() !== ".osz" || !artifact.relativePath) continue;
    const safe = (value: string) => value.replace(/[/\\:*?"<>|]/g, "_").trim();
    const base = `${safe(track.artists.join(", "))} - ${safe(track.title)} [osu-gpt]`;
    let destination = path.join(exportDir, `${base}.osz`);
    let suffix = 2;
    while (fs.existsSync(destination)) {
      destination = path.join(exportDir, `${base} (${suffix++}).osz`);
    }
    try {
      fs.copyFileSync(path.resolve(process.cwd(), artifact.relativePath), destination);
      appendLog(job.id, `Exported to ${destination}`);
    } catch (error) {
      appendLog(job.id, `Export failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}

export function createGenerationJob(input: {
  track: Track;
  generatorParams: GeneratorParams;
  modelVersion: ModelVersion;
  runtime: GenerationJob["runtime"];
  timeoutSec: number;
  experimentalCompile?: boolean;
}): GenerationJob {
  const job: GenerationJob = {
    id: crypto.randomUUID(),
    trackId: input.track.id,
    runtime: input.runtime,
    modelVersion: input.modelVersion,
    generatorParams: input.generatorParams,
    experimentalCompile: input.experimentalCompile,
    timeoutSec: input.timeoutSec,
    status: "queued",
    artifacts: [],
    createdAt: new Date().toISOString(),
  };
  updateStore((store) => {
    store.jobs.unshift(job);
  });
  return job;
}

/**
 * Prepare audio for each job, then hand the whole group to the runtime. Batching
 * matters: the model load dominates a single map's cost, so N maps in one
 * cluster job is far cheaper than N cluster jobs.
 */
export async function runJobBatch(jobs: GenerationJob[]) {
  const store = readStore();
  const contexts: JobContext[] = [];

  for (const job of jobs) {
    const track = store.tracks.find((candidate) => candidate.id === job.trackId);
    if (!track) {
      setJobState(job.id, {
        status: "failed",
        error: "The track for this job is no longer in the library.",
        finishedAt: new Date().toISOString(),
      });
      continue;
    }
    try {
      const audio = await ensureTrackAudio(track, (line) => appendLog(job.id, line), {
        timeoutMs: Math.max(120_000, job.timeoutSec * 400),
      });
      contexts.push({
        job,
        track,
        audioPath: audio.path,
        appendLog: (line) => appendLog(job.id, line),
      });
    } catch (error) {
      setJobState(job.id, {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      });
    }
  }

  if (contexts.length === 0) return;

  const runtime = runtimes[contexts[0].job.runtime] ?? localRuntime;
  try {
    await runtime.run(contexts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const ctx of contexts) {
      const current = readStore().jobs.find((j) => j.id === ctx.job.id);
      if (current && (current.status === "queued" || current.status === "running")) {
        setJobState(ctx.job.id, {
          status: "failed",
          error: message,
          finishedAt: new Date().toISOString(),
        });
      }
    }
    return;
  }

  // Export whatever finished successfully.
  const finished = readStore().jobs;
  for (const ctx of contexts) {
    const job = finished.find((j) => j.id === ctx.job.id);
    if (job?.status === "completed") exportArtifacts(job, ctx.track);
  }
}

export async function cancelJob(job: GenerationJob) {
  await runtimes[job.runtime]?.cancel?.(job);
  setJobState(job.id, {
    status: "failed",
    error: "Cancelled.",
    finishedAt: new Date().toISOString(),
  });
}

export function getRuntime(id: GenerationJob["runtime"]) {
  return runtimes[id];
}
