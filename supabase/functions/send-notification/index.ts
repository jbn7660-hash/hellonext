/**
 * Send Notification — Supabase Edge Function
 *
 * Advanced multi-channel notification dispatcher:
 *  1. In-app notification (always — stored in notifications table)
 *  2. Kakao Alimtalk (if enabled + phone verified + not quiet hours)
 *  3. Push notification (if FCM token registered + not quiet hours)
 *
 * Features:
 *  - Template-based messages with variable substitution
 *  - Notification batching (multiple user_ids in single call)
 *  - Priority-based channel selection (urgent/high/normal/low)
 *  - Quiet hours respect (22:00-07:00 local timezone)
 *  - Retry with exponential backoff for failed channels
 *  - Delivery status tracking per channel
 *  - User notification preference checks
 *  - Rate limiting: max 100 per user per day
 *  - Korean templates with full language support
 *
 * Called internally from other Edge Functions / API routes.
 *
 * @function send-notification
 * @feature F-011, F-014
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') ?? 'https://hellonext.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type NotificationType = 'verification_complete' | 'report_published' | 'new_member' | 'system' | 'validation_result';
type PriorityLevel = 'urgent' | 'high' | 'normal' | 'low';

interface NotificationPayload {
  user_id?: string;
  user_ids?: string[];
  type: NotificationType;
  title?: string;
  body?: string;
  template?: string;
  template_vars?: Record<string, string>;
  data?: Record<string, string>;
  channels?: ('kakao' | 'push' | 'in_app')[];
  priority?: PriorityLevel;
  respect_quiet_hours?: boolean;
}

interface DeliveryResult {
  channel: string;
  success: boolean;
  error?: string;
  retries?: number;
  timestamp: string;
}

interface NotificationTemplate {
  title: (vars: Record<string, string>) => string;
  body: (vars: Record<string, string>) => string;
  kakao?: (vars: Record<string, string>) => { templateCode: string; parameters: Record<string, string> };
}

// Korean notification templates
const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
  report_published: {
    title: (vars) => `${vars.pro_name}님의 레슨 리포트`,
    body: (vars) => `${vars.member_name}님, ${vars.report_date}에 작성된 레슨 리포트가 준비되었습니다.`,
    kakao: (vars) => ({
      templateCode: 'HELLONEXT_REPORT_PUBLISHED',
      parameters: {
        pro_name: vars.pro_name,
        member_name: vars.member_name,
        report_date: vars.report_date,
      },
    }),
  },
  verification_complete: {
    title: () => '검증 완료',
    body: (vars) => `${vars.member_name}님의 검증이 완료되었습니다. 결과를 확인해주세요.`,
    kakao: () => ({
      templateCode: 'HELLONEXT_VERIFICATION_COMPLETE',
      parameters: {},
    }),
  },
  new_member: {
    title: (vars) => `새로운 회원 ${vars.member_name}님`,
    body: () => '새로운 회원이 가입했습니다. 프로필을 확인해보세요.',
    kakao: (vars) => ({
      templateCode: 'HELLONEXT_NEW_MEMBER_JOINED',
      parameters: {
        member_name: vars.member_name,
      },
    }),
  },
  validation_result: {
    title: (vars) => `${vars.member_name}님 스윙 검증 결과`,
    body: (vars) => `신뢰도: ${vars.confidence_level}. ${vars.result_message}`,
    kakao: (vars) => ({
      templateCode: 'HELLONEXT_VALIDATION_RESULT',
      parameters: {
        member_name: vars.member_name,
        confidence: vars.confidence_level,
      },
    }),
  },
  system: {
    title: () => 'HelloNext 알림',
    body: (vars) => vars.message || '시스템 알림',
    kakao: () => ({
      templateCode: 'HELLONEXT_SYSTEM_NOTICE',
      parameters: {},
    }),
  },
};

// Helper: Check if current time is quiet hours in user's timezone
async function isInQuietHours(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('member_profiles')
      .select('timezone')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profile?.timezone) return false;

    const userTz = new Intl.DateTimeFormat('en-US', {
      timeZone: profile.timezone,
      hour: '2-digit',
      hour12: false,
    }).format(new Date());

    const hour = parseInt(userTz, 10);
    return hour >= 22 || hour < 7;
  } catch {
    return false;
  }
}

// Helper: Check user notification preferences
async function checkUserPreferences(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  channel: 'push' | 'kakao' | 'in_app'
): Promise<boolean> {
  try {
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select(`notifications_${channel}`)
      .eq('user_id', userId)
      .maybeSingle();

    return prefs ? prefs[`notifications_${channel}`] !== false : true;
  } catch {
    return true;
  }
}

// Helper: Check rate limit
async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  limit: number = 100
): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00`);

    return (count ?? 0) < limit;
  } catch {
    return true;
  }
}

// Helper: Retry with exponential backoff
async function retryFetch(
  url: string,
  options: RequestInit,
  maxRetries: number = 3
): Promise<{ response: Response; retries: number }> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      return { response, retries: i };
    } catch (err) {
      lastError = err as Error;
      const backoffMs = Math.pow(2, i) * 1000;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError ?? new Error('Max retries exceeded');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: NotificationPayload = await req.json();
    const {
      user_id,
      user_ids,
      type,
      title,
      body,
      template,
      template_vars = {},
      data,
      channels = ['in_app'],
      priority = 'normal',
      respect_quiet_hours = true,
    } = payload;

    // Validate input
    const userIds = user_id ? [user_id] : user_ids;
    if (!userIds || userIds.length === 0 || !type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id/user_ids, type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use template system if provided
    let finalTitle = title;
    let finalBody = body;

    if (template && NOTIFICATION_TEMPLATES[type]) {
      const tmpl = NOTIFICATION_TEMPLATES[type];
      finalTitle = tmpl.title(template_vars);
      finalBody = tmpl.body(template_vars);
    }

    if (!finalTitle || !finalBody) {
      return new Response(
        JSON.stringify({ error: 'Missing title/body or invalid template' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Determine channels based on priority
    let effectiveChannels = channels;
    if (priority === 'urgent') {
      effectiveChannels = ['push', 'kakao', 'in_app'];
    } else if (priority === 'high') {
      effectiveChannels = ['push', 'in_app'];
    }

    const batchResults: Record<string, DeliveryResult[]> = {};

    // Process each user
    for (const userId of userIds) {
      const userResults: DeliveryResult[] = [];

      // Rate limit check
      if (!(await checkRateLimit(supabase, userId))) {
        console.warn(`Rate limit exceeded for user ${userId}`);
        userResults.push({
          channel: 'all',
          success: false,
          error: 'Rate limit exceeded (max 100/day)',
          timestamp: new Date().toISOString(),
        });
        batchResults[userId] = userResults;
        continue;
      }

      const isQuietHours = respect_quiet_hours && (await isInQuietHours(supabase, userId));

      // 1. In-app notification (always, no quiet hours)
      if (effectiveChannels.includes('in_app')) {
        try {
          const { error: insertError } = await supabase.from('notifications').insert({
            user_id: userId,
            type,
            title: finalTitle,
            body: finalBody,
            data: data ?? {},
            delivery_status: {
              in_app: { success: true, timestamp: new Date().toISOString() },
            },
            is_read: false,
            created_at: new Date().toISOString(),
          });

          if (!insertError) {
            // Broadcast via Realtime
            await supabase
              .channel(`user-${userId}`)
              .send({
                type: 'broadcast',
                event: 'notification',
                payload: { type, title: finalTitle, body: finalBody, data: data ?? {} },
              })
              .catch(() => {
                /* Realtime delivery not critical */
              });

            userResults.push({
              channel: 'in_app',
              success: true,
              timestamp: new Date().toISOString(),
            });
          } else {
            throw insertError;
          }
        } catch (err) {
          userResults.push({
            channel: 'in_app',
            success: false,
            error: err instanceof Error ? err.message : 'Failed to insert',
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 2. Kakao Alimtalk (skip in quiet hours unless urgent)
      if (effectiveChannels.includes('kakao') && (!isQuietHours || priority === 'urgent')) {
        const kakaoPrefsOk = await checkUserPreferences(supabase, userId, 'kakao');
        if (!kakaoPrefsOk) {
          userResults.push({
            channel: 'kakao',
            success: false,
            error: 'User has disabled Kakao notifications',
            timestamp: new Date().toISOString(),
          });
        } else {
          await sendKakaoAlimtalk(supabase, userId, type, finalTitle, finalBody, template_vars, userResults);
        }
      }

      // 3. FCM Push (skip in quiet hours unless urgent)
      if (effectiveChannels.includes('push') && (!isQuietHours || priority === 'urgent')) {
        const pushPrefsOk = await checkUserPreferences(supabase, userId, 'push');
        if (!pushPrefsOk) {
          userResults.push({
            channel: 'push',
            success: false,
            error: 'User has disabled push notifications',
            timestamp: new Date().toISOString(),
          });
        } else {
          await sendFcmPush(supabase, userId, finalTitle, finalBody, data, userResults);
        }
      }

      batchResults[userId] = userResults;
    }

    console.log('Batch notification sent', {
      user_count: userIds.length,
      type,
      priority,
      results: batchResults,
    });

    return new Response(JSON.stringify({ success: true, results: batchResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-notification error:', err);
    return new Response(
      JSON.stringify({
        error: 'Internal error',
        details: err instanceof Error ? err.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper: Send Kakao Alimtalk with retry
async function sendKakaoAlimtalk(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  templateVars: Record<string, string>,
  results: DeliveryResult[]
) {
  const kakaoApiKey = Deno.env.get('KAKAO_ALIMTALK_API_KEY');
  const kakaoSenderId = Deno.env.get('KAKAO_ALIMTALK_SENDER_ID');

  if (!kakaoApiKey || !kakaoSenderId) {
    results.push({
      channel: 'kakao',
      success: false,
      error: 'Kakao Alimtalk not configured',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const phone = userData?.user?.phone;

    if (!phone) {
      results.push({
        channel: 'kakao',
        success: false,
        error: 'User phone not verified',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const tmpl = NOTIFICATION_TEMPLATES[type]?.kakao?.(templateVars);
    const templateCode = tmpl?.templateCode ?? 'HELLONEXT_SYSTEM_NOTICE';

    const { response, retries } = await retryFetch(
      'https://api-alimtalk.kakao.com/v2/sender/send',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kakaoApiKey}`,
        },
        body: JSON.stringify({
          senderKey: kakaoSenderId,
          templateCode,
          recipientList: [
            {
              recipientNo: phone,
              templateParameter: tmpl?.parameters ?? { title, body },
            },
          ],
        }),
      }
    );

    results.push({
      channel: 'kakao',
      success: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      retries,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    results.push({
      channel: 'kakao',
      success: false,
      error: err instanceof Error ? err.message : 'Kakao send failed',
      timestamp: new Date().toISOString(),
    });
  }
}

// Helper: Send FCM Push with retry
async function sendFcmPush(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  title: string,
  body: string,
  data: Record<string, string> | undefined,
  results: DeliveryResult[]
) {
  const fcmServiceAccount = Deno.env.get('FCM_SERVICE_ACCOUNT_KEY');
  const gcpProjectId = Deno.env.get('GCP_PROJECT_ID');

  if (!fcmServiceAccount || !gcpProjectId) {
    results.push({
      channel: 'push',
      success: false,
      error: 'FCM not configured',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const fcmToken = await getFcmToken(supabase, userId);

    if (!fcmToken) {
      results.push({
        channel: 'push',
        success: false,
        error: 'No FCM token registered',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { response, retries } = await retryFetch(
      `https://fcm.googleapis.com/v1/projects/${gcpProjectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${fcmServiceAccount}`,
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: { title, body },
            data: data ?? {},
            webpush: {
              fcm_options: {
                link: data?.report_id ? `/reports/${data.report_id}` : '/',
              },
            },
          },
        }),
      }
    );

    results.push({
      channel: 'push',
      success: response.ok,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      retries,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    results.push({
      channel: 'push',
      success: false,
      error: err instanceof Error ? err.message : 'FCM send failed',
      timestamp: new Date().toISOString(),
    });
  }
}

// Helper: Get FCM token for user
async function getFcmToken(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  try {
    const { data: memberProfile } = await supabase
      .from('member_profiles')
      .select('fcm_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (memberProfile?.fcm_token) return memberProfile.fcm_token;

    const { data: proProfile } = await supabase
      .from('pro_profiles')
      .select('fcm_token')
      .eq('user_id', userId)
      .maybeSingle();

    return proProfile?.fcm_token ?? null;
  } catch {
    return null;
  }
}

