import { useState } from 'react';

import { Button } from '@/components/core/button';
import { env } from '@/lib/constants/env';

// Native Google Sign-In (@react-native-google-signin/google-signin).
//
// Loaded via a guarded require so the app still boots in Expo Go, where the
// native module is unavailable — there the button simply hides and email
// sign-in keeps working. A dev/standalone build is required for Google.
let GoogleSignin: any = null;
let statusCodes: any = {};
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
    <Button
      label={label}
      variant="secondary"
      disabled={disabled || busy}
      onPress={() => void signIn()}
    />
  );
}
