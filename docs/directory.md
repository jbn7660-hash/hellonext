# HelloNext Directory Structure Reference

This document describes the **ACTUAL** directory structure of the HelloNext codebase as implemented. It reflects Phase 3 v2.0 architecture with patent design constraints, plus Phase 5+ enhancements including mobile app, PWA, monitoring, and additional Edge Functions.

## Complete Directory Tree (ACTUAL)

```
ARCUP/
├── .github/
│   └── workflows/
│       ├── ci.yml                              # [ACTUAL] Build/test CI for web
│       ├── deploy.yml                          # [ACTUAL] Deploy to Vercel
│       ├── mobile-ci.yml                       # [ACTUAL v2.0] Expo mobile build CI
│       ├── patent-regression.yml               # [ACTUAL v2.0] Patent engine regression tests
│       └── WORKFLOW_V2_MIGRATION_GUIDE.md      # [ACTUAL] Migration from v1 workflows
│
├── apps/
│   ├── mobile/                                 # [ACTUAL v2.0] Expo React Native app
│   │   ├── src/
│   │   │   ├── screens/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── login-screen.tsx        # [ACTUAL] OAuth login
│   │   │   │   │   └── onboarding-screen.tsx   # [ACTUAL] Role selection + KYC
│   │   │   │   ├── member/
│   │   │   │   │   ├── home-screen.tsx         # [ACTUAL] Member dashboard
│   │   │   │   │   ├── practice-screen.tsx     # [ACTUAL] Camera + pose + feel-check
│   │   │   │   │   ├── profile-screen.tsx      # [ACTUAL] User profile
│   │   │   │   │   └── progress-screen.tsx     # [ACTUAL] Charts + analytics
│   │   │   │   └── pro/
│   │   │   │       ├── dashboard-screen.tsx    # [ACTUAL] Pro member list
│   │   │   │       ├── members-screen.tsx      # [ACTUAL] Member management
│   │   │   │       ├── reports-screen.tsx      # [ACTUAL] Report list
│   │   │   │       └── settings-screen.tsx     # [ACTUAL] Pro settings
│   │   │   ├── components/
│   │   │   │   ├── swing/
│   │   │   │   │   └── swing-camera.tsx        # [ACTUAL] Camera integration
│   │   │   │   ├── ui/
│   │   │   │   │   ├── button.tsx
│   │   │   │   │   └── theme.ts                # [ACTUAL] Tamagui theme
│   │   │   │   └── voice/
│   │   │   │       └── voice-recorder-fab.tsx  # [ACTUAL] FAB recorder
│   │   │   ├── services/
│   │   │   │   ├── camera-service.ts           # [ACTUAL] Expo Camera wrapper
│   │   │   │   ├── push-notification-service.ts # [ACTUAL] FCM integration
│   │   │   │   └── stt-service.ts              # [ACTUAL] Whisper API calls
│   │   │   ├── stores/
│   │   │   │   └── auth-store.ts               # [ACTUAL] Zustand auth
│   │   │   ├── navigation/
│   │   │   │   └── root-navigator.tsx          # [ACTUAL] React Navigation setup
│   │   │   └── lib/
│   │   │       └── supabase/
│   │   │           └── client.ts               # [ACTUAL] Supabase JS client
│   │   ├── App.tsx                             # [ACTUAL] Root component
│   │   ├── app.json                            # [ACTUAL] Expo config
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── babel.config.js
│   │   ├── metro.config.js
│   │   ├── eas.json                            # [ACTUAL] Expo Application Services config
│   │   └── __tests__/
│   │       └── services.test.ts                # [ACTUAL] Service layer tests
│   │
│   └── web/
│       ├── public/
│       │   ├── manifest.json                   # [ACTUAL] PWA manifest
│       │   ├── sw.js                           # [ACTUAL] Service worker
│       │   └── icons/                          # [ACTUAL] PWA icons
│       ├── src/
│       │   ├── app/                            # [ACTUAL] Next.js 14 App Router
│       │   │   ├── (auth)/
│       │   │   │   ├── login/page.tsx          # [ACTUAL] Auth page
│       │   │   │   └── callback/route.ts       # [ACTUAL] OAuth callback
│       │   │   ├── (pro)/
│       │   │   │   ├── layout.tsx              # [ACTUAL] Pro layout wrapper
│       │   │   │   ├── dashboard/page.tsx      # [ACTUAL] Pro dashboard
│       │   │   │   ├── reports/page.tsx        # [ACTUAL] Report list
│       │   │   │   ├── reports/[id]/page.tsx   # [ACTUAL] Report detail viewer
│       │   │   │   ├── reports/[id]/publish/route.ts # [ACTUAL] Publish API
│       │   │   │   ├── members/
│       │   │   │   │   └── [id]/
│       │   │   │   │       └── ai-scope/page.tsx # [ACTUAL] AI Scope tool
│       │   │   │   ├── coupons/page.tsx        # [ACTUAL] Coupon management
│       │   │   │   └── subscription/page.tsx   # [ACTUAL] Billing dashboard
│       │   │   ├── (member)/
│       │   │   │   ├── layout.tsx              # [ACTUAL] Member layout wrapper
│       │   │   │   ├── practice/page.tsx       # [ACTUAL] Practice session
│       │   │   │   ├── progress/page.tsx       # [ACTUAL] Progress charts
│       │   │   │   ├── swingbook/page.tsx      # [ACTUAL] Video library
│       │   │   │   └── redeem/page.tsx         # [ACTUAL] Coupon redeem page
│       │   │   ├── api/
│       │   │   │   ├── ai-scope/route.ts       # [ACTUAL] AI scope analysis API
│       │   │   │   ├── causal-analysis/route.ts # [ACTUAL] Causal graph query
│       │   │   │   ├── coupons/route.ts        # [ACTUAL] List coupons
│       │   │   │   ├── coupons/[code]/redeem/route.ts # [ACTUAL] Redeem coupon
│       │   │   │   ├── edit-deltas/route.ts    # [ACTUAL] Record edit deltas
│       │   │   │   ├── feel-checks/route.ts    # [ACTUAL] Feel check log
│       │   │   │   ├── health/route.ts         # [ACTUAL] Health check endpoint
│       │   │   │   ├── members/route.ts        # [ACTUAL] List members
│       │   │   │   ├── notifications/route.ts  # [ACTUAL] Notifications API
│       │   │   │   ├── payments/route.ts       # [ACTUAL] Create payment intent
│       │   │   │   ├── payments/webhook/route.ts # [ACTUAL] Toss webhook
│       │   │   │   ├── progress/route.ts       # [ACTUAL] Get progress metrics
│       │   │   │   ├── push-subscribe/route.ts # [ACTUAL] Subscribe to push
│       │   │   │   ├── subscriptions/route.ts  # [ACTUAL] Query subscriptions
│       │   │   │   ├── swing-videos/route.ts   # [ACTUAL] Upload swing video
│       │   │   │   └── voice-memos/
│       │   │   │       ├── route.ts            # [ACTUAL] List voice memos
│       │   │   │       └── [id]/route.ts       # [ACTUAL] Get/delete voice memo
│       │   │   ├── offline/page.tsx            # [ACTUAL v2.0] Offline fallback
│       │   │   ├── layout.tsx                  # [ACTUAL] Root layout
│       │   │   └── middleware.ts               # [ACTUAL] Route auth guard
│       │   │
│       │   ├── components/
│       │   │   ├── ui/
│       │   │   │   ├── button.tsx
│       │   │   │   ├── empty-state.tsx         # [ACTUAL] Empty state UI
│       │   │   │   ├── loading-spinner.tsx     # [ACTUAL] Loading indicator
│       │   │   │   ├── bottom-sheet.tsx        # [ACTUAL] Mobile sheet
│       │   │   │   └── ...other primitives
│       │   │   ├── member/
│       │   │   │   └── confidence-indicator.tsx # [ACTUAL v2.0] Confidence badge
│       │   │   ├── practice/
│       │   │   │   └── feel-check.tsx          # [ACTUAL] Post-swing survey
│       │   │   ├── pro/
│       │   │   │   ├── causal-graph-viewer.tsx # [ACTUAL v2.0] DAG visualization
│       │   │   │   ├── primary-fix-badge.tsx   # [ACTUAL v2.0] Primary fix highlight
│       │   │   │   ├── edit-delta-history.tsx  # [ACTUAL v2.0] Edit delta timeline
│       │   │   │   └── verification-card.tsx   # [ACTUAL v2.0] Verification queue card
│       │   │   ├── report/
│       │   │   │   └── report-viewer.tsx       # [ACTUAL] Report display
│       │   │   ├── swing/
│       │   │   │   ├── swing-camera.tsx        # [ACTUAL] Live camera + MediaPipe
│       │   │   │   └── video-dropzone.tsx      # [ACTUAL] Video upload zone
│       │   │   ├── voice/
│       │   │   │   ├── voice-fab.tsx           # [ACTUAL] Recording FAB button
│       │   │   │   └── orphan-memo-sheet.tsx   # [ACTUAL v2.0] Unmatched memo UI
│       │   │   ├── notification/
│       │   │   │   └── notification-center.tsx # [ACTUAL] Notification UI
│       │   │   └── pwa/
│       │   │       ├── pwa-provider.tsx        # [ACTUAL v2.0] PWA context
│       │   │       ├── install-prompt.tsx      # [ACTUAL v2.0] Install banner
│       │   │       ├── update-prompt.tsx       # [ACTUAL v2.0] Update notification
│       │   │       └── offline-indicator.tsx   # [ACTUAL v2.0] Offline status
│       │   │
│       │   ├── hooks/
│       │   │   ├── use-auth.ts                 # [ACTUAL] Auth state hook
│       │   │   ├── use-causal-graph.ts         # [ACTUAL v2.0] Causal graph hook
│       │   │   ├── use-mediapipe-pose.ts       # [ACTUAL] Pose estimation hook
│       │   │   ├── use-pwa.ts                  # [ACTUAL v2.0] PWA lifecycle hook
│       │   │   ├── use-realtime.ts             # [ACTUAL] Supabase Realtime hook
│       │   │   ├── use-subscription.ts         # [ACTUAL] Subscription status hook
│       │   │   ├── use-verification-queue.ts   # [ACTUAL v2.0] Verification queue hook
│       │   │   └── use-voice-recorder.ts       # [ACTUAL] Audio recording hook
│       │   │
│       │   ├── lib/
│       │   │   ├── patent/
│       │   │   │   ├── confidence-calculator.ts # [ACTUAL v2.0] DC-2: 5-factor confidence
│       │   │   │   ├── state-classifier.ts     # [ACTUAL v2.0] 3-state classification
│       │   │   │   ├── data-layer-separator.ts # [ACTUAL v2.0] DC-1: Layer A/B/C split
│       │   │   │   └── fsm-client.ts           # [ACTUAL v2.0] DC-5: FSM state machine
│       │   │   ├── payments/
│       │   │   │   └── toss.ts                 # [ACTUAL] Toss Payments SDK wrapper
│       │   │   ├── supabase/
│       │   │   │   ├── client.ts               # [ACTUAL] Browser Supabase client
│       │   │   │   ├── server.ts               # [ACTUAL] Server-side Supabase
│       │   │   │   ├── middleware.ts           # [ACTUAL] Auth middleware
│       │   │   │   └── types.ts                # [ACTUAL] Supabase types
│       │   │   ├── monitoring/
│       │   │   │   ├── health-check.ts         # [ACTUAL v2.0] Health check utilities
│       │   │   │   ├── metrics.ts              # [ACTUAL v2.0] Metrics collection
│       │   │   │   ├── patent-alerts.ts        # [ACTUAL v2.0] Patent anomaly detection
│       │   │   │   ├── sentry-config.ts        # [ACTUAL v2.0] Sentry initialization
│       │   │   │   ├── types.ts                # [ACTUAL v2.0] Monitoring types
│       │   │   │   ├── index.ts                # [ACTUAL v2.0] Export utils
│       │   │   │   └── INTEGRATION.md          # [ACTUAL v2.0] Integration guide
│       │   │   └── utils/
│       │   │       ├── cn.ts                   # [ACTUAL] classnames utility
│       │   │       ├── format.ts               # [ACTUAL] Format helpers
│       │   │       ├── logger.ts               # [ACTUAL] Client logger
│       │   │       └── offline-storage.ts      # [ACTUAL v2.0] localStorage wrapper
│       │   │
│       │   ├── stores/
│       │   │   ├── auth-store.ts               # [ACTUAL] Zustand auth state
│       │   │   ├── causal-graph-store.ts       # [ACTUAL v2.0] Zustand causal graph
│       │   │   ├── patent-store.ts             # [ACTUAL v2.0] Zustand FSM + queue
│       │   │   └── ui-store.ts                 # [ACTUAL] Zustand UI state
│       │   │
│       │   ├── middleware.ts                   # [ACTUAL] Next.js auth middleware
│       │   └── __tests__/                      # [ACTUAL v2.0] Test directory (23 files)
│       │       ├── setup.ts
│       │       ├── README_PHASE5.md             # [ACTUAL] Phase 5 testing roadmap
│       │       ├── PHASE5_TEST_SUMMARY.md      # [ACTUAL] Test coverage report
│       │       ├── unit/
│       │       │   ├── lib/
│       │       │   │   ├── confidence-score.test.ts
│       │       │   │   ├── data-layer-separator.test.ts
│       │       │   │   ├── edit-delta.test.ts
│       │       │   │   ├── error-patterns.test.ts
│       │       │   │   ├── format-utils.test.ts
│       │       │   │   ├── fsm-transition.test.ts
│       │       │   │   ├── patent-regression.test.ts
│       │       │   │   ├── toss-payments.test.ts
│       │       │   ├── pwa/
│       │       │   │   └── use-pwa.test.ts
│       │       │   ├── utils/
│       │       │   │   └── validators.test.ts
│       │       │   └── hooks/
│       │       │       └── use-voice-recorder.test.ts
│       │       ├── integration/
│       │       │   └── api/
│       │       │       ├── causal-graph.test.ts
│       │       │       ├── coupons.test.ts
│       │       │       ├── payments.test.ts
│       │       │       └── verification.test.ts
│       │       └── e2e/
│       │           ├── coupon-redeem.spec.ts
│       │           ├── measurement-confidence.spec.ts
│       │           ├── mobile-responsive.spec.ts
│       │           ├── practice-flow.spec.ts
│       │           ├── pwa-offline.spec.ts
│       │           ├── voice-fsm.spec.ts
│       │           └── voice-to-report.spec.ts
│       │
│       ├── next.config.js                      # [ACTUAL] Next.js config
│       ├── tailwind.config.ts                  # [ACTUAL] Tailwind CSS
│       ├── tsconfig.json
│       ├── sentry.*.config.ts                  # [ACTUAL] Sentry configs (client/server/edge)
│       ├── playwright.config.ts                # [ACTUAL v2.0] E2E test config
│       ├── vitest.config.ts                    # [ACTUAL v2.0] Unit test config
│       ├── postcss.config.js
│       ├── package.json
│       └── package_npm.json                    # [ACTUAL] NPM publish variant
│
├── supabase/
│   ├── functions/                              # [ACTUAL] 11 Edge Functions
│   │   ├── causal-analysis/index.ts            # [ACTUAL v2.0] F-015: Causal backtrack
│   │   ├── coupon-activate/index.ts            # [ACTUAL] Activate coupon
│   │   ├── edge-weight-calibration/index.ts    # [ACTUAL v2.0] F-015: Calibrate edges
│   │   ├── measurement-confidence/index.ts     # [ACTUAL v2.0] F-016: Confidence + classify
│   │   ├── push-send/index.ts                  # [ACTUAL v2.0] Send FCM push
│   │   ├── send-notification/index.ts          # [ACTUAL] Kakao notification
│   │   ├── swing-analysis/index.ts             # [ACTUAL v2.0] Layer A/B/C + confidence
│   │   ├── verification-handler/index.ts       # [ACTUAL v2.0] F-016: Handle verification
│   │   ├── voice-fsm-controller/index.ts       # [ACTUAL v2.0] DC-5: FSM transition
│   │   ├── voice-to-report/index.ts            # [ACTUAL v2.0] F-017: Voice → report
│   │   └── voice-transcribe/index.ts           # [ACTUAL] Whisper transcription
│   │
│   ├── migrations/                             # [ACTUAL] 20 migration files
│   │   ├── 001_users_and_profiles.sql
│   │   ├── 002_voice_memos_and_reports.sql
│   │   ├── 003_swing_videos_and_pose.sql
│   │   ├── 004_feel_checks_and_observations.sql
│   │   ├── 005_coupons_and_payments.sql
│   │   ├── 006_notifications.sql
│   │   ├── 007_error_patterns_and_glossary.sql
│   │   ├── 008_rls_policies.sql
│   │   ├── 009_raw_measurements.sql            # [ACTUAL v2.0] DC-1: Layer A (immutable)
│   │   ├── 010_derived_metrics.sql             # [ACTUAL v2.0] DC-1: Layer B
│   │   ├── 011_coaching_decisions.sql          # [ACTUAL v2.0] DC-1, DC-4: Layer C
│   │   ├── 012_edit_deltas.sql                 # [ACTUAL v2.0] F-015: Edit deltas
│   │   ├── 013_causal_graph_edges.sql          # [ACTUAL v2.0] F-015: Causal edges
│   │   ├── 014_measurement_states.sql          # [ACTUAL v2.0] F-016: State machine
│   │   ├── 015_verification_queue.sql          # [ACTUAL v2.0] F-016: Verification
│   │   ├── 016_voice_memo_cache.sql            # [ACTUAL v2.0] DC-5: FSM cache
│   │   ├── 017_patent_rls_policies.sql         # [ACTUAL v2.0] Patent table RLS
│   │   ├── 018_patent_hotfix.sql               # [ACTUAL v2.0] Patent constraints fix
│   │   ├── 019_push_tokens.sql                 # [ACTUAL v2.0] FCM push tokens
│   │   └── 020_transcription_jobs.sql          # [ACTUAL v2.0] Async transcription
│   │
│   ├── tests/                                  # [ACTUAL v2.0] RLS + data tests
│   │   ├── 001_users_and_profiles_test.sql
│   │   ├── 002_voice_memos_and_reports_test.sql
│   │   ├── 003_swing_videos_and_pose_test.sql
│   │   ├── 007_error_patterns_and_glossary_test.sql
│   │   └── README.md
│   │
│   ├── seed.sql                                # [ACTUAL] Seed data
│   └── config.toml                             # [ACTUAL] Supabase local config
│
├── packages/
│   └── shared/
│       ├── constants/
│       │   ├── causal-graph-seed.ts            # [ACTUAL v2.0] Initial DAG edges
│       │   ├── confidence-thresholds.ts        # [ACTUAL v2.0] T1, T2, K constants
│       │   ├── error-patterns.ts               # [ACTUAL] 22 error tags
│       │   ├── fsm-states.ts                   # [ACTUAL v2.0] DC-5: 4-state FSM
│       │   └── swing-positions.ts              # [ACTUAL] Swing anatomy keywords
│       ├── types/
│       │   ├── coaching-decision.ts            # [ACTUAL v2.0] Layer C type
│       │   ├── coupon.ts                       # [ACTUAL] Coupon domain
│       │   ├── derived-metric.ts               # [ACTUAL v2.0] Layer B type
│       │   ├── edit-delta.ts                   # [ACTUAL v2.0] F-015: Edit type
│       │   ├── measurement-state.ts            # [ACTUAL v2.0] F-016: State type
│       │   ├── payment.ts                      # [ACTUAL] Payment domain
│       │   ├── pose.ts                         # [ACTUAL] Pose/joint types
│       │   ├── raw-measurement.ts              # [ACTUAL v2.0] Layer A type
│       │   ├── report.ts                       # [ACTUAL] Report domain
│       │   ├── subscription.ts                 # [ACTUAL] Subscription domain
│       │   ├── verification.ts                 # [ACTUAL v2.0] F-016: Verification type
│       │   └── voice-memo-cache.ts             # [ACTUAL v2.0] FSM cache type
│       ├── validators/
│       │   ├── confidence-score.ts             # [ACTUAL v2.0] Confidence range guard
│       │   ├── coupon-code.ts                  # [ACTUAL] Coupon code format
│       │   ├── fsm-transition.ts               # [ACTUAL v2.0] FSM state guard
│       │   └── voice-memo.ts                   # [ACTUAL] Voice memo validation
│       ├── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── scripts/                                    # [ACTUAL v2.0] Utility scripts
│   └── ...build/deploy helpers
│
├── .github/workflows/
│   ├── ci.yml                                  # See .github/workflows/ above
│   ├── deploy.yml
│   ├── mobile-ci.yml
│   ├── patent-regression.yml
│   └── WORKFLOW_V2_MIGRATION_GUIDE.md
│
├── .env.example                                # [ACTUAL] Environment template
├── .env.local                                  # [ACTUAL] Local dev vars
├── .env.staging.example                        # [ACTUAL] Staging vars
│
├── docker-compose.yml                          # [ACTUAL] Local Supabase + Redis
├── docker-compose.test.yml                     # [ACTUAL v2.0] Test environment
├── Dockerfile                                  # [ACTUAL] Web app container
│
├── tsconfig.json                               # [ACTUAL] Monorepo tsconfig
├── pnpm-workspace.yaml                         # [ACTUAL] pnpm workspaces
├── turbo.json                                  # [ACTUAL] Turbo build config
├── package.json                                # [ACTUAL] Monorepo root
│
├── claude.md                                   # Project rules (immutable)
├── todo.md                                     # Session todo list
├── memory.md                                   # Session memory/findings
│
├── HelloNext_Phase3_v2.0_아키텍처.md           # [ACTUAL] Phase 3 architecture doc
├── HelloNext_통합검증_리포트_v2.0.md            # [ACTUAL] Validation report
└── DEPLOYMENT_PHASE6_SUMMARY.md                # [ACTUAL] Phase 6 deployment notes
```

## Key Differences from Phase 3 Plan

### Files That Exist But Were Not in Original Plan

| Category | Files | Status |
|----------|-------|--------|
| **Mobile App** | `apps/mobile/` (entire tree) | [ACTUAL v2.0] Full Expo React Native implementation |
| **Workflows** | `mobile-ci.yml`, `patent-regression.yml`, migration guide | [ACTUAL v2.0] CI/CD for mobile + regression tests |
| **Monitoring** | `lib/monitoring/` (5 files) | [ACTUAL v2.0] Sentry + metrics + health checks |
| **Edge Functions** | `push-send/`, `voice-transcribe/` | [ACTUAL v2.0] Additional functions for FCM + async transcription |
| **Migrations** | `018_patent_hotfix.sql`, `019_push_tokens.sql`, `020_transcription_jobs.sql` | [ACTUAL v2.0] Latest 3 migrations |
| **Tests** | `supabase/tests/` (4 SQL test files) | [ACTUAL v2.0] RLS verification tests |
| **Configs** | `sentry.*.config.ts` (3 files), `playwright.config.ts`, `vitest.config.ts` | [ACTUAL v2.0] Testing + monitoring setup |
| **PWA** | `components/pwa/` (4 files), `offline-indicator`, `update-prompt` | [ACTUAL v2.0] Progressive Web App support |

### Files from Plan That DO NOT Exist

| Item | Status | Note |
|------|--------|------|
| `(auth)/signup/page.tsx` | Missing | Only login page exists |
| `(auth)/role-select/page.tsx` | Missing | Onboarding screen in both apps |
| `(pro)/onboarding/page.tsx` | Missing | Onboarding in mobile only |
| `(pro)/review/page.tsx` | Missing | Consolidated into reports |
| `(pro)/plan/page.tsx` | Missing | Not yet implemented |
| `(pro)/plan/[memberId]/` | Missing | Replaced by ai-scope under members |
| `(pro)/review/page.tsx` | Missing | Merged with reports |
| `(pro)/verification-queue/page.tsx` | Missing | Integrated into dashboard |
| `(pro)/causal-graph/page.tsx` | Missing | Integrated into reports |
| `(member)/onboarding/page.tsx` | Missing | Moved to mobile app |
| `(member)/coupon/page.tsx` | Missing | Renamed to redeem |
| `(member)/settings/page.tsx` | Missing | Not yet implemented |
| `(pro)/settings/page.tsx` | Missing | Not yet implemented |
| `components/shared/` | Missing | Merged into specific component folders |
| `components/layout/` | Missing | Layouts defined in page.tsx files |
| `lib/cloudinary/` | Missing | Replaced by Cloudinary in-library |
| `lib/notifications/` | Missing | Moved to Edge Functions |
| `lib/mediapipe/` | Missing | Hook-based integration (use-mediapipe-pose) |

### Naming/Structure Differences

| Plan | Actual | Reason |
|------|--------|--------|
| `/api/patent/*` routes | `/api/ai-scope`, `/api/causal-analysis`, `/api/edit-deltas` | More semantic naming |
| `/api/cron/*` routes | Not implemented | Cron jobs handled by Supabase pg_cron |
| `error-patterns_seed.sql` | `error-patterns_and_glossary.sql` | Added glossary table |
| Component folder org | Organized by feature (practice/, report/, swing/, voice/) | Faster lookup than by type |

## File Count Summary

| Area | Count | Notes |
|------|-------|-------|
| API Routes | 18 | All data endpoints + webhooks |
| Edge Functions | 11 | Transcoders + AI + notifications |
| Migrations | 20 | Full schema + RLS + patent hotfixes |
| Test Files | 23 | Unit (10) + Integration (4) + E2E (7) + setup |
| Screens (Mobile) | 9 | Auth + member + pro workflows |
| Components (Web) | 20+ | UI + domain-specific |
| Hooks | 8 | Core client-side logic |
| Stores | 4 | Zustand state management |
| Shared Types | 13 | Domain models |
| Shared Validators | 4 | Zod/runtime guards |

## [v2.0] vs [ACTUAL] Markers Explained

- **[v2.0]**: In Phase 3 plan, implemented in this codebase
- **[ACTUAL v2.0]**: Exists in codebase but was not in Phase 3 plan document
- **[ACTUAL]**: Baseline implementation (v1.x), exists in codebase

Use this file as the **source of truth** for the real directory structure. For Phase 3 planning docs, refer to `HelloNext_Phase3_v2.0_아키텍처.md`.
