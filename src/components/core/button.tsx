import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { theme } from '@/lib/theme';

type ButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

export function Button({
  label,
  variant = 'primary',
  style,
  disabled,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      accessible
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{
        ...accessibilityState,
        disabled: Boolean(disabled),
      }}
      disabled={disabled}
      hitSlop={8}
      style={(state) => {
        const resolvedStyle = typeof style === 'function' ? style(state) : style;
        return [
          styles.base,
          variantStyles[variant],
          state.pressed && !disabled ? styles.pressed : null,
          disabled ? styles.disabled : null,
          resolvedStyle,
        ];
      }}
      {...props}
    >
      <Text style={[styles.label, labelStyles[variant], disabled ? styles.disabledLabel : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.5,
  },
  disabledLabel: {
    color: theme.colors.textMuted,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: theme.colors.danger,
  },
});

const labelStyles = StyleSheet.create({
  primary: {
    color: '#ffffff',
  },
  secondary: {
    color: theme.colors.text,
  },
  ghost: {
    color: theme.colors.primary,
  },
  danger: {
    color: '#ffffff',
  },
});
