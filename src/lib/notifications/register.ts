import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { mobileApi } from '@/lib/api/mobile';
import { secureStoreKeys } from '@/lib/constants/env';
import { createId } from '@/lib/utils/id';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushNotifications(locale: string) {
  if (!Device.isDevice) {
    return null;
  }

  const permission = await Notifications.getPermissionsAsync();
  let granted =
    (permission as { granted?: boolean }).granted ??
    (permission as { status?: string }).status === 'granted';

  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted =
      (requested as { granted?: boolean }).granted ??
      (requested as { status?: string }).status === 'granted';
  }

  if (!granted) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('field-alerts', {
      name: 'Field alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) {
    return null;
  }

  let installationId = await SecureStore.getItemAsync(secureStoreKeys.installationId);
  if (!installationId) {
    installationId = createId('install');
    await SecureStore.setItemAsync(secureStoreKeys.installationId, installationId);
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await mobileApi.registerDevice({
    installation_id: installationId,
    expo_push_token: token.data,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    locale,
  });
  return token.data;
}
