import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Card } from '@/components/core/card';
import { Screen, Section } from '@/components/layout/screen';
import { ApiError } from '@/lib/api/client';
import { mobileApi } from '@/lib/api/mobile';
import { cropCatalog, getCropCatalogItem } from '@/lib/constants/crops';
import { journeyRepository, logRepository } from '@/lib/db/repositories';
import type { DiagnosisResult } from '@/lib/domain/types';
import { queueLogSync } from '@/lib/sync/engine';
import { theme } from '@/lib/theme';
import { tapHaptic } from '@/lib/utils/haptics';
import { compressForUpload } from '@/lib/utils/image';

const SEVERITY_TONE: Record<string, string> = {
  high: theme.colors.danger,
  medium: theme.colors.warning,
  low: theme.colors.success,
  unknown: theme.colors.textMuted,
};

function scanErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 408) return 'The scan took too long. Try again on a stronger connection.';
    if (error.status === 0) return 'No internet connection. Connect and try the scan again.';
    if (error.status >= 500) return 'The diagnosis service is busy right now. Please try again in a moment.';
    if (error.status === 413) return 'That photo was too large. Try taking a new, closer photo.';
    return error.message;
  }
  return "Couldn't analyze the photo. Check your connection and try again.";
}

export function ScanScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [cropName, setCropName] = useState<string | null>(null);
  const [savedToLog, setSavedToLog] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: journey } = useQuery({
    queryKey: ['scan-active-journey'],
    queryFn: () => journeyRepository.getActiveJourney(),
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
    diagnoseMutation.mutate({ uri: compressed.uri, mimeType: compressed.mimeType, cropId: effectiveCrop });
  };

  const reset = () => {
    setImageUri(null);
    setSavedToLog(false);
    diagnoseMutation.reset();
  };

  const saveToLogbook = async () => {
    if (!journey || !result || !imageUri || saving || savedToLog) return;
    setSaving(true);
    try {
      const label = result.detected ? (result.name_en ?? result.label) : 'no clear diagnosis';
      const { log } = await logRepository.createOfflineLog({
        farm_id: journey.farm_id,
        plot_id: journey.plot_id ?? null,
        journey_id: journey.id,
        operation_type: 'scouting',
        date: new Date().toISOString().slice(0, 10),
        notes: `Crop scan: ${label}${result.description ? ` — ${result.description}` : ''}`,
        images: [{ local_uri: imageUri, mime_type: mimeType }],
      });
      await queueLogSync(log);
      setSavedToLog(true);
    } catch {
      // best-effort save
    } finally {
      setSaving(false);
    }
  };

  const result = diagnoseMutation.data;

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Scan your crop</Text>
        <Text style={styles.subtitle}>
          Take a clear photo of an affected leaf, stem, or pest. We&apos;ll identify the problem and what to do.
        </Text>
      </View>

      {/* Crop selector — defaults to your active journey's crop */}
      <View style={styles.cropPickerWrap}>
        <Text style={styles.cropLabel}>Crop</Text>
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
            <Text style={styles.pickLabel}>Take photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pickBtn} onPress={() => pick('library')} activeOpacity={0.85}>
            <Ionicons name="images" size={26} color={theme.colors.primary} />
            <Text style={styles.pickLabel}>From gallery</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          <Image source={{ uri: imageUri }} style={styles.preview} contentFit="cover" />

          {diagnoseMutation.isPending && (
            <Card>
              <View style={styles.loadingRow}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={styles.loadingText}>Analyzing your crop…</Text>
              </View>
            </Card>
          )}

          {diagnoseMutation.isError && (
            <Card>
              <Text style={styles.errorText}>{scanErrorMessage(diagnoseMutation.error)}</Text>
              <TouchableOpacity
                style={styles.retryInline}
                onPress={() =>
                  diagnoseMutation.mutate({ uri: imageUri, mimeType, cropId: effectiveCrop })
                }
              >
                <Ionicons name="refresh" size={16} color={theme.colors.primary} />
                <Text style={styles.retryInlineText}>Try again</Text>
              </TouchableOpacity>
            </Card>
          )}

          {result && <DiagnosisCard result={result} />}

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
                {savedToLog ? 'Saved to logbook' : saving ? 'Saving…' : 'Save to logbook'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.retakeBtn} onPress={reset} activeOpacity={0.85}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retakeText}>Scan another</Text>
          </TouchableOpacity>
        </View>
      )}
    </Screen>
  );
}

function DiagnosisCard({ result }: { result: DiagnosisResult }) {
  if (!result.detected) {
    return (
      <Card>
        <View style={styles.resultHead}>
          <Ionicons name="leaf" size={22} color={theme.colors.success} />
          <Text style={styles.resultTitle}>
            {result.label === 'healthy' ? 'Looks healthy' : 'No clear diagnosis'}
          </Text>
        </View>
        <Text style={styles.resultBody}>
          {result.description ?? 'Try a clearer, closer photo of the affected area in good light.'}
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
          <Text style={styles.actionsTitle}>What to do</Text>
          {result.recommended_actions.map((a, i) => (
            <View key={i} style={styles.actionRow}>
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>{a.action_en ?? a.name}</Text>
                {a.cost_tzs_per_ha_min != null && (
                  <Text style={styles.actionCost}>
                    ~{a.cost_tzs_per_ha_min.toLocaleString()}–{(a.cost_tzs_per_ha_max ?? a.cost_tzs_per_ha_min).toLocaleString()} TZS/ha
                    {a.efficacy != null ? ` · ${Math.round(a.efficacy * 100)}% effective` : ''}
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
            Estimated control cost ~{result.estimated_control_cost_tzs.toLocaleString()} TZS/ha
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

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.pill,
    borderWidth: 1.5, borderColor: theme.colors.primary, paddingVertical: 12,
  },
  saveBtnDone: { borderColor: theme.colors.success },
  saveBtnText: { color: theme.colors.primary, fontWeight: '800', fontSize: 15 },
  saveBtnTextDone: { color: theme.colors.success },

  retakeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 13,
  },
  retakeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
