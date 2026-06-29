import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { theme } from '@/lib/theme';

type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
  density?: 'default' | 'compact';
};

export function TextField({
  label,
  hint,
  density = 'default',
  style,
  ...props
}: TextFieldProps) {
  const compact = density === 'compact';

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.input, compact && styles.inputCompact, style]}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
  },
  containerCompact: {
    gap: 5,
  },
  label: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    minHeight: 52,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    fontSize: 16,
  },
  labelCompact: {
    fontSize: 12,
  },
  inputCompact: {
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  hint: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
