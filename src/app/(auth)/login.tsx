import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppleSignInButton } from '@/components/auth/apple-sign-in-button';
import { Button } from '@/components/core/button';
import { Card } from '@/components/core/card';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { TextField } from '@/components/forms/text-field';
import { Screen } from '@/components/layout/screen';
import { useAuth } from '@/lib/auth/provider';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

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
    <Screen edges={['top', 'bottom']} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('auth.signIn')}</Text>
        <Text style={styles.copy}>{t('auth.signInSubtitle')}</Text>
      </View>
      <Card>
        <TextField
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextField
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        {error ? <Text style={styles.error}>{t(error)}</Text> : null}
        <Button
          label={loading ? t('auth.signingIn') : t('auth.signIn')}
          disabled={loading}
          onPress={() => void submit()}
        />
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
        <Button
          label={t('auth.createAccount')}
          variant="ghost"
          disabled={loading}
          onPress={() => router.push('/(auth)/register')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    gap: theme.spacing.sm,
  },
  title: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  copy: {
    color: theme.colors.textMuted,
    lineHeight: 22,
  },
  error: {
    color: theme.colors.danger,
  },
});
