import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { AchievementBadge } from '@/lib/domain/types';
import { theme } from '@/lib/theme';

const TIER_COLOR: Record<string, string> = {
  bronze: '#c87f3a',
  silver: '#8fa3ad',
  gold: theme.colors.accent,
  platinum: '#5bb6c9',
};

/**
 * Celebration modal for a freshly unlocked achievement.
 *
 * Pass the newest unseen badge as `badge`. Fires a success haptic and animates
 * the medal in. Caller controls visibility (set badge to null to close).
 */
export function AchievementModal({
  badge,
  onClose,
}: {
  badge: AchievementBadge | null;
  onClose: () => void;
}) {
  const scale = useSharedValue(0.5);
  const rotate = useSharedValue(-0.15);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (badge) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      scale.value = withSequence(
        withTiming(1.1, { duration: 320, easing: Easing.out(Easing.back(2.2)) }),
        withTiming(1, { duration: 180 }),
      );
      rotate.value = withSequence(
        withTiming(0.1, { duration: 200 }),
        withTiming(-0.06, { duration: 200 }),
        withTiming(0, { duration: 160 }),
      );
      glow.value = withDelay(150, withTiming(1, { duration: 500 }));
    } else {
      scale.value = 0.5;
      rotate.value = -0.15;
      glow.value = 0;
    }
  }, [badge, scale, rotate, glow]);

  const medalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}rad` }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.6 }));

  if (!badge) return null;

  const tierColor = TIER_COLOR[(badge.badge_tier ?? '').toLowerCase()] ?? theme.colors.accent;

  return (
    <Modal visible transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          <Text style={styles.kicker}>ACHIEVEMENT UNLOCKED</Text>

          <View style={styles.medalWrap}>
            <Animated.View style={[styles.glow, { backgroundColor: tierColor }, glowStyle]} />
            <Animated.View style={[styles.medal, { borderColor: tierColor }, medalStyle]}>
              <Ionicons
                name={(badge.icon as React.ComponentProps<typeof Ionicons>['name']) ?? 'trophy'}
                size={44}
                color={tierColor}
              />
            </Animated.View>
          </View>

          <Text style={styles.name}>{badge.name ?? 'New badge'}</Text>
          {badge.description ? <Text style={styles.desc}>{badge.description}</Text> : null}
          {badge.badge_tier ? (
            <View style={[styles.tierPill, { backgroundColor: tierColor + '22' }]}>
              <Text style={[styles.tierText, { color: tierColor }]}>
                {badge.badge_tier.toUpperCase()}
              </Text>
            </View>
          ) : null}

          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Nice!</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 28,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 340,
    ...(theme.shadow as object),
  },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, color: theme.colors.textMuted },
  medalWrap: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  glow: { position: 'absolute', width: 110, height: 110, borderRadius: 55 },
  medal: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 20, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  desc: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
  tierPill: { borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 4, marginTop: 2 },
  tierText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  button: {
    marginTop: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 40,
    paddingVertical: 12,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
