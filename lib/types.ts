export type RuntimeType = "local" | "hosted_aws";
export type MusicProvider = "spotify" | "apple";

export type GeneratorParams = {
  gamemode?: number | null;
  beatmapId?: number | null;
  difficulty?: number | null;
  mapperId?: number | null;
  year?: number | null;
  hitsounded?: boolean | null;
  keycount?: number | null;
  holdNoteRatio?: number | null;
  scrollSpeedRatio?: number | null;
  descriptors?: string[] | null;
  negativeDescriptors?: string[] | null;
  hpDrainRate?: number | null;
  circleSize?: number | null;
  overallDifficulty?: number | null;
  approachRate?: number | null;
  sliderMultiplier?: number | null;
  sliderTickRate?: number | null;
  seed?: number | null;
  device?: string | null;
  precision?: string | null;
  attnImplementation?: string | null;
  addToBeatmap?: boolean | null;
  overwriteReferenceBeatmap?: boolean | null;
  exportOsz?: boolean | null;
  startTime?: number | null;
  endTime?: number | null;
  lookback?: number | null;
  lookahead?: number | null;
  timingLeniency?: number | null;
  inContext?: string[] | null;
  outputType?: string[] | null;
  cfgScale?: number | null;
  temperature?: number | null;
  timingTemperature?: number | null;
  maniaColumnTemperature?: number | null;
  taikoHitTemperature?: number | null;
  timeshiftBias?: number | null;
  topP?: number | null;
  topK?: number | null;
  parallel?: boolean | null;
  doSample?: boolean | null;
  numBeams?: number | null;
  superTiming?: boolean | null;
  timerNumBeams?: number | null;
  timerBpmThreshold?: number | null;
  timerCfgScale?: number | null;
  timerIterations?: number | null;
  useServer?: boolean | null;
  maxBatchSize?: number | null;
  resnapEvents?: boolean | null;
  bpm?: number | null;
  offset?: number | null;
  title?: string | null;
  titleUnicode?: string | null;
  artist?: string | null;
  artistUnicode?: string | null;
  creator?: string | null;
  version?: string | null;
  source?: string | null;
  tags?: string | null;
  background?: string | null;
  previewTime?: number | null;
  generatePositions?: boolean | null;
  diffCfgScale?: number | null;
  compile?: boolean | null;
  padSequence?: boolean | null;
  diffCkpt?: string | null;
  diffRefineCkpt?: string | null;
  beatmapIdx?: string | null;
  refineIters?: number | null;
  randomInit?: boolean | null;
  timesteps?: number[] | null;
  maxSeqLen?: number | null;
  overlapBuffer?: number | null;
  loraPath?: string | null;
  beatmapPath?: string | null;
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
};

export type Artifact = {
  id: string;
  jobId: string;
  fileName: string;
  storage: "local" | "s3";
  relativePath?: string;
  s3Bucket?: string;
  s3Key?: string;
  sizeBytes: number;
  expiresAt: string;
  createdAt: string;
};

export type HostedAwsJobMeta = {
  provider: "aws_batch";
  batchJobId?: string;
  region: string;
  queue: string;
  jobDefinition: string;
  bucket: string;
  prefix: string;
  logGroup?: string;
  logStream?: string;
  statusReason?: string;
  submittedAt?: string;
  lastSyncedAt?: string;
};

export type GenerationJob = {
  id: string;
  trackId: string;
  runtime: RuntimeType;
  preset: "quick" | "balanced" | "high_quality";
  generatorParams: GeneratorParams;
  budgetCapUsd: number;
  timeoutSec: number;
  status: "queued" | "running" | "completed" | "failed";
  warning?: string;
  error?: string;
  logs: string[];
  artifacts: Artifact[];
  hosted?: HostedAwsJobMeta;
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

export type AppStore = {
  settings: {
    spotdlAcknowledgedAt?: string;
    spotifyImport?: SpotifyImportStatus;
  };
  tracks: Track[];
  jobs: GenerationJob[];
  matchesByTrackId: Record<string, TrackMatchSnapshot>;
};
