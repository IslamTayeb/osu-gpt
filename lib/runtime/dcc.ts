import fs from "node:fs";
import path from "node:path";
import { FALLBACK_TARGET, GPU_PREFERENCE, loadPin, parseGpuAvail, Pin } from "./dccConfig";
import { buildGeneratorParams } from "../generatorConfig";

import { collectArtifacts, setJobState } from "../jobs";
import { readStore } from "../store";
import { GenerationJob } from "../types";
import { rsyncDown, rsyncUp, ssh, sshReachable, shq } from "./ssh";
import { GenerationRuntime, JobContext } from "./types";

async function pickTarget(host: string, log: (line: string) => void) {
  try {
    const output = await ssh(
      host,
      "gpuavail -m -p gpu-common 2>/dev/null; echo ::SPLIT::; gpuavail -m -p scavenger-gpu 2>/dev/null",
      { timeoutMs: 30_000 },
    );
    const [common, scavenger] = output.split("::SPLIT::");
    const byPartition: Record<string, Map<string, number>> = {
      "gpu-common": parseGpuAvail(common ?? ""),
      "scavenger-gpu": parseGpuAvail(scavenger ?? ""),
    };
    for (const candidate of GPU_PREFERENCE) {
      if ((byPartition[candidate.partition]?.get(candidate.gres) ?? 0) > 0) {
        log(`Free GPU found: ${candidate.gres} on ${candidate.partition}.`);
        return candidate;
      }
    }
    log("No free GPUs right now — queueing on gpu-common 2080.");
  } catch (error) {
    log(
      `Could not read GPU availability (${error instanceof Error ? error.message : error}); ` +
        `queueing on gpu-common 2080.`,
    );
  }
  return FALLBACK_TARGET;
}

function buildManifest(contexts: JobContext[], remoteDir: string) {
  return {
    items: contexts.map((ctx) => ({
      id: ctx.job.id,
      audio_path: `${remoteDir}/audio/${ctx.job.id}.mp3`,
      output_path: `${remoteDir}/out/${ctx.job.id}`,
      overrides: hydraOverridesToManifest(ctx),
    })),
  };
}

/**
 * The batch driver takes per-item values as a plain object rather than Hydra
 * strings, so reuse the same sparse param builder and unwrap it.
 */
function hydraOverridesToManifest(ctx: JobContext): Record<string, unknown> {
  const params = buildGeneratorParams(ctx.job.generatorParams, ctx.track);
  const overrides: Record<string, unknown> = {};
  const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    overrides[snake(key)] = value;
  }
  overrides.export_osz = true;
  return overrides;
}

function buildSbatch(options: {
  pin: Pin;
  partition: string;
  gres: string;
  remoteDir: string;
  modelVersion: string;
  experimentalCompile: boolean;
  itemCount: number;
}) {
  const { pin, partition, gres, remoteDir, modelVersion, experimentalCompile } = options;
  return `#!/bin/bash
#SBATCH --job-name=osugpt-${options.itemCount}
#SBATCH --account=${pin.dcc.account}
#SBATCH --partition=${partition}
#SBATCH --gres=gpu:${gres}:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=48G
#SBATCH --time=00:45:00
#SBATCH --requeue
#SBATCH --open-mode=append
#SBATCH --output=${remoteDir}/slurm.log
set -euo pipefail
export PATH="${pin.dcc.env}/bin:$PATH"
export HF_HOME=${pin.dcc.hfHome}
export TOKENIZERS_PARALLELISM=false
export OSUGPT_BATCH_MANIFEST=${remoteDir}/manifest.json
${experimentalCompile ? "export MAPPERATORINATOR_COMPILE_DECODE=1\nexport MAPPERATORINATOR_ALLOW_CAPTURE_FALLBACK=1" : ""}
cd ${pin.dcc.repo}
echo "osugpt: host=$(hostname) gres=${gres} commit=$(git rev-parse --short HEAD)"
python batch_inference.py -cn ${modelVersion}
echo "osugpt: BATCH_DONE"
`;
}

type ResultRecord = { id: string; status: "completed" | "failed"; error?: string; seconds: number };

async function readResults(host: string, remoteDir: string): Promise<ResultRecord[]> {
  const raw = await ssh(
    host,
    `cat ${shq(`${remoteDir}/manifest.results.jsonl`)} 2>/dev/null || true`,
  );
  return raw
    .split("\n")
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => JSON.parse(line) as ResultRecord);
}

/** Mirror the remote slurm log into each job's local log, tracking byte offsets. */
async function streamLogs(host: string, remoteDir: string, contexts: JobContext[]) {
  const offset = contexts[0]?.job.dcc?.logOffset ?? 0;
  const output = await ssh(
    host,
    `tail -c +${offset + 1} ${shq(`${remoteDir}/slurm.log`)} 2>/dev/null || true`,
  );
  if (!output) return offset;
  // Progress bars use \r; keep only completed lines so logs stay readable.
  const lines = output.replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  for (const line of lines.slice(-40)) {
    for (const ctx of contexts) ctx.appendLog(line);
  }
  return offset + Buffer.byteLength(output);
}

export const dccRuntime: GenerationRuntime = {
  id: "dcc",
  batchSize: 8,

  async checkReady() {
    const pin = loadPin();
    const reachable = await sshReachable(pin.dcc.sshHost);
    if (!reachable.ok) return reachable;
    try {
      const head = (
        await ssh(pin.dcc.sshHost, `git -C ${shq(pin.dcc.repo)} rev-parse --short HEAD`)
      ).trim();
      if (!pin.sha.startsWith(head) && !head.startsWith(pin.sha)) {
        return {
          ok: true,
          detail: `Cluster checkout is at ${head}, expected ${pin.sha}. Run the sync step.`,
        };
      }
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
    return { ok: true };
  },

  async run(contexts) {
    if (contexts.length === 0) return;
    const pin = loadPin();
    const host = pin.dcc.sshHost;
    const batchId = contexts[0].job.id;
    const remoteDir = `${pin.dcc.workDir}/jobs/${batchId}`;
    const log = (line: string) => contexts.forEach((ctx) => ctx.appendLog(line));

    const target = await pickTarget(host, log);
    await ssh(host, `mkdir -p ${shq(`${remoteDir}/audio`)} ${shq(`${remoteDir}/out`)}`);

    // Stage audio under the job id so the manifest paths are predictable.
    const stageDir = fs.mkdtempSync(path.join(process.cwd(), ".data", "stage-"));
    try {
      for (const ctx of contexts) {
        fs.copyFileSync(ctx.audioPath, path.join(stageDir, `${ctx.job.id}.mp3`));
      }
      await rsyncUp(
        host,
        fs.readdirSync(stageDir).map((f) => path.join(stageDir, f)),
        `${remoteDir}/audio/`,
      );
    } finally {
      fs.rmSync(stageDir, { recursive: true, force: true });
    }

    const manifestPath = path.join(process.cwd(), ".data", `manifest-${batchId}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(contexts, remoteDir), null, 2));
    try {
      await rsyncUp(host, [manifestPath], `${remoteDir}/manifest.json`);
    } finally {
      fs.rmSync(manifestPath, { force: true });
    }

    const settings = readStore().settings;
    const script = buildSbatch({
      pin,
      partition: target.partition,
      gres: target.gres,
      remoteDir,
      modelVersion: contexts[0].job.modelVersion || settings.modelVersion,
      experimentalCompile: Boolean(contexts[0].job.experimentalCompile),
      itemCount: contexts.length,
    });
    const slurmJobId = (await ssh(host, "sbatch --parsable", { input: script })).trim();
    log(`Submitted Slurm job ${slurmJobId} (${target.gres} on ${target.partition}).`);

    const meta = {
      slurmJobId,
      partition: target.partition,
      gres: target.gres,
      remoteDir,
      requeueCount: 0,
      logOffset: 0,
      submittedAt: new Date().toISOString(),
    };
    for (const ctx of contexts) {
      setJobState(ctx.job.id, { status: "queued", dcc: meta });
    }

    await pollUntilDone(host, slurmJobId, remoteDir, contexts);
  },

  async cancel(job: GenerationJob) {
    const pin = loadPin();
    if (job.dcc?.slurmJobId) {
      await ssh(pin.dcc.sshHost, `scancel ${shq(job.dcc.slurmJobId)}`).catch(() => {});
    }
  },
};

const TERMINAL = /^(COMPLETED|FAILED|TIMEOUT|CANCELLED|OUT_OF_MEMORY|NODE_FAIL|DEADLINE)/;

async function pollUntilDone(
  host: string,
  slurmJobId: string,
  remoteDir: string,
  contexts: JobContext[],
) {
  let started = false;
  let requeueCount = 0;
  let logOffset = 0;

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 10_000));

    const raw = (
      await ssh(host, `sacct -X -n -P -o State,Reason -j ${shq(slurmJobId)}`)
    ).trim();
    const [state = "", reason = ""] = raw.split("\n")[0]?.split("|") ?? [];

    logOffset = await streamLogs(host, remoteDir, contexts).catch(() => logOffset);

    if (state.startsWith("PENDING") || state.startsWith("REQUEUED") || state.startsWith("SUSPENDED")) {
      for (const ctx of contexts) {
        setJobState(ctx.job.id, { status: "queued", dcc: { ...ctx.job.dcc!, statusReason: reason, logOffset } });
      }
      continue;
    }

    if (state.startsWith("PREEMPTED")) {
      requeueCount += 1;
      contexts.forEach((ctx) =>
        ctx.appendLog(`Preempted on ${ctx.job.dcc?.partition} — requeued (${requeueCount}/3).`),
      );
      if (requeueCount >= 3) {
        await ssh(host, `scancel ${shq(slurmJobId)}`).catch(() => {});
        failAll(contexts, "Preempted three times; give up and retry on gpu-common.");
        return;
      }
      continue;
    }

    if (state.startsWith("RUNNING") || state.startsWith("COMPLETING")) {
      if (!started) {
        started = true;
        for (const ctx of contexts) {
          setJobState(ctx.job.id, { status: "running", startedAt: new Date().toISOString() });
        }
      }
      continue;
    }

    if (TERMINAL.test(state)) {
      await finish(host, remoteDir, contexts, state, reason);
      return;
    }
  }
}

async function finish(
  host: string,
  remoteDir: string,
  contexts: JobContext[],
  state: string,
  reason: string,
) {
  const results = await readResults(host, remoteDir).catch(() => [] as ResultRecord[]);
  const byId = new Map(results.map((r) => [r.id, r]));

  for (const ctx of contexts) {
    const result = byId.get(ctx.job.id);
    const localDir = path.join(process.cwd(), ".data", "artifacts", ctx.job.id);
    fs.mkdirSync(localDir, { recursive: true });

    if (result?.status === "completed") {
      try {
        await rsyncDown(host, `${remoteDir}/out/${ctx.job.id}/`, `${localDir}/`);
        const artifacts = collectArtifacts(ctx.job.id, localDir);
        if (artifacts.length === 0) {
          setJobState(ctx.job.id, {
            status: "failed",
            error: "The cluster reported success but produced no beatmap.",
            finishedAt: new Date().toISOString(),
          });
          continue;
        }
        setJobState(ctx.job.id, {
          status: "completed",
          artifacts,
          finishedAt: new Date().toISOString(),
        });
      } catch (error) {
        setJobState(ctx.job.id, {
          status: "failed",
          error: `Could not retrieve results: ${error instanceof Error ? error.message : error}`,
          finishedAt: new Date().toISOString(),
        });
      }
    } else {
      setJobState(ctx.job.id, {
        status: "failed",
        error: result?.error ?? `Slurm job ended as ${state}${reason ? ` (${reason})` : ""}.`,
        finishedAt: new Date().toISOString(),
      });
    }
  }

  // Keep failed batches on the cluster for debugging; /work is purged anyway.
  const allDone = contexts.every((ctx) => byId.get(ctx.job.id)?.status === "completed");
  if (allDone) {
    await ssh(host, `rm -rf ${shq(remoteDir)}`).catch(() => {});
  }
}

function failAll(contexts: JobContext[], error: string) {
  for (const ctx of contexts) {
    setJobState(ctx.job.id, { status: "failed", error, finishedAt: new Date().toISOString() });
  }
}


