"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCcw } from "lucide-react";
import type { GenerationJob, SpotifyImportStatus, Track, TrackMatchSnapshot } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { chunkArray, inferFilename } from "@/lib/homeUi";
import { AuthShell } from "@/components/workspace/auth-shell";
import { FiltersPane } from "@/components/workspace/filters-pane";
import { LibraryPane } from "@/components/workspace/library-pane";
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

const defaultImportStatus: SpotifyImportStatus = { status: "idle" };

type MatchFilter = "all" | "matched" | "unmatched" | "generated";
type ProviderFilter = "all" | Track["provider"];
type SourceFilter = "all" | Track["source"];

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

  const autoImportAttemptedRef = useRef(false);
  const hydratedRef = useRef(false);
  const lastImportStateRef = useRef<SpotifyImportStatus["status"]>("idle");
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
        .filter(
          (entry) =>
            entry.track && entry.snapshot && entry.snapshot.matches.length === 0 && entry.snapshot.topHit,
        ),
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
        clearSelection();
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
    [clearSelection, fetchImportStatus, fetchTracks],
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
      const body = (await response.json()) as {
        error?: string;
        details?: string[];
        jobs?: GenerationJob[];
        job?: GenerationJob;
      };
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
    unmatchedSelectedCount: unmatchedSelectedIds.length,
    selectedTrackCount: selectedTrackIds.length,
    onGenerateUnmatched: async () => queueGeneration(unmatchedSelectedIds),
    onGenerateSelected: async () => queueGeneration(selectedTrackIds),
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
            <h1 className="workspace-title">osu-gpt / Dense Workspace</h1>
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
            onProviderFilterChange={setProviderFilter as (next: "all" | "spotify" | "apple") => void}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter as (next: "all" | "liked" | "playlist" | "library") => void}
            matchFilter={matchFilter}
            onMatchFilterChange={
              setMatchFilter as (next: "all" | "matched" | "unmatched" | "generated") => void
            }
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            page={page}
            totalPages={totalPages}
            onPrevPage={() => setPage((previous) => Math.max(1, previous - 1))}
            onNextPage={() => setPage((previous) => Math.min(totalPages, previous + 1))}
            visibleStart={visibleStart}
            visibleEnd={visibleEnd}
            tracksTotal={tracksTotal}
            onSelectPageTracks={selectPageTracks}
            onClearSelection={clearSelection}
            pageTracksCount={tracks.length}
            importStatus={importStatus}
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
            matching={matching}
            onAcknowledgeSpotdl={acknowledgeSpotdl}
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
            generationProfileProps={generationProfileProps}
            matchedSelected={matchedSelected}
            unmatchedTopHits={unmatchedTopHits}
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
