import fs from "node:fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAC_APP = "/Applications/osu!.app";

/**
 * Report how finished maps can reach osu!. lazer keeps beatmaps in a realm
 * database rather than a Songs folder, so there is no directory to point at —
 * opening the .osz is the import mechanism.
 */
export async function GET() {
  const installed = process.platform === "darwin" && fs.existsSync(MAC_APP);
  return NextResponse.json({
    installed,
    canOpenDirectly: installed,
    detail: installed
      ? "osu!lazer found — finished maps can be handed straight to it, no folder needed."
      : "osu! not found in /Applications. Set an export folder and import the .osz yourself.",
  });
}
