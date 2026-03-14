#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FUNCTION_NAME="voice-report-worker"
PROJECT_REF="${PROJECT_REF:-phstuugdppfutjcpislh}"
ENV_FILE="${ENV_FILE:-$ROOT/supabase/functions/voice-transcribe/.env.voice-transcribe}"

cd "$ROOT"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

supabase functions deploy "$FUNCTION_NAME" --project-ref "$PROJECT_REF" --no-verify-jwt
