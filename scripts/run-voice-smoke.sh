#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/scripts/voice-jwt-runtime-smoke.py"
AUDIO_PATH="${AUDIO_PATH:-$ROOT/tmp-test-tone.m4a}"
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
SERVICE_KEY="${EDGE_SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-${SERVICE_KEY:-}}}"

if [[ -z "$BASE_URL" ]]; then
  echo "missing base url for mode=$MODE" >&2
  exit 1
fi

if [[ -z "$SERVICE_KEY" ]]; then
  echo "missing service key for mode=$MODE" >&2
  exit 1
fi

if [[ -z "$USER_JWT" ]]; then
  echo "USER_JWT is required in environment" >&2
  exit 1
fi

echo "[voice-smoke] mode=$MODE base_url=$BASE_URL audio_path=$AUDIO_PATH" >&2

action_summary() {
  local status="$1"
  case "$status" in
    200)
      echo "OK: remote path itself is healthy." ;;
    401)
      echo "AUTH: USER_JWT is stale/invalid; fetch a fresh JWT from an already verified account." ;;
    502)
      echo "UPSTREAM: auth passed; check Whisper/OpenAI or upstream provider failure details." ;;
    500)
      echo "SERVER: function/runtime/config issue; inspect function response body and env secrets." ;;
    *)
      echo "CHECK: inspect JSON output for step-level failure." ;;
  esac
}

TMP_JSON="$(mktemp -t voice-smoke.XXXXXX.json)"
python3 "$PY" \
  --base-url "$BASE_URL" \
  --service-key "$SERVICE_KEY" \
  --user-jwt "$USER_JWT" \
  --audio-path "$AUDIO_PATH" | tee "$TMP_JSON"

TRANSCRIBE_STATUS="$(python3 - <<'PY' "$TMP_JSON"
import json,sys
p=sys.argv[1]
with open(p) as f:
    data=json.load(f)
print(data.get('steps',{}).get('voice_transcribe',{}).get('status',''))
PY
)"
CACHE_STATE="$(python3 - <<'PY' "$TMP_JSON"
import json,sys
p=sys.argv[1]
with open(p) as f:
    data=json.load(f)
print(data.get('summary',{}).get('cache_state',''))
PY
)"

{
  echo
  echo "[voice-smoke] transcribe_status=${TRANSCRIBE_STATUS:-unknown} cache_state=${CACHE_STATE:-unknown}"
  echo "[voice-smoke] $(action_summary "${TRANSCRIBE_STATUS:-}")"
} >&2

rm -f "$TMP_JSON"
