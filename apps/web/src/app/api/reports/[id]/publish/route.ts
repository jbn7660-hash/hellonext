/**
 * Report Publish API
 *
 * POST /api/reports/[id]/publish — Publish draft report to member
 *
 * Flow:
 * 1. Update report status to 'published'
 * 2. Trigger notification to member (Kakao + in-app)
 *
 * @route /api/reports/[id]/publish
 * @feature F-001
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';
import type { Tables } from '@/lib/supabase/types';

type ReportWithRelations = {
  id: string;
  title: string;
  status: string;
  member_id: string;
  member_profiles: { user_id: string; display_name: string } | Array<{ user_id: string; display_name: string }> | null;
  pro_profiles: { id: string } | Array<{ id: string }> | null;
};

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
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

    // Fetch report with member info
    const { data: reportRaw, error: fetchError } = await supabase
      .from('reports')
      .select(`
        id,
        title,
        status,
        member_id,
        member_profiles!inner(user_id, display_name),
        pro_profiles!inner(id)
      `)
      .eq('id', id)
      .eq('status', 'draft')
      .single();
    const report = reportRaw as ReportWithRelations | null;

    if (fetchError || !report) {
      logger.warn('Draft report not found for publish', { id, userId: user.id });
      return NextResponse.json(
        { error: 'Draft report not found' },
        { status: 404 }
      );
    }

    // Verify pro ownership
    const proData = Array.isArray(report.pro_profiles)
      ? report.pro_profiles[0]
      : report.pro_profiles;

    if (!proData) {
      return NextResponse.json({ error: 'Report validation failed' }, { status: 400 });
    }

    const { data: proProfileRaw } = await supabase
      .from('pro_profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();
    const proProfile = proProfileRaw as Pick<Tables<'pro_profiles'>, 'id'> | null;

    if (!proProfile || proData.id !== proProfile.id) {
      logger.warn('Unauthorized report publish attempt', { id, userId: user.id });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Publish report
    const publishedAt = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (supabase as any)
      .from('reports')
      .update({ status: 'published', published_at: publishedAt })
      .eq('id', id);

    if (updateError) {
      logger.error('Failed to publish report', { id, error: updateError.message });
      return NextResponse.json({ error: 'Failed to publish' }, { status: 500 });
    }

    // Trigger notification via Edge Function (non-blocking)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const memberProfile = Array.isArray(report.member_profiles)
      ? report.member_profiles[0]
      : report.member_profiles;

    if (supabaseUrl && serviceKey && memberProfile) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: memberProfile.user_id,
            type: 'report_published',
            title: '새 리포트가 도착했습니다',
            body: report.title || '레슨 리포트',
            data: { report_id: id },
            channels: ['kakao', 'push', 'in_app'],
          }),
        });
      } catch (err) {
        logger.error('Failed to trigger notification', { id, error: err });
      }
    }

    logger.info('Report published successfully', { id, memberId: report.member_id, userId: user.id });

    return NextResponse.json({ success: true, report_id: id });
  } catch (err) {
    logger.error('Report publish error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
