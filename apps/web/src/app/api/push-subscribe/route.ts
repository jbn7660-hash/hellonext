/**
 * API Route: Push Subscribe
 *
 * Saves push notification subscription (web or mobile) to database.
 * POST /api/push-subscribe
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get auth user from header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: '인증 필요' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return NextResponse.json({ error: '인증 실패' }, { status: 401 });
    }

    const body = await request.json();

    // Web Push subscription format
    if (body.endpoint) {
      const { error } = await supabase.from('push_tokens').upsert({
        user_id: user.id,
        token: JSON.stringify(body), // Store full subscription object
        platform: 'web',
        device_id: `web-${hashString(body.endpoint)}`,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,device_id',
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    // Mobile token format
    else if (body.token) {
      const { error } = await supabase.from('push_tokens').upsert({
        user_id: user.id,
        token: body.token,
        platform: body.platform || 'web',
        device_id: body.device_id || 'unknown',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,device_id',
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
