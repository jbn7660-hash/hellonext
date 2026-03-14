#!/usr/bin/env bash
set -euo pipefail

# Deploys the voice-transcribe edge function with a minimal sanity check.

ROOT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FUNC_DIR="$ROOT_DIR/supabase/functions/voice-transcribe"
ENV_FILE="${ENV_FILE:-$FUNC_DIR/.env.voice-transcribe}"
PROJECT_REF="${PROJECT_REF:-phstuugdppfutjcpislh}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI is required (https://supabase.com/docs/reference/cli/)." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Copy $FUNC_DIR/.env.example to $ENV_FILE and fill secrets." >&2
  exit 1
fi

missing=()
for var in OPENAI_API_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_URL; do
  if ! grep -E "^${var}=" "$ENV_FILE" >/dev/null; then
    missing+=("$var")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "Set required vars in $ENV_FILE: ${missing[*]}" >&2
  exit 1
fi

echo "Using project ref: $PROJECT_REF" >&2
echo "Syncing secrets from $ENV_FILE" >&2
supabase secrets set --env-file "$ENV_FILE" --project-ref "$PROJECT_REF"

echo "Deploying voice-transcribe" >&2
supabase functions deploy voice-transcribe --project-ref "$PROJECT_REF"

echo "Done." >&2
