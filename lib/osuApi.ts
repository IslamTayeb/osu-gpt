type OsuOauthTokenResponse = {
  token_type: string;
  expires_in: number;
  access_token: string;
};

export type OsuAuthCredentials = {
  clientId: string;
  clientSecret: string;
};

type OsuSearchResponse = {
  beatmapsets?: Array<{
    id: number;
    title: string;
    artist: string;
    status: string;
    creator?: string;
  }>;
  search?: {
    query?: string;
    sort?: string;
  };
};

const tokenCache = new Map<string, { value: string; expiresAt: number }>();

function envClientId() {
  return process.env.OSU_CLIENT_ID?.trim() ?? "";
}

function envClientSecret() {
  return process.env.OSU_CLIENT_SECRET?.trim() ?? "";
}

function envLegacyApiKey() {
  return process.env.OSU_API_KEY?.trim() ?? "";
}

function resolveCredentials(override?: OsuAuthCredentials | null) {
  const clientId = (override?.clientId ?? envClientId()).trim();
  const clientSecret = (override?.clientSecret ?? envClientSecret()).trim();
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

async function getOauthToken(credentials: OsuAuthCredentials) {
  const cacheKey = `${credentials.clientId}:${credentials.clientSecret}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 10_000) {
    return cached.value;
  }

  const response = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Number(credentials.clientId),
      client_secret: credentials.clientSecret,
      grant_type: "client_credentials",
      scope: "public",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`osu OAuth token request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as OsuOauthTokenResponse;
  if (!data.access_token) {
    throw new Error("osu OAuth token response missing access_token");
  }
  tokenCache.set(cacheKey, {
    value: data.access_token,
    expiresAt: Date.now() + Math.max(60, data.expires_in - 30) * 1000,
  });
  return data.access_token;
}

async function searchViaOauth(query: string, credentials: OsuAuthCredentials) {
  const token = await getOauthToken(credentials);
  const url = `https://osu.ppy.sh/api/v2/beatmapsets/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`osu OAuth search failed (${response.status}): ${body}`);
  }
  const data = (await response.json()) as OsuSearchResponse;
  return data.beatmapsets ?? [];
}

async function searchViaPublicEndpoint(query: string) {
  const url = `https://osu.ppy.sh/beatmapsets/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`osu public search failed (${response.status})`);
  }
  const data = (await response.json()) as OsuSearchResponse;
  const appliedQuery = (data.search?.query ?? "").trim().toLowerCase();
  if (!appliedQuery) {
    // Public endpoint appears to ignore query params without auth; fail fast so caller can surface clear setup guidance.
    throw new Error(
      "osu search query was ignored by the public endpoint. Configure OSU_CLIENT_ID and OSU_CLIENT_SECRET (or save them in the app) for reliable matching.",
    );
  }
  return data.beatmapsets ?? [];
}

export async function searchOsuBeatmapsets(query: string, overrideCredentials?: OsuAuthCredentials | null) {
  const credentials = resolveCredentials(overrideCredentials);
  if (credentials) {
    return searchViaOauth(query, credentials);
  }
  try {
    return await searchViaPublicEndpoint(query);
  } catch (error) {
    const legacyKeyConfigured = Boolean(envLegacyApiKey());
    const message = error instanceof Error ? error.message : "osu search failed";
    if (legacyKeyConfigured && message.includes("ignored by the public endpoint")) {
      throw new Error(
        "OSU_API_KEY is a legacy key and cannot drive modern beatmapset search. Configure OSU_CLIENT_ID and OSU_CLIENT_SECRET (or save them in-app) for reliable matching.",
      );
    }
    throw error;
  }
}
