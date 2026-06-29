import { Image, type ImageSource } from 'expo-image';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/core/button';
import { INTRO_SEEN_KEY, prefsRepository } from '@/lib/db/repositories';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

type Slide = {
  image: ImageSource;
  kicker: string;
  en: { title: string; body: string };
  sw: { title: string; body: string };
};

const SLIDES: Slide[] = [
  {
    image: require('../../assets/images/onboarding/season-plan.png'),
    kicker: '01 · PLAN',
    en: { title: 'Your season, planned', body: 'Know exactly what to do each week — from planting to harvest.' },
    sw: { title: 'Msimu wako, umepangwa', body: 'Jua la kufanya kila wiki — kupanda hadi kuvuna.' },
  },
  {
    image: require('../../assets/images/onboarding/crop-scan.png'),
    kicker: '02 · SPOT',
    en: { title: 'Spot problems early', body: 'Snap a photo to identify pests and diseases — and what to do about them.' },
    sw: { title: 'Gundua matatizo mapema', body: 'Piga picha kutambua wadudu na magonjwa — na la kufanya.' },
  },
  {
    image: require('../../assets/images/onboarding/ai-guidance.png'),
    kicker: '03 · ACT',
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
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <Image
            source={require('../../assets/images/android-icon-foreground.png')}
            style={styles.brandMark}
            contentFit="contain"
          />
          <Text style={styles.brand}>ECOFY</Text>
        </View>
        <Pressable onPress={() => void finish('/(auth)/register')} hitSlop={8}>
          <Text style={styles.skip}>{sw ? 'Ruka' : 'Skip'}</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.flex}
      >
        {SLIDES.map((slide, slideIndex) => {
          const copy = sw ? slide.sw : slide.en;
          return (
            <View key={slide.kicker} style={[styles.slide, { width }]}>
              <View style={styles.imagePanel}>
                <Image
                  source={slide.image}
                  style={styles.slideImage}
                  contentFit="cover"
                  transition={180}
                />
                <View style={styles.imageScrim} />
                <View style={styles.kickerPill}>
                  <Text style={styles.kicker}>{slide.kicker}</Text>
                </View>
              </View>
              <Animated.View
                entering={FadeInDown.duration(260).delay(slideIndex * 40)}
                style={styles.copyBlock}
              >
                <Text style={styles.title}>{copy.title}</Text>
                <Text style={styles.body}>{copy.body}</Text>
              </Animated.View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.progressRow}>
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
          <Text style={styles.count}>{index + 1} / {SLIDES.length}</Text>
        </View>
        <Button
          label={last ? (sw ? 'Anza' : 'Get started') : sw ? 'Endelea' : 'Next'}
          onPress={onNext}
          style={styles.nextButton}
        />
        <Pressable onPress={() => void finish('/(auth)/login')} hitSlop={8} style={styles.signInRow}>
          <Text style={styles.signInText}>
            {sw ? 'Una akaunti tayari? Ingia' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  topBar: {
    minHeight: 50,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandMark: { width: 27, height: 27 },
  brand: {
    fontSize: 12,
    fontWeight: '900',
    color: theme.colors.primaryDark,
    letterSpacing: 2,
  },
  skip: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted },
  slide: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
    gap: 18,
  },
  imagePanel: {
    flex: 1,
    minHeight: 280,
    maxHeight: 470,
    borderRadius: 26,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceMuted,
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  imageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 35, 20, 0.07)',
  },
  kickerPill: {
    position: 'absolute',
    left: 14,
    top: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.90)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  kicker: {
    color: theme.colors.primaryDark,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  copyBlock: {
    gap: 7,
    paddingHorizontal: 2,
  },
  title: { fontSize: 25, lineHeight: 30, fontWeight: '900', color: theme.colors.text, letterSpacing: -0.4 },
  body: { maxWidth: 360, fontSize: 14, color: theme.colors.textMuted, lineHeight: 20 },
  footer: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4, gap: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.border },
  dotActive: { backgroundColor: theme.colors.primary, width: 20 },
  count: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  nextButton: { minHeight: 46, borderRadius: 15, borderCurve: 'continuous' },
  signInRow: { alignItems: 'center', paddingVertical: 4 },
  signInText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
});
