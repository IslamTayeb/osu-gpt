import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import { getAwsRuntimeSessionFromRequest } from "@/lib/awsSession";
import { downloadS3Artifact } from "@/lib/awsRuntime";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; artifactId: string }> },
) {
  const { id, artifactId } = await context.params;
  const job = readStore().jobs.find((j) => j.id === id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const artifact = job.artifacts.find((a) => a.id === artifactId);
  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  if (new Date(artifact.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: "Artifact expired" }, { status: 410 });
  }

  if (artifact.storage === "s3") {
    const awsSession = getAwsRuntimeSessionFromRequest(request);
    if (!awsSession) {
      return NextResponse.json(
        { error: "AWS runtime session is required to download hosted artifacts." },
        { status: 401 },
      );
    }
    if (!artifact.s3Bucket || !artifact.s3Key) {
      return NextResponse.json({ error: "Hosted artifact is missing S3 coordinates." }, { status: 500 });
    }
    try {
      const fetched = await downloadS3Artifact(awsSession, artifact.s3Bucket, artifact.s3Key);
      return new NextResponse(new Uint8Array(fetched.content), {
        status: 200,
        headers: {
          "Content-Type": fetched.contentType,
          "Content-Disposition": `attachment; filename=\"${artifact.fileName || fetched.fileName}\"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Could not download hosted artifact." },
        { status: 500 },
      );
    }
  }

  if (!artifact.relativePath) {
    return NextResponse.json({ error: "Artifact path missing" }, { status: 500 });
  }
  const fullPath = path.resolve(process.cwd(), artifact.relativePath);
  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Artifact file missing" }, { status: 404 });
  }

  const file = fs.readFileSync(fullPath);
  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename=\"${artifact.fileName}\"`,
    },
  });
}
