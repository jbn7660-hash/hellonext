/**
 * Report Types
 *
 * Type definitions for coaching reports generated from voice memos.
 *
 * @module types/report
 */

/** Structured report content stored in reports.content JSONB */
export interface ReportContent {
  readonly sections: readonly ReportSection[];
  readonly summary: string;
  readonly overallTone: 'positive' | 'neutral' | 'constructive';
}

export interface ReportSection {
  /** Unique section identifier (e.g., 'summary', 'error_analysis', 'drill_recommendation') */
  readonly key: string;
  readonly title: string;
  /** Main text content of the section */
  readonly content: string;
  /** Optional bullet points for structured sub-items */
  readonly bullets?: readonly string[];
  readonly errorPatternCodes: readonly string[];
  readonly priority: 'high' | 'medium' | 'low';
}

/** Structured voice memo data stored in voice_memos.structured_json */
export interface StructuredMemoData {
  readonly drillPoints: readonly string[];
  readonly errorPatternCodes: readonly string[];
  readonly homework: string | null;
  readonly memberContext: string | null;
  readonly rawSections: readonly {
    readonly topic: string;
    readonly content: string;
  }[];
}
