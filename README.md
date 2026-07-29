# osu-gpt

Turn your Spotify liked songs into playable osu! beatmaps.

Import your library, pick songs, and
generate maps with [Mapperatorinator](https://github.com/OliBomby/Mapperatorinator)
on a GPU.

## Setup

```bash
cp .env.example .env   # fill in the values
npm install
npm run dev
```

`npm run setup:python` creates `web/.venv` with `spotdl` and `yt-dlp`, and the
app prefers those over anything on PATH. This is deliberate: a global spotdl
that shadows a working copy, or breaks on a Python upgrade
(`ImportError: cannot import name 'formatargspec'` on 3.13+), otherwise
degrades downloads to a worse yt-dlp search without failing. The job log always
names which downloader ran.

`ffmpeg` and `ffprobe` are system binaries, not Python packages — install them
separately (`brew install ffmpeg`). Any tool can be pointed elsewhere with
`SPOTDL_BIN`, `YT_DLP_BIN`, `FFMPEG_BIN`, `FFPROBE_BIN`.

Running inference on this machine additionally needs Mapperatorinator's own
dependencies. Keep them in a venv beside that checkout
(`python -m venv ../Mapperatorinator/.venv && ../Mapperatorinator/.venv/bin/pip
install -r ../Mapperatorinator/requirements.txt`) and the app will use it, or
set `MAPPERATORINATOR_PYTHON`. Not needed for the default cluster runtime.

A Mapperatorinator checkout must sit next to this repo (`../Mapperatorinator`)
or be pointed at with `MAPPERATORINATOR_DIR`. Pin it to the commit in
`config/mapperatorinator.pin.json`; the settings panel warns when the checkout
drifts from it.

## Where maps are generated

**Duke compute cluster (default).** Jobs are submitted over `ssh dcc` as Slurm
batches. Pick a GPU class in settings; the dropdown queries the cluster live
(free GPU counts plus Slurm's own `sbatch --test-only` prediction) so the wait
shown is real, not assumed.

Measured over 977 of our jobs in 30 days:

| GPU | median wait | p90 | per 3-min song |
| --- | --- | --- | --- |
| RTX 2080 Ti (default) | 12 s | 31 s | ~3.5 min |
| A5000 / A6000 (bf16) | 19 s | 23 min | ~1 min |
| RTX 5000 Ada | 14 hours | — | — |

The 2080 is the default because it is nearly always idle, and starting now beats
waiting for a faster card. For a large batch the maths flips — 100 songs is
about 5 hours on a 2080 against 1¼ hours on bf16 — so switch when queueing a lot.
5000 Ada is excluded from automatic selection entirely: it is the best card on
paper and the worst in practice.

The tracked `config/mapperatorinator.pin.json` pins only the model repo and
commit. Your own cluster identity — SSH host alias, Slurm account, paths — goes
in `config/dcc.local.json` (untracked; copy `dcc.local.example.json`). One-time
setup, with `$ENV`, `$REPO` and `$WORK` matching what you put there:

```bash
ssh <your-cluster>
git -C $REPO fetch origin && git -C $REPO reset --hard <pinned sha>
$ENV/bin/pip install -r $REPO/requirements.txt
mkdir -p $WORK/jobs
```

Model weights cache under the `hfHome` you configured. Pre-warm them from the
login node (compute nodes may lack internet); on Duke's DCC, note that `/work`
purges files untouched for 75 days.

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
rejected rather than mapped.

Loudness is then normalized with a two-pass ffmpeg `loudnorm` to **-9 LUFS
integrated, -1.5 dBTP true peak**, at 44.1 kHz / 192 kbps. -9 matches what
typical osu! maps actually ship (raw commercial masters), so generated maps sit
at the same volume as the rest of a library — an earlier -14 target made every
generated map noticeably quieter than its neighbours. Measured across this
library, downloads landed between -8.4
and -9.5 LUFS with true peaks up to +2 dBTP (already clipping), which is why
maps swung between deafening and quiet. The first pass measures, the second
applies the correction with `linear=true`, so it is a clean gain change rather
than compression that would squash dynamics. Verified output lands within about
0.3 LU of target. Both the target and the whole step are configurable in
settings.

Previews play the exact cached file that generation maps — same download,
same normalization — so what you hear is what the model gets, and a previewed
track generates without a download wait.

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
