/**
 * AI Scope Settings API
 *
 * GET  /api/ai-scope?member_id=xxx — Get scope settings for a pro-member pair
 * POST /api/ai-scope — Create/update scope settings
 *
 * @route /api/ai-scope
 * @feature F-013
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';

const UpdateScopeSchema = z.object({
  member_id: z.string().uuid(),
  hidden_patterns: z.array(z.string().regex(/^EP-\d{3}$/)).optional(),
  tone_level: z.enum(['observe_only', 'gentle_suggest', 'specific_guide']).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('member_id');

    if (!memberId) {
      return NextResponse.json({ error: 'member_id is required' }, { status: 400 });
    }

    // Verify pro identity
    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    // Fetch or create scope settings
    const { data, error } = await supabase
      .from('ai_scope_settings')
      .select('*')
      .eq('pro_id', proProfile.id)
      .eq('member_id', memberId)
      .maybeSingle();

    if (error) {
      logger.error('AI scope fetch failed', { error: error.message });
      return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }

    // Return defaults if no settings exist yet
    const settings = data ?? {
      pro_id: proProfile.id,
      member_id: memberId,
      hidden_patterns: [],
      tone_level: 'observe_only',
    };

    return NextResponse.json({ data: settings });
  } catch (err) {
    logger.error('AI scope GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = UpdateScopeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    // Upsert (UNIQUE constraint on pro_id + member_id)
    const { data, error } = await supabase
      .from('ai_scope_settings')
      .upsert(
        {
          pro_id: proProfile.id,
          member_id: parsed.data.member_id,
          ...(parsed.data.hidden_patterns !== undefined && {
            hidden_patterns: parsed.data.hidden_patterns,
          }),
          ...(parsed.data.tone_level !== undefined && {
            tone_level: parsed.data.tone_level,
          }),
        },
        { onConflict: 'pro_id,member_id' }
      )
      .select()
      .single();

    if (error) {
      logger.error('AI scope upsert failed', { error: error.message });
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
    }

    logger.info('AI scope updated', {
      proId: proProfile.id,
      memberId: parsed.data.member_id,
      toneLevel: data.tone_level,
      hiddenCount: data.hidden_patterns?.length ?? 0,
    });

    return NextResponse.json({ data });
  } catch (err) {
    logger.error('AI scope POST error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
