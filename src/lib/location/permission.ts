import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';

import { secureStoreKeys } from '@/lib/constants/env';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

/**
 * Request foreground location with a prominent disclosure.
 *
 * Google Play policy requires an in-app disclosure that explains what location
 * data is collected and why, shown BEFORE the system permission dialog. We show
 * it once (persisting a flag), then request the OS permission. Returns true only
 * if foreground location is ultimately granted.
 */
export async function ensureLocationPermission(t: TFunc): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) {
    return true;
  }

  const alreadyDisclosed = await SecureStore.getItemAsync(
    secureStoreKeys.locationDisclosureShown,
  );
  if (!alreadyDisclosed) {
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        t('location.disclosureTitle'),
        t('location.disclosureBody'),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('common.continue'), onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    });
    await SecureStore.setItemAsync(secureStoreKeys.locationDisclosureShown, '1');
    if (!proceed) {
      return false;
    }
  }

  const res = await Location.requestForegroundPermissionsAsync();
  return res.status === 'granted';
}
