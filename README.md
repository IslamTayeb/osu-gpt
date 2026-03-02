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
OSU_CLIENT_ID=...      # optional now; required only if you switch to osu OAuth APIs
OSU_CLIENT_SECRET=...  # optional now; required only if you switch to osu OAuth APIs
OSU_API_KEY=...        # legacy key, optional and currently not used by default flow
```

## API key setup (osu + AWS)

### osu API credentials

Current matching uses osu beatmapset public search and does not strictly require a key.  
If you want OAuth credentials ready for future/private endpoints:

1. Sign in to osu and open account settings OAuth section:
   - https://osu.ppy.sh/home/account/edit#new-oauth-application
2. Create a new OAuth application.
3. Copy `Client ID` and `Client Secret`.
4. Add them to `.env` as `OSU_CLIENT_ID` and `OSU_CLIENT_SECRET`.

### AWS credentials for hosted runtime

Hosted jobs require your own AWS Batch + S3 setup and session credentials entered in-app.

1. Create IAM access keys (or STS temporary credentials):
   - https://console.aws.amazon.com/iam/home#/security_credentials
2. In AWS, prepare:
   - Batch queue
   - Batch job definition
   - S3 bucket/prefix for artifacts
   - (optional) CloudWatch log group
3. In the app, switch runtime to `Hosted AWS runtime` and fill:
   - Access Key ID
   - Secret Access Key
   - Session Token (optional)
   - Region
   - Batch Queue
   - Batch Job Definition
   - S3 Bucket / Prefix
   - CloudWatch Log Group (optional)
4. Click `Save AWS Session`.

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
