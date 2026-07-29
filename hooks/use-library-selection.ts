import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Track } from "@/lib/types";

/**
 * Click, shift-range and marquee-drag selection for the library list.
 * Resurrected from the pre-simplification implementation (7aa3262), adapted to
 * Set-based state and to take the *rendered* track array — shift-ranges walk
 * whatever the user actually sees, never a stale or parallel list.
 */

export type SelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type MarqueeSession = {
  pointerId: number;
  originX: number;
  originY: number;
  moved: boolean;
  clickedTrackId: string | null;
  shiftClick: boolean;
  additive: boolean;
  baseSelected: Set<string>;
};

type UseLibrarySelectionParams = {
  /** The tracks currently rendered, in render order. */
  tracks: Track[];
  scrollRef: RefObject<HTMLDivElement | null>;
};

export type MarqueeHandlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

type UseLibrarySelectionResult = {
  selectedTrackIds: Set<string>;
  setSelectedTrackIds: Dispatch<SetStateAction<Set<string>>>;
  selectionRect: SelectionRect | null;
  toggleTrack: (trackId: string, shiftKey: boolean) => void;
  selectVisible: () => void;
  clearSelection: () => void;
  marqueeHandlers: MarqueeHandlers;
};

function rectFromPoints(x1: number, y1: number, x2: number, y2: number): SelectionRect {
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function intersectsRect(a: SelectionRect, b: SelectionRect) {
  return (
    a.left <= b.left + b.width &&
    a.left + a.width >= b.left &&
    a.top <= b.top + b.height &&
    a.top + a.height >= b.top
  );
}

/** Pointer position in the scroll container's content space. */
function eventToPoint(event: ReactPointerEvent<HTMLDivElement>, root: HTMLDivElement | null) {
  if (!root) return null;
  const rootRect = root.getBoundingClientRect();
  return {
    x: event.clientX - rootRect.left + root.scrollLeft,
    y: event.clientY - rootRect.top + root.scrollTop,
  };
}

function idsInRect(rect: SelectionRect, root: HTMLDivElement | null): Set<string> {
  const next = new Set<string>();
  if (!root) return next;
  const rootRect = root.getBoundingClientRect();
  root.querySelectorAll<HTMLElement>("[data-track-id]").forEach((row) => {
    const trackId = row.dataset.trackId;
    if (!trackId) return;
    const rowRect = row.getBoundingClientRect();
    const bounds: SelectionRect = {
      left: rowRect.left - rootRect.left + root.scrollLeft,
      top: rowRect.top - rootRect.top + root.scrollTop,
      width: rowRect.width,
      height: rowRect.height,
    };
    if (intersectsRect(rect, bounds)) next.add(trackId);
  });
  return next;
}

function isEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.isContentEditable
  );
}

export function useLibrarySelection({
  tracks,
  scrollRef,
}: UseLibrarySelectionParams): UseLibrarySelectionResult {
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const sessionRef = useRef<MarqueeSession | null>(null);
  const anchorRef = useRef<string | null>(null);

  const clearSelection = useCallback(() => {
    anchorRef.current = null;
    setSelectedTrackIds(new Set());
  }, []);

  const toggleTrack = useCallback(
    (trackId: string, shiftKey: boolean) => {
      if (shiftKey && anchorRef.current) {
        const anchorIndex = tracks.findIndex((track) => track.id === anchorRef.current);
        const targetIndex = tracks.findIndex((track) => track.id === trackId);
        if (anchorIndex >= 0 && targetIndex >= 0) {
          const start = Math.min(anchorIndex, targetIndex);
          const end = Math.max(anchorIndex, targetIndex);
          setSelectedTrackIds((previous) => {
            const next = new Set(previous);
            for (const track of tracks.slice(start, end + 1)) next.add(track.id);
            return next;
          });
          anchorRef.current = trackId;
          return;
        }
      }
      anchorRef.current = trackId;
      setSelectedTrackIds((previous) => {
        const next = new Set(previous);
        if (next.has(trackId)) next.delete(trackId);
        else next.add(trackId);
        return next;
      });
    },
    [tracks],
  );

  const selectVisible = useCallback(() => {
    setSelectedTrackIds((previous) => {
      const next = new Set(previous);
      for (const track of tracks) next.add(track.id);
      return next;
    });
  }, [tracks]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const point = eventToPoint(event, scrollRef.current);
      if (!point) return;

      // Drags that start on interactive elements are theirs, not the marquee's.
      const target = event.target as HTMLElement;
      if (target.closest("input,button,a,select,textarea,label,[data-no-marquee='true']")) return;

      const clickedRow = target.closest<HTMLElement>("[data-track-id]");
      sessionRef.current = {
        pointerId: event.pointerId,
        originX: point.x,
        originY: point.y,
        moved: false,
        clickedTrackId: clickedRow?.dataset.trackId ?? null,
        shiftClick: event.shiftKey,
        additive: event.shiftKey,
        baseSelected: event.shiftKey ? new Set(selectedTrackIds) : new Set(),
      };
      setSelectionRect({ left: point.x, top: point.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [scrollRef, selectedTrackIds],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = sessionRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const point = eventToPoint(event, scrollRef.current);
      if (!point) return;

      const rect = rectFromPoints(active.originX, active.originY, point.x, point.y);
      // Below 5px of travel this is still a click; past it, a marquee.
      if (!active.moved && (rect.width > 5 || rect.height > 5)) active.moved = true;
      setSelectionRect(rect);
      if (active.moved) {
        const rectIds = idsInRect(rect, scrollRef.current);
        setSelectedTrackIds(
          active.additive ? new Set([...active.baseSelected, ...rectIds]) : rectIds,
        );
      }
      event.preventDefault();
    },
    [scrollRef],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = sessionRef.current;
      if (!active || active.pointerId !== event.pointerId) return;

      // A stationary press-and-release on a row is a click, not a zero-size drag.
      if (!active.moved && active.clickedTrackId) {
        toggleTrack(active.clickedTrackId, active.shiftClick);
      }

      sessionRef.current = null;
      setSelectionRect(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
    },
    [toggleTrack],
  );

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const active = sessionRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    sessionRef.current = null;
    setSelectionRect(null);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (isEditableElement(document.activeElement)) return;
      sessionRef.current = null;
      setSelectionRect(null);
      clearSelection();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection]);

  return {
    selectedTrackIds,
    setSelectedTrackIds,
    selectionRect,
    toggleTrack,
    selectVisible,
    clearSelection,
    marqueeHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
