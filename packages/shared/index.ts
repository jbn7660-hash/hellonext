/**
 * @hellonext/shared
 *
 * Shared package exporting constants, types, and validators
 * used across the monorepo (web app + edge functions).
 */

// ── v1.1 Core ──────────────────────────────────
export * from './constants/error-patterns';
export * from './constants/swing-positions';
export * from './types/report';
export * from './types/pose';
export * from './types/coupon';
export * from './types/payment';
export * from './types/subscription';
export * from './validators/voice-memo';
export * from './validators/coupon-code';

// ── v2.0 Patent Engine ─────────────────────────
// Constants
export * from './constants/fsm-states';
export * from './constants/confidence-thresholds';
export * from './constants/causal-graph-seed';

// Types — 3-Layer Data Separation (DC-1)
export * from './types/raw-measurement';
export * from './types/derived-metric';
export * from './types/coaching-decision';
export * from './types/edit-delta';

// Types — Measurement Confidence (Patent 3)
export * from './types/measurement-state';
export * from './types/verification';

// Types — Voice FSM (Patent 4)
export * from './types/voice-memo-cache';

// Types — Payment & Subscription
export * from './types/payment';
export * from './types/subscription';

// Validators
export * from './validators/fsm-transition';
export * from './validators/confidence-score';
