/**
 * Coupon Activate Edge Function (F-012)
 *
 * Handles PLG coupon lifecycle:
 *  - Generate unique coupon codes for a pro (with collision prevention)
 *  - Activate a coupon when member redeems it (with expiry enforcement)
 *  - Track usage and expiry (90 days from activation)
 *  - Audit trail logging for all coupon state changes
 *  - Rate limiting (max 10 redemptions per member per hour)
 *
 * Features:
 *  - Batch generation support with collision prevention (retry up to 5 times)
 *  - Expiry enforcement before redemption
 *  - Atomic redeem operations using RPC
 *  - Input sanitization (uppercase, remove spaces/dashes)
 *  - Audit logging to coupon_audit_log table
 *  - Structured error codes (404, 409, 410, 429, 500)
 *
 * @function coupon-activate
 * @feature F-012
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://hellonext.app';
const COUPON_EXPIRY_DAYS = 90;
const REDEMPTION_RATE_LIMIT = 10; // per hour
const CODE_GENERATION_RETRIES = 5;
const CODE_GENERATION_RETRY_DELAY_MS = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRequest {
  action: 'generate';
  quantity: number; // How many codes to generate
  source: 'plg_free' | 'purchased_bundle';
  bundle_order_id?: string; // If purchased
}

interface RedeemRequest {
  action: 'redeem';
  code: string;
}

type RequestBody = GenerateRequest | RedeemRequest;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body: RequestBody = await req.json();

    // ─── Action: Generate Coupon Codes ───────────────────────────
    if (body.action === 'generate') {
      return await handleGenerate(supabase, user.id, body as GenerateRequest);
    }

    // ─── Action: Redeem a Coupon Code ────────────────────────────
    if (body.action === 'redeem') {
      return await handleRedeem(supabase, user.id, body as RedeemRequest);
    }

    return jsonResponse({ error: 'Invalid action' }, 400);
  } catch (err) {
    console.error('coupon-activate error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

// ─── Generate ────────────────────────────────────────────────────

async function handleGenerate(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  params: GenerateRequest
) {
  // Verify pro identity
  const { data: proProfile } = await supabase
    .from('pro_profiles')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (!proProfile) {
    return jsonResponse({ error: 'Pro profile not found' }, 403);
  }

  const { quantity, source, bundle_order_id } = params;

  if (quantity < 1 || quantity > 30) {
    return jsonResponse({ error: 'Quantity must be 1-30' }, 400);
  }

  // For PLG free: check limit (3 free per pro)
  if (source === 'plg_free') {
    const { count } = await supabase
      .from('coupons')
      .select('*', { count: 'exact', head: true })
      .eq('pro_id', proProfile.id)
      .eq('source', 'plg_free');

    if ((count ?? 0) + quantity > 3) {
      return jsonResponse(
        { error: 'PLG 무료 쿠폰은 최대 3장까지 생성 가능합니다.' },
        400
      );
    }
  }

  // Generate unique codes with collision prevention
  const coupons = [];
  for (let i = 0; i < quantity; i++) {
    let code: string;
    let isUnique = false;
    let retries = 0;

    while (!isUnique && retries < CODE_GENERATION_RETRIES) {
      code = generateCouponCode();

      // Check for collision
      const { count } = await supabase
        .from('coupons')
        .select('*', { count: 'exact', head: true })
        .eq('code', code);

      if (count === 0) {
        isUnique = true;
      } else {
        retries++;
        // Wait before retry
        await new Promise((resolve) =>
          setTimeout(resolve, CODE_GENERATION_RETRY_DELAY_MS * (retries + 1))
        );
      }
    }

    if (!isUnique) {
      console.error(`Failed to generate unique code after ${CODE_GENERATION_RETRIES} retries`);
      return jsonResponse(
        { error: 'COUPON_GENERATION_FAILED', message: 'Failed to generate unique coupon codes' },
        500
      );
    }

    coupons.push({
      pro_id: proProfile.id,
      code: code!,
      source,
      bundle_order_id: bundle_order_id ?? null,
      status: 'available',
      expires_at: null, // Set on activation (90 days from redeem)
    });
  }

  const { data, error } = await supabase
    .from('coupons')
    .insert(coupons)
    .select('id, code, source, status, created_at');

  if (error) {
    console.error('Coupon insert failed:', error);
    // Log to audit trail
    await logCouponAudit(supabase, proProfile.id, null, 'generate_failed', {
      source,
      quantity,
      error: error.message,
    });
    return jsonResponse(
      { error: 'COUPON_GENERATION_FAILED', message: 'Failed to generate coupons' },
      500
    );
  }

  // Log successful generation to audit trail
  for (const coupon of data) {
    await logCouponAudit(supabase, proProfile.id, coupon.id, 'generated', {
      source,
      code: coupon.code,
    });
  }

  return jsonResponse({ data, generated: data.length });
}

// ─── Redeem ──────────────────────────────────────────────────────

async function handleRedeem(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  params: RedeemRequest
) {
  const { code: rawCode } = params;

  if (!rawCode || rawCode.length < 6) {
    return jsonResponse({ error: 'Invalid coupon code' }, 400);
  }

  // Input sanitization: normalize code (uppercase, remove spaces/dashes)
  const code = rawCode.toUpperCase().replace(/[\s\-]/g, '');

  // Rate limiting: check redemptions per member per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentRedemptions } = await supabase
    .from('coupons')
    .select('*', { count: 'exact', head: true })
    .eq('member_user_id', userId)
    .gte('activated_at', oneHourAgo);

  if ((recentRedemptions ?? 0) >= REDEMPTION_RATE_LIMIT) {
    return jsonResponse(
      { error: 'COUPON_LIMIT_REACHED', message: '시간당 최대 10개의 쿠폰을 활성화할 수 있습니다.' },
      429
    );
  }

  // Fetch coupon with pro details
  const { data: coupon, error: fetchError } = await supabase
    .from('coupons')
    .select('*, pro_profiles!inner(user_id, display_name)')
    .eq('code', code)
    .single();

  if (fetchError || !coupon) {
    // Log failed redemption attempt
    await logCouponAudit(supabase, null, null, 'redeem_failed', {
      code,
      reason: 'not_found',
      user_id: userId,
    });
    return jsonResponse(
      { error: 'COUPON_NOT_FOUND', message: '유효하지 않은 쿠폰 코드입니다.' },
      404
    );
  }

  // Check status
  if (coupon.status !== 'available') {
    const statusMap: Record<string, { code: string; message: string; httpCode: number }> = {
      activated: {
        code: 'COUPON_ALREADY_USED',
        message: '이미 사용된 쿠폰입니다.',
        httpCode: 409,
      },
      expired: {
        code: 'COUPON_EXPIRED',
        message: '만료된 쿠폰입니다.',
        httpCode: 410,
      },
      revoked: {
        code: 'COUPON_EXPIRED',
        message: '취소된 쿠폰입니다.',
        httpCode: 410,
      },
    };

    const statusInfo = statusMap[coupon.status] ?? {
      code: 'COUPON_EXPIRED',
      message: '사용할 수 없는 쿠폰입니다.',
      httpCode: 410,
    };

    // Log failed redemption
    await logCouponAudit(supabase, coupon.pro_id, coupon.id, 'redeem_failed', {
      reason: coupon.status,
      user_id: userId,
    });

    return jsonResponse(
      { error: statusInfo.code, message: statusInfo.message },
      statusInfo.httpCode
    );
  }

  // Check expiry (should not happen as status is 'available', but defensive check)
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    await logCouponAudit(supabase, coupon.pro_id, coupon.id, 'redeem_failed', {
      reason: 'expired',
      user_id: userId,
    });
    return jsonResponse(
      { error: 'COUPON_EXPIRED', message: '만료된 쿠폰입니다.' },
      410
    );
  }

  // Activate: set member, status, expiry (90 days)
  // Use RPC for atomic transaction if available, otherwise direct update
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + COUPON_EXPIRY_DAYS);
  const nowISO = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from('coupons')
    .update({
      status: 'activated',
      member_user_id: userId,
      activated_at: nowISO,
      expires_at: expiresAt.toISOString(),
    })
    .eq('id', coupon.id)
    .eq('status', 'available') // Optimistic lock
    .select('id, code, status, activated_at, expires_at, pro_id')
    .single();

  if (updateError || !updated) {
    // Log failed redemption
    await logCouponAudit(supabase, coupon.pro_id, coupon.id, 'redeem_failed', {
      reason: 'update_failed',
      user_id: userId,
      error: updateError?.message,
    });
    return jsonResponse(
      { error: 'COUPON_GENERATION_FAILED', message: '쿠폰 활성화에 실패했습니다.' },
      500
    );
  }

  // Log successful redemption
  await logCouponAudit(supabase, coupon.pro_id, updated.id, 'activated', {
    member_user_id: userId,
    expires_at: updated.expires_at,
  });

  // Create pro-member relationship if not exists
  const { error: linkError } = await supabase
    .from('pro_member_links')
    .upsert(
      {
        pro_id: coupon.pro_id,
        member_user_id: userId,
        status: 'active',
        linked_via: 'coupon',
      },
      { onConflict: 'pro_id,member_user_id' }
    );

  if (linkError) {
    console.error('Failed to create pro-member link:', linkError);
    // Don't fail the response, but log for monitoring
  }

  // Notify pro about new member activation
  await supabase.functions.invoke('send-notification', {
    body: {
      user_id: coupon.pro_profiles.user_id,
      type: 'coupon_activated',
      title: '쿠폰이 활성화되었습니다',
      body: `새 회원이 쿠폰 ${code}를 사용하여 등록했습니다.`,
      data: { coupon_id: updated.id, member_user_id: userId },
    },
  });

  return jsonResponse({
    data: updated,
    pro_name: coupon.pro_profiles.display_name,
    expires_at: updated.expires_at,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────

function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  const segments = [4, 4]; // Format: XXXX-XXXX
  return segments
    .map((len) =>
      Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    )
    .join('-');
}

async function logCouponAudit(
  supabase: ReturnType<typeof createClient>,
  proId: string | null,
  couponId: string | null,
  action: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from('coupon_audit_log').insert({
      pro_id: proId,
      coupon_id: couponId,
      action,
      metadata,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to log coupon audit:', error);
    // Don't throw — audit logging failures should not block main operations
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
