import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/core/button';
import { Card } from '@/components/core/card';
import { Screen } from '@/components/layout/screen';
import { theme } from '@/lib/theme';

export default function WelcomeScreen() {
  return (
    <Screen edges={['top', 'bottom']}>
      <Card style={styles.hero}>
        <Text style={styles.eyebrow}>Design for real field work</Text>
        <Text style={styles.title}>Set up your first farm</Text>
        <Text style={styles.copy}>
          Ecofy will sync to the server right away when internet is available and keep a local
          backup when you lose connectivity in the field.
        </Text>
        <Button label="Continue" onPress={() => router.push('/(onboarding)/farm-setup')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: theme.colors.primaryDark,
  },
  eyebrow: {
    color: '#cbe3cf',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '800',
    fontSize: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
  },
  copy: {
    color: '#dbeadc',
    lineHeight: 22,
  },
});
