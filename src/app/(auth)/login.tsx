import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppleSignInButton } from '@/components/auth/apple-sign-in-button';
import { AuthDivider, AuthShell } from '@/components/auth/auth-shell';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { Button } from '@/components/core/button';
import { TextField } from '@/components/forms/text-field';
import { useAuth } from '@/lib/auth/provider';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

const AUTH_HERO = require('../../../assets/images/auth/farm-auth-hero.webp');

export default function LoginScreen() {
  const { t } = useI18n();
  const { login, loginWithGoogle, loginWithApple } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'auth.signInFailed');
    } finally {
      setLoading(false);
    }
  }

  async function onGoogleToken(idToken: string) {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle(idToken);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'auth.googleSignInFailed');
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
    <AuthShell
      image={AUTH_HERO}
      title={t('auth.signIn')}
      subtitle={t('auth.signInSubtitle')}
    >
      <View style={styles.form}>
        <TextField
          label={t('auth.email')}
          placeholder="name@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          density="compact"
        />
        <TextField
          label={t('auth.password')}
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          secureTextEntry
          density="compact"
        />
        {error ? <Text selectable style={styles.error}>{t(error)}</Text> : null}
        <Button
          label={loading ? t('auth.signingIn') : t('auth.signIn')}
          disabled={loading}
          onPress={() => void submit()}
          style={styles.primaryButton}
        />
      </View>

      <AuthDivider />

      <View style={styles.social}>
        <GoogleSignInButton
          label={t('auth.continueWithGoogle')}
          disabled={loading}
          onToken={(token) => void onGoogleToken(token)}
          onError={(message) => setError(message)}
        />
        <AppleSignInButton
          disabled={loading}
          onToken={(token, fullName) => void onAppleToken(token, fullName)}
          onError={(message) => setError(message)}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.noAccount')}</Text>
        <Pressable
          disabled={loading}
          hitSlop={8}
          onPress={() => router.replace('/(auth)/register')}
        >
          <Text style={styles.footerLink}>{t('auth.createAccount')}</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 14,
    marginTop: 2,
    borderCurve: 'continuous',
  },
  social: {
    gap: 9,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingTop: 2,
  },
  footerText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  footerLink: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  error: {
    color: theme.colors.danger,
    fontSize: 12,
    lineHeight: 17,
  },
});
