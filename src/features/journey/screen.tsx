import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { AchievementModal, LevelBar, SmartNudges, StreakFlame } from '@/components/game';
import { isStreakAtRisk } from '@/components/game/helpers';
import { Card } from '@/components/core/card';
import { Pill } from '@/components/core/pill';
import { UndoToast } from '@/components/core/undo-toast';
import { Screen, Section } from '@/components/layout/screen';
import { TaskActionsSheet } from '@/components/tasks/task-actions-sheet';
import { TaskCompletionSheet } from '@/components/tasks/task-completion-sheet';
import { EmptyState } from '@/components/state/empty-state';
import { SkeletonCard } from '@/components/state/skeleton';
import { decodeInstructions, journeyRepository } from '@/lib/db/repositories';
import type { AchievementBadge } from '@/lib/domain/types';
import { useTaskActions } from '@/lib/hooks/use-task-actions';
import { useTaskCompletion } from '@/lib/hooks/use-task-completion';
import { useEngagement } from '@/lib/hooks/use-engagement';
import { theme } from '@/lib/theme';

const STAGE_DOT: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  completed: { icon: 'checkmark-circle', color: theme.colors.success },
  active: { icon: 'ellipse', color: theme.colors.accent },
  upcoming: { icon: 'ellipse-outline', color: theme.colors.disabled },
};

export function JourneyScreen() {
  const { data: engagement } = useEngagement();
  const [celebrating, setCelebrating] = useState<AchievementBadge | null>(null);

  const { data, refetch, isRefetching, isLoading } = useQuery({
    queryKey: ['journey-screen'],
    queryFn: async () => {
      const journey = await journeyRepository.getActiveJourney();
      if (!journey) return null;
      const [stages, milestones, tasks] = await Promise.all([
        journeyRepository.listStages(journey.id),
        journeyRepository.listMilestones(journey.id),
        journeyRepository.listTasks(journey.id),
      ]);
      return { journey, stages, milestones, tasks };
    },
  });

  const completion = useTaskCompletion({
    farmId: data?.journey?.farm_id ?? null,
    journeyId: data?.journey?.id ?? null,
    plotId: data?.journey?.plot_id ?? null,
    onAchievement: setCelebrating,
  });
  const actions = useTaskActions();
  const queryClient = useQueryClient();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { data: journeys = [] } = useQuery({
    queryKey: ['journeys-list'],
    queryFn: () => journeyRepository.listJourneys(),
  });

  async function selectJourney(journeyId: string) {
    setSwitcherOpen(false);
    await journeyRepository.setSelectedJourney(journeyId);
    await Promise.all(
      [
        ['journey-screen'],
        ['today-screen'],
        ['home-dashboard'],
        ['scan-active-journey'],
        ['assistant-context'],
      ].map((key) => queryClient.invalidateQueries({ queryKey: key })),
    );
  }

  if (isLoading) {
    return (
      <Screen>
        <SkeletonCard />
        <SkeletonCard />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <EmptyState
          title="No active journey"
          description="Start a crop journey during onboarding to unlock stages, tasks, and milestone tracking."
        />
      </Screen>
    );
  }

  const { journey, stages, tasks } = data;
  const pendingTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'skipped');
  const doneTasks = tasks.filter((t) => t.status === 'completed');
  const atRisk = isStreakAtRisk(engagement);

  return (
    <View style={styles.root}>
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      {/* ── Hero: crop + level + streak + predicted yield ── */}
      <Card>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, gap: 4 }}>
            <TouchableOpacity
              style={styles.titleRow}
              activeOpacity={journeys.length > 1 ? 0.7 : 1}
              disabled={journeys.length <= 1}
              onPress={() => setSwitcherOpen(true)}
            >
              <Text style={styles.title}>{journey.common_name}</Text>
              {journeys.length > 1 ? (
                <Ionicons name="chevron-down" size={20} color={theme.colors.textMuted} />
              ) : null}
            </TouchableOpacity>
            <Text style={styles.copy}>
              {journey.variety ?? 'Local variety'} • planted {journey.planting_date}
            </Text>
          </View>
          <Pill label={`${Math.round(journey.progress_percentage)}%`} tone="info" />
        </View>

        {engagement && (
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
        )}

        {journey.predicted_yield != null && (
          <View style={styles.yieldRow}>
            <Ionicons name="trending-up" size={16} color={theme.colors.success} />
            <Text style={styles.yieldText}>
              On track for ~{journey.predicted_yield.toFixed(1)} tons/ha
            </Text>
            <Text style={styles.copySmall}>· harvest {journey.expected_harvest_date}</Text>
          </View>
        )}
      </Card>

      {/* ── Smart nudges (tick-engine drift + advisories) ── */}
      <Section>
        <SmartNudges journeyId={journey.id} />
      </Section>

      {/* ── Stage timeline (the climb) ── */}
      <Section>
        <Text style={styles.sectionTitle}>Your crop's journey</Text>
        {stages.map((stage, idx) => {
          const dot = STAGE_DOT[stage.status] ?? STAGE_DOT.upcoming;
          const isLast = idx === stages.length - 1;
          return (
            <View key={stage.id} style={styles.timelineRow}>
              <View style={styles.timelineGutter}>
                <Ionicons name={dot.icon} size={22} color={stage.color ?? dot.color} />
                {!isLast && <View style={styles.timelineLine} />}
              </View>
              <View style={[styles.stageCard, stage.status === 'active' && styles.stageCardActive]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{stage.name.replace(/_/g, ' ')}</Text>
                  <Pill
                    label={stage.status.toUpperCase()}
                    tone={
                      stage.status === 'completed'
                        ? 'success'
                        : stage.status === 'active'
                          ? 'warning'
                          : 'neutral'
                    }
                  />
                </View>
                {stage.description ? <Text style={styles.copy}>{stage.description}</Text> : null}
                <Text style={styles.copySmall}>Day {stage.start_day}–{stage.end_day}</Text>
              </View>
            </View>
          );
        })}
      </Section>

      {/* ── Today's tasks ── */}
      <Section>
        <Text style={styles.sectionTitle}>
          What to do {pendingTasks.length > 0 ? `(${pendingTasks.length})` : ''}
        </Text>
        {pendingTasks.length === 0 && (
          <Card>
            <Text style={styles.copy}>All caught up. Great work! 🌱</Text>
          </Card>
        )}
        {pendingTasks.map((task) => (
          <Swipeable
            key={task.id}
            overshootRight={false}
            overshootLeft={false}
            renderRightActions={() => (
              <TouchableOpacity
                style={styles.swipeDone}
                onPress={() => completion.begin(task)}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.swipeDoneText}>Done</Text>
              </TouchableOpacity>
            )}
            renderLeftActions={() => (
              <TouchableOpacity
                style={styles.swipeOptions}
                onPress={() => actions.open(task)}
                activeOpacity={0.85}
              >
                <Ionicons name="ellipsis-horizontal-circle-outline" size={24} color="#fff" />
                <Text style={styles.swipeDoneText}>Options</Text>
              </TouchableOpacity>
            )}
          >
          <Card>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.cardTitle}>{task.title}</Text>
                {task.description ? <Text style={styles.copy}>{task.description}</Text> : null}
              </View>
              <View style={styles.taskMeta}>
                <View style={styles.xpTag}>
                  <Ionicons name="star" size={12} color={theme.colors.accent} />
                  <Text style={styles.xpTagText}>{task.xp_value}</Text>
                </View>
                <TouchableOpacity onPress={() => actions.open(task)} hitSlop={8} style={styles.moreBtn}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            {decodeInstructions(task).map((instruction) => (
              <Text key={instruction} style={styles.copySmall}>• {instruction}</Text>
            ))}
            <TouchableOpacity
              style={[styles.completeBtn, completion.isCompleting && styles.completeBtnDisabled]}
              disabled={completion.isCompleting}
              onPress={() => completion.begin(task)}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.completeBtnText}>Mark done · +{task.xp_value} XP</Text>
            </TouchableOpacity>
          </Card>
          </Swipeable>
        ))}
      </Section>

      {/* ── Completed (collapsed-ish) ── */}
      {doneTasks.length > 0 && (
        <Section>
          <Text style={styles.sectionTitle}>Completed ({doneTasks.length})</Text>
          {doneTasks.map((task) => (
            <View key={task.id} style={styles.doneRow}>
              <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
              <Text style={styles.doneText} numberOfLines={1}>{task.title}</Text>
            </View>
          ))}
        </Section>
      )}

      <AchievementModal badge={celebrating} onClose={() => setCelebrating(null)} />
    </Screen>
      <TaskCompletionSheet {...completion.sheet} />
      <TaskActionsSheet {...actions.sheet} />
      <UndoToast {...completion.toast} />

      <Modal
        visible={switcherOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSwitcherOpen(false)}
      >
        <Pressable style={styles.switcherBackdrop} onPress={() => setSwitcherOpen(false)} />
        <View style={styles.switcherSheet}>
          <View style={styles.grabber} />
          <Text style={styles.switcherTitle}>Switch journey</Text>
          {journeys.map((j) => {
            const isCurrent = j.id === journey.id;
            return (
              <TouchableOpacity
                key={j.id}
                style={styles.switcherRow}
                activeOpacity={0.8}
                onPress={() => void selectJourney(j.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.switcherName}>{j.common_name}</Text>
                  <Text style={styles.switcherSub}>
                    {j.variety ?? 'Local variety'} · planted {j.planting_date}
                  </Text>
                </View>
                {isCurrent ? (
                  <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rowBetween: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  yieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  yieldText: { fontSize: 14, fontWeight: '700', color: theme.colors.success },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  switcherBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.overlay },
  switcherSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  switcherTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  switcherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  switcherName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  switcherSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  cardTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, textTransform: 'capitalize' },
  copy: { color: theme.colors.textMuted, lineHeight: 20 },
  copySmall: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },

  // timeline
  timelineRow: { flexDirection: 'row', gap: 12 },
  timelineGutter: { alignItems: 'center', width: 24 },
  timelineLine: { flex: 1, width: 2, backgroundColor: theme.colors.border, marginTop: 2 },
  stageCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 4,
    marginBottom: theme.spacing.sm,
  },
  stageCardActive: { borderColor: theme.colors.accent, borderWidth: 2 },

  // tasks
  xpTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.accent + '22',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  xpTagText: { fontSize: 12, fontWeight: '800', color: theme.colors.warning },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingVertical: 12,
    marginTop: 4,
  },
  completeBtnDisabled: { backgroundColor: theme.colors.disabled },
  completeBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  swipeDone: {
    width: 92,
    backgroundColor: theme.colors.success,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginLeft: theme.spacing.sm,
  },
  swipeOptions: {
    width: 92,
    backgroundColor: theme.colors.info,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginRight: theme.spacing.sm,
  },
  swipeDoneText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  taskMeta: { alignItems: 'flex-end', gap: 6 },
  moreBtn: { padding: 2 },

  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  doneText: { flex: 1, color: theme.colors.textMuted, fontSize: 14 },
});
