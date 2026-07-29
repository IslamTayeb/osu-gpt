"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/workspace/auth-shell";
import { GenerationPanel } from "@/components/workspace/generation-panel";
import { JobsPane } from "@/components/workspace/jobs-pane";
import { LibraryPane } from "@/components/workspace/library-pane";
import { SettingsPanel } from "@/components/workspace/settings-panel";
import { ThemeToggle } from "@/components/workspace/theme-toggle";
import { useLibrarySelection } from "@/hooks/use-library-selection";
import { importProgress } from "@/lib/homeUi";
import { GPU_PROFILES, estimateSeconds, formatDuration } from "@/lib/runtime/gpuProfiles";
import type {
  AppSettings,
  GenerationJob,
  GeneratorParams,
  ModelVersion,
  SpotifyImportStatus,
  Track,
} from "@/lib/types";

type SessionResponse = {
  spotifyConnected: boolean;
  spotdlAcknowledgedAt: string | null;
  trackCount: number;
  importStatus: SpotifyImportStatus;
};

type MatchFilter = "all" | "generated";

export default function Home() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotdlAckAt, setSpotdlAckAt] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksTotal, setTracksTotal] = useState(0);
  const [libraryTotal, setLibraryTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 100;

  // "library" filters what has been imported; "spotify" searches the catalogue.
  const [scope, setScope] = useState<"library" | "spotify">("library");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Selection acts on whatever list is rendered — library page or search results.
  const visibleTracks = scope === "spotify" ? searchResults : tracks;
  const {
    selectedTrackIds,
    setSelectedTrackIds,
    selectionRect,
    toggleTrack,
    selectVisible,
    clearSelection,
    marqueeHandlers,
  } = useLibrarySelection({
    tracks: visibleTracks,
    scrollRef,
  });

  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [importStatus, setImportStatus] = useState<SpotifyImportStatus>({ status: "idle" });

  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  // True from click until the audio actually produces sound — the preview
  // route may still be resolving Deezer/iTunes, and a pause icon with no
  // audio reads as broken.
  const [previewLoading, setPreviewLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [waitSecByProfile, setWaitSecByProfile] = useState<Record<string, number>>({});

  // Session + settings bootstrap
  useEffect(() => {
    const load = async () => {
      try {
        const [sessionResponse, settingsResponse] = await Promise.all([
          fetch("/api/session"),
          fetch("/api/settings"),
        ]);
        const session = (await sessionResponse.json()) as SessionResponse;
        const { settings: loaded } = (await settingsResponse.json()) as { settings: AppSettings };
        setSpotifyConnected(session.spotifyConnected);
        setSpotdlAckAt(session.spotdlAcknowledgedAt);
        setImportStatus(session.importStatus ?? { status: "idle" });
        setSettings(loaded);
      } catch {
        toast.error("Could not load the app state.");
      } finally {
        setBootstrapping(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const loadTracks = useCallback(async () => {
    if (!spotifyConnected) return;
    setTracksLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        match: matchFilter,
      });
      if (debouncedQuery) params.set("q", debouncedQuery);
      const response = await fetch(`/api/library/tracks?${params}`);
      const data = (await response.json()) as {
        tracks: Track[];
        totalTracks: number;
        pagination: { total: number; totalPages: number };
      };
      setTracks(data.tracks ?? []);
      // pagination.total reflects the active filters; totalTracks is the library size.
      setTracksTotal(data.pagination?.total ?? 0);
      setLibraryTotal(data.totalTracks ?? 0);
      setTotalPages(data.pagination?.totalPages ?? 1);
    } catch {
      toast.error("Could not load your library.");
    } finally {
      setTracksLoading(false);
    }
  }, [spotifyConnected, page, matchFilter, debouncedQuery]);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  // Catalogue search. Runs only in Spotify scope so browsing the library never
  // hits the network, and an empty box clears rather than searching for "".
  useEffect(() => {
    if (scope !== "spotify" || !spotifyConnected) return;
    if (!debouncedQuery) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    fetch(`/api/library/spotify/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((response) => response.json())
      .then((data: { tracks?: Track[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setSearchResults(data.tracks ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults([]);
          toast.error("Spotify search failed.");
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, debouncedQuery, spotifyConnected]);

  /**
   * Picking a search result saves it to the library first — generation reads
   * tracks from the store, so an unsaved result could not be generated.
   */
  const addFromSearch = useCallback(
    async (track: Track) => {
      setAdding(true);
      try {
        const response = await fetch("/api/library/spotify/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerTrackIds: [track.providerTrackId] }),
        });
        const data = (await response.json()) as { tracks?: Track[]; error?: string };
        if (!response.ok || data.error) throw new Error(data.error ?? "Could not add the track.");
        const saved = data.tracks?.[0] ?? track;
        setSelectedTrackIds((current) => new Set(current).add(saved.id));
        setLibraryTotal((current) => current + 1);
        toast.success(`Added ${saved.title}.`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not add the track.");
      } finally {
        setAdding(false);
      }
    },
    [setSelectedTrackIds],
  );

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/generation/jobs");
      const data = (await response.json()) as { jobs: GenerationJob[] };
      setJobs(data.jobs ?? []);
    } catch {
      // The poll retries on its own.
    }
  }, []);

  useEffect(() => {
    if (!spotifyConnected || settings?.runtime !== "dcc") return;
    const load = () =>
      fetch("/api/runtime/dcc/estimate")
        .then((r) => r.json())
        .then((d: { profiles?: { id: string; expectedWaitSec: number }[] }) =>
          setWaitSecByProfile(
            Object.fromEntries((d.profiles ?? []).map((p) => [p.id, p.expectedWaitSec])),
          ),
        )
        .catch(() => {});
    void load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [spotifyConnected, settings?.runtime]);

  useEffect(() => {
    if (!spotifyConnected) return;
    void loadJobs();
    const timer = setInterval(loadJobs, 2500);
    return () => clearInterval(timer);
  }, [spotifyConnected, loadJobs]);

  const tracksById = useMemo(
    () => Object.fromEntries(tracks.map((track) => [track.id, track])),
    [tracks],
  );
  const completedTrackIds = useMemo(
    () => new Set(jobs.filter((job) => job.status === "completed").map((job) => job.trackId)),
    [jobs],
  );

  const selectionEstimate = useMemo(() => {
    if (!settings) return null;
    const profile =
      settings.runtime === "dcc"
        ? (GPU_PROFILES[settings.gpuProfile] ?? GPU_PROFILES["fast-start"])
        : GPU_PROFILES["fast-start"];
    const batchSize = settings.runtime === "dcc" ? 8 : 1;

    const durationOf = (trackId: string) => tracksById[trackId]?.durationMs;
    const knownDurations = [...selectedTrackIds].map(durationOf).filter(Boolean) as number[];
    // Selections can span pages we have not loaded; fall back to the average.
    const average =
      knownDurations.length > 0
        ? knownDurations.reduce((sum, ms) => sum + ms, 0) / knownDurations.length
        : 210_000;
    const fill = (count: number) => Array.from({ length: Math.max(0, count) }, () => average);
    const selected = [...knownDurations, ...fill(selectedTrackIds.size - knownDurations.length)];

    // Anything already queued or running has to clear before this batch starts,
    // because the runtime drains one batch at a time.
    const backlogJobs = jobs.filter((job) => job.status === "queued" || job.status === "running");
    const backlog = backlogJobs.map((job) => durationOf(job.trackId) ?? average);

    if (selected.length === 0 && backlog.length === 0) return null;

    // Local runs never touch Slurm, so they wait for nothing.
    const queueWait =
      settings.runtime === "dcc" ? (waitSecByProfile[profile.id] ?? profile.medianWaitSec) : 0;
    const backlogSec = estimateSeconds(profile, backlog, batchSize, queueWait);
    const selectionSec = estimateSeconds(profile, selected, batchSize, queueWait);

    // Split into a value and its qualifier: the readout sets them differently,
    // and one packed sentence made the number impossible to scan.
    const where = settings.runtime === "dcc" ? null : "on this machine";
    if (selected.length === 0) {
      const inFlight = `${backlogJobs.length} in flight`;
      return {
        value: formatDuration(backlogSec),
        detail: where ? `${inFlight} ${where}` : inFlight,
      };
    }
    const queued = backlog.length > 0 ? `behind ${backlogJobs.length} already queued` : null;
    return {
      value: formatDuration(backlogSec + selectionSec),
      detail: [queued, where].filter(Boolean).join(" · ") || null,
    };
  }, [settings, selectedTrackIds, tracksById, jobs, waitSecByProfile]);

  const togglePreview = useCallback(
    (track: Track) => {
      if (playingTrackId === track.id) {
        audioRef.current?.pause();
        setPlayingTrackId(null);
        setPreviewLoading(false);
        return;
      }
      audioRef.current?.pause();
      const audio = new Audio(`/api/previews/${encodeURIComponent(track.id)}`);
      // `playing` fires when sound actually starts; until then the row shows a
      // spinner instead of a pause icon it can't honour yet.
      audio.onplaying = () => setPreviewLoading(false);
      audio.onended = () => setPlayingTrackId(null);
      audio.onerror = () => {
        setPlayingTrackId(null);
        setPreviewLoading(false);
        toast.error(`No preview found for "${track.title}".`);
      };
      audioRef.current = audio;
      void audio.play().catch(() => {
        setPlayingTrackId(null);
        setPreviewLoading(false);
      });
      setPlayingTrackId(track.id);
      setPreviewLoading(true);
    },
    [playingTrackId],
  );

  useEffect(() => () => audioRef.current?.pause(), []);

  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await response.json()) as { settings?: AppSettings; error?: string };
    if (!response.ok || !data.settings) {
      toast.error(data.error ?? "Could not save settings.");
      return;
    }
    setSettings(data.settings);
    toast.success("Settings saved.");
  }, []);

  const acknowledgeSpotdl = useCallback(async () => {
    await fetch("/api/settings/ack", { method: "POST" });
    setSpotdlAckAt(new Date().toISOString());
  }, []);

  const generate = useCallback(
    async (input: {
      generatorParams: GeneratorParams;
      modelVersion: ModelVersion;
      experimentalCompile: boolean;
    }) => {
      if (selectedTrackIds.size === 0) return;
      setBusy(true);
      try {
        const response = await fetch("/api/generation/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackIds: [...selectedTrackIds], ...input }),
        });
        const data = (await response.json()) as { jobs?: GenerationJob[]; error?: string };
        if (!response.ok) {
          toast.error(data.error ?? "Could not queue generation.");
          return;
        }
        toast.success(`Queued ${data.jobs?.length ?? 0} map(s).`);
        void loadJobs();
      } finally {
        setBusy(false);
      }
    },
    [selectedTrackIds, loadJobs],
  );

  const syncLibrary = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/library/spotify/import", { method: "POST" });
      toast.success("Import started.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Poll import progress while it runs.
  useEffect(() => {
    if (importStatus.status !== "running") return;
    const timer = setInterval(async () => {
      const response = await fetch("/api/library/spotify/import-status");
      const data = (await response.json()) as { status: SpotifyImportStatus };
      if (!data.status) return;
      setImportStatus(data.status);
      if (data.status.status !== "running") void loadTracks();
    }, 2000);
    return () => clearInterval(timer);
  }, [importStatus.status, loadTracks]);

  if (!spotifyConnected) {
    return <AuthShell bootstrapping={bootstrapping} />;
  }

  return (
    <div className="app">
      <div className="royb-band" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
      <header className="app__header">
        <ThemeToggle />
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginLeft: "auto" }}>
          <span className="muted">
            {tracksTotal === libraryTotal
              ? `${libraryTotal} tracks`
              : `${tracksTotal} of ${libraryTotal} tracks`}
          </span>
          <Button variant="ghost" onClick={syncLibrary} disabled={busy}>
            Sync liked songs
          </Button>
        </div>
      </header>

      {importStatus.status === "running" ? (
        <div className="banner">
          Importing your library… {importProgress(importStatus)}%
          {importStatus.importedCount ? ` (${importStatus.importedCount} tracks)` : ""}
        </div>
      ) : null}

      {!spotdlAckAt ? (
        <div className="banner" data-tone="error">
          Generation downloads song audio from public sources for personal use.{" "}
          <Button variant="ghost" onClick={acknowledgeSpotdl}>
            I understand
          </Button>
        </div>
      ) : null}

      <div className="workspace-grid">
        <main className="pane">
          <div className="pane__header pane__header--split">
            <h2 className="section__title">
              {scope === "spotify" ? "Spotify" : "Library"} — {selectedTrackIds.size} selected
            </h2>
            {selectionEstimate ? (
              <p className="estimate">
                <span className="estimate__label">Time to finish</span>
                <span className="estimate__value">{selectionEstimate.value}</span>
                {selectionEstimate.detail ? (
                  <span className="estimate__detail">{selectionEstimate.detail}</span>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="toolbar">
            <select
              className="ui-select toolbar__scope"
              aria-label="Search in"
              value={scope}
              onChange={(event) => {
                setScope(event.target.value as "library" | "spotify");
                setPage(1);
              }}
            >
              <option value="library">My library</option>
              <option value="spotify">All of Spotify</option>
            </select>
            <Input
              className="toolbar__search"
              placeholder={
                scope === "spotify" ? "Search every song on Spotify" : "Search title or artist"
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
            {/* Filtering and paging describe the imported library, so they
                disappear while searching the catalogue. */}
            {scope === "library" ? (
              <>
                <select
                  className="ui-select toolbar__scope"
                  aria-label="Show"
                  value={matchFilter}
                  onChange={(event) => {
                    setMatchFilter(event.target.value as MatchFilter);
                    setPage(1);
                  }}
                >
                  <option value="all">All tracks</option>
                  <option value="generated">Already generated</option>
                </select>
                <Button
                  variant="ghost"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </Button>
                <span className="muted">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
                <Button variant="ghost" onClick={selectVisible}>
                  Select page
                </Button>
                <Button variant="ghost" onClick={clearSelection}>
                  Clear
                </Button>
              </>
            ) : null}
          </div>

          {/* The marquee lives on the scroll container so drag coordinates and
              scroll offsets share one coordinate space. Search mode is
              click-to-pick; drags there would fight the pick action. */}
          <div
            className="track-scroll"
            ref={scrollRef}
            {...(scope === "library" ? marqueeHandlers : {})}
          >
            <LibraryPane
              tracks={visibleTracks}
              loading={scope === "spotify" ? searching || adding : tracksLoading}
              selectedTrackIds={selectedTrackIds}
              completedTrackIds={completedTrackIds}
              playingTrackId={playingTrackId}
              previewLoading={previewLoading}
              onToggleTrack={toggleTrack}
              onTogglePreview={togglePreview}
              onPickTrack={scope === "spotify" ? addFromSearch : undefined}
              emptyMessage={
                scope === "spotify"
                  ? debouncedQuery
                    ? "Nothing on Spotify matched that."
                    : "Type to search Spotify."
                  : "No tracks match these filters."
              }
            />
            {selectionRect && (selectionRect.width > 5 || selectionRect.height > 5) ? (
              <div
                className="marquee"
                style={{
                  left: selectionRect.left,
                  top: selectionRect.top,
                  width: selectionRect.width,
                  height: selectionRect.height,
                }}
              />
            ) : null}
          </div>
        </main>

        <aside className="pane">
          <div className="pane__body">
            {settings && settings.setupCompletedAt ? (
              <GenerationPanel
                key={settings.setupCompletedAt ?? "initial"}
                settings={settings}
                selectedCount={selectedTrackIds.size}
                busy={busy}
                onGenerate={generate}
              />
            ) : null}
            <section className="section">
              <h2 className="section__title">Jobs</h2>
              <JobsPane
                jobs={jobs}
                tracksById={tracksById}
                onRetry={async (jobId) => {
                  await fetch(`/api/generation/jobs/${jobId}`, { method: "POST" });
                  void loadJobs();
                }}
                onCancel={async (jobId) => {
                  await fetch(`/api/generation/jobs/${jobId}`, { method: "DELETE" });
                  void loadJobs();
                }}
                onClearHistory={async () => {
                  await fetch("/api/generation/jobs", { method: "DELETE" });
                  void loadJobs();
                }}
              />
            </section>
            {settings ? (
              <details className="advanced" open={!settings.setupCompletedAt}>
                <summary>Settings</summary>
                <div className="advanced__body">
                  <SettingsPanel
                    settings={settings}
                    onSave={saveSettings}
                    firstRun={!settings.setupCompletedAt}
                  />
                </div>
              </details>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
