import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readStore, updateStore } from "./store";
import { Artifact, GenerationJob, GeneratorParams, RuntimeType, Track } from "./types";
import { AwsRuntimeSession } from "./awsSession";
import { submitHostedAwsJob } from "./awsRuntime";
import { applyGenerationPreset, generatorParamTemplate, toHydraOverrides } from "./generatorConfig";

type CreateJobInput = {
  trackId: string;
  runtime: RuntimeType;
  preset: "quick" | "balanced" | "high_quality";
  budgetCapUsd: number;
  timeoutSec: number;
  generatorParams: GeneratorParams;
  awsSession?: AwsRuntimeSession | null;
};

const runningJobs = new Set<string>();

function appendLog(jobId: string, line: string) {
  updateStore((store) => {
    const job = store.jobs.find((j) => j.id === jobId);
    if (!job) return;
    job.logs.push(line);
    if (job.logs.length > 600) {
      job.logs = job.logs.slice(-600);
    }
  });
}

function setJobState(jobId: string, updates: Partial<GenerationJob>) {
  updateStore((store) => {
    const job = store.jobs.find((j) => j.id === jobId);
    if (!job) return;
    Object.assign(job, updates);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function runCommand(cmd: string, args: string[], cwd: string, timeoutMs: number, onLine: (line: string) => void) {
  return withTimeout(
    new Promise<void>((resolve, reject) => {
      const proc = spawn(cmd, args, { cwd, env: process.env });

      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) onLine(line);
        }
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) onLine(line);
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`${cmd} exited with code ${code}`));
        }
      });

      proc.on("error", reject);
    }),
    timeoutMs,
  );
}

function findFirstAudioFile(dir: string) {
  const allowed = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac"]);
  const files = fs.readdirSync(dir).filter((name) => allowed.has(path.extname(name).toLowerCase()));
  if (files.length === 0) {
    return null;
  }
  files.sort();
  return path.join(dir, files[0]);
}

function collectArtifacts(jobId: string, artifactsDir: string): Artifact[] {
  const expiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const files = fs.readdirSync(artifactsDir);
  const allowed = new Set([".osu", ".osz", ".json", ".txt", ".log"]);

  return files
    .filter((name) => allowed.has(path.extname(name).toLowerCase()))
    .map((fileName) => {
      const fullPath = path.join(artifactsDir, fileName);
      const stat = fs.statSync(fullPath);
      return {
        id: randomUUID(),
        jobId,
        fileName,
        storage: "local",
        relativePath: path.relative(process.cwd(), fullPath),
        sizeBytes: stat.size,
        createdAt: new Date().toISOString(),
        expiresAt: expiration,
      };
    });
}

function localGeneratorParams(job: GenerationJob, track: Track) {
  const merged = applyGenerationPreset(
    {
      ...generatorParamTemplate,
      ...job.generatorParams,
    },
    job.preset,
  );
  if (!merged.title) {
    merged.title = track.title;
  }
  if (!merged.artist) {
    merged.artist = track.artists.join(", ");
  }
  if (!merged.titleUnicode) {
    merged.titleUnicode = merged.title;
  }
  if (!merged.artistUnicode) {
    merged.artistUnicode = merged.artist;
  }
  if (!merged.creator) {
    merged.creator = "osu-gpt";
  }
  if (!merged.version) {
    merged.version = "osu-gpt generated";
  }
  if (merged.year === null || merged.year === undefined) {
    merged.year = new Date().getUTCFullYear();
  }
  if (merged.gamemode === null || merged.gamemode === undefined) {
    merged.gamemode = 0;
  }
  return merged;
}

async function runLocalPipeline(job: GenerationJob, track: Track) {
  const baseDir = path.join(process.cwd(), ".data", "artifacts", job.id);
  fs.mkdirSync(baseDir, { recursive: true });

  const spotdlAck = readStore().settings.spotdlAcknowledgedAt;
  if (!spotdlAck) {
    throw new Error("spotdl usage must be acknowledged before generation.");
  }

  appendLog(job.id, "Starting spotdl download...");
  const query = track.externalUrl || `spotify:track:${track.providerTrackId}`;
  await runCommand(
    "spotdl",
    ["download", query, "--output", baseDir, "--format", "mp3"],
    process.cwd(),
    Math.max(60_000, Math.floor(job.timeoutSec * 0.4 * 1000)),
    (line) => appendLog(job.id, `[spotdl] ${line}`),
  );

  const audioFile = findFirstAudioFile(baseDir);
  if (!audioFile) {
    throw new Error("No audio file produced by spotdl.");
  }

  appendLog(job.id, `Audio ready: ${path.basename(audioFile)}`);

  const mapperDir = path.resolve(process.cwd(), "..", "Mapperatorinator");
  if (!fs.existsSync(mapperDir)) {
    throw new Error("Mapperatorinator directory not found at ../Mapperatorinator");
  }

  const params = localGeneratorParams(job, track);
  const hydraOverrides = toHydraOverrides(params);

  appendLog(job.id, "Running Mapperatorinator inference...");
  await runCommand(
    "python",
    [
      "inference.py",
      `audio_path=${JSON.stringify(audioFile)}`,
      `output_path=${JSON.stringify(baseDir)}`,
      ...hydraOverrides,
    ],
    mapperDir,
    job.timeoutSec * 1000,
    (line) => appendLog(job.id, `[inference] ${line}`),
  );

  const artifacts = collectArtifacts(job.id, baseDir);
  if (artifacts.length === 0) {
    throw new Error("Inference completed but no downloadable artifacts were found.");
  }

  setJobState(job.id, {
    status: "completed",
    artifacts,
    finishedAt: new Date().toISOString(),
  });
}

async function runHostedSubmission(job: GenerationJob, track: Track, awsSession?: AwsRuntimeSession | null) {
  if (!awsSession) {
    throw new Error("Hosted AWS runtime requires saved AWS session credentials and infrastructure settings.");
  }

  appendLog(job.id, "Submitting generation job to AWS Batch...");
  const submitted = await submitHostedAwsJob(job, track, awsSession);
  setJobState(job.id, {
    status: "queued",
    hosted: {
      provider: "aws_batch",
      batchJobId: submitted.batchJobId,
      region: awsSession.region,
      queue: awsSession.batchQueue,
      jobDefinition: awsSession.batchJobDefinition,
      bucket: awsSession.s3Bucket,
      prefix: submitted.prefix,
      logGroup: awsSession.cloudWatchLogGroup || "/aws/batch/job",
      submittedAt: submitted.submittedAt,
      lastSyncedAt: submitted.submittedAt,
    },
  });
  appendLog(job.id, `AWS Batch job submitted: ${submitted.batchJobId}`);
}

async function runJob(jobId: string, awsSession?: AwsRuntimeSession | null) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);

  const snapshot = readStore();
  const job = snapshot.jobs.find((j) => j.id === jobId);
  const track = snapshot.tracks.find((t) => t.id === job?.trackId);

  if (!job || !track) {
    runningJobs.delete(jobId);
    return;
  }

  try {
    if (job.runtime === "hosted_aws") {
      await runHostedSubmission(job, track, awsSession);
      return;
    }

    setJobState(job.id, { status: "running", startedAt: new Date().toISOString() });
    await runLocalPipeline(job, track);
  } catch (error) {
    setJobState(job.id, {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown job failure",
      finishedAt: new Date().toISOString(),
    });
  } finally {
    runningJobs.delete(jobId);
  }
}

export function createGenerationJob(input: CreateJobInput) {
  const now = new Date().toISOString();

  const job: GenerationJob = {
    id: randomUUID(),
    trackId: input.trackId,
    runtime: input.runtime,
    preset: input.preset,
    generatorParams: input.generatorParams,
    budgetCapUsd: input.budgetCapUsd,
    timeoutSec: input.timeoutSec,
    status: "queued",
    warning: input.budgetCapUsd > 50 ? "Budget over $50. Confirm this is intentional." : undefined,
    logs: [],
    artifacts: [],
    hosted:
      input.runtime === "hosted_aws" && input.awsSession
        ? {
            provider: "aws_batch",
            region: input.awsSession.region,
            queue: input.awsSession.batchQueue,
            jobDefinition: input.awsSession.batchJobDefinition,
            bucket: input.awsSession.s3Bucket,
            prefix: "",
          }
        : undefined,
    createdAt: now,
  };

  updateStore((store) => {
    store.jobs.unshift(job);
  });

  void runJob(job.id, input.awsSession);
  return job;
}
