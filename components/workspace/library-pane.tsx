"use client";

import Image from "next/image";
import { Pause, Play } from "lucide-react";
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
  onToggleTrack: (trackId: string, shiftKey: boolean) => void;
  onTogglePreview: (track: Track) => void;
};

export function LibraryPane({
  tracks,
  matches,
  loading,
  selectedTrackIds,
  completedTrackIds,
  playingTrackId,
  onToggleTrack,
  onTogglePreview,
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
        <p className="muted">No tracks match these filters.</p>
      </div>
    );
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {tracks.map((track) => {
        const selected = selectedTrackIds.has(track.id);
        const playing = playingTrackId === track.id;
        return (
          <li
            key={track.id}
            className="track"
            data-selected={selected}
            onClick={(event) => onToggleTrack(track.id, event.shiftKey)}
          >
            <button
              type="button"
              className="play-button"
              data-playing={playing}
              aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePreview(track);
              }}
            >
              {playing ? <Pause size={12} /> : <Play size={12} />}
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
