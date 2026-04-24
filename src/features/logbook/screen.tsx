import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/core/button';
import { EmptyState } from '@/components/state/empty-state';
import { SyncBanner } from '@/components/state/sync-banner';
import { farmRepository, logRepository } from '@/lib/db/repositories';
import { queueLogSync } from '@/lib/sync/engine';
import { theme } from '@/lib/theme';

// ─── Operation types ──────────────────────────────────────────────────────────

const OPERATION_TYPES = ['Scouting', 'Spraying', 'Fertilizing', 'Irrigation', 'Weeding', 'Tilling', 'Harvesting'] as const;
type OperationType = typeof OPERATION_TYPES[number];

const OP_ICONS: Record<OperationType, React.ComponentProps<typeof Ionicons>['name']> = {
  Scouting: 'eye-outline',
  Spraying: 'water-outline',
  Fertilizing: 'leaf-outline',
  Irrigation: 'rainy-outline',
  Weeding: 'cut-outline',
  Tilling: 'construct-outline',
  Harvesting: 'basket-outline',
};

// ─── Add-log sheet ─────────────────────────────────────────────────────────────

function AddLogSheet({
  farms,
  onClose,
  onSaved,
}: {
  farms: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [farmId, setFarmId] = useState(farms[0]?.id ?? '');
  const [opType, setOpType] = useState<OperationType>('Scouting');
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      quality: 0.8,
      mediaTypes: ['images'],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setImages((c) => [...c, result.assets[0].uri]);
    }
  }

  async function save() {
    if (!farmId) { setError('Choose a farm first.'); return; }
    setSaving(true); setError(null);
    try {
      const result = await logRepository.createOfflineLog({
        farm_id: farmId,
        operation_type: opType,
        date: new Date().toISOString().slice(0, 10),
        cost: cost ? Number(cost) : null,
        notes: notes.trim() || null,
        images: images.map((uri) => ({ local_uri: uri })),
      });
      await queueLogSync(result.log);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[sheet.overlay]}>
      <TouchableOpacity style={sheet.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[sheet.panel, { paddingBottom: insets.bottom + 16 }]}>
        {/* Handle */}
        <View style={sheet.handle} />

        {/* Header */}
        <View style={sheet.header}>
          <TouchableOpacity onPress={onClose} style={sheet.backBtn}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.textMuted} />
            <Text style={sheet.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={sheet.headerTitle}>New log</Text>
          <TouchableOpacity onPress={() => void save()} disabled={saving} style={sheet.saveBtn}>
            <Text style={[sheet.saveBtnText, saving && { opacity: 0.5 }]}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
          <View style={sheet.body}>

            {/* Farm selector */}
            {farms.length > 1 && (
              <View style={sheet.field}>
                <Text style={sheet.fieldLabel}>FARM</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sheet.pillRow}>
                  {farms.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={[sheet.pill, farmId === f.id && sheet.pillActive]}
                      onPress={() => setFarmId(f.id)}
                    >
                      <Text style={[sheet.pillText, farmId === f.id && sheet.pillTextActive]}>{f.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Operation type */}
            <View style={sheet.field}>
              <Text style={sheet.fieldLabel}>OPERATION</Text>
              <View style={sheet.opGrid}>
                {OPERATION_TYPES.map((op) => (
                  <TouchableOpacity
                    key={op}
                    style={[sheet.opPill, opType === op && sheet.opPillActive]}
                    onPress={() => setOpType(op)}
                  >
                    <Ionicons
                      name={OP_ICONS[op]}
                      size={14}
                      color={opType === op ? theme.colors.primary : theme.colors.textMuted}
                    />
                    <Text style={[sheet.opPillText, opType === op && sheet.opPillTextActive]}>{op}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Notes */}
            <View style={sheet.field}>
              <Text style={sheet.fieldLabel}>NOTES</Text>
              <TextInput
                style={sheet.textarea}
                placeholder="What happened in the field?"
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Cost */}
            <View style={sheet.field}>
              <Text style={sheet.fieldLabel}>COST (TZS)</Text>
              <TextInput
                style={sheet.input}
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
                value={cost}
                onChangeText={setCost}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Images */}
            <View style={sheet.field}>
              <TouchableOpacity style={sheet.attachBtn} onPress={() => void pickImage()}>
                <Ionicons name="camera-outline" size={16} color={theme.colors.primary} />
                <Text style={sheet.attachText}>
                  {images.length > 0 ? `${images.length} image(s) attached` : 'Attach image'}
                </Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={sheet.error}>{error}</Text> : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function LogbookScreen() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);

  const { data } = useQuery({
    queryKey: ['logbook-screen'],
    queryFn: async () => {
      const [farms, logs] = await Promise.all([farmRepository.listFarms(), logRepository.listLogs()]);
      return { farms, logs };
    },
  });

  async function onSaved() {
    setShowAdd(false);
    await queryClient.invalidateQueries({ queryKey: ['logbook-screen'] });
    await queryClient.invalidateQueries({ queryKey: ['home-dashboard'] });
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SyncBanner />

        {/* Header */}
        <View style={s.pageHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.pageTitle}>Field log</Text>
            <Text style={s.pageMeta}>Offline capture · syncs when network returns</Text>
          </View>
        </View>

        {/* Log list */}
        {!data?.logs.length ? (
          <EmptyState
            title="No field logs yet"
            description="Tap + to capture scouting, spraying, irrigation, or harvest notes."
          />
        ) : (
          <View style={s.logList}>
            <Text style={s.listLabel}>RECENT LOGS</Text>
            {data.logs.map((log) => (
              <View key={log.id} style={s.logCard}>
                <View style={s.logIconWrap}>
                  <Ionicons
                    name={OP_ICONS[log.operation_type as OperationType] ?? 'document-outline'}
                    size={20}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={s.logCardTop}>
                    <Text style={s.logTitle}>{log.operation_type}</Text>
                    <Text style={s.logDate}>{log.date}</Text>
                  </View>
                  <View style={s.logBadge}>
                    <Ionicons name={OP_ICONS[log.operation_type as OperationType] ?? 'document-outline'} size={11} color={theme.colors.textMuted} />
                    <Text style={s.logBadgeText}>{log.operation_type}</Text>
                  </View>
                  {log.notes ? <Text style={s.logNotes} numberOfLines={2}>{log.notes}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[s.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setShowAdd(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add sheet */}
      {showAdd && data?.farms ? (
        <AddLogSheet
          farms={data.farms}
          onClose={() => setShowAdd(false)}
          onSaved={() => void onSaved()}
        />
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  content: { padding: theme.spacing.lg, gap: theme.spacing.lg },

  pageHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  pageMeta: { fontSize: 13, color: theme.colors.textMuted },

  listLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: theme.colors.textMuted },
  logList: { gap: 10 },
  logCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  logIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  logCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  logTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text, flex: 1 },
  logDate: { fontSize: 12, color: theme.colors.textMuted },
  logBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  logBadgeText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  logNotes: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },

  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});

const sheet = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backText: { fontSize: 14, fontWeight: '500', color: theme.colors.textMuted },
  headerTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  saveBtn: { minWidth: 60, alignItems: 'flex-end' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },

  body: { padding: 16, gap: 20 },
  field: { gap: 10 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: theme.colors.textMuted },

  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pillActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '14' },
  pillText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  pillTextActive: { color: theme.colors.primary },

  opGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  opPillActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '14' },
  opPillText: { fontSize: 13, fontWeight: '500', color: theme.colors.textMuted },
  opPillTextActive: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },

  textarea: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: theme.colors.text,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    fontSize: 14,
    color: theme.colors.text,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignSelf: 'flex-start',
  },
  attachText: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  error: { color: theme.colors.danger, fontSize: 13 },
});
