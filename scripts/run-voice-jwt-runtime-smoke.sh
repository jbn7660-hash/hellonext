#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/scripts/voice-jwt-runtime-smoke.py"
AUDIO_PATH="$ROOT/tmp-test-tone.m4a"
MODE="${1:-local}"
USER_JWT="${USER_JWT:-}"

if [[ ! -f "$PY" ]]; then
  echo "missing script: $PY" >&2
  exit 1
fi

if [[ ! -f "$AUDIO_PATH" ]]; then
  echo "missing audio file: $AUDIO_PATH" >&2
  exit 1
fi

case "$MODE" in
  local)
    ENV_FILE="$ROOT/supabase/functions/.env.local-edge"
    if [[ -f "$ENV_FILE" ]]; then
      set -a
      source "$ENV_FILE"
      set +a
    fi
    BASE_URL="${EDGE_SUPABASE_URL:-${SUPABASE_URL:-http://127.0.0.1:54321}}"
    SERVICE_KEY="${EDGE_SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
    ;;
  remote)
    ENV_FILE="$ROOT/supabase/functions/voice-transcribe/.env.voice-transcribe"
    if [[ -f "$ENV_FILE" ]]; then
      set -a
      source "$ENV_FILE"
      set +a
    fi
    BASE_URL="${EDGE_SUPABASE_URL:-${SUPABASE_URL:-}}"
    SERVICE_KEY="${EDGE_SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
    ;;
  *)
    echo "usage: $0 [local|remote]" >&2
    exit 2
    ;;
esac

if [[ -z "$SERVICE_KEY" ]]; then
  echo "missing service key for mode=$MODE" >&2
  exit 1
fi

if [[ -z "$USER_JWT" ]]; then
  echo "USER_JWT is required in environment" >&2
  exit 1
fi

exec python3 "$PY" \
  --base-url "$BASE_URL" \
  --service-key "$SERVICE_KEY" \
  --user-jwt "$USER_JWT" \
  --audio-path "$AUDIO_PATH"
