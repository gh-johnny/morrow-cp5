import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { z } from 'zod';
import { deviceSchema } from '../../shared/contracts';
import { api } from '../services/api';
import { identityFor } from '../services/device-identity';
import { useSession } from './session';

const payloadSchema = z.object({ conversationId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), conversationType: z.enum(['direct', 'group']), eventId: z.string().max(400) });
if (Platform.OS !== 'web') Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }) });
export async function registerPush(requestPermission = true, devicePushToken?: Notifications.DevicePushToken) {
  if (Platform.OS === 'web') throw new Error('Push funciona no app Android/iOS. Este navegador recebe mensagens em tempo real.');
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('morrow-messages', { name: 'Conversas', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 200, 100, 200], lightColor: '#DBF581' });
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Permita notificações nas configurações do dispositivo.');
  const configured = z.object({ eas: z.object({ projectId: z.uuid() }) }).safeParse(Constants.expoConfig?.extra);
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || (configured.success ? configured.data.eas.projectId : undefined) || Constants.easConfig?.projectId;
  if (!projectId) throw new Error('O build precisa estar vinculado ao projeto Expo para registrar push.');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId, ...(devicePushToken ? { devicePushToken } : {}) })).data;
  const { auth } = await import('../services/firebase');
  if (!auth.currentUser) throw new Error('Entre na sua conta para habilitar push.');
  const identity = await identityFor(auth.currentUser.uid);
  return api('/users/me/devices', deviceSchema, { method: 'POST', body: { id: identity.deviceId, publicKey: identity.publicKey, token,
    platform: Platform.OS, label: `${Platform.OS} · ${identity.deviceId.slice(-6)}`, enabled: true } });
}
export function NotificationBridge() {
  const { user, profile } = useSession();
  useEffect(() => {
    if (Platform.OS === 'web' || !user || !profile) return;
    void registerPush(false).catch(() => undefined);
    function acknowledge(data: unknown, kind: 'received' | 'opens') {
      const result = payloadSchema.safeParse(data);
      if (!result.success) return;
      void api('/notifications/ack', z.object({ acknowledged: z.boolean() }), { method: 'POST', body: { eventId: result.data.eventId, kind } }).catch(() => undefined);
      if (kind === 'opens') router.push({ pathname: '/chat/[id]', params: { id: result.data.conversationId } });
    }
    const received = Notifications.addNotificationReceivedListener((notification) => acknowledge(notification.request.content.data, 'received'));
    const response = Notifications.addNotificationResponseReceivedListener((event) => acknowledge(event.notification.request.content.data, 'opens'));
    // Android emits this event when fetching its current token too. Reuse the
    // supplied token so registration cannot trigger another native-token fetch.
    const rotation = Notifications.addPushTokenListener((token) => { void registerPush(false, token).catch(() => undefined); });
    void Notifications.getLastNotificationResponseAsync().then((event) => { if (event) { acknowledge(event.notification.request.content.data, 'opens'); void Notifications.clearLastNotificationResponseAsync(); } });
    return () => { received.remove(); response.remove(); rotation.remove(); };
  }, [user, profile]);
  return null;
}
