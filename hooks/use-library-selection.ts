import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Track } from "@/lib/types";

export type SelectionRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type LibraryMarqueeSession = {
  pointerId: number;
  originX: number;
  originY: number;
  moved: boolean;
  clickedTrackId: string | null;
  additive: boolean;
  baseSelectedIds: string[];
};

type UseLibrarySelectionParams = {
  tracks: Track[];
  libraryScrollRef: RefObject<HTMLDivElement | null>;
};

type UseLibrarySelectionResult = {
  selectedTrackIds: string[];
  setSelectedTrackIds: Dispatch<SetStateAction<string[]>>;
  selectedTrackSet: Set<string>;
  selectionRect: SelectionRect | null;
  toggleTrack: (trackId: string) => void;
  selectPageTracks: () => void;
  clearSelection: () => void;
  handleLibraryPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleLibraryPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleLibraryPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

function rectFromPoints(originX: number, originY: number, nextX: number, nextY: number): SelectionRect {
  const left = Math.min(originX, nextX);
  const top = Math.min(originY, nextY);
  const width = Math.abs(nextX - originX);
  const height = Math.abs(nextY - originY);
  return { left, top, width, height };
}

function intersectsRect(a: SelectionRect, b: SelectionRect) {
  return (
    a.left <= b.left + b.width &&
    a.left + a.width >= b.left &&
    a.top <= b.top + b.height &&
    a.top + a.height >= b.top
  );
}

function eventToLibraryPoint(event: ReactPointerEvent<HTMLDivElement>, root: HTMLDivElement | null) {
  if (!root) {
    return null;
  }
  const rootRect = root.getBoundingClientRect();
  return {
    x: event.clientX - rootRect.left + root.scrollLeft,
    y: event.clientY - rootRect.top + root.scrollTop,
  };
}

function selectedIdsFromRect(rect: SelectionRect, root: HTMLDivElement | null) {
  if (!root) {
    return [];
  }
  const rootRect = root.getBoundingClientRect();
  const next = new Set<string>();
  const cards = root.querySelectorAll<HTMLElement>("[data-track-id]");
  cards.forEach((card) => {
    const trackId = card.dataset.trackId;
    if (!trackId) {
      return;
    }
    const cardRect = card.getBoundingClientRect();
    const cardBounds: SelectionRect = {
      left: cardRect.left - rootRect.left + root.scrollLeft,
      top: cardRect.top - rootRect.top + root.scrollTop,
      width: cardRect.width,
      height: cardRect.height,
    };
    if (intersectsRect(rect, cardBounds)) {
      next.add(trackId);
    }
  });
  return Array.from(next);
}

function isEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.isContentEditable
  );
}

export function useLibrarySelection({
  tracks,
  libraryScrollRef,
}: UseLibrarySelectionParams): UseLibrarySelectionResult {
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const libraryMarqueeRef = useRef<LibraryMarqueeSession | null>(null);
  const selectionAnchorTrackIdRef = useRef<string | null>(null);

  const selectedTrackSet = useMemo(() => new Set(selectedTrackIds), [selectedTrackIds]);

  const toggleTrack = useCallback((trackId: string) => {
    selectionAnchorTrackIdRef.current = trackId;
    setSelectedTrackIds((previous) => {
      if (previous.includes(trackId)) {
        return previous.filter((id) => id !== trackId);
      }
      return [...previous, trackId];
    });
  }, []);

  const addRangeSelection = useCallback(
    (trackId: string) => {
      const targetIndex = tracks.findIndex((track) => track.id === trackId);
      if (targetIndex < 0) {
        toggleTrack(trackId);
        return;
      }

      const anchorTrackId = selectionAnchorTrackIdRef.current;
      const anchorIndex = anchorTrackId ? tracks.findIndex((track) => track.id === anchorTrackId) : -1;

      if (anchorIndex < 0) {
        selectionAnchorTrackIdRef.current = trackId;
        setSelectedTrackIds((previous) => {
          if (previous.includes(trackId)) {
            return previous;
          }
          return [...previous, trackId];
        });
        return;
      }

      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      const rangeIds = tracks.slice(start, end + 1).map((track) => track.id);
      selectionAnchorTrackIdRef.current = trackId;
      setSelectedTrackIds((previous) => Array.from(new Set([...previous, ...rangeIds])));
    },
    [toggleTrack, tracks],
  );

  const selectPageTracks = useCallback(() => {
    setSelectedTrackIds((previous) => {
      const next = new Set(previous);
      for (const track of tracks) {
        next.add(track.id);
      }
      return Array.from(next);
    });
  }, [tracks]);

  const clearSelection = useCallback(() => {
    selectionAnchorTrackIdRef.current = null;
    setSelectedTrackIds([]);
  }, []);

  const handleLibraryPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const point = eventToLibraryPoint(event, libraryScrollRef.current);
      if (!point) {
        return;
      }

      const target = event.target as HTMLElement;
      if (target.closest("input,button,a,select,textarea,label,[data-no-marquee='true']")) {
        return;
      }

      const clickedCard = target.closest<HTMLElement>("[data-track-id]");
      libraryMarqueeRef.current = {
        pointerId: event.pointerId,
        originX: point.x,
        originY: point.y,
        moved: false,
        clickedTrackId: clickedCard?.dataset.trackId ?? null,
        additive: event.shiftKey,
        baseSelectedIds: event.shiftKey ? selectedTrackIds : [],
      };
      setSelectionRect({ left: point.x, top: point.y, width: 0, height: 0 });
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [libraryScrollRef, selectedTrackIds],
  );

  const handleLibraryPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = libraryMarqueeRef.current;
      if (!active || active.pointerId !== event.pointerId) {
        return;
      }
      const point = eventToLibraryPoint(event, libraryScrollRef.current);
      if (!point) {
        return;
      }
      const rect = rectFromPoints(active.originX, active.originY, point.x, point.y);
      const moved = rect.width > 5 || rect.height > 5;
      if (!active.moved && moved) {
        active.moved = true;
      }
      setSelectionRect(rect);
      if (active.moved) {
        const rectIds = selectedIdsFromRect(rect, libraryScrollRef.current);
        if (active.additive) {
          setSelectedTrackIds(Array.from(new Set([...active.baseSelectedIds, ...rectIds])));
        } else {
          setSelectedTrackIds(rectIds);
        }
      }
      event.preventDefault();
    },
    [libraryScrollRef],
  );

  const handleLibraryPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = libraryMarqueeRef.current;
      if (!active || active.pointerId !== event.pointerId) {
        return;
      }

      if (!active.moved && active.clickedTrackId) {
        if (event.shiftKey) {
          addRangeSelection(active.clickedTrackId);
        } else {
          toggleTrack(active.clickedTrackId);
        }
      }

      libraryMarqueeRef.current = null;
      setSelectionRect(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
    },
    [addRangeSelection, toggleTrack],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (isEditableElement(document.activeElement)) {
        return;
      }
      libraryMarqueeRef.current = null;
      setSelectionRect(null);
      clearSelection();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection]);

  return {
    selectedTrackIds,
    setSelectedTrackIds,
    selectedTrackSet,
    selectionRect,
    toggleTrack,
    selectPageTracks,
    clearSelection,
    handleLibraryPointerDown,
    handleLibraryPointerMove,
    handleLibraryPointerEnd,
  };
}
