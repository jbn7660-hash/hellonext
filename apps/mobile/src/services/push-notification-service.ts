/**
 * Push Notification Service
 *
 * Handles:
 * - Expo push token registration
 * - Notification permission requests
 * - Local + remote notification handling
 * - Deep linking from notifications
 * - Badge management
 *
 * Notification Types:
 * - coaching_report: New report from pro
 * - voice_memo: New voice memo response
 * - verification: Measurement verification result
 * - payment: Subscription/payment updates
 * - system: App updates, maintenance
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, Alert } from 'react-native';
import { supabase } from '@/lib/supabase/client';

// ============================================================
// Types
// ============================================================
export interface PushToken {
  token: string;
  type: 'expo' | 'fcm' | 'apns';
  platform: 'ios' | 'android' | 'web';
  deviceId: string;
}

export type NotificationType =
  | 'coaching_report'
  | 'voice_memo'
  | 'verification'
  | 'payment'
  | 'system';

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
  channelId?: string;
}

// ============================================================
// Notification Handler Configuration
// ============================================================
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    const type = data?.type as NotificationType;

    return {
      shouldShowAlert: true,
      shouldPlaySound: type !== 'system',
      shouldSetBadge: true,
    };
  },
});

// ============================================================
// Android Notification Channels
// ============================================================
async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('coaching', {
    name: '코칭 알림',
    description: '리포트, 코칭 메시지',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#22c55e',
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('voice', {
    name: '음성 메모',
    description: '음성 메모 관련 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('payment', {
    name: '결제/구독',
    description: '결제 및 구독 관련 알림',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });

  await Notifications.setNotificationChannelAsync('system', {
    name: '시스템',
    description: '앱 업데이트, 공지사항',
    importance: Notifications.AndroidImportance.LOW,
  });
}

// ============================================================
// Permission & Token
// ============================================================
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) {
    console.log('[Push] Not a physical device, skipping');
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();

  if (status !== 'granted') {
    Alert.alert(
      '알림 권한',
      '코칭 알림을 받으려면 알림 권한이 필요합니다. 설정에서 허용해주세요.',
      [{ text: '확인' }]
    );
    return false;
  }

  return true;
}

export async function registerPushToken(): Promise<PushToken | null> {
  try {
    const granted = await requestNotificationPermission();
    if (!granted) return null;

    // Setup Android channels
    await setupAndroidChannels();

    // Get Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId || undefined,
    });

    const pushToken: PushToken = {
      token: tokenData.data,
      type: 'expo',
      platform: Platform.OS as 'ios' | 'android',
      deviceId: Device.modelId || 'unknown',
    };

    // Save token to server
    await savePushTokenToServer(pushToken);

    console.log('[Push] Token registered:', pushToken.token.substring(0, 20) + '...');
    return pushToken;
  } catch (error) {
    console.error('[Push] Token registration failed:', error);
    return null;
  }
}

async function savePushTokenToServer(token: PushToken): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: user.id,
          token: token.token,
          platform: token.platform,
          device_id: token.deviceId,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,device_id',
        }
      );

    if (error) {
      console.warn('[Push] Failed to save token to server:', error.message);
    }
  } catch (error) {
    console.warn('[Push] Server save error:', error);
  }
}

// ============================================================
// Local Notifications
// ============================================================
export async function scheduleLocalNotification(
  payload: NotificationPayload,
  trigger?: Notifications.NotificationTriggerInput
): Promise<string> {
  const channelId = getChannelForType(payload.type);

  return Notifications.scheduleNotificationAsync({
    content: {
      title: payload.title,
      body: payload.body,
      data: { type: payload.type, ...payload.data },
      badge: payload.badge,
      sound: payload.sound || 'default',
      ...(Platform.OS === 'android' && { channelId }),
    },
    trigger: trigger || null,
  });
}

function getChannelForType(type: NotificationType): string {
  const channelMap: Record<NotificationType, string> = {
    coaching_report: 'coaching',
    voice_memo: 'voice',
    verification: 'coaching',
    payment: 'payment',
    system: 'system',
  };
  return channelMap[type] || 'system';
}

// ============================================================
// Notification Listeners
// ============================================================
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

// ============================================================
// Deep Link Resolution
// ============================================================
export function getDeepLinkFromNotification(
  response: Notifications.NotificationResponse
): string | null {
  const data = response.notification.request.content.data;
  const type = data?.type as NotificationType;

  switch (type) {
    case 'coaching_report':
      return data?.reportId ? `/report/${data.reportId}` : '/progress';
    case 'voice_memo':
      return data?.memoId ? `/voice-memo/${data.memoId}` : '/practice';
    case 'verification':
      return '/progress';
    case 'payment':
      return '/profile';
    default:
      return '/';
  }
}

// ============================================================
// Badge Management
// ============================================================
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

export async function clearBadge(): Promise<void> {
  await Notifications.setBadgeCountAsync(0);
}

// ============================================================
// Unregister
// ============================================================
export async function unregisterPushToken(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('device_id', Device.modelId || 'unknown');
  } catch (error) {
    console.warn('[Push] Unregister error:', error);
  }
}
