import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AppleSignInButton } from '@/components/auth/apple-sign-in-button';
import { Button } from '@/components/core/button';
import { Card } from '@/components/core/card';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { TextField } from '@/components/forms/text-field';
import { Screen } from '@/components/layout/screen';
import { useAuth } from '@/lib/auth/provider';
import { legalUrls } from '@/lib/constants/env';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

export default function RegisterScreen() {
  const { t } = useI18n();
  const { register, loginWithGoogle, loginWithApple } = useAuth();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phoneNumber: '',
    location: 'Tanzania',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);

    try {
      await register({
        full_name: form.fullName,
        email: form.email.trim(),
        password: form.password,
        phone_number: form.phoneNumber || undefined,
        location: form.location || undefined,
        preferred_language: 'en',
      });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'auth.registrationFailed');
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleToken(idToken: string) {
    setLoading(true);
    setError(null);
    try {
      // Google sign-up and sign-in are the same flow — the backend /auth/google
      // creates the account on first use, then signs in.
      await loginWithGoogle(idToken);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'auth.googleSignUpFailed');
    } finally {
      setLoading(false);
    }
  }

  async function onAppleToken(identityToken: string, fullName?: string | null) {
    setLoading(true);
    setError(null);
    try {
      await loginWithApple(identityToken, fullName);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'auth.appleSignInFailed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Card>
        <Text style={styles.title}>{t('auth.registerTitle')}</Text>
        <Text style={styles.copy}>{t('auth.registerSubtitle')}</Text>
      </Card>
      <Card>
        <TextField
          label={t('auth.fullName')}
          value={form.fullName}
          onChangeText={(value) => setForm((current) => ({ ...current, fullName: value }))}
        />
        <TextField
          label={t('auth.email')}
          value={form.email}
          onChangeText={(value) => setForm((current) => ({ ...current, email: value }))}
          autoCapitalize="none"
        />
        <TextField
          label={t('auth.password')}
          value={form.password}
          onChangeText={(value) => setForm((current) => ({ ...current, password: value }))}
          secureTextEntry
        />
        <TextField
          label={t('auth.phoneNumber')}
          value={form.phoneNumber}
          onChangeText={(value) => setForm((current) => ({ ...current, phoneNumber: value }))}
        />
        <TextField
          label={t('auth.countryRegion')}
          value={form.location}
          onChangeText={(value) => setForm((current) => ({ ...current, location: value }))}
        />
        {error ? <Text style={styles.error}>{t(error)}</Text> : null}
        <Text style={styles.consent}>
          {t('auth.consentPrefix')}
          <Text style={styles.link} onPress={() => void WebBrowser.openBrowserAsync(legalUrls.terms)}>
            {t('auth.consentTerms')}
          </Text>
          {t('auth.consentAnd')}
          <Text style={styles.link} onPress={() => void WebBrowser.openBrowserAsync(legalUrls.privacy)}>
            {t('auth.consentPrivacy')}
          </Text>
          {t('auth.consentSuffix')}
        </Text>
        <Button label={loading ? t('auth.creatingAccount') : t('auth.createAccount')} disabled={loading} onPress={() => void submit()} />
        <GoogleSignInButton
          label={t('auth.signUpWithGoogle')}
          disabled={loading}
          onToken={(token) => void onGoogleToken(token)}
          onError={(message) => setError(message)}
        />
        <AppleSignInButton
          disabled={loading}
          onToken={(token, fullName) => void onAppleToken(token, fullName)}
          onError={(message) => setError(message)}
        />
        <Button label={t('auth.backToSignIn')} variant="ghost" disabled={loading} onPress={() => router.back()} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  copy: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  error: {
    color: theme.colors.danger,
  },
  consent: {
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  link: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
});
