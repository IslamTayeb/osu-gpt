import { NextResponse } from "next/server";
import { getSpotifySession } from "@/lib/spotifySession";
import { readStore } from "@/lib/store";
import { AWS_RUNTIME_COOKIE, decodeAwsRuntimeSession, maskAwsRuntimeSession } from "@/lib/awsSession";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  const spotify = await getSpotifySession();
  const cookieStore = await cookies();
  const awsSession = decodeAwsRuntimeSession(cookieStore.get(AWS_RUNTIME_COOKIE)?.value);
  const store = readStore();
  const spotifyConnected = Boolean(spotify?.accessToken);
  const importStatus = store.settings.spotifyImport ?? { status: "idle" as const };

  return NextResponse.json({
    spotifyConnected,
    spotdlAcknowledgedAt: store.settings.spotdlAcknowledgedAt ?? null,
    providers: {
      spotify: { connected: spotifyConnected, available: true },
      apple: { connected: false, available: false, comingSoon: true },
    },
    runtime: {
      hostedAws: awsSession ? maskAwsRuntimeSession(awsSession) : { configured: false },
    },
    trackCount: store.tracks.length,
    importStatus,
  });
}
