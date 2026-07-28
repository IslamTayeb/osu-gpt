import type { MatchResult, SpotifyImportStatus, Track, TrackMatchSnapshot } from "./types";

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
  };
  runtime?: {
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
