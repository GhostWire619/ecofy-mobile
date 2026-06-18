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

type JourneyTab = 'milestones' | 'tasks';

export function JourneyScreen() {
  const { data: engagement } = useEngagement();
  const [celebrating, setCelebrating] = useState<AchievementBadge | null>(null);
  const [activeTab, setActiveTab] = useState<JourneyTab>('tasks');

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

  const { journey, milestones, tasks } = data;
  const pendingTasks = tasks.filter((t) => t.status !== 'completed' && t.status !== 'skipped');
  const doneTasks = tasks.filter((t) => t.status === 'completed');
  const orderedMilestones = [...milestones].sort((a, b) => a.week_number - b.week_number);
  const atRisk = isStreakAtRisk(engagement);

  // Only surface what's relevant now under "What to do". Future-dated tasks
  // (e.g. "protect flowering" months out) move to "Coming up" so the app isn't
  // telling the farmer to act on a stage their crop hasn't reached yet.
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 14);
  const horizonIso = horizon.toISOString().slice(0, 10);
  const activeTasks = pendingTasks.filter((t) => !t.due_date || t.due_date <= horizonIso);
  const upcomingTasks = pendingTasks
    .filter((t) => t.due_date && t.due_date > horizonIso)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));

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

      <View style={styles.journeyTabs}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setActiveTab('tasks')}
          style={[styles.journeyTab, activeTab === 'tasks' && styles.journeyTabActive]}
          testID="journey-tab-tasks"
        >
          <Ionicons
            name="checkbox-outline"
            size={16}
            color={activeTab === 'tasks' ? '#fff' : theme.colors.textMuted}
          />
          <Text style={[styles.journeyTabText, activeTab === 'tasks' && styles.journeyTabTextActive]}>
            Tasks
          </Text>
          <View style={[styles.journeyTabCount, activeTab === 'tasks' && styles.journeyTabCountActive]}>
            <Text style={[styles.journeyTabCountText, activeTab === 'tasks' && styles.journeyTabCountTextActive]}>
              {pendingTasks.length}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => setActiveTab('milestones')}
          style={[styles.journeyTab, activeTab === 'milestones' && styles.journeyTabActive]}
          testID="journey-tab-milestones"
        >
          <Ionicons
            name="flag-outline"
            size={16}
            color={activeTab === 'milestones' ? '#fff' : theme.colors.textMuted}
          />
          <Text style={[styles.journeyTabText, activeTab === 'milestones' && styles.journeyTabTextActive]}>
            Milestones
          </Text>
          <View style={[styles.journeyTabCount, activeTab === 'milestones' && styles.journeyTabCountActive]}>
            <Text style={[styles.journeyTabCountText, activeTab === 'milestones' && styles.journeyTabCountTextActive]}>
              {orderedMilestones.length}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {activeTab === 'milestones' ? (
        <Section>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionHeadingIcon}>
            <Ionicons name="flag-outline" size={18} color={theme.colors.primary} />
          </View>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionTitle}>Milestones</Text>
            <Text style={styles.sectionSubtitle}>Important steps in this crop journey</Text>
          </View>
        </View>

        {orderedMilestones.length === 0 ? (
          <Card>
            <Text style={styles.copy}>Milestones will appear when the crop plan is ready.</Text>
          </Card>
        ) : (
          orderedMilestones.map((milestone) => {
            const completed = milestone.status === 'completed';
            const active = milestone.status === 'in_progress';
            return (
              <View
                key={milestone.id}
                style={[
                  styles.milestoneRow,
                  active ? styles.milestoneRowActive : null,
                ]}
              >
                <View
                  style={[
                    styles.milestoneWeek,
                    completed ? styles.milestoneWeekComplete : null,
                    active ? styles.milestoneWeekActive : null,
                  ]}
                >
                  {completed ? (
                    <Ionicons name="checkmark" size={16} color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.milestoneWeekLabel}>WEEK</Text>
                      <Text style={styles.milestoneWeekNumber}>{milestone.week_number}</Text>
                    </>
                  )}
                </View>
                <View style={styles.milestoneCopy}>
                  <Text style={styles.milestoneTitle}>{milestone.title}</Text>
                  {milestone.description ? (
                    <Text style={styles.copy} numberOfLines={2}>{milestone.description}</Text>
                  ) : null}
                  <Text style={styles.copySmall}>
                    {milestone.start_date
                      ? new Date(milestone.start_date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'Date not set'}
                    {milestone.end_date
                      ? ` – ${new Date(milestone.end_date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}`
                      : ''}
                  </Text>
                </View>
                {active ? <Pill label="NOW" tone="warning" /> : null}
              </View>
            );
          })
        )}
        </Section>
      ) : (
        <>
        {/* ── Smart nudges (tick-engine drift + advisories) ── */}
        <Section>
          <SmartNudges journeyId={journey.id} />
        </Section>

        {/* ── Tasks ── */}
        <Section>
        <View style={styles.sectionHeadingRow}>
          <View style={styles.sectionHeadingIcon}>
            <Ionicons name="checkbox-outline" size={18} color={theme.colors.primary} />
          </View>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionTitle}>Tasks</Text>
            <Text style={styles.sectionSubtitle}>Work to do on the farm</Text>
          </View>
        </View>

        <Text style={styles.groupTitle}>
          Now {activeTasks.length > 0 ? `(${activeTasks.length})` : ''}
        </Text>
        {activeTasks.length === 0 && (
          <Card>
            <Text style={styles.copy}>Nothing to do right now — you&apos;re on track. 🌱</Text>
          </Card>
        )}
        {activeTasks.map((task) => (
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

        {upcomingTasks.length > 0 && (
          <View style={styles.taskGroup}>
          <Text style={styles.groupTitle}>Coming up ({upcomingTasks.length})</Text>
          {upcomingTasks.map((task) => (
            <View key={task.id} style={styles.upcomingRow}>
              <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />
              <Text style={styles.upcomingText} numberOfLines={1}>{task.title}</Text>
              {task.due_date ? (
                <Text style={styles.upcomingDate}>
                  {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
              ) : null}
            </View>
          ))}
          </View>
        )}

        {doneTasks.length > 0 && (
          <View style={styles.taskGroup}>
          <Text style={styles.groupTitle}>Completed ({doneTasks.length})</Text>
          {doneTasks.map((task) => (
            <View key={task.id} style={styles.doneRow}>
              <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
              <Text style={styles.doneText} numberOfLines={1}>{task.title}</Text>
            </View>
          ))}
          </View>
        )}
        </Section>
        </>
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
  journeyTabs: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: '#ece9df',
  },
  journeyTab: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
  },
  journeyTabActive: {
    backgroundColor: theme.colors.primary,
  },
  journeyTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  journeyTabTextActive: {
    color: '#fff',
  },
  journeyTabCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ddd9ce',
    paddingHorizontal: 5,
  },
  journeyTabCountActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  journeyTabCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textMuted,
  },
  journeyTabCountTextActive: {
    color: '#fff',
  },
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
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionHeadingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f4ec',
  },
  sectionHeadingCopy: {
    flex: 1,
    gap: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  groupTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
    marginTop: 4,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, textTransform: 'capitalize' },
  copy: { color: theme.colors.textMuted, lineHeight: 20 },
  copySmall: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },

  // milestones
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
  },
  milestoneRowActive: {
    borderColor: theme.colors.accent,
    backgroundColor: '#fff9e9',
  },
  milestoneWeek: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0eee7',
  },
  milestoneWeekActive: {
    backgroundColor: '#fff0bf',
  },
  milestoneWeekComplete: {
    backgroundColor: theme.colors.success,
  },
  milestoneWeekLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: theme.colors.textMuted,
  },
  milestoneWeekNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  milestoneCopy: {
    flex: 1,
    gap: 2,
  },
  milestoneTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.text,
  },

  // tasks
  taskGroup: {
    gap: 8,
    marginTop: 8,
  },
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
  upcomingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  upcomingText: { flex: 1, color: theme.colors.text, fontSize: 14 },
  upcomingDate: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
});
