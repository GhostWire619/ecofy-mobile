import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { theme } from '@/lib/theme';

/**
 * Floating "+N XP" feedback. Wrap the app (or a screen) in <XpGainProvider>,
 * then call useXpGain().award(amount) anywhere — e.g. on task completion.
 *
 * Fires a haptic and animates a label up-and-fade near the top of the screen.
 */

type XpGainApi = { award: (amount: number, opts?: { haptic?: boolean }) => void };

const XpGainContext = createContext<XpGainApi | null>(null);

export function useXpGain(): XpGainApi {
  const ctx = useContext(XpGainContext);
  // Safe no-op if provider is absent (e.g. in tests)
  return ctx ?? { award: () => {} };
}

type Toast = { id: number; amount: number };

export function XpGainProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const counter = useRef(0);

  const award = useCallback((amount: number, opts?: { haptic?: boolean }) => {
    if (amount <= 0) return;
    if (opts?.haptic !== false) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    counter.current += 1;
    setToast({ id: counter.current, amount });
  }, []);

  const api = useMemo(() => ({ award }), [award]);

  return (
    <XpGainContext.Provider value={api}>
      {children}
      {toast && (
        <FloatingXp
          key={toast.id}
          amount={toast.amount}
          onDone={() => setToast((cur) => (cur?.id === toast.id ? null : cur))}
        />
      )}
    </XpGainContext.Provider>
  );
}

function FloatingXp({ amount, onDone }: { amount: number; onDone: () => void }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.7);

  // start the animation on mount
  opacity.value = withSequence(
    withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
    withDelay(550, withTiming(0, { duration: 350 }, (finished) => {
      if (finished) runOnJS(onDone)();
    })),
  );
  translateY.value = withTiming(-70, { duration: 1100, easing: Easing.out(Easing.cubic) });
  scale.value = withSequence(
    withTiming(1.15, { duration: 200, easing: Easing.out(Easing.back(2)) }),
    withTiming(1, { duration: 150 }),
  );

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View style={[styles.pill, style]}>
        <Text style={styles.text}>+{amount} XP</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: '32%',
  },
  pill: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 8,
    ...(theme.shadow as object),
  },
  text: { color: theme.colors.primaryDark, fontWeight: '900', fontSize: 18 },
});
