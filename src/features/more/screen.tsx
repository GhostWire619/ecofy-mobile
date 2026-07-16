import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

type MoreLink = {
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
  descKey: string;
  route: string;
};

const LINKS: MoreLink[] = [
  { icon: 'leaf-outline', labelKey: 'more.farms', descKey: 'more.farmsDesc', route: '/(tabs)/farms' },
  { icon: 'cash-outline', labelKey: 'tabs.finance', descKey: 'more.financeDesc', route: '/(tabs)/finance' },
  { icon: 'stats-chart-outline', labelKey: 'tabs.prices', descKey: 'more.pricesDesc', route: '/(tabs)/market' },
  { icon: 'compass-outline', labelKey: 'tabs.explore', descKey: 'more.exploreDesc', route: '/(tabs)/explore' },
  { icon: 'scan-outline', labelKey: 'today.scanCrop', descKey: 'more.scanDesc', route: '/scan' },
  { icon: 'chatbubbles-outline', labelKey: 'more.expertReviews', descKey: 'more.expertReviewsDesc', route: '/consults' },
  { icon: 'settings-outline', labelKey: 'more.settings', descKey: 'more.settingsDesc', route: '/settings' },
];

export function MoreScreen() {
  const { t } = useI18n();
  return (
    <Screen contentContainerStyle={s.content}>
      <Text style={s.heading}>{t('tabs.more')}</Text>
      <View style={s.list}>
        {LINKS.map((link) => (
          <TouchableOpacity
            key={link.labelKey}
            style={s.row}
            activeOpacity={0.75}
            onPress={() => router.push(link.route as never)}
          >
            <View style={s.iconWrap}>
              <Ionicons name={link.icon} size={20} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>{t(link.labelKey)}</Text>
              <Text style={s.rowDesc}>{t(link.descKey)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { gap: 14, paddingTop: 8, paddingBottom: 24 },
  heading: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  list: { gap: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.colors.border, padding: 14,
  },
  iconWrap: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  rowDesc: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});
