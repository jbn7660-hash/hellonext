/**
 * Edge Function: push-send
 *
 * Sends push notifications via Expo Push API.
 * Called by other Edge Functions or DB triggers.
 *
 * POST /functions/v1/push-send
 * Body: { user_ids: string[], title, body, data?, type? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PushPayload {
  user_ids: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
  type?: string;
  badge?: number;
  sound?: string;
  channelId?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth (Service Role only) ──────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.includes(SUPABASE_SERVICE_KEY)) {
      // Verify user auth
      const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      const token = authHeader?.replace('Bearer ', '') || '';
      const { data: { user } } = await supabaseUser.auth.getUser(token);
      if (!user) {
        return jsonResponse({ error: '인증 필요' }, 401);
      }
    }

    const payload: PushPayload = await req.json();
    const { user_ids, title, body, data, type, badge, sound, channelId } = payload;

    if (!user_ids?.length || !title || !body) {
      return jsonResponse({ error: 'user_ids, title, body 필수' }, 400);
    }

    // ── Fetch Push Tokens ─────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: tokens, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token, platform, user_id')
      .in('user_id', user_ids)
      .eq('is_active', true);

    if (tokenError || !tokens?.length) {
      return jsonResponse({
        sent: 0,
        errors: tokenError ? [tokenError.message] : ['토큰 없음'],
      }, 200);
    }

    // ── Build Expo Messages ───────────────────
    const messages = tokens.map((t) => ({
      to: t.token,
      title,
      body,
      data: { ...data, type: type || 'general' },
      sound: sound || 'default',
      badge: badge ?? 1,
      channelId: channelId || getChannelForType(type || 'system'),
      priority: type === 'payment' ? 'high' : 'default',
    }));

    // ── Send via Expo Push API ────────────────
    // Batch in chunks of 100
    const BATCH_SIZE = 100;
    const results: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify(batch),
        });

        const result = await response.json();
        results.push(...(result.data || []));

        // Handle invalid tokens
        if (result.data) {
          for (let j = 0; j < result.data.length; j++) {
            const ticket = result.data[j];
            if (ticket.status === 'error') {
              errors.push(`${batch[j].to}: ${ticket.message}`);

              // Deactivate invalid tokens
              if (ticket.details?.error === 'DeviceNotRegistered') {
                await supabase.from('push_tokens')
                  .update({ is_active: false })
                  .eq('token', batch[j].to);
              }
            }
          }
        }
      } catch (err) {
        errors.push(`Batch ${i / BATCH_SIZE}: ${err}`);
      }
    }

    // ── Log Notification ──────────────────────
    await supabase.from('notifications').insert(
      user_ids.map((uid) => ({
        user_id: uid,
        title,
        body,
        type: type || 'system',
        data: data || {},
        read: false,
      }))
    );

    return jsonResponse({
      sent: results.filter((r) => r.status === 'ok').length,
      total: messages.length,
      errors: errors.length > 0 ? errors : undefined,
    }, 200);
  } catch (error) {
    console.error('Push send error:', error);
    return jsonResponse({ error: '서버 오류' }, 500);
  }
});

function getChannelForType(type: string): string {
  const map: Record<string, string> = {
    coaching_report: 'coaching',
    voice_memo: 'voice',
    verification: 'coaching',
    payment: 'payment',
    system: 'system',
  };
  return map[type] || 'system';
}

function jsonResponse(data: any, status: number) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
    status,
  });
}
