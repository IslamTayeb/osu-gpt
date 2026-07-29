#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_MAPPER_DIR="$(cd "$ROOT_DIR/.." && pwd)/Mapperatorinator"

MAPPER_DIR="$DEFAULT_MAPPER_DIR"
MAPPER_REPO="${MAPPERATORINATOR_REPO:-}"
CLONE_MAPPER=false

print_usage() {
  cat <<'EOF'
Usage: bash scripts/dev-setup.sh [options]

Options:
  --clone-mapperatorinator   Clone Mapperatorinator if missing.
  --mapper-repo <git-url>    Git URL for Mapperatorinator clone.
  --mapper-dir <path>        Override expected local Mapperatorinator directory.
  -h, --help                 Show this help.
EOF
}

require_command() {
  local command_name="$1"
  local install_hint="$2"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: '$command_name' is required. $install_hint"
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --clone-mapperatorinator)
      CLONE_MAPPER=true
      shift
      ;;
    --mapper-repo)
      if [[ $# -lt 2 ]]; then
        echo "Error: --mapper-repo requires a value."
        exit 1
      fi
      MAPPER_REPO="$2"
      shift 2
      ;;
    --mapper-dir)
      if [[ $# -lt 2 ]]; then
        echo "Error: --mapper-dir requires a value."
        exit 1
      fi
      MAPPER_DIR="$2"
      shift 2
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Error: unknown option '$1'."
      print_usage
      exit 1
      ;;
  esac
done

echo "==> Verifying base tooling"
require_command "node" "Install Node.js 20+."
require_command "npm" "Install npm."
if [[ "$CLONE_MAPPER" == true ]]; then
  require_command "git" "Install git to clone Mapperatorinator."
fi

echo "==> Installing web dependencies"
npm install --prefix "$ROOT_DIR"

echo "==> Checking environment file"
if [[ ! -f "$ROOT_DIR/.env" ]]; then
  cat > "$ROOT_DIR/.env" <<'EOF'
APP_SECRET=replace-with-long-random-string
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback

EOF
  echo "Created $ROOT_DIR/.env template. Fill in your credentials before running the app."
else
  echo "Found existing $ROOT_DIR/.env"
fi

echo "==> Checking local generation prerequisites"
if command -v spotdl >/dev/null 2>&1; then
  echo "spotdl: OK"
else
  echo "spotdl: missing (needed for local generation only)"
fi

if command -v python >/dev/null 2>&1; then
  echo "python: OK"
elif command -v python3 >/dev/null 2>&1; then
  echo "python: missing, but python3 exists (local generation currently invokes 'python')"
else
  echo "python: missing (needed for local generation only)"
fi

if [[ -d "$MAPPER_DIR" ]]; then
  echo "Mapperatorinator: found at $MAPPER_DIR"
else
  if [[ "$CLONE_MAPPER" == true ]]; then
    if [[ -z "$MAPPER_REPO" ]]; then
      echo "Mapperatorinator: missing and no repo provided."
      echo "Set MAPPERATORINATOR_REPO or pass --mapper-repo <git-url>."
    else
      echo "Cloning Mapperatorinator into $MAPPER_DIR"
      git clone "$MAPPER_REPO" "$MAPPER_DIR"
      echo "Mapperatorinator: clone complete"
    fi
  else
    echo "Mapperatorinator: not found at $MAPPER_DIR (needed for local generation only)"
    echo "To auto-clone, rerun with --clone-mapperatorinator --mapper-repo <git-url>"
  fi
fi

echo "==> Checking hosted runtime helper tools"
if command -v aws >/dev/null 2>&1; then
  echo "aws cli: OK"
else
  echo "aws cli: missing (optional, but recommended for hosted AWS setup)"
fi

echo
echo "Setup complete."
echo "Next:"
echo "  1) Fill .env values."
echo "  2) Start app: npm run dev"
echo "  3) For local generation, ensure Mapperatorinator is installed at ../Mapperatorinator or update --mapper-dir."
