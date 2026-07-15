import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Card } from '@/components/core/card';
import { Screen, Section } from '@/components/layout/screen';
import { ApiError } from '@/lib/api/client';
import { consultsApi, type ExpertConsult } from '@/lib/api/consults';
import { mobileApi } from '@/lib/api/mobile';
import { cropCatalog, getCropCatalogItem } from '@/lib/constants/crops';
import { farmRepository, journeyRepository } from '@/lib/db/repositories';
import type { DiagnosisResult, LogImageRecord, LogRecord } from '@/lib/domain/types';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';
import { tapHaptic } from '@/lib/utils/haptics';
import { createId } from '@/lib/utils/id';
import { compressForUpload } from '@/lib/utils/image';

const SEVERITY_TONE: Record<string, string> = {
  high: theme.colors.danger,
  medium: theme.colors.warning,
  low: theme.colors.success,
  unknown: theme.colors.textMuted,
};

/**
 * Compose the logbook note from a diagnosis so the saved record keeps the full
 * "what to do" plan — not just the label. The note detail screen renders
 * `notes` as plain text, so newlines + bullets survive.
 */
function composeScanNote(result: DiagnosisResult): string {
  const heading = result.detected
    ? `Crop scan: ${result.name_en ?? result.label ?? 'issue detected'}${
        result.name_sw ? ` (${result.name_sw})` : ''
      }`
    : 'Crop scan: no clear diagnosis';

  const lines: string[] = [heading];
  if (result.description) lines.push(result.description);

  const actions = (result.recommended_actions ?? []).filter((a) => a.action_en ?? a.name);
  if (actions.length > 0) {
    lines.push('', 'What to do:');
    for (const a of actions) {
      let line = `• ${a.action_en ?? a.name}`;
      if (a.cost_tzs_per_ha_min != null) {
        const max = a.cost_tzs_per_ha_max ?? a.cost_tzs_per_ha_min;
        line += ` (~${a.cost_tzs_per_ha_min.toLocaleString()}–${max.toLocaleString()} TZS/ha)`;
      }
      lines.push(line);
    }
  }

  if (result.estimated_control_cost_tzs != null) {
    lines.push('', `Estimated control cost ~${result.estimated_control_cost_tzs.toLocaleString()} TZS/ha`);
  }

  return lines.join('\n');
}

// These return i18n keys (resolved with t() at the call site). For an unmapped
// backend message we return it raw — t() passes unknown keys through unchanged.
function scanErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 408) return 'scan.errTimeout';
    if (error.status === 0) return 'scan.errNoInternet';
    if (error.status >= 500) return 'scan.errBusy';
    if (error.status === 413) return 'scan.errTooLarge';
    return error.message;
  }
  return 'scan.errGeneric';
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'scan.saveErrNoInternet';
    if (error.status >= 500) return 'scan.saveErrBusy';
    if (error.status === 413) return 'scan.saveErrTooLarge';
    return error.message;
  }
  return 'scan.saveErrGeneric';
}

export function ScanScreen() {
  const { t } = useI18n();
  const params = useLocalSearchParams<{ advisorId?: string; advisorName?: string }>();
  const preferredAdvisorId = typeof params.advisorId === 'string' ? params.advisorId : undefined;
  const preferredAdvisorName = typeof params.advisorName === 'string' ? params.advisorName : undefined;
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [cropName, setCropName] = useState<string | null>(null);
  const [savedToLog, setSavedToLog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [expertConsult, setExpertConsult] = useState<ExpertConsult | null>(null);

  const { data: journey } = useQuery({
    queryKey: ['scan-active-journey'],
    // Target the farm the user is actually working on: the selected farm's
    // active journey, falling back to any active journey if none is selected.
    queryFn: async () => {
      const activeFarmId = await farmRepository.getSelectedFarmId();
      if (activeFarmId) {
        return journeyRepository.getActiveJourneyForFarm(activeFarmId);
      }
      return journeyRepository.getActiveJourney();
    },
  });

  const journeyCropName = journey ? getCropCatalogItem(journey.crop_id).name : null;
  const effectiveCrop = cropName ?? journeyCropName ?? 'maize';

  const diagnoseMutation = useMutation<
    DiagnosisResult | undefined,
    Error,
    { uri: string; mimeType: string; cropId: string }
  >({
    mutationFn: (input) =>
      mobileApi.diagnoseCropImage({
        uri: input.uri,
        mimeType: input.mimeType,
        cropId: input.cropId,
        farmId: journey?.farm_id ?? null,
        journeyId: journey?.id ?? null,
        plotId: journey?.plot_id ?? null,
      }),
  });

  const expertReviewMutation = useMutation({
    mutationFn: (observationId: string) =>
      consultsApi.createFromObservation(observationId, 'Please review this crop scan and treatment plan.', preferredAdvisorId),
    onSuccess: setExpertConsult,
  });

  const pick = async (mode: 'camera' | 'library') => {
    tapHaptic();
    const perm =
      mode === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result =
      mode === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    // Shrink before upload so the request stays small and fast.
    const compressed = await compressForUpload(asset.uri, asset.mimeType);
    setImageUri(compressed.uri);
    setMimeType(compressed.mimeType);
    setSavedToLog(false);
    setSaveError(null);
    diagnoseMutation.mutate({ uri: compressed.uri, mimeType: compressed.mimeType, cropId: effectiveCrop });
  };

  const reset = () => {
    setImageUri(null);
    setSavedToLog(false);
    setSaveError(null);
    setExpertConsult(null);
    expertReviewMutation.reset();
    diagnoseMutation.reset();
  };

  const saveToLogbook = async () => {
    if (!journey || !result || !imageUri || saving || savedToLog) return;
    setSaving(true);
    setSaveError(null);
    try {
      const now = new Date().toISOString();
      const logId = createId();
      const log: LogRecord = {
        id: logId,
        client_mutation_id: createId('mutation'),
        farm_id: journey.farm_id,
        journey_id: journey.id,
        plot_id: journey.plot_id ?? null,
        operation_type: 'scouting',
        date: now.slice(0, 10),
        cost: null,
        notes: composeScanNote(result),
        location_latitude: null,
        location_longitude: null,
        snapshot_url: null,
        updated_at: now,
        deleted_at: null,
        sync_status: 'pending',
        last_synced_at: null,
      };
      const images: LogImageRecord[] = [
        {
          id: createId(),
          client_mutation_id: createId('mutation'),
          updated_at: now,
          deleted_at: null,
          sync_status: 'pending',
          last_synced_at: null,
          log_id: logId,
          local_uri: imageUri,
          remote_url: null,
          thumbnail_url: null,
          mime_type: mimeType,
          width: null,
          height: null,
          taken_at: now,
        },
      ];
      // Online-first: upload the photo + persist the log to the server straight
      // away (same path as the Add Note sheet), instead of writing to the local
      // DB and queueing a later sync.
      await mobileApi.syncLog({ log, images });
      setSavedToLog(true);
    } catch (err) {
      setSaveError(saveErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const result = diagnoseMutation.data;

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('scan.title')}</Text>
        <Text style={styles.subtitle}>{t('scan.subtitle')}</Text>
      </View>

      {/* Crop selector — defaults to your active journey's crop */}
      <View style={styles.cropPickerWrap}>
        <Text style={styles.cropLabel}>{t('scan.crop')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cropRow}
        >
          {cropCatalog.map((crop) => {
            const active = crop.name === effectiveCrop;
            return (
              <TouchableOpacity
                key={crop.id}
                style={[styles.cropChip, active && styles.cropChipActive]}
                onPress={() => setCropName(crop.name)}
                activeOpacity={0.8}
              >
                <Text style={[styles.cropChipText, active && styles.cropChipTextActive]}>
                  {crop.common_name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {!imageUri ? (
        <View style={styles.pickRow}>
          <TouchableOpacity style={styles.pickBtn} onPress={() => pick('camera')} activeOpacity={0.85}>
            <Ionicons name="camera" size={26} color={theme.colors.primary} />
            <Text style={styles.pickLabel}>{t('scan.takePhoto')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickBtn} onPress={() => pick('library')} activeOpacity={0.85}>
            <Ionicons name="images" size={26} color={theme.colors.primary} />
            <Text style={styles.pickLabel}>{t('scan.fromGallery')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <Image source={{ uri: imageUri }} style={styles.preview} contentFit="cover" />

          {diagnoseMutation.isPending && (
            <Card>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.loadingText}>{t('scan.analyzing')}</Text>
              </View>
            </Card>
          )}

          {diagnoseMutation.isError && (
            <Card>
              <Text style={styles.errorText}>{t(scanErrorMessage(diagnoseMutation.error))}</Text>
              <TouchableOpacity
                style={styles.retryInline}
                onPress={() =>
                  diagnoseMutation.mutate({ uri: imageUri, mimeType, cropId: effectiveCrop })
                }
              >
                <Ionicons name="refresh" size={16} color={theme.colors.primary} />
                <Text style={styles.retryInlineText}>{t('common.tryAgain')}</Text>
              </TouchableOpacity>
            </Card>
          )}

          {result && <DiagnosisCard result={result} />}

          {result?.detected && result.observation_id ? (
            <Card>
              <View style={styles.expertHead}>
                <View style={styles.expertIcon}>
                  <Ionicons name="person-circle-outline" size={24} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expertTitle}>{preferredAdvisorName ? `Review with ${preferredAdvisorName}` : 'Get an agronomist’s review'}</Text>
                  <Text style={styles.expertCopy}>A verified expert can confirm this scan and review the neutral treatment plan.</Text>
                </View>
              </View>
              {expertConsult ? (
                <>
                  <View style={styles.reviewRequested}>
                    <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
                    <Text style={styles.reviewRequestedText}>
                      {expertConsult.advisor_name ? `Assigned to ${expertConsult.advisor_name}` : 'Review requested — waiting for an expert'}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.expertButton} onPress={() => router.push(`/consults/${expertConsult.id}` as never)}>
                    <Text style={styles.expertButtonText}>Open expert review</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.expertButton, expertReviewMutation.isPending && { opacity: 0.6 }]}
                  disabled={expertReviewMutation.isPending}
                  onPress={() => expertReviewMutation.mutate(result.observation_id!)}
                >
                  <Text style={styles.expertButtonText}>{expertReviewMutation.isPending ? 'Requesting…' : 'Request expert review'}</Text>
                </TouchableOpacity>
              )}
              {expertReviewMutation.error ? <Text style={styles.saveError}>{expertReviewMutation.error.message}</Text> : null}
            </Card>
          ) : null}

          {result && journey ? (
            <TouchableOpacity
              style={[styles.saveBtn, savedToLog && styles.saveBtnDone]}
              onPress={() => void saveToLogbook()}
              disabled={saving || savedToLog}
              activeOpacity={0.85}
            >
              <Ionicons
                name={savedToLog ? 'checkmark-circle' : 'bookmark-outline'}
                size={18}
                color={savedToLog ? theme.colors.success : theme.colors.primary}
              />
              <Text style={[styles.saveBtnText, savedToLog && styles.saveBtnTextDone]}>
                {savedToLog ? t('scan.savedToLogbook') : saving ? t('common.saving') : t('scan.saveToLogbook')}
              </Text>
            </TouchableOpacity>
          ) : null}

          {saveError ? <Text style={styles.saveError}>{t(saveError)}</Text> : null}

          <TouchableOpacity style={styles.retakeBtn} onPress={reset} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retakeText}>{t('scan.scanAnother')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  );
}

function DiagnosisCard({ result }: { result: DiagnosisResult }) {
  const { t } = useI18n();
  if (!result.detected) {
    return (
      <Card>
        <View style={styles.resultHead}>
          <Ionicons name="leaf" size={22} color={theme.colors.success} />
          <Text style={styles.resultTitle}>
            {result.label === 'healthy' ? t('scan.looksHealthy') : t('scan.noClearDiagnosis')}
          </Text>
        </View>
        <Text style={styles.resultBody}>
          {result.description ?? t('scan.healthyHint')}
        </Text>
      </Card>
    );
  }

  const tone = SEVERITY_TONE[result.severity] ?? theme.colors.textMuted;

  return (
    <Card>
      <View style={styles.resultHead}>
        <View style={[styles.sevDot, { backgroundColor: tone }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.resultTitle}>{result.name_en ?? result.label}</Text>
          {result.name_sw ? <Text style={styles.resultSw}>{result.name_sw}</Text> : null}
        </View>
        <Text style={[styles.confidence, { color: tone }]}>
          {Math.round(result.confidence * 100)}%
        </Text>
      </View>

      {result.description ? <Text style={styles.resultBody}>{result.description}</Text> : null}

      {result.recommended_actions.length > 0 && (
        <Section>
          <Text style={styles.actionsTitle}>{t('scan.whatToDo')}</Text>
          {result.recommended_actions.map((a, i) => (
            <View key={i} style={styles.actionRow}>
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>{a.action_en ?? a.name}</Text>
                {a.cost_tzs_per_ha_min != null && (
                  <Text style={styles.actionCost}>
                    {t('scan.costPerHa', {
                      min: a.cost_tzs_per_ha_min.toLocaleString(),
                      max: (a.cost_tzs_per_ha_max ?? a.cost_tzs_per_ha_min).toLocaleString(),
                    })}
                    {a.efficacy != null ? t('scan.effectiveSuffix', { pct: Math.round(a.efficacy * 100) }) : ''}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </Section>
      )}

      {result.estimated_control_cost_tzs != null && (
        <View style={styles.costBanner}>
          <Ionicons name="cash-outline" size={16} color={theme.colors.primaryDark} />
          <Text style={styles.costBannerText}>
            {t('scan.estControlCost', { cost: result.estimated_control_cost_tzs.toLocaleString() })}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing.lg },
  header: { gap: 4 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.textMuted, lineHeight: 20 },

  cropPickerWrap: { gap: 8 },
  cropLabel: {
    fontSize: 12, fontWeight: '800', color: theme.colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  cropRow: { gap: theme.spacing.sm, paddingRight: theme.spacing.lg },
  cropChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  cropChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  cropChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  cropChipTextActive: { color: '#fff' },

  pickRow: { flexDirection: 'row', gap: theme.spacing.md },
  pickBtn: {
    flex: 1, gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg,
    borderWidth: 1.5, borderColor: theme.colors.border, borderStyle: 'dashed',
    paddingVertical: 28,
  },
  pickLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.text },

  preview: { width: '100%', height: 240, borderRadius: theme.radius.lg },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { fontSize: 14, color: theme.colors.textMuted },
  errorText: { fontSize: 14, color: theme.colors.danger },
  retryInline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  retryInlineText: { color: theme.colors.primary, fontWeight: '800', fontSize: 14 },

  resultHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sevDot: { width: 12, height: 12, borderRadius: 6 },
  resultTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  resultSw: { fontSize: 13, color: theme.colors.textMuted },
  confidence: { fontSize: 16, fontWeight: '800' },
  resultBody: { fontSize: 14, color: theme.colors.textMuted, lineHeight: 20 },

  actionsTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  actionText: { fontSize: 14, color: theme.colors.text, fontWeight: '600' },
  actionCost: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },

  costBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.accent + '22',
    borderRadius: theme.radius.md, padding: theme.spacing.md, marginTop: 4,
  },
  costBannerText: { fontSize: 13, fontWeight: '700', color: theme.colors.primaryDark },

  expertHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  expertIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary + '16' },
  expertTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  expertCopy: { fontSize: 13, lineHeight: 18, color: theme.colors.textMuted, marginTop: 2 },
  expertButton: { alignItems: 'center', paddingVertical: 11, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary },
  expertButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  reviewRequested: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: theme.radius.md, backgroundColor: theme.colors.success + '12' },
  reviewRequestedText: { flex: 1, color: theme.colors.success, fontSize: 13, fontWeight: '700' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill,
    borderWidth: 1.5, borderColor: theme.colors.primary, paddingVertical: 12,
  },
  saveBtnDone: { borderColor: theme.colors.success },
  saveBtnText: { color: theme.colors.primary, fontWeight: '800', fontSize: 15 },
  saveBtnTextDone: { color: theme.colors.success },
  saveError: { fontSize: 13, color: theme.colors.danger, textAlign: 'center' },

  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 13,
  },
  retakeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
