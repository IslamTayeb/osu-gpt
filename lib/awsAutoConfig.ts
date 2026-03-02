import {
  BatchClient,
  DescribeComputeEnvironmentsCommand,
  DescribeJobDefinitionsCommand,
  DescribeJobQueuesCommand,
} from "@aws-sdk/client-batch";
import { ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";

export type AwsCredentialShape = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

type AwsRuntimeResourceInput = {
  batchQueue?: string;
  batchJobDefinition?: string;
  s3Bucket?: string;
  s3Prefix?: string;
  cloudWatchLogGroup?: string;
};

type AutoDetectAwsRuntimeResourcesInput = {
  region: string;
  credentials: AwsCredentialShape;
  resources: AwsRuntimeResourceInput;
};

export type AutoDetectedAwsRuntimeResources = {
  batchQueue?: string;
  batchJobDefinition?: string;
  s3Bucket?: string;
  s3Prefix: string;
  cloudWatchLogGroup: string;
  missing: string[];
};

function cleaned(value: string | undefined) {
  return (value ?? "").trim();
}

function withEnvFallback(value: string | undefined, envKey: string) {
  return cleaned(value) || cleaned(process.env[envKey]);
}

function choosePreferredQueue(
  queues: Array<{ state?: string; status?: string; jobQueueArn?: string; jobQueueName?: string }> | undefined,
) {
  if (!queues || queues.length === 0) {
    return "";
  }
  const enabledValid = queues.filter((queue) => queue.state === "ENABLED" && queue.status === "VALID");
  const pool = enabledValid.length > 0 ? enabledValid : queues;
  const preferred =
    pool.find((queue) =>
      /osu|map|batch|gpu/i.test(`${queue.jobQueueName ?? ""} ${queue.jobQueueArn ?? ""}`),
    ) ?? pool[0];
  return cleaned(preferred.jobQueueArn) || cleaned(preferred.jobQueueName);
}

function choosePreferredJobDefinition(
  definitions:
    | Array<{
        status?: string;
        type?: string;
        revision?: number;
        jobDefinitionName?: string;
        jobDefinitionArn?: string;
      }>
    | undefined,
) {
  if (!definitions || definitions.length === 0) {
    return "";
  }
  const active = definitions.filter(
    (definition) => definition.status === "ACTIVE" && definition.type === "container",
  );
  const pool = active.length > 0 ? active : definitions;
  const ranked = [...pool].sort((left, right) => (right.revision ?? 0) - (left.revision ?? 0));
  const preferred =
    ranked.find((definition) => /osu|mapper|map|inference/i.test(definition.jobDefinitionName ?? "")) ??
    ranked[0];
  return cleaned(preferred.jobDefinitionArn) || cleaned(preferred.jobDefinitionName);
}

function choosePreferredBucket(buckets: Array<{ Name?: string }> | undefined) {
  if (!buckets || buckets.length === 0) {
    return "";
  }
  const preferred =
    buckets.find((bucket) => /osu|map|beatmap|mapper|ml|ai/i.test(bucket.Name ?? "")) ?? buckets[0];
  return cleaned(preferred.Name);
}

function normalizeInstanceType(instanceType: string) {
  return instanceType.trim().toLowerCase();
}

function inferGpuFromInstanceType(instanceType: string) {
  const normalized = normalizeInstanceType(instanceType);
  if (normalized.startsWith("g6e")) return "NVIDIA L40S (44 GiB VRAM)";
  if (normalized.startsWith("g6")) return "NVIDIA L4 (22 GiB VRAM)";
  if (normalized.startsWith("g5")) return "NVIDIA A10G (22 GiB VRAM)";
  if (normalized.startsWith("g4dn")) return "NVIDIA T4 (16 GiB VRAM)";
  if (normalized.startsWith("p4d") || normalized.startsWith("p4de")) return "NVIDIA A100 (80 GiB VRAM)";
  if (normalized.startsWith("p5e") || normalized.startsWith("p5en")) return "NVIDIA H200 (141 GiB VRAM)";
  if (normalized.startsWith("p5")) return "NVIDIA H100 (80 GiB VRAM)";
  if (normalized.startsWith("p6-b200")) return "NVIDIA B200";
  if (normalized.startsWith("p6-b300")) return "NVIDIA B300";
  if (normalized.startsWith("p6e-gb200")) return "NVIDIA Grace Blackwell 200";
  return null;
}

function chooseConcreteInstanceType(instanceTypes: string[]) {
  return (
    instanceTypes
      .map((value) => value.trim())
      .find((value) => {
        const normalized = value.toLowerCase();
        return normalized.length > 0 && normalized !== "optimal" && normalized !== "default";
      }) ?? ""
  );
}

export async function autoDetectAwsRuntimeResources(
  input: AutoDetectAwsRuntimeResourcesInput,
): Promise<AutoDetectedAwsRuntimeResources> {
  const { region, credentials } = input;
  let batchQueue = withEnvFallback(input.resources.batchQueue, "AWS_BATCH_QUEUE");
  let batchJobDefinition = withEnvFallback(input.resources.batchJobDefinition, "AWS_BATCH_JOB_DEFINITION");
  let s3Bucket = withEnvFallback(input.resources.s3Bucket, "AWS_S3_BUCKET");
  const s3Prefix = withEnvFallback(input.resources.s3Prefix, "AWS_S3_PREFIX") || "osu-gpt";
  const cloudWatchLogGroup =
    withEnvFallback(input.resources.cloudWatchLogGroup, "AWS_CLOUDWATCH_LOG_GROUP") || "/aws/batch/job";

  const batch = new BatchClient({ region, credentials });

  if (!batchQueue) {
    try {
      const queueResponse = await batch.send(new DescribeJobQueuesCommand({ maxResults: 100 }));
      batchQueue = choosePreferredQueue(queueResponse.jobQueues);
    } catch {
      // Resource discovery is best-effort.
    }
  }

  if (!batchJobDefinition) {
    try {
      const definitionResponse = await batch.send(
        new DescribeJobDefinitionsCommand({ status: "ACTIVE", maxResults: 100 }),
      );
      batchJobDefinition = choosePreferredJobDefinition(definitionResponse.jobDefinitions);
    } catch {
      // Resource discovery is best-effort.
    }
  }

  if (!s3Bucket) {
    try {
      const s3 = new S3Client({ region, credentials });
      const bucketResponse = await s3.send(new ListBucketsCommand({}));
      s3Bucket = choosePreferredBucket(bucketResponse.Buckets);
    } catch {
      // Resource discovery is best-effort.
    }
  }

  const missing: string[] = [];
  if (!batchQueue) missing.push("batchQueue");
  if (!batchJobDefinition) missing.push("batchJobDefinition");
  if (!s3Bucket) missing.push("s3Bucket");

  return {
    batchQueue,
    batchJobDefinition,
    s3Bucket,
    s3Prefix,
    cloudWatchLogGroup,
    missing,
  };
}

export type AwsBatchGpuHint = {
  gpuHint?: string;
  gpuCountPerJob?: number;
};

type DetectAwsBatchGpuHintInput = {
  region: string;
  credentials: AwsCredentialShape;
  batchQueue: string;
  batchJobDefinition: string;
};

export async function detectAwsBatchGpuHint(input: DetectAwsBatchGpuHintInput): Promise<AwsBatchGpuHint> {
  const batch = new BatchClient({ region: input.region, credentials: input.credentials });

  let queueInstanceType = "";
  try {
    const queueResponse = await batch.send(new DescribeJobQueuesCommand({ jobQueues: [input.batchQueue] }));
    const queue = queueResponse.jobQueues?.[0];
    const computeEnvironments = (queue?.computeEnvironmentOrder ?? [])
      .map((entry) => cleaned(entry.computeEnvironment))
      .filter(Boolean);

    if (computeEnvironments.length > 0) {
      const computeResponse = await batch.send(
        new DescribeComputeEnvironmentsCommand({ computeEnvironments: computeEnvironments.slice(0, 3) }),
      );
      const instanceTypes = (computeResponse.computeEnvironments ?? [])
        .flatMap((environment) => environment.computeResources?.instanceTypes ?? [])
        .filter((value): value is string => typeof value === "string");
      queueInstanceType = chooseConcreteInstanceType(instanceTypes);
    }
  } catch {
    queueInstanceType = "";
  }

  let gpuCountPerJob: number | undefined;
  try {
    const jobDefinitionResponse = await batch.send(
      new DescribeJobDefinitionsCommand({ jobDefinitions: [input.batchJobDefinition], status: "ACTIVE" }),
    );
    const jobDefinition =
      jobDefinitionResponse.jobDefinitions
        ?.filter((definition) => definition.status === "ACTIVE")
        .sort((left, right) => (right.revision ?? 0) - (left.revision ?? 0))[0] ?? null;
    const requirement = jobDefinition?.containerProperties?.resourceRequirements?.find(
      (item) => item.type === "GPU",
    );
    const parsed = requirement?.value ? Number(requirement.value) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      gpuCountPerJob = Math.floor(parsed);
    }
  } catch {
    gpuCountPerJob = undefined;
  }

  const inferredGpu = queueInstanceType ? inferGpuFromInstanceType(queueInstanceType) : null;
  const gpuHint = inferredGpu ? `${queueInstanceType} -> ${inferredGpu}` : queueInstanceType || undefined;

  return {
    gpuHint,
    gpuCountPerJob,
  };
}
