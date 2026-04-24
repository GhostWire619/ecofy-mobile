import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/core/button';
import { Card } from '@/components/core/card';
import { TextField } from '@/components/forms/text-field';
import { Screen } from '@/components/layout/screen';
import { useAuth } from '@/lib/auth/provider';
import { theme } from '@/lib/theme';

export default function LoginScreen() {
  const { login } = useAuth();
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
      setError(nextError instanceof Error ? nextError.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen edges={['top', 'bottom']} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.copy}>
          Access your farms, offline logs, crop journeys, and field guidance.
        </Text>
      </View>
      <Card>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={loading ? 'Signing in...' : 'Sign in'}
          disabled={loading}
          onPress={() => void submit()}
        />
        <Button
          label="Create account"
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
