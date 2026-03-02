import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { importProgress } from "@/lib/homeUi";
import type { SpotifyImportStatus } from "@/lib/types";

type MatchFilter = "all" | "matched" | "unmatched" | "generated";
type ProviderFilter = "all" | "spotify" | "apple";
type SourceFilter = "all" | "liked" | "playlist" | "library";

type FiltersPaneProps = {
  query: string;
  onQueryChange: (value: string) => void;
  providerFilter: ProviderFilter;
  onProviderFilterChange: (next: ProviderFilter) => void;
  sourceFilter: SourceFilter;
  onSourceFilterChange: (next: SourceFilter) => void;
  matchFilter: MatchFilter;
  onMatchFilterChange: (next: MatchFilter) => void;
  pageSize: number;
  onPageSizeChange: (next: number) => void;
  page: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  visibleStart: number;
  visibleEnd: number;
  tracksTotal: number;
  onSelectPageTracks: () => void;
  onClearSelection: () => void;
  pageTracksCount: number;
  importStatus: SpotifyImportStatus;
};

export function FiltersPane(props: FiltersPaneProps) {
  const {
    query,
    onQueryChange,
    providerFilter,
    onProviderFilterChange,
    sourceFilter,
    onSourceFilterChange,
    matchFilter,
    onMatchFilterChange,
    pageSize,
    onPageSizeChange,
    page,
    totalPages,
    onPrevPage,
    onNextPage,
    visibleStart,
    visibleEnd,
    tracksTotal,
    onSelectPageTracks,
    onClearSelection,
    pageTracksCount,
    importStatus,
  } = props;

  return (
    <Card className="pane pane--compact">
      <CardHeader>
        <CardTitle>Filters</CardTitle>
        <CardDescription>
          Server-backed filtering and pagination for large liked-song libraries.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="section-block">
          <span className="section-label">Search</span>
          <div className="row-wrap">
            <Search size={14} className="muted" />
            <Input
              placeholder="title / artist / album / source"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </div>
        </div>

        <div className="section-block">
          <span className="section-label">Provider</span>
          <Select
            value={providerFilter}
            onChange={(event) => onProviderFilterChange(event.target.value as ProviderFilter)}
          >
            <option value="all">All providers</option>
            <option value="spotify">Spotify</option>
            <option value="apple" disabled>
              Apple Music (coming soon)
            </option>
          </Select>
        </div>

        <div className="section-block">
          <span className="section-label">Source</span>
          <Select
            value={sourceFilter}
            onChange={(event) => onSourceFilterChange(event.target.value as SourceFilter)}
          >
            <option value="all">All sources</option>
            <option value="liked">Liked songs</option>
          </Select>
        </div>

        <div className="section-block">
          <span className="section-label">Status</span>
          <Select
            value={matchFilter}
            onChange={(event) => onMatchFilterChange(event.target.value as MatchFilter)}
          >
            <option value="all">All tracks</option>
            <option value="matched">Matched</option>
            <option value="unmatched">Unmatched</option>
            <option value="generated">Generated</option>
          </Select>
        </div>

        <div className="section-block">
          <span className="section-label">Pagination</span>
          <Select
            value={String(pageSize)}
            onChange={(event) => onPageSizeChange(Math.max(20, Number(event.target.value || 60)))}
          >
            <option value="30">30 / page</option>
            <option value="60">60 / page</option>
            <option value="100">100 / page</option>
            <option value="150">150 / page</option>
          </Select>
          <div className="row-wrap">
            <Button variant="secondary" size="sm" onClick={onPrevPage} disabled={page <= 1}>
              <ChevronLeft size={14} />
              Prev
            </Button>
            <Badge variant="neutral">
              Page {page} / {totalPages}
            </Badge>
            <Button variant="secondary" size="sm" onClick={onNextPage} disabled={page >= totalPages}>
              Next
              <ChevronRight size={14} />
            </Button>
          </div>
          <p className="tiny muted">
            Showing {visibleStart}-{visibleEnd} of {tracksTotal} filtered tracks
          </p>
        </div>

        <div className="divider" />

        <div className="section-block">
          <span className="section-label">Selection</span>
          <div className="row-wrap">
            <Button variant="secondary" size="sm" onClick={onSelectPageTracks}>
              Add page ({pageTracksCount})
            </Button>
            <Button variant="ghost" size="sm" onClick={onClearSelection}>
              Clear
            </Button>
          </div>
        </div>

        <div className="divider" />

        <div className="section-block">
          <div className="row">
            <span className="section-label">Import Status</span>
            <Badge variant={importStatus.status === "failed" ? "danger" : "neutral"}>
              {importStatus.status}
            </Badge>
          </div>
          <Progress value={importProgress(importStatus)} />
          <p className="tiny muted">
            {importStatus.message ?? "Ready"}{" "}
            {importStatus.importedCount ? `(${importStatus.importedCount} processed)` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
