import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { TaskRecord } from '@/lib/domain/types';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

// value = stable English sent to the backend (decline_reason); key = display label.
const SKIP_REASONS: { value: string; key: string }[] = [
  { value: 'Already done', key: 'taskSheet.reasonAlreadyDone' },
  { value: 'Not needed', key: 'taskSheet.reasonNotNeeded' },
  { value: 'Weather', key: 'taskSheet.reasonWeather' },
  { value: 'No inputs', key: 'taskSheet.reasonNoInputs' },
  { value: 'Other', key: 'taskSheet.reasonOther' },
];

/**
 * "What do you want to do with this task?" — gives farmers flexibility instead
 * of a rigid complete-only plan: push it out (snooze) or skip it with a reason.
 */
export function TaskActionsSheet({
  visible,
  task,
  onSnooze,
  onSkip,
  onCancel,
}: {
  visible: boolean;
  task: TaskRecord | null;
  onSnooze: (days: number) => void;
  onSkip: (reason: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const snoozeOptions: { label: string; days: number; icon: keyof typeof Ionicons.glyphMap }[] = [
    { label: t('taskSheet.tomorrow'), days: 1, icon: 'today-outline' },
    { label: t('taskSheet.inDays', { n: 3 }), days: 3, icon: 'calendar-outline' },
    { label: t('taskSheet.nextWeek'), days: 7, icon: 'calendar-number-outline' },
  ];
  if (!task) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title} numberOfLines={2}>{task.title}</Text>

          <Text style={styles.sectionLabel}>{t('taskSheet.snooze')}</Text>
          <View style={styles.snoozeRow}>
            {snoozeOptions.map((o) => (
              <TouchableOpacity
                key={o.days}
                style={styles.snoozeBtn}
                activeOpacity={0.8}
                onPress={() => onSnooze(o.days)}
              >
                <Ionicons name={o.icon} size={20} color={theme.colors.primary} />
                <Text style={styles.snoozeText}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>{t('taskSheet.skipTask')}</Text>
          <View style={styles.reasonWrap}>
            {SKIP_REASONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={styles.reasonChip}
                activeOpacity={0.8}
                onPress={() => onSkip(r.value)}
              >
                <Text style={styles.reasonText}>{t(r.key)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancel} onPress={onCancel} activeOpacity={0.8}>
            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.overlay },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text, textTransform: 'capitalize' },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  snoozeRow: { flexDirection: 'row', gap: theme.spacing.sm },
  snoozeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  snoozeText: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  reasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  reasonText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  cancel: { alignItems: 'center', paddingVertical: theme.spacing.md, marginTop: 4 },
  cancelText: { fontSize: 15, fontWeight: '700', color: theme.colors.textMuted },
});
