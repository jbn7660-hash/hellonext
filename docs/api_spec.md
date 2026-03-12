# HelloNext API Specification Reference

Complete specification of REST API routes and Edge Functions for HelloNext v2.0, organized by feature and sprint.

## API Routes Overview

19 actual API routes implemented across 6 categories. All routes use Next.js 14 App Router and return JSON error format: `{ error: { code: string, message: string, details?: unknown } }`.

## Core API Routes

### System & Health

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/health` | GET | System health check (Supabase, external APIs) | No | ✅ Implemented | Sprint 3 |

**Method Signature**:
```typescript
export async function GET(request: NextRequest): Promise<NextResponse>
```

---

### Voice Memos (F-001, F-003, F-017)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/voice-memos` | GET | List pro's voice memos (paginated, with status filter) | Yes (Pro) | ✅ Implemented | Sprint 2 |
| `/api/voice-memos` | POST | Create new memo + trigger transcription pipeline | Yes (Pro) | ✅ Implemented | Sprint 2 |
| `/api/voice-memos/[id]` | GET | Get single memo details with transcript + report | Yes (Pro) | ✅ Implemented | Sprint 2 |
| `/api/voice-memos/[id]` | PATCH | Update memo (assign member, edit transcript, change status) | Yes (Pro) | ✅ Implemented | Sprint 2 |

**GET /api/voice-memos** Signature:
```typescript
// Query params: page (0+), limit (1-50, default 20), orphan (boolean), status, member_id
export async function GET(request: NextRequest): Promise<NextResponse>
```

**POST /api/voice-memos** Signature:
```typescript
// Body: { audio_url: string, duration_sec: number, member_id?: uuid }
export async function POST(request: NextRequest): Promise<NextResponse>
```

**GET /api/voice-memos/[id]** Signature:
```typescript
type RouteParams = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse>
```

**PATCH /api/voice-memos/[id]** Signature:
```typescript
// Body: { member_id?, status?, transcript?, structured_json? }
export async function PATCH(_request: NextRequest, { params }: RouteParams): Promise<NextResponse>
```

---

### Reports (F-001)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/reports/[id]` | GET | Get report details (content, error tags, metadata) | Yes (Pro/Member) | ✅ Implemented | Sprint 2 |
| `/api/reports/[id]` | PATCH | Update report (title, content, homework, error_tags, status) | Yes (Pro) | ✅ Implemented | Sprint 2 |
| `/api/reports/[id]/publish` | POST | Publish draft report to member (status → published, trigger notification) | Yes (Pro) | ✅ Implemented | Sprint 2 |

**GET /api/reports/[id]** Signature:
```typescript
type RouteParams = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse>
```

**PATCH /api/reports/[id]** Signature:
```typescript
// Body: { title?, content?, homework?, error_tags?, status?: 'draft'|'published'|'read' }
export async function PATCH(_request: NextRequest, { params }: RouteParams): Promise<NextResponse>
```

**POST /api/reports/[id]/publish** Signature:
```typescript
// No body required
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse>
```

---

### Members (F-002)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/members` | GET | List all members linked to current pro (with activity summary) | Yes (Pro) | ✅ Implemented | Sprint 2 |

**GET /api/members** Signature:
```typescript
// Query params: optional filtering
export async function GET(request: NextRequest): Promise<NextResponse>
```

Returns members with latest report, feel-check, and activity timestamps.

---

### Progress & Analytics (F-010)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/progress` | GET | Aggregated progress stats for member (range: 1w, 1m, 3m, all) | Yes (Member) | ✅ Implemented | Sprint 4 |

**GET /api/progress** Signature:
```typescript
// Query params: range = '1w'|'1m'|'3m'|'all' (default: '1m')
export async function GET(request: NextRequest): Promise<NextResponse>
```

Returns metrics: video count, feel checks, consistency, improvement trend, error pattern changes.

---

### Feel Checks (F-005)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/feel-checks` | GET | List feel checks for current member (paginated) | Yes (Member) | ✅ Implemented | Sprint 3 |
| `/api/feel-checks` | POST | Create feel check entry (good, unsure, off) | Yes (Member) | ✅ Implemented | Sprint 3 |

**GET /api/feel-checks** Signature:
```typescript
// Query params: page, limit, swing_video_id (filter)
export async function GET(request: NextRequest): Promise<NextResponse>
```

**POST /api/feel-checks** Signature:
```typescript
// Body: { swing_video_id: uuid, feeling: 'good'|'unsure'|'off', notes?: string (max 200) }
export async function POST(request: NextRequest): Promise<NextResponse>
```

---

### Swing Videos (F-004, F-005, F-009)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/swing-videos` | GET | List videos (member: own, pro: linked members) with poses | Yes (Member/Pro) | ✅ Implemented | Sprint 3 |
| `/api/swing-videos` | POST | Upload swing video to Cloudinary + create DB record | Yes (Member) | ✅ Implemented | Sprint 3 |

**GET /api/swing-videos** Signature:
```typescript
// Query params: member_id (pro only), page, limit, date_range
export async function GET(request: NextRequest): Promise<NextResponse>
```

**POST /api/swing-videos** Signature:
```typescript
// FormData: { video: File (max 100MB, max 60sec), member_id?: uuid }
const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/.../video/upload';
const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_VIDEO_DURATION_SEC = 60;
const ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];

export async function POST(request: NextRequest): Promise<NextResponse>
```

---

### Subscriptions (F-008)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/subscriptions` | GET | Get current subscription status + billing history | Yes (Member) | ✅ Implemented | Sprint 4 |
| `/api/subscriptions` | POST | Create or update subscription (Toss billing key registration) | Yes (Member) | ✅ Implemented | Sprint 4 |
| `/api/subscriptions` | DELETE | Cancel subscription (with grace period logic) | Yes (Member) | ✅ Implemented | Sprint 4 |

**GET /api/subscriptions** Signature:
```typescript
export async function GET(request: NextRequest): Promise<NextResponse>
```

**POST /api/subscriptions** Signature:
```typescript
// Body: { authKey: string, customerKey: string, plan_id: 'pro'|'academy' }
export async function POST(request: NextRequest): Promise<NextResponse>
```

Features: plan transition validation, 7-day grace period, proration calculation, reactivation support.

**DELETE /api/subscriptions** Signature:
```typescript
export async function DELETE(request: NextRequest): Promise<NextResponse>
```

---

### Notifications (F-014)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/notifications` | GET | List user's notifications (paginated, unread filter) | Yes | ✅ Implemented | Sprint 3 |
| `/api/notifications` | POST | Mark notifications as read (batch) | Yes | ✅ Implemented | Sprint 3 |

**GET /api/notifications** Signature:
```typescript
// Query params: page (1+), unread (boolean filter)
const PAGE_SIZE = 20;
export async function GET(request: NextRequest): Promise<NextResponse>
```

**POST /api/notifications** Signature:
```typescript
// Body: { notification_ids: string[] }
export async function POST(request: NextRequest): Promise<NextResponse>
```

---

### Push Notifications (F-014, Mobile Support)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/push-subscribe` | POST | Save push notification subscription (web/mobile) to DB | Yes | ✅ Implemented | Sprint 3 |

**POST /api/push-subscribe** Signature:
```typescript
// Body: { subscription: PushSubscriptionJSON } (Web Push API format)
export async function POST(request: NextRequest): Promise<NextResponse>
```

Stores web push and mobile push (Expo) tokens for multi-channel notifications.

---

### Payments & Billing (F-008, F-012)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/payments` | POST | Create payment intent (Toss Payments webhook prep) | Yes (Member) | ✅ Implemented | Sprint 4 |
| `/api/payments/webhook` | POST | Toss payment webhook handler (payment confirmation) | No (Toss signature auth) | ✅ Implemented | Sprint 4 |

**POST /api/payments** Signature:
```typescript
// Body: { orderId: string, amount: number, planId: string }
export async function POST(request: NextRequest): Promise<NextResponse>
```

**POST /api/payments/webhook** Signature:
```typescript
// Raw body: Toss payment confirmation
// Validates: HMAC signature (TOSS_SECRET_KEY)
export async function POST(request: NextRequest): Promise<NextResponse>
```

---

### AI Scope Settings (F-013)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/ai-scope` | GET | Get scope settings for a pro-member pair (hidden patterns, tone) | Yes (Pro) | ✅ Implemented | Sprint 3 |
| `/api/ai-scope` | POST | Create/update scope settings (pattern filters, coaching tone) | Yes (Pro) | ✅ Implemented | Sprint 3 |

**GET /api/ai-scope** Signature:
```typescript
// Query params: member_id (required uuid)
export async function GET(request: NextRequest): Promise<NextResponse>
```

**POST /api/ai-scope** Signature:
```typescript
// Body: { member_id: uuid, hidden_patterns?: string[] (EP-NNN format), tone_level?: 'observe_only'|'gentle_suggest'|'specific_guide' }
export async function POST(request: NextRequest): Promise<NextResponse>
```

---

### Causal Analysis (F-015, DC-4)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/causal-analysis` | GET | Retrieve existing causal analysis for a session | Yes (Pro) | ✅ Implemented | Sprint 5 |
| `/api/causal-analysis` | POST | Trigger causal analysis (builds DAG, computes IIS, selects Primary Fix) | Yes (Pro) | ✅ Implemented | Sprint 5 |

**GET /api/causal-analysis** Signature:
```typescript
// Query params: session_id (required uuid)
export async function GET(request: NextRequest): Promise<NextResponse>
```

**POST /api/causal-analysis** Signature:
```typescript
// Body: { session_id: uuid, force_rerun?: boolean }
// Calls Edge Function to implement Patent 1 Claim 1(e): DAG build, IIS computation, primary_fix scalar
export async function POST(request: NextRequest): Promise<NextResponse>
```

---

### Edit Deltas (F-015, Patent 1)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/edit-deltas` | POST | Record pro edit to coaching decision (for causal calibration) | Yes (Pro) | ✅ Implemented | Sprint 6 |

**POST /api/edit-deltas** Signature:
```typescript
// Body: { decision_id: uuid, field_changed: string, old_value, new_value, reason?: string }
export async function POST(request: NextRequest): Promise<NextResponse>
```

Stores edits for Edge Function edge-weight-calibration to reweight causal graph edges.

---

### Coupons & PLG (F-012)

| Path | Method | Description | Auth | Status | Introduced |
|------|--------|-------------|------|--------|------------|
| `/api/coupons` | GET | List pro's coupons (for pro) or member's activated coupons (for member) | Yes | ✅ Implemented | Sprint 4 |
| `/api/coupons` | POST | Generate new coupon codes (pro only, batch support) | Yes (Pro) | ✅ Implemented | Sprint 4 |
| `/api/coupons/[code]/redeem` | POST | Member redeems a coupon code | Yes (Member) | ✅ Implemented | Sprint 4 |

**GET /api/coupons** Signature:
```typescript
// Query params: source, code (search), format (csv export)
export async function GET(request: NextRequest): Promise<NextResponse>
```

Features: SQL aggregation, partial code search, CSV export, batch status updates, pro member capacity verification.

**POST /api/coupons** Signature:
```typescript
// Body: { quantity: number (1-30), source: 'plg_free'|'purchased_bundle', bundle_order_id?: uuid }
export async function POST(request: NextRequest): Promise<NextResponse>
```

**POST /api/coupons/[code]/redeem** Signature:
```typescript
// Body: {} (code in path)
type RouteParams = { params: Promise<{ code: string }> };
export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse>
```

---

## Edge Functions (Supabase)

11 Edge Functions implement AI pipelines, FSM orchestration, and background processing. All use:
- **Runtime**: Deno with TypeScript
- **Authentication**: Supabase Auth token in `Authorization: Bearer` header
- **Validation**: Zod schemas (where used)
- **Error Handling**: Standard error response with error_code and message
- **Logging**: Structured logging to Sentry
- **Monitoring**: Progress broadcasting via Supabase Realtime

---

### voice-transcribe (F-001, Patent 4)

**Trigger**: Pro uploads audio file (mobile or web)
**Input**: FormData { audio: File, voice_memo_id: string, duration: string }
**Output**: { transcript, confidence, segments, language }
**Related**: Patent 4 FSM (UNBOUND → PREPROCESSED transition)

```typescript
/**
 * Receives audio file, sends to OpenAI Whisper API.
 * Returns transcription. Updates transcription_jobs table.
 * Patent 4 FSM: Triggers UNBOUND → PREPROCESSED transition.
 *
 * POST /functions/v1/voice-transcribe
 */
export async function serve(req: Request): Promise<Response>
```

**Integrations**: OpenAI Whisper (STT), Supabase DB
**Status**: ✅ Implemented
**Sprint**: 2

---

### voice-to-report (F-001, Sprint 2)

**Trigger**: Pro's memo ready for transcription (after voice-transcribe completes)
**Input**: { memo_id: uuid, transcript: string, member_id: uuid, pro_glossary: string[] }
**Output**: { report_id: uuid, ai_observation: string, status: string }
**Related**: F-001 (voice-to-report pipeline), DC-5 (FSM)

```typescript
/**
 * Transforms pro's voice memo into structured coaching report.
 * Pipeline:
 * 1. Transcribe audio via OpenAI Whisper
 * 2. Fetch pro's glossary for normalization
 * 3. Structure transcript via LLM (GPT-4o)
 * 4. Generate report draft with error pattern tagging
 * 5. Update DB + broadcast via Realtime
 *
 * POST /functions/v1/voice-to-report
 */
export async function serve(req: Request): Promise<Response>
```

**Integrations**: OpenAI Whisper + GPT-4o, Supabase DB, Realtime
**Status**: ✅ Implemented
**Sprint**: 2

---

### swing-analysis (F-003, F-013, Sprint 3)

**Trigger**: Member uploads swing video (after MediaPipe pose extraction)
**Input**: { video_id: uuid, member_id: uuid, pose_data: Keypoint[][], feel_check?: string }
**Output**: { ai_observation: string, error_patterns: EP[], status: string }
**Related**: F-005 (swing analysis), DC-1 (3-layer data), DC-2 (confidence)

```typescript
/**
 * Processes swing video pose data + generates AI observations.
 * Pipeline:
 * 1. Receive pose_data (keypoints per frame)
 * 2. Fetch AI scope settings (F-013) for pro-member pair
 * 3. Compute swing metrics (joint angles, tempo, position markers)
 * 4. Generate AI observation via GPT-4o ("curious observer" tone)
 * 5. Store ai_observation + update swing_video status
 * 6. Broadcast result via Realtime
 *
 * POST /functions/v1/swing-analysis
 */
export async function serve(req: Request): Promise<Response>
```

**Integrations**: MediaPipe BlazePose (client-side), GPT-4o, Supabase DB, Realtime
**Status**: ✅ Implemented
**Sprint**: 3

---

### measurement-confidence (F-016, Patent 3)

**Trigger**: Pose measurements created (Layer A raw measurements)
**Input**: { measurement_id: uuid, joint_visibility: number, stability: number, camera_angle: number, ... }
**Output**: { confidence_score: number (0.0-1.0), state: 'confirmed'|'pending_verification'|'hidden', verification_token?: string }
**Related**: Patent 3 Claim 1(e) (DC-2), F-016 (verification queue)

```typescript
/**
 * Calculates confidence scores for motion capture measurements.
 * Classifies into confirmed/pending_verification/hidden states.
 * Per Patent 3 Claim 1(e): 5-factor confidence formula.
 * Thresholds: T1=0.7 (confirmed), T2=0.4 (hidden).
 * Issues verification tokens for pending_verification measurements.
 *
 * POST /functions/v1/measurement-confidence
 */
export async function serve(req: Request): Promise<Response>
```

**Integrations**: Supabase DB, verification queue
**Status**: ✅ Implemented
**Sprint**: 3

---

### causal-analysis (F-015, Patent 1)

**Trigger**: Pro requests analysis of coaching session or manual API call
**Input**: { session_id: uuid, force_rerun?: boolean }
**Output**: { primary_fix: string (scalar, DC-4), iis_scores: Map<error_id, number>, dag_version: string }
**Related**: Patent 1 Claim 1(e) (DC-4 scalar primary fix), F-015 (causal graph)

```typescript
/**
 * Implements causal graph engine for symptom analysis + primary fix identification.
 * Per Patent 1 Claim 1(e): Builds Layer A → Layer B dependency model.
 * Runs reverse traversal through DAG, computes IIS.
 * Selects Primary Fix as scalar value per DC-4.
 *
 * Features:
 * - Input validation (session_id format, existence)
 * - Cycle detection (DFS-based)
 * - IIS precision [0.0, 1.0] with 4 decimals
 * - DC-4 scalar primary_fix with deterministic tiebreaker
 * - Progress broadcasting via Realtime
 * - Idempotency with force_rerun option
 * - Batch safety (MAX_NODES=100)
 *
 * POST /functions/v1/causal-analysis
 */
export async function serve(req: Request): Promise<Response>
```

**Integrations**: Supabase DB, Realtime, Sentry
**Status**: ✅ Implemented
**Sprint**: 5-6

---

### edge-weight-calibration (F-015, Patent 1, AC-4)

**Trigger**: Scheduled job (EDGE_CALIBRATION_INTERVAL_HOURS) or manual API call
**Input**: { batch_size: number, force_run?: boolean, dry_run?: boolean }
**Output**: { calibrated_edges: number, converged: boolean, stats: { ... } }
**Related**: Patent 1 Claim 1(e) AC-4, F-015 (causal graph recalibration)

```typescript
/**
 * Batch calibration of causal graph edge weights based on edit deltas.
 * Per Patent 1 Claim 1(e) AC-4: Loads unprocessed edit_deltas.
 * Groups by causal path, applies tier-weighted coefficients.
 * Updates edge weights in causal graph.
 *
 * Features:
 * - Input validation (batch_size 1-500)
 * - Stale delta protection (90-day window)
 * - Weight convergence tracking (< 0.001)
 * - Calibration history logging
 * - Concurrency safety (SELECT ... FOR UPDATE)
 * - Statistical validation (2-sigma outlier detection)
 * - Dry-run mode
 *
 * POST /functions/v1/edge-weight-calibration
 */
export async function serve(req: Request): Promise<Response>
```

**Integrations**: Supabase DB, Sentry
**Status**: ✅ Implemented
**Sprint**: 6

---

### voice-fsm-controller (F-017, Patent 4, DC-5)

**Trigger**: Pro advances voice memo state (state transition request)
**Input**: { memo_id: uuid, to_state: 'PREPROCESSED'|'LINKED'|'FINALIZED', target_id?: uuid }
**Output**: { memo_id: uuid, state: string, state_log_id: uuid, metadata: { transition_time_ms: number } }
**Related**: Patent 4 Claim 1(e) (voice FSM), DC-5 (4-state FSM), F-017 (FSM orchestration)

```typescript
/**
 * Manages 4-state finite state machine for voice memo processing.
 * States: UNBOUND → PREPROCESSED → LINKED → FINALIZED
 *
 * Per Patent 4 Claim 1: Voice memos with inline target binding.
 * State recovery and transcript caching prevent duplicate processing.
 *
 * Guard rails:
 * - UNBOUND→PREPROCESSED: target_id must be NULL
 * - PREPROCESSED→LINKED: target_id required, validates member_id
 * - LINKED→FINALIZED: validates report exists and is published
 * - Recovery mechanism: FSM_RECOVERY_TIMEOUT_SEC resets stalled states
 *
 * POST /functions/v1/voice-fsm-controller
 */
type FSMState = 'UNBOUND' | 'PREPROCESSED' | 'LINKED' | 'FINALIZED';
export async function serve(req: Request): Promise<Response>
```

**Integrations**: Supabase DB, Sentry, Realtime
**Status**: ✅ Implemented
**Sprint**: 2

---

### verification-handler (F-016, Patent 3, AC-5)

**Trigger**: Pro responds to pending measurement verification request
**Input**: { verification_token: string, response: 'confirm'|'correct'|'reject', corrected_value?: number }
**Output**: { measurement_id: uuid, new_state: string, audit_log_id: uuid }
**Related**: Patent 3 Claim 1(e) AC-5, F-016 (verification queue)

```typescript
/**
 * Processes pro verification responses for pending measurements.
 * Per Patent 3 Claim 1(e) AC-5:
 * - confirm: moves to 'confirmed' state
 * - correct: updates value + moves to 'confirmed' state
 * - reject: moves to 'hidden' state
 *
 * Validates verification token and measurement state.
 * Logs audit trail for compliance.
 *
 * POST /functions/v1/verification-handler
 */
type VerificationResponseType = 'confirm' | 'correct' | 'reject';
export async function serve(req: Request): Promise<Response>
```

**Integrations**: Supabase DB, Sentry
**Status**: ✅ Implemented
**Sprint**: 3-7

---

### send-notification (F-014, F-011)

**Trigger**: Report published, verification request created, coupon available, etc.
**Input**: { user_ids: string[], template: string, variables: {}, priority?: 'urgent'|'high'|'normal'|'low' }
**Output**: { notification_ids: string[], channels_sent: string[], status: string }
**Related**: F-011 (notification system), F-014 (notifications)

```typescript
/**
 * Advanced multi-channel notification dispatcher:
 * 1. In-app notification (always — stored in notifications table)
 * 2. Kakao Alimtalk (if enabled + phone verified + not quiet hours)
 * 3. Push notification (if FCM token registered + not quiet hours)
 *
 * Features:
 * - Template-based messages with variable substitution
 * - Batching (multiple user_ids in single call)
 * - Priority-based channel selection
 * - Quiet hours respect (22:00-07:00 local timezone)
 * - Retry with exponential backoff
 * - Delivery status tracking per channel
 * - User notification preference checks
 * - Rate limiting: max 100 per user per day
 * - Korean templates + full language support
 *
 * Called internally from other Edge Functions / API routes.
 *
 * POST /functions/v1/send-notification
 */
export async function serve(req: Request): Promise<Response>
```

**Integrations**: Kakao AlimTalk API, Firebase Cloud Messaging, Supabase DB
**Status**: ✅ Implemented
**Sprint**: 2

---

### push-send (F-014, Mobile)

**Trigger**: High-priority notifications (real-time), backup channel
**Input**: { user_ids: string[], title: string, body: string, data?: Record, type?: string, badge?: number }
**Output**: { sent: number, failed: number, errors: { [user_id]: string }[] }
**Related**: F-014 (push notifications), multi-channel notifications

```typescript
/**
 * Sends push notifications via Expo Push API (mobile) + Web Push API (web).
 * Called by other Edge Functions or DB triggers.
 *
 * Features:
 * - Multi-platform support (Expo, Web Push)
 * - Retry with exponential backoff
 * - Delivery token management
 * - Invalid token cleanup
 * - Batch processing
 *
 * POST /functions/v1/push-send
 */
interface PushPayload {
  user_ids: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  type?: string;
  badge?: number;
  sound?: string;
}
export async function serve(req: Request): Promise<Response>
```

**Integrations**: Expo Push API, Web Push API, Supabase DB
**Status**: ✅ Implemented
**Sprint**: 3

---

### coupon-activate (F-012, PLG)

**Trigger**: Member clicks "Redeem Coupon" or API POST
**Input**: { coupon_code: string, member_id?: uuid } (or batch: { codes: string[] })
**Output**: { coupon_id: uuid, discount_percent: number, valid_until: ISO8601, status: string }
**Related**: F-012 (coupon management), PLG revenue model

```typescript
/**
 * Handles PLG coupon lifecycle:
 * - Generate unique coupon codes (with collision prevention)
 * - Activate coupon when member redeems (with expiry enforcement)
 * - Track usage + expiry (90 days from activation)
 * - Audit trail logging for all state changes
 *
 * Features:
 * - Batch generation with collision prevention (retry up to 5 times)
 * - Expiry enforcement before redemption
 * - Atomic redeem operations using RPC
 * - Input sanitization (uppercase, remove spaces/dashes)
 * - Audit logging to coupon_audit_log table
 * - Rate limiting (max 10 redemptions per member per hour)
 *
 * POST /functions/v1/coupon-activate
 */
export async function serve(req: Request): Promise<Response>
```

**Integrations**: Supabase DB, RPC functions
**Status**: ✅ Implemented
**Sprint**: 4

---

## Summary Statistics

| Category | Count | Status |
|----------|-------|--------|
| **API Routes** | 19 | 19 Implemented ✅ |
| **Edge Functions** | 11 | 11 Implemented ✅ |
| **Total Endpoints** | 30 | 30 Implemented ✅ |
| **Sprints Covered** | 2-7 | Phased rollout |

## Error Response Format

All API routes and Edge Functions return errors in this format:

```typescript
interface ErrorResponse {
  error: {
    code: string;        // machine-readable error code (e.g., 'UNAUTHORIZED', 'INVALID_VOICE_MEMO_ID')
    message: string;     // human-readable message
    details?: unknown;   // optional additional data for debugging
  };
}
```

**Common HTTP Status Codes**:
- `200 OK` — Success
- `201 Created` — Resource created
- `400 Bad Request` — Validation error
- `401 Unauthorized` — Missing auth or invalid token
- `403 Forbidden` — Auth valid but insufficient permissions
- `404 Not Found` — Resource not found
- `409 Conflict` — State conflict (e.g., coupon expired)
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Server error
- `503 Service Unavailable` — External dependency (OpenAI, Toss, etc.) unavailable

## Authentication

- **Routes marked `Yes (Pro)`** — Requires Supabase auth + pro_profiles record
- **Routes marked `Yes (Member)`** — Requires Supabase auth + member_profiles record
- **Routes marked `Yes`** — Any authenticated user
- **Routes marked `No`** — Public or Toss signature verification

Get auth token:
```typescript
const { data: { user } } = await supabase.auth.getUser();
// Pass in Authorization: Bearer <token> header for Edge Functions
```

## Deployment & Monitoring

- **API Routes**: Deployed via Vercel (auto from `git push`)
- **Edge Functions**: Deployed via Supabase CLI (`supabase functions deploy`)
- **Logs**: Sentry for errors, CloudWatch for performance
- **Health Check**: `/api/health` endpoint (returns 200 if all systems green)
