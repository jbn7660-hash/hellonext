/**
 * Notifications API
 *
 * GET  /api/notifications — List user's notifications (paginated)
 * POST /api/notifications — Mark notifications as read
 *
 * @route /api/notifications
 * @feature F-014
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const unreadOnly = searchParams.get('unread') === 'true';

    const query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

    if (unreadOnly) {
      query.eq('is_read', false);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error('Notifications fetch failed', { error: error.message, userId: user.id });
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    // Unread count (separate query for badge)
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    return NextResponse.json({
      data: data ?? [],
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
      },
      unread_count: unreadCount ?? 0,
    });
  } catch (err) {
    logger.error('Notifications GET error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const MarkReadSchema = z.object({
  notification_ids: z.array(z.string().uuid()).min(1).max(100).optional(),
  mark_all: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = MarkReadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { notification_ids, mark_all } = parsed.data;

    if (mark_all) {
      const { error } = await supabase
        .from('notifications')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ is_read: true } as unknown as never)
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) {
        logger.error('Failed to mark all notifications as read', { userId: user.id, error: error.message });
        return NextResponse.json({ error: 'Failed to mark all as read' }, { status: 500 });
      }

      logger.info('Marked all notifications as read', { userId: user.id });
    } else if (notification_ids && notification_ids.length > 0) {
      const { error } = await supabase
        .from('notifications')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ is_read: true } as unknown as never)
        .eq('user_id', user.id)
        .in('id', notification_ids);

      if (error) {
        logger.error('Failed to mark notifications as read', { userId: user.id, count: notification_ids.length, error: error.message });
        return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 });
      }

      logger.info('Marked notifications as read', { userId: user.id, count: notification_ids.length });
    } else {
      return NextResponse.json(
        { error: 'No notification_ids or mark_all provided' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('Notifications POST error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
