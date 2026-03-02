import Link from "next/link";
import { LoaderCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchMetaText } from "@/lib/homeUi";
import type { BatchMatchResponse, OsuSessionStatus } from "@/lib/homeTypes";
import type { MatchResult, Track } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ExactReviewItem = {
  track: Track;
  matches: MatchResult[];
  source: "exact" | "promoted";
  strongMatch: boolean;
};

export type NonExactReviewItem = {
  track: Track;
  topHit: MatchResult | null;
};

type MatchReviewPanelProps = {
  busy: boolean;
  matching: boolean;
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
  exactReviewItems: ExactReviewItem[];
  nonExactReviewItems: NonExactReviewItem[];
  approvedMatchesByTrackId: Record<string, MatchResult>;
  onApproveMatch: (trackId: string, match: MatchResult) => void;
  onClearApprovedMatch: (trackId: string) => void;
  onPromoteTopHit: (trackId: string) => void;
  onRemovePromotedTopHit: (trackId: string) => void;
};

export function MatchReviewPanel({
  busy,
  matching,
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
  exactReviewItems,
  nonExactReviewItems,
  approvedMatchesByTrackId,
  onApproveMatch,
  onClearApprovedMatch,
  onPromoteTopHit,
  onRemovePromotedTopHit,
}: MatchReviewPanelProps) {
  return (
    <div className="section-block">
      <span className="section-label">osu match review</span>
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
                <p className="tiny muted">3. Create an OAuth app, then copy Client ID and Client Secret.</p>
                <p className="tiny muted">4. Paste them here and click Save osu API Session.</p>
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
              <Button variant="secondary" onClick={() => void onSaveOsuRuntimeSession()} disabled={busy}>
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
                <Button variant="secondary" onClick={() => void onSaveOsuRuntimeSession()} disabled={busy}>
                  Save osu API Session
                </Button>
                <Button variant="ghost" onClick={() => void onClearOsuRuntimeSession()} disabled={busy}>
                  Clear osu API Session
                </Button>
              </div>
            </div>
          </details>
        )}
      </div>

      <Button onClick={() => void onRunBatchMatch()} disabled={matching || busy || selectedTrackCount === 0}>
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

      <div className="section-block">
        <span className="section-label">Exact + approved previews</span>
        {exactReviewItems.length === 0 ? (
          <p className="tiny muted">No exact or promoted candidates yet.</p>
        ) : (
          <div className="list">
            {exactReviewItems.map((item) => {
              const approvedMatch = approvedMatchesByTrackId[item.track.id];
              return (
                <details key={`${item.track.id}-${item.source}`} className="match-review-item">
                  <summary className="match-review-summary">
                    <span className="tiny">
                      {item.track.title} - {item.track.artists.join(", ")}
                    </span>
                    <div className="row-wrap">
                      <Badge variant={item.source === "promoted" ? "warning" : "success"}>
                        {item.source === "promoted" ? "Promoted" : "Exact"}
                      </Badge>
                      {item.strongMatch ? <Badge variant="info">Strong</Badge> : null}
                      {approvedMatch ? <Badge variant="success">Approved</Badge> : null}
                    </div>
                  </summary>
                  <div className="list">
                    {item.matches.map((candidate) => {
                      const approved =
                        approvedMatch && approvedMatch.beatmapsetId === candidate.beatmapsetId;
                      return (
                        <article
                          key={`${item.track.id}-${candidate.beatmapsetId}`}
                          className="job-card"
                        >
                          <div className="row">
                            <span className="tiny">
                              {candidate.artist} - {candidate.title}
                            </span>
                            <Badge variant={candidate.status === "ranked" ? "success" : "warning"}>
                              {candidate.status}
                            </Badge>
                          </div>
                          {matchMetaText(candidate) ? (
                            <p className="tiny muted">{matchMetaText(candidate)}</p>
                          ) : null}
                          <p className="tiny muted">{candidate.rationale}</p>
                          <div className="row-wrap">
                            <Button
                              size="sm"
                              onClick={() => onApproveMatch(item.track.id, candidate)}
                              disabled={busy}
                            >
                              {approved ? "Approved (skip generation)" : "Approve + skip generation"}
                            </Button>
                            {approved ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onClearApprovedMatch(item.track.id)}
                                disabled={busy}
                              >
                                Remove approval
                              </Button>
                            ) : null}
                            {item.source === "promoted" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onRemovePromotedTopHit(item.track.id)}
                                disabled={busy}
                              >
                                Move back to top hits
                              </Button>
                            ) : null}
                            <Link
                              href={candidate.url}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                            >
                              Open beatmapset
                            </Link>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>

      <div className="section-block">
        <span className="section-label">No exact match: top hits</span>
        {nonExactReviewItems.length === 0 ? (
          <p className="tiny muted">No non-exact suggestions yet.</p>
        ) : (
          <div className="list">
            {nonExactReviewItems.map((item) => (
              <details key={`${item.track.id}-non-exact`} className="match-review-item">
                <summary className="match-review-summary">
                  <span className="tiny">
                    {item.track.title} - {item.track.artists.join(", ")}
                  </span>
                  <Badge variant="warning">Top hit</Badge>
                </summary>
                {item.topHit ? (
                  <article className="job-card">
                    <div className="row">
                      <span className="tiny">
                        {item.topHit.artist} - {item.topHit.title}
                      </span>
                      <Badge variant={item.topHit.status === "ranked" ? "success" : "warning"}>
                        {item.topHit.status}
                      </Badge>
                    </div>
                    {matchMetaText(item.topHit) ? (
                      <p className="tiny muted">{matchMetaText(item.topHit)}</p>
                    ) : null}
                    <p className="tiny muted">{item.topHit.rationale}</p>
                    <div className="row-wrap">
                      <Button size="sm" onClick={() => onPromoteTopHit(item.track.id)} disabled={busy}>
                        Move to exact review
                      </Button>
                      <Link
                        href={item.topHit.url}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                      >
                        Open top hit
                      </Link>
                    </div>
                  </article>
                ) : (
                  <p className="tiny muted">No top hit was returned for this track.</p>
                )}
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
