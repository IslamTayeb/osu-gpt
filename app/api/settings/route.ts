import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { readStore, updateStore } from "@/lib/store";
import { AppSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ settings: readStore().settings });
}

const WRITABLE_KEYS: (keyof AppSettings)[] = [
  "runtime",
  "gpuProfile",
  "openInOsu",
  "audioCacheDir",
  "exportDir",
  "loudnormEnabled",
  "loudnormTargetLufs",
  "modelVersion",
  "experimentalCompile",
  "generationDefaults",
  "setupCompletedAt",
];

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as Partial<AppSettings>;

  // A bad export folder should be reported now, not when a job finishes.
  if (body.exportDir) {
    try {
      fs.mkdirSync(body.exportDir, { recursive: true });
      fs.accessSync(body.exportDir, fs.constants.W_OK);
    } catch {
      return NextResponse.json(
        { error: `Cannot write to export folder: ${body.exportDir}` },
        { status: 400 },
      );
    }
  }

  const settings = updateStore((store) => {
    for (const key of WRITABLE_KEYS) {
      if (key in body) {
        (store.settings as Record<string, unknown>)[key] = body[key];
      }
    }
  }).settings;

  return NextResponse.json({ settings });
}
