import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';

import { theme } from '@/lib/theme';

/** A single pulsing placeholder block. */
export function Skeleton({
  height = 16,
  width = '100%',
  radius = theme.radius.sm,
  style,
}: {
  height?: number;
  width?: ViewStyle['width'];
  radius?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ height, width, borderRadius: radius, backgroundColor: theme.colors.border, opacity }, style]}
    />
  );
}

/** Card-shaped skeleton for loading list/hero states. */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton height={18} width="55%" />
      <Skeleton height={12} width="90%" />
      <Skeleton height={12} width="78%" />
      <Skeleton height={44} width="100%" radius={theme.radius.pill} style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
});
