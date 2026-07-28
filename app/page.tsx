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
import { importProgress } from "@/lib/homeUi";
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

type MatchFilter = "all" | "matched" | "unmatched" | "generated";

export default function Home() {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [spotdlAckAt, setSpotdlAckAt] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksTotal, setTracksTotal] = useState(0);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [matchFilter, setMatchFilter] = useState<MatchFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const lastClickedRef = useRef<string | null>(null);

  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [importStatus, setImportStatus] = useState<SpotifyImportStatus>({ status: "idle" });

  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [showSettings, setShowSettings] = useState(false);

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
        setShowSettings(!loaded.setupCompletedAt);
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
      const data = (await response.json()) as { tracks: Track[]; total: number };
      setTracks(data.tracks ?? []);
      setTracksTotal(data.total ?? 0);
    } catch {
      toast.error("Could not load your library.");
    } finally {
      setTracksLoading(false);
    }
  }, [spotifyConnected, page, matchFilter, debouncedQuery]);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

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

  const toggleTrack = useCallback(
    (trackId: string, shiftKey: boolean) => {
      setSelectedTrackIds((previous) => {
        const next = new Set(previous);
        if (shiftKey && lastClickedRef.current) {
          const start = tracks.findIndex((t) => t.id === lastClickedRef.current);
          const end = tracks.findIndex((t) => t.id === trackId);
          if (start >= 0 && end >= 0) {
            const [from, to] = start < end ? [start, end] : [end, start];
            for (let index = from; index <= to; index += 1) next.add(tracks[index].id);
            return next;
          }
        }
        if (next.has(trackId)) next.delete(trackId);
        else next.add(trackId);
        return next;
      });
      lastClickedRef.current = trackId;
    },
    [tracks],
  );

  const togglePreview = useCallback(
    (track: Track) => {
      if (playingTrackId === track.id) {
        audioRef.current?.pause();
        setPlayingTrackId(null);
        return;
      }
      audioRef.current?.pause();
      const audio = new Audio(`/api/previews/${encodeURIComponent(track.id)}`);
      audio.onended = () => setPlayingTrackId(null);
      audio.onerror = () => {
        setPlayingTrackId(null);
        toast.error(`No preview found for "${track.title}".`);
      };
      audioRef.current = audio;
      void audio.play().catch(() => setPlayingTrackId(null));
      setPlayingTrackId(track.id);
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
    if (data.settings.setupCompletedAt) setShowSettings(false);
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
      const data = (await response.json()) as { importStatus: SpotifyImportStatus };
      setImportStatus(data.importStatus);
      if (data.importStatus.status !== "running") void loadTracks();
    }, 2000);
    return () => clearInterval(timer);
  }, [importStatus.status, loadTracks]);

  if (!spotifyConnected) {
    return <AuthShell bootstrapping={bootstrapping} />;
  }

  const totalPages = Math.max(1, Math.ceil(tracksTotal / pageSize));

  return (
    <div className="app">
      <div className="royb-band" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
      <header className="app__header">
        <h1 className="app__title">osu-gpt</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span className="muted">{tracksTotal} tracks</span>
          <Button variant="ghost" onClick={syncLibrary} disabled={busy}>
            Sync liked songs
          </Button>
          <Button variant="ghost" onClick={() => setShowSettings((value) => !value)}>
            Settings
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
        <aside className="pane">
          <div className="pane__body section">
            <h2 className="section__title">Filter</h2>
            <Input
              placeholder="Search title or artist"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
            <label className="field">
              <span className="field__label">Show</span>
              <select
                className="ui-select"
                value={matchFilter}
                onChange={(event) => {
                  setMatchFilter(event.target.value as MatchFilter);
                  setPage(1);
                }}
              >
                <option value="all">All tracks</option>
                <option value="unmatched">No existing map</option>
                <option value="matched">Has existing map</option>
                <option value="generated">Already generated</option>
              </select>
            </label>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
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
            </div>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <Button
                variant="ghost"
                onClick={() => setSelectedTrackIds(new Set(tracks.map((t) => t.id)))}
              >
                Select page
              </Button>
              <Button variant="ghost" onClick={() => setSelectedTrackIds(new Set())}>
                Clear
              </Button>
            </div>
          </div>
        </aside>

        <main className="pane">
          <div className="pane__header">
            <h2 className="section__title">Library — {selectedTrackIds.size} selected</h2>
          </div>
          <LibraryPane
            tracks={tracks}
            loading={tracksLoading}
            selectedTrackIds={selectedTrackIds}
            completedTrackIds={completedTrackIds}
            playingTrackId={playingTrackId}
            onToggleTrack={toggleTrack}
            onTogglePreview={togglePreview}
          />
        </main>

        <aside className="pane">
          <div className="pane__body">
            {settings && showSettings ? (
              <SettingsPanel
                settings={settings}
                onSave={saveSettings}
                firstRun={!settings.setupCompletedAt}
              />
            ) : null}
            {settings && !showSettings ? (
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
          </div>
        </aside>
      </div>
    </div>
  );
}
