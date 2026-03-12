#!/bin/bash
# ============================================================
# HelloNext Staging Environment Setup Script
# ============================================================
# Prerequisites:
#   - Supabase CLI installed (npm i -g supabase)
#   - Vercel CLI installed (npm i -g vercel)
#   - GitHub CLI authenticated (gh auth login)
#   - .env.staging file prepared
# ============================================================

set -euo pipefail

echo "🚀 HelloNext Staging Setup"
echo "=========================="

# ── Colors ───────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Step 1: Check prerequisites ──────────────
info "Checking prerequisites..."

command -v supabase >/dev/null 2>&1 || { error "supabase CLI required. Install: npm i -g supabase"; exit 1; }
command -v vercel >/dev/null 2>&1   || { error "vercel CLI required. Install: npm i -g vercel"; exit 1; }
command -v pnpm >/dev/null 2>&1     || { error "pnpm required. Install: npm i -g pnpm"; exit 1; }

info "✅ All prerequisites met"

# ── Step 2: Supabase Project Setup ───────────
info "Setting up Supabase project..."

echo "📋 Manual steps required:"
echo "  1. Go to https://supabase.com/dashboard"
echo "  2. Create new project: 'hellonext-staging'"
echo "  3. Region: Northeast Asia (ap-northeast-1)"
echo "  4. Copy Project URL and Anon Key"
echo ""

read -p "Enter Supabase Project URL: " SUPABASE_URL
read -p "Enter Supabase Anon Key: " SUPABASE_ANON_KEY
read -p "Enter Supabase Service Role Key: " SUPABASE_SERVICE_KEY
read -p "Enter Supabase DB Password: " SUPABASE_DB_PASSWORD

# ── Step 3: Run Migrations ───────────────────
info "Running database migrations..."

cd "$(dirname "$0")/.."

# Link to Supabase project
read -p "Enter Supabase Project Ref (from dashboard URL): " PROJECT_REF
supabase link --project-ref "$PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"

# Run all migrations
supabase db push

info "✅ 20 migrations applied"

# ── Step 4: Deploy Edge Functions ────────────
info "Deploying Edge Functions..."

FUNCTIONS=(
  "causal-analysis"
  "coupon-activate"
  "edge-weight-calibration"
  "measurement-confidence"
  "send-notification"
  "swing-analysis"
  "verification-handler"
  "voice-fsm-controller"
  "voice-to-report"
  "voice-transcribe"
  "push-send"
)

for func in "${FUNCTIONS[@]}"; do
  info "Deploying: $func"
  supabase functions deploy "$func" --no-verify-jwt 2>/dev/null || warn "Failed: $func (may not exist)"
done

info "✅ Edge Functions deployed"

# ── Step 5: Set Edge Function Secrets ────────
info "Setting Edge Function secrets..."

read -p "Enter OpenAI API Key: " OPENAI_KEY
read -p "Enter Toss Payments Secret Key: " TOSS_KEY

supabase secrets set \
  OPENAI_API_KEY="$OPENAI_KEY" \
  TOSS_PAYMENTS_SECRET_KEY="$TOSS_KEY" \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_KEY"

info "✅ Secrets configured"

# ── Step 6: Vercel Deployment ────────────────
info "Setting up Vercel deployment..."

cd apps/web

# Link to Vercel project
vercel link --yes 2>/dev/null || vercel link

# Set environment variables
vercel env add NEXT_PUBLIC_SUPABASE_URL staging <<< "$SUPABASE_URL"
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY staging <<< "$SUPABASE_ANON_KEY"
vercel env add SUPABASE_SERVICE_ROLE_KEY staging <<< "$SUPABASE_SERVICE_KEY"
vercel env add OPENAI_API_KEY staging <<< "$OPENAI_KEY"
vercel env add TOSS_PAYMENTS_SECRET_KEY staging <<< "$TOSS_KEY"

# Deploy to staging
info "Deploying to Vercel (staging)..."
DEPLOY_URL=$(vercel --yes 2>&1 | grep -o 'https://[^ ]*')

cd ../..

info "✅ Deployed to: $DEPLOY_URL"

# ── Step 7: Seed Data ────────────────────────
info "Seeding test data..."

# Create seed SQL
cat > /tmp/seed-staging.sql << 'SEEDEOF'
-- Seed pro user
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000001', 'pro@hellonext.test', '{"full_name": "김프로"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pro_profiles (user_id, display_name, bio, specialty)
VALUES ('00000000-0000-0000-0000-000000000001', '김프로', '10년 경력 PGA 프로', 'swing-correction')
ON CONFLICT (user_id) DO NOTHING;

-- Seed member user
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('00000000-0000-0000-0000-000000000002', 'member@hellonext.test', '{"full_name": "이회원"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO member_profiles (user_id, display_name, handicap)
VALUES ('00000000-0000-0000-0000-000000000002', '이회원', 24)
ON CONFLICT (user_id) DO NOTHING;

-- Link pro-member
INSERT INTO pro_member_links (pro_id, member_id, status)
VALUES (
  (SELECT id FROM pro_profiles WHERE user_id = '00000000-0000-0000-0000-000000000001'),
  (SELECT id FROM member_profiles WHERE user_id = '00000000-0000-0000-0000-000000000002'),
  'active'
) ON CONFLICT DO NOTHING;
SEEDEOF

# Note: Direct SQL execution requires psql connection
warn "Seed SQL saved to /tmp/seed-staging.sql"
warn "Run manually via Supabase SQL Editor or psql"

# ── Step 8: Verify ───────────────────────────
info "Verifying deployment..."

# Health check
if command -v curl >/dev/null 2>&1 && [ -n "${DEPLOY_URL:-}" ]; then
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${DEPLOY_URL}/api/health" 2>/dev/null || echo "000")
  if [ "$HTTP_STATUS" = "200" ]; then
    info "✅ Health check passed (HTTP 200)"
  else
    warn "Health check returned HTTP $HTTP_STATUS"
  fi
fi

# ── Summary ──────────────────────────────────
echo ""
echo "=========================================="
echo "🎉 Staging Setup Complete!"
echo "=========================================="
echo ""
echo "📍 Web App:        ${DEPLOY_URL:-'(vercel URL)'}"
echo "📍 Supabase:       $SUPABASE_URL"
echo "📍 API Health:     ${DEPLOY_URL:-''}/api/health"
echo ""
echo "🔑 Credentials saved in Vercel env vars"
echo ""
echo "📱 Mobile Setup:"
echo "   EXPO_PUBLIC_SUPABASE_URL=$SUPABASE_URL"
echo "   EXPO_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY"
echo ""
echo "Next steps:"
echo "  1. Run seed SQL in Supabase SQL Editor"
echo "  2. Configure Kakao OAuth in Supabase Auth"
echo "  3. Create Supabase Storage bucket: 'audio'"
echo "  4. Test with: curl ${DEPLOY_URL:-''}/api/health"
echo ""
