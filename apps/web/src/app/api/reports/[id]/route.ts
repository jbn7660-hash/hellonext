/**
 * Report API — Single Report Operations
 *
 * GET   /api/reports/[id]  — Get report details
 * PATCH /api/reports/[id]  — Update report (edit content, mark as read)
 *
 * @route /api/reports/[id]
 * @feature F-001
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';
import type { Tables } from '@/lib/supabase/types';

type ReportRow = Tables<'reports'> & {
  voice_memos?: { id: string; transcript: string | null; duration_sec: number } | null;
  pro_profiles?: { display_name: string; studio_name: string | null } | null;
  member_profiles?: { display_name: string } | null;
};

const UpdateReportSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.record(z.unknown()).optional(),
  homework: z.string().nullable().optional(),
  error_tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'published', 'read']).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Invalid report ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: dataRaw, error } = await supabase
      .from('reports')
      .select(`
        *,
        voice_memos(id, transcript, duration_sec),
        pro_profiles(display_name, studio_name),
        member_profiles(display_name)
      `)
      .eq('id', id)
      .single();
    const data = dataRaw as ReportRow | null;

    if (error || !data) {
      logger.warn('Report not found', { id, userId: user.id, error: error?.message });
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // If member is reading, mark as read
    const { data: memberProfileRaw } = await supabase
      .from('member_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();
    const memberProfile = memberProfileRaw as Pick<Tables<'member_profiles'>, 'id'> | null;

    if (memberProfile && data.member_id === memberProfile.id && data.status === 'published') {
      const readAt = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await (supabase as any)
        .from('reports')
        .update({ status: 'read', read_at: readAt })
        .eq('id', id);

      if (updateError) {
        logger.error('Failed to mark report as read', { id, error: updateError.message });
      } else {
        data.status = 'read';
        data.read_at = readAt;
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    logger.error('Report GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Invalid report ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = UpdateReportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify user owns this report (pro)
    const { data: existingRaw } = await supabase
      .from('reports')
      .select('pro_id')
      .eq('id', id)
      .single();
    const existing = existingRaw as Pick<Tables<'reports'>, 'pro_id'> | null;

    if (!existing) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Get pro profile to check ownership
    const { data: proProfileRaw } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();
    const proProfile = proProfileRaw as Pick<Tables<'pro_profiles'>, 'id'> | null;

    if (!proProfile || existing.pro_id !== proProfile.id) {
      logger.warn('Unauthorized report update attempt', { id, userId: user.id });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedRaw, error } = await (supabase as any)
      .from('reports')
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    const data = updatedRaw as Tables<'reports'> | null;

    if (error) {
      logger.error('Report update failed', { id, userId: user.id, error: error.message });
      return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
    }

    logger.info('Report updated', { id, userId: user.id, fields: Object.keys(parsed.data) });

    return NextResponse.json({ data });
  } catch (err) {
    logger.error('Report PATCH error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
