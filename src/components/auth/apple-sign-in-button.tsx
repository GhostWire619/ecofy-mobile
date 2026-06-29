import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * "Continue with Apple" — required on iOS (Apple Guideline 4.8, since we offer
 * Google Sign-In). Renders Apple's official button (iOS only) and hands the
 * identity token (+ the name, which Apple only provides on the first sign-in)
 * to `onToken`, which posts it to the backend /auth/apple endpoint. On Android
 * and where Apple auth is unavailable it renders nothing.
 */
export function AppleSignInButton({
  onToken,
  onError,
  disabled,
}: {
  onToken: (identityToken: string, fullName?: string | null) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  if (Platform.OS !== 'ios' || !available) return null;

  async function signIn() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const token = credential.identityToken;
      if (!token) {
        onError?.('Apple did not return an identity token.');
        return;
      }
      const fullName =
        [credential.fullName?.givenName, credential.fullName?.familyName]
          .filter(Boolean)
          .join(' ') || null;
      onToken(token, fullName);
    } catch (e: unknown) {
      // User cancelled the native sheet — stay silent.
      if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return;
      onError?.((e as Error)?.message ?? 'Apple sign-in failed.');
    }
  }

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={14}
      style={{ height: 44, width: '100%', opacity: disabled ? 0.6 : 1 }}
      onPress={() => {
        if (!disabled) void signIn();
      }}
    />
  );
}
