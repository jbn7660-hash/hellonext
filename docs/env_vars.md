# HelloNext Environment Variables Reference

This document describes all environment variables for HelloNext v2.0. The authoritative source is `.env.example` at the project root.

## Source of Truth: .env.example

The file `/sessions/focused-gifted-sagan/mnt/ARCUP/.env.example` contains 96 environment variable definitions organized by configuration category. All variables listed below are actual, not templates.

## v1.1 Basic Configuration (Infrastructure & APIs)

### Supabase Configuration
- **`NEXT_PUBLIC_SUPABASE_URL`** - Supabase project URL (https://your-project.supabase.co)
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** - Public anon key for client-side auth
- **`SUPABASE_SERVICE_ROLE_KEY`** - Server-side service role key (secret, never expose)

### Sentry Error Tracking
- **`NEXT_PUBLIC_SENTRY_DSN`** - Public DSN for client-side error reporting
- **`SENTRY_AUTH_TOKEN`** - Sentry API token for deployment/release tracking

### External API Services
- **`OPENAI_API_KEY`** - OpenAI API key (sk-...) for Whisper STT and GPT-4o LLM
- **`CLOUDINARY_CLOUD_NAME`** - Cloudinary cloud identifier
- **`CLOUDINARY_API_KEY`** - Cloudinary API key
- **`CLOUDINARY_API_SECRET`** - Cloudinary API secret (for server-side operations)

### Payment Gateway (Toss Payments — 토스페이먼츠)
- **`TOSS_CLIENT_KEY`** - Toss client key (test_ck_live_... format)
- **`TOSS_SECRET_KEY`** - Toss secret key (test_sk_live_... format)

## v2.0 Patent Engine Configuration

### Measurement Confidence Engine (DC-2)
Implements Patent 3 Claim 1(e) — 5-factor confidence formula for pose measurement validation.

- **`CONFIDENCE_T1`** - High confidence threshold (default: 0.7) — measurements above this are marked `confirmed`
- **`CONFIDENCE_T2`** - Low confidence threshold (default: 0.4) — measurements below this are marked `hidden`
- **`CONFIDENCE_K`** - System calibration constant (default: 1.0) — global weighting factor for all confidence scores

### Causal Graph Engine (F-015, DC-4)
Implements Patent 1 Claim 1(e) — dependency modeling and primary fix identification.

- **`CAUSAL_GRAPH_VERSION`** - DAG version identifier (default: v1.0) — used for schema compatibility
- **`EDGE_CALIBRATION_BATCH_SIZE`** - Batch size for edge recalibration operations (default: 10)
- **`EDGE_CALIBRATION_INTERVAL_HOURS`** - Interval in hours for periodic edge recalibration (default: 1)

### Voice FSM Controller (DC-5, F-017)
Implements Patent 4 Claim 1(e) — finite state machine for voice memo lifecycle (UNBOUND → PREPROCESSED → LINKED → FINALIZED).

- **`FSM_RECOVERY_TIMEOUT_SEC`** - Recovery RTT timeout in seconds (default: 30) — max duration for state recovery attempts
- **`STT_MAX_RETRY`** - Max retry attempts for speech-to-text processing (default: 3) — exponential backoff applied

### Verification Queue (F-016, DC-3)
Implements Patent 3 Claim 1(e) AC-5 — pro review workflow for pending measurements.

- **`VERIFICATION_DAILY_LIMIT_PER_PRO`** - Daily verification limit per pro (default: 50) — max pending reviews per pro per day

## Vercel Deployment Configuration

- **`VERCEL_TOKEN`** - Vercel API token for CI/CD deployments
- **`VERCEL_ORG_ID`** - Vercel organization ID
- **`VERCEL_PROJECT_ID`** - Vercel project ID for HelloNext

## Supabase Deployment Configuration

- **`SUPABASE_ACCESS_TOKEN`** - Supabase management API token for CLI and automation
- **`SUPABASE_PROJECT_REF`** - Supabase project reference ID (used with CLI)

## Database Configuration

### PostgreSQL Connection
- **`DATABASE_URL`** - PostgreSQL connection string (postgresql://user:pass@host:port/db)
  - Used in development and testing
  - Points to local Supabase docker instance in dev: `postgresql://postgres:postgres@localhost:54322/postgres`

## Development Configuration

- **`NODE_ENV`** - Node.js environment (development, staging, production)
- **`NEXT_TELEMETRY_DISABLED`** - Disable Next.js telemetry (default: 1)
- **`DEBUG`** - Debug logging pattern (default: arcup:*) — enables verbose logging for debugging

## Staging Environment (.env.staging.example)

The file `.env.staging.example` provides additional/overriding staging-specific configurations:

### Additional Staging Variables
- **`NEXT_PUBLIC_SUPABASE_URL`** - Staging Supabase URL
- **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** - Staging anon key
- **`SUPABASE_SERVICE_ROLE_KEY`** - Staging service role key
- **`SUPABASE_DB_URL`** - Staging database connection (postgresql://...)
- **`OPENAI_API_KEY`** - Staging OpenAI key (same as prod, shared)
- **`KAKAO_REST_API_KEY`** - Kakao API key for staging Kakao integration
- **`KAKAO_REDIRECT_URI`** - Kakao OAuth redirect URI for staging (e.g., https://your-staging.vercel.app/auth/callback)
- **`CLOUDINARY_CLOUD_NAME`** - Staging cloud (e.g., hellonext-staging)
- **`TOSS_PAYMENTS_SECRET_KEY`** - Staging Toss secret (test_sk_...)
- **`TOSS_PAYMENTS_CLIENT_KEY`** - Staging Toss client (test_ck_...)
- **`CONFIDENCE_T1`** - Confidence threshold (staging can differ: 0.7)
- **`CONFIDENCE_T2`** - Low confidence threshold (staging: 0.4)
- **`CONFIDENCE_K`** - Calibration constant (staging: 1.0)
- **`FSM_TIMEOUT_MS`** - FSM timeout in milliseconds (staging: 300000)
- **`CAUSAL_MAX_DEPTH`** - Max depth for causal graph traversal (staging: 5)
- **`CALIBRATION_WINDOW_DAYS`** - Calibration lookback window in days (staging: 30)
- **`EDIT_DELTA_RETENTION_DAYS`** - Retention period for edit deltas (staging: 90)
- **`SCALAR_PRIMARY_FIX_ENABLED`** - Feature flag for scalar primary fix (staging: true)
- **`SENTRY_DSN`** - Staging Sentry DSN (private)
- **`NEXT_PUBLIC_SENTRY_DSN`** - Staging Sentry DSN (public)
- **`VERCEL_ENV`** - Vercel environment marker (staging)
- **`EXPO_PUBLIC_SUPABASE_URL`** - Expo mobile app Supabase URL
- **`EXPO_PUBLIC_SUPABASE_ANON_KEY`** - Expo mobile app anon key

## Configuration Status in .env.local

After initial setup, the following variables are typically configured in `.env.local` (development) or Vercel/Supabase secrets (production):

### Already Configured (Project-Level)
- `NEXT_PUBLIC_SUPABASE_URL` — shared Supabase project
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public auth key
- `SUPABASE_SERVICE_ROLE_KEY` — server secret
- `OPENAI_API_KEY` — shared API key
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — shared CDN
- `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY` — shared payment gateway
- `DATABASE_URL` — local PostgreSQL (dev) or managed Supabase (prod)
- All Patent Engine vars (CONFIDENCE_*, CAUSAL_*, FSM_*, VERIFICATION_*)

### Not Yet Configured (Typically Added Before Deployment)
- `SENTRY_*` — error tracking (can be null in dev)
- `VERCEL_*` — CI/CD automation (used by Vercel only)
- `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` — management APIs (advanced)

## Required Variables by Sprint/Phase

### Sprint 1: Infrastructure & Authentication
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SENTRY_AUTH_TOKEN` (for monitoring)

### Sprint 2: Core Loop & Voice FSM
- All Sprint 1 variables
- `OPENAI_API_KEY` (Whisper + GPT-4o)
- `FSM_RECOVERY_TIMEOUT_SEC`
- `STM_MAX_RETRY`

### Sprint 3: Member App & Confidence System
- All Sprint 2 variables
- `CONFIDENCE_T1` (confirmed threshold)
- `CONFIDENCE_T2` (hidden threshold)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (video CDN)

### Sprint 4: Billing & Coupons
- All Sprint 3 variables
- `TOSS_CLIENT_KEY` (web payment)
- `TOSS_SECRET_KEY` (server webhook verification)

### Sprint 5-6: Causal Graph Engine
- All Sprint 4 variables
- `CAUSAL_GRAPH_VERSION`
- `EDGE_CALIBRATION_BATCH_SIZE`
- `EDGE_CALIBRATION_INTERVAL_HOURS`

### Sprint 7: Verification & Finalization
- All Sprint 6 variables
- `VERIFICATION_DAILY_LIMIT_PER_PRO`
- Deployment vars: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
- Database: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`

## Environment-Specific Examples

### Development (.env.local)
```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENAI_API_KEY=sk-...
CLOUDINARY_CLOUD_NAME=hellonext-dev
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
NODE_ENV=development
DEBUG=arcup:*
CONFIDENCE_T1=0.7
CONFIDENCE_T2=0.4
```

### Staging (Vercel + Supabase)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
OPENAI_API_KEY=sk-...
CLOUDINARY_CLOUD_NAME=hellonext-staging
TOSS_PAYMENTS_CLIENT_KEY=test_ck_...
TOSS_PAYMENTS_SECRET_KEY=test_sk_...
NODE_ENV=production
VERCEL_ENV=staging
SENTRY_DSN=https://...@sentry.io/...
```

### Production (Vercel + Supabase)
All variables above, plus:
- Production Supabase URL and keys
- Production OpenAI key (same, shared)
- Production Cloudinary cloud
- Production Toss keys (live mode: without "test_" prefix)
- Production Sentry project ID
- VERCEL_ENV=production

## Security Notes

- **Never commit `.env.local`, `.env.staging`, or `.env.production`** — these contain secrets
- **Use `.env.example` and `.env.staging.example`** — these are safe to commit and serve as templates
- **Staging and Production secrets** — store in Vercel Environment Variables or Supabase dashboard, not in repo
- **Database URL** — in production, this is managed by Supabase and rarely needs manual configuration
- **Service Role Key** — only use on secure backend; never expose to client
- **Toss Payment Keys** — test keys (prefix: test_) for development/staging; live keys for production
- **OPENAI_API_KEY** — same key used across all environments (shared quota); monitor usage

## Testing & Validation

To validate environment setup:
```bash
# Check that .env.local has all required variables
npm run check-env

# Run health check endpoint
curl http://localhost:3000/api/health

# Verify Supabase connection
npx supabase status

# Test OpenAI connectivity (in dev only)
npm run test:openai-key
```
