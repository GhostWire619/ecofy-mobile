import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { env } from '@/lib/constants/env';

// Official multicolour Google "G" (per Google's branding guidelines).
function GoogleGIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <Path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <Path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <Path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </Svg>
  );
}

// Native Google Sign-In (@react-native-google-signin/google-signin).
//
// Loaded via a guarded require so the app still boots in Expo Go, where the
// native module is unavailable — there the button simply hides and email
// sign-in keeps working. A dev/standalone build is required for Google.
let GoogleSignin: any = null;
let statusCodes: any = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@react-native-google-signin/google-signin');
  GoogleSignin = mod?.GoogleSignin ?? null;
  statusCodes = mod?.statusCodes ?? {};
} catch {
  GoogleSignin = null;
}

let didConfigure = false;
function ensureConfigured() {
  if (didConfigure || !GoogleSignin || !env.googleWebClientId) return;
  // webClientId is what mints the ID token the backend verifies. The Android
  // OAuth client is matched automatically by package name + SHA-1 (no field
  // needed here); iosClientId is only used on iOS.
  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    iosClientId: env.googleIosClientId || undefined,
    scopes: ['profile', 'email'],
    offlineAccess: false,
  });
  didConfigure = true;
}

// Handle both modern (v13+: { data: { idToken } }) and legacy ({ idToken }) shapes.
function extractIdToken(result: any): string | null {
  return result?.data?.idToken ?? result?.idToken ?? null;
}

/**
 * "Continue with Google" — obtains a Google ID token via the native Google
 * Sign-In SDK and hands it to `onToken`, which posts it to the backend
 * /auth/google endpoint.
 */
export function GoogleSignInButton({
  onToken,
  onError,
  disabled,
  label = 'Continue with Google',
}: {
  onToken: (idToken: string) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const available = Boolean(GoogleSignin && env.googleWebClientId);

  async function signIn() {
    if (!available) return;
    setBusy(true);
    try {
      ensureConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();

      // User dismissed the chooser (v13+ returns { type: 'cancelled' }).
      if (result?.type === 'cancelled') return;

      let idToken = extractIdToken(result);
      if (!idToken) {
        try {
          const tokens = await GoogleSignin.getTokens();
          idToken = tokens?.idToken ?? null;
        } catch {
          /* fall through to error below */
        }
      }

      if (idToken) onToken(idToken);
      else onError?.('Google did not return an ID token.');
    } catch (e: any) {
      const code = e?.code;
      if (code === statusCodes?.SIGN_IN_CANCELLED) {
        // user cancelled — stay silent
      } else if (code === statusCodes?.IN_PROGRESS) {
        onError?.('Sign-in already in progress.');
      } else if (code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
        onError?.('Google Play Services is not available or needs an update.');
      } else {
        onError?.(e?.message ?? 'Google sign-in failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!available) return null;

  return (
    <TouchableOpacity
      style={[styles.btn, (disabled || busy) && styles.btnDisabled]}
      onPress={() => void signIn()}
      disabled={disabled || busy}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? <ActivityIndicator size="small" color="#3c4043" /> : <GoogleGIcon />}
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
    borderCurve: 'continuous',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 14, fontWeight: '700', color: '#3c4043' },
});
