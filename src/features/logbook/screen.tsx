import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mobileApi } from '@/lib/api/mobile';
import type { FarmRecord, JourneyRecord, LogImageRecord, LogRecord } from '@/lib/domain/types';
import { createId } from '@/lib/utils/id';
import { theme } from '@/lib/theme';

const OPERATION_TYPES = [
  'Scouting', 'Spraying', 'Fertilizing', 'Irrigation', 'Weeding', 'Tilling', 'Harvesting',
] as const;
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

type LogWithImages = LogRecord & {
  images?: { url: string; thumbnail_url?: string | null }[];
};
type FarmOption = { id: string; name: string; journeyId: string };
type EnrichedLog = LogWithImages & { farmName: string };

/** Best available thumbnail for a note (server thumb → full image → snapshot). */
function noteThumbUri(log: EnrichedLog): string | null {
  return (
    log.images?.[0]?.thumbnail_url || log.images?.[0]?.url || log.snapshot_url || null
  );
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function fmtDateTime(value?: string | null) {
  if (!value) return '';
  try {
    const d = parseISO(value);
    return `${format(d, 'MMM d')} · ${format(d, 'h:mm')}${format(d, 'a').toLowerCase()}`;
  } catch {
    return value;
  }
}

export function buildLogImageRecords(
  photos: ImagePicker.ImagePickerAsset[],
  input: { logId: string; timestamp: string },
) {
  return photos.map<LogImageRecord>((photo) => ({
    id: createId(),
    client_mutation_id: createId('mutation'),
    updated_at: input.timestamp,
    deleted_at: null,
    sync_status: 'pending',
    last_synced_at: null,
    log_id: input.logId,
    local_uri: photo.uri,
    remote_url: null,
    thumbnail_url: null,
    mime_type: photo.mimeType ?? null,
    width: photo.width ?? null,
    height: photo.height ?? null,
    taken_at: input.timestamp,
  }));
}

export function AddLogSheet({
  farmOptions,
  onClose,
  onSaved,
  lockedFarmId,
}: {
  farmOptions: FarmOption[];
  onClose: () => void;
  onSaved: () => void;
  lockedFarmId?: string;
}) {
  const insets = useSafeAreaInsets();
  const [farmId, setFarmId] = useState(lockedFarmId ?? farmOptions[0]?.id ?? '');
  const [opType, setOpType] = useState<OperationType>('Scouting');
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [isFarmMenuOpen, setIsFarmMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFarm =
    farmOptions.find((f) => f.id === farmId) ??
    (lockedFarmId ? farmOptions.find((f) => f.id === lockedFarmId) : undefined);

  async function addPhotosFromLibrary() {
    if (photos.length >= 3) {
      setError('You can attach up to 3 photos.');
      return;
    }

    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library permission is required to add images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: 3 - photos.length,
    });

    if (!result.canceled) {
      setPhotos((current) => [...current, ...result.assets].slice(0, 3));
    }
  }

  async function takePhoto() {
    if (photos.length >= 3) {
      setError('You can attach up to 3 photos.');
      return;
    }

    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotos((current) => [...current, result.assets[0]].slice(0, 3));
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
  }

  async function save() {
    if (!farmId || !selectedFarm) {
      setError('Choose a farm first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const logId = createId();
      const log: LogRecord = {
        id: logId,
        client_mutation_id: createId('mutation'),
        farm_id: farmId,
        journey_id: selectedFarm.journeyId,
        plot_id: null,
        operation_type: opType,
        date: now.slice(0, 10),
        cost: cost ? parseFloat(cost) : null,
        notes: notes.trim() || null,
        location_latitude: null,
        location_longitude: null,
        snapshot_url: null,
        updated_at: now,
        deleted_at: null,
        sync_status: 'pending',
        last_synced_at: null,
      };
      const images = buildLogImageRecords(photos, { logId, timestamp: now });
      await mobileApi.syncLog({ log, images });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={sheet.overlay}>
      <View style={[sheet.panel, { paddingBottom: insets.bottom + 20, paddingTop: insets.top + 8 }]}>
        <View style={sheet.shellHeader}>
          <Text style={sheet.shellTitle}>Notes</Text>
          <View style={sheet.shellActions}>
            <View style={sheet.shellIconButton}>
              <Ionicons name="person-circle-outline" size={18} color={theme.colors.text} />
            </View>
            <View style={sheet.shellIconBadge}>
              <Ionicons name="notifications-outline" size={17} color={theme.colors.text} />
              <View style={sheet.shellBadge}>
                <Text style={sheet.shellBadgeText}>9+</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={sheet.formHeader}>
          <TouchableOpacity onPress={onClose} style={sheet.backBtn}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.textMuted} />
            <Text style={sheet.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={sheet.headerTitle}>New Note</Text>
          <TouchableOpacity onPress={() => void save()} disabled={saving} style={[sheet.saveBtn, saving && sheet.saveBtnDisabled]}>
            <Text style={sheet.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
          <View style={sheet.body}>
            <View style={sheet.field}>
              <Text style={sheet.fieldLabel}>IMAGES</Text>
              <Text style={sheet.fieldHint}>Attach up to 3 photos to this log.</Text>
              <View style={sheet.imageActionRow}>
                <TouchableOpacity style={sheet.imageActionButton} onPress={() => void addPhotosFromLibrary()}>
                  <Ionicons name="images-outline" size={18} color={theme.colors.text} />
                  <Text style={sheet.imageActionText}>Add Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={sheet.imageActionButton} onPress={() => void takePhoto()}>
                  <Ionicons name="camera-outline" size={18} color={theme.colors.text} />
                  <Text style={sheet.imageActionText}>Take Photo</Text>
                </TouchableOpacity>
              </View>

              {photos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sheet.photoRow}>
                  {photos.map((photo, index) => (
                    <View key={`${photo.uri}-${index}`} style={sheet.photoCard}>
                      <Image source={{ uri: photo.uri }} style={sheet.photoThumb} />
                      <TouchableOpacity style={sheet.photoRemove} onPress={() => removePhoto(index)}>
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            {!lockedFarmId ? (
              <View style={sheet.field}>
                <Text style={sheet.fieldSubLabel}>Farm</Text>
                <TouchableOpacity
                  style={sheet.selectField}
                  onPress={() => setIsFarmMenuOpen((current) => !current)}
                  activeOpacity={0.85}
                >
                  <Text style={[sheet.selectFieldText, !selectedFarm && sheet.selectPlaceholder]}>
                    {selectedFarm?.name ?? 'Choose farm'}
                  </Text>
                  <Ionicons name={isFarmMenuOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>

                {isFarmMenuOpen ? (
                  <View style={sheet.dropdownMenu}>
                    {farmOptions.map((f) => (
                      <TouchableOpacity
                        key={f.id}
                        style={sheet.dropdownItem}
                        onPress={() => {
                          setFarmId(f.id);
                          setIsFarmMenuOpen(false);
                        }}
                      >
                        <Text style={[sheet.dropdownItemText, farmId === f.id && sheet.dropdownItemTextActive]}>{f.name}</Text>
                        {farmId === f.id ? (
                          <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={sheet.field}>
              <Text style={sheet.fieldSubLabel}>Activity</Text>
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

            <View style={sheet.field}>
              <Text style={sheet.fieldSubLabel}>Notes</Text>
              <TextInput
                style={sheet.textarea}
                placeholder="What did you do? Any observations..."
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={sheet.field}>
              <Text style={sheet.fieldSubLabel}>Cost (optional)</Text>
              <TextInput
                style={sheet.input}
                placeholder="0 TZS"
                placeholderTextColor={theme.colors.textMuted}
                value={cost}
                onChangeText={setCost}
                keyboardType="decimal-pad"
              />
            </View>

            {error ? <Text style={sheet.error}>{error}</Text> : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export function LogbookScreen() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['logbook-online'],
    queryFn: async () => {
      const farms = asArray<FarmRecord>(await mobileApi.listFarms().catch(() => []));

      const results = await Promise.all(
        farms.map(async (farm) => {
          const journeys = asArray<JourneyRecord>(
            await mobileApi.listFarmJourneys(String(farm.id)).catch(() => []),
          );
          const activeJourney =
            journeys.find((j) => j.status === 'active') ?? journeys[0] ?? null;
          if (!activeJourney) {
            return { farm, journey: null as JourneyRecord | null, logs: [] as LogRecord[] };
          }
          const logs = asArray<LogWithImages>(
            await mobileApi
              .listJourneyLogs(String(farm.id), String(activeJourney.id))
              .catch(() => []),
          );
          return { farm, journey: activeJourney, logs };
        }),
      );

      const allLogs: EnrichedLog[] = results
        .flatMap(({ farm, logs }) =>
          logs.map((log) => ({ ...log, farmName: farm.name ?? 'Farm' })),
        )
        .sort((a, b) => b.date.localeCompare(a.date));

      const farmOptions: FarmOption[] = results
        .filter((r) => r.journey != null)
        .map((r) => ({
          id: String(r.farm.id),
          name: r.farm.name ?? 'Farm',
          journeyId: r.journey!.id,
        }));

      return { farmOptions, logs: allLogs };
    },
  });

  async function onSaved() {
    setShowAdd(false);
    await queryClient.invalidateQueries({ queryKey: ['logbook-online'] });
  }

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.pageHeader, { paddingTop: insets.top + 8 }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.pageTitle}>Notes</Text>
            <Text style={s.pageMeta}>{data?.logs.length ?? 0} notes</Text>
          </View>
        </View>

        {isLoading ? (
          <View style={s.centerState}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={s.loadingText}>Loading notes…</Text>
          </View>
        ) : isError ? (
          <View style={s.emptyState}>
            <Ionicons name="cloud-offline-outline" size={40} color={theme.colors.textMuted} />
            <Text style={s.emptyTitle}>Could not load notes</Text>
            <Text style={s.emptyText}>Check your connection and try again.</Text>
          </View>
        ) : !data?.logs.length ? (
          <View style={s.emptyState}>
            <Ionicons name="document-text-outline" size={40} color={theme.colors.textMuted} />
            <Text style={s.emptyTitle}>No notes yet</Text>
            <Text style={s.emptyText}>
              Tap + to add your first note — what you did, observed, or harvested.
            </Text>
          </View>
        ) : (
          <View style={s.logList}>
            <Text style={s.listLabel}>RECENT NOTES · {data.logs.length}</Text>
            {data.logs.map((log) => {
              const opIcon = OP_ICONS[log.operation_type as OperationType] ?? 'document-text-outline';
              const thumb = noteThumbUri(log);
              return (
                <TouchableOpacity
                  key={log.id}
                  style={s.noteCard}
                  activeOpacity={0.7}
                  onPress={() =>
                    router.push({
                      pathname: '/notes/[logId]',
                      params: { logId: log.id, payload: JSON.stringify(log) },
                    } as never)
                  }
                >
                  {thumb ? (
                    <Image source={{ uri: thumb }} style={s.noteThumb} />
                  ) : (
                    <View style={s.noteThumbFallback}>
                      <Ionicons name={opIcon} size={26} color={theme.colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.noteTime}>{fmtDateTime(log.updated_at || log.date)}</Text>
                    <Text style={s.noteText} numberOfLines={2}>
                      {log.notes?.trim() || log.operation_type}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[s.fab, { bottom: insets.bottom + 24 }]}
        onPress={() => setShowAdd(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {showAdd && data?.farmOptions ? (
        <AddLogSheet
          farmOptions={data.farmOptions}
          onClose={() => setShowAdd(false)}
          onSaved={() => void onSaved()}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f4f0e7',
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  pageHeader: {
    gap: 4,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
  },
  pageMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  loadingText: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  listLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: theme.colors.textMuted,
  },
  logList: {
    gap: 6,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
  },
  noteThumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#ebe4d4',
  },
  noteThumbFallback: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#f0f7f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d8ead2',
  },
  noteTime: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 19,
    color: theme.colors.textMuted,
  },
  logCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#fbfaf6',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eadfcb',
  },
  logIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#f0f7f2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: '#d8ead2',
  },
  logCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  logFarm: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
  },
  logDate: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  logBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#d8ead2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#f0f7f2',
  },
  logBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  logNotes: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 17,
  },
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
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: '#f7f4ec' },
  panel: {
    flex: 1,
    backgroundColor: '#f4f0e7',
  },
  shellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd7c9',
  },
  shellTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.colors.text,
  },
  shellActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  shellIconButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shellIconBadge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shellBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  shellBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e1ddcf',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backText: { fontSize: 14, fontWeight: '500', color: theme.colors.textMuted },
  headerTitle: { fontSize: 24, fontWeight: '700', color: theme.colors.text },
  saveBtn: {
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 20,
    backgroundColor: '#91d4a9',
    paddingHorizontal: 18,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  body: { paddingHorizontal: 16, paddingBottom: 12, gap: 22 },
  field: { gap: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2, color: theme.colors.textMuted },
  fieldHint: { fontSize: 14, color: theme.colors.textMuted },
  fieldSubLabel: { fontSize: 14, color: theme.colors.text },

  imageActionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  imageActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#ddd7c9',
    backgroundColor: '#fbfaf6',
    paddingHorizontal: 14,
  },
  imageActionText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  photoRow: { gap: 10 },
  photoCard: {
    position: 'relative',
    width: 88,
    height: 88,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ddd7c9',
    backgroundColor: '#ebe4d4',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectField: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#ddd7c9',
    backgroundColor: '#fbfaf6',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectFieldText: {
    fontSize: 15,
    color: theme.colors.text,
  },
  selectPlaceholder: {
    color: theme.colors.textMuted,
  },
  dropdownMenu: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ddd7c9',
    backgroundColor: '#fbfaf6',
    overflow: 'hidden',
  },
  dropdownItem: {
    minHeight: 46,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ece5d7',
  },
  dropdownItemText: {
    fontSize: 15,
    color: theme.colors.text,
  },
  dropdownItemTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },

  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e1ddcf',
    backgroundColor: '#fbfaf6',
  },
  pillActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '14' },
  pillText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  pillTextActive: { color: theme.colors.primary },

  opGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd7c9',
    backgroundColor: '#fbfaf6',
  },
  opPillActive: { borderColor: '#91d4a9', backgroundColor: '#eaf8ef' },
  opPillText: { fontSize: 15, fontWeight: '500', color: theme.colors.textMuted },
  opPillTextActive: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },

  textarea: {
    borderWidth: 1,
    borderColor: '#ddd7c9',
    borderRadius: 24,
    backgroundColor: '#fbfaf6',
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 126,
    textAlignVertical: 'top',
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#ddd7c9',
    borderRadius: 26,
    backgroundColor: '#fbfaf6',
    paddingHorizontal: 18,
    fontSize: 15,
    color: theme.colors.text,
  },
  error: { color: '#d43c2e', fontSize: 13 },
});
