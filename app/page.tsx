"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw } from "lucide-react";
import type {
  GenerationJob,
  MatchResult,
  SpotifyImportStatus,
  Track,
  TrackMatchSnapshot,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/workspace/auth-shell";
import { FiltersPane } from "@/components/workspace/filters-pane";
import { LibraryPane } from "@/components/workspace/library-pane";
import type { ExactReviewItem, NonExactReviewItem } from "@/components/workspace/match-review-panel";
import { ActionsPane } from "@/components/workspace/right-pane/actions-pane";
import type { GenerationProfileSectionProps } from "@/components/workspace/right-pane/types";
import type {
  BatchMatchResponse,
  HostedAwsSessionStatus,
  OsuSessionStatus,
  SessionResponse,
  TracksResponse,
} from "@/lib/homeTypes";
import { useLibrarySelection } from "@/hooks/use-library-selection";
import { useGenerationProfileConfig } from "@/hooks/use-generation-profile-config";
import { useRuntimeActions } from "@/hooks/use-runtime-actions";
import { useMatchWorkflow } from "@/hooks/use-match-workflow";
import { useGenerationWorkflow } from "@/hooks/use-generation-workflow";
import { useSelectionDerived } from "@/hooks/use-selection-derived";
import { useWorkspaceDataEffects } from "@/hooks/use-workspace-data-effects";
import { useSpotifyImportWorkflow } from "@/hooks/use-spotify-import-workflow";

const defaultImportStatus: SpotifyImportStatus = { status: "idle" };

type MatchFilter = "all" | "matched" | "unmatched" | "generated";
type ProviderFilter = "all" | Track["provider"];
type SourceFilter = "all" | Track["source"];
type TrackQueryState = {
  page: number;
  pageSize: number;
  providerFilter: ProviderFilter;
  sourceFilter: SourceFilter;
  matchFilter: MatchFilter;
  debouncedQuery: string;
};

export default function Home() {
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotdlAckAt, setSpotdlAckAt] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [trackCacheById, setTrackCacheById] = useState<Record<string, Track>>({});
  const [matchSnapshots, setMatchSnapshots] = useState<Record<string, TrackMatchSnapshot>>({});
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [importStatus, setImportStatus] = useState<SpotifyImportStatus>(defaultImportStatus);

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
  const [promotedTopHitsByTrackId, setPromotedTopHitsByTrackId] = useState<
    Record<string, MatchResult>
  >({});
  const [approvedMatchesByTrackId, setApprovedMatchesByTrackId] = useState<
    Record<string, MatchResult>
  >({});

  const debouncedQueryRef = useRef("");
  const libraryScrollRef = useRef<HTMLDivElement | null>(null);

  const {
    stylePresetId,
    stylePresetOptions,
    selectedStylePresetDescription,
    applyStylePreset,
    mapperChoiceId,
    mapperStyleOptions,
    selectedMapperOptionDescription,
    applyMapperChoice,
    updateCustomMapperId,
    generatorParams,
    updateGeneratorParam,
  } = useGenerationProfileConfig();

  const {
    selectedTrackIds,
    selectedTrackSet,
    selectionRect,
    toggleTrack,
    selectPageTracks,
    clearSelection,
    handleLibraryPointerDown,
    handleLibraryPointerMove,
    handleLibraryPointerEnd,
  } = useLibrarySelection({
    tracks,
    libraryScrollRef,
  });

  const trackById = useMemo(() => {
    const map = new Map<string, Track>();
    for (const [trackId, track] of Object.entries(trackCacheById)) {
      map.set(trackId, track);
    }
    return map;
  }, [trackCacheById]);

  const completedTrackIdSet = useMemo(
    () => new Set(jobs.filter((job) => job.status === "completed").map((job) => job.trackId)),
    [jobs],
  );

  const hasActiveJobs = useMemo(
    () => jobs.some((job) => job.status === "queued" || job.status === "running"),
    [jobs],
  );

  const { selectionStats, matchedSelected, unmatchedTopHits } = useSelectionDerived({
    selectedTrackIds,
    matchSnapshots,
    completedTrackIdSet,
    trackById,
  });

  const exactReviewItems = useMemo<ExactReviewItem[]>(() => {
    const byTrackId = new Map<string, ExactReviewItem>();
    for (const { track, snapshot } of matchedSelected) {
      const exactMatches = snapshot.matches.slice(0, 5);
      if (exactMatches.length === 0) continue;
      byTrackId.set(track.id, {
        track,
        matches: exactMatches,
        source: "exact",
        strongMatch: snapshot.strongMatch,
      });
    }

    for (const trackId of selectedTrackIds) {
      if (byTrackId.has(trackId)) continue;
      const track = trackById.get(trackId);
      const promoted = promotedTopHitsByTrackId[trackId];
      if (!track || !promoted) continue;
      byTrackId.set(trackId, {
        track,
        matches: [promoted],
        source: "promoted",
        strongMatch: false,
      });
    }

    return Array.from(byTrackId.values());
  }, [matchedSelected, promotedTopHitsByTrackId, selectedTrackIds, trackById]);

  const nonExactReviewItems = useMemo<NonExactReviewItem[]>(() => {
    const items: NonExactReviewItem[] = [];
    for (const { track, snapshot } of unmatchedTopHits) {
      if (!track || !snapshot?.topHit || promotedTopHitsByTrackId[track.id]) {
        continue;
      }
      items.push({
        track,
        topHit: snapshot.topHit,
      });
    }
    return items;
  }, [unmatchedTopHits, promotedTopHitsByTrackId]);

  const approvedSelectedCount = useMemo(
    () => selectedTrackIds.filter((trackId) => Boolean(approvedMatchesByTrackId[trackId])).length,
    [selectedTrackIds, approvedMatchesByTrackId],
  );

  const selectedTrackIdsForGeneration = useMemo(
    () => selectedTrackIds.filter((trackId) => !approvedMatchesByTrackId[trackId]),
    [selectedTrackIds, approvedMatchesByTrackId],
  );

  const handlePromoteTopHit = useCallback(
    (trackId: string) => {
      const snapshot = matchSnapshots[trackId];
      const topHit = snapshot?.topHit;
      if (!topHit) return;
      setPromotedTopHitsByTrackId((previous) => ({ ...previous, [trackId]: topHit }));
    },
    [matchSnapshots],
  );

  const handleRemovePromotedTopHit = useCallback((trackId: string) => {
    setPromotedTopHitsByTrackId((previous) => {
      if (!previous[trackId]) return previous;
      const next = { ...previous };
      delete next[trackId];
      return next;
    });
    setApprovedMatchesByTrackId((previous) => {
      if (!previous[trackId]) return previous;
      const next = { ...previous };
      delete next[trackId];
      return next;
    });
  }, []);

  const handleApproveMatch = useCallback((trackId: string, match: MatchResult) => {
    setApprovedMatchesByTrackId((previous) => ({ ...previous, [trackId]: match }));
  }, []);

  const handleClearApprovedMatch = useCallback((trackId: string) => {
    setApprovedMatchesByTrackId((previous) => {
      if (!previous[trackId]) return previous;
      const next = { ...previous };
      delete next[trackId];
      return next;
    });
  }, []);

  const fetchSession = useCallback(async () => {
    const response = await fetch("/api/session", { cache: "no-store" });
    const data = (await response.json()) as SessionResponse;
    setSpotifyConnected(Boolean(data.spotifyConnected));
    setSpotdlAckAt(data.spotdlAcknowledgedAt ?? null);
    setImportStatus(data.importStatus ?? defaultImportStatus);

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

  const fetchTracks = useCallback(
    async (overrides?: Partial<TrackQueryState>) => {
      const nextPage = overrides?.page ?? page;
      const nextPageSize = overrides?.pageSize ?? pageSize;
      const nextProviderFilter = overrides?.providerFilter ?? providerFilter;
      const nextSourceFilter = overrides?.sourceFilter ?? sourceFilter;
      const nextMatchFilter = overrides?.matchFilter ?? matchFilter;
      const nextDebouncedQuery = overrides?.debouncedQuery ?? debouncedQuery;

      setTracksLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(nextPageSize),
          provider: nextProviderFilter,
          source: nextSourceFilter,
          match: nextMatchFilter,
        });
        if (nextDebouncedQuery) {
          params.set("query", nextDebouncedQuery);
        }

        const response = await fetch(`/api/library/tracks?${params.toString()}`, { cache: "no-store" });
        const data = (await response.json()) as TracksResponse;
        const nextTracks = data.tracks ?? [];
        setTracks(nextTracks);
        setMatchSnapshots((previous) => ({ ...previous, ...(data.matchesByTrackId ?? {}) }));
        setTotalTracks(data.totalTracks ?? 0);
        setTracksTotal(data.pagination?.total ?? 0);
        setTotalPages(data.pagination?.totalPages ?? 1);
        setVisibleStart(data.pagination?.start ?? 0);
        setVisibleEnd(data.pagination?.end ?? 0);
        if (data.pagination?.page && data.pagination.page !== nextPage) {
          setPage(data.pagination.page);
        }
        setTracksLoadedOnce(true);
      } finally {
        setTracksLoading(false);
      }
    },
    [page, pageSize, providerFilter, sourceFilter, matchFilter, debouncedQuery],
  );

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
      const nextQuery = query.trim();
      if (debouncedQueryRef.current === nextQuery) {
        return;
      }
      debouncedQueryRef.current = nextQuery;
      setDebouncedQuery(nextQuery);
      setPage(1);
      void fetchTracks({ debouncedQuery: nextQuery, page: 1 });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fetchTracks, query]);

  useWorkspaceDataEffects({
    fetchSession,
    fetchJobs,
    fetchImportStatus,
    fetchTracks,
    hasActiveJobs,
    importStatusState: importStatus.status,
    tracks,
    setTrackCacheById,
    setBootstrapping,
  });

  const handleProviderFilterChange = useCallback(
    (next: ProviderFilter) => {
      if (next === providerFilter) {
        return;
      }
      setProviderFilter(next);
      setPage(1);
      void fetchTracks({ providerFilter: next, page: 1 });
    },
    [fetchTracks, providerFilter],
  );

  const handleSourceFilterChange = useCallback(
    (next: SourceFilter) => {
      if (next === sourceFilter) {
        return;
      }
      setSourceFilter(next);
      setPage(1);
      void fetchTracks({ sourceFilter: next, page: 1 });
    },
    [fetchTracks, sourceFilter],
  );

  const handleMatchFilterChange = useCallback(
    (next: MatchFilter) => {
      if (next === matchFilter) {
        return;
      }
      setMatchFilter(next);
      setPage(1);
      void fetchTracks({ matchFilter: next, page: 1 });
    },
    [fetchTracks, matchFilter],
  );

  const handlePageSizeChange = useCallback(
    (next: number) => {
      const nextPageSize = Math.max(20, Number.isFinite(next) ? next : 60);
      if (nextPageSize === pageSize) {
        return;
      }
      setPageSize(nextPageSize);
      setPage(1);
      void fetchTracks({ pageSize: nextPageSize, page: 1 });
    },
    [fetchTracks, pageSize],
  );

  const handlePrevPage = useCallback(() => {
    const nextPage = Math.max(1, page - 1);
    if (nextPage === page) {
      return;
    }
    setPage(nextPage);
    void fetchTracks({ page: nextPage });
  }, [fetchTracks, page]);

  const handleNextPage = useCallback(() => {
    const nextPage = Math.min(totalPages, page + 1);
    if (nextPage === page) {
      return;
    }
    setPage(nextPage);
    void fetchTracks({ page: nextPage });
  }, [fetchTracks, page, totalPages]);

  const { importSpotify } = useSpotifyImportWorkflow({
    spotifyConnected,
    bootstrapping,
    clearSelection,
    fetchImportStatus,
    fetchTracks,
    setBusy,
    setError,
    setNotice,
    setTracks,
    setTrackCacheById,
    setMatchSnapshots,
    setJobs,
    setTracksTotal,
    setTotalTracks,
    setVisibleStart,
    setVisibleEnd,
    setTotalPages,
    setPage,
  });

  const {
    acknowledgeSpotdl,
    saveOsuRuntimeSession,
    clearOsuRuntimeSession,
    saveAwsRuntimeSession,
    loadAwsRuntimeSessionFromCli,
    autoLoadAwsRuntimeSession,
    clearAwsRuntimeSession,
    saveAwsRuntimeResources,
    logoutSpotify,
  } = useRuntimeActions({
    fetchSession,
    clearSelection,
    setBusy,
    setError,
    setNotice,
    setSpotdlAckAt,
    setOsuSessionStatus,
    setOsuClientId,
    setOsuClientSecret,
    setAwsSessionStatus,
    setAwsAccessKeyId,
    setAwsSecretAccessKey,
    setAwsSessionToken,
    setAwsRegion,
    setAwsBatchQueue,
    setAwsBatchJobDefinition,
    setAwsS3Bucket,
    setAwsS3Prefix,
    setAwsCloudWatchLogGroup,
    setTracks,
    setTrackCacheById,
    setJobs,
    setMatchSnapshots,
    setLastMatchSummary,
    setTracksTotal,
    setTotalTracks,
    setVisibleStart,
    setVisibleEnd,
    setTotalPages,
    setPage,
    osuClientId,
    osuClientSecret,
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken,
    awsProfile,
    awsRegion,
    awsBatchQueue,
    awsBatchJobDefinition,
    awsS3Bucket,
    awsS3Prefix,
    awsCloudWatchLogGroup,
  });

  const { runBatchMatch } = useMatchWorkflow({
    selectedTrackIds,
    setMatching,
    setError,
    setNotice,
    setMatchSnapshots,
    setLastMatchSummary,
    fetchTracks,
  });

  const { queueGeneration, downloadZip } = useGenerationWorkflow({
    selectedTrackIds,
    spotdlAckAt,
    runtime,
    awsConfigured: awsSessionStatus.configured,
    preset,
    timeoutSec,
    budgetCapUsd,
    generatorParams,
    setBusy,
    setError,
    setNotice,
    fetchJobs,
  });

  const showLibrarySkeleton =
    (!tracksLoadedOnce && (tracksLoading || bootstrapping)) || (bootstrapping && tracks.length === 0);

  const generationProfileProps: GenerationProfileSectionProps = {
    runtime,
    onRuntimeChange: setRuntime,
    preset,
    onPresetChange: setPreset,
    stylePresetId,
    stylePresetOptions,
    selectedStylePresetDescription,
    onApplyStylePreset: applyStylePreset,
    mapperChoiceId,
    mapperStylePresets: mapperStyleOptions,
    selectedMapperOptionDescription,
    onApplyMapperChoice: applyMapperChoice,
    onUpdateCustomMapperId: updateCustomMapperId,
    generatorParams,
    onUpdateGeneratorParam: updateGeneratorParam,
    timeoutSec,
    onTimeoutSecChange: setTimeoutSec,
    budgetCapUsd,
    onBudgetCapUsdChange: setBudgetCapUsd,
    awsSessionStatus,
    awsProfile,
    onAwsProfileChange: setAwsProfile,
    awsRegion,
    onAwsRegionChange: setAwsRegion,
    awsBatchQueue,
    onAwsBatchQueueChange: setAwsBatchQueue,
    awsBatchJobDefinition,
    onAwsBatchJobDefinitionChange: setAwsBatchJobDefinition,
    awsS3Bucket,
    onAwsS3BucketChange: setAwsS3Bucket,
    awsS3Prefix,
    onAwsS3PrefixChange: setAwsS3Prefix,
    awsCloudWatchLogGroup,
    onAwsCloudWatchLogGroupChange: setAwsCloudWatchLogGroup,
    awsAccessKeyId,
    onAwsAccessKeyIdChange: setAwsAccessKeyId,
    awsSecretAccessKey,
    onAwsSecretAccessKeyChange: setAwsSecretAccessKey,
    awsSessionToken,
    onAwsSessionTokenChange: setAwsSessionToken,
    onAutoLoadAwsRuntimeSession: autoLoadAwsRuntimeSession,
    onLoadAwsRuntimeSessionFromCli: loadAwsRuntimeSessionFromCli,
    onClearAwsRuntimeSession: clearAwsRuntimeSession,
    onSaveAwsRuntimeResources: saveAwsRuntimeResources,
    onSaveAwsRuntimeSession: saveAwsRuntimeSession,
    busy,
    approvedSelectedCount,
    generatableSelectedCount: selectedTrackIdsForGeneration.length,
    selectedTrackCount: selectedTrackIds.length,
    onGenerateSelected: async () => queueGeneration(selectedTrackIdsForGeneration),
    onGenerateAllSelected: async () => queueGeneration(selectedTrackIds),
  };

  if (!spotifyConnected) {
    return (
      <div className="app-root">
        <AuthShell bootstrapping={bootstrapping} />
      </div>
    );
  }

  return (
    <div className="app-root">
      <main className="workspace">
        <header className="workspace-header">
          <div>
            <h1 className="workspace-title">osu-gpt Workspace</h1>
            <p className="workspace-meta">
              Liked Songs: {totalTracks} | Selected: {selectionStats.total} | Matched:{" "}
              {selectionStats.matched} | Unmatched: {selectionStats.unmatched} | Generated:{" "}
              {selectionStats.generated}
            </p>
          </div>
          <div className="workspace-actions">
            <Button
              variant="secondary"
              onClick={() => void importSpotify()}
              disabled={busy || importStatus.status === "running"}
            >
              <RefreshCcw size={14} /> Sync Liked Songs
            </Button>
            <Button variant="ghost" onClick={logoutSpotify}>
              Disconnect Spotify
            </Button>
          </div>
        </header>

        <section className="workspace-grid">
          <FiltersPane
            query={query}
            onQueryChange={setQuery}
            providerFilter={providerFilter}
            onProviderFilterChange={handleProviderFilterChange as (next: "all" | "spotify" | "apple") => void}
            sourceFilter={sourceFilter}
            onSourceFilterChange={
              handleSourceFilterChange as (next: "all" | "liked" | "playlist" | "library") => void
            }
            matchFilter={matchFilter}
            onMatchFilterChange={
              handleMatchFilterChange as (next: "all" | "matched" | "unmatched" | "generated") => void
            }
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            page={page}
            totalPages={totalPages}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
            visibleStart={visibleStart}
            visibleEnd={visibleEnd}
            tracksTotal={tracksTotal}
            onSelectPageTracks={selectPageTracks}
            onClearSelection={clearSelection}
            pageTracksCount={tracks.length}
            importStatus={importStatus}
            busy={busy}
            matching={matching}
            osuSessionStatus={osuSessionStatus}
            osuClientId={osuClientId}
            onOsuClientIdChange={setOsuClientId}
            osuClientSecret={osuClientSecret}
            onOsuClientSecretChange={setOsuClientSecret}
            onSaveOsuRuntimeSession={saveOsuRuntimeSession}
            onClearOsuRuntimeSession={clearOsuRuntimeSession}
            onRunBatchMatch={runBatchMatch}
            selectedTrackCount={selectedTrackIds.length}
            lastMatchSummary={lastMatchSummary}
            exactReviewItems={exactReviewItems}
            nonExactReviewItems={nonExactReviewItems}
            approvedMatchesByTrackId={approvedMatchesByTrackId}
            onApproveMatch={handleApproveMatch}
            onClearApprovedMatch={handleClearApprovedMatch}
            onPromoteTopHit={handlePromoteTopHit}
            onRemovePromotedTopHit={handleRemovePromotedTopHit}
          />

          <LibraryPane
            visibleStart={visibleStart}
            visibleEnd={visibleEnd}
            tracksTotal={tracksTotal}
            selectedCount={selectedTrackIds.length}
            tracksLoading={tracksLoading}
            scrollRef={libraryScrollRef}
            onPointerDown={handleLibraryPointerDown}
            onPointerMove={handleLibraryPointerMove}
            onPointerEnd={handleLibraryPointerEnd}
            showLibrarySkeleton={showLibrarySkeleton}
            tracks={tracks}
            selectedTrackSet={selectedTrackSet}
            completedTrackIdSet={completedTrackIdSet}
            onToggleTrack={toggleTrack}
            selectionRect={selectionRect}
          />

          <ActionsPane
            bootstrapping={bootstrapping}
            jobsLoadedOnce={jobsLoadedOnce}
            spotdlAckAt={spotdlAckAt}
            busy={busy}
            onAcknowledgeSpotdl={acknowledgeSpotdl}
            selectedTrackCount={selectedTrackIds.length}
            generationProfileProps={generationProfileProps}
            jobs={jobs}
            jobsLoading={jobsLoading}
            onDownloadZip={downloadZip}
            error={error}
            notice={notice}
          />
        </section>
      </main>
    </div>
  );
}
