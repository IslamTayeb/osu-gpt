export type RuntimeType = "local" | "dcc";
export type MusicProvider = "spotify";

/** Config name passed to Mapperatorinator as `-cn <name>`. */
export type ModelVersion = "v32" | "v32-mini" | "v31" | "v30";

/**
 * Only the parameters osu-gpt actually controls. Anything left null is omitted
 * from the Hydra overrides so the model's own inference config wins — v32 ships
 * tuned sampling plus bf16 and the fast decoder loop, and sending defaults for
 * every key (as this once did) silently clobbered all of it.
 */
export type GeneratorParams = {
  // Always sent.
  difficulty?: number | null;
  hpDrainRate?: number | null;
  circleSize?: number | null;
  overallDifficulty?: number | null;
  approachRate?: number | null;
  // Advanced; sent only when set.
  mapperId?: number | null;
  year?: number | null;
  hitsounded?: boolean | null;
  descriptors?: string[] | null;
  negativeDescriptors?: string[] | null;
  cfgScale?: number | null;
  temperature?: number | null;
  topP?: number | null;
  seed?: number | null;
  superTiming?: boolean | null;
  startTime?: number | null;
  endTime?: number | null;
  // Beatmap metadata, derived from the track.
  title?: string | null;
  titleUnicode?: string | null;
  artist?: string | null;
  artistUnicode?: string | null;
  creator?: string | null;
  version?: string | null;
};

export type Track = {
  id: string;
  provider: MusicProvider;
  providerTrackId: string;
  title: string;
  artists: string[];
  album: string;
  durationMs: number;
  artworkUrl: string;
  externalUrl: string;
  isrc?: string;
  source: "liked" | "playlist" | "library";
  sourceLabel: string;
  importedAt: string;
};

export type MatchResult = {
  beatmapsetId: number;
  title: string;
  artist: string;
  status: string;
  url: string;
  confidence: number;
  rationale: string;
  durationDeltaMs: number;
  maxDifficultyRating?: number | null;
  topDifficultyName?: string | null;
  bpm?: number | null;
};

export type Artifact = {
  id: string;
  jobId: string;
  fileName: string;
  storage: "local";
  relativePath?: string;
  sizeBytes: number;
  expiresAt: string;
  createdAt: string;
};

export type DccJobMeta = {
  slurmJobId: string;
  partition: string;
  gres: string;
  remoteDir: string;
  node?: string;
  statusReason?: string;
  requeueCount: number;
  /** Bytes of the remote slurm log already mirrored locally. */
  logOffset: number;
  submittedAt?: string;
  lastPolledAt?: string;
};

export type GenerationJob = {
  id: string;
  trackId: string;
  runtime: RuntimeType;
  modelVersion: ModelVersion;
  generatorParams: GeneratorParams;
  experimentalCompile?: boolean;
  timeoutSec: number;
  status: "queued" | "running" | "completed" | "failed";
  warning?: string;
  error?: string;
  artifacts: Artifact[];
  dcc?: DccJobMeta;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
};

export type SpotifyImportStatus = {
  status: "idle" | "running" | "completed" | "failed";
  phase?: string;
  message?: string;
  importedCount?: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

export type TrackMatchSnapshot = {
  trackId: string;
  matches: MatchResult[];
  topHit?: MatchResult | null;
  strongMatch: boolean;
  autoGenerate: boolean;
  updatedAt: string;
  error?: string;
};

export type AppSettings = {
  runtime: RuntimeType;
  /** Where downloaded + normalized full songs are cached. */
  audioCacheDir: string;
  /** Generated .osz files are copied here when set (e.g. the osu! Songs folder). */
  exportDir?: string | null;
  loudnormEnabled: boolean;
  loudnormTargetLufs: number;
  prefetchPreviews: boolean;
  maxConcurrentJobs: number;
  modelVersion: ModelVersion;
  experimentalCompile: boolean;
  /** Last-used advanced generation params, restored on load. */
  generationDefaults?: GeneratorParams;
  setupCompletedAt?: string;
  spotdlAcknowledgedAt?: string;
  spotifyImport?: SpotifyImportStatus;
};

export type AppStore = {
  settings: AppSettings;
  tracks: Track[];
  jobs: GenerationJob[];
  matchesByTrackId: Record<string, TrackMatchSnapshot>;
};
