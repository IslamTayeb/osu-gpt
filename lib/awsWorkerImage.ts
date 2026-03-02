import fs from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import {
  BatchGetBuildsCommand,
  BatchGetProjectsCommand,
  CodeBuildClient,
  CreateProjectCommand,
  StartBuildCommand,
  UpdateProjectCommand,
} from "@aws-sdk/client-codebuild";
import {
  CreateRepositoryCommand,
  DescribeImagesCommand,
  DescribeRepositoriesCommand,
  ECRClient,
  GetAuthorizationTokenCommand,
} from "@aws-sdk/client-ecr";
import { CreateRoleCommand, GetRoleCommand, IAMClient, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import type { AwsCredentialShape } from "./awsAutoConfig";

const execFileAsync = promisify(execFile);

export type EnsureAwsWorkerImageInput = {
  region: string;
  credentials: AwsCredentialShape;
  repositoryName?: string;
  imageTag?: string;
};

export type EnsureAwsWorkerImageResult = {
  imageUri?: string;
  repositoryName: string;
  imageTag: string;
  built: boolean;
  warnings: string[];
};

function cleaned(value: string | undefined) {
  return (value ?? "").trim();
}

function nameOf(error: unknown) {
  if (typeof error === "object" && error && "name" in error) {
    return String((error as { name?: string }).name ?? "");
  }
  return "";
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isTruthyEnv(value: string | undefined) {
  return /^(1|true|yes|on)$/i.test(cleaned(value));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOrThrow(cmd: string, args: string[], cwd?: string) {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    cwd,
    maxBuffer: 1024 * 1024 * 20,
  });
  const output = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
  return output;
}

async function dockerReadiness() {
  try {
    await runOrThrow("docker", ["--version"]);
    await runOrThrow("docker", ["info"]);
    return { ready: true as const, reason: "" };
  } catch (error) {
    return { ready: false as const, reason: messageOf(error) };
  }
}

type EcrRepositoryInfo = {
  repositoryUri: string;
  repositoryArn: string;
};

async function ensureEcrRepository(ecr: ECRClient, repositoryName: string): Promise<EcrRepositoryInfo> {
  try {
    const existing = await ecr.send(new DescribeRepositoriesCommand({ repositoryNames: [repositoryName] }));
    const repositoryUri = cleaned(existing.repositories?.[0]?.repositoryUri);
    const repositoryArn = cleaned(existing.repositories?.[0]?.repositoryArn);
    if (repositoryUri && repositoryArn) {
      return { repositoryUri, repositoryArn };
    }
  } catch (error) {
    if (nameOf(error) !== "RepositoryNotFoundException") {
      throw error;
    }
  }

  const created = await ecr.send(
    new CreateRepositoryCommand({
      repositoryName,
      imageTagMutability: "MUTABLE",
      imageScanningConfiguration: { scanOnPush: true },
      tags: [{ Key: "app", Value: "osu-gpt" }],
    }),
  );
  const repositoryUri = cleaned(created.repository?.repositoryUri);
  const repositoryArn = cleaned(created.repository?.repositoryArn);
  if (!repositoryUri || !repositoryArn) {
    throw new Error("ECR repository creation did not return repository URI.");
  }
  return { repositoryUri, repositoryArn };
}

async function imageTagExists(ecr: ECRClient, repositoryName: string, imageTag: string) {
  try {
    const response = await ecr.send(
      new DescribeImagesCommand({
        repositoryName,
        imageIds: [{ imageTag }],
      }),
    );
    return (response.imageDetails ?? []).length > 0;
  } catch (error) {
    const name = nameOf(error);
    if (name === "ImageNotFoundException" || name === "RepositoryNotFoundException") {
      return false;
    }
    throw error;
  }
}

function decodeAuthorizationToken(raw: string) {
  const decoded = Buffer.from(raw, "base64").toString("utf8");
  const [username, password] = decoded.split(":");
  if (!username || !password) {
    throw new Error("Invalid ECR authorization token format.");
  }
  return { username, password };
}

async function dockerLogin(registryHost: string, username: string, password: string) {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("docker", ["login", "--username", username, "--password-stdin", registryHost], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdin.write(`${password}\n`);
    proc.stdin.end();

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `docker login failed with code ${code ?? "unknown"}`));
      }
    });
    proc.on("error", reject);
  });
}

async function ensureCodeBuildRole(
  iam: IAMClient,
  input: {
    roleName: string;
    repositoryArn: string;
  },
) {
  let roleArn = "";
  let createdNow = false;
  try {
    const existing = await iam.send(new GetRoleCommand({ RoleName: input.roleName }));
    roleArn = cleaned(existing.Role?.Arn);
  } catch (error) {
    if (nameOf(error) !== "NoSuchEntity" && nameOf(error) !== "NoSuchEntityException") {
      throw error;
    }
    const created = await iam.send(
      new CreateRoleCommand({
        RoleName: input.roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { Service: "codebuild.amazonaws.com" },
              Action: "sts:AssumeRole",
            },
          ],
        }),
        Description: "Auto-created by osu-gpt one-click AWS setup (CodeBuild image builder).",
      }),
    );
    roleArn = cleaned(created.Role?.Arn);
    createdNow = true;
  }

  await iam.send(
    new PutRolePolicyCommand({
      RoleName: input.roleName,
      PolicyName: "osu-gpt-codebuild-image-builder",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: ["ecr:GetAuthorizationToken"],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: [
              "ecr:BatchCheckLayerAvailability",
              "ecr:CompleteLayerUpload",
              "ecr:GetDownloadUrlForLayer",
              "ecr:InitiateLayerUpload",
              "ecr:PutImage",
              "ecr:UploadLayerPart",
              "ecr:BatchGetImage",
            ],
            Resource: [input.repositoryArn],
          },
        ],
      }),
    }),
  );

  if (createdNow) {
    await sleep(3000);
  }
  return roleArn;
}

async function ensureCodeBuildProject(
  codebuild: CodeBuildClient,
  input: {
    projectName: string;
    serviceRoleArn: string;
    buildImage: string;
    computeType: string;
    timeoutMinutes: number;
  },
) {
  const existing = await codebuild.send(new BatchGetProjectsCommand({ names: [input.projectName] }));
  const hasProject = Boolean((existing.projects ?? []).length > 0);

  const payload = {
    name: input.projectName,
    description: "Auto-created by osu-gpt one-click AWS setup to build worker image.",
    serviceRole: input.serviceRoleArn,
    source: { type: "NO_SOURCE" as const },
    artifacts: { type: "NO_ARTIFACTS" as const },
    environment: {
      type: "LINUX_CONTAINER" as const,
      image: input.buildImage,
      computeType: input.computeType as
        | "BUILD_GENERAL1_SMALL"
        | "BUILD_GENERAL1_MEDIUM"
        | "BUILD_GENERAL1_LARGE"
        | "BUILD_GENERAL1_XLARGE"
        | "BUILD_GENERAL1_2XLARGE",
      privilegedMode: true,
      imagePullCredentialsType: "CODEBUILD" as const,
    },
    timeoutInMinutes: input.timeoutMinutes,
    queuedTimeoutInMinutes: Math.max(30, input.timeoutMinutes),
  };

  if (hasProject) {
    await codebuild.send(new UpdateProjectCommand(payload));
    return;
  }
  await codebuild.send(new CreateProjectCommand(payload));
}

function indentBlock(value: string, spaces: number) {
  const prefix = " ".repeat(spaces);
  const lines = value.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  return lines.map((line) => `${prefix}${line}`).join("\n");
}

function codeBuildSpec(workerScript: string, workerDockerfile: string) {
  return [
    "version: 0.2",
    "phases:",
    "  pre_build:",
    "    commands:",
    "      - set -euo pipefail",
    "      - mkdir -p web/scripts web/docker",
    "      - |",
    "          cat > web/scripts/aws_batch_worker.py <<'PYEOF'",
    `${indentBlock(workerScript, 10)}`,
    "          PYEOF",
    "      - |",
    "          cat > web/docker/aws-worker.Dockerfile <<'DOCKEREOF'",
    `${indentBlock(workerDockerfile, 10)}`,
    "          DOCKEREOF",
    "      - git clone --depth 1 https://github.com/OliBomby/Mapperatorinator.git Mapperatorinator",
    '      - aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"',
    "  build:",
    "    commands:",
    '      - docker build -f web/docker/aws-worker.Dockerfile -t "$IMAGE_URI" .',
    '      - docker push "$IMAGE_URI"',
    "artifacts:",
    "  files: []",
    "",
  ].join("\n");
}

async function buildViaCodeBuild(
  input: EnsureAwsWorkerImageInput & {
    repositoryArn: string;
    repositoryUri: string;
    imageUri: string;
  },
) {
  const warnings: string[] = [];
  const roleName =
    cleaned(process.env.AWS_BATCH_WORKER_CODEBUILD_ROLE_NAME) || "osu-gpt-codebuild-image-builder-role";
  const projectName =
    cleaned(process.env.AWS_BATCH_WORKER_CODEBUILD_PROJECT_NAME) || "osu-gpt-worker-image-build";
  const buildImage = cleaned(process.env.AWS_BATCH_WORKER_CODEBUILD_IMAGE) || "aws/codebuild/standard:7.0";
  const computeType = cleaned(process.env.AWS_BATCH_WORKER_CODEBUILD_COMPUTE_TYPE) || "BUILD_GENERAL1_LARGE";
  const timeoutMinutesRaw = Number(process.env.AWS_BATCH_WORKER_CODEBUILD_TIMEOUT_MINUTES ?? "90");
  const timeoutMinutes = Number.isFinite(timeoutMinutesRaw)
    ? Math.min(480, Math.max(15, Math.floor(timeoutMinutesRaw)))
    : 90;

  const iam = new IAMClient({
    region: input.region,
    credentials: input.credentials,
  });
  const codebuild = new CodeBuildClient({
    region: input.region,
    credentials: input.credentials,
  });

  let roleArn = "";
  try {
    roleArn = await ensureCodeBuildRole(iam, {
      roleName,
      repositoryArn: input.repositoryArn,
    });
  } catch (error) {
    warnings.push(`CodeBuild role setup failed: ${messageOf(error)}`);
    return { built: false, warnings };
  }

  try {
    await ensureCodeBuildProject(codebuild, {
      projectName,
      serviceRoleArn: roleArn,
      buildImage,
      computeType,
      timeoutMinutes,
    });
  } catch (error) {
    warnings.push(`CodeBuild project setup failed: ${messageOf(error)}`);
    return { built: false, warnings };
  }

  const repoRoot = path.resolve(process.cwd(), "..");
  const workerScriptPath = path.join(repoRoot, "web", "scripts", "aws_batch_worker.py");
  const workerDockerfilePath = path.join(repoRoot, "web", "docker", "aws-worker.Dockerfile");
  const workerScript = fs.readFileSync(workerScriptPath, "utf8");
  const workerDockerfile = fs.readFileSync(workerDockerfilePath, "utf8");
  const buildspec = codeBuildSpec(workerScript, workerDockerfile);
  const ecrRegistry = input.repositoryUri.split("/")[0] ?? "";
  if (!ecrRegistry) {
    warnings.push("Could not derive ECR registry endpoint for CodeBuild.");
    return { built: false, warnings };
  }

  let buildId = "";
  try {
    const started = await codebuild.send(
      new StartBuildCommand({
        projectName,
        buildspecOverride: buildspec,
        environmentVariablesOverride: [
          { name: "IMAGE_URI", value: input.imageUri, type: "PLAINTEXT" },
          { name: "ECR_REGISTRY", value: ecrRegistry, type: "PLAINTEXT" },
        ],
      }),
    );
    buildId = cleaned(started.build?.id);
    if (!buildId) {
      warnings.push("CodeBuild did not return build ID.");
      return { built: false, warnings };
    }
  } catch (error) {
    warnings.push(`CodeBuild start failed: ${messageOf(error)}`);
    return { built: false, warnings };
  }

  const deadline = Date.now() + timeoutMinutes * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(10_000);
    const status = await codebuild.send(new BatchGetBuildsCommand({ ids: [buildId] }));
    const build = status.builds?.[0];
    const buildStatus = cleaned(build?.buildStatus);
    if (
      !buildStatus ||
      buildStatus === "IN_PROGRESS" ||
      buildStatus === "QUEUED" ||
      buildStatus === "STOPPING"
    ) {
      continue;
    }
    if (buildStatus === "SUCCEEDED") {
      return { built: true, warnings };
    }
    const deepLink = cleaned(build?.logs?.deepLink);
    const statusReason = cleaned(build?.currentPhase);
    warnings.push(
      `CodeBuild image build failed with status ${buildStatus}${statusReason ? ` (${statusReason})` : ""}${deepLink ? `. Logs: ${deepLink}` : ""}.`,
    );
    return { built: false, warnings };
  }

  warnings.push("CodeBuild image build timed out.");
  return { built: false, warnings };
}

export async function ensureAwsWorkerImage(
  input: EnsureAwsWorkerImageInput,
): Promise<EnsureAwsWorkerImageResult> {
  const repositoryName =
    cleaned(input.repositoryName) || cleaned(process.env.AWS_BATCH_WORKER_ECR_REPOSITORY) || "osu-gpt-worker";
  const imageTag = cleaned(input.imageTag) || cleaned(process.env.AWS_BATCH_WORKER_IMAGE_TAG) || "latest";
  const warnings: string[] = [];

  const ecr = new ECRClient({
    region: input.region,
    credentials: input.credentials,
  });

  const repository = await ensureEcrRepository(ecr, repositoryName);
  const repositoryUri = repository.repositoryUri;
  const imageUri = `${repositoryUri}:${imageTag}`;
  if (await imageTagExists(ecr, repositoryName, imageTag)) {
    return {
      imageUri,
      repositoryName,
      imageTag,
      built: false,
      warnings,
    };
  }

  const docker = await dockerReadiness();
  if (docker.ready) {
    const auth = await ecr.send(new GetAuthorizationTokenCommand({}));
    const authData = auth.authorizationData?.[0];
    const token = cleaned(authData?.authorizationToken);
    const proxyEndpoint = cleaned(authData?.proxyEndpoint);
    if (token && proxyEndpoint) {
      const { username, password } = decodeAuthorizationToken(token);
      const registryHost = proxyEndpoint.replace(/^https?:\/\//, "");
      const repoRoot = path.resolve(process.cwd(), "..");
      const dockerfilePath = path.join(repoRoot, "web", "docker", "aws-worker.Dockerfile");
      try {
        await dockerLogin(registryHost, username, password);
        await runOrThrow("docker", ["build", "-f", dockerfilePath, "-t", imageUri, "."], repoRoot);
        await runOrThrow("docker", ["push", imageUri], repoRoot);
        return {
          imageUri,
          repositoryName,
          imageTag,
          built: true,
          warnings,
        };
      } catch (error) {
        const conciseError =
          messageOf(error)
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)[0] || "unknown error";
        warnings.push(`Local Docker image build failed: ${conciseError}`);
      }
    }
  } else {
    const conciseReason =
      docker.reason
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)[0] || "";
    warnings.push(
      `Docker is not ready on the host (${conciseReason || "unknown reason"}). Falling back to AWS CodeBuild worker image build.`,
    );
  }

  if (isTruthyEnv(process.env.AWS_BATCH_WORKER_DISABLE_CODEBUILD)) {
    warnings.push("AWS CodeBuild fallback is disabled (AWS_BATCH_WORKER_DISABLE_CODEBUILD=true).");
    return {
      imageUri: undefined,
      repositoryName,
      imageTag,
      built: false,
      warnings,
    };
  }

  const remoteBuild = await buildViaCodeBuild({
    ...input,
    repositoryArn: repository.repositoryArn,
    repositoryUri,
    imageUri,
  });
  warnings.push(...remoteBuild.warnings);

  if (remoteBuild.built && (await imageTagExists(ecr, repositoryName, imageTag))) {
    return {
      imageUri,
      repositoryName,
      imageTag,
      built: true,
      warnings,
    };
  }

  return {
    imageUri: undefined,
    repositoryName,
    imageTag,
    built: false,
    warnings,
  };
}
