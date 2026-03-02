import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { MatchResult, Track } from "@/lib/types";
import { readStore } from "@/lib/store";
import { getAwsRuntimeSessionFromRequest } from "@/lib/awsSession";
import { downloadS3Artifact } from "@/lib/awsRuntime";

export const runtime = "nodejs";

type ExportRequest = {
  trackIds?: string[];
};

type ManifestRow = {
  trackId: string;
  title: string;
  artists: string;
  album: string;
  provider: string;
  source: string;
  matchStatus: string;
  beatmapsetId: string;
  osuUrl: string;
  confidence: string;
  rationale: string;
  generationJobId: string;
  artifactFiles: string;
};

function sanitizePath(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function escapeCsvCell(value: string) {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

function toCsv(rows: ManifestRow[]) {
  const headers = [
    "trackId",
    "title",
    "artists",
    "album",
    "provider",
    "source",
    "matchStatus",
    "beatmapsetId",
    "osuUrl",
    "confidence",
    "rationale",
    "generationJobId",
    "artifactFiles",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.trackId,
        row.title,
        row.artists,
        row.album,
        row.provider,
        row.source,
        row.matchStatus,
        row.beatmapsetId,
        row.osuUrl,
        row.confidence,
        row.rationale,
        row.generationJobId,
        row.artifactFiles,
      ]
        .map((value) => escapeCsvCell(value))
        .join(","),
    );
  }
  return lines.join("\n");
}

function preferredMatch(matches: MatchResult[] | undefined) {
  if (!matches || matches.length === 0) {
    return null;
  }
  return matches[0];
}

function normalizeTrackIds(body: ExportRequest) {
  return Array.from(
    new Set(
      (Array.isArray(body.trackIds) ? body.trackIds : []).map((trackId) => trackId.trim()).filter(Boolean),
    ),
  );
}

function createManifestRow(
  track: Track,
  match: MatchResult | null,
  generationJobId: string,
  artifactFiles: string[],
) {
  return {
    trackId: track.id,
    title: track.title,
    artists: track.artists.join(", "),
    album: track.album,
    provider: track.provider,
    source: track.sourceLabel,
    matchStatus: match ? match.status : "none",
    beatmapsetId: match ? String(match.beatmapsetId) : "",
    osuUrl: match ? match.url : "",
    confidence: match ? match.confidence.toFixed(3) : "",
    rationale: match ? match.rationale : "",
    generationJobId,
    artifactFiles: artifactFiles.join("; "),
  };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ExportRequest;
  const trackIds = normalizeTrackIds(body);
  const awsSession = getAwsRuntimeSessionFromRequest(request);

  if (trackIds.length === 0) {
    return NextResponse.json({ error: "trackIds[] is required" }, { status: 400 });
  }

  const store = readStore();
  const tracksById = new Map(store.tracks.map((track) => [track.id, track]));
  const missingTrackIds = trackIds.filter((trackId) => !tracksById.has(trackId));
  if (missingTrackIds.length > 0) {
    return NextResponse.json({ error: `Track(s) not found: ${missingTrackIds.join(", ")}` }, { status: 404 });
  }

  const zip = new JSZip();
  const rows: ManifestRow[] = [];

  for (const trackId of trackIds) {
    const track = tracksById.get(trackId);
    if (!track) {
      continue;
    }

    const jobs = store.jobs.filter((job) => job.trackId === trackId && job.status === "completed");
    const sortedJobs = jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const addedFiles: string[] = [];
    for (const job of sortedJobs) {
      for (const artifact of job.artifacts) {
        if (new Date(artifact.expiresAt).getTime() < Date.now()) {
          continue;
        }

        const folder = sanitizePath(`${track.artists.join("_")}_${track.title}_${track.id.slice(0, 8)}`);
        const targetName = `generated/${folder}/${job.id.slice(0, 8)}_${sanitizePath(artifact.fileName)}`;

        if (artifact.storage === "s3") {
          if (!awsSession || !artifact.s3Bucket || !artifact.s3Key) {
            continue;
          }
          try {
            const fetched = await downloadS3Artifact(awsSession, artifact.s3Bucket, artifact.s3Key);
            zip.file(targetName, fetched.content);
            addedFiles.push(targetName);
          } catch {
            continue;
          }
        } else {
          if (!artifact.relativePath) {
            continue;
          }
          const fullPath = path.resolve(process.cwd(), artifact.relativePath);
          if (!fs.existsSync(fullPath)) {
            continue;
          }
          const content = fs.readFileSync(fullPath);
          zip.file(targetName, content);
          addedFiles.push(targetName);
        }
      }
    }

    const snapshot = store.matchesByTrackId[trackId];
    const match = preferredMatch(snapshot?.matches);
    const latestJob = sortedJobs[0];
    rows.push(createManifestRow(track, match, latestJob?.id ?? "", addedFiles));
  }

  zip.file("manifest/matches.json", JSON.stringify(rows, null, 2));
  zip.file("manifest/matches.csv", toCsv(rows));
  zip.file(
    "manifest/README.txt",
    [
      "This archive includes generated osu artifacts and match metadata.",
      "Existing ranked/loved maps are linked in manifest files and are not redistributed here.",
    ].join("\n"),
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const zipBytes = new Uint8Array(buffer);

  const filename = `osu-gpt-export-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  return new NextResponse(zipBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
