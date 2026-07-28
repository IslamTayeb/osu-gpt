# osu-gpt web MVP

Simple v1 implementation of:

- Spotify import (liked songs only)
- osu! map lookup (Ranked/Loved, title+artist substring match)
- Match-first flow with auto-generate fallback
- spotdl default downloader (with one-time acknowledgment)
- Mapperatorinator generation jobs (local + hosted AWS Batch or SageMaker Processing)
- Artifact download with 7-day expiration metadata

## Quick setup (recommended)

From this `web` directory:

```bash
./install.sh
npm run dev
```

The setup script (`scripts/dev-setup.sh`) does the following:

- installs `npm` dependencies
- creates `.env` from a template if missing
- checks local generation prerequisites (`spotdl`, `python`, `../Mapperatorinator`)
- checks whether `aws` CLI is available for hosted runtime workflows

If you have access to a Mapperatorinator repo and want to clone it during setup:

```bash
./install.sh --clone-mapperatorinator --mapper-repo <git-url>
```

You can also set `MAPPERATORINATOR_REPO=<git-url>` instead of passing `--mapper-repo`.
`npm run setup:dev` is still available and runs the same setup flow.

## Run (manual)

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

# Hosted AWS auto-provisioning defaults (optional)
AWS_BATCH_JOB_IMAGE=...          # optional override; if unset, one-click setup will try to auto-build worker image
AWS_BATCH_INSTANCE_TYPE=g4dn.xlarge
AWS_BATCH_MAX_VCPUS=16
AWS_BATCH_JOB_VCPU=4
AWS_BATCH_JOB_MEMORY=12288
AWS_BATCH_JOB_GPU=1
AWS_BATCH_WORKER_ECR_REPOSITORY=osu-gpt-worker
AWS_BATCH_WORKER_IMAGE_TAG=latest
AWS_BATCH_WORKER_DISABLE_CODEBUILD=false
AWS_BATCH_WORKER_CODEBUILD_PROJECT_NAME=osu-gpt-worker-image-build
AWS_SAGEMAKER_PROCESSING_IMAGE=...   # optional; defaults to active batch job definition image
AWS_SAGEMAKER_EXECUTION_ROLE_ARN=... # optional; auto-created role is used if unset
AWS_SAGEMAKER_INSTANCE_TYPE=ml.g5.xlarge
AWS_SAGEMAKER_INSTANCE_COUNT=1
AWS_SAGEMAKER_VOLUME_SIZE_GB=50
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
3. (Optional) install and run Docker locally to speed up image build; Docker is not required.
   If Docker is unavailable, one-click setup falls back to AWS CodeBuild.
4. In the app (default runtime is hosted AWS), fill:
   - AWS profile (usually `default`)
   - Region
   - Batch Queue / Job Definition / S3 fields can be left blank for first-time setup
   - CloudWatch Log Group (optional)
   - Keep `Use SageMaker Processing for generation (GPU)` checked to submit hosted jobs to SageMaker.
     Uncheck it to submit hosted jobs to AWS Batch.
5. Click `One-click AWS Setup (recommended)` first.
   - Uses AWS SDK credential chain (env vars, shared profile/SSO cache, or instance role).
   - Attempts to auto-build and push an AWS worker image to ECR.
   - Uses local Docker when available, otherwise falls back to AWS CodeBuild automatically.
   - Attempts to auto-discover queue/job definition/S3 bucket if missing.
   - If still missing, attempts to provision missing S3 + AWS Batch resources automatically.
   - One-click setup requires a real worker image and will return an error if image provisioning fails.
     No placeholder image job definition is created in this flow.
6. Manual fallback (advanced): fill direct key material and click `Save AWS Session`:
   - Access Key ID
   - Secret Access Key
   - Session Token (optional)
   - Region / queue / job definition / bucket / prefix

Inference GPU note:

- GPU model is determined by your AWS Batch compute environment instance types.
- Typical instance choices:
  - `g4dn.xlarge` (NVIDIA T4, closest to common Colab T4 setups for Mapperatorinator).
  - `g6.xlarge` (L4) for balanced cost/perf.
  - `g6e.xlarge` (L40S) for higher VRAM/throughput.
  - `p5` family (H100/H200 variants) for premium throughput.
- For `g4dn.xlarge`, keep `AWS_BATCH_JOB_MEMORY=12288` (16 GiB often over-requests schedulable memory in Batch).

Credentials are stored as an encrypted, HTTP-only session cookie and are not written into `store.json`.

## Runtime requirements

Local generation needs:

- `spotdl` installed and available on PATH
- `python` available on PATH
- `../Mapperatorinator` present and runnable (this repo does not currently include it as a git submodule)

Hosted generation needs:

- AWS Batch queue + job definition that can run your generation worker
- S3 bucket access for artifact upload/download
- AWS credentials with Batch + S3 (+ optional CloudWatch Logs) permissions

The app stores local state in `web/.data/store.json` and generated artifacts in `web/.data/artifacts/`.

## Current v1 scope

- Apple Music is deferred.
- Hosted runtime supports one-click AWS provisioning for first-time setup (ECR + worker image + Batch + S3).
