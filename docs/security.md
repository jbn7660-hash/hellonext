# HelloNext Security Architecture Reference

HelloNext v2.0 implements comprehensive security across authentication, data access control, immutability, FSM integrity, and audit logging, extending v1.1 foundations with patent-driven protections.

## E-1. Security Layers Overview

| Layer | v1.1 Implementation | v2.0 Additions |
|-------|-------------------|-----------------|
| **Authentication** | Supabase Auth + Kakao OAuth | (unchanged) |
| **Authorization (RLS)** | 14 tables with RLS policies | +9 tables with RLS (Migration 017) |
| **Layer A Immutability** | Not implemented | UPDATE trigger block + RLS UPDATE policy absent (DC-3) |
| **Data Access Separation** | Not implemented | Hidden measurement access restricted (Patent 3 Claim 1(d)) |
| **FSM Integrity** | Not implemented | State transition guards + target_id NULL immutability (DC-5) |
| **Audit Trail** | Not implemented | voice_memo_state_log permanent retention (all FSM transitions) |
| **Edit Tracking** | Not implemented | edit_deltas permanent retention (all pro edits) |
| **API Security** | Zod schema validation + CORS | + FSM transition state guard middleware |

## E-2. DC-3 Immutability Multi-Layer Defense

Raw measurements (Layer A) are protected by four redundant mechanisms:

```
Layer A (raw_measurements) Protection:
├── 1. Database Trigger
│   └── prevent_raw_measurement_update() throws EXCEPTION on UPDATE
│
├── 2. Row-Level Security (RLS)
│   └── No UPDATE policy defined (syntactic enforcement)
│
├── 3. API Layer
│   └── No raw_measurements UPDATE endpoint exposed
│
└── 4. Type System
    └── TypeScript readonly field annotation in shared types
```

### Implementation Details

**Database Level (Migration 009)**
```sql
CREATE TRIGGER enforce_raw_measurement_immutability
    BEFORE UPDATE ON public.raw_measurements
    FOR EACH ROW EXECUTE FUNCTION public.prevent_raw_measurement_update();
```

**RLS Level (Migration 017)**
```
Only SELECT and INSERT policies defined for raw_measurements.
UPDATE and DELETE policies intentionally omitted.
```

**API Layer (apps/web/src/app/api/)**
- No `PATCH /api/measurements/:id` endpoint
- No `PUT /api/measurements/:id` endpoint
- Only `GET` and `POST` endpoints exposed

**Type Safety (packages/shared/types.ts)**
```typescript
export type RawMeasurement = {
  readonly id: UUID;
  readonly session_id: UUID;
  readonly frame_index: number;
  readonly spatial_data: readonly Keypoint[];
  readonly measurement_confidence: number;
  readonly created_at: Timestamp;
};
```

## RLS Policy Summary (Migration 017)

### Authentication-Based Policies

#### pro_profiles (Coaches)
```
SELECT: Users can view all pro profiles (public)
INSERT: Only during onboarding (user_id matches)
UPDATE: Own profile only
DELETE: Own profile only
```

#### member_profiles (Members)
```
SELECT: Own profile + coach profiles user is linked to
INSERT: Own profile during onboarding
UPDATE: Own profile only
DELETE: Own profile only
```

### Relationship Policies

#### pro_member_links (Coaching Relationships)
```
SELECT: Pro can view their own links + member can view their own links
INSERT: Pro can create links to members
DELETE: Pro or member can remove link
```

#### voice_memos (Pro Voice Notes)
```
SELECT: Creating pro only
INSERT: Creating pro only
UPDATE: (not used - memos are append-only in v1.1)
DELETE: Creating pro only
```

#### swing_videos (Member Swing Sessions)
```
SELECT: Member (self) + Pro (through pro_member_link)
INSERT: Member (self)
DELETE: Member (self)
```

#### raw_measurements (Layer A — Immutable)
```
SELECT: Pro (through swing_videos.session) + Member (if confidence >= T1)
INSERT: System only (via transcription/analysis)
UPDATE: Blocked (no policy defined)
DELETE: (no policy defined)
```

#### derived_metrics (Layer B — Recalculable)
```
SELECT: Pro (through swing_videos.session) + Member (own sessions)
INSERT: System only
UPDATE: System only (recalculation)
```

#### coaching_decisions (Layer C — Decision Layer)
```
SELECT: Pro (own decisions) + Member (own sessions)
INSERT: Pro (creating decision)
UPDATE: Pro (own decisions only)
DELETE: Pro (own decisions only)
```

#### measurement_states (3-Stage Classification)
```
SELECT: Pro (through swing_videos) + Member (if state='confirmed')
INSERT: System only (measurement-confidence engine)
UPDATE: Pro (during verification) + System
```

#### verification_queue (Pending Reviews)
```
SELECT: Pro (own queue items)
INSERT: System (when state='pending_verification')
UPDATE: Pro (confirming/correcting/rejecting)
DELETE: System (after review completion)
```

#### causal_graph_edges (Dependency DAG)
```
SELECT: All authenticated users (read-only knowledge base)
INSERT: System only
UPDATE: System only (calibration)
```

#### voice_memo_cache (FSM State)
```
SELECT: Pro (own memos)
INSERT: Pro (creating memo)
UPDATE: Pro (FSM transitions) + System (recovery)
DELETE: Pro (after finalization)
```

## Key Security Rules

### 1. Hidden Measurement Access Control
Members cannot view measurements with `state='hidden'`. Only confirmed measurements (`state='confirmed'`) are visible in member reports.

```sql
-- Example: Reports sent to members exclude hidden measurements
SELECT * FROM raw_measurements
WHERE session_id = $1
  AND measurement_id IN (
    SELECT measurement_id FROM measurement_states
    WHERE state = 'confirmed'
  )
```

### 2. FSM State Transition Guards
Voice memo FSM enforces strict state machine constraints:

**Valid Transitions:**
```
UNBOUND → PREPROCESSED (target_id must be NULL)
PREPROCESSED → LINKED (target_id must be set to valid member)
LINKED → FINALIZED (report must exist)
FINALIZED → (terminal state, no transitions)
```

**Enforced by:**
- DC-5 Trigger: `enforce_voice_cache_transitions()`
- DC-5 Trigger: `ensure_target_id_null_in_early_states()`
- API Middleware: `fsm-state-guard-middleware.ts`

### 3. Immutable Audit Trails

#### voice_memo_state_log
Records every FSM state transition. Permanent retention, append-only.
```
Columns: memo_id, from_state, to_state, metadata, timestamp
Policy: System can insert, pro can read own memos
```

#### edit_deltas
Tracks all pro edits to coaching decisions. Permanent retention.
```
Columns: decision_id, edited_fields[], original_value, edited_value, created_at
Policy: System can insert, pro can read own edits, member can audit
```

### 4. Data Layer Separation Enforcement

- **Layer A (raw_measurements)**: Immutable, never updated or deleted
- **Layer B (derived_metrics)**: Recalculable, can be rebuilt from Layer A
- **Layer C (coaching_decisions)**: Mutable by pros, audit trail via edit_deltas

Migrations 009-011 establish this separation. Migration 017 enforces via RLS.

### 5. API Security Middleware

**Zod Schema Validation**
All endpoints validate input against strict Zod schemas:
```typescript
// Example: FSM transition endpoint
const TransitionPayloadSchema = z.object({
  memo_id: z.string().uuid(),
  to_state: z.enum(['PREPROCESSED', 'LINKED', 'FINALIZED']),
  target_id: z.string().uuid().optional(),
});
```

**CORS Configuration**
- Vercel CDN origins only
- No credentials in cross-origin requests
- Supabase function signing

**FSM State Guard Middleware**
Applied to all voice-fsm-controller endpoints:
```typescript
// Validates state transition legality before API call
export const fsm_state_guard = async (req, res, next) => {
  const { memo_id, to_state } = req.body;
  const current = await db.get_voice_memo_state(memo_id);
  if (!VALID_TRANSITIONS[current.state]?.includes(to_state)) {
    return res.status(400).json({ error: 'Invalid FSM transition' });
  }
  next();
};
```

## Security Checklist

- [ ] All environment variables in `.env.local` (never committed)
- [ ] RLS policies enabled on all tables (verified in Supabase console)
- [ ] raw_measurements table UPDATE trigger active
- [ ] CORS headers properly configured for Vercel deployment
- [ ] Sentry DSN configured to capture FSM transition violations
- [ ] Edit deltas query logs for audit trail access
- [ ] voice_memo_state_log retention policy set to indefinite
- [ ] API keys rotated quarterly
- [ ] Database backups automated (Supabase default)
- [ ] Service role key accessible only in server-side code

## Threat Model

### Data Confidentiality (Member Privacy)
**Threat**: Pro accesses member data without authorization
**Mitigations**:
- RLS policies enforce pro-member link existence
- hidden measurements filtered from member-facing reports
- Supabase Realtime limited to authorized subscribers

### Layer A Integrity
**Threat**: Accidental or malicious modification of raw measurements
**Mitigations**:
- Database trigger prevents UPDATE
- Type system enforces readonly
- No API endpoint exposes UPDATE
- Audit trail records any attempted violations

### FSM Safety
**Threat**: Voice memo transitions to invalid states (e.g., FINALIZED before LINKED)
**Mitigations**:
- State guard triggers enforce valid transitions
- Middleware validates before API execution
- state_log provides forensic trail

### Audit Trail Tampering
**Threat**: Edit deltas or state logs deleted or modified
**Mitigations**:
- Append-only tables (no UPDATE/DELETE on history)
- Permanent retention policy (no auto-expiry)
- RLS prevents unauthorized reads

## Related Documentation

- Architecture: see `/HelloNext_Phase3_v2.0_아키텍처.md` §E for full technical specs
- Environment Variables: see `env_vars.md` for security-related config
- API Specification: see `api_spec.md` for endpoint authentication requirements
- Database Migrations: see `apps/supabase/migrations/017_patent_rls_policies.sql` for RLS details
