import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '@/lib/theme';

/**
 * Animated streak flame + day count.
 *
 * - Active (count > 0, grace OK): flickers warm.
 * - At risk (graceRemaining === 0 and not earned today): greyed, gentle.
 * - Zero streak: greyed, static.
 */
export function StreakFlame({
  count,
  atRisk = false,
  label = 'day streak',
}: {
  count: number;
  atRisk?: boolean;
  label?: string;
}) {
  const flicker = useSharedValue(1);
  const active = count > 0 && !atRisk;

  useEffect(() => {
    if (active) {
      flicker.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 600, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.96, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      );
    } else {
      flicker.value = withTiming(1, { duration: 200 });
    }
  }, [active, flicker]);

  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flicker.value }],
  }));

  const color = count === 0 ? theme.colors.disabled : atRisk ? theme.colors.warning : '#f2722b';

  return (
    <View style={styles.row}>
      <Animated.View style={flameStyle}>
        <Ionicons
          name={count === 0 ? 'flame-outline' : 'flame'}
          size={22}
          color={color}
        />
      </Animated.View>
      <View>
        <Text style={[styles.count, { color }]}>{count}</Text>
        <Text style={styles.label}>{atRisk && count > 0 ? 'save it today!' : label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { fontSize: 18, fontWeight: '800', lineHeight: 20 },
  label: { fontSize: 10, fontWeight: '600', color: theme.colors.textMuted },
});
