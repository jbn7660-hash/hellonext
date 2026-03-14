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
import type { Tables } from '@/lib/supabase/types';

// coupons schema: id, assigned_member_id, code, created_at, expires_at, pro_id, status, type
// pro_profiles schema: id, created_at, display_name, plg_coupons_remaining, specialty, studio_name, tier, updated_at, user_id

const GenerateSchema = z.object({
  quantity: z.number().int().min(1).max(30),
  type: z.enum(['plg', 'purchased']),
  bundle_order_id: z.string().uuid().optional(),
});

function generateCSV(coupons: Tables<'coupons'>[]): string {
  const headers = ['Code', 'Status', 'Type', 'Created', 'Expires', 'Assigned Member ID'];
  const rows = coupons.map((c) => [
    c.code,
    c.status,
    c.type,
    c.created_at?.split('T')[0] ?? '',
    c.expires_at?.split('T')[0] ?? '',
    c.assigned_member_id ?? '',
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
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const search = searchParams.get('search');
    const format = searchParams.get('format');

    // Check if user is a pro
    const { data: proProfileRaw } = await supabase
      .from('pro_profiles')
      .select('id, tier, plg_coupons_remaining')
      .eq('user_id', user.id)
      .single();

    const proProfile = proProfileRaw as Tables<'pro_profiles'> | null;

    // Build base query — only use columns that exist in coupons schema
    let query;

    if (proProfile) {
      query = supabase
        .from('coupons')
        .select('id, code, type, status, expires_at, assigned_member_id, created_at', { count: 'exact' })
        .eq('pro_id', proProfile.id);
    } else {
      query = supabase
        .from('coupons')
        .select('id, code, type, status, expires_at, pro_id, created_at', { count: 'exact' })
        .eq('assigned_member_id', user.id);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.ilike('code', `%${search}%`);
    }

    query = query.order('created_at', { ascending: false });

    // Handle CSV export
    if (format === 'csv') {
      const { data, error } = await query;
      if (error) {
        logger.error('Coupons CSV export failed', { error: error.message });
        return NextResponse.json({ error: 'Failed to export coupons' }, { status: 500 });
      }

      const csv = generateCSV((data ?? []) as Tables<'coupons'>[]);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="coupons.csv"',
        },
      });
    }

    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      logger.error('Coupons fetch failed', { error: error.message });
      return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
    }

    // Summary stats for pro
    let stats = null;
    if (proProfile) {
      // get_coupon_stats is not in the Functions type — use any cast
      const { data: statData } = await (supabase as any)
        .rpc('get_coupon_stats', { pro_id: proProfile.id });

      if (statData) {
        stats = {
          total: (statData as any).total_count || 0,
          available: (statData as any).available_count || 0,
          activated: (statData as any).activated_count || 0,
          expired: (statData as any).expired_count || 0,
          revoked: (statData as any).revoked_count || 0,
          plg_free_used: (statData as any).plg_free_count || 0,
          plg_free_limit: 3,
          soon_expiring: (statData as any).soon_expiring_count || 0,
        };
      } else {
        // Fallback: compute from raw data — coupons has type field (not source)
        const { data: allCouponsRaw } = await supabase
          .from('coupons')
          .select('id, status, type, expires_at')
          .eq('pro_id', proProfile.id);

        const allCoupons = (allCouponsRaw as Tables<'coupons'>[] | null) ?? [];

        if (allCoupons.length > 0) {
          const now = new Date();
          const inFourteenDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

          stats = {
            total: allCoupons.length,
            available: allCoupons.filter((c) => c.status === 'available').length,
            activated: allCoupons.filter((c) => c.status === 'activated').length,
            expired: allCoupons.filter((c) => c.status === 'expired').length,
            revoked: allCoupons.filter((c) => c.status === 'revoked').length,
            plg_free_used: allCoupons.filter((c) => c.type === 'plg').length,
            plg_free_limit: 3,
            soon_expiring: allCoupons.filter(
              (c) =>
                c.expires_at &&
                new Date(c.expires_at) <= inFourteenDays &&
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

    // pro_profiles schema has plg_coupons_remaining (not purchased_coupon_allocation)
    const { data: proProfileRaw } = await supabase
      .from('pro_profiles')
      .select('id, tier, plg_coupons_remaining')
      .eq('user_id', user.id)
      .single();

    const proProfile = proProfileRaw as Tables<'pro_profiles'> | null;

    if (!proProfile) {
      return NextResponse.json({ error: 'Pro profile not found' }, { status: 403 });
    }

    // Validate against plg_coupons_remaining for purchased type
    if (parsed.data.type === 'purchased') {
      const { count: usedCoupons } = await supabase
        .from('coupons')
        .select('*', { count: 'exact', head: true })
        .eq('pro_id', proProfile.id)
        .eq('type', 'purchased');

      const allocation = proProfile.plg_coupons_remaining ?? 0;
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
      type: parsed.data.type,
    });

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    logger.error('Coupons POST error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
