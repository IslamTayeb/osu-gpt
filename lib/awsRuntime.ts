import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { BatchClient, DescribeJobsCommand, SubmitJobCommand } from "@aws-sdk/client-batch";
import { CloudWatchLogsClient, GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { AwsRuntimeSession } from "./awsSession";
import { GenerationJob, Track, Artifact } from "./types";
import { readStore, updateStore } from "./store";
import { applyGenerationPreset, generatorParamTemplate, toHydraOverrides } from "./generatorConfig";

const artifactExtensions = new Set([".osu", ".osz", ".json", ".txt", ".log"]);

function pathExt(fileName: string) {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

function buildAwsClients(session: AwsRuntimeSession) {
  const credentials = {
    accessKeyId: session.accessKeyId,
    secretAccessKey: session.secretAccessKey,
    sessionToken: session.sessionToken,
  };
  return {
    batch: new BatchClient({ region: session.region, credentials }),
    logs: new CloudWatchLogsClient({ region: session.region, credentials }),
    s3: new S3Client({ region: session.region, credentials }),
  };
}

function hostedPrefix(session: AwsRuntimeSession, jobId: string) {
  const root = (session.s3Prefix || "osu-gpt").replace(/^\/+|\/+$/g, "");
  return `${root}/${jobId}`;
}

function mapAwsStatus(status: string | undefined): GenerationJob["status"] {
  if (status === "SUCCEEDED") return "completed";
  if (status === "FAILED") return "failed";
  if (status === "RUNNING" || status === "STARTING") return "running";
  return "queued";
}

async function streamBodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) {
    return Buffer.alloc(0);
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof body === "object" && "transformToByteArray" in (body as object)) {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  return Buffer.alloc(0);
}

function stableArtifactId(jobId: string, key: string) {
  return createHash("sha1").update(`${jobId}:${key}`).digest("hex").slice(0, 24);
}

function hostedGeneratorHydraOverrides(job: GenerationJob, track: Track) {
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

  return toHydraOverrides(merged);
}

async function fetchLogTail(
  session: AwsRuntimeSession,
  logGroupName: string,
  logStreamName: string,
  limit = 60,
) {
  const { logs } = buildAwsClients(session);
  const response = await logs.send(
    new GetLogEventsCommand({
      logGroupName,
      logStreamName,
      limit,
      startFromHead: false,
    }),
  );
  return (response.events ?? [])
    .map((event) => (event.message ?? "").trim())
    .filter(Boolean)
    .map((line) => `[aws] ${line}`);
}

async function collectHostedArtifacts(session: AwsRuntimeSession, job: GenerationJob): Promise<Artifact[]> {
  if (!job.hosted?.prefix) {
    return [];
  }
  const { s3 } = buildAwsClients(session);
  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: job.hosted.bucket,
      Prefix: job.hosted.prefix,
    }),
  );

  const expiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return (response.Contents ?? [])
    .filter((item) => {
      const key = item.Key ?? "";
      const fileName = key.split("/").pop() ?? "";
      return Boolean(fileName) && artifactExtensions.has(pathExt(fileName));
    })
    .map((item) => {
      const key = item.Key ?? "";
      const fileName = key.split("/").pop() ?? "artifact";
      return {
        id: stableArtifactId(job.id, key),
        jobId: job.id,
        fileName,
        storage: "s3" as const,
        s3Bucket: job.hosted?.bucket,
        s3Key: key,
        sizeBytes: Number(item.Size ?? 0),
        createdAt: item.LastModified ? item.LastModified.toISOString() : new Date().toISOString(),
        expiresAt: expiration,
      };
    });
}

export async function submitHostedAwsJob(job: GenerationJob, track: Track, session: AwsRuntimeSession) {
  const { batch } = buildAwsClients(session);
  const prefix = hostedPrefix(session, job.id);
  const paramsJson = JSON.stringify(job.generatorParams ?? {});
  const hydraOverrides = hostedGeneratorHydraOverrides(job, track);
  const hydraOverridesJson = JSON.stringify(hydraOverrides);

  const response = await batch.send(
    new SubmitJobCommand({
      jobName: `osu-gpt-${job.id.slice(0, 12)}`,
      jobQueue: session.batchQueue,
      jobDefinition: session.batchJobDefinition,
      timeout: { attemptDurationSeconds: Math.max(300, Math.floor(job.timeoutSec)) },
      parameters: {
        app_job_id: job.id,
        track_id: track.id,
        track_title: track.title,
        track_artists: track.artists.join(", "),
        track_external_url: track.externalUrl || "",
        output_s3_bucket: session.s3Bucket,
        output_s3_prefix: prefix,
        generator_params_json: paramsJson,
        generator_hydra_overrides_json: hydraOverridesJson,
      },
      containerOverrides: {
        environment: [
          { name: "OSUGPT_JOB_ID", value: job.id },
          { name: "OSUGPT_TRACK_ID", value: track.id },
          { name: "OSUGPT_TRACK_TITLE", value: track.title },
          { name: "OSUGPT_TRACK_ARTISTS", value: track.artists.join(", ") },
          { name: "OSUGPT_TRACK_EXTERNAL_URL", value: track.externalUrl || "" },
          { name: "OSUGPT_OUTPUT_S3_BUCKET", value: session.s3Bucket },
          { name: "OSUGPT_OUTPUT_S3_PREFIX", value: prefix },
          { name: "OSUGPT_GENERATOR_PARAMS_JSON", value: paramsJson },
          { name: "OSUGPT_GENERATOR_HYDRA_OVERRIDES_JSON", value: hydraOverridesJson },
        ],
      },
      tags: {
        app: "osu-gpt",
        trackId: track.id,
        runtime: "hosted_aws",
      },
    }),
  );

  if (!response.jobId) {
    throw new Error("AWS Batch did not return a jobId.");
  }

  return {
    batchJobId: response.jobId,
    prefix,
    submittedAt: new Date().toISOString(),
  };
}

export async function syncHostedAwsJobs(session: AwsRuntimeSession) {
  const store = readStore();
  const candidates = store.jobs.filter(
    (job) =>
      job.runtime === "hosted_aws" &&
      job.hosted?.batchJobId &&
      (job.status === "queued" || job.status === "running"),
  );

  if (candidates.length === 0) {
    return;
  }

  const batchIds = candidates
    .map((job) => job.hosted?.batchJobId)
    .filter((jobId): jobId is string => Boolean(jobId));
  if (batchIds.length === 0) {
    return;
  }

  const { batch } = buildAwsClients(session);
  const response = await batch.send(new DescribeJobsCommand({ jobs: batchIds.slice(0, 100) }));
  const detailsById = new Map((response.jobs ?? []).map((item) => [item.jobId, item]));

  for (const candidate of candidates) {
    const hosted = candidate.hosted;
    if (!hosted?.batchJobId) continue;
    const detail = detailsById.get(hosted.batchJobId);
    if (!detail) continue;

    const mapped = mapAwsStatus(detail.status);
    const statusReason = detail.statusReason || detail.container?.reason || undefined;
    const logStream = detail.container?.logStreamName || hosted.logStream;
    const logGroup = hosted.logGroup || session.cloudWatchLogGroup || "/aws/batch/job";
    const startedAt = detail.startedAt ? new Date(detail.startedAt).toISOString() : candidate.startedAt;
    const finishedAt = detail.stoppedAt ? new Date(detail.stoppedAt).toISOString() : candidate.finishedAt;
    let logTail: string[] = [];

    if (logStream) {
      try {
        logTail = await fetchLogTail(session, logGroup, logStream);
      } catch {
        logTail = [];
      }
    }

    let hostedArtifacts = candidate.artifacts;
    if (mapped === "completed") {
      try {
        hostedArtifacts = await collectHostedArtifacts(session, {
          ...candidate,
          hosted: { ...hosted, logStream, logGroup, statusReason },
        });
      } catch {
        hostedArtifacts = candidate.artifacts;
      }
    }

    updateStore((nextStore) => {
      const job = nextStore.jobs.find((item) => item.id === candidate.id);
      if (!job) return;

      job.status = mapped;
      job.error = mapped === "failed" ? statusReason || "AWS Batch job failed." : undefined;
      job.startedAt = startedAt;
      job.finishedAt = finishedAt;
      job.hosted = {
        ...job.hosted,
        provider: "aws_batch",
        batchJobId: hosted.batchJobId,
        region: session.region,
        queue: session.batchQueue,
        jobDefinition: session.batchJobDefinition,
        bucket: session.s3Bucket,
        prefix: hosted.prefix,
        logGroup,
        logStream,
        statusReason,
        lastSyncedAt: new Date().toISOString(),
      };

      if (logTail.length > 0) {
        const known = new Set(job.logs);
        for (const line of logTail) {
          if (!known.has(line)) {
            job.logs.push(line);
          }
        }
        if (job.logs.length > 600) {
          job.logs = job.logs.slice(-600);
        }
      }

      job.artifacts = hostedArtifacts;
    });
  }
}

export async function downloadS3Artifact(session: AwsRuntimeSession, bucket: string, key: string) {
  const { s3 } = buildAwsClients(session);
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const content = await streamBodyToBuffer(response.Body);
  return {
    content,
    contentType: response.ContentType ?? "application/octet-stream",
    fileName: key.split("/").pop() ?? randomUUID(),
  };
}
