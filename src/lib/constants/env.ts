import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { resolveApiUrl } from '@/lib/constants/api-url';

type ExpoExtra = {
  apiUrl?: string;
  mapboxAccessToken?: string;
  mapboxStyleUrl?: string;
  environmentName?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
const devHostUri =
  Constants.expoConfig?.hostUri ??
  Constants.platform?.hostUri ??
  Constants.linkingUri ??
  null;

export const env = {
  apiUrl: resolveApiUrl({
    explicitApiUrl: extra.apiUrl || 'https://api.ecofy.co.tz',
    hostUri: devHostUri,
    platform: Platform.OS,
  }),
  mapboxAccessToken: extra.mapboxAccessToken ?? '',
  mapboxStyleUrl: extra.mapboxStyleUrl ?? 'mapbox://styles/mapbox/outdoors-v12',
  environmentName: extra.environmentName ?? 'local',
  googleWebClientId: extra.googleWebClientId ?? '',
  googleIosClientId: extra.googleIosClientId ?? '',
  googleAndroidClientId: extra.googleAndroidClientId ?? '',
};

export const envDebug = {
  resolvedApiUrl: env.apiUrl,
  explicitApiUrl: extra.apiUrl,
  hostUri: devHostUri,
  platform: Platform.OS,
  environmentName: env.environmentName,
};

export const secureStoreKeys = {
  accessToken: 'ecofy_access_token',
  refreshToken: 'ecofy_refresh_token',
  user: 'ecofy_user',
  localeOverride: 'ecofy_locale_override',
  installationId: 'ecofy_installation_id',
} as const;
