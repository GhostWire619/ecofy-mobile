import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { recommendationRepository } from '@/lib/db/repositories';
import type { RecommendationRecord } from '@/lib/domain/types';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

const PRIORITY: Record<
  string,
  { color: string; icon: keyof typeof Ionicons.glyphMap; bg: string }
> = {
  critical: { color: theme.colors.danger, icon: 'alert-circle', bg: '#fde4de' },
  high: { color: '#f97316', icon: 'warning', bg: '#ffedd5' },
  medium: { color: theme.colors.info, icon: 'bulb', bg: '#e3eefc' },
  low: { color: theme.colors.textMuted, icon: 'information-circle', bg: theme.colors.surfaceMuted },
};

/**
 * Smart nudges = AIRecommendation rows produced by the backend tick engine
 * (drift detection) + weather/agronomy advisories. Stored offline; rendered as
 * dismissible cards. Pass a journeyId to scope to one journey, or omit for all.
 */
export function SmartNudges({
  journeyId,
  limit = 5,
  title,
}: {
  journeyId?: string;
  limit?: number;
  title?: string;
}) {
  const { t } = useI18n();
  const heading = title ?? t('today.smartNudges');
  const queryClient = useQueryClient();
  const queryKey = ['smart-nudges', journeyId ?? 'all'];

  const { data: nudges = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const rows = journeyId
        ? await recommendationRepository.listForJourney(journeyId)
        : await recommendationRepository.listPending(limit);
      return rows.slice(0, limit);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => recommendationRepository.dismiss(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  if (nudges.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>{heading}</Text>
      {nudges.map((n: RecommendationRecord) => {
        const p = PRIORITY[n.priority] ?? PRIORITY.medium;
        return (
          <View key={n.id} style={[styles.card, { borderLeftColor: p.color }]}>
            <View style={[styles.iconWrap, { backgroundColor: p.bg }]}>
              <Ionicons name={p.icon} size={18} color={p.color} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title}>{n.title}</Text>
              <Text style={styles.message}>{n.message}</Text>
            </View>
            <TouchableOpacity
              hitSlop={8}
              onPress={() => dismissMutation.mutate(n.id)}
              disabled={dismissMutation.isPending}
            >
              <Ionicons name="close" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.sm },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    padding: theme.spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  message: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
});
