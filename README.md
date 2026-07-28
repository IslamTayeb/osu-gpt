# osu-gpt

Turn your Spotify liked songs into playable osu! beatmaps.

Import your library, check whether a Ranked or Loved map already exists, and
generate the rest with [Mapperatorinator](https://github.com/OliBomby/Mapperatorinator)
on a GPU.

## Setup

```bash
cp .env.example .env   # fill in the values
npm install
npm run dev
```

You also need, on your PATH: `python`, `spotdl`, `yt-dlp`, `ffmpeg`, `ffprobe`.

A Mapperatorinator checkout must sit next to this repo (`../Mapperatorinator`)
or be pointed at with `MAPPERATORINATOR_DIR`. Pin it to the commit in
`config/mapperatorinator.pin.json`; the settings panel warns when the checkout
drifts from it.

## Where maps are generated

**Duke compute cluster (default).** Jobs are submitted over `ssh dcc` as Slurm
batches. Before submitting, the app asks `gpuavail` which GPUs are free and
takes the best bf16-capable card it can get right now — otherwise it goes
straight to a 2080 rather than waiting, since the queue for the good cards runs
from seconds to a couple of hours depending on the time of day.

Cluster paths live in `config/mapperatorinator.pin.json`. One-time setup:

```bash
ssh dcc
ENV=/hpc/group/GROUP/NETID/envs/mapperatorinator
REPO=/hpc/group/GROUP/NETID/projects/Mapperatorinator
git -C $REPO fetch origin && git -C $REPO reset --hard origin/osu-gpt/batch-driver
$ENV/bin/pip install -r $REPO/requirements.txt
mkdir -p /work/NETID/osu-gpt/jobs
```

Model weights are cached at `/work/NETID/Mapperatorinator/cache/huggingface`.
Pre-warm them from the login node (compute nodes may lack internet), and note
that `/work` purges files untouched for 75 days.

**This machine.** Runs `inference.py` locally, one job at a time.

## Measured performance

A 3-minute song, v32, one A5000 on the cluster:

| Setup | Decode | Wall |
| --- | --- | --- |
| bf16 + SDPA + CUDA-graph decode | 384 tok/s | **63 s** |
| fp32 fallback (RTX 2080 Ti) | 159 tok/s | 206 s |
| bf16 + flash attention, no graph decode | 51 tok/s | 250 s |

Batching amortizes the model load — three maps in one cluster job take 118 s
total (~37 s each) rather than three separate ~63 s jobs plus three queue waits.

Upstream's shipped v32 defaults crash on any bf16-capable GPU: flash attention
trims the kv cache with a data-dependent slice that CUDA graph capture cannot
express, and the stock fallback then dies on poisoned RNG state. The pinned fork
selects SDPA whenever the graph decode is active, which is both correct and
faster.

## Audio

Songs are downloaded once per track and cached under the audio cache folder,
then checked against the Spotify duration (±10 s) so a wrong search result is
rejected rather than mapped, and normalized to -14 LUFS so maps don't swing
between deafening and inaudible.

30-second previews come from Deezer (matched by ISRC where available) with
iTunes as a fallback, and are cached as files — Spotify stopped serving preview
URLs to new apps in November 2024.

## Generation settings

The form asks only for star rating and AR/OD/CS/HP. Everything else — model
version, mapper id, style year, descriptors, sampling, seed — lives under
Advanced and is only sent when you set it, so the model's own tuned defaults
apply otherwise.

Descriptors are generated from `datasets/beatmap_descriptors.csv` in the model
repo (`npm run gen:descriptors`, run automatically before dev/build). Values
outside that vocabulary are silently ignored by the model, so the picker only
offers real ones.

## Export

Set an export folder in settings — point it at your osu! `Songs` folder — and
finished `.osz` files are copied there automatically. Leave it empty to download
from the browser instead.
