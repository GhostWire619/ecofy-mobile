import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/core/button';
import { INTRO_SEEN_KEY, prefsRepository } from '@/lib/db/repositories';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

type Slide = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  en: { title: string; body: string };
  sw: { title: string; body: string };
};

const SLIDES: Slide[] = [
  {
    icon: 'calendar-outline',
    en: { title: 'Your season, planned', body: 'Know exactly what to do each week — from planting to harvest.' },
    sw: { title: 'Msimu wako, umepangwa', body: 'Jua la kufanya kila wiki — kupanda hadi kuvuna.' },
  },
  {
    icon: 'scan-outline',
    en: { title: 'Spot problems early', body: 'Snap a photo to identify pests and diseases — and what to do about them.' },
    sw: { title: 'Gundua matatizo mapema', body: 'Piga picha kutambua wadudu na magonjwa — na la kufanya.' },
  },
  {
    icon: 'sparkles-outline',
    en: { title: 'Help, anytime', body: 'Ask Ecofy AI in your language, track your progress, and earn rewards.' },
    sw: { title: 'Msaada, wakati wowote', body: 'Uliza Ecofy AI kwa lugha yako, fuatilia maendeleo, na pata zawadi.' },
  },
];

export default function IntroScreen() {
  const { locale } = useI18n();
  const sw = locale === 'sw';
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  async function finish(target: '/(auth)/register' | '/(auth)/login') {
    await prefsRepository.set(INTRO_SEEN_KEY, '1').catch(() => undefined);
    router.replace(target);
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1));
    if (next !== index) setIndex(next);
  }

  function onNext() {
    if (last) {
      void finish('/(auth)/register');
      return;
    }
    scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
    setIndex(index + 1);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.skipRow}>
        <TouchableOpacity onPress={() => void finish('/(auth)/register')} hitSlop={8}>
          <Text style={styles.skip}>{sw ? 'Ruka' : 'Skip'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.flex}
      >
        {SLIDES.map((slide) => {
          const copy = sw ? slide.sw : slide.en;
          return (
            <View key={slide.icon} style={[styles.slide, { width }]}>
              <View style={styles.iconCircle}>
                <Ionicons name={slide.icon} size={64} color={theme.colors.primary} />
              </View>
              <Text style={styles.title}>{copy.title}</Text>
              <Text style={styles.body}>{copy.body}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.footer}>
        <Button label={last ? (sw ? 'Anza' : 'Get started') : sw ? 'Endelea' : 'Next'} onPress={onNext} />
        <TouchableOpacity onPress={() => void finish('/(auth)/login')} hitSlop={8} style={styles.signInRow}>
          <Text style={styles.signInText}>
            {sw ? 'Una akaunti tayari? Ingia' : 'Already have an account? Sign in'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  skipRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  skip: { fontSize: 15, fontWeight: '600', color: theme.colors.textMuted },

  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.xl, gap: theme.spacing.lg },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  title: { fontSize: 26, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  body: { fontSize: 16, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 24, paddingHorizontal: theme.spacing.md },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: theme.spacing.lg },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.border },
  dotActive: { backgroundColor: theme.colors.primary, width: 22 },

  footer: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg, gap: theme.spacing.md },
  signInRow: { alignItems: 'center', paddingVertical: 4 },
  signInText: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
});
