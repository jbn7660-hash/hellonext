export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ai_observations: {
        Row: {
          coach_consultation_flag: boolean
          created_at: string
          hidden_tags: Json
          id: string
          member_id: string
          observation_text: string
          pro_id: string | null
          tone: string
          video_id: string
          visible_tags: Json
        }
        Insert: {
          coach_consultation_flag?: boolean
          created_at?: string
          hidden_tags?: Json
          id?: string
          member_id: string
          observation_text: string
          pro_id?: string | null
          tone?: string
          video_id: string
          visible_tags?: Json
        }
        Update: {
          coach_consultation_flag?: boolean
          created_at?: string
          hidden_tags?: Json
          id?: string
          member_id?: string
          observation_text?: string
          pro_id?: string | null
          tone?: string
          video_id?: string
          visible_tags?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_observations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_observations_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_observations_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "swing_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_scope_settings: {
        Row: {
          ai_tone: string
          id: string
          member_id: string
          pro_id: string
          updated_at: string
          visible_error_patterns: Json
        }
        Insert: {
          ai_tone?: string
          id?: string
          member_id: string
          pro_id: string
          updated_at?: string
          visible_error_patterns?: Json
        }
        Update: {
          ai_tone?: string
          id?: string
          member_id?: string
          pro_id?: string
          updated_at?: string
          visible_error_patterns?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_scope_settings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_scope_settings_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      causal_graph_edges: {
        Row: {
          calibrated_at: string
          calibration_count: number
          edge_type: string
          from_node: string
          id: string
          to_node: string
          weight: number
        }
        Insert: {
          calibrated_at?: string
          calibration_count?: number
          edge_type?: string
          from_node: string
          id?: string
          to_node: string
          weight?: number
        }
        Update: {
          calibrated_at?: string
          calibration_count?: number
          edge_type?: string
          from_node?: string
          id?: string
          to_node?: string
          weight?: number
        }
        Relationships: []
      }
      coaching_decisions: {
        Row: {
          auto_draft: Json
          coach_edited: Json | null
          coach_profile_id: string
          created_at: string
          data_quality_tier: string
          id: string
          primary_fix: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          auto_draft?: Json
          coach_edited?: Json | null
          coach_profile_id: string
          created_at?: string
          data_quality_tier?: string
          id?: string
          primary_fix?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          auto_draft?: Json
          coach_edited?: Json | null
          coach_profile_id?: string
          created_at?: string
          data_quality_tier?: string
          id?: string
          primary_fix?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_decisions_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_decisions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swing_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          id: string
          member_id: string
          premium_days: number
          redeemed_at: string
        }
        Insert: {
          coupon_id: string
          id?: string
          member_id: string
          premium_days?: number
          redeemed_at?: string
        }
        Update: {
          coupon_id?: string
          id?: string
          member_id?: string
          premium_days?: number
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: true
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          assigned_member_id: string | null
          code: string
          created_at: string
          expires_at: string
          id: string
          pro_id: string
          status: string
          type: string
        }
        Insert: {
          assigned_member_id?: string | null
          code: string
          created_at?: string
          expires_at: string
          id?: string
          pro_id: string
          status?: string
          type: string
        }
        Update: {
          assigned_member_id?: string | null
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          pro_id?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupons_assigned_member_id_fkey"
            columns: ["assigned_member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      derived_metrics: {
        Row: {
          auto_detected_symptoms: Json
          compound_metrics: Json
          created_at: string
          dependency_edges: Json
          formula_id: string
          id: string
          recalculated_at: string | null
          session_id: string
        }
        Insert: {
          auto_detected_symptoms?: Json
          compound_metrics?: Json
          created_at?: string
          dependency_edges?: Json
          formula_id?: string
          id?: string
          recalculated_at?: string | null
          session_id: string
        }
        Update: {
          auto_detected_symptoms?: Json
          compound_metrics?: Json
          created_at?: string
          dependency_edges?: Json
          formula_id?: string
          id?: string
          recalculated_at?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "derived_metrics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swing_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      edit_deltas: {
        Row: {
          created_at: string
          data_quality_tier: string
          decision_id: string
          delta_value: Json
          edited_fields: string[]
          edited_value: Json
          id: string
          original_value: Json
        }
        Insert: {
          created_at?: string
          data_quality_tier: string
          decision_id: string
          delta_value: Json
          edited_fields: string[]
          edited_value: Json
          id?: string
          original_value: Json
        }
        Update: {
          created_at?: string
          data_quality_tier?: string
          decision_id?: string
          delta_value?: Json
          edited_fields?: string[]
          edited_value?: Json
          id?: string
          original_value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "edit_deltas_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "coaching_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      error_patterns: {
        Row: {
          causality_parents: Json | null
          code: string
          description: string | null
          id: number
          name_en: string
          name_ko: string
          position: string
        }
        Insert: {
          causality_parents?: Json | null
          code: string
          description?: string | null
          id?: number
          name_en: string
          name_ko: string
          position: string
        }
        Update: {
          causality_parents?: Json | null
          code?: string
          description?: string | null
          id?: number
          name_en?: string
          name_ko?: string
          position?: string
        }
        Relationships: []
      }
      feel_checks: {
        Row: {
          created_at: string
          feel_accuracy: number | null
          feeling: string
          id: string
          member_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          feel_accuracy?: number | null
          feeling: string
          id?: string
          member_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          feel_accuracy?: number | null
          feeling?: string
          id?: string
          member_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feel_checks_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feel_checks_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "swing_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      glossary_terms: {
        Row: {
          created_at: string
          id: string
          original_term: string
          pro_id: string
          standardized_term: string
        }
        Insert: {
          created_at?: string
          id?: string
          original_term: string
          pro_id: string
          standardized_term: string
        }
        Update: {
          created_at?: string
          id?: string
          original_term?: string
          pro_id?: string
          standardized_term?: string
        }
        Relationships: [
          {
            foreignKeyName: "glossary_terms_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_states: {
        Row: {
          confidence_score: number
          id: string
          issued_at: string
          measurement_id: string
          predicted_value: Json | null
          review_state: string
          session_id: string
          state: string
          updated_at: string
        }
        Insert: {
          confidence_score: number
          id?: string
          issued_at?: string
          measurement_id: string
          predicted_value?: Json | null
          review_state?: string
          session_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          confidence_score?: number
          id?: string
          issued_at?: string
          measurement_id?: string
          predicted_value?: Json | null
          review_state?: string
          session_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_states_measurement_id_fkey"
            columns: ["measurement_id"]
            isOneToOne: true
            referencedRelation: "raw_measurements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_states_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swing_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      member_profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_premium: boolean
          premium_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_premium?: boolean
          premium_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_premium?: boolean
          premium_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          is_read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          metadata: Json | null
          status: string
          toss_payment_key: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          metadata?: Json | null
          status?: string
          toss_payment_key?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          status?: string
          toss_payment_key?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pose_data: {
        Row: {
          angles: Json
          created_at: string
          id: string
          keypoints: Json
          metrics: Json | null
          video_id: string
        }
        Insert: {
          angles: Json
          created_at?: string
          id?: string
          keypoints: Json
          metrics?: Json | null
          video_id: string
        }
        Update: {
          angles?: Json
          created_at?: string
          id?: string
          keypoints?: Json
          metrics?: Json | null
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pose_data_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: true
            referencedRelation: "swing_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_member_links: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          member_id: string | null
          pro_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code: string
          member_id?: string | null
          pro_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          member_id?: string | null
          pro_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pro_member_links_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_member_links_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          plg_coupons_remaining: number
          specialty: string | null
          studio_name: string | null
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          plg_coupons_remaining?: number
          specialty?: string | null
          studio_name?: string | null
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          plg_coupons_remaining?: number
          specialty?: string | null
          studio_name?: string | null
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string | null
          device_id: string
          id: string
          is_active: boolean | null
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id?: string
          id?: string
          is_active?: boolean | null
          platform: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          id?: string
          is_active?: boolean | null
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      raw_measurements: {
        Row: {
          created_at: string
          frame_index: number
          id: string
          measurement_confidence: number | null
          session_id: string
          source_model: string
          source_version: string
          spatial_data: Json
        }
        Insert: {
          created_at?: string
          frame_index: number
          id?: string
          measurement_confidence?: number | null
          session_id: string
          source_model?: string
          source_version?: string
          spatial_data: Json
        }
        Update: {
          created_at?: string
          frame_index?: number
          id?: string
          measurement_confidence?: number | null
          session_id?: string
          source_model?: string
          source_version?: string
          spatial_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "raw_measurements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "swing_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          content: Json
          created_at: string
          error_tags: Json
          homework: string | null
          id: string
          link_id: string
          member_id: string
          pro_id: string
          published_at: string | null
          read_at: string | null
          status: string
          title: string
          updated_at: string
          voice_memo_id: string | null
        }
        Insert: {
          content?: Json
          created_at?: string
          error_tags?: Json
          homework?: string | null
          id?: string
          link_id: string
          member_id: string
          pro_id: string
          published_at?: string | null
          read_at?: string | null
          status?: string
          title: string
          updated_at?: string
          voice_memo_id?: string | null
        }
        Update: {
          content?: Json
          created_at?: string
          error_tags?: Json
          homework?: string | null
          id?: string
          link_id?: string
          member_id?: string
          pro_id?: string
          published_at?: string | null
          read_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          voice_memo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "pro_member_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_voice_memo_id_fkey"
            columns: ["voice_memo_id"]
            isOneToOne: false
            referencedRelation: "voice_memos"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          pro_id: string
          status: string
          tier: string
          toss_billing_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          pro_id: string
          status?: string
          tier: string
          toss_billing_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          pro_id?: string
          status?: string
          tier?: string
          toss_billing_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      swing_videos: {
        Row: {
          cloudinary_id: string
          created_at: string
          duration_sec: number | null
          id: string
          member_id: string
          source: string
          thumbnail_url: string | null
          video_url: string
        }
        Insert: {
          cloudinary_id: string
          created_at?: string
          duration_sec?: number | null
          id?: string
          member_id: string
          source?: string
          thumbnail_url?: string | null
          video_url: string
        }
        Update: {
          cloudinary_id?: string
          created_at?: string
          duration_sec?: number | null
          id?: string
          member_id?: string
          source?: string
          thumbnail_url?: string | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "swing_videos_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transcription_jobs: {
        Row: {
          audio_duration: number | null
          audio_format: string | null
          audio_url: string | null
          completed_at: string | null
          confidence: number | null
          created_at: string | null
          error_message: string | null
          id: string
          language: string | null
          model: string | null
          processing_ms: number | null
          provider: string | null
          retry_count: number | null
          segments: Json | null
          status: string
          transcript: string | null
          updated_at: string | null
          user_id: string
          voice_memo_id: string
        }
        Insert: {
          audio_duration?: number | null
          audio_format?: string | null
          audio_url?: string | null
          completed_at?: string | null
          confidence?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          language?: string | null
          model?: string | null
          processing_ms?: number | null
          provider?: string | null
          retry_count?: number | null
          segments?: Json | null
          status?: string
          transcript?: string | null
          updated_at?: string | null
          user_id: string
          voice_memo_id: string
        }
        Update: {
          audio_duration?: number | null
          audio_format?: string | null
          audio_url?: string | null
          completed_at?: string | null
          confidence?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          language?: string | null
          model?: string | null
          processing_ms?: number | null
          provider?: string | null
          retry_count?: number | null
          segments?: Json | null
          status?: string
          transcript?: string | null
          updated_at?: string | null
          user_id?: string
          voice_memo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcription_jobs_voice_memo_id_fkey"
            columns: ["voice_memo_id"]
            isOneToOne: false
            referencedRelation: "voice_memos"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_queue: {
        Row: {
          created_at: string
          id: string
          measurement_state_id: string
          response_type: string | null
          review_state: string
          reviewed_at: string | null
          reviewer_id: string | null
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          measurement_state_id: string
          response_type?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          token?: string
        }
        Update: {
          created_at?: string
          id?: string
          measurement_state_id?: string
          response_type?: string | null
          review_state?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_queue_measurement_state_id_fkey"
            columns: ["measurement_state_id"]
            isOneToOne: true
            referencedRelation: "measurement_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_queue_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_memo_cache: {
        Row: {
          audio_blob_ref: string
          coach_profile_id: string
          created_at: string
          memo_id: string
          state: string
          target_id: string | null
          transcript: string | null
          transcription_job_id: string | null
          updated_at: string
        }
        Insert: {
          audio_blob_ref: string
          coach_profile_id: string
          created_at?: string
          memo_id: string
          state?: string
          target_id?: string | null
          transcript?: string | null
          transcription_job_id?: string | null
          updated_at?: string
        }
        Update: {
          audio_blob_ref?: string
          coach_profile_id?: string
          created_at?: string
          memo_id?: string
          state?: string
          target_id?: string | null
          transcript?: string | null
          transcription_job_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_memo_cache_coach_profile_id_fkey"
            columns: ["coach_profile_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_memo_cache_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: true
            referencedRelation: "voice_memos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_memo_cache_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_memo_state_log: {
        Row: {
          from_state: string
          id: string
          memo_id: string
          metadata: Json | null
          to_state: string
          transitioned_at: string
        }
        Insert: {
          from_state: string
          id?: string
          memo_id: string
          metadata?: Json | null
          to_state: string
          transitioned_at?: string
        }
        Update: {
          from_state?: string
          id?: string
          memo_id?: string
          metadata?: Json | null
          to_state?: string
          transitioned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_memo_state_log_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "voice_memos"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_memos: {
        Row: {
          audio_url: string
          created_at: string
          duration_sec: number
          id: string
          member_id: string | null
          pro_id: string
          status: string
          structured_json: Json | null
          transcript: string | null
          updated_at: string
        }
        Insert: {
          audio_url: string
          created_at?: string
          duration_sec: number
          id?: string
          member_id?: string | null
          pro_id: string
          status?: string
          structured_json?: Json | null
          transcript?: string | null
          updated_at?: string
        }
        Update: {
          audio_url?: string
          created_at?: string
          duration_sec?: number
          id?: string
          member_id?: string | null
          pro_id?: string
          status?: string
          structured_json?: Json | null
          transcript?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_memos_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_memos_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pro_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_member_id: { Args: never; Returns: string }
      get_my_pro_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof DatabaseWithoutInternals, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
      DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
