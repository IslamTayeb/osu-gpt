import Link from "next/link";
import { AlertTriangle, Download, LoaderCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { matchMetaText } from "@/lib/homeUi";
import type { OsuSessionStatus, BatchMatchResponse } from "@/lib/homeTypes";
import type { GenerationJob, Track, TrackMatchSnapshot } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GenerationProfileSection } from "./generation-profile-section";
import type { GenerationProfileSectionProps } from "./types";

type ActionsPaneProps = {
  bootstrapping: boolean;
  jobsLoadedOnce: boolean;
  spotdlAckAt: string | null;
  busy: boolean;
  matching: boolean;
  onAcknowledgeSpotdl: () => Promise<void>;
  osuSessionStatus: OsuSessionStatus;
  osuClientId: string;
  onOsuClientIdChange: (value: string) => void;
  osuClientSecret: string;
  onOsuClientSecretChange: (value: string) => void;
  onSaveOsuRuntimeSession: () => Promise<void>;
  onClearOsuRuntimeSession: () => Promise<void>;
  onRunBatchMatch: () => Promise<void>;
  selectedTrackCount: number;
  lastMatchSummary: BatchMatchResponse["summary"] | null;
  generationProfileProps: GenerationProfileSectionProps;
  matchedSelected: Array<{ track: Track | undefined; snapshot: TrackMatchSnapshot | undefined }>;
  unmatchedTopHits: Array<{ track: Track | undefined; snapshot: TrackMatchSnapshot | undefined }>;
  jobs: GenerationJob[];
  jobsLoading: boolean;
  onDownloadZip: () => Promise<void>;
  error: string;
  notice: string;
};

export function ActionsPane({
  bootstrapping,
  jobsLoadedOnce,
  spotdlAckAt,
  busy,
  matching,
  onAcknowledgeSpotdl,
  osuSessionStatus,
  osuClientId,
  onOsuClientIdChange,
  osuClientSecret,
  onOsuClientSecretChange,
  onSaveOsuRuntimeSession,
  onClearOsuRuntimeSession,
  onRunBatchMatch,
  selectedTrackCount,
  lastMatchSummary,
  generationProfileProps,
  matchedSelected,
  unmatchedTopHits,
  jobs,
  jobsLoading,
  onDownloadZip,
  error,
  notice,
}: ActionsPaneProps) {
  return (
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
                <Button onClick={() => void onAcknowledgeSpotdl()} disabled={busy}>
                  I acknowledge audio rights
                </Button>
              </div>
            ) : (
              <p className="tiny muted">
                Downloader acknowledgment: {new Date(spotdlAckAt).toLocaleString()}
              </p>
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
                          <Link
                            href="https://osu.ppy.sh/home/account/edit#new-oauth-application"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Account Settings - OAuth Applications
                          </Link>
                          .
                        </p>
                        <p className="tiny muted">
                          3. Create an OAuth app, then copy Client ID and Client Secret.
                        </p>
                        <p className="tiny muted">
                          4. Paste them here and click <strong>Save osu API Session</strong>.
                        </p>
                      </div>
                    </details>
                    <Input
                      placeholder="osu OAuth Client ID"
                      value={osuClientId}
                      onChange={(event) => onOsuClientIdChange(event.target.value)}
                    />
                    <Input
                      placeholder="osu OAuth Client Secret"
                      type="password"
                      value={osuClientSecret}
                      onChange={(event) => onOsuClientSecretChange(event.target.value)}
                    />
                    <div className="row-wrap">
                      <Button
                        variant="secondary"
                        onClick={() => void onSaveOsuRuntimeSession()}
                        disabled={busy}
                      >
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
                        onChange={(event) => onOsuClientIdChange(event.target.value)}
                      />
                      <Input
                        placeholder="osu OAuth Client Secret"
                        type="password"
                        value={osuClientSecret}
                        onChange={(event) => onOsuClientSecretChange(event.target.value)}
                      />
                      <div className="row-wrap">
                        <Button
                          variant="secondary"
                          onClick={() => void onSaveOsuRuntimeSession()}
                          disabled={busy}
                        >
                          Save osu API Session
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => void onClearOsuRuntimeSession()}
                          disabled={busy}
                        >
                          Clear osu API Session
                        </Button>
                      </div>
                    </div>
                  </details>
                )}
              </div>
              <Button
                onClick={() => void onRunBatchMatch()}
                disabled={matching || busy || selectedTrackCount === 0}
              >
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

            <GenerationProfileSection {...generationProfileProps} />

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
                            <Badge variant={best.status === "ranked" ? "success" : "warning"}>
                              {best.status}
                            </Badge>
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
                            <Badge variant={topHit.status === "ranked" ? "success" : "warning"}>
                              {topHit.status}
                            </Badge>
                          </div>
                          <p className="tiny muted">
                            Suggested: {topHit.artist} - {topHit.title}
                          </p>
                          {matchMetaText(topHit) ? (
                            <p className="tiny muted">{matchMetaText(topHit)}</p>
                          ) : null}
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
                <Button onClick={() => void onDownloadZip()} disabled={busy || selectedTrackCount === 0}>
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
                      {job.logs.length > 0 ? (
                        <pre className="job-logs">{job.logs.slice(-8).join("\n")}</pre>
                      ) : null}
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
  );
}
