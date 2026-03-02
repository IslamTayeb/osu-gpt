import type { MatchResult, SpotifyImportStatus, Track, TrackMatchSnapshot } from "./types";

export type HostedAwsSessionStatus = {
  configured: boolean;
  missingFields?: string[];
  region?: string;
  batchQueue?: string;
  batchJobDefinition?: string;
  s3Bucket?: string;
  s3Prefix?: string;
  cloudWatchLogGroup?: string | null;
  gpuHint?: string;
  gpuCountPerJob?: number;
  accessKeyIdHint?: string;
  profile?: string;
  updatedAt?: string;
};

export type OsuSessionStatus = {
  configured: boolean;
  clientIdHint?: string;
  updatedAt?: string;
  source?: "session" | "env";
};

export type SessionResponse = {
  spotifyConnected: boolean;
  spotdlAcknowledgedAt: string | null;
  providers?: {
    spotify: { connected: boolean; available: boolean };
    apple: { connected: boolean; available: boolean; comingSoon?: boolean };
  };
  runtime?: {
    hostedAws?: HostedAwsSessionStatus;
    osu?: OsuSessionStatus;
  };
  trackCount?: number;
  importStatus?: SpotifyImportStatus;
};

export type TrackMatchResultPayload = {
  matches: MatchResult[];
  topHit: MatchResult | null;
  strongMatch: boolean;
  autoGenerate: boolean;
  error?: string;
};

export type BatchMatchResponse = {
  trackResults: Record<string, TrackMatchResultPayload>;
  summary: {
    total: number;
    matchedCount: number;
    unmatchedCount: number;
    errorCount: number;
  };
};

export type TracksResponse = {
  tracks?: Track[];
  matchesByTrackId?: Record<string, TrackMatchSnapshot>;
  totalTracks?: number;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
    start: number;
    end: number;
  };
};
