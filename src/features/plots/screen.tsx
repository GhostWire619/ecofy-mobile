import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/core/card';
import { Screen } from '@/components/layout/screen';
import { SkeletonCard } from '@/components/state/skeleton';
import { mobileApi } from '@/lib/api/mobile';
import type { PlotHealthSnapshot, PlotRecord } from '@/lib/domain/types';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

const HECTARES_PER_ACRE = 0.404686;
const SOIL_TYPES = ['Loam', 'Sandy loam', 'Clay', 'Clay loam', 'Sandy', 'Silt', 'Black cotton', 'Other'];

function acresFromHa(ha: number | null | undefined): string {
  if (typeof ha !== 'number' || !Number.isFinite(ha)) return '';
  return (ha / HECTARES_PER_ACRE).toFixed(2);
}

const RISK_COLOR: Record<string, string> = {
  LOW: theme.colors.success,
  MODERATE: theme.colors.warning,
  HIGH: '#f97316',
  CRITICAL: theme.colors.danger,
};

export function PlotsScreen({ farmId }: { farmId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PlotRecord | 'new' | null>(null);
  const [detail, setDetail] = useState<PlotRecord | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['plots-manage', farmId],
    queryFn: () => mobileApi.listFarmPlots(farmId),
  });
  const plots = data ?? [];

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['plots-manage', farmId] });
  }

  return (
    <Screen contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.heading}>{t('plots.title')}</Text>
      </View>

      <TouchableOpacity style={s.addBtn} onPress={() => setEditing('new')} activeOpacity={0.85}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={s.addBtnText}>{t('plots.addPlot')}</Text>
      </TouchableOpacity>

      {isLoading ? (
        <><SkeletonCard /><SkeletonCard /></>
      ) : isError ? (
        <Card><Text style={s.muted}>{t('plots.couldNotLoad')}</Text></Card>
      ) : plots.length === 0 ? (
        <Card><Text style={s.muted}>{t('plots.empty')}</Text></Card>
      ) : (
        plots.map((plot) => (
          <TouchableOpacity key={plot.id} activeOpacity={0.8} onPress={() => setDetail(plot)}>
            <Card>
              <View style={s.rowBetween}>
                <View style={s.titleRow}>
                  <Text style={s.plotName}>{plot.name}</Text>
                  {plot.is_default ? (
                    <View style={s.defaultPill}><Text style={s.defaultPillText}>{t('plots.default')}</Text></View>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </View>
              <View style={s.tagRow}>
                <View style={s.tag}><Text style={s.tagText}>{acresFromHa(plot.size_hectares) || '—'} {t('plots.acres')}</Text></View>
                {plot.soil_type ? <View style={s.tag}><Text style={s.tagText}>{plot.soil_type}</Text></View> : null}
                {plot.plot_code ? <View style={s.tag}><Text style={s.tagText}>{plot.plot_code}</Text></View> : null}
              </View>
            </Card>
          </TouchableOpacity>
        ))
      )}

      {editing ? (
        <PlotSheet
          farmId={farmId}
          plot={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate(); }}
        />
      ) : null}
      {detail ? (
        <PlotDetailModal
          farmId={farmId}
          plot={detail}
          onClose={() => setDetail(null)}
          onEdit={() => { const p = detail; setDetail(null); setEditing(p); }}
          onDeleted={() => { setDetail(null); invalidate(); }}
        />
      ) : null}
    </Screen>
  );
}

function PlotSheet({
  farmId,
  plot,
  onClose,
  onSaved,
}: {
  farmId: string;
  plot: PlotRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const isEdit = !!plot;
  const [name, setName] = useState(plot?.name ?? '');
  const [acres, setAcres] = useState(acresFromHa(plot?.size_hectares));
  const [soil, setSoil] = useState<string | null>(plot?.soil_type ?? null);
  const [code, setCode] = useState(plot?.plot_code ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setError('plots.errName'); return; }
    setSaving(true);
    setError(null);
    const ha = acres.trim() ? parseFloat(acres) * HECTARES_PER_ACRE : null;
    try {
      if (plot) {
        await mobileApi.updatePlot(farmId, plot.id, {
          name: name.trim(),
          size_hectares: ha,
          soil_type: soil,
          plot_code: code.trim() || null,
        });
      } else {
        await mobileApi.createPlot(farmId, {
          name: name.trim(),
          size_hectares: ha,
          soil_type: soil,
          plot_code: code.trim() || null,
        });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'plots.errSave');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.keyboardModal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={saving ? undefined : onClose}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={s.handle} />
          <Text style={s.sheetTitle}>{isEdit ? t('plots.editPlot') : t('plots.addPlot')}</Text>

          <Text style={s.fieldLabel}>{t('plots.name')}</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t('plots.namePlaceholder')} placeholderTextColor={theme.colors.textMuted} />

          <Text style={s.fieldLabel}>{t('plots.sizeAcres')}</Text>
          <TextInput style={s.input} value={acres} onChangeText={setAcres} keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={theme.colors.textMuted} />

          <Text style={s.fieldLabel}>{t('plots.soilType')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            {SOIL_TYPES.map((st) => (
              <TouchableOpacity key={st} style={[s.chip, soil === st && s.chipActive]} onPress={() => setSoil(st)}>
                <Text style={[s.chipText, soil === st && s.chipTextActive]}>{st}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={s.fieldLabel}>{t('plots.codeOptional')}</Text>
          <TextInput style={s.input} value={code} onChangeText={setCode} placeholder={t('plots.codePlaceholder')} placeholderTextColor={theme.colors.textMuted} />

          {error ? <Text style={s.error}>{t(error)}</Text> : null}
          <TouchableOpacity style={[s.primaryBtn, saving && s.btnDisabled]} disabled={saving} onPress={() => void save()}>
            <Text style={s.primaryBtnText}>{saving ? t('common.saving') : t('common.save')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PlotDetailModal({
  farmId,
  plot,
  onClose,
  onEdit,
  onDeleted,
}: {
  farmId: string;
  plot: PlotRecord;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const healthQuery = useQuery({
    queryKey: ['plot-health', farmId, plot.id],
    queryFn: () => mobileApi.getPlotHealthSnapshot(farmId, plot.id).catch(() => null as PlotHealthSnapshot | null),
  });
  const health = healthQuery.data ?? null;
  const riskLevel = (health?.risk_level ?? '').toUpperCase();
  const riskColor = RISK_COLOR[riskLevel] ?? theme.colors.textMuted;

  function confirmDelete() {
    Alert.alert(t('plots.deletePlot'), t('plots.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => { void mobileApi.deletePlot(farmId, plot.id).then(onDeleted).catch(() => undefined); },
      },
    ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.keyboardModal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={onClose}><View style={s.backdrop} /></TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '88%' }]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={s.handle} />
          <View style={s.rowBetween}>
            <Text style={s.sheetTitle}>{plot.name}</Text>
            <TouchableOpacity onPress={onEdit} hitSlop={8}><Ionicons name="create-outline" size={20} color={theme.colors.primary} /></TouchableOpacity>
          </View>

          <View style={[s.tagRow, { marginTop: 8 }]}>
            <View style={s.tag}><Text style={s.tagText}>{acresFromHa(plot.size_hectares) || '—'} {t('plots.acres')}</Text></View>
            {plot.soil_type ? <View style={s.tag}><Text style={s.tagText}>{plot.soil_type}</Text></View> : null}
          </View>

          {/* Plot-level health */}
          <Text style={s.sectionLabel}>{t('plots.fieldHealth')}</Text>
          {healthQuery.isLoading ? (
            <SkeletonCard />
          ) : health ? (
            <Card>
              <View style={s.rowBetween}>
                <Text style={s.cardTitle}>{t('plots.riskLevel')}</Text>
                <View style={[s.riskPill, { backgroundColor: riskColor + '22' }]}>
                  <Text style={[s.riskText, { color: riskColor }]}>{riskLevel || '—'}</Text>
                </View>
              </View>
              {health.actions?.slice(0, 4).map((a, i) => (
                <Text key={i} style={s.actionLine}>• {a.message}</Text>
              ))}
            </Card>
          ) : (
            <Card><Text style={s.muted}>{t('plots.noHealth')}</Text></Card>
          )}

          <TouchableOpacity
            style={[s.outlineBtn, { marginTop: 16 }]}
            onPress={() => { onClose(); router.push(`/farms/${farmId}` as never); }}
          >
            <Text style={s.outlineBtnText}>{t('plots.openDashboard')}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={confirmDelete} style={s.deleteBtn}>
            <Text style={s.deleteText}>{t('plots.deletePlot')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  content: { gap: 12, paddingTop: 6, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 12 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 14, color: theme.colors.textMuted },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  plotName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  defaultPill: { backgroundColor: '#e7f5ec', borderColor: '#c7e7d2', borderWidth: 1, borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  defaultPillText: { fontSize: 10, fontWeight: '700', color: theme.colors.primary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: theme.colors.border },
  tagText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: theme.colors.textMuted, textTransform: 'uppercase', marginTop: 16, marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  riskPill: { borderRadius: theme.radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  riskText: { fontSize: 11, fontWeight: '800' },
  actionLine: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19, marginTop: 4 },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  keyboardModal: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', backgroundColor: 'rgba(248, 247, 239, 0.96)', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginTop: 12 },
  input: { height: 46, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, paddingHorizontal: 14, fontSize: 14, color: theme.colors.text, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#eaf8ef' },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  chipTextActive: { color: theme.colors.primary },
  primaryBtn: { marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { backgroundColor: theme.colors.disabled },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  outlineBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 11, alignItems: 'center' },
  outlineBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  deleteBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 10 },
  deleteText: { color: theme.colors.danger, fontWeight: '700', fontSize: 14 },
  error: { color: theme.colors.danger, fontSize: 13, marginTop: 6 },
});
