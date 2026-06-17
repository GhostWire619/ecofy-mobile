import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
        <View style={styles.logoBadge}>
          <Ionicons name="leaf" size={30} color="#fff" />
        </View>
        <Text style={styles.title}>{sw ? 'Karibu Ecofy' : 'Welcome to Ecofy'}</Text>
        <Text style={styles.subtitle}>
          {sw
            ? 'Mwongozo wako wa kilimo — hatua kwa hatua, msimu mzima.'
            : 'Your farming guide — step by step, all season long.'}
        </Text>
      </View>

      <View style={styles.langBlock}>
        <Text style={styles.langLabel}>Chagua lugha · Choose your language</Text>
        <View style={styles.langRow}>
          {LANGUAGES.map((lang) => {
            const active = selected === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[styles.langChip, active && styles.langChipActive]}
                onPress={() => setSelected(lang.code)}
                activeOpacity={0.85}
              >
                <Text style={[styles.langNative, active && styles.langTextActive]}>{lang.native}</Text>
                {active && <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

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

      <View style={{ flex: 1 }} />
      <Text style={styles.trustLine}>
        {sw ? 'Bure kuanza · Inafanya kazi bila mtandao' : 'Free to start · Works offline'}
      </Text>
      <Button label={sw ? 'Anza' : 'Get started'} onPress={onContinue} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.xl, flexGrow: 1 },
  hero: { alignItems: 'center', gap: 10, marginTop: theme.spacing.xl },
  logoBadge: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { fontSize: 28, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  subtitle: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 12 },

  langBlock: { gap: 10 },
  langLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  langRow: { flexDirection: 'row', gap: theme.spacing.md },
  langChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1.5, borderColor: theme.colors.border,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  langChipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceMuted },
  langNative: { fontSize: 16, fontWeight: '700', color: theme.colors.textMuted },
  langTextActive: { color: theme.colors.primary },

  props: { gap: theme.spacing.md },
  propRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  propIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  propText: { flex: 1, fontSize: 14, color: theme.colors.text, lineHeight: 20 },

  trustLine: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', marginBottom: theme.spacing.sm },
});
