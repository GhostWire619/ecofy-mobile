import { StyleSheet, Text, View } from 'react-native';

import { theme } from '@/lib/theme';

export function Pill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <View style={[styles.base, toneStyles[tone]]}>
      <Text style={[styles.label, labelStyles[tone]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});

const toneStyles = StyleSheet.create({
  neutral: { backgroundColor: '#edf2ea' },
  success: { backgroundColor: '#e0f3e6' },
  warning: { backgroundColor: '#fff1d8' },
  danger: { backgroundColor: '#fde4de' },
  info: { backgroundColor: '#e3eefc' },
});

const labelStyles = StyleSheet.create({
  neutral: { color: theme.colors.textMuted },
  success: { color: theme.colors.success },
  warning: { color: theme.colors.warning },
  danger: { color: theme.colors.danger },
  info: { color: theme.colors.info },
});
