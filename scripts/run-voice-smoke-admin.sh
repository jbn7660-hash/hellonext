#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Voice Pipeline E2E Smoke Test — Admin Bypass (no user JWT)
#
# 전체 파이프라인을 user JWT 없이 service-role admin secret으로 검증.
# 순서: enqueue(voice-transcribe) → worker(transcription) → report-worker
#
# 사용법:
#   ./scripts/run-voice-smoke-admin.sh remote
#   AUDIO_PATH=./my-test.m4a ./scripts/run-voice-smoke-admin.sh remote
#   SKIP_REPORT=1 ./scripts/run-voice-smoke-admin.sh remote   # report worker 생략
# ============================================================

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-remote}"
AUDIO_PATH="${AUDIO_PATH:-$ROOT/tmp-test-tone.m4a}"
SKIP_REPORT="${SKIP_REPORT:-0}"

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

ADMIN_SECRET="${VOICE_ADMIN_SECRET:-}"
WORKER_SECRET="${VOICE_TRANSCRIBE_WORKER_SECRET:-}"
REPORT_SECRET="${VOICE_REPORT_WORKER_SECRET:-}"
SMOKE_USER_ID="${SMOKE_TEST_USER_ID:-}"
SERVICE_KEY="${EDGE_SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"

# --- Preflight checks ---
fail=0
[[ -z "$BASE_URL" ]] && echo "✗ missing BASE_URL" >&2 && fail=1
[[ -z "$ADMIN_SECRET" ]] && echo "✗ missing VOICE_ADMIN_SECRET" >&2 && fail=1
[[ -z "$WORKER_SECRET" ]] && echo "✗ missing VOICE_TRANSCRIBE_WORKER_SECRET" >&2 && fail=1
[[ -z "$SMOKE_USER_ID" ]] && echo "✗ missing SMOKE_TEST_USER_ID" >&2 && fail=1
[[ -z "$SERVICE_KEY" ]] && echo "✗ missing SUPABASE_SERVICE_ROLE_KEY" >&2 && fail=1
[[ ! -f "$AUDIO_PATH" ]] && echo "✗ missing audio file: $AUDIO_PATH" >&2 && fail=1
if [[ "$SKIP_REPORT" != "1" && -z "$REPORT_SECRET" ]]; then
  echo "✗ missing VOICE_REPORT_WORKER_SECRET (set SKIP_REPORT=1 to skip)" >&2
  fail=1
fi
[[ $fail -ne 0 ]] && exit 1

VOICE_MEMO_ID="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"

echo "========================================"
echo " Voice Pipeline E2E Smoke (admin bypass)"
echo "========================================"
echo " mode       = $MODE"
echo " base_url   = $BASE_URL"
echo " audio      = $AUDIO_PATH"
echo " memo_id    = $VOICE_MEMO_ID"
echo "========================================"
echo

# ============================================================
# PRESTEP: Create smoke voice_memos row (required by FK)
# ============================================================
echo "--- [0/3] Create smoke voice_memos row ---"

PRO_ID=$(python3 - <<PY
import json, urllib.request, urllib.parse, sys
base = "$BASE_URL"
key = "$SERVICE_KEY"
uid = "$SMOKE_USER_ID"
url = base + "/rest/v1/pro_profiles?user_id=eq." + urllib.parse.quote(uid) + "&select=id&limit=1"
req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': 'Bearer ' + key})
with urllib.request.urlopen(req, timeout=30) as r:
    data = json.load(r)
    print(data[0]['id'] if data else '')
PY
)

if [[ -z "$PRO_ID" ]]; then
  echo "✗ could not resolve pro_id for SMOKE_TEST_USER_ID=$SMOKE_USER_ID" >&2
  exit 1
fi

CREATE_MEMO_RESPONSE=$(python3 - <<PY
import json, urllib.request
base = "$BASE_URL"
key = "$SERVICE_KEY"
voice_memo_id = "$VOICE_MEMO_ID"
pro_id = "$PRO_ID"
payload = json.dumps({
  'id': voice_memo_id,
  'pro_id': pro_id,
  'member_id': None,
  'audio_url': 'pending://admin-smoke',
  'duration_sec': 5,
  'status': 'recording'
}).encode()
req = urllib.request.Request(
  base + '/rest/v1/voice_memos',
  data=payload,
  method='POST',
  headers={
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  }
)
with urllib.request.urlopen(req, timeout=30) as r:
  print(r.status)
  print(r.read().decode())
PY
)

CREATE_MEMO_HTTP=$(echo "$CREATE_MEMO_RESPONSE" | head -1)
CREATE_MEMO_BODY=$(echo "$CREATE_MEMO_RESPONSE" | tail -n +2)

echo "HTTP $CREATE_MEMO_HTTP"
echo "$CREATE_MEMO_BODY" | python3 -m json.tool 2>/dev/null || echo "$CREATE_MEMO_BODY"
echo

# ============================================================
# STEP 1: Enqueue (voice-transcribe with admin bypass)
# ============================================================
echo "--- [1/3] Enqueue: voice-transcribe ---"

ENQUEUE_RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST \
  "$BASE_URL/functions/v1/voice-transcribe" \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -F "audio=@$AUDIO_PATH" \
  -F "voice_memo_id=$VOICE_MEMO_ID" \
  -F "user_id=$SMOKE_USER_ID" \
  -F "duration=5000")

ENQUEUE_HTTP=$(echo "$ENQUEUE_RESPONSE" | tail -1)
ENQUEUE_BODY=$(echo "$ENQUEUE_RESPONSE" | sed '$d')

echo "HTTP $ENQUEUE_HTTP"
echo "$ENQUEUE_BODY" | python3 -m json.tool 2>/dev/null || echo "$ENQUEUE_BODY"

if [[ "$ENQUEUE_HTTP" != "202" ]]; then
  echo
  echo "✗ ENQUEUE FAILED (expected 202, got $ENQUEUE_HTTP)"
  echo
  case "$ENQUEUE_HTTP" in
    401) echo "→ VOICE_ADMIN_SECRET이 remote에 배포되지 않았거나 값이 틀림" ;;
    500) echo "→ function 내부 오류 — response body 확인" ;;
    *)   echo "→ 예상하지 못한 상태 코드" ;;
  esac
  exit 1
fi

JOB_ID=$(echo "$ENQUEUE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))" 2>/dev/null)
echo
echo "✓ Enqueued — jobId=$JOB_ID"
echo

# ============================================================
# STEP 2: Transcription Worker
# ============================================================
echo "--- [2/3] Transcription Worker ---"

if [[ -n "$JOB_ID" ]]; then
  WORKER_BODY="{\"jobId\":\"$JOB_ID\"}"
else
  WORKER_BODY='{}'
fi

WORKER_RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST \
  "$BASE_URL/functions/v1/voice-transcribe-worker" \
  -H "Authorization: Bearer $WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d "$WORKER_BODY")

WORKER_HTTP=$(echo "$WORKER_RESPONSE" | tail -1)
WORKER_BODY_OUT=$(echo "$WORKER_RESPONSE" | sed '$d')

echo "HTTP $WORKER_HTTP"
echo "$WORKER_BODY_OUT" | python3 -m json.tool 2>/dev/null || echo "$WORKER_BODY_OUT"

WORKER_PROCESSED=$(echo "$WORKER_BODY_OUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('processed',''))" 2>/dev/null)

if [[ "$WORKER_HTTP" == "200" && "$WORKER_PROCESSED" == "True" ]]; then
  echo
  echo "✓ Transcription completed"
else
  echo
  echo "⚠ Transcription worker returned processed=$WORKER_PROCESSED (HTTP $WORKER_HTTP)"
  echo "  가능한 원인: audio_url 미설정, Whisper API 키 문제, job status 불일치"
fi
echo

# ============================================================
# STEP 3: Report Worker (optional)
# ============================================================
if [[ "$SKIP_REPORT" == "1" ]]; then
  echo "--- [3/3] Report Worker — SKIPPED (SKIP_REPORT=1) ---"
else
  echo "--- [3/3] Report Worker ---"

  # voice-transcribe는 voice_memo_id를 사용하지만,
  # report worker는 실제 DB의 voice_memos.id (UUID)가 필요.
  # smoke에서는 transcription_jobs.voice_memo_id로 넣은 값이 voice_memos에 이미 있어야 함.
  # 없으면 report worker는 실패할 수 있음 — 이건 정상 (DB에 해당 memo row가 없으므로)

  REPORT_RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST \
    "$BASE_URL/functions/v1/voice-report-worker" \
    -H "Authorization: Bearer $REPORT_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"memoId\":\"$VOICE_MEMO_ID\"}")

  REPORT_HTTP=$(echo "$REPORT_RESPONSE" | tail -1)
  REPORT_BODY=$(echo "$REPORT_RESPONSE" | sed '$d')

  echo "HTTP $REPORT_HTTP"
  echo "$REPORT_BODY" | python3 -m json.tool 2>/dev/null || echo "$REPORT_BODY"

  if [[ "$REPORT_HTTP" == "200" ]]; then
    echo
    echo "✓ Report worker completed"
  else
    echo
    echo "⚠ Report worker returned HTTP $REPORT_HTTP"
    echo "  voice_memos 테이블에 memo_id=$VOICE_MEMO_ID 행이 없으면 정상 실패임"
  fi
fi

echo
echo "========================================"
echo " Smoke Test Summary"
echo "========================================"
echo " Enqueue:      HTTP $ENQUEUE_HTTP (jobId=$JOB_ID)"
echo " Transcribe:   HTTP $WORKER_HTTP (processed=$WORKER_PROCESSED)"
if [[ "$SKIP_REPORT" != "1" ]]; then
  echo " Report:       HTTP $REPORT_HTTP"
fi
echo "========================================"
