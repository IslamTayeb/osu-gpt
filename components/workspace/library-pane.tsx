"use client";

import Image from "next/image";
import { Loader2, Pause, Play } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { msToClock } from "@/lib/homeUi";
import type { Track, TrackMatchSnapshot } from "@/lib/types";

type Props = {
  tracks: Track[];
  matches: Record<string, TrackMatchSnapshot>;
  loading: boolean;
  selectedTrackIds: Set<string>;
  completedTrackIds: Set<string>;
  playingTrackId: string | null;
  /** True while the playing track's audio is still buffering/resolving. */
  previewLoading?: boolean;
  onToggleTrack: (trackId: string, shiftKey: boolean) => void;
  onTogglePreview: (track: Track) => void;
  /** Set in Spotify-search mode: a click saves the result instead of selecting it. */
  onPickTrack?: (track: Track) => void;
  emptyMessage?: string;
};

export function LibraryPane({
  tracks,
  matches,
  loading,
  selectedTrackIds,
  completedTrackIds,
  playingTrackId,
  previewLoading = false,
  onToggleTrack,
  onTogglePreview,
  onPickTrack,
  emptyMessage = "No tracks match these filters.",
}: Props) {
  if (loading && tracks.length === 0) {
    return (
      <div className="pane__body section">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} style={{ height: "42px" }} />
        ))}
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="pane__body">
        <p className="muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul
      className="track-list"
      role={onPickTrack ? "list" : "listbox"}
      aria-multiselectable={onPickTrack ? undefined : true}
      aria-label={onPickTrack ? "Spotify results" : "Library tracks"}
    >
      {tracks.map((track) => {
        const selected = selectedTrackIds.has(track.id);
        const playing = playingTrackId === track.id;
        const buffering = playing && previewLoading;
        const activate = (shiftKey: boolean) =>
          onPickTrack ? onPickTrack(track) : onToggleTrack(track.id, shiftKey);
        return (
          <li
            key={track.id}
            className="track"
            data-track-id={track.id}
            data-selected={selected}
            // Rows are operable, so they take focus and announce their state.
            // Enter and Space are what a listbox option is expected to answer to.
            role={onPickTrack ? "button" : "option"}
            aria-selected={onPickTrack ? undefined : selected}
            tabIndex={0}
            title={onPickTrack ? "Add to library and select" : undefined}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              activate(event.shiftKey);
            }}
            // In library scope the marquee container owns mouse selection (its
            // stationary-click path toggles the row); a row onClick here too
            // would double-toggle. Pick mode has no marquee, so it keeps one.
            onClick={onPickTrack ? () => onPickTrack(track) : undefined}
          >
            <button
              type="button"
              className="play-button"
              data-playing={playing}
              data-loading={buffering}
              aria-label={
                buffering
                  ? `Loading ${track.title}`
                  : playing
                    ? `Pause ${track.title}`
                    : `Play ${track.title}`
              }
              onClick={(event) => {
                event.stopPropagation();
                onTogglePreview(track);
              }}
            >
              {buffering ? (
                <Loader2 size={12} className="spin" />
              ) : playing ? (
                <Pause size={12} />
              ) : (
                <Play size={12} />
              )}
            </button>
            {track.artworkUrl ? (
              <Image
                className="track__art"
                src={track.artworkUrl}
                alt=""
                width={34}
                height={34}
                unoptimized
              />
            ) : (
              <span className="track__art" style={{ background: "var(--surface)" }} />
            )}
            <span className="track__text">
              <p className="track__title">
                {track.title}
                {completedTrackIds.has(track.id) ? <span className="ui-badge"> generated</span> : null}
                {(matches[track.id]?.matches.length ?? 0) > 0 ? (
                  <a
                    className="ui-badge"
                    href={matches[track.id].topHit?.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {" "}
                    existing map
                  </a>
                ) : null}
              </p>
              <p className="track__artists">{track.artists.join(", ")}</p>
            </span>
            <span className="track__duration">{msToClock(track.durationMs)}</span>
          </li>
        );
      })}
    </ul>
  );
}
