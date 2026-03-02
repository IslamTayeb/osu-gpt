import Image from "next/image";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { librarySkeletonItems, msToClock } from "@/lib/homeUi";
import type { Track } from "@/lib/types";

type SelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type LibraryPaneProps = {
  visibleStart: number;
  visibleEnd: number;
  tracksTotal: number;
  selectedCount: number;
  tracksLoading: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  showLibrarySkeleton: boolean;
  tracks: Track[];
  selectedTrackSet: Set<string>;
  completedTrackIdSet: Set<string>;
  onToggleTrack: (trackId: string) => void;
  selectionRect: SelectionRect | null;
};

export function LibraryPane(props: LibraryPaneProps) {
  const {
    visibleStart,
    visibleEnd,
    tracksTotal,
    selectedCount,
    tracksLoading,
    scrollRef,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    showLibrarySkeleton,
    tracks,
    selectedTrackSet,
    completedTrackIdSet,
    onToggleTrack,
    selectionRect,
  } = props;

  return (
    <Card className="pane pane--library">
      <div className="pane-head">
        <h2 className="pane-title">Library Grid</h2>
        <div className="row-wrap">
          <Badge variant="neutral">
            {visibleStart}-{visibleEnd} / {tracksTotal}
          </Badge>
          <Badge variant="info">{selectedCount} selected</Badge>
          {tracksLoading ? <Badge variant="warning">Loading...</Badge> : null}
        </div>
      </div>
      <div className="pane-body pane-body--fill">
        <ScrollArea
          ref={scrollRef}
          className="ui-scroll-area library-scroll"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
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
                            onChange={() => onToggleTrack(track.id)}
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
              {tracks.length === 0 ? (
                <p className="tiny muted">No tracks on this page. Adjust filters or import again.</p>
              ) : null}
            </>
          )}
        </ScrollArea>
      </div>
    </Card>
  );
}
