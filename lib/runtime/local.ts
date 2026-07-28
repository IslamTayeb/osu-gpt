import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { buildGeneratorParams, toHydraOverrides } from "../generatorConfig";
import { collectArtifacts, setJobState } from "../jobs";
import { GenerationRuntime, JobContext } from "./types";

/** Local inference needs its own heavier env; see README. */
function inferencePython() {
  if (process.env.MAPPERATORINATOR_PYTHON) return process.env.MAPPERATORINATOR_PYTHON;
  const local = path.join(mapperatorinatorDir(), ".venv", "bin", "python");
  return fs.existsSync(local) ? local : "python";
}

function mapperatorinatorDir() {
  return process.env.MAPPERATORINATOR_DIR
    ? path.resolve(process.env.MAPPERATORINATOR_DIR)
    : path.resolve(process.cwd(), "..", "Mapperatorinator");
}

function runInference(
  pythonBin: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args, { cwd });
    let tail = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Inference timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    const handle = (chunk: Buffer) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-2000);
      for (const line of text.replace(/\r/g, "\n").split("\n")) {
        if (line.trim()) onLine(line.trim());
      }
    };
    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Inference exited with code ${code}: ${tail.slice(-600)}`));
    });
  });
}

export const localRuntime: GenerationRuntime = {
  id: "local",
  // One at a time: a local GPU (or CPU) has no room to overlap runs.
  batchSize: 1,

  async checkReady() {
    const dir = mapperatorinatorDir();
    if (!fs.existsSync(path.join(dir, "inference.py"))) {
      return { ok: false, detail: `Mapperatorinator not found at ${dir}` };
    }
    return { ok: true };
  },

  async run(contexts: JobContext[]) {
    for (const ctx of contexts) {
      const outputDir = path.join(process.cwd(), ".data", "artifacts", ctx.job.id);
      fs.mkdirSync(outputDir, { recursive: true });
      setJobState(ctx.job.id, { status: "running", startedAt: new Date().toISOString() });

      const params = buildGeneratorParams(ctx.job.generatorParams, ctx.track);
      const args = [
        "inference.py",
        "-cn",
        ctx.job.modelVersion,
        `audio_path=${JSON.stringify(ctx.audioPath)}`,
        `output_path=${JSON.stringify(outputDir)}`,
        ...toHydraOverrides(params),
      ];
      ctx.appendLog(`Running: python ${args.join(" ")}`);

      try {
        await runInference(
          inferencePython(),
          args,
          mapperatorinatorDir(),
          ctx.job.timeoutSec * 1000,
          ctx.appendLog,
        );
        const artifacts = collectArtifacts(ctx.job.id, outputDir);
        if (artifacts.length === 0) {
          throw new Error("Inference finished but produced no beatmap.");
        }
        setJobState(ctx.job.id, {
          status: "completed",
          artifacts,
          finishedAt: new Date().toISOString(),
        });
      } catch (error) {
        setJobState(ctx.job.id, {
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          finishedAt: new Date().toISOString(),
        });
      }
    }
  },
};
