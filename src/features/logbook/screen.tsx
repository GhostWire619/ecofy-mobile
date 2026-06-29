import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SkeletonCard } from '@/components/state/skeleton';
import { mobileApi } from '@/lib/api/mobile';
import { farmRepository } from '@/lib/db/repositories';
import type { FarmRecord, JourneyRecord, LogImageRecord, LogRecord, PlotRecord } from '@/lib/domain/types';
import { createId } from '@/lib/utils/id';
import { toAbsoluteUrl } from '@/lib/utils/url';
import { useI18n } from '@/lib/i18n';
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
// journeyId is null when the farm has no active/planned journey — such farms are
// shown but not loggable (the backend requires a journey to attach a note to).
type FarmOption = { id: string; name: string; journeyId: string | null };
type EnrichedLog = LogWithImages & { farmName: string };

/** Best available thumbnail for a note (server thumb → full image → snapshot). */
function noteThumbUri(log: EnrichedLog): string | null {
  const raw =
    log.images?.[0]?.thumbnail_url || log.images?.[0]?.url || log.snapshot_url || null;
  // Server image URLs are root-relative (/uploads/...) — resolve to absolute so <Image> can load them.
  return toAbsoluteUrl(raw) ?? null;
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

/** First farm that can actually take a note (has an active/planned journey). */
function firstLoggableFarmId(options: FarmOption[]): string {
  return options.find((f) => f.journeyId)?.id ?? options[0]?.id ?? '';
}

export function AddLogSheet({
  farmOptions,
  onClose,
  onSaved,
  lockedFarmId,
  defaultFarmId,
}: {
  farmOptions: FarmOption[];
  onClose: () => void;
  onSaved: () => void;
  lockedFarmId?: string;
  /** The farmer's active farm — preselected if it can take a note. */
  defaultFarmId?: string | null;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  // Prefer the active farm (if loggable), else the first loggable farm.
  const initialFarmId = (() => {
    if (lockedFarmId) return lockedFarmId;
    const active = farmOptions.find((f) => f.id === defaultFarmId && f.journeyId);
    return active?.id ?? firstLoggableFarmId(farmOptions);
  })();
  const [farmId, setFarmId] = useState(initialFarmId);
  const [opType, setOpType] = useState<OperationType>('Scouting');
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [plotId, setPlotId] = useState<string | null>(null);
  const [dateOffset, setDateOffset] = useState(0); // days back from today
  const [isFarmMenuOpen, setIsFarmMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plots for the chosen farm — lets a note be pinned to a specific field.
  const plotsQuery = useQuery({
    queryKey: ['log-plots', farmId],
    queryFn: () => mobileApi.listFarmPlots(farmId).catch(() => [] as PlotRecord[]),
    enabled: !!farmId,
  });
  const plots = plotsQuery.data ?? [];

  const selectedFarm =
    farmOptions.find((f) => f.id === farmId) ??
    (lockedFarmId ? farmOptions.find((f) => f.id === lockedFarmId) : undefined);

  async function addPhotosFromLibrary() {
    if (photos.length >= 3) {
      setError('logbook.errMaxPhotos');
      return;
    }

    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('logbook.errPhotoPerm');
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
      setError('logbook.errMaxPhotos');
      return;
    }

    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('logbook.errCameraPerm');
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
      setError('logbook.errChooseFarm');
      return;
    }
    if (!selectedFarm.journeyId) {
      // Backend attaches every note to a journey — block the save with a clear
      // reason instead of letting it fail with a 409.
      setError('logbook.errFarmNoJourney');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const when = new Date();
      when.setDate(when.getDate() - dateOffset);
      const logId = createId();
      const log: LogRecord = {
        id: logId,
        client_mutation_id: createId('mutation'),
        farm_id: farmId,
        journey_id: selectedFarm.journeyId,
        plot_id: plotId,
        operation_type: opType,
        date: when.toISOString().slice(0, 10),
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
      setError(err instanceof Error ? err.message : 'logbook.errSaveFailed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={sheet.overlay}>
      <View style={[sheet.panel, { paddingBottom: insets.bottom + 12 }]}>
        <View style={sheet.formHeader}>
          <TouchableOpacity onPress={onClose} style={sheet.backBtn}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.textMuted} />
            <Text style={sheet.backText}>{t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={sheet.headerTitle}>{t('logbook.newNote')}</Text>
          <TouchableOpacity onPress={() => void save()} disabled={saving} style={[sheet.saveBtn, saving && sheet.saveBtnDisabled]}>
            <Text style={sheet.saveBtnText}>{saving ? t('common.saving') : t('common.save')}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
          <View style={sheet.body}>
            <View style={sheet.field}>
              <Text style={sheet.fieldLabel}>{t('logbook.images')}</Text>
              <Text style={sheet.fieldHint}>{t('logbook.attachUpTo3')}</Text>
              <View style={sheet.imageActionRow}>
                <TouchableOpacity style={sheet.imageActionButton} onPress={() => void addPhotosFromLibrary()}>
                  <Ionicons name="images-outline" size={18} color={theme.colors.text} />
                  <Text style={sheet.imageActionText}>{t('logbook.addPhoto')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={sheet.imageActionButton} onPress={() => void takePhoto()}>
                  <Ionicons name="camera-outline" size={18} color={theme.colors.text} />
                  <Text style={sheet.imageActionText}>{t('logbook.takePhoto')}</Text>
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
                <Text style={sheet.fieldSubLabel}>{t('common.farm')}</Text>
                <TouchableOpacity
                  style={sheet.selectField}
                  onPress={() => setIsFarmMenuOpen((current) => !current)}
                  activeOpacity={0.85}
                >
                  <Text style={[sheet.selectFieldText, !selectedFarm && sheet.selectPlaceholder]}>
                    {selectedFarm?.name ?? t('logs.chooseFarm')}
                  </Text>
                  <Ionicons name={isFarmMenuOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>

                {isFarmMenuOpen ? (
                  <View style={sheet.dropdownMenu}>
                    {/* Loggable farms first; journey-less farms are shown but disabled. */}
                    {[...farmOptions]
                      .sort((a, b) => Number(Boolean(b.journeyId)) - Number(Boolean(a.journeyId)))
                      .map((f) => {
                        const loggable = Boolean(f.journeyId);
                        return (
                          <TouchableOpacity
                            key={f.id}
                            style={[sheet.dropdownItem, !loggable && sheet.dropdownItemDisabled]}
                            disabled={!loggable}
                            onPress={() => {
                              setFarmId(f.id);
                              setPlotId(null);
                              setError(null);
                              setIsFarmMenuOpen(false);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  sheet.dropdownItemText,
                                  farmId === f.id && sheet.dropdownItemTextActive,
                                  !loggable && sheet.dropdownItemTextDisabled,
                                ]}
                              >
                                {f.name}
                              </Text>
                              {!loggable ? (
                                <Text style={sheet.dropdownItemHint}>{t('logbook.farmNeedsJourney')}</Text>
                              ) : null}
                            </View>
                            {loggable && farmId === f.id ? (
                              <Ionicons name="checkmark" size={16} color={theme.colors.primary} />
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                ) : null}
                {farmOptions.some((f) => !f.journeyId) ? (
                  <Text style={sheet.fieldHint}>{t('logbook.startJourneyToLogHint')}</Text>
                ) : null}
              </View>
            ) : null}

            <View style={sheet.field}>
              <Text style={sheet.fieldSubLabel}>{t('logs.activity')}</Text>
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
                    <Text style={[sheet.opPillText, opType === op && sheet.opPillTextActive]}>
                      {t(`operations.${op.toLowerCase()}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {plots.length > 0 ? (
              <View style={sheet.field}>
                <Text style={sheet.fieldSubLabel}>{t('logs.plot')}</Text>
                <View style={sheet.opGrid}>
                  <TouchableOpacity
                    style={[sheet.opPill, !plotId && sheet.opPillActive]}
                    onPress={() => setPlotId(null)}
                  >
                    <Text style={[sheet.opPillText, !plotId && sheet.opPillTextActive]}>{t('logs.wholeFarm')}</Text>
                  </TouchableOpacity>
                  {plots.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[sheet.opPill, plotId === p.id && sheet.opPillActive]}
                      onPress={() => setPlotId(p.id)}
                    >
                      <Text style={[sheet.opPillText, plotId === p.id && sheet.opPillTextActive]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={sheet.field}>
              <Text style={sheet.fieldSubLabel}>{t('logs.when')}</Text>
              <View style={sheet.opGrid}>
                {[0, 1, 2].map((off) => (
                  <TouchableOpacity
                    key={off}
                    style={[sheet.opPill, dateOffset === off && sheet.opPillActive]}
                    onPress={() => setDateOffset(off)}
                  >
                    <Text style={[sheet.opPillText, dateOffset === off && sheet.opPillTextActive]}>
                      {off === 0 ? t('common.today') : off === 1 ? t('common.yesterday') : t('logs.daysAgo', { n: off })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={sheet.field}>
              <Text style={sheet.fieldSubLabel}>{t('logbook.notes')}</Text>
              <TextInput
                style={sheet.textarea}
                placeholder={t('logs.notesPlaceholder')}
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <View style={sheet.field}>
              <Text style={sheet.fieldSubLabel}>{t('logs.costOptional')}</Text>
              <TextInput
                style={sheet.input}
                placeholder="0 TZS"
                placeholderTextColor={theme.colors.textMuted}
                value={cost}
                onChangeText={setCost}
                keyboardType="decimal-pad"
              />
            </View>

            {error ? <Text style={sheet.error}>{t(error)}</Text> : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export function LogbookScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['logbook-online'],
    queryFn: async () => {
      const activeFarmId = await farmRepository.getSelectedFarmId().catch(() => null);
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

      // Every farm is listed so the farmer never wonders where a farm went; ones
      // without an active/planned journey carry journeyId=null and render disabled.
      const farmOptions: FarmOption[] = results.map((r) => ({
        id: String(r.farm.id),
        name: r.farm.name ?? 'Farm',
        journeyId:
          r.journey && (r.journey.status === 'active' || r.journey.status === 'planned')
            ? String(r.journey.id)
            : null,
      }));

      return { farmOptions, logs: allLogs, activeFarmId: activeFarmId ?? null };
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
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <View style={{ gap: 12 }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : isError ? (
          <View style={s.emptyState}>
            <Ionicons name="cloud-offline-outline" size={40} color={theme.colors.textMuted} />
            <Text style={s.emptyTitle}>{t('logbook.couldNotLoad')}</Text>
            <Text style={s.emptyText}>{t('logbook.checkConnection')}</Text>
          </View>
        ) : !data?.logs.length ? (
          <View style={s.emptyState}>
            <Ionicons name="document-text-outline" size={40} color={theme.colors.textMuted} />
            <Text style={s.emptyTitle}>{t('logbook.noNotesYet')}</Text>
            <Text style={s.emptyText}>{t('logbook.noNotesDesc')}</Text>
          </View>
        ) : (
          <View style={s.logList}>
            <Text style={s.listLabel}>{t('logbook.recentNotes')} · {data.logs.length}</Text>
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
          defaultFarmId={data.activeFarmId}
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
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
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
    gap: 8,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    backgroundColor: theme.colors.surface,
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
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: theme.colors.background },
  panel: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  shellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
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
    paddingTop: 8,
    paddingBottom: 10,
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
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 56 },
  backText: { fontSize: 13, fontWeight: '500', color: theme.colors.textMuted },
  headerTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  saveBtn: {
    minWidth: 66,
    alignItems: 'center',
    justifyContent: 'center',
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  body: { paddingHorizontal: 16, paddingBottom: 10, gap: 16 },
  field: { gap: 7 },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: theme.colors.textMuted },
  fieldHint: { fontSize: 12, color: theme.colors.textMuted },
  fieldSubLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.text },

  imageActionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  imageActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
  },
  imageActionText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  photoRow: { gap: 10 },
  photoCard: {
    position: 'relative',
    width: 88,
    height: 88,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectFieldText: {
    fontSize: 13,
    color: theme.colors.text,
  },
  selectPlaceholder: {
    color: theme.colors.textMuted,
  },
  dropdownMenu: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
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
  dropdownItemDisabled: { opacity: 0.55 },
  dropdownItemText: {
    fontSize: 15,
    color: theme.colors.text,
  },
  dropdownItemTextActive: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  dropdownItemTextDisabled: { color: theme.colors.textMuted },
  dropdownItemHint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },

  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e1ddcf',
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
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  opPillActive: { borderColor: theme.colors.primary, backgroundColor: '#eaf8ef' },
  opPillText: { fontSize: 13, fontWeight: '500', color: theme.colors.textMuted },
  opPillTextActive: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },

  textarea: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: theme.colors.text,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  input: {
    height: 46,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 23,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    fontSize: 13,
    color: theme.colors.text,
  },
  error: { color: '#d43c2e', fontSize: 13 },
});
