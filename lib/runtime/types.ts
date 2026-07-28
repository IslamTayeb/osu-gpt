import { GenerationJob, Track } from "../types";

export type JobContext = {
  job: GenerationJob;
  track: Track;
  /** Normalized, duration-verified audio on the local disk. */
  audioPath: string;
  appendLog: (line: string) => void;
};

export type GenerationRuntime = {
  id: GenerationJob["runtime"];
  /** Cheap preflight so the UI can warn before anything is queued. */
  checkReady(): Promise<{ ok: boolean; detail?: string }>;
  /** Drive one or more jobs to a terminal state. */
  run(contexts: JobContext[]): Promise<void>;
  cancel?(job: GenerationJob): Promise<void>;
  /** Re-attach to work that is still running elsewhere after a restart. */
  resume?(job: GenerationJob, context: JobContext): Promise<void>;
  /** How many jobs this runtime prefers to receive at once. */
  batchSize: number;
};
