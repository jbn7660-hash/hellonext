#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-remote}"
JOB_ID="${JOB_ID:-}"

case "$MODE" in
  local)
    ENV_FILE="$ROOT/supabase/functions/.env.local-edge"
    ;;
  remote)
    ENV_FILE="$ROOT/supabase/functions/voice-transcribe/.env.voice-transcribe"
    ;;
  *)
    echo "usage: $0 [local|remote]" >&2
    exit 2
    ;;
esac

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

BASE_URL="${EDGE_SUPABASE_URL:-${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}}"
if [[ "$MODE" == "local" && -z "$BASE_URL" ]]; then
  BASE_URL="http://127.0.0.1:54321"
fi

WORKER_SECRET="${VOICE_TRANSCRIBE_WORKER_SECRET:-}"
ALLOW_UNAUTH="${ALLOW_UNAUTHENTICATED_WORKER_INVOKE:-false}"

if [[ -z "$BASE_URL" ]]; then
  echo "missing base url for mode=$MODE" >&2
  exit 1
fi

AUTH_ARGS=()
if [[ "$ALLOW_UNAUTH" != "true" ]]; then
  if [[ -z "$WORKER_SECRET" ]]; then
    echo "missing VOICE_TRANSCRIBE_WORKER_SECRET" >&2
    exit 1
  fi
  AUTH_ARGS=(-H "Authorization: Bearer $WORKER_SECRET")
fi

BODY='{}'
if [[ -n "$JOB_ID" ]]; then
  BODY="{\"jobId\":\"$JOB_ID\"}"
fi

curl -sS -X POST \
  "$BASE_URL/functions/v1/voice-transcribe-worker" \
  "${AUTH_ARGS[@]}" \
  -H "Content-Type: application/json" \
  -d "$BODY"

echo
