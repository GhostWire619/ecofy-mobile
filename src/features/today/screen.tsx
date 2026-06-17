import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AchievementModal, LevelBar, SmartNudges, StreakFlame } from '@/components/game';
import { isStreakAtRisk } from '@/components/game/helpers';
import { Card } from '@/components/core/card';
import { UndoToast } from '@/components/core/undo-toast';
import { Screen, Section } from '@/components/layout/screen';
import { SkeletonCard } from '@/components/state/skeleton';
import { TaskActionsSheet } from '@/components/tasks/task-actions-sheet';
import { TaskCompletionSheet } from '@/components/tasks/task-completion-sheet';
import { useAuth } from '@/lib/auth/provider';
import { decodeInstructions, journeyRepository } from '@/lib/db/repositories';
import type { AchievementBadge, TaskRecord } from '@/lib/domain/types';
import { useTaskActions } from '@/lib/hooks/use-task-actions';
import { useTaskCompletion } from '@/lib/hooks/use-task-completion';
import { useEngagement } from '@/lib/hooks/use-engagement';
import { theme } from '@/lib/theme';

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Pick the single most important pending task: priority, then earliest due, then sequence. */
function topTask(tasks: TaskRecord[]): TaskRecord | null {
  const pending = tasks.filter((t) => t.status === 'pending');
  if (pending.length === 0) return null;
  return [...pending].sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    const ad = a.due_date ?? '9999';
    const bd = b.due_date ?? '9999';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.sequence_order - b.sequence_order;
  })[0];
}

const QUICK_ACTIONS: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
}[] = [
  { icon: 'scan-outline', label: 'Scan crop', route: '/scan' },
  { icon: 'document-text-outline', label: 'Add note', route: '/(tabs)/logbook' },
  { icon: 'trophy-outline', label: 'My journey', route: '/(tabs)/journey' },
  { icon: 'sparkles-outline', label: 'Ask AI', route: '/assistant' },
];

export function TodayScreen() {
  const { user } = useAuth();
  const { data: engagement } = useEngagement();
  const [celebrating, setCelebrating] = useState<AchievementBadge | null>(null);

  const { data, refetch, isRefetching, isLoading } = useQuery({
    queryKey: ['today-screen'],
    queryFn: async () => {
      const journey = await journeyRepository.getActiveJourney();
      if (!journey) return { journey: null as null, tasks: [] as TaskRecord[] };
      const tasks = await journeyRepository.listTasks(journey.id);
      return { journey, tasks };
    },
  });

  const completion = useTaskCompletion({
    farmId: data?.journey?.farm_id ?? null,
    journeyId: data?.journey?.id ?? null,
    plotId: data?.journey?.plot_id ?? null,
    onAchievement: setCelebrating,
  });
  const actions = useTaskActions();

  const firstName = (user?.full_name ?? 'Farmer').split(' ')[0];
  const journey = data?.journey ?? null;
  const hero = data ? topTask(data.tasks) : null;
  const atRisk = isStreakAtRisk(engagement);
  const remaining = data?.tasks.filter((t) => t.status === 'pending').length ?? 0;

  return (
    <View style={styles.root}>
    <Screen contentContainerStyle={styles.content} onRefresh={refetch} refreshing={isRefetching}>
      {/* ── Greeting + engagement ── */}
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting()},</Text>
        <Text style={styles.name}>{firstName} 👋</Text>
      </View>

      {engagement && (
        <Card>
          <View style={styles.gameRow}>
            <View style={{ flex: 1 }}>
              <LevelBar
                level={engagement.level}
                xpIntoLevel={engagement.xp_into_level}
                xpForNextLevel={engagement.xp_for_next_level}
                progress={engagement.progress_to_next}
              />
            </View>
            <StreakFlame count={engagement.daily_streak} atRisk={atRisk} />
          </View>
        </Card>
      )}

      {/* ── Hero: do this today ── */}
      <Section>
        <Text style={styles.sectionTitle}>Do this today</Text>
        {isLoading ? (
          <SkeletonCard />
        ) : hero ? (
          <Card>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Ionicons name="leaf" size={22} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.heroTitle}>{hero.title}</Text>
                {journey ? (
                  <Text style={styles.heroSub}>
                    {journey.common_name}
                    {journey.current_stage ? ` · ${journey.current_stage.replace(/_/g, ' ')}` : ''}
                  </Text>
                ) : null}
              </View>
              <View style={styles.xpTag}>
                <Ionicons name="star" size={12} color={theme.colors.accent} />
                <Text style={styles.xpTagText}>{hero.xp_value}</Text>
              </View>
            </View>
            {decodeInstructions(hero).slice(0, 3).map((line) => (
              <Text key={line} style={styles.heroInstruction}>• {line}</Text>
            ))}
            <TouchableOpacity
              style={[styles.cta, completion.isCompleting && styles.ctaDisabled]}
              disabled={completion.isCompleting}
              onPress={() => completion.begin(hero)}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.ctaText}>Mark done · +{hero.xp_value} XP</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => actions.open(hero)} hitSlop={6}>
              <Text style={styles.snoozeLink}>Can&apos;t do it today? Snooze or skip</Text>
            </TouchableOpacity>
            {remaining > 1 ? (
              <TouchableOpacity onPress={() => router.push('/(tabs)/journey')}>
                <Text style={styles.moreLink}>{remaining - 1} more task{remaining - 1 > 1 ? 's' : ''} in your journey →</Text>
              </TouchableOpacity>
            ) : null}
          </Card>
        ) : journey ? (
          <Card>
            <Text style={styles.allDone}>🌱 All caught up for now. Great work!</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/journey')}>
              <Text style={styles.moreLink}>View your crop journey →</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <Card>
            <Text style={styles.heroTitle}>Start your first crop journey</Text>
            <Text style={styles.heroSub}>
              Pick a crop and we'll guide you week by week from planting to harvest.
            </Text>
            <TouchableOpacity
              style={styles.cta}
              onPress={() => router.push('/(onboarding)/welcome')}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.ctaText}>Get started</Text>
            </TouchableOpacity>
          </Card>
        )}
      </Section>

      {/* ── Smart nudges (tick-engine + advisories, all journeys) ── */}
      <Section>
        <SmartNudges />
      </Section>

      {/* ── Quick actions ── */}
      <Section>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity
              key={a.label}
              style={styles.quickItem}
              activeOpacity={0.75}
              onPress={() => router.push(a.route as never)}
            >
              <View style={styles.quickIcon}>
                <Ionicons name={a.icon} size={22} color={theme.colors.primary} />
              </View>
              <Text style={styles.quickLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      <AchievementModal badge={celebrating} onClose={() => setCelebrating(null)} />
    </Screen>
      <TaskCompletionSheet {...completion.sheet} />
      <TaskActionsSheet {...actions.sheet} />
      <UndoToast {...completion.toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: theme.spacing.lg },
  header: { gap: 2 },
  greeting: { fontSize: 15, color: theme.colors.textMuted },
  name: { fontSize: 26, fontWeight: '800', color: theme.colors.text },

  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },

  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  heroSub: { fontSize: 13, color: theme.colors.textMuted, textTransform: 'capitalize' },
  heroInstruction: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  allDone: { fontSize: 15, color: theme.colors.text, fontWeight: '600' },

  xpTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: theme.colors.accent + '22',
    borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 3,
  },
  xpTagText: { fontSize: 12, fontWeight: '800', color: theme.colors.warning },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill,
    paddingVertical: 13, marginTop: 6,
  },
  ctaDisabled: { backgroundColor: theme.colors.disabled },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  moreLink: { color: theme.colors.primary, fontWeight: '700', fontSize: 13, marginTop: 8, textAlign: 'center' },
  snoozeLink: { color: theme.colors.textMuted, fontWeight: '600', fontSize: 13, marginTop: 8, textAlign: 'center' },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  quickItem: {
    flexBasis: '47%', flexGrow: 1,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing.md, gap: 8, alignItems: 'flex-start',
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  quickLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
});
