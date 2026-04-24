import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/core/button';
import { Card } from '@/components/core/card';
import { TextField } from '@/components/forms/text-field';
import { Screen } from '@/components/layout/screen';
import { useAuth } from '@/lib/auth/provider';
import { theme } from '@/lib/theme';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    phoneNumber: '',
    location: 'Kenya',
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
      setError(nextError instanceof Error ? nextError.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Card>
        <Text style={styles.title}>Create your Ecofy account</Text>
        <Text style={styles.copy}>
          Start with a mobile workflow built for daily farming decisions and low-connectivity field work.
        </Text>
      </Card>
      <Card>
        <TextField
          label="Full name"
          value={form.fullName}
          onChangeText={(value) => setForm((current) => ({ ...current, fullName: value }))}
        />
        <TextField
          label="Email"
          value={form.email}
          onChangeText={(value) => setForm((current) => ({ ...current, email: value }))}
          autoCapitalize="none"
        />
        <TextField
          label="Password"
          value={form.password}
          onChangeText={(value) => setForm((current) => ({ ...current, password: value }))}
          secureTextEntry
        />
        <TextField
          label="Phone number"
          value={form.phoneNumber}
          onChangeText={(value) => setForm((current) => ({ ...current, phoneNumber: value }))}
        />
        <TextField
          label="Country or region"
          value={form.location}
          onChangeText={(value) => setForm((current) => ({ ...current, location: value }))}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={loading ? 'Creating account...' : 'Create account'} onPress={() => void submit()} />
        <Button label="Back to sign in" variant="ghost" onPress={() => router.back()} />
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
});
