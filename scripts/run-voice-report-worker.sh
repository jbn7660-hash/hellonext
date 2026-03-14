#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-remote}"
MEMO_ID="${MEMO_ID:-}"

if [[ -z "$MEMO_ID" ]]; then
  echo "MEMO_ID is required" >&2
  exit 1
fi

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

REPORT_SECRET="${VOICE_REPORT_WORKER_SECRET:-}"
if [[ -z "$BASE_URL" ]]; then
  echo "missing base url for mode=$MODE" >&2
  exit 1
fi
if [[ -z "$REPORT_SECRET" ]]; then
  echo "missing VOICE_REPORT_WORKER_SECRET" >&2
  exit 1
fi

curl -sS -X POST \
  "$BASE_URL/functions/v1/voice-report-worker" \
  -H "Authorization: Bearer $REPORT_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"memoId\":\"$MEMO_ID\"}"

echo
