# osu-gpt web MVP

Simple v1 implementation of:
- Spotify import (liked songs only)
- osu! map lookup (Ranked/Loved, title+artist substring match)
- Match-first flow with auto-generate fallback
- spotdl default downloader (with one-time acknowledgment)
- Mapperatorinator generation jobs (local + hosted AWS Batch)
- Artifact download with 7-day expiration metadata

## Run

```bash
cd web
npm install
npm run dev
```

Open `http://127.0.0.1:3000`.

## Required env (set in repo root `.env`)

```env
APP_SECRET=replace-with-long-random-string
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
```

## Optional env

```env
OSU_CLIENT_ID=...      # recommended for reliable osu matching (server-side)
OSU_CLIENT_SECRET=...  # recommended for reliable osu matching (server-side)
OSU_API_KEY=...        # legacy key, currently unused by matching
```

## API key setup (osu + AWS)

### osu API credentials

Current matching uses osu OAuth search for reliable query behavior.
The unauthenticated public endpoint currently ignores search query terms in this environment.
You can either:
- set `OSU_CLIENT_ID` + `OSU_CLIENT_SECRET` in `.env`, or
- save them in-app under `Actions / Results -> Batch match review -> osu API Session` (session cookie).

1. Sign in to osu and open account settings OAuth section:
   - https://osu.ppy.sh/home/account/edit#new-oauth-application
2. Create a new OAuth application.
3. Copy `Client ID` and `Client Secret`.
4. Add them to `.env` as `OSU_CLIENT_ID` and `OSU_CLIENT_SECRET`.

### AWS credentials for hosted runtime

Hosted jobs require your own AWS Batch + S3 setup and session credentials entered in-app.

1. Recommended: configure AWS SSO profile once:
   - `aws configure sso` (or `aws configure`)
2. If using SSO locally, refresh login:
   - `aws sso login --profile default` (replace profile if needed)
3. In AWS, prepare:
   - Batch queue
   - Batch job definition
   - S3 bucket/prefix for artifacts
   - (optional) CloudWatch log group
4. In the app (default runtime is hosted AWS), fill:
   - AWS profile (usually `default`)
   - Region
   - Batch Queue
   - Batch Job Definition
   - S3 Bucket / Prefix
   - CloudWatch Log Group (optional)
5. Click `Auto-load AWS (recommended)` first.
   - Uses AWS SDK credential chain (env vars, shared profile/SSO cache, or instance role).
   - Attempts to auto-discover queue/job definition/S3 bucket if missing.
6. Fallback: click `Load from AWS CLI`.
7. Manual fallback (advanced): fill direct key material and click `Save AWS Session`:
   - Access Key ID
   - Secret Access Key
   - Session Token (optional)
   - Region / queue / job definition / bucket / prefix

Inference GPU note:
- GPU model is determined by your AWS Batch compute environment instance types.
- Typical instance choices:
  - `g6.xlarge` (L4) for balanced cost/perf.
  - `g6e.xlarge` (L40S) for higher VRAM/throughput.
  - `p5` family (H100/H200 variants) for premium throughput.

Credentials are stored as an encrypted, HTTP-only session cookie and are not written into `store.json`.

## Runtime requirements

Local generation needs:
- `spotdl` installed and available on PATH
- `python` available on PATH
- `../Mapperatorinator` present and runnable

Hosted generation needs:
- AWS Batch queue + job definition that can run your generation worker
- S3 bucket access for artifact upload/download
- AWS credentials with Batch + S3 (+ optional CloudWatch Logs) permissions

The app stores local state in `web/.data/store.json` and generated artifacts in `web/.data/artifacts/`.

## Current v1 scope

- Apple Music is deferred.
- Hosted runtime assumes you already provisioned AWS infrastructure (the app does not provision it automatically).
