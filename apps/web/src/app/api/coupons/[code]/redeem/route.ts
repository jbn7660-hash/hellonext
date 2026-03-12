/**
 * Coupon Redeem API
 *
 * POST /api/coupons/:code/redeem — Member redeems a coupon code
 *
 * @route /api/coupons/[code]/redeem
 * @feature F-012
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = params;

    if (!code || code.length < 6) {
      return NextResponse.json({ error: 'Invalid coupon code' }, { status: 400 });
    }

    // Invoke Edge Function for redemption
    const { data, error } = await supabase.functions.invoke('coupon-activate', {
      body: { action: 'redeem', code: code.toUpperCase().trim() },
    });

    if (error) {
      logger.error('Coupon redeem invoke failed', { error, code });
      return NextResponse.json(
        { error: '쿠폰 활성화에 실패했습니다.' },
        { status: 500 }
      );
    }

    // Edge function returns error in response body
    if (data?.error) {
      return NextResponse.json(
        { error: data.error },
        { status: data.error.includes('유효하지') ? 404 : 400 }
      );
    }

    logger.info('Coupon redeemed', {
      userId: user.id,
      code,
      proName: data?.pro_name,
    });

    return NextResponse.json({
      data: data?.data,
      pro_name: data?.pro_name,
      expires_at: data?.expires_at,
      message: `${data?.pro_name} 프로님의 쿠폰이 활성화되었습니다!`,
    });
  } catch (err) {
    logger.error('Coupon redeem error', { error: err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
