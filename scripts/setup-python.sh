#!/usr/bin/env bash
# Create the project-local Python environment the audio pipeline shells out to.
# Keeping spotdl and yt-dlp here (rather than relying on whatever is on PATH)
# means a broken or shadowed global install cannot silently degrade downloads.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
venv="$here/.venv"
python="${PYTHON_BIN:-python3}"

echo "==> Creating $venv with $($python -V)"
# --copies: symlinked python binaries point outside the project root, which
# kills `next build` (Turbopack refuses to trace a symlink escaping its root).
"$python" -m venv --copies "$venv"
"$venv/bin/python" -m pip install --quiet --upgrade pip
"$venv/bin/python" -m pip install --quiet --upgrade spotdl yt-dlp

echo "==> Installed:"
echo "    spotdl  $("$venv/bin/spotdl" --version 2>/dev/null | tail -1)"
echo "    yt-dlp  $("$venv/bin/yt-dlp" --version 2>/dev/null | tail -1)"

if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  echo "!!  ffmpeg/ffprobe not found. These are system binaries, not Python packages."
  echo "    Install them with: brew install ffmpeg"
fi
