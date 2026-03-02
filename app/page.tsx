"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlertTriangle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Circle,
  Cpu,
  Crosshair,
  Download,
  Eye,
  Flame,
  Gauge,
  Heart,
  LoaderCircle,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Target,
} from "lucide-react";
import type {
  GenerationJob,
  GeneratorParams,
  MatchResult,
  SpotifyImportStatus,
  Track,
  TrackMatchSnapshot,
} from "@/lib/types";
import { buttonVariants, Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { generatorParamTemplate, mapTypePresets, mapperStylePresets } from "@/lib/generatorConfig";

type HostedAwsSessionStatus = {
  configured: boolean;
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

type OsuSessionStatus = {
  configured: boolean;
  clientIdHint?: string;
  updatedAt?: string;
  source?: "session" | "env";
};

type SessionResponse = {
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

type TrackMatchResultPayload = {
  matches: MatchResult[];
  topHit: MatchResult | null;
  strongMatch: boolean;
  autoGenerate: boolean;
  error?: string;
};

type BatchMatchResponse = {
  trackResults: Record<string, TrackMatchResultPayload>;
  summary: {
    total: number;
    matchedCount: number;
    unmatchedCount: number;
    errorCount: number;
  };
};

type TracksResponse = {
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

const defaultImportStatus: SpotifyImportStatus = { status: "idle" };

type MatchFilter = "all" | "matched" | "unmatched" | "generated";
type ProviderFilter = "all" | Track["provider"];
type SourceFilter = "all" | Track["source"];

type SelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type LibraryMarqueeSession = {
  pointerId: number;
  originX: number;
  originY: number;
  moved: boolean;
  clickedTrackId: string | null;
};

function msToClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function matchMetaText(match: MatchResult | null | undefined) {
  if (!match) return "";
  const meta: string[] = [];
  if (typeof match.maxDifficultyRating === "number" && Number.isFinite(match.maxDifficultyRating)) {
    meta.push(`${match.maxDifficultyRating.toFixed(2)}★`);
  }
  if (match.topDifficultyName) {
    meta.push(match.topDifficultyName);
  }
  if (typeof match.bpm === "number" && Number.isFinite(match.bpm)) {
    meta.push(`${Math.round(match.bpm)} BPM`);
  }
  return meta.join(" · ");
}

function importProgress(status: SpotifyImportStatus) {
  if (status.status === "completed") return 100;
  if (status.status === "running") {
    const n = status.importedCount ?? 0;
    return Math.max(6, Math.min(92, Math.round(24 + Math.log10(n + 1) * 28)));
  }
  return 0;
}

function inferFilename(header: string | null) {
  if (!header) return "osu-gpt-export.zip";
  const match = header.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? "osu-gpt-export.zip";
}

function chunkArray<T>(input: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
}

function librarySkeletonItems(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

const descriptorOptions = [
  "jump aim",
  "high bpm",
  "bursty",
  "streams",
  "stamina",
  "flow aim",
  "finger control",
  "aim control",
  "technical",
  "alt",
  "precision",
  "clean",
  "reading",
  "difficulty spike",
  "comfortable",
  "distance snapped",
  "old style",
  "triples",
  "close spacing",
  "vocal rhythm",
  "grid based",
  "oibon",
  "large jumps",
  "side to side jumps",
];

const negativeDescriptorOptions = [
  "slider spam",
  "awkward jumps",
  "visual clutter",
  "rhythm gimmick",
  "overmapped",
  "underweighted patterns",
  "unreadable spacing",
  "excessive SV gimmick",
];

const inContextOptions = ["NONE", "GD", "NO_HS", "MAP", "TIMING"];
const outputTypeOptions = ["MAP", "TIMING", "HITSOUND"];

export default function Home() {
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotdlAckAt, setSpotdlAckAt] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackCacheById, setTrackCacheById] = useState<Record<string, Track>>({});
  const [matchSnapshots, setMatchSnapshots] = useState<Record<string, TrackMatchSnapshot>>({});
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [importStatus, setImportStatus] = useState<SpotifyImportStatus>(defaultImportStatus);

  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("liked");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(60);
  const [tracksTotal, setTracksTotal] = useState(0);
  const [totalTracks, setTotalTracks] = useState(0);
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleEnd, setVisibleEnd] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [runtime, setRuntime] = useState<"local" | "hosted_aws">("hosted_aws");
  const [preset, setPreset] = useState<"quick" | "balanced" | "high_quality">("balanced");
  const [timeoutSec, setTimeoutSec] = useState(600);
  const [budgetCapUsd, setBudgetCapUsd] = useState(50);

  const [stylePresetId, setStylePresetId] = useState("none");
  const [mapperChoiceId, setMapperChoiceId] = useState("none");
  const [generatorParams, setGeneratorParams] = useState<GeneratorParams>({ ...generatorParamTemplate });

  const [awsSessionStatus, setAwsSessionStatus] = useState<HostedAwsSessionStatus>({ configured: false });
  const [awsAccessKeyId, setAwsAccessKeyId] = useState("");
  const [awsSecretAccessKey, setAwsSecretAccessKey] = useState("");
  const [awsSessionToken, setAwsSessionToken] = useState("");
  const [awsProfile, setAwsProfile] = useState("default");
  const [awsRegion, setAwsRegion] = useState("");
  const [awsBatchQueue, setAwsBatchQueue] = useState("");
  const [awsBatchJobDefinition, setAwsBatchJobDefinition] = useState("");
  const [awsS3Bucket, setAwsS3Bucket] = useState("");
  const [awsS3Prefix, setAwsS3Prefix] = useState("osu-gpt");
  const [awsCloudWatchLogGroup, setAwsCloudWatchLogGroup] = useState("/aws/batch/job");

  const [osuSessionStatus, setOsuSessionStatus] = useState<OsuSessionStatus>({ configured: false });
  const [osuClientId, setOsuClientId] = useState("");
  const [osuClientSecret, setOsuClientSecret] = useState("");

  const [bootstrapping, setBootstrapping] = useState(true);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [tracksLoadedOnce, setTracksLoadedOnce] = useState(false);
  const [jobsLoadedOnce, setJobsLoadedOnce] = useState(false);

  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastMatchSummary, setLastMatchSummary] = useState<BatchMatchResponse["summary"] | null>(null);

  const autoImportAttemptedRef = useRef(false);
  const hydratedRef = useRef(false);
  const lastImportStateRef = useRef<SpotifyImportStatus["status"]>("idle");
  const libraryScrollRef = useRef<HTMLDivElement | null>(null);
  const libraryMarqueeRef = useRef<LibraryMarqueeSession | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);

  const trackById = useMemo(() => {
    const map = new Map<string, Track>();
    for (const [trackId, track] of Object.entries(trackCacheById)) {
      map.set(trackId, track);
    }
    return map;
  }, [trackCacheById]);

  const selectedTrackSet = useMemo(() => new Set(selectedTrackIds), [selectedTrackIds]);

  const stylePresetOptions = useMemo(
    () => [
      {
        id: "none",
        label: "No style preset",
        description: "No auto style changes. Keep current parameters.",
        descriptors: [] as string[],
        defaults: {} as Partial<GeneratorParams>,
      },
      ...mapTypePresets.map((presetOption) => ({
        id: `type:${presetOption.id}`,
        label: presetOption.label,
        description: presetOption.description,
        descriptors: presetOption.descriptors,
        defaults: presetOption.defaults as Partial<GeneratorParams>,
      })),
      ...mapperStylePresets.map((presetOption) => ({
        id: `mapper:${presetOption.id}`,
        label: `${presetOption.label} (example style)`,
        description: presetOption.description,
        descriptors: presetOption.descriptors,
        defaults: {} as Partial<GeneratorParams>,
      })),
    ],
    [],
  );

  const selectedStylePreset = useMemo(
    () => stylePresetOptions.find((presetOption) => presetOption.id === stylePresetId) ?? stylePresetOptions[0],
    [stylePresetId, stylePresetOptions],
  );

  const selectedMapperOption = useMemo(
    () => mapperStylePresets.find((presetOption) => presetOption.id === mapperChoiceId) ?? null,
    [mapperChoiceId],
  );

  const completedTrackIdSet = useMemo(
    () => new Set(jobs.filter((job) => job.status === "completed").map((job) => job.trackId)),
    [jobs],
  );

  const hasActiveJobs = useMemo(
    () => jobs.some((job) => job.status === "queued" || job.status === "running"),
    [jobs],
  );

  const selectionStats = useMemo(() => {
    let matched = 0;
    let unmatched = 0;
    let failed = 0;
    let generated = 0;

    for (const trackId of selectedTrackIds) {
      const snapshot = matchSnapshots[trackId];
      if (snapshot?.error) {
        failed += 1;
      } else if (snapshot && snapshot.matches.length > 0) {
        matched += 1;
      } else if (snapshot && snapshot.matches.length === 0) {
        unmatched += 1;
      }
      if (completedTrackIdSet.has(trackId)) {
        generated += 1;
      }
    }

    return {
      total: selectedTrackIds.length,
      matched,
      unmatched,
      failed,
      generated,
    };
  }, [selectedTrackIds, matchSnapshots, completedTrackIdSet]);

  const unmatchedSelectedIds = useMemo(
    () =>
      selectedTrackIds.filter((trackId) => {
        const snapshot = matchSnapshots[trackId];
        return Boolean(snapshot && !snapshot.error && snapshot.matches.length === 0);
      }),
    [selectedTrackIds, matchSnapshots],
  );

  const matchedSelected = useMemo(
    () =>
      selectedTrackIds
        .map((trackId) => ({
          track: trackById.get(trackId),
          snapshot: matchSnapshots[trackId],
        }))
        .filter((entry) => entry.track && entry.snapshot && entry.snapshot.matches.length > 0),
    [selectedTrackIds, trackById, matchSnapshots],
  );

  const unmatchedTopHits = useMemo(
    () =>
      selectedTrackIds
        .map((trackId) => ({
          track: trackById.get(trackId),
          snapshot: matchSnapshots[trackId],
        }))
        .filter((entry) => entry.track && entry.snapshot && entry.snapshot.matches.length === 0 && entry.snapshot.topHit),
    [selectedTrackIds, trackById, matchSnapshots],
  );

  const fetchSession = useCallback(async () => {
    const response = await fetch("/api/session", { cache: "no-store" });
    const data = (await response.json()) as SessionResponse;
    setSpotifyConnected(Boolean(data.spotifyConnected));
    setSpotdlAckAt(data.spotdlAcknowledgedAt ?? null);
    if (data.importStatus) {
      setImportStatus(data.importStatus);
    }

    const hostedAws = data.runtime?.hostedAws;
    if (hostedAws) {
      setAwsSessionStatus(hostedAws);
      if (hostedAws.configured) {
        setAwsProfile((prev) => hostedAws.profile || prev || "default");
        setAwsRegion((prev) => prev || hostedAws.region || "");
        setAwsBatchQueue((prev) => prev || hostedAws.batchQueue || "");
        setAwsBatchJobDefinition((prev) => prev || hostedAws.batchJobDefinition || "");
        setAwsS3Bucket((prev) => prev || hostedAws.s3Bucket || "");
        setAwsS3Prefix((prev) => prev || hostedAws.s3Prefix || "osu-gpt");
        setAwsCloudWatchLogGroup((prev) => prev || hostedAws.cloudWatchLogGroup || "/aws/batch/job");
      }
    } else {
      setAwsSessionStatus({ configured: false });
    }

    const osuRuntime = data.runtime?.osu;
    if (osuRuntime) {
      setOsuSessionStatus(osuRuntime);
    } else {
      setOsuSessionStatus({ configured: false });
    }
  }, []);

  const fetchTracks = useCallback(async () => {
    setTracksLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        provider: providerFilter,
        source: sourceFilter,
        match: matchFilter,
      });
      if (debouncedQuery) {
        params.set("query", debouncedQuery);
      }

      const response = await fetch(`/api/library/tracks?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as TracksResponse;
      setTracks(data.tracks ?? []);
      setMatchSnapshots((previous) => ({ ...previous, ...(data.matchesByTrackId ?? {}) }));
      setTotalTracks(data.totalTracks ?? 0);
      setTracksTotal(data.pagination?.total ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setVisibleStart(data.pagination?.start ?? 0);
      setVisibleEnd(data.pagination?.end ?? 0);
      if (data.pagination?.page && data.pagination.page !== page) {
        setPage(data.pagination.page);
      }
      setTracksLoadedOnce(true);
    } finally {
      setTracksLoading(false);
    }
  }, [page, pageSize, providerFilter, sourceFilter, matchFilter, debouncedQuery]);

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const response = await fetch("/api/generation/jobs", { cache: "no-store" });
      const data = (await response.json()) as { jobs?: GenerationJob[] };
      setJobs(data.jobs ?? []);
      setJobsLoadedOnce(true);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const fetchImportStatus = useCallback(async () => {
    const response = await fetch("/api/library/spotify/import-status", { cache: "no-store" });
    const data = (await response.json()) as { status?: SpotifyImportStatus };
    const status = data.status ?? defaultImportStatus;
    setImportStatus(status);
    return status;
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, providerFilter, sourceFilter, matchFilter, pageSize]);

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([fetchSession(), fetchJobs(), fetchImportStatus(), fetchTracks()]);
      } finally {
        hydratedRef.current = true;
        setBootstrapping(false);
      }
    })();
  }, [fetchSession, fetchJobs, fetchImportStatus, fetchTracks]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    void fetchTracks();
  }, [fetchTracks]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    const timer = setInterval(() => {
      void (async () => {
        const status = await fetchImportStatus();
        if (hasActiveJobs) {
          await fetchJobs();
        }
        if (status.status === "running") {
          await fetchTracks();
        }
      })();
    }, 2500);

    return () => clearInterval(timer);
  }, [fetchJobs, fetchImportStatus, fetchTracks, hasActiveJobs]);

  useEffect(() => {
    const previous = lastImportStateRef.current;
    if (importStatus.status === "completed" && previous !== "completed") {
      void fetchTracks();
      void fetchSession();
    }
    lastImportStateRef.current = importStatus.status;
  }, [importStatus.status, fetchTracks, fetchSession]);

  useEffect(() => {
    setTrackCacheById((previous) => {
      const next = { ...previous };
      for (const track of tracks) {
        next[track.id] = track;
      }
      return next;
    });
  }, [tracks]);

  const importSpotify = useCallback(
    async (silent = false) => {
      setBusy(true);
      if (!silent) {
        setNotice("");
      }
      setError("");
      try {
        setSelectedTrackIds([]);
        setTracks([]);
        setTrackCacheById({});
        setMatchSnapshots({});
        setJobs([]);
        setTracksTotal(0);
        setTotalTracks(0);
        setVisibleStart(0);
        setVisibleEnd(0);
        setTotalPages(1);
        setPage(1);

        const response = await fetch("/api/library/spotify/import", { method: "POST" });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Import failed");
        }
        if (!silent) {
          setNotice("Liked songs import started from a clean cache.");
        }
        await Promise.all([fetchImportStatus(), fetchTracks()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed");
      } finally {
        setBusy(false);
      }
    },
    [fetchImportStatus, fetchTracks],
  );

  useEffect(() => {
    if (!hydratedRef.current || !spotifyConnected || autoImportAttemptedRef.current) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("spotify") !== "connected") {
      return;
    }

    autoImportAttemptedRef.current = true;
    void importSpotify(true);
    url.searchParams.delete("spotify");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [spotifyConnected, importSpotify]);

  async function acknowledgeSpotdl() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/settings/ack", { method: "POST" });
      const body = (await response.json()) as { acknowledgedAt?: string; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not save acknowledgment");
      }
      setSpotdlAckAt(body.acknowledgedAt ?? new Date().toISOString());
      setNotice("Downloader acknowledgment saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Acknowledgment failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveOsuRuntimeSession() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/osu/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: osuClientId,
          clientSecret: osuClientSecret,
        }),
      });
      const body = (await response.json()) as OsuSessionStatus & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not save osu credentials");
      }
      setOsuSessionStatus(body);
      setOsuClientSecret("");
      setNotice("osu API credentials saved for this session.");
      await fetchSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save osu credentials");
    } finally {
      setBusy(false);
    }
  }

  async function clearOsuRuntimeSession() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/osu/session", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Could not clear osu credentials");
      }
      setOsuSessionStatus({ configured: false });
      setOsuClientId("");
      setOsuClientSecret("");
      setNotice("osu API credentials cleared.");
      await fetchSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear osu credentials");
    } finally {
      setBusy(false);
    }
  }

  async function saveAwsRuntimeSession() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/aws/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessKeyId: awsAccessKeyId,
          secretAccessKey: awsSecretAccessKey,
          sessionToken: awsSessionToken,
          profile: awsProfile,
          region: awsRegion,
          batchQueue: awsBatchQueue,
          batchJobDefinition: awsBatchJobDefinition,
          s3Bucket: awsS3Bucket,
          s3Prefix: awsS3Prefix,
          cloudWatchLogGroup: awsCloudWatchLogGroup,
        }),
      });
      const body = (await response.json()) as HostedAwsSessionStatus & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to save AWS session.");
      }

      setAwsSessionStatus(body);
      setAwsSecretAccessKey("");
      setAwsSessionToken("");
      setNotice("Hosted AWS session saved.");
      await fetchSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AWS session.");
    } finally {
      setBusy(false);
    }
  }

  async function loadAwsRuntimeSessionFromCli() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/aws/session/from-cli", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: awsProfile,
          region: awsRegion,
          batchQueue: awsBatchQueue,
          batchJobDefinition: awsBatchJobDefinition,
          s3Bucket: awsS3Bucket,
          s3Prefix: awsS3Prefix,
          cloudWatchLogGroup: awsCloudWatchLogGroup,
        }),
      });
      const body = (await response.json()) as HostedAwsSessionStatus & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to load AWS session from CLI.");
      }

      setAwsSessionStatus(body);
      setAwsAccessKeyId("");
      setAwsSecretAccessKey("");
      setAwsSessionToken("");
      if (body.region) setAwsRegion(body.region);
      if (body.batchQueue) setAwsBatchQueue(body.batchQueue);
      if (body.batchJobDefinition) setAwsBatchJobDefinition(body.batchJobDefinition);
      if (body.s3Bucket) setAwsS3Bucket(body.s3Bucket);
      if (body.s3Prefix) setAwsS3Prefix(body.s3Prefix);
      if (body.cloudWatchLogGroup) setAwsCloudWatchLogGroup(body.cloudWatchLogGroup);
      setNotice(`Hosted AWS session loaded from AWS CLI profile ${(body.profile ?? awsProfile) || "default"}.`);
      await fetchSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AWS session from CLI.");
    } finally {
      setBusy(false);
    }
  }

  async function autoLoadAwsRuntimeSession() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/aws/session/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: awsProfile,
          region: awsRegion,
          batchQueue: awsBatchQueue,
          batchJobDefinition: awsBatchJobDefinition,
          s3Bucket: awsS3Bucket,
          s3Prefix: awsS3Prefix,
          cloudWatchLogGroup: awsCloudWatchLogGroup,
        }),
      });
      const body = (await response.json()) as HostedAwsSessionStatus & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to auto-load AWS session.");
      }

      setAwsSessionStatus(body);
      setAwsAccessKeyId("");
      setAwsSecretAccessKey("");
      setAwsSessionToken("");
      if (body.region) setAwsRegion(body.region);
      if (body.batchQueue) setAwsBatchQueue(body.batchQueue);
      if (body.batchJobDefinition) setAwsBatchJobDefinition(body.batchJobDefinition);
      if (body.s3Bucket) setAwsS3Bucket(body.s3Bucket);
      if (body.s3Prefix) setAwsS3Prefix(body.s3Prefix);
      if (body.cloudWatchLogGroup) setAwsCloudWatchLogGroup(body.cloudWatchLogGroup);
      setNotice(`Hosted AWS session auto-loaded via AWS SDK chain (${(body.profile ?? awsProfile) || "default"}).`);
      await fetchSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to auto-load AWS session.");
    } finally {
      setBusy(false);
    }
  }

  async function clearAwsRuntimeSession() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/runtime/aws/session", { method: "DELETE" });
      if (!response.ok) {
        throw new Error("Could not clear AWS session");
      }
      setAwsSessionStatus({ configured: false });
      setAwsAccessKeyId("");
      setAwsSecretAccessKey("");
      setAwsSessionToken("");
      setNotice("Hosted AWS session cleared.");
      await fetchSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear AWS session");
    } finally {
      setBusy(false);
    }
  }

  async function logoutSpotify() {
    await fetch("/api/auth/spotify/logout", { method: "POST" });
    setSelectedTrackIds([]);
    setTracks([]);
    setTrackCacheById({});
    setJobs([]);
    setMatchSnapshots({});
    setLastMatchSummary(null);
    setTracksTotal(0);
    setTotalTracks(0);
    setVisibleStart(0);
    setVisibleEnd(0);
    setTotalPages(1);
    setPage(1);
    await fetchSession();
  }

  function toggleTrack(trackId: string) {
    setSelectedTrackIds((previous) => {
      if (previous.includes(trackId)) {
        return previous.filter((id) => id !== trackId);
      }
      return [...previous, trackId];
    });
  }

  function selectPageTracks() {
    setSelectedTrackIds((previous) => {
      const next = new Set(previous);
      for (const track of tracks) {
        next.add(track.id);
      }
      return Array.from(next);
    });
  }

  function clearSelection() {
    setSelectedTrackIds([]);
  }

  function rectFromPoints(originX: number, originY: number, nextX: number, nextY: number): SelectionRect {
    const left = Math.min(originX, nextX);
    const top = Math.min(originY, nextY);
    const width = Math.abs(nextX - originX);
    const height = Math.abs(nextY - originY);
    return { left, top, width, height };
  }

  function intersectsRect(a: SelectionRect, b: SelectionRect) {
    return a.left <= b.left + b.width && a.left + a.width >= b.left && a.top <= b.top + b.height && a.top + a.height >= b.top;
  }

  function eventToLibraryPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const root = libraryScrollRef.current;
    if (!root) {
      return null;
    }
    const rootRect = root.getBoundingClientRect();
    return {
      x: event.clientX - rootRect.left + root.scrollLeft,
      y: event.clientY - rootRect.top + root.scrollTop,
    };
  }

  function selectedIdsFromRect(rect: SelectionRect) {
    const root = libraryScrollRef.current;
    if (!root) {
      return [];
    }
    const rootRect = root.getBoundingClientRect();
    const next = new Set<string>();
    const cards = root.querySelectorAll<HTMLElement>("[data-track-id]");
    cards.forEach((card) => {
      const trackId = card.dataset.trackId;
      if (!trackId) return;
      const cardRect = card.getBoundingClientRect();
      const cardBounds: SelectionRect = {
        left: cardRect.left - rootRect.left + root.scrollLeft,
        top: cardRect.top - rootRect.top + root.scrollTop,
        width: cardRect.width,
        height: cardRect.height,
      };
      if (intersectsRect(rect, cardBounds)) {
        next.add(trackId);
      }
    });
    return Array.from(next);
  }

  function handleLibraryPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    const point = eventToLibraryPoint(event);
    if (!point) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("input,button,a,select,textarea,label,[data-no-marquee='true']")) {
      return;
    }

    const clickedCard = target.closest<HTMLElement>("[data-track-id]");
    libraryMarqueeRef.current = {
      pointerId: event.pointerId,
      originX: point.x,
      originY: point.y,
      moved: false,
      clickedTrackId: clickedCard?.dataset.trackId ?? null,
    };
    setSelectionRect({ left: point.x, top: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handleLibraryPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const active = libraryMarqueeRef.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const point = eventToLibraryPoint(event);
    if (!point) {
      return;
    }
    const rect = rectFromPoints(active.originX, active.originY, point.x, point.y);
    const moved = rect.width > 5 || rect.height > 5;
    if (!active.moved && moved) {
      active.moved = true;
    }
    setSelectionRect(rect);
    if (active.moved) {
      setSelectedTrackIds(selectedIdsFromRect(rect));
    }
    event.preventDefault();
  }

  function handleLibraryPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const active = libraryMarqueeRef.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }

    if (!active.moved && active.clickedTrackId) {
      toggleTrack(active.clickedTrackId);
    }

    libraryMarqueeRef.current = null;
    setSelectionRect(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  }

  function updateGeneratorParam<K extends keyof GeneratorParams>(key: K, value: GeneratorParams[K]) {
    setGeneratorParams((previous) => ({ ...previous, [key]: value }));
  }

  function selectedMultiValues(event: ReactChangeEvent<HTMLSelectElement>) {
    return Array.from(event.currentTarget.selectedOptions).map((option) => option.value);
  }

  function applyStylePreset(nextPresetId: string) {
    setStylePresetId(nextPresetId);
    const presetOption = stylePresetOptions.find((item) => item.id === nextPresetId);
    if (!presetOption) {
      return;
    }
    setGeneratorParams((previous) => ({
      ...previous,
      ...presetOption.defaults,
      descriptors: presetOption.descriptors,
    }));
  }

  function applyMapperChoice(nextMapperChoiceId: string) {
    setMapperChoiceId(nextMapperChoiceId);
    if (nextMapperChoiceId === "none") {
      updateGeneratorParam("mapperId", null);
      return;
    }
    if (nextMapperChoiceId === "other") {
      return;
    }
    const mapperOption = mapperStylePresets.find((item) => item.id === nextMapperChoiceId);
    if (mapperOption) {
      updateGeneratorParam("mapperId", mapperOption.mapperId);
    }
  }

  function updateCustomMapperId(rawValue: string) {
    setMapperChoiceId("other");
    updateGeneratorParam("mapperId", rawValue === "" ? null : Number(rawValue));
  }

  async function runBatchMatch() {
    if (selectedTrackIds.length === 0) {
      setError("Select tracks first.");
      return;
    }

    const chunks = chunkArray(selectedTrackIds, 10);
    let matchedCount = 0;
    let unmatchedCount = 0;
    let errorCount = 0;

    setMatching(true);
    setError("");
    setNotice("");

    for (const chunk of chunks) {
      try {
        const response = await fetch("/api/osu/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackIds: chunk }),
        });
        const body = (await response.json()) as BatchMatchResponse & { error?: string };
        if (!response.ok) {
          throw new Error(body.error ?? "Match failed");
        }

        matchedCount += body.summary?.matchedCount ?? 0;
        unmatchedCount += body.summary?.unmatchedCount ?? 0;
        errorCount += body.summary?.errorCount ?? 0;

        const now = new Date().toISOString();
        setMatchSnapshots((previous) => {
          const next = { ...previous };
          for (const [trackId, result] of Object.entries(body.trackResults ?? {})) {
            next[trackId] = {
              trackId,
              matches: result.matches ?? [],
              topHit: result.topHit ?? null,
              strongMatch: Boolean(result.strongMatch),
              autoGenerate: Boolean(result.autoGenerate),
              updatedAt: now,
              error: result.error,
            };
          }
          return next;
        });
      } catch {
        errorCount += chunk.length;
        const now = new Date().toISOString();
        setMatchSnapshots((previous) => {
          const next = { ...previous };
          for (const trackId of chunk) {
            next[trackId] = {
              trackId,
              matches: [],
              topHit: null,
              strongMatch: false,
              autoGenerate: false,
              updatedAt: now,
              error: "Match failed for this chunk",
            };
          }
          return next;
        });
      } finally {
      }
    }

    setLastMatchSummary({
      total: selectedTrackIds.length,
      matchedCount,
      unmatchedCount,
      errorCount,
    });
    setNotice("Match scan completed incrementally.");
    setMatching(false);
    await fetchTracks();
  }

  async function queueGeneration(trackIds: string[]) {
    if (trackIds.length === 0) {
      setError("No tracks selected for generation.");
      return;
    }
    if (!spotdlAckAt) {
      setError("Acknowledge downloader usage before generation.");
      return;
    }
    if (runtime === "hosted_aws" && !awsSessionStatus.configured) {
      setError("Save Hosted AWS session settings before queuing hosted jobs.");
      return;
    }
    if (budgetCapUsd > 50 && !window.confirm("Budget cap is above $50. Continue?")) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/generation/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackIds,
          runtime,
          preset,
          timeoutSec,
          budgetCapUsd,
          generatorParams,
        }),
      });
      const body = (await response.json()) as { error?: string; details?: string[]; jobs?: GenerationJob[]; job?: GenerationJob };
      if (!response.ok) {
        if (body.details && body.details.length > 0) {
          throw new Error(`${body.error ?? "Could not create generation job(s)"} ${body.details.join(" ")}`);
        }
        throw new Error(body.error ?? "Could not create generation job(s)");
      }

      const createdCount = body.jobs?.length ?? (body.job ? 1 : 0);
      setNotice(`Queued ${createdCount} job${createdCount === 1 ? "" : "s"}.`);
      await fetchJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip() {
    if (selectedTrackIds.length === 0) {
      setError("Select tracks to export.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/generation/export-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: selectedTrackIds }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Export failed");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = inferFilename(response.headers.get("content-disposition"));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setNotice("ZIP export downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  const showLibrarySkeleton = (!tracksLoadedOnce && (tracksLoading || bootstrapping)) || (bootstrapping && tracks.length === 0);

  if (!spotifyConnected) {
    return (
      <div className="app-root">
        <main className="auth-shell">
          <section className="auth-stage">
            <div className="auth-card">
              {bootstrapping ? (
                <div className="list">
                  <Skeleton style={{ height: "10px", width: "44%" }} />
                  <Skeleton style={{ height: "52px", width: "78%" }} />
                  <Skeleton style={{ height: "14px", width: "88%" }} />
                </div>
              ) : (
                <>
                  <p className="auth-kicker">NEOCLASSICAL MACHINE MUSIC INTERFACE</p>
                  <h1 className="auth-title">
                    <span>Liked Songs</span>
                    <span>To Playable Maps</span>
                  </h1>
                  <p className="auth-sub">
                    Bring in your Spotify liked songs, force title+artist substring matching against Ranked/Loved sets,
                    then generate the unmatched tracks in batch.
                  </p>
                </>
              )}
            </div>
            <div className="provider-row">
              <Link href="/api/auth/spotify/login" className={cn(buttonVariants({ size: "lg" }))}>
                Connect Spotify
              </Link>
              <Button variant="secondary" size="lg" disabled>
                Apple Music Coming Soon
              </Button>
            </div>
            <div className="auth-foot tiny muted">
              Apple Music entry remains visible and ships when backend auth/import is enabled.
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-root">
      <main className="workspace">
        <header className="workspace-header">
          <div>
            <h1 className="workspace-title">osu-gpt / Dense Workspace</h1>
            <p className="workspace-meta">
              Liked Songs: {totalTracks} | Selected: {selectionStats.total} | Matched: {selectionStats.matched} |
              Unmatched: {selectionStats.unmatched} | Generated: {selectionStats.generated}
            </p>
          </div>
          <div className="workspace-actions">
            <Button variant="secondary" onClick={() => void importSpotify()} disabled={busy || importStatus.status === "running"}>
              <RefreshCcw size={14} /> Sync Liked Songs
            </Button>
            <Button variant="ghost" onClick={logoutSpotify}>
              Disconnect Spotify
            </Button>
          </div>
        </header>

        <section className="workspace-grid">
          <Card className="pane pane--compact">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Server-backed filtering and pagination for large liked-song libraries.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="section-block">
                <span className="section-label">Search</span>
                <div className="row-wrap">
                  <Search size={14} className="muted" />
                  <Input
                    placeholder="title / artist / album / source"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>

              <div className="section-block">
                <span className="section-label">Provider</span>
                <Select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value as ProviderFilter)}>
                  <option value="all">All providers</option>
                  <option value="spotify">Spotify</option>
                  <option value="apple" disabled>
                    Apple Music (coming soon)
                  </option>
                </Select>
              </div>

              <div className="section-block">
                <span className="section-label">Source</span>
                <Select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
                  <option value="all">All sources</option>
                  <option value="liked">Liked songs</option>
                </Select>
              </div>

              <div className="section-block">
                <span className="section-label">Status</span>
                <Select value={matchFilter} onChange={(event) => setMatchFilter(event.target.value as MatchFilter)}>
                  <option value="all">All tracks</option>
                  <option value="matched">Matched</option>
                  <option value="unmatched">Unmatched</option>
                  <option value="generated">Generated</option>
                </Select>
              </div>

              <div className="section-block">
                <span className="section-label">Pagination</span>
                <Select
                  value={String(pageSize)}
                  onChange={(event) => setPageSize(Math.max(20, Number(event.target.value || 60)))}
                >
                  <option value="30">30 / page</option>
                  <option value="60">60 / page</option>
                  <option value="100">100 / page</option>
                  <option value="150">150 / page</option>
                </Select>
                <div className="row-wrap">
                  <Button variant="secondary" size="sm" onClick={() => setPage((previous) => Math.max(1, previous - 1))} disabled={page <= 1}>
                    <ChevronLeft size={14} />
                    Prev
                  </Button>
                  <Badge variant="neutral">
                    Page {page} / {totalPages}
                  </Badge>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                    <ChevronRight size={14} />
                  </Button>
                </div>
                <p className="tiny muted">
                  Showing {visibleStart}-{visibleEnd} of {tracksTotal} filtered tracks
                </p>
              </div>

              <div className="divider" />

              <div className="section-block">
                <span className="section-label">Selection</span>
                <div className="row-wrap">
                  <Button variant="secondary" size="sm" onClick={selectPageTracks}>
                    Add page ({tracks.length})
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              </div>

              <div className="divider" />

              <div className="section-block">
                <div className="row">
                  <span className="section-label">Import Status</span>
                  <Badge variant={importStatus.status === "failed" ? "danger" : "neutral"}>{importStatus.status}</Badge>
                </div>
                <Progress value={importProgress(importStatus)} />
                <p className="tiny muted">
                  {importStatus.message ?? "Ready"} {importStatus.importedCount ? `(${importStatus.importedCount} processed)` : ""}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="pane pane--library">
            <div className="pane-head">
              <h2 className="pane-title">Library Grid</h2>
              <div className="row-wrap">
                <Badge variant="neutral">
                  {visibleStart}-{visibleEnd} / {tracksTotal}
                </Badge>
                <Badge variant="info">{selectedTrackIds.length} selected</Badge>
                {tracksLoading ? <Badge variant="warning">Loading...</Badge> : null}
              </div>
            </div>
            <div className="pane-body pane-body--fill">
              <ScrollArea
                ref={libraryScrollRef}
                className="ui-scroll-area library-scroll"
                onPointerDown={handleLibraryPointerDown}
                onPointerMove={handleLibraryPointerMove}
                onPointerUp={handleLibraryPointerEnd}
                onPointerCancel={handleLibraryPointerEnd}
                onDragStart={(event) => event.preventDefault()}
              >
                {showLibrarySkeleton ? (
                  <div className="library-grid">
                    {librarySkeletonItems(18).map((key) => (
                      <article key={`skeleton-${key}`} className="track-card track-card--skeleton">
                        <div className="track-topline">
                          <Skeleton style={{ width: "14px", height: "14px" }} />
                          <Skeleton style={{ width: "42px", height: "10px" }} />
                        </div>
                        <Skeleton style={{ width: "100%", aspectRatio: "1 / 1" }} />
                        <div className="track-content">
                          <Skeleton style={{ width: "88%", height: "12px" }} />
                          <Skeleton style={{ width: "62%", height: "10px" }} />
                          <Skeleton style={{ width: "73%", height: "10px" }} />
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="library-marquee-layer">
                      <div className="library-grid">
                        {tracks.map((track) => {
                          const selected = selectedTrackSet.has(track.id);
                          const generated = completedTrackIdSet.has(track.id);

                          return (
                            <article
                              key={track.id}
                              className="track-card"
                              data-track-id={track.id}
                              data-selected={selected ? "true" : "false"}
                            >
                              <div className="track-topline">
                                <Checkbox
                                  data-no-marquee="true"
                                  checked={selected}
                                  onChange={() => toggleTrack(track.id)}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={(event) => event.stopPropagation()}
                                  aria-label={`Select ${track.title}`}
                                />
                                <span className="track-meta">{msToClock(track.durationMs)}</span>
                              </div>
                              <div className="track-art">
                                {track.artworkUrl ? (
                                  <Image
                                    src={track.artworkUrl}
                                    alt={`${track.title} artwork`}
                                    fill
                                    unoptimized
                                    sizes="(max-width: 900px) 45vw, 160px"
                                  />
                                ) : null}
                              </div>
                              <div className="track-content">
                                <h3 className="track-title">{track.title}</h3>
                                <p className="track-meta">{track.artists.join(", ")}</p>
                                <p className="track-meta">{track.album}</p>
                                <div className="track-flags">
                                  <Badge variant="neutral">{track.sourceLabel}</Badge>
                                  {generated ? <Badge variant="info">Generated</Badge> : null}
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                      {selectionRect && (selectionRect.width > 5 || selectionRect.height > 5) ? (
                        <div
                          className="library-selection-box"
                          style={{
                            left: `${selectionRect.left}px`,
                            top: `${selectionRect.top}px`,
                            width: `${selectionRect.width}px`,
                            height: `${selectionRect.height}px`,
                          }}
                        />
                      ) : null}
                    </div>
                    {tracks.length === 0 ? <p className="tiny muted">No tracks on this page. Adjust filters or import again.</p> : null}
                  </>
                )}
              </ScrollArea>
            </div>
          </Card>

          <Card className="pane pane-right">
            <div className="pane-head">
              <h2 className="pane-title">Actions / Results</h2>
            </div>
            <div className="pane-body pane-body--right-scroll">
              {bootstrapping && !jobsLoadedOnce ? (
                <div className="list">
                  <Skeleton style={{ width: "100%", height: "68px" }} />
                  <Skeleton style={{ width: "100%", height: "90px" }} />
                  <Skeleton style={{ width: "100%", height: "160px" }} />
                </div>
              ) : (
                <>
                  {!spotdlAckAt ? (
                    <div className="section-block">
                      <div className="row-wrap">
                        <AlertTriangle size={14} className="warn-text" />
                        <span className="section-label">Downloader acknowledgment required</span>
                      </div>
                      <Button onClick={acknowledgeSpotdl} disabled={busy}>
                        I acknowledge audio rights
                      </Button>
                    </div>
                  ) : (
                    <p className="tiny muted">Downloader acknowledgment: {new Date(spotdlAckAt).toLocaleString()}</p>
                  )}

                  <div className="divider" />

                  <div className="section-block">
                    <span className="section-label">Batch match review</span>
                    <div className="section-block hosted-runtime-block">
                      <div className="row">
                        <span className="section-label">osu API Session</span>
                        <Badge variant={osuSessionStatus.configured ? "success" : "warning"}>
                          {osuSessionStatus.configured ? "Configured" : "Not configured"}
                        </Badge>
                      </div>
                      {!osuSessionStatus.configured ? (
                        <>
                          <details className="inline-help">
                            <summary className="tiny muted">How to get osu API credentials</summary>
                            <div className="list">
                              <p className="tiny muted">1. Sign in at osu.ppy.sh.</p>
                              <p className="tiny muted">
                                2. Open{" "}
                                <Link href="https://osu.ppy.sh/home/account/edit#new-oauth-application" target="_blank" rel="noreferrer">
                                  Account Settings - OAuth Applications
                                </Link>
                                .
                              </p>
                              <p className="tiny muted">3. Create an OAuth app, then copy Client ID and Client Secret.</p>
                              <p className="tiny muted">
                                4. Paste them here and click <strong>Save osu API Session</strong>.
                              </p>
                            </div>
                          </details>
                          <Input
                            placeholder="osu OAuth Client ID"
                            value={osuClientId}
                            onChange={(event) => setOsuClientId(event.target.value)}
                          />
                          <Input
                            placeholder="osu OAuth Client Secret"
                            type="password"
                            value={osuClientSecret}
                            onChange={(event) => setOsuClientSecret(event.target.value)}
                          />
                          <div className="row-wrap">
                            <Button variant="secondary" onClick={() => void saveOsuRuntimeSession()} disabled={busy}>
                              Save osu API Session
                            </Button>
                          </div>
                        </>
                      ) : (
                        <details className="inline-help">
                          <summary className="tiny muted">Override credentials for this browser (optional)</summary>
                          <div className="list">
                            <Input
                              placeholder="osu OAuth Client ID"
                              value={osuClientId}
                              onChange={(event) => setOsuClientId(event.target.value)}
                            />
                            <Input
                              placeholder="osu OAuth Client Secret"
                              type="password"
                              value={osuClientSecret}
                              onChange={(event) => setOsuClientSecret(event.target.value)}
                            />
                            <div className="row-wrap">
                              <Button variant="secondary" onClick={() => void saveOsuRuntimeSession()} disabled={busy}>
                                Save osu API Session
                              </Button>
                              <Button variant="ghost" onClick={() => void clearOsuRuntimeSession()} disabled={busy}>
                                Clear osu API Session
                              </Button>
                            </div>
                          </div>
                        </details>
                      )}
                    </div>
                    <Button onClick={() => void runBatchMatch()} disabled={matching || busy || selectedTrackIds.length === 0}>
                      {matching ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />}
                      Find osu matches
                    </Button>
                    {lastMatchSummary ? (
                      <div className="chip-row">
                        <Badge variant="info">Total {lastMatchSummary.total}</Badge>
                        <Badge variant="success">Matched {lastMatchSummary.matchedCount}</Badge>
                        <Badge variant="warning">Unmatched {lastMatchSummary.unmatchedCount}</Badge>
                        <Badge variant="danger">Errors {lastMatchSummary.errorCount}</Badge>
                      </div>
                    ) : null}
                  </div>

                  <div className="section-block">
                    <span className="section-label">Generation profile</span>
                    <Select value={runtime} onChange={(event) => setRuntime(event.target.value as "local" | "hosted_aws")}>
                      <option value="local">Local runtime</option>
                      <option value="hosted_aws">Hosted AWS runtime</option>
                    </Select>
                    <Select value={preset} onChange={(event) => setPreset(event.target.value as typeof preset)}>
                      <option value="quick">Quick</option>
                      <option value="balanced">Balanced</option>
                      <option value="high_quality">High Quality</option>
                    </Select>
                    <span className="tiny muted">Style preset (combined archetypes + mapper-inspired examples)</span>
                    <Select value={stylePresetId} onChange={(event) => applyStylePreset(event.target.value)}>
                      {stylePresetOptions.map((presetOption) => (
                        <option key={presetOption.id} value={presetOption.id}>
                          {presetOption.label}
                        </option>
                      ))}
                    </Select>
                    {selectedStylePreset ? <p className="tiny muted">{selectedStylePreset.description}</p> : null}
                    <span className="tiny muted">Mapper lock (optional)</span>
                    <Select value={mapperChoiceId} onChange={(event) => applyMapperChoice(event.target.value)}>
                      <option value="none">No mapper lock</option>
                      {mapperStylePresets.map((mapperOption) => (
                        <option key={mapperOption.id} value={mapperOption.id}>
                          {mapperOption.label} ({mapperOption.mapperId})
                        </option>
                      ))}
                      <option value="other">Other (custom mapper ID)</option>
                    </Select>
                    {selectedMapperOption ? <p className="tiny muted">{selectedMapperOption.description}</p> : null}
                    {mapperChoiceId === "other" ? (
                      <Input
                        type="number"
                        placeholder="Custom mapper ID"
                        value={generatorParams.mapperId ?? ""}
                        onChange={(event) => updateCustomMapperId(event.target.value)}
                      />
                    ) : null}

                    <p className="tiny muted">
                      Style preset applies descriptors plus optional AR/OD/CS/SR defaults. Mapper lock is independent and optional.
                    </p>

                    <div className="section-block generator-control">
                      <span className="tiny muted generator-label">
                        <Target size={12} />
                        Star difficulty target (SR, required). Typical: 4.8 - 6.2
                      </span>
                      <Input
                        type="number"
                        step={0.1}
                        min={0}
                        max={12}
                        value={generatorParams.difficulty ?? ""}
                        onChange={(event) =>
                          updateGeneratorParam(
                            "difficulty",
                            event.target.value === "" ? null : Number(event.target.value),
                          )
                        }
                      />
                    </div>

                    <div className="section-block generator-control">
                      <span className="tiny muted generator-label">
                        <Calendar size={12} />
                        Style year (optional). Typical modern mapping: 2018 - current year.
                      </span>
                      <Input
                        type="number"
                        min={2007}
                        max={new Date().getUTCFullYear()}
                        value={generatorParams.year ?? ""}
                        onChange={(event) => updateGeneratorParam("year", event.target.value === "" ? null : Number(event.target.value))}
                      />
                    </div>

                    <div className="section-block generator-control">
                      <span className="tiny muted generator-label">
                        <Tags size={12} />
                        Descriptors (multi-select, optional)
                      </span>
                      <Select
                        multiple
                        size={8}
                        value={generatorParams.descriptors ?? []}
                        onChange={(event) => updateGeneratorParam("descriptors", selectedMultiValues(event))}
                      >
                        {descriptorOptions.map((descriptor) => (
                          <option key={descriptor} value={descriptor}>
                            {descriptor}
                          </option>
                        ))}
                      </Select>
                      <p className="tiny muted">Hold Cmd/Ctrl to select multiple styles.</p>
                    </div>

                    <div className="section-block generator-control">
                      <span className="tiny muted generator-label">
                        <Eye size={12} />
                        AR (Approach Rate, optional). Typical: 9.0 - 10.3 for higher-diff standard maps.
                      </span>
                      <Input
                        type="number"
                        step={0.1}
                        min={0}
                        max={11}
                        value={generatorParams.approachRate ?? ""}
                        onChange={(event) =>
                          updateGeneratorParam("approachRate", event.target.value === "" ? null : Number(event.target.value))
                        }
                      />
                    </div>

                    <div className="section-block generator-control">
                      <span className="tiny muted generator-label">
                        <Crosshair size={12} />
                        OD (Overall Difficulty, optional). Typical: 7.5 - 10.
                      </span>
                      <Input
                        type="number"
                        step={0.1}
                        min={0}
                        max={11}
                        value={generatorParams.overallDifficulty ?? ""}
                        onChange={(event) =>
                          updateGeneratorParam("overallDifficulty", event.target.value === "" ? null : Number(event.target.value))
                        }
                      />
                    </div>

                    <div className="section-block generator-control">
                      <span className="tiny muted generator-label">
                        <Circle size={12} />
                        CS (Circle Size, optional). Typical standard: 3.8 - 4.2
                      </span>
                      <Input
                        type="number"
                        step={0.1}
                        min={2}
                        max={7}
                        value={generatorParams.circleSize ?? ""}
                        onChange={(event) =>
                          updateGeneratorParam("circleSize", event.target.value === "" ? null : Number(event.target.value))
                        }
                      />
                    </div>

                    <div className="section-block generator-control">
                      <span className="tiny muted generator-label">
                        <Heart size={12} />
                        HP (drain, optional). Typical: 4 - 7
                      </span>
                      <Input
                        type="number"
                        step={0.1}
                        min={0}
                        max={10}
                        value={generatorParams.hpDrainRate ?? ""}
                        onChange={(event) =>
                          updateGeneratorParam("hpDrainRate", event.target.value === "" ? null : Number(event.target.value))
                        }
                      />
                    </div>

                    <div className="section-block generator-control">
                      <span className="tiny muted generator-label">
                        <SlidersHorizontal size={12} />
                        CFG scale (style strength, optional). Typical: 0.9 - 1.2
                      </span>
                      <Input
                        type="number"
                        step={0.05}
                        min={0.5}
                        max={2}
                        value={generatorParams.cfgScale ?? ""}
                        onChange={(event) =>
                          updateGeneratorParam("cfgScale", event.target.value === "" ? null : Number(event.target.value))
                        }
                      />
                    </div>

                    <div className="section-block generator-control">
                      <span className="tiny muted generator-label">
                        <Flame size={12} />
                        Sampling temperature (optional). Typical: 0.9 - 1.1
                      </span>
                      <Input
                        type="number"
                        step={0.05}
                        min={0.4}
                        max={2}
                        value={generatorParams.temperature ?? ""}
                        onChange={(event) =>
                          updateGeneratorParam("temperature", event.target.value === "" ? null : Number(event.target.value))
                        }
                      />
                    </div>

                    <div className="section-block generator-control">
                      <span className="tiny muted generator-label">
                        <Gauge size={12} />
                        Top-p sampling (optional). Typical: 0.9 - 0.98
                      </span>
                      <Input
                        type="number"
                        step={0.01}
                        min={0}
                        max={1}
                        value={generatorParams.topP ?? ""}
                        onChange={(event) => updateGeneratorParam("topP", event.target.value === "" ? null : Number(event.target.value))}
                      />
                    </div>

                    <div className="row-wrap generator-toggle-row">
                      <label className="tiny muted row-wrap">
                        <Checkbox
                          checked={Boolean(generatorParams.superTiming)}
                          onChange={(event) => updateGeneratorParam("superTiming", event.target.checked)}
                        />
                        Super timing (slower, more precise BPM handling)
                      </label>
                      <label className="tiny muted row-wrap">
                        <Checkbox
                          checked={Boolean(generatorParams.generatePositions)}
                          onChange={(event) => updateGeneratorParam("generatePositions", event.target.checked)}
                        />
                        Diffusion positions
                      </label>
                      <label className="tiny muted row-wrap">
                        <Checkbox
                          checked={Boolean(generatorParams.hitsounded)}
                          onChange={(event) => updateGeneratorParam("hitsounded", event.target.checked)}
                        />
                        Hitsounded output
                      </label>
                    </div>

                    <details className="inline-help">
                      <summary className="tiny muted">Advanced generator controls</summary>
                      <div className="list">
                        <div className="section-block generator-control">
                          <span className="tiny muted">Slider multiplier (SV base). Typical: 1.2 - 1.8</span>
                          <Input
                            type="number"
                            step={0.05}
                            min={0.5}
                            max={3}
                            value={generatorParams.sliderMultiplier ?? ""}
                            onChange={(event) =>
                              updateGeneratorParam(
                                "sliderMultiplier",
                                event.target.value === "" ? null : Number(event.target.value),
                              )
                            }
                          />
                        </div>
                        <div className="section-block generator-control">
                          <span className="tiny muted">Slider tick rate. Typical: 1.0 - 2.0</span>
                          <Input
                            type="number"
                            step={0.1}
                            min={0.1}
                            max={8}
                            value={generatorParams.sliderTickRate ?? ""}
                            onChange={(event) =>
                              updateGeneratorParam("sliderTickRate", event.target.value === "" ? null : Number(event.target.value))
                            }
                          />
                        </div>
                        <div className="section-block generator-control">
                          <span className="tiny muted">Seed (integer, optional; blank = random)</span>
                          <Input
                            type="number"
                            value={generatorParams.seed ?? ""}
                            onChange={(event) => updateGeneratorParam("seed", event.target.value === "" ? null : Number(event.target.value))}
                          />
                        </div>
                        <div className="section-block generator-control">
                          <span className="tiny muted">Device target (enum, optional)</span>
                          <Select
                            value={generatorParams.device ?? "auto"}
                            onChange={(event) => updateGeneratorParam("device", event.target.value as GeneratorParams["device"])}
                          >
                            <option value="auto">auto</option>
                            <option value="cuda">cuda</option>
                            <option value="cpu">cpu</option>
                            <option value="mps">mps</option>
                          </Select>
                        </div>
                        <div className="section-block generator-control">
                          <span className="tiny muted">Precision (enum, optional)</span>
                          <Select
                            value={generatorParams.precision ?? "auto"}
                            onChange={(event) =>
                              updateGeneratorParam("precision", event.target.value as GeneratorParams["precision"])
                            }
                          >
                            <option value="auto">auto</option>
                            <option value="fp16">fp16</option>
                            <option value="bf16">bf16</option>
                            <option value="fp32">fp32</option>
                          </Select>
                        </div>
                        <div className="section-block generator-control">
                          <span className="tiny muted">Attention implementation (enum, optional)</span>
                          <Select
                            value={generatorParams.attnImplementation ?? "auto"}
                            onChange={(event) =>
                              updateGeneratorParam(
                                "attnImplementation",
                                event.target.value as GeneratorParams["attnImplementation"],
                              )
                            }
                          >
                            <option value="auto">auto</option>
                            <option value="sdpa">sdpa</option>
                            <option value="flash_attention_2">flash_attention_2</option>
                            <option value="eager">eager</option>
                          </Select>
                        </div>
                        <div className="section-block generator-control">
                          <span className="tiny muted">Negative descriptors (multi-select)</span>
                          <Select
                            multiple
                            size={7}
                            value={generatorParams.negativeDescriptors ?? []}
                            onChange={(event) => updateGeneratorParam("negativeDescriptors", selectedMultiValues(event))}
                          >
                            {negativeDescriptorOptions.map((descriptor) => (
                              <option key={descriptor} value={descriptor}>
                                {descriptor}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="section-block generator-control">
                          <span className="tiny muted">In-context mode (multi-select)</span>
                          <Select
                            multiple
                            size={4}
                            value={generatorParams.inContext ?? []}
                            onChange={(event) => updateGeneratorParam("inContext", selectedMultiValues(event))}
                          >
                            {inContextOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="section-block generator-control">
                          <span className="tiny muted">Output type (multi-select)</span>
                          <Select
                            multiple
                            size={3}
                            value={generatorParams.outputType ?? []}
                            onChange={(event) => updateGeneratorParam("outputType", selectedMultiValues(event))}
                          >
                            {outputTypeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    </details>

                    <span className="tiny muted">Job timeout (seconds)</span>
                    <Input
                      type="number"
                      min={300}
                      max={1200}
                      value={timeoutSec}
                      onChange={(event) => setTimeoutSec(Number(event.target.value || 600))}
                    />
                    <span className="tiny muted">Budget cap (USD)</span>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={budgetCapUsd}
                      onChange={(event) => setBudgetCapUsd(Number(event.target.value || 50))}
                    />

                    {runtime === "hosted_aws" ? (
                      <div className="section-block hosted-runtime-block">
                        <div className="row">
                          <span className="section-label">Hosted AWS Session</span>
                          <Badge variant={awsSessionStatus.configured ? "success" : "warning"}>
                            {awsSessionStatus.configured ? "Configured" : "Not configured"}
                          </Badge>
                        </div>
                        <p className="tiny muted">
                          Quick setup: run <code>aws configure sso</code> once, then{" "}
                          <code>aws sso login --profile {(awsProfile.trim() || "default")}</code>, then click auto-load.
                        </p>
                        <div className="row-wrap">
                          <Input
                            placeholder="AWS CLI profile (default)"
                            value={awsProfile}
                            onChange={(event) => setAwsProfile(event.target.value)}
                          />
                          <Button variant="secondary" onClick={() => void autoLoadAwsRuntimeSession()} disabled={busy}>
                            Auto-load AWS (recommended)
                          </Button>
                          <Button variant="secondary" onClick={() => void loadAwsRuntimeSessionFromCli()} disabled={busy}>
                            Load from AWS CLI
                          </Button>
                          <Button variant="ghost" onClick={() => void clearAwsRuntimeSession()} disabled={busy}>
                            Clear AWS Session
                          </Button>
                        </div>
                        <p className="tiny muted">
                          Auto-load resolves credentials from AWS SDK chain (env vars, shared config/profile, SSO cache, or instance role) and
                          tries to discover queue/job definition/S3 bucket automatically.
                        </p>
                        <Input placeholder="Region (e.g. us-east-1)" value={awsRegion} onChange={(event) => setAwsRegion(event.target.value)} />
                        <Input
                          placeholder="Batch Queue ARN or name"
                          value={awsBatchQueue}
                          onChange={(event) => setAwsBatchQueue(event.target.value)}
                        />
                        <Input
                          placeholder="Batch Job Definition ARN or name"
                          value={awsBatchJobDefinition}
                          onChange={(event) => setAwsBatchJobDefinition(event.target.value)}
                        />
                        <Input placeholder="S3 Bucket" value={awsS3Bucket} onChange={(event) => setAwsS3Bucket(event.target.value)} />
                        <Input placeholder="S3 Prefix" value={awsS3Prefix} onChange={(event) => setAwsS3Prefix(event.target.value)} />
                        <Input
                          placeholder="CloudWatch Log Group"
                          value={awsCloudWatchLogGroup}
                          onChange={(event) => setAwsCloudWatchLogGroup(event.target.value)}
                        />
                        {awsSessionStatus.accessKeyIdHint ? (
                          <p className="tiny muted">Active key: {awsSessionStatus.accessKeyIdHint}</p>
                        ) : null}
                        {awsSessionStatus.profile ? <p className="tiny muted">Loaded profile: {awsSessionStatus.profile}</p> : null}
                        <div className="section-block generator-control">
                          <span className="tiny muted generator-label">
                            <Cpu size={12} />
                            Hosted inference GPU
                          </span>
                          {awsSessionStatus.gpuHint ? (
                            <p className="tiny muted">Detected queue instance/GPU: {awsSessionStatus.gpuHint}</p>
                          ) : (
                            <p className="tiny muted">
                              GPU model comes from your AWS Batch compute environment instance types for the selected queue.
                            </p>
                          )}
                          {awsSessionStatus.gpuCountPerJob ? (
                            <p className="tiny muted">Job definition GPU count: {awsSessionStatus.gpuCountPerJob}</p>
                          ) : null}
                          <p className="tiny muted">
                            Typical picks: `g6.xlarge` (L4) for cost/perf, `g6e.xlarge` (L40S) for more VRAM/throughput, `p5` for
                            high-throughput premium.
                          </p>
                        </div>
                        <details className="inline-help">
                          <summary className="tiny muted">Fallbacks and manual entry</summary>
                          <div className="list">
                            <p className="tiny muted">
                              If auto-load fails, try `Load from AWS CLI` (uses `aws configure export-credentials`) or enter IAM credentials
                              manually.
                            </p>
                            <Input
                              placeholder="AWS Access Key ID"
                              value={awsAccessKeyId}
                              onChange={(event) => setAwsAccessKeyId(event.target.value)}
                            />
                            <Input
                              placeholder="AWS Secret Access Key"
                              type="password"
                              value={awsSecretAccessKey}
                              onChange={(event) => setAwsSecretAccessKey(event.target.value)}
                            />
                            <Input
                              placeholder="AWS Session Token (optional)"
                              type="password"
                              value={awsSessionToken}
                              onChange={(event) => setAwsSessionToken(event.target.value)}
                            />
                            <div className="row-wrap">
                              <Button variant="secondary" onClick={() => void saveAwsRuntimeSession()} disabled={busy}>
                                Save AWS Session
                              </Button>
                            </div>
                          </div>
                        </details>
                      </div>
                    ) : null}

                    <details className="inline-help">
                      <summary className="tiny muted">How to get required API keys (osu + AWS)</summary>
                      <div className="list tiny muted">
                        <p>
                          osu: create an OAuth application at <Link href="https://osu.ppy.sh/home/account/edit#new-oauth-application" target="_blank" rel="noreferrer">osu account settings</Link> and add client id/secret to env.
                        </p>
                        <p>
                          AWS: easiest path is AWS CLI SSO via <code>aws configure sso</code> and then <code>Load from AWS CLI</code>. Manual IAM
                          access keys are only needed for advanced/manual mode. Prefer <code>Auto-load AWS</code> first.
                        </p>
                      </div>
                    </details>

                    <div className="row-wrap">
                      <Button
                        onClick={() => void queueGeneration(unmatchedSelectedIds)}
                        disabled={busy || unmatchedSelectedIds.length === 0}
                      >
                        <Sparkles size={14} />
                        Generate unmatched ({unmatchedSelectedIds.length})
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => void queueGeneration(selectedTrackIds)}
                        disabled={busy || selectedTrackIds.length === 0}
                      >
                        Generate selected ({selectedTrackIds.length})
                      </Button>
                    </div>
                  </div>

                  <div className="section-block">
                    <span className="section-label">Matched previews</span>
                    <ScrollArea className="ui-scroll-area jobs-scroll">
                      <div className="list">
                        {matchedSelected.length === 0 ? (
                          <p className="tiny muted">No selected tracks have match results yet.</p>
                        ) : (
                          matchedSelected.map(({ track, snapshot }) => {
                            if (!track || !snapshot) return null;
                            const best = snapshot.matches[0];
                            if (!best) return null;
                            return (
                              <div key={track.id} className="job-card">
                                <div className="row">
                                  <span className="tiny">{track.title}</span>
                                  <Badge variant={best.status === "ranked" ? "success" : "warning"}>{best.status}</Badge>
                                </div>
                                <p className="tiny muted">
                                  {best.artist} - {best.title}
                                </p>
                                {matchMetaText(best) ? <p className="tiny muted">{matchMetaText(best)}</p> : null}
                                <p className="tiny muted">{best.rationale}</p>
                                <Link
                                  href={best.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                                >
                                  Open beatmapset
                                </Link>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="section-block">
                    <span className="section-label">Unmatched top hits</span>
                    <ScrollArea className="ui-scroll-area jobs-scroll">
                      <div className="list">
                        {unmatchedTopHits.length === 0 ? (
                          <p className="tiny muted">No top-hit suggestions yet for unmatched selected tracks.</p>
                        ) : (
                          unmatchedTopHits.map(({ track, snapshot }) => {
                            if (!track || !snapshot?.topHit) return null;
                            const topHit = snapshot.topHit;
                            return (
                              <div key={`${track.id}-top-hit`} className="job-card">
                                <div className="row">
                                  <span className="tiny">{track.title}</span>
                                  <Badge variant={topHit.status === "ranked" ? "success" : "warning"}>{topHit.status}</Badge>
                                </div>
                                <p className="tiny muted">
                                  Suggested: {topHit.artist} - {topHit.title}
                                </p>
                                {matchMetaText(topHit) ? <p className="tiny muted">{matchMetaText(topHit)}</p> : null}
                                <p className="tiny muted">{topHit.rationale}</p>
                                <Link
                                  href={topHit.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                                >
                                  Open top hit
                                </Link>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="section-block">
                    <span className="section-label">Jobs + Export</span>
                    <div className="row-wrap">
                      <Button onClick={() => void downloadZip()} disabled={busy || selectedTrackIds.length === 0}>
                        <Download size={14} />
                        Download ZIP
                      </Button>
                      {jobsLoading ? <Badge variant="warning">Syncing jobs...</Badge> : null}
                    </div>
                    <ScrollArea className="ui-scroll-area jobs-scroll">
                      <div className="list">
                        {jobs.length === 0 ? <p className="tiny muted">No jobs queued yet.</p> : null}
                        {jobs.slice(0, 30).map((job) => (
                          <article key={job.id} className="job-card">
                            <div className="row">
                              <span className="tiny">{job.id.slice(0, 8)}</span>
                              <Badge
                                variant={
                                  job.status === "completed"
                                    ? "success"
                                    : job.status === "failed"
                                      ? "danger"
                                      : "info"
                                }
                              >
                                {job.status}
                              </Badge>
                            </div>
                            {job.runtime === "hosted_aws" && job.hosted?.batchJobId ? (
                              <p className="tiny muted">AWS Batch Job: {job.hosted.batchJobId}</p>
                            ) : null}
                            {job.warning ? <p className="warn-text">{job.warning}</p> : null}
                            {job.error ? <p className="error-text">{job.error}</p> : null}
                            {job.logs.length > 0 ? <pre className="job-logs">{job.logs.slice(-8).join("\n")}</pre> : null}
                            {job.artifacts.length > 0 ? (
                              <div className="list">
                                {job.artifacts.map((artifact) => (
                                  <Link
                                    key={artifact.id}
                                    href={`/api/generation/jobs/${job.id}/artifacts/${artifact.id}/download`}
                                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                                  >
                                    {artifact.fileName}
                                  </Link>
                                ))}
                              </div>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {error ? <p className="error-text">{error}</p> : null}
                  {notice ? <p className="tiny muted">{notice}</p> : null}
                </>
              )}
            </div>
          </Card>
        </section>
      </main>
    </div>
  );
}
