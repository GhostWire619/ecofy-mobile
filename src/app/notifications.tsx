import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useEngagement } from '@/lib/hooks/use-engagement';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

type FeedItem = {
  id: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  title: string;
  body: string;
  when: string | null;
};

function timeAgo(value: string | null, t: TFunc): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const day = 86_400_000;
  if (diff < 3_600_000) return t('notifications.minAgo', { n: Math.max(1, Math.round(diff / 60_000)) });
  if (diff < day) return t('notifications.hoursAgo', { n: Math.round(diff / 3_600_000) });
  if (diff < 7 * day) return t('notifications.daysAgoShort', { n: Math.round(diff / day) });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const REWARD_COPY: Record<string, { title: string; body: string }> = {
  xp_threshold: { title: 'notifications.rewardUnlocked', body: 'notifications.rewardUnlockedBody' },
  streak_consistency: { title: 'notifications.consistencyReward', body: 'notifications.consistencyRewardBody' },
};

export default function NotificationsScreen() {
  const { t } = useI18n();
  const { data: engagement } = useEngagement();

  const items: FeedItem[] = [];

  for (const ev of engagement?.reward_eligibility ?? []) {
    const copy = REWARD_COPY[ev.event_type] ?? {
      title: 'notifications.rewardAvailable',
      body: 'notifications.rewardAvailableBody',
    };
    items.push({
      id: `reward-${ev.event_type}-${ev.created_at}`,
      icon: 'gift-outline',
      tint: theme.colors.accent,
      title: t(copy.title),
      body: t(copy.body),
      when: ev.created_at,
    });
  }

  for (const a of engagement?.achievements ?? []) {
    items.push({
      id: `ach-${a.achievement_key ?? a.name}`,
      icon: 'trophy-outline',
      tint: theme.colors.primary,
      title: t('notifications.badgeEarned', { name: a.name ?? t('notifications.achievement') }),
      body: a.description ?? t('notifications.keepItUp'),
      when: a.awarded_at,
    });
  }

  items.sort((x, y) => (y.when ?? '').localeCompare(x.when ?? ''));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('tabs.notifications')}</Text>
        <View style={styles.backBtn} />
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="notifications-outline" size={32} color={theme.colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('notifications.allCaughtUp')}</Text>
          <Text style={styles.emptyBody}>{t('notifications.emptyBody')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={[styles.cardIcon, { backgroundColor: item.tint + '1e' }]}>
                <Ionicons name={item.icon} size={20} color={item.tint} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
              </View>
              {item.when ? <Text style={styles.cardWhen}>{timeAgo(item.when, t)}</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: theme.colors.text },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: theme.spacing.xl },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  emptyBody: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 21 },

  list: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  cardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  cardBody: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  cardWhen: { fontSize: 11, color: theme.colors.textMuted, alignSelf: 'flex-start' },
});
