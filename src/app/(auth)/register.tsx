import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppleSignInButton } from '@/components/auth/apple-sign-in-button';
import { AuthDivider, AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/core/button';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { TextField } from '@/components/forms/text-field';
import { useAuth } from '@/lib/auth/provider';
import { legalUrls } from '@/lib/constants/env';
import type { SignupRole } from '@/lib/domain/types';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

const AUTH_HERO = require('../../../assets/images/auth/farm-auth-hero.webp');

export default function RegisterScreen() {
  const { t, locale } = useI18n();
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
  const [role, setRole] = useState<SignupRole>('farmer');

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
        preferred_language: locale,
        role,
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
      await loginWithGoogle(idToken, locale, role);
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
      await loginWithApple(identityToken, fullName, locale, role);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'auth.appleSignInFailed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      compact
      image={AUTH_HERO}
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
    >
      <View style={styles.form}>
        <View style={styles.roleBlock}>
          <Text style={styles.roleLabel}>{t('auth.accountType')}</Text>
          <View style={styles.roleRow}>
            {(['farmer', 'agronomist'] as const).map((option) => {
              const selected = role === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setRole(option)}
                  style={[styles.roleCard, selected && styles.roleCardSelected]}
                >
                  <Text style={[styles.roleTitle, selected && styles.roleTitleSelected]}>
                    {t(option === 'farmer' ? 'auth.farmer' : 'auth.agronomist')}
                  </Text>
                  <Text style={styles.roleDescription}>
                    {t(option === 'farmer' ? 'auth.farmerDescription' : 'auth.agronomistDescription')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {role === 'agronomist' ? <Text style={styles.verificationNote}>{t('auth.agronomistVerification')}</Text> : null}
        </View>
        <TextField
          label={t('auth.fullName')}
          placeholder="Your full name"
          value={form.fullName}
          onChangeText={(value) => setForm((current) => ({ ...current, fullName: value }))}
          autoComplete="name"
          density="compact"
        />
        <TextField
          label={t('auth.email')}
          placeholder="name@example.com"
          value={form.email}
          onChangeText={(value) => setForm((current) => ({ ...current, email: value }))}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          density="compact"
        />
        <TextField
          label={t('auth.password')}
          placeholder="At least 8 characters"
          value={form.password}
          onChangeText={(value) => setForm((current) => ({ ...current, password: value }))}
          autoComplete="new-password"
          secureTextEntry
          density="compact"
        />
        <TextField
          label={t('auth.phoneNumber')}
          placeholder="+255"
          value={form.phoneNumber}
          onChangeText={(value) => setForm((current) => ({ ...current, phoneNumber: value }))}
          autoComplete="tel"
          keyboardType="phone-pad"
          density="compact"
        />
        <TextField
          label={t('auth.countryRegion')}
          value={form.location}
          onChangeText={(value) => setForm((current) => ({ ...current, location: value }))}
          density="compact"
        />
        {error ? <Text selectable style={styles.error}>{t(error)}</Text> : null}
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
        <Button
          label={loading ? t('auth.creatingAccount') : t('auth.createAccount')}
          disabled={loading}
          onPress={() => void submit()}
          style={styles.primaryButton}
        />
      </View>

      <AuthDivider />

      <View style={styles.social}>
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
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.hasAccount')}</Text>
        <Pressable
          disabled={loading}
          hitSlop={8}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text style={styles.footerLink}>{t('auth.signIn')}</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 9,
  },
  roleBlock: { gap: 7 },
  roleLabel: { color: theme.colors.text, fontSize: 12, fontWeight: '800' },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleCard: {
    flex: 1,
    minHeight: 76,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: 10,
    gap: 4,
    backgroundColor: theme.colors.surface,
  },
  roleCardSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '0d' },
  roleTitle: { color: theme.colors.text, fontSize: 13, fontWeight: '800' },
  roleTitleSelected: { color: theme.colors.primary },
  roleDescription: { color: theme.colors.textMuted, fontSize: 10.5, lineHeight: 14 },
  verificationNote: { color: theme.colors.textMuted, fontSize: 10.5, lineHeight: 15 },
  primaryButton: {
    minHeight: 44,
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  error: {
    color: theme.colors.danger,
    fontSize: 12,
    lineHeight: 17,
  },
  consent: {
    fontSize: 10.5,
    lineHeight: 15,
    color: theme.colors.textMuted,
  },
  link: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  social: {
    gap: 9,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingBottom: 2,
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
});
