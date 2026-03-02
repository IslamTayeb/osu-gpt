import {
  BatchClient,
  CreateComputeEnvironmentCommandOutput,
  CreateComputeEnvironmentCommand,
  CreateJobQueueCommandOutput,
  CreateJobQueueCommand,
  DescribeComputeEnvironmentsCommand,
  DescribeJobDefinitionsCommand,
  DescribeJobQueuesCommand,
  RegisterJobDefinitionCommandOutput,
  RegisterJobDefinitionCommand,
} from "@aws-sdk/client-batch";
import {
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";
import {
  AddRoleToInstanceProfileCommand,
  AttachRolePolicyCommand,
  CreateInstanceProfileCommand,
  CreateRoleCommand,
  CreateServiceLinkedRoleCommand,
  GetInstanceProfileCommand,
  GetRoleCommand,
  IAMClient,
  PutRolePolicyCommand,
} from "@aws-sdk/client-iam";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import type { BucketLocationConstraint } from "@aws-sdk/client-s3";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import type { AwsCredentialShape } from "./awsAutoConfig";

type AwsRuntimeResourceInput = {
  batchQueue?: string;
  batchJobDefinition?: string;
  s3Bucket?: string;
  jobImage?: string;
  s3Prefix?: string;
  cloudWatchLogGroup?: string;
};

export type EnsureAwsRuntimeResourcesInput = {
  region: string;
  credentials: AwsCredentialShape;
  resources: AwsRuntimeResourceInput;
};

export type EnsureAwsRuntimeResourcesResult = {
  batchQueue?: string;
  batchJobDefinition?: string;
  s3Bucket?: string;
  s3Prefix: string;
  cloudWatchLogGroup: string;
  missing: string[];
  provisionedResources: string[];
  warnings: string[];
};

type AwsClients = {
  batch: BatchClient;
  ec2: EC2Client;
  iam: IAMClient;
  s3: S3Client;
  sts: STSClient;
};

const DEFAULT_S3_PREFIX = "osu-gpt";
const DEFAULT_LOG_GROUP = "/aws/batch/job";

function cleaned(value: string | undefined) {
  return (value ?? "").trim();
}

function withEnvFallback(value: string | undefined, envKey: string) {
  return cleaned(value) || cleaned(process.env[envKey]);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function nameOf(error: unknown) {
  if (typeof error === "object" && error && "name" in error) {
    return String((error as { name?: string }).name ?? "");
  }
  return "";
}

function statusCodeOf(error: unknown) {
  if (
    typeof error === "object" &&
    error &&
    "$metadata" in error &&
    typeof (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === "number"
  ) {
    return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0;
  }
  return 0;
}

function isNoSuchEntityError(error: unknown) {
  const name = nameOf(error);
  if (name === "NoSuchEntity" || name === "NoSuchEntityException") {
    return true;
  }
  return /cannot be found|NoSuchEntity/i.test(messageOf(error));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeBatchName(raw: string | undefined, fallback: string) {
  const candidate = cleaned(raw) || fallback;
  const normalized = candidate
    .replace(/^arn:[^/]+\/+/, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || fallback).slice(0, 128);
}

function parseQueueName(reference: string | undefined) {
  const ref = cleaned(reference);
  if (!ref) return "";
  if (ref.startsWith("arn:")) {
    const marker = "job-queue/";
    const idx = ref.indexOf(marker);
    if (idx >= 0) {
      return ref.slice(idx + marker.length);
    }
  }
  return ref;
}

function parseJobDefinitionName(reference: string | undefined) {
  const ref = cleaned(reference);
  if (!ref) return "";
  if (ref.startsWith("arn:")) {
    const marker = "job-definition/";
    const idx = ref.indexOf(marker);
    if (idx >= 0) {
      return ref.slice(idx + marker.length).split(":")[0] || "";
    }
  }
  return ref.split(":")[0] || ref;
}

function sanitizeBucketCandidate(raw: string) {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+|\.+$/g, "");
  const base = normalized.slice(0, 63).replace(/[-.]+$/g, "");
  if (base.length >= 3) {
    return base;
  }
  return "osu-gpt-bucket";
}

function buildAwsClients(region: string, credentials: AwsCredentialShape): AwsClients {
  return {
    batch: new BatchClient({ region, credentials }),
    ec2: new EC2Client({ region, credentials }),
    iam: new IAMClient({ region, credentials }),
    s3: new S3Client({ region, credentials }),
    sts: new STSClient({ region, credentials }),
  };
}

async function resolveAccountId(sts: STSClient) {
  try {
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    return cleaned(identity.Account);
  } catch {
    return "";
  }
}

async function resolveJobQueueReference(batch: BatchClient, reference: string) {
  const ref = cleaned(reference);
  if (!ref) return "";
  const response = await batch.send(new DescribeJobQueuesCommand({ jobQueues: [ref] }));
  const queue = response.jobQueues?.[0];
  return cleaned(queue?.jobQueueArn) || cleaned(queue?.jobQueueName);
}

async function resolveJobDefinitionReference(batch: BatchClient, reference: string) {
  const ref = cleaned(reference);
  if (!ref) return "";
  const response = await batch.send(
    new DescribeJobDefinitionsCommand({ jobDefinitions: [ref], status: "ACTIVE" }),
  );
  const definition = response.jobDefinitions?.[0];
  return cleaned(definition?.jobDefinitionArn) || cleaned(definition?.jobDefinitionName);
}

async function isPlaceholderJobDefinition(batch: BatchClient, reference: string) {
  const ref = cleaned(reference);
  if (!ref) {
    return false;
  }
  const response = await batch.send(
    new DescribeJobDefinitionsCommand({ jobDefinitions: [ref], status: "ACTIVE" }),
  );
  const definition =
    (response.jobDefinitions ?? [])
      .filter((item) => item.status === "ACTIVE")
      .sort((left, right) => (right.revision ?? 0) - (left.revision ?? 0))[0] ?? null;
  if (!definition) {
    return false;
  }
  const image = cleaned(definition.containerProperties?.image);
  const commandText = (definition.containerProperties?.command ?? []).join(" ");
  return (
    image === "public.ecr.aws/docker/library/busybox:latest" &&
    /AWS_BATCH_JOB_IMAGE is not configured/i.test(commandText)
  );
}

async function resolveComputeEnvironmentReference(batch: BatchClient, reference: string) {
  const ref = cleaned(reference);
  if (!ref) return "";
  const response = await batch.send(new DescribeComputeEnvironmentsCommand({ computeEnvironments: [ref] }));
  const environment = response.computeEnvironments?.[0];
  return cleaned(environment?.computeEnvironmentArn) || cleaned(environment?.computeEnvironmentName);
}

async function ensureBatchServiceLinkedRole(iam: IAMClient) {
  try {
    await iam.send(new CreateServiceLinkedRoleCommand({ AWSServiceName: "batch.amazonaws.com" }));
  } catch (error) {
    const name = nameOf(error);
    const message = messageOf(error);
    const alreadyExists =
      name === "InvalidInput" ||
      name === "EntityAlreadyExists" ||
      /already exists|has been taken/i.test(message);
    if (!alreadyExists) {
      throw error;
    }
  }
}

async function ensureRole(
  iam: IAMClient,
  roleName: string,
  assumeRolePolicyDocument: Record<string, unknown>,
  managedPolicyArns: string[],
) {
  let roleArn = "";
  let createdNow = false;
  try {
    const existing = await iam.send(new GetRoleCommand({ RoleName: roleName }));
    roleArn = cleaned(existing.Role?.Arn);
  } catch (error) {
    if (!isNoSuchEntityError(error)) {
      throw error;
    }
    const created = await iam.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument),
        Description: "Auto-created by osu-gpt hosted runtime setup.",
      }),
    );
    roleArn = cleaned(created.Role?.Arn);
    createdNow = true;
  }

  for (const policyArn of managedPolicyArns) {
    try {
      await iam.send(new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn }));
    } catch {
      // Best-effort. Existing attachment or access nuances should not fail setup.
    }
  }

  if (createdNow) {
    await sleep(2000);
  }

  return roleArn;
}

async function ensureInstanceProfile(iam: IAMClient, profileName: string, roleName: string) {
  let profileArn = "";
  let hasRoleAttached = false;
  try {
    const existing = await iam.send(new GetInstanceProfileCommand({ InstanceProfileName: profileName }));
    profileArn = cleaned(existing.InstanceProfile?.Arn);
    hasRoleAttached = Boolean(
      existing.InstanceProfile?.Roles?.some((role) => cleaned(role.RoleName) === roleName),
    );
  } catch (error) {
    if (!isNoSuchEntityError(error)) {
      throw error;
    }
    const created = await iam.send(
      new CreateInstanceProfileCommand({
        InstanceProfileName: profileName,
      }),
    );
    profileArn = cleaned(created.InstanceProfile?.Arn);
  }

  if (!hasRoleAttached) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await iam.send(
          new AddRoleToInstanceProfileCommand({
            InstanceProfileName: profileName,
            RoleName: roleName,
          }),
        );
        break;
      } catch (error) {
        const name = nameOf(error);
        if (name === "LimitExceeded" || name === "EntityAlreadyExists") {
          break;
        }
        if (isNoSuchEntityError(error) && attempt < 4) {
          await sleep(1000 + attempt * 500);
          continue;
        }
        throw error;
      }
    }
  }

  return profileArn;
}

async function findDefaultNetwork(ec2: EC2Client) {
  const defaultVpcResponse = await ec2.send(
    new DescribeVpcsCommand({
      Filters: [
        { Name: "isDefault", Values: ["true"] },
        { Name: "state", Values: ["available"] },
      ],
      MaxResults: 20,
    }),
  );
  let vpcId = cleaned(defaultVpcResponse.Vpcs?.[0]?.VpcId);

  if (!vpcId) {
    const anyVpcResponse = await ec2.send(
      new DescribeVpcsCommand({
        Filters: [{ Name: "state", Values: ["available"] }],
        MaxResults: 20,
      }),
    );
    vpcId = cleaned(anyVpcResponse.Vpcs?.[0]?.VpcId);
  }
  if (!vpcId) {
    throw new Error("No available VPC found. Create a VPC/subnets first.");
  }

  const subnetResponse = await ec2.send(
    new DescribeSubnetsCommand({
      Filters: [
        { Name: "vpc-id", Values: [vpcId] },
        { Name: "state", Values: ["available"] },
      ],
    }),
  );
  const subnetIds = (subnetResponse.Subnets ?? []).map((subnet) => cleaned(subnet.SubnetId)).filter(Boolean);
  if (subnetIds.length === 0) {
    throw new Error(`No available subnets found in VPC ${vpcId}.`);
  }

  let securityGroupResponse = await ec2.send(
    new DescribeSecurityGroupsCommand({
      Filters: [
        { Name: "vpc-id", Values: [vpcId] },
        { Name: "group-name", Values: ["default"] },
      ],
    }),
  );
  if ((securityGroupResponse.SecurityGroups ?? []).length === 0) {
    securityGroupResponse = await ec2.send(
      new DescribeSecurityGroupsCommand({
        Filters: [{ Name: "vpc-id", Values: [vpcId] }],
      }),
    );
  }
  const securityGroupId = cleaned(securityGroupResponse.SecurityGroups?.[0]?.GroupId);
  if (!securityGroupId) {
    throw new Error(`No security group found in VPC ${vpcId}.`);
  }

  return {
    subnetIds,
    securityGroupId,
  };
}

async function ensureS3Bucket(
  clients: AwsClients,
  region: string,
  requestedBucket: string,
  accountId: string,
  provisionedResources: string[],
) {
  const explicitBucket = cleaned(requestedBucket);
  const baseAutoBucket = sanitizeBucketCandidate(`osu-gpt-${accountId || "account"}-${region}`);
  const autoSuffix = Date.now().toString(36).slice(-6);
  const candidates = explicitBucket
    ? [sanitizeBucketCandidate(explicitBucket)]
    : [baseAutoBucket, sanitizeBucketCandidate(`${baseAutoBucket}-${autoSuffix}`)];

  for (const candidate of candidates) {
    try {
      await clients.s3.send(new HeadBucketCommand({ Bucket: candidate }));
      return candidate;
    } catch (error) {
      const statusCode = statusCodeOf(error);
      const name = nameOf(error);
      const missing = statusCode === 404 || name === "NotFound" || name === "NoSuchBucket";
      const forbidden = statusCode === 403 || name === "Forbidden";
      if (forbidden && explicitBucket) {
        throw new Error(`S3 bucket '${candidate}' exists but is not accessible with current credentials.`);
      }
      if (forbidden && !explicitBucket) {
        continue;
      }
      if (!missing) {
        if (explicitBucket) {
          throw error;
        }
      }
      try {
        await clients.s3.send(
          new CreateBucketCommand(
            region === "us-east-1"
              ? { Bucket: candidate }
              : {
                  Bucket: candidate,
                  CreateBucketConfiguration: {
                    LocationConstraint: region as BucketLocationConstraint,
                  },
                },
          ),
        );
        provisionedResources.push(`s3Bucket:${candidate}`);
        return candidate;
      } catch (createError) {
        const createName = nameOf(createError);
        const alreadyOwned = createName === "BucketAlreadyOwnedByYou";
        if (alreadyOwned) {
          return candidate;
        }
        const alreadyExists = createName === "BucketAlreadyExists";
        if (alreadyExists && !explicitBucket) {
          continue;
        }
        throw createError;
      }
    }
  }

  if (explicitBucket) {
    return "";
  }
  throw new Error("Could not create or resolve a usable S3 bucket.");
}

async function ensureBatchComputeEnvironment(
  clients: AwsClients,
  input: {
    requestedName: string;
    provisionedResources: string[];
    gpuRequested: number;
  },
) {
  const existingReference = await resolveComputeEnvironmentReference(clients.batch, input.requestedName);
  if (existingReference) {
    return existingReference;
  }

  await ensureBatchServiceLinkedRole(clients.iam);

  const instanceRoleName = normalizeBatchName(
    process.env.AWS_BATCH_INSTANCE_ROLE_NAME,
    "osu-gpt-batch-ecs-instance-role",
  );
  await ensureRole(
    clients.iam,
    instanceRoleName,
    {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "ec2.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    },
    [
      "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role",
      "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    ],
  );

  const instanceProfileName = normalizeBatchName(
    process.env.AWS_BATCH_INSTANCE_PROFILE_NAME,
    "osu-gpt-batch-ecs-instance-profile",
  );
  const instanceProfileArn = await ensureInstanceProfile(clients.iam, instanceProfileName, instanceRoleName);

  const network = await findDefaultNetwork(clients.ec2);
  const instanceType = withEnvFallback("", "AWS_BATCH_INSTANCE_TYPE") || "g4dn.xlarge";
  const maxvCpus = parsePositiveInt(process.env.AWS_BATCH_MAX_VCPUS, 16);
  let response: CreateComputeEnvironmentCommandOutput | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      response = await clients.batch.send(
        new CreateComputeEnvironmentCommand({
          computeEnvironmentName: input.requestedName,
          type: "MANAGED",
          state: "ENABLED",
          computeResources: {
            type: "EC2",
            minvCpus: 0,
            desiredvCpus: 0,
            maxvCpus,
            allocationStrategy: "BEST_FIT_PROGRESSIVE",
            subnets: network.subnetIds.slice(0, 16),
            securityGroupIds: [network.securityGroupId],
            instanceRole: instanceProfileArn || instanceProfileName,
            instanceTypes: [instanceType],
            ec2Configuration:
              input.gpuRequested > 0 ? [{ imageType: "ECS_AL2_NVIDIA" }] : [{ imageType: "ECS_AL2" }],
            tags: {
              app: "osu-gpt",
            },
          },
          tags: {
            app: "osu-gpt",
          },
        }),
      );
      break;
    } catch (error) {
      const retryable =
        /cannot be found|NoSuchEntity|not yet propagated/i.test(messageOf(error)) && attempt < 5;
      if (!retryable) {
        throw error;
      }
      await sleep(1500 + attempt * 700);
    }
  }

  const computeEnvironmentArn = cleaned(response?.computeEnvironmentArn);
  if (computeEnvironmentArn) {
    input.provisionedResources.push(`batchComputeEnvironment:${input.requestedName}`);
    return computeEnvironmentArn;
  }
  throw new Error("AWS Batch compute environment creation did not return an ARN.");
}

async function ensureBatchQueue(
  clients: AwsClients,
  input: {
    requestedReference: string;
    computeEnvironment: string;
    provisionedResources: string[];
  },
) {
  const existingReference = await resolveJobQueueReference(clients.batch, input.requestedReference);
  if (existingReference) {
    return existingReference;
  }

  const queueName = normalizeBatchName(parseQueueName(input.requestedReference), "osu-gpt-queue");
  const waitForComputeEnvironmentValid = async () => {
    const deadline = Date.now() + 3 * 60 * 1000;
    while (Date.now() < deadline) {
      const response = await clients.batch.send(
        new DescribeComputeEnvironmentsCommand({
          computeEnvironments: [input.computeEnvironment],
        }),
      );
      const environment = response.computeEnvironments?.[0];
      const status = cleaned(environment?.status);
      if (status === "VALID") {
        return;
      }
      if (status === "INVALID") {
        throw new Error(
          `Compute environment ${input.computeEnvironment} is INVALID: ${cleaned(environment?.statusReason) || "unknown reason"}.`,
        );
      }
      await sleep(5000);
    }
    throw new Error(
      `Compute environment ${input.computeEnvironment} is not VALID yet. Wait a bit and retry auto-load.`,
    );
  };

  let response: CreateJobQueueCommandOutput | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      response = await clients.batch.send(
        new CreateJobQueueCommand({
          jobQueueName: queueName,
          state: "ENABLED",
          priority: 1,
          computeEnvironmentOrder: [{ order: 1, computeEnvironment: input.computeEnvironment }],
          tags: {
            app: "osu-gpt",
          },
        }),
      );
      break;
    } catch (error) {
      const message = messageOf(error);
      const alreadyExists = /already exists/i.test(message);
      if (alreadyExists) {
        const found = await resolveJobQueueReference(clients.batch, queueName);
        if (found) {
          return found;
        }
      }
      const notReady = /not valid|not in VALID state|must be valid/i.test(message);
      if (notReady && attempt < 5) {
        await waitForComputeEnvironmentValid();
        continue;
      }
      throw error;
    }
  }

  const queueArn = cleaned(response?.jobQueueArn);
  if (queueArn) {
    input.provisionedResources.push(`batchQueue:${queueName}`);
    return queueArn;
  }
  throw new Error("AWS Batch queue creation did not return an ARN.");
}

async function ensureBatchJobDefinition(
  clients: AwsClients,
  input: {
    requestedReference: string;
    requestedImage?: string;
    s3Bucket: string;
    provisionedResources: string[];
    warnings: string[];
  },
) {
  const existingReference = await resolveJobDefinitionReference(clients.batch, input.requestedReference);
  const configuredImage =
    cleaned(input.requestedImage) ||
    withEnvFallback("", "AWS_BATCH_JOB_IMAGE") ||
    withEnvFallback("", "OSUGPT_BATCH_JOB_IMAGE");
  if (existingReference) {
    if (!configuredImage) {
      return existingReference;
    }
    try {
      if (!(await isPlaceholderJobDefinition(clients.batch, existingReference))) {
        return existingReference;
      }
      input.warnings.push(
        "Existing batchJobDefinition is placeholder-only. Registering a new revision from AWS_BATCH_JOB_IMAGE.",
      );
    } catch {
      return existingReference;
    }
  }

  const jobDefinitionName = normalizeBatchName(
    parseJobDefinitionName(existingReference || input.requestedReference),
    "osu-gpt-job",
  );
  const image = configuredImage || "public.ecr.aws/docker/library/busybox:latest";
  if (!configuredImage) {
    input.warnings.push(
      "Job definition created with fallback image. Set AWS_BATCH_JOB_IMAGE to a real osu-gpt worker image.",
    );
  }

  const vcpu = parsePositiveInt(process.env.AWS_BATCH_JOB_VCPU, 4);
  const memory = parsePositiveInt(process.env.AWS_BATCH_JOB_MEMORY, 16384);
  const gpu = parsePositiveInt(process.env.AWS_BATCH_JOB_GPU, 1);

  const jobRoleName = normalizeBatchName(process.env.AWS_BATCH_JOB_ROLE_NAME, "osu-gpt-batch-job-role");
  const jobRoleArn = await ensureRole(
    clients.iam,
    jobRoleName,
    {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "ecs-tasks.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      ],
    },
    [],
  );

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await clients.iam.send(
          new PutRolePolicyCommand({
            RoleName: jobRoleName,
            PolicyName: "osu-gpt-batch-job-access",
            PolicyDocument: JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: ["s3:ListBucket"],
                  Resource: [`arn:aws:s3:::${input.s3Bucket}`],
                },
                {
                  Effect: "Allow",
                  Action: ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload"],
                  Resource: [`arn:aws:s3:::${input.s3Bucket}/*`],
                },
                {
                  Effect: "Allow",
                  Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
                  Resource: "*",
                },
              ],
            }),
          }),
        );
        break;
      } catch (error) {
        const retryable =
          /cannot be found|NoSuchEntity|not yet propagated/i.test(messageOf(error)) && attempt < 4;
        if (!retryable) {
          throw error;
        }
        await sleep(1200 + attempt * 500);
      }
    }
  } catch (error) {
    input.warnings.push(`Could not attach inline policy to job role '${jobRoleName}': ${messageOf(error)}`);
  }

  const fallbackCommand = [
    "sh",
    "-lc",
    "echo 'AWS_BATCH_JOB_IMAGE is not configured for osu-gpt worker. Job will fail until image is set.' >&2; sleep 2; exit 1",
  ];
  const hasRealImage = Boolean(configuredImage);

  let response: RegisterJobDefinitionCommandOutput | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      response = await clients.batch.send(
        new RegisterJobDefinitionCommand({
          jobDefinitionName,
          type: "container",
          containerProperties: {
            image,
            command: hasRealImage ? undefined : fallbackCommand,
            jobRoleArn: jobRoleArn || undefined,
            resourceRequirements: [
              { type: "VCPU", value: String(vcpu) },
              { type: "MEMORY", value: String(memory) },
              ...(gpu > 0 ? [{ type: "GPU" as const, value: String(gpu) }] : []),
            ],
          },
          retryStrategy: { attempts: 1 },
          propagateTags: true,
          tags: {
            app: "osu-gpt",
          },
        }),
      );
      break;
    } catch (error) {
      const retryable =
        /cannot be found|NoSuchEntity|not yet propagated/i.test(messageOf(error)) && attempt < 5;
      if (!retryable) {
        throw error;
      }
      await sleep(1500 + attempt * 600);
    }
  }

  const jobDefinitionArn = cleaned(response?.jobDefinitionArn);
  if (jobDefinitionArn) {
    input.provisionedResources.push(`batchJobDefinition:${jobDefinitionName}`);
    return jobDefinitionArn;
  }
  throw new Error("AWS Batch job definition registration did not return an ARN.");
}

export async function ensureAwsRuntimeResources(
  input: EnsureAwsRuntimeResourcesInput,
): Promise<EnsureAwsRuntimeResourcesResult> {
  const clients = buildAwsClients(input.region, input.credentials);
  const provisionedResources: string[] = [];
  const warnings: string[] = [];
  const accountId = await resolveAccountId(clients.sts);

  const s3Prefix = withEnvFallback(input.resources.s3Prefix, "AWS_S3_PREFIX") || DEFAULT_S3_PREFIX;
  const cloudWatchLogGroup =
    withEnvFallback(input.resources.cloudWatchLogGroup, "AWS_CLOUDWATCH_LOG_GROUP") || DEFAULT_LOG_GROUP;

  let s3Bucket = withEnvFallback(input.resources.s3Bucket, "AWS_S3_BUCKET");
  try {
    s3Bucket = await ensureS3Bucket(clients, input.region, s3Bucket, accountId, provisionedResources);
  } catch (error) {
    warnings.push(`Could not resolve/create s3Bucket: ${messageOf(error)}`);
  }

  let batchQueue = withEnvFallback(input.resources.batchQueue, "AWS_BATCH_QUEUE");
  let batchJobDefinition = withEnvFallback(input.resources.batchJobDefinition, "AWS_BATCH_JOB_DEFINITION");
  const configuredJobImage =
    cleaned(input.resources.jobImage) ||
    withEnvFallback("", "AWS_BATCH_JOB_IMAGE") ||
    withEnvFallback("", "OSUGPT_BATCH_JOB_IMAGE");

  const configuredJobGpu = parsePositiveInt(process.env.AWS_BATCH_JOB_GPU, 1);
  const computeEnvironmentName = normalizeBatchName(
    withEnvFallback("", "AWS_BATCH_COMPUTE_ENVIRONMENT_NAME"),
    "osu-gpt-ce",
  );

  if (!batchQueue || !(await resolveJobQueueReference(clients.batch, batchQueue))) {
    try {
      const computeEnvironment = await ensureBatchComputeEnvironment(clients, {
        requestedName: computeEnvironmentName,
        provisionedResources,
        gpuRequested: configuredJobGpu,
      });
      batchQueue = await ensureBatchQueue(clients, {
        requestedReference:
          parseQueueName(batchQueue) ||
          withEnvFallback("", "AWS_BATCH_QUEUE_NAME") ||
          withEnvFallback("", "AWS_BATCH_QUEUE") ||
          "osu-gpt-queue",
        computeEnvironment,
        provisionedResources,
      });
      warnings.push("Created AWS Batch compute resources. It can take a few minutes to become READY.");
    } catch (error) {
      warnings.push(`Could not resolve/create batchQueue: ${messageOf(error)}`);
      batchQueue = "";
    }
  } else {
    batchQueue = await resolveJobQueueReference(clients.batch, batchQueue);
  }

  if (!batchJobDefinition || !(await resolveJobDefinitionReference(clients.batch, batchJobDefinition))) {
    if (!s3Bucket) {
      warnings.push("Skipping batchJobDefinition creation because no usable s3Bucket is available.");
      batchJobDefinition = "";
    } else {
      try {
        batchJobDefinition = await ensureBatchJobDefinition(clients, {
          requestedReference:
            parseJobDefinitionName(batchJobDefinition) ||
            withEnvFallback("", "AWS_BATCH_JOB_DEFINITION_NAME") ||
            withEnvFallback("", "AWS_BATCH_JOB_DEFINITION") ||
            "osu-gpt-job",
          requestedImage: input.resources.jobImage,
          s3Bucket,
          provisionedResources,
          warnings,
        });
      } catch (error) {
        warnings.push(`Could not resolve/create batchJobDefinition: ${messageOf(error)}`);
        batchJobDefinition = "";
      }
    }
  } else {
    batchJobDefinition = await resolveJobDefinitionReference(clients.batch, batchJobDefinition);
    if (configuredJobImage) {
      try {
        if (await isPlaceholderJobDefinition(clients.batch, batchJobDefinition)) {
          batchJobDefinition = await ensureBatchJobDefinition(clients, {
            requestedReference: batchJobDefinition,
            requestedImage: input.resources.jobImage,
            s3Bucket: s3Bucket || withEnvFallback("", "AWS_S3_BUCKET"),
            provisionedResources,
            warnings,
          });
        }
      } catch (error) {
        warnings.push(`Could not upgrade placeholder batchJobDefinition: ${messageOf(error)}`);
      }
    }
  }

  const missing: string[] = [];
  if (!batchQueue) missing.push("batchQueue");
  if (!batchJobDefinition) missing.push("batchJobDefinition");
  if (!s3Bucket) missing.push("s3Bucket");

  if (batchJobDefinition) {
    try {
      if (await isPlaceholderJobDefinition(clients.batch, batchJobDefinition)) {
        warnings.push(
          "Current batchJobDefinition uses a placeholder image. Set AWS_BATCH_JOB_IMAGE, then register a real worker job definition.",
        );
      }
    } catch {
      // Best-effort warning only.
    }
  }

  return {
    batchQueue,
    batchJobDefinition,
    s3Bucket,
    s3Prefix,
    cloudWatchLogGroup,
    missing,
    provisionedResources,
    warnings,
  };
}
