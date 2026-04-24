import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/core/button';
import { Card } from '@/components/core/card';
import { Pill } from '@/components/core/pill';
import { Screen, Section } from '@/components/layout/screen';
import { EmptyState } from '@/components/state/empty-state';
import { decodeInstructions, journeyRepository, taskRepository } from '@/lib/db/repositories';
import { queueTaskCompletionSync } from '@/lib/sync/engine';
import { theme } from '@/lib/theme';

export function JourneyScreen() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['journey-screen'],
    queryFn: async () => {
      const journey = await journeyRepository.getActiveJourney();
      if (!journey) {
        return null;
      }

      const [stages, milestones, tasks] = await Promise.all([
        journeyRepository.listStages(journey.id),
        journeyRepository.listMilestones(journey.id),
        journeyRepository.listTasks(journey.id),
      ]);

      return { journey, stages, milestones, tasks };
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      await taskRepository.completeTaskOffline(taskId);
      const updated = data?.tasks.find((task) => task.id === taskId);
      if (updated) {
        await queueTaskCompletionSync({
          ...updated,
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['journey-screen'] });
      await queryClient.invalidateQueries({ queryKey: ['home-dashboard'] });
    },
  });

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

  return (
    <Screen>
      <Card>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.title}>{data.journey.common_name}</Text>
            <Text style={styles.copy}>
              {data.journey.variety ?? 'Local variety'} • planted {data.journey.planting_date}
            </Text>
          </View>
          <Pill label={`${Math.round(data.journey.progress_percentage)}%`} tone="info" />
        </View>
        <Text style={styles.copy}>
          Current stage: {data.journey.current_stage ?? 'Planning'} • Harvest target {data.journey.expected_harvest_date}
        </Text>
      </Card>

      <Section>
        <Text style={styles.sectionTitle}>Stage timeline</Text>
        {data.stages.map((stage) => (
          <Card key={stage.id}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.cardTitle}>{stage.name}</Text>
                <Text style={styles.copy}>{stage.description}</Text>
              </View>
              <Pill
                label={stage.status.toUpperCase()}
                tone={stage.status === 'active' ? 'success' : 'neutral'}
              />
            </View>
            <Text style={styles.copy}>
              Day {stage.start_day} to {stage.end_day}
            </Text>
          </Card>
        ))}
      </Section>

      <Section>
        <Text style={styles.sectionTitle}>Milestones</Text>
        {data.milestones.map((milestone) => (
          <Card key={milestone.id}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.cardTitle}>Week {milestone.week_number}</Text>
                <Text style={styles.copy}>{milestone.title}</Text>
              </View>
              <Pill label={`${milestone.xp_reward} XP`} tone="warning" />
            </View>
            <Text style={styles.copy}>{milestone.description}</Text>
          </Card>
        ))}
      </Section>

      <Section>
        <Text style={styles.sectionTitle}>Tasks</Text>
        {data.tasks.map((task) => (
          <Card key={task.id}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.cardTitle}>{task.title}</Text>
                <Text style={styles.copy}>{task.description}</Text>
              </View>
              <Pill
                label={task.status.toUpperCase()}
                tone={task.status === 'completed' ? 'success' : 'neutral'}
              />
            </View>
            {decodeInstructions(task).map((instruction) => (
              <Text key={instruction} style={styles.copy}>
                • {instruction}
              </Text>
            ))}
            <Button
              label={task.status === 'completed' ? 'Completed offline' : 'Mark complete'}
              variant="secondary"
              disabled={task.status === 'completed' || completeTaskMutation.isPending}
              onPress={() => completeTaskMutation.mutate(task.id)}
            />
          </Card>
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
  },
  copy: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
});
