/**
 * Coupons API
 *
 * GET  /api/coupons — List pro's coupons (for pro) or member's activated coupons (for member)
 * POST /api/coupons — Generate new coupon codes (pro only)
 *
 * Features:
 *  - SQL aggregation for accurate stats
 *  - Search by coupon code (partial match)
 *  - CSV export support
 *  - Batch status updates (expire all expired coupons)
 *  - Pro member capacity verification
 *  - Stats include expiry information
 *
 * @route /api/coupons
 * @feature F-012
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { logger } from '@/lib/utils/logger';

const GenerateSchema = z.object({
  quantity: z.number().int().min(1).max(30),
  source: z.enum(['plg_free', 'purchased_bundle']),
  bundle_order_id: z.string().uuid().optional(),
});

function generateCSV(coupons: any[]): string {
  const headers = ['Code', 'Status', 'Source', 'Created', 'Activated', 'Expires', 'Member ID'];
  const rows = coupons.map((c) => [
    c.code,
    c.status,
    c.source,
    c.created_at?.split('T')[0] ?? '',
    c.activated_at?.split('T')[0] ?? '',
    c.expires_at?.split('T')[0] ?? '',
    c.member_user_id ?? '',
  ]);

  return [
    headers.join(','),
    ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // available, activated, expired
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const search = searchParams.get('search'); // coupon code partial match
    const format = searchParams.get('format'); // 'csv' for export

    // Check if user is a pro
    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id, plan')
      .eq('user_id', user.id)
      .single();

    let query;

    if (proProfile) {
      // Pro: see all their coupons
      query = supabase
        .from('coupons')
        .select('id, code, source, status, activated_at, expires_at, member_user_id, created_at', { count: 'exact' })
        .eq('pro_id', proProfile.id);
    } else {
      // Member: see their activated coupons
      query = supabase
        .from('coupons')
        .select(
          'id, code, source, status, activated_at, expires_at, pro_id, created_at, pro_profiles!inner(display_name)',
          { count: 'exact' }
        )
        .eq('member_user_id', user.id);
    }

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.ilike('code', `%${search}%`);
    }

    // Order
    if (proProfile) {
      query = query.order('created_at', { ascending: false });
    } else {
      query = query.order('activated_at', { ascending: false });
    }

    // Handle CSV export
    if (format === 'csv') {
      const { data, error } = await query.select();
      if (error) {
        logger.error('Coupons CSV export failed', { error: error.message });
        return NextResponse.json({ error: 'Failed to export coupons' }, { status: 500 });
      }

      const csv = generateCSV(data ?? []);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="coupons.csv"',
        },
      });
    }

    // Regular pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      logger.error('Coupons fetch failed', { error: error.message });
      return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
    }

    // Summary stats for pro using SQL aggregation
    let stats = null;
    if (proProfile) {
      // Calculate using aggregation instead of client-side filtering
      const { data: statData } = await supabase
        .rpc('get_coupon_stats', { pro_id: proProfile.id });

      if (statData) {
        stats = {
          total: statData.total_count || 0,
          available: statData.available_count || 0,
          activated: statData.activated_count || 0,
          expired: statData.expired_count || 0,
          revoked: statData.revoked_count || 0,
          plg_free_used: statData.plg_free_count || 0,
          plg_free_limit: 3,
          soon_expiring: statData.soon_expiring_count || 0, // expires in 14 days
        };
      } else {
        // Fallback if RPC not available
        const { data: allCoupons } = await supabase
          .from('coupons')
          .select('id, status, source, expires_at')
          .eq('pro_id', proProfile.id);

        if (allCoupons) {
          const now = new Date();
          const inTwoDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

          stats = {
            total: allCoupons.length,
            available: allCoupons.filter((c) => c.status === 'available').length,
            activated: allCoupons.filter((c) => c.status === 'activated').length,
            expired: allCoupons.filter((c) => c.status === 'expired').length,
            revoked: allCoupons.filter((c) => c.status === 'revoked').length,
            plg_free_used: allCoupons.filter((c) => c.source === 'plg_free').length,
            plg_free_limit: 3,
            soon_expiring: allCoupons.filter(
              (c) =>
                c.expires_at &&
                new Date(c.expires_at) <= inTwoDays &&
                new Date(c.expires_at) > now
            ).length,
          };
        }
      }
    }

    return NextResponse.json({
      data,
      stats,
      pagination: { page, limit, total: count ?? 0 },
    });
  } catch (err) {
    logger.error('Coupons GET error', { error: err });
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
    const parsed = GenerateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Verify pro profile exists and check capacity
    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('id, plan, purchased_coupon_allocation')
      .eq('user_id', user.id)
      .single();

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    // For purchased bundles, validate quantity doesn't exceed allocation
    if (parsed.data.source === 'purchased_bundle') {
      const { count: usedCoupons } = await supabase
        .from('coupons')
        .select('*', { count: 'exact', head: true })
        .eq('pro_id', proProfile.id)
        .eq('source', 'purchased_bundle');

      const allocation = proProfile.purchased_coupon_allocation ?? 0;
      if ((usedCoupons ?? 0) + parsed.data.quantity > allocation) {
        logger.warn('Coupon allocation exceeded', {
          proId: proProfile.id,
          requested: parsed.data.quantity,
          available: allocation - (usedCoupons ?? 0),
        });
        return NextResponse.json(
          { error: 'Exceeds purchased coupon allocation' },
          { status: 400 }
        );
      }
    }

    // Invoke Edge Function for generation
    const { data, error } = await supabase.functions.invoke('coupon-activate', {
      body: { action: 'generate', ...parsed.data },
    });

    if (error) {
      logger.error('Coupon generate invoke failed', { error });
      return NextResponse.json({ error: 'Failed to generate coupons' }, { status: 500 });
    }

    logger.info('Coupons generated', {
      userId: user.id,
      quantity: parsed.data.quantity,
      source: parsed.data.source,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    logger.error('Coupons POST error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
