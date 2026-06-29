import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/core/button';
import { Screen } from '@/components/layout/screen';
import { useI18n } from '@/lib/i18n';
import type { Locale } from '@/lib/domain/types';
import { theme } from '@/lib/theme';

const LANGUAGES: { code: Locale; native: string }[] = [
  { code: 'sw', native: 'Kiswahili' },
  { code: 'en', native: 'English' },
];

const VALUE_PROPS: { icon: React.ComponentProps<typeof Ionicons>['name']; en: string; sw: string }[] = [
  { icon: 'calendar-outline', en: 'Know what to do each week, planting to harvest', sw: 'Jua la kufanya kila wiki, kupanda hadi kuvuna' },
  { icon: 'trending-up-outline', en: 'See your expected yield and profit', sw: 'Ona mavuno na faida inayotarajiwa' },
  { icon: 'scan-outline', en: 'Snap a photo to identify pests and diseases', sw: 'Piga picha kutambua wadudu na magonjwa' },
  { icon: 'sparkles-outline', en: 'Ask Ecofy AI anytime, in your language', sw: 'Uliza Ecofy AI wakati wowote, kwa lugha yako' },
];

export default function WelcomeScreen() {
  const { locale, setLocale } = useI18n();
  const [selected, setSelected] = useState<Locale>(locale);
  const sw = selected === 'sw';

  const onContinue = async () => {
    await setLocale(selected).catch(() => undefined);
    router.push('/(onboarding)/farm-setup');
  };

  return (
    <Screen edges={['top', 'bottom']} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Image
          source={require('../../../assets/images/onboarding/welcome-farm.png')}
          style={styles.heroImage}
          contentFit="cover"
          transition={180}
        />
        <View style={styles.heroShade} />
        <View style={styles.logoBadge}>
          <Image
            source={require('../../../assets/images/android-icon-foreground.png')}
            style={styles.logo}
            contentFit="contain"
          />
          <Text style={styles.brand}>ECOFY</Text>
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{sw ? 'Karibu Ecofy' : 'Welcome to Ecofy'}</Text>
          <Text style={styles.subtitle}>
            {sw
              ? 'Mwongozo wako wa kilimo — hatua kwa hatua, msimu mzima.'
              : 'Your farming guide — step by step, all season long.'}
          </Text>
        </View>
      </View>

      <Animated.View entering={FadeInDown.duration(280)} style={styles.langBlock}>
        <Text style={styles.langLabel}>Chagua lugha · Choose your language</Text>
        <View style={styles.langRow}>
          {LANGUAGES.map((lang) => {
            const active = selected === lang.code;
            return (
              <Pressable
                key={lang.code}
                style={[styles.langChip, active && styles.langChipActive]}
                onPress={() => setSelected(lang.code)}
              >
                <Text style={[styles.langNative, active && styles.langTextActive]}>{lang.native}</Text>
                {active && <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      <View style={styles.props}>
        {VALUE_PROPS.map((p) => (
          <View key={p.icon} style={styles.propRow}>
            <View style={styles.propIcon}>
              <Ionicons name={p.icon} size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.propText}>{sw ? p.sw : p.en}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.trustLine}>
          {sw ? 'Bure kuanza · Inafanya kazi bila mtandao' : 'Free to start · Works offline'}
        </Text>
        <Button
          label={sw ? 'Anza' : 'Get started'}
          onPress={onContinue}
          style={styles.continueButton}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, flexGrow: 1, paddingTop: 10 },
  hero: {
    height: 250,
    borderRadius: 26,
    overflow: 'hidden',
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primaryDark,
  },
  heroImage: { width: '100%', height: '100%' },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 29, 16, 0.27)',
  },
  logoBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.91)',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  logo: { width: 22, height: 22 },
  brand: {
    color: theme.colors.primaryDark,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  heroCopy: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    gap: 4,
  },
  title: { fontSize: 25, lineHeight: 29, fontWeight: '900', color: '#ffffff' },
  subtitle: { maxWidth: 320, fontSize: 13, color: 'rgba(255,255,255,0.88)', lineHeight: 18 },

  langBlock: { gap: 8 },
  langLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
  langRow: { flexDirection: 'row', gap: 8 },
  langChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: 14,
    borderCurve: 'continuous', borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 13, paddingVertical: 11,
  },
  langChipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceMuted },
  langNative: { fontSize: 14, fontWeight: '800', color: theme.colors.textMuted },
  langTextActive: { color: theme.colors.primary },

  props: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  propRow: {
    width: '48.5%',
    minHeight: 76,
    gap: 8,
    padding: 10,
    borderRadius: 15,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  propIcon: {
    width: 29, height: 29, borderRadius: 10,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  propText: { fontSize: 11, color: theme.colors.text, lineHeight: 15, fontWeight: '600' },

  footer: { gap: 8, paddingTop: 2 },
  trustLine: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'center' },
  continueButton: { minHeight: 46, borderRadius: 15, borderCurve: 'continuous' },
});
