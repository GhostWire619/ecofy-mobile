import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { normalizeFarmRecord } from '@/features/farms/data';
import { cropCatalog } from '@/lib/constants/crops';
import { farmRepository, journeyRepository, plotRepository } from '@/lib/db/repositories';
import type { FarmRecord } from '@/lib/domain/types';
import { useI18n } from '@/lib/i18n';
import { queueJourneySync } from '@/lib/sync/engine';
import { theme } from '@/lib/theme';

type PlantingChoice = 'planted' | 'this_month' | 'later';
// Days from today. "Already planted" seeds a recently-active journey; "later" is a
// future (planned) journey. createJourneyDraft marks future dates planned, else active.
const OFFSET_DAYS: Record<PlantingChoice, number> = { planted: -14, this_month: 0, later: 30 };

// The advisory engine only drives a full day-by-day plan for maize today. Other
// crops are shown so the catalog looks alive, but are gated ("coming soon") so a
// farmer never starts a journey the engine can't actually guide.
const SUPPORTED_CROP_IDS = new Set<string>(['maize-h513']);
const DEFAULT_CROP_ID = 'maize-h513';

/**
 * The one-tap way to start a crop journey for a farm that doesn't have one yet.
 * Pick crop + roughly when planting → creates the journey (+ tasks/milestones)
 * locally and queues it for sync, so Today/Journey light up immediately. Removes
 * the old dead-end where setting a crop/date on the dashboard did nothing.
 */
export function StartJourneySheet({
  visible,
  farmId,
  farm,
  onClose,
  onStarted,
}: {
  visible: boolean;
  farmId: string | null;
  /** The farm record (from the calling screen). Used to self-heal the local DB
   * if this farm isn't persisted locally yet — otherwise the journey insert
   * fails a farm_id foreign-key constraint. */
  farm?: FarmRecord | null;
  onClose: () => void;
  onStarted?: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  // Default to the one fully-supported crop so the farmer can start in one tap.
  const [cropId, setCropId] = useState(DEFAULT_CROP_ID);
  const [choice, setChoice] = useState<PlantingChoice>('this_month');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!farmId) return;
    if (!cropId) {
      setError('journeyStart.errNoCrop');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Make sure the farm exists locally (the journey's farm_id FK needs it).
      // The caller's farm record may be server-only and not yet persisted here.
      const localFarm = await farmRepository.getFarm(farmId).catch(() => null);
      if (!localFarm && farm) {
        await farmRepository.saveFarm(normalizeFarmRecord(farm)).catch(() => undefined);
      }
      const plot = await plotRepository.getDefaultPlotForFarm(farmId).catch(() => null);
      const d = new Date();
      d.setDate(d.getDate() + OFFSET_DAYS[choice]);
      const draft = await journeyRepository.createJourneyDraft({
        farm_id: farmId,
        plot_id: plot?.id ?? null,
        crop_id: cropId,
        planting_date: d.toISOString().slice(0, 10),
      });
      await queueJourneySync(draft.journey).catch(() => undefined);
      await queryClient.invalidateQueries();
      setCropId(DEFAULT_CROP_ID);
      setChoice('this_month');
      onStarted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'journeyStart.errFailed');
    } finally {
      setBusy(false);
    }
  }

  const choices: { key: PlantingChoice; label: string }[] = [
    { key: 'planted', label: t('journeyStart.planted') },
    { key: 'this_month', label: t('journeyStart.thisMonth') },
    { key: 'later', label: t('journeyStart.later') },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={busy ? undefined : onClose} />
      <View style={st.sheet}>
        <View style={st.handle} />
        <Text style={st.title}>{t('journeyStart.title')}</Text>
        <Text style={st.subtitle}>{t('journeyStart.subtitle')}</Text>

        <Text style={st.label}>{t('journeyStart.cropLabel')}</Text>
        <ScrollView style={st.cropList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {/* Supported crops first, then "coming soon" crops the engine can't drive yet. */}
          {[...cropCatalog]
            .sort(
              (a, b) =>
                Number(SUPPORTED_CROP_IDS.has(b.id)) - Number(SUPPORTED_CROP_IDS.has(a.id)),
            )
            .map((c) => {
              const supported = SUPPORTED_CROP_IDS.has(c.id);
              const active = cropId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[st.cropRow, active && st.cropRowActive, !supported && st.cropRowDisabled]}
                  disabled={!supported}
                  onPress={() => {
                    setCropId(c.id);
                    setError(null);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[st.cropName, active && st.cropNameActive, !supported && st.cropNameDisabled]}>
                      {c.common_name}
                    </Text>
                    {c.local_name ? <Text style={st.cropSub}>{c.local_name}</Text> : null}
                  </View>
                  {!supported ? (
                    <View style={st.soonPill}>
                      <Text style={st.soonPillText}>{t('common.comingSoon')}</Text>
                    </View>
                  ) : active ? (
                    <Text style={st.check}>✓</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
        </ScrollView>
        <Text style={st.cropHint}>{t('journeyStart.maizeOnlyHint')}</Text>

        <Text style={st.label}>{t('journeyStart.whenLabel')}</Text>
        <View style={st.choiceRow}>
          {choices.map((ch) => {
            const active = choice === ch.key;
            return (
              <TouchableOpacity
                key={ch.key}
                style={[st.choice, active && st.choiceActive]}
                onPress={() => setChoice(ch.key)}
                activeOpacity={0.8}
              >
                <Text style={[st.choiceText, active && st.choiceTextActive]} numberOfLines={2}>
                  {ch.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? <Text style={st.error}>{t(error)}</Text> : null}

        <TouchableOpacity
          style={[st.startBtn, busy && st.startBtnDisabled]}
          disabled={busy}
          onPress={() => void start()}
          activeOpacity={0.85}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={st.startText}>{t('journeyStart.start')}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} disabled={busy} hitSlop={8}>
          <Text style={st.cancel}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: 'rgba(248, 247, 239, 0.96)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: 6,
  },
  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 6,
  },
  cropList: {
    maxHeight: 230,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
  },
  cropRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  cropRowActive: { backgroundColor: theme.colors.primary + '12' },
  cropRowDisabled: { opacity: 0.55 },
  cropName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  cropNameActive: { color: theme.colors.primary },
  cropNameDisabled: { color: theme.colors.textMuted },
  cropSub: { fontSize: 12, color: theme.colors.textMuted },
  cropHint: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 16, marginTop: 2 },
  soonPill: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  soonPillText: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  check: { fontSize: 16, fontWeight: '800', color: theme.colors.primary },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  choiceActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  choiceText: { fontSize: 13, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
  choiceTextActive: { color: '#fff' },
  error: { color: theme.colors.danger, fontSize: 13 },
  startBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  startBtnDisabled: { backgroundColor: theme.colors.disabled },
  startText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancel: { textAlign: 'center', color: theme.colors.textMuted, fontWeight: '600', fontSize: 14, paddingVertical: 10 },
});
