#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import boto3

ARTIFACT_EXTENSIONS = {".osu", ".osz", ".json", ".txt", ".log"}


def log(message: str) -> None:
    print(f"[aws-worker] {message}", flush=True)


def run(cmd: list[str], cwd: str | None = None) -> None:
    rendered = " ".join(cmd)
    log(f"running: {rendered}")
    subprocess.run(cmd, cwd=cwd, check=True)


def first_audio_file(dir_path: Path) -> Path | None:
    allowed = {".mp3", ".wav", ".ogg", ".m4a", ".flac"}
    candidates = sorted(
        [entry for entry in dir_path.iterdir() if entry.is_file() and entry.suffix.lower() in allowed]
    )
    return candidates[0] if candidates else None


def parse_hydra_overrides() -> list[str]:
    raw = os.environ.get("OSUGPT_GENERATOR_HYDRA_OVERRIDES_JSON", "").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Invalid OSUGPT_GENERATOR_HYDRA_OVERRIDES_JSON: {error}") from error
    if not isinstance(data, list):
        raise RuntimeError("OSUGPT_GENERATOR_HYDRA_OVERRIDES_JSON must be a JSON array.")
    cleaned: list[str] = []
    for item in data:
        if isinstance(item, str) and item.strip():
            cleaned.append(item.strip())
    return cleaned


def upload_artifacts(output_dir: Path, bucket: str, prefix: str, region: str | None) -> int:
    s3 = boto3.client("s3", region_name=region)
    count = 0
    normalized_prefix = prefix.strip("/ ")

    for file_path in sorted(output_dir.iterdir()):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in ARTIFACT_EXTENSIONS:
            continue
        key = f"{normalized_prefix}/{file_path.name}" if normalized_prefix else file_path.name
        log(f"uploading {file_path.name} -> s3://{bucket}/{key}")
        s3.upload_file(str(file_path), bucket, key)
        count += 1
    return count


def main() -> int:
    query = os.environ.get("OSUGPT_TRACK_EXTERNAL_URL", "").strip()
    title = os.environ.get("OSUGPT_TRACK_TITLE", "").strip()
    artists = os.environ.get("OSUGPT_TRACK_ARTISTS", "").strip()
    bucket = os.environ.get("OSUGPT_OUTPUT_S3_BUCKET", "").strip()
    prefix = os.environ.get("OSUGPT_OUTPUT_S3_PREFIX", "").strip()
    region = os.environ.get("AWS_REGION", "").strip() or os.environ.get("AWS_DEFAULT_REGION", "").strip() or None

    if not query:
        if title and artists:
            query = f"{artists} - {title}"
        elif title:
            query = title
    if not query:
        raise RuntimeError("No OSUGPT_TRACK_EXTERNAL_URL or track title/artist fallback query available.")
    if not bucket:
        raise RuntimeError("OSUGPT_OUTPUT_S3_BUCKET is required.")

    hydra_overrides = parse_hydra_overrides()
    work_dir = Path(tempfile.mkdtemp(prefix="osugpt-job-"))
    log(f"work dir: {work_dir}")

    run(["spotdl", "download", query, "--output", str(work_dir), "--format", "mp3"])
    audio_path = first_audio_file(work_dir)
    if not audio_path:
        raise RuntimeError("spotdl completed but no audio file was produced.")

    mapper_dir = Path("/workspace/Mapperatorinator")
    if not mapper_dir.exists():
        raise RuntimeError("Mapperatorinator directory not found in image at /workspace/Mapperatorinator.")

    inference_cmd = [
        "python",
        "inference.py",
        f"audio_path={json.dumps(str(audio_path))}",
        f"output_path={json.dumps(str(work_dir))}",
    ]
    inference_cmd.extend(hydra_overrides)
    run(inference_cmd, cwd=str(mapper_dir))

    uploaded = upload_artifacts(work_dir, bucket, prefix, region)
    if uploaded == 0:
        raise RuntimeError("Inference completed but no uploadable artifacts were found.")
    log(f"done. uploaded artifacts: {uploaded}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:  # noqa: BLE001
        log(f"fatal: {error}")
        raise
