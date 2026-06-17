import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '@/lib/theme';

/**
 * XP progress bar with level badge.
 *
 * Drives off the EngagementSummary shape:
 *   level, xp_into_level, xp_for_next_level, progress_to_next (0..1)
 *
 * Animates the fill when `progress` changes and pulses the level badge on level-up.
 */
export function LevelBar({
  level,
  xpIntoLevel,
  xpForNextLevel,
  progress,
  compact = false,
}: {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1
  compact?: boolean;
}) {
  const fill = useSharedValue(0);
  const badgeScale = useSharedValue(1);

  useEffect(() => {
    fill.value = withTiming(Math.max(0, Math.min(1, progress)), {
      duration: 650,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, fill]);

  useEffect(() => {
    // pulse the badge whenever the level changes
    badgeScale.value = withSequence(
      withTiming(1.25, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
    );
  }, [level, badgeScale]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%` as `${number}%`,
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Animated.View style={[styles.badge, badgeStyle]}>
        <Text style={styles.badgeLevel}>{level}</Text>
      </Animated.View>
      <View style={styles.barWrap}>
        {!compact && (
          <View style={styles.labelRow}>
            <Text style={styles.label}>Level {level}</Text>
            <Text style={styles.xpText}>
              {xpIntoLevel}/{xpForNextLevel} XP
            </Text>
          </View>
        )}
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCompact: { gap: 8 },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  badgeLevel: { color: '#fff', fontWeight: '800', fontSize: 16 },
  barWrap: { flex: 1, gap: 4 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  xpText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  track: {
    height: 10,
    backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%' as `${number}%`,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
  },
});
