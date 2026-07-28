import { NextResponse } from "next/server";
import { getSpotifySession } from "@/lib/spotifySession";
import { readStore } from "@/lib/store";
import { decodeOsuRuntimeSession, maskOsuRuntimeSession, OSU_RUNTIME_COOKIE } from "@/lib/osuSession";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  const spotify = await getSpotifySession();
  const cookieStore = await cookies();
  const osuSession = decodeOsuRuntimeSession(cookieStore.get(OSU_RUNTIME_COOKIE)?.value);
  const envOsuClientId = process.env.OSU_CLIENT_ID?.trim() ?? "";
  const envOsuClientSecret = process.env.OSU_CLIENT_SECRET?.trim() ?? "";
  const envOsuConfigured = Boolean(envOsuClientId && envOsuClientSecret);
  const store = readStore();
  const spotifyConnected = Boolean(spotify?.accessToken);
  const importStatus = store.settings.spotifyImport ?? { status: "idle" as const };
  const maskedEnvClientIdHint = envOsuClientId.length > 2 ? `${envOsuClientId.slice(0, 2)}****` : "****";

  return NextResponse.json({
    spotifyConnected,
    spotdlAcknowledgedAt: store.settings.spotdlAcknowledgedAt ?? null,
    runtime: {
      osu: osuSession
        ? { ...maskOsuRuntimeSession(osuSession), source: "session" as const }
        : envOsuConfigured
          ? { configured: true, clientIdHint: maskedEnvClientIdHint, source: "env" as const }
          : { configured: false },
    },
    trackCount: store.tracks.length,
    importStatus,
  });
}
