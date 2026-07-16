import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { format, parseISO } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SkeletonCard } from '@/components/state/skeleton';
import { activitiesForMode, getActivity, type ActivityMode } from '@/features/logbook/activity-registry';
import { activitiesApi } from '@/lib/api/activities';
import { salesApi } from '@/lib/api/finance';
import { mobileApi } from '@/lib/api/mobile';
import { equipmentApi, inventoryApi } from '@/lib/api/resources';
import { workersApi } from '@/lib/api/workers';
import type { FarmRecord, JourneyRecord, LogImageRecord, LogRecord, PlotRecord } from '@/lib/domain/types';
import { useActiveFarmSelection } from '@/lib/hooks/use-active-farm';
import { createId } from '@/lib/utils/id';
import { toAbsoluteUrl } from '@/lib/utils/url';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

type LogFilter = 'all' | 'work' | 'expenses';

function isLegacyDemoLog(log: LogRecord): boolean {
  return (
    log.operation_type?.trim().toLowerCase() === 'fertilizing' &&
    log.notes?.trim().toLowerCase() === 'applied fertilizer to the farm' &&
    Number(log.cost) === 99944
  );
}

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
  const { t, locale } = useI18n();
  // Prefer the active farm (if loggable), else the first loggable farm.
  const initialFarmId = (() => {
    if (lockedFarmId) return lockedFarmId;
    const active = farmOptions.find((f) => f.id === defaultFarmId && f.journeyId);
    return active?.id ?? firstLoggableFarmId(farmOptions);
  })();
  const [farmId, setFarmId] = useState(initialFarmId);
  const [mode, setMode] = useState<ActivityMode>('work');
  const [activityId, setActivityId] = useState('scouting');
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [plotId, setPlotId] = useState<string | null>(null);
  const [activityDate, setActivityDate] = useState(new Date());
  const [isFarmMenuOpen, setIsFarmMenuOpen] = useState(false);
  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [inputItemId, setInputItemId] = useState('');
  const [inputQty, setInputQty] = useState('');
  const [newInputName, setNewInputName] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [equipmentLitres, setEquipmentLitres] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [newBuyerName, setNewBuyerName] = useState('');
  const [yieldQty, setYieldQty] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Plots for the chosen farm — lets a note be pinned to a specific field.
  const plotsQuery = useQuery({
    queryKey: ['log-plots', farmId],
    queryFn: () => mobileApi.listFarmPlots(farmId).catch(() => [] as PlotRecord[]),
    enabled: !!farmId,
  });
  const plots = plotsQuery.data ?? [];
  const activity = getActivity(activityId);
  const needsWorkers = activity.entities.includes('workers');
  const needsInput = activity.entities.includes('input');
  const needsEquipment = activity.entities.includes('equipment');
  const needsBuyer = activity.entities.includes('buyer');
  const needsYield = activity.entities.includes('yield');

  const workersQuery = useQuery({ queryKey: ['activity-workers', farmId], queryFn: () => workersApi.list(farmId), enabled: Boolean(farmId && needsWorkers) });
  const inventoryQuery = useQuery({ queryKey: ['activity-inventory', farmId], queryFn: () => inventoryApi.list(farmId), enabled: Boolean(farmId && needsInput) });
  const equipmentQuery = useQuery({ queryKey: ['activity-equipment', farmId], queryFn: () => equipmentApi.list(farmId), enabled: Boolean(farmId && needsEquipment) });
  const buyersQuery = useQuery({ queryKey: ['activity-buyers', farmId], queryFn: () => salesApi.listBuyers(farmId), enabled: Boolean(farmId && needsBuyer) });

  useEffect(() => {
    const firstPlotId = plotsQuery.data?.[0]?.id;
    if (!plotId && firstPlotId) setPlotId(String(firstPlotId));
  }, [plotId, plotsQuery.data]);

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

  function changeMode(nextMode: ActivityMode) {
    setMode(nextMode);
    setActivityId(activitiesForMode(nextMode)[0]?.id ?? 'scouting');
    setCrewIds([]);
    setInputItemId('');
    setEquipmentId('');
    setBuyerId('');
  }

  function onDateChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type !== 'dismissed' && date) setActivityDate(date);
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
    if (!plotId) {
      setError('Choose a plot before saving this activity.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const images: { url: string }[] = [];
      for (const photo of photos) {
        const uploaded = await mobileApi.uploadImage(photo.uri, photo.mimeType ?? 'image/jpeg', 'logs');
        if (uploaded?.url) images.push({ url: uploaded.url });
      }
      const amount = Math.max(0, Math.round(Number(cost) || 0));
      const selectedInput = inventoryQuery.data?.find((item) => item.id === inputItemId);
      await activitiesApi.create(farmId, {
        operation_type: activity.id,
        plot_id: plotId,
        journey_id: selectedFarm.journeyId,
        date: activityDate.toISOString().slice(0, 10),
        cost: amount,
        notes: notes.trim() || null,
        images,
        crew: needsWorkers ? crewIds.map((id) => ({ id })) : undefined,
        crew_total: needsWorkers && amount > 0 ? amount : undefined,
        input: needsInput && (inputItemId || newInputName.trim()) ? {
          item_id: inputItemId && inputItemId !== '__new__' ? inputItemId : undefined,
          item_name: inputItemId === '__new__' ? newInputName.trim() : undefined,
          quantity: Math.max(0, Number(inputQty) || 0),
          unit_cost: selectedInput?.unit_cost ?? undefined,
        } : undefined,
        equipment: needsEquipment && equipmentId ? {
          equipment_id: equipmentId,
          litres: activity.id === 'equipment_fuel' ? Math.max(0, Number(equipmentLitres) || 0) : undefined,
        } : undefined,
        sale: needsBuyer ? {
          buyer_id: buyerId && buyerId !== '__new__' ? buyerId : undefined,
          buyer_name: buyerId === '__new__' ? newBuyerName.trim() : undefined,
          quantity: Math.max(0, Number(yieldQty) || 0) || undefined,
          amount_received: amountReceived.trim() ? Math.max(0, Math.round(Number(amountReceived) || 0)) : undefined,
        } : undefined,
        yield_qty: needsYield && !needsBuyer ? Math.max(0, Number(yieldQty) || 0) || undefined : undefined,
      }, createId('activity'));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'logbook.errSaveFailed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={sheet.panel} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={sheet.panel} edges={['top', 'bottom']}>
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

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets style={{ flex: 1 }}>
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
              <Text style={sheet.fieldSubLabel}>{t('activityComposer.recording')}</Text>
              <View style={sheet.modeControl}>
                {(['work', 'buy', 'income'] as const).map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[sheet.modeOption, mode === item && sheet.modeOptionActive]}
                    onPress={() => changeMode(item)}
                  >
                    <Text style={[sheet.modeOptionText, mode === item && sheet.modeOptionTextActive]}>
                      {t(`activityComposer.mode.${item}`)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={sheet.selectionRow} onPress={() => setShowActivityPicker(true)}>
                <View style={sheet.selectionIcon}>
                  <Ionicons name={activity.icon} size={19} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sheet.selectionLabel}>{t('logs.activity')}</Text>
                  <Text style={sheet.selectionValue}>{t(`operations.${activity.id}`)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {plots.length > 0 ? (
              <View style={sheet.field}>
                <Text style={sheet.fieldSubLabel}>{t('logs.plot')}</Text>
                <View style={sheet.opGrid}>
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

            {needsWorkers ? (
              <View style={sheet.dynamicGroup}>
                <Text style={sheet.fieldSubLabel}>{t('activityComposer.crew')}</Text>
                <Text style={sheet.fieldHint}>{t('activityComposer.crewHint')}</Text>
                <View style={sheet.opGrid}>
                  {(workersQuery.data ?? []).map((worker) => {
                    const selected = crewIds.includes(worker.id);
                    return (
                      <TouchableOpacity key={worker.id} style={[sheet.opPill, selected && sheet.opPillActive]} onPress={() => setCrewIds((ids) => selected ? ids.filter((id) => id !== worker.id) : [...ids, worker.id])}>
                        <Ionicons name={selected ? 'checkmark-circle' : 'person-outline'} size={14} color={selected ? theme.colors.primary : theme.colors.textMuted} />
                        <Text style={[sheet.opPillText, selected && sheet.opPillTextActive]}>{worker.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {!workersQuery.isLoading && !workersQuery.data?.length ? <Text style={sheet.emptyHint}>{t('activityComposer.noWorkers')}</Text> : null}
              </View>
            ) : null}

            {needsInput ? (
              <View style={sheet.dynamicGroup}>
                <Text style={sheet.fieldSubLabel}>{t(activity.id === 'input_purchase' ? 'activityComposer.inputPurchased' : 'activityComposer.inputUsed')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sheet.horizontalChoices}>
                  {(inventoryQuery.data ?? []).map((item) => (
                    <TouchableOpacity key={item.id} style={[sheet.choiceCard, inputItemId === item.id && sheet.choiceCardActive]} onPress={() => setInputItemId(item.id)}>
                      <Text style={[sheet.choiceCardTitle, inputItemId === item.id && sheet.choiceCardTitleActive]}>{item.name}</Text>
                      <Text style={sheet.choiceCardMeta}>{item.current_qty ?? 0} {item.unit ?? ''} available</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[sheet.choiceCard, inputItemId === '__new__' && sheet.choiceCardActive]} onPress={() => setInputItemId('__new__')}>
                    <Text style={[sheet.choiceCardTitle, inputItemId === '__new__' && sheet.choiceCardTitleActive]}>+ {t('activityComposer.newInput')}</Text>
                    <Text style={sheet.choiceCardMeta}>{t('activityComposer.saveForLater')}</Text>
                  </TouchableOpacity>
                </ScrollView>
                {inputItemId === '__new__' ? <TextInput style={sheet.input} value={newInputName} onChangeText={setNewInputName} placeholder={t('activityComposer.inputName')} placeholderTextColor={theme.colors.textMuted} /> : null}
                <TextInput style={sheet.input} value={inputQty} onChangeText={setInputQty} placeholder={t('activityComposer.inputQuantity')} placeholderTextColor={theme.colors.textMuted} keyboardType="decimal-pad" />
              </View>
            ) : null}

            {needsEquipment ? (
              <View style={sheet.dynamicGroup}>
                <Text style={sheet.fieldSubLabel}>{t('activityComposer.equipment')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sheet.horizontalChoices}>
                  {(equipmentQuery.data ?? []).map((item) => (
                    <TouchableOpacity key={item.id} style={[sheet.choiceCard, equipmentId === item.id && sheet.choiceCardActive]} onPress={() => setEquipmentId(item.id)}>
                      <Text style={[sheet.choiceCardTitle, equipmentId === item.id && sheet.choiceCardTitleActive]}>{item.name}</Text>
                      <Text style={sheet.choiceCardMeta}>{item.status}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {activity.id === 'equipment_fuel' ? <TextInput style={sheet.input} value={equipmentLitres} onChangeText={setEquipmentLitres} placeholder={t('activityComposer.litres')} placeholderTextColor={theme.colors.textMuted} keyboardType="decimal-pad" /> : null}
              </View>
            ) : null}

            {needsBuyer ? (
              <View style={[sheet.dynamicGroup, sheet.incomeGroup]}>
                <Text style={sheet.fieldSubLabel}>{t('activityComposer.buyerDelivery')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sheet.horizontalChoices}>
                  <TouchableOpacity style={[sheet.choiceCard, buyerId === '' && sheet.choiceCardActive]} onPress={() => setBuyerId('')}><Text style={[sheet.choiceCardTitle, buyerId === '' && sheet.choiceCardTitleActive]}>Walk-in</Text><Text style={sheet.choiceCardMeta}>One-time buyer</Text></TouchableOpacity>
                  {(buyersQuery.data ?? []).map((buyer) => <TouchableOpacity key={buyer.id} style={[sheet.choiceCard, buyerId === buyer.id && sheet.choiceCardActive]} onPress={() => setBuyerId(buyer.id)}><Text style={[sheet.choiceCardTitle, buyerId === buyer.id && sheet.choiceCardTitleActive]}>{buyer.name}</Text><Text style={sheet.choiceCardMeta}>Saved buyer</Text></TouchableOpacity>)}
                  <TouchableOpacity style={[sheet.choiceCard, buyerId === '__new__' && sheet.choiceCardActive]} onPress={() => setBuyerId('__new__')}><Text style={[sheet.choiceCardTitle, buyerId === '__new__' && sheet.choiceCardTitleActive]}>+ New buyer</Text><Text style={sheet.choiceCardMeta}>Save for later</Text></TouchableOpacity>
                </ScrollView>
                {buyerId === '__new__' ? <TextInput style={sheet.input} value={newBuyerName} onChangeText={setNewBuyerName} placeholder={t('activityComposer.buyerName')} placeholderTextColor={theme.colors.textMuted} /> : null}
                <TextInput style={sheet.input} value={amountReceived} onChangeText={setAmountReceived} placeholder={t('activityComposer.amountReceived')} placeholderTextColor={theme.colors.textMuted} keyboardType="number-pad" />
              </View>
            ) : null}

            {needsYield ? (
              <View style={sheet.field}>
                <Text style={sheet.fieldSubLabel}>{t(needsBuyer ? 'activityComposer.quantitySold' : 'activityComposer.yieldHarvested')}</Text>
                <TextInput style={sheet.input} value={yieldQty} onChangeText={setYieldQty} placeholder={t('activityComposer.quantityKg')} placeholderTextColor={theme.colors.textMuted} keyboardType="decimal-pad" />
              </View>
            ) : null}

            <View style={sheet.field}>
              <Text style={sheet.fieldSubLabel}>{t('logs.when')}</Text>
              <TouchableOpacity style={sheet.selectionRow} onPress={() => setShowDatePicker(true)}>
                <View style={sheet.selectionIcon}><Ionicons name="calendar-outline" size={19} color={theme.colors.primary} /></View>
                <Text style={[sheet.selectionValue, { flex: 1 }]}>{activityDate.toLocaleDateString(locale === 'sw' ? 'sw-TZ' : 'en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
              {showDatePicker ? <DateTimePicker value={activityDate} mode="date" maximumDate={new Date()} display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={onDateChange} /> : null}
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

            {activity.hasAmount ? <View style={sheet.field}>
              <Text style={sheet.fieldSubLabel}>{mode === 'income' ? t('activityComposer.totalAmount') : t('logs.costOptional')}</Text>
              <TextInput
                style={sheet.input}
                placeholder="0 TZS"
                placeholderTextColor={theme.colors.textMuted}
                value={cost}
                onChangeText={setCost}
                keyboardType="decimal-pad"
              />
            </View> : null}

            {error ? <Text style={sheet.error}>{t(error)}</Text> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
      </KeyboardAvoidingView>
      <Modal visible={showActivityPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowActivityPicker(false)}>
        <SafeAreaView style={sheet.pickerScreen} edges={['top', 'bottom']}>
          <View style={sheet.pickerHeader}>
            <View>
              <Text style={sheet.pickerTitle}>{t('activityComposer.chooseActivity')}</Text>
              <Text style={sheet.fieldHint}>{t('activityComposer.relevantFields')}</Text>
            </View>
            <TouchableOpacity style={sheet.pickerDone} onPress={() => setShowActivityPicker(false)}><Text style={sheet.pickerDoneText}>{t('common.done')}</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={sheet.pickerList}>
            {activitiesForMode(mode).map((item) => {
              const selected = item.id === activityId;
              return (
                <TouchableOpacity key={item.id} style={[sheet.pickerRow, selected && sheet.pickerRowActive]} onPress={() => { setActivityId(item.id); setShowActivityPicker(false); }}>
                  <View style={sheet.selectionIcon}><Ionicons name={item.icon} size={19} color={theme.colors.primary} /></View>
                  <Text style={[sheet.pickerRowText, selected && sheet.pickerRowTextActive]}>{t(`operations.${item.id}`)}</Text>
                  {selected ? <Ionicons name="checkmark-circle" size={21} color={theme.colors.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </Modal>
  );
}

export function LogbookScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<LogFilter>('all');
  const activeFarmSelection = useActiveFarmSelection();
  const selectedFarmId = activeFarmSelection.data;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['logbook-online', selectedFarmId ?? 'default'],
    enabled: selectedFarmId !== undefined,
    queryFn: async () => {
      const activeFarmId = selectedFarmId ?? null;
      const farms = asArray<FarmRecord>(await mobileApi.listFarms().catch(() => []));
      const activeFarm =
        farms.find((farm) => String(farm.id) === String(activeFarmId)) ??
        farms[0] ??
        null;
      const resolvedFarmId = activeFarm ? String(activeFarm.id) : activeFarmId;

      const results = await Promise.all(
        (activeFarm ? [activeFarm] : []).map(async (farm) => {
          const journeys = asArray<JourneyRecord>(
            await mobileApi.listFarmJourneys(String(farm.id)).catch(() => []),
          );
          const currentJourneys = journeys.filter(
            (journey) => journey.status === 'active' || journey.status === 'planned',
          );
          const primaryJourney =
            currentJourneys.find((journey) => journey.status === 'active') ??
            currentJourneys[0] ??
            journeys[0] ??
            null;
          if (!primaryJourney) {
            return { farm, journey: null as JourneyRecord | null, logs: [] as LogRecord[] };
          }
          // A scan can be attached to a planned journey while another journey is
          // still marked active. Load every current journey so a successfully
          // saved scan cannot disappear merely because of journey ordering.
          // Notes is the farm's history, not only the current season. Scans can
          // remain attached to a journey that was later completed or replaced,
          // so load every journey belonging to the selected farm.
          const journeysToLoad = journeys;
          const logs = (
            await Promise.all(
              journeysToLoad.map((journey) =>
                mobileApi
                  .listJourneyLogs(String(farm.id), String(journey.id))
                  .catch(() => [] as LogWithImages[]),
              ),
            )
          ).flat() as LogWithImages[];
          const legacyDemoLogs = logs.filter(isLegacyDemoLog);
          if (legacyDemoLogs.length > 0) {
            await Promise.allSettled(
              legacyDemoLogs.map((log) =>
                mobileApi.deleteJourneyLog(
                  String(farm.id),
                  String(log.journey_id ?? primaryJourney.id),
                  String(log.id),
                ),
              ),
            );
          }
          return { farm, journey: primaryJourney, logs: logs.filter((log) => !isLegacyDemoLog(log)) };
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

      return { farmOptions, logs: allLogs, activeFarmId: resolvedFarmId ?? null };
    },
  });

  async function onSaved() {
    setShowAdd(false);
    await queryClient.invalidateQueries({ queryKey: ['logbook-online'] });
  }

  const visibleLogs = (data?.logs ?? []).filter((log) => {
    if (filter === 'expenses') return typeof log.cost === 'number' && log.cost > 0;
    if (filter === 'work') return !log.cost || log.cost <= 0;
    return true;
  });
  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: 88 }]}
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {data ? (
          <View style={s.activityHeader}>
            <View style={s.filterRow}>
              {(['all', 'work', 'expenses'] as const).map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[s.filterChip, filter === item && s.filterChipActive]}
                  onPress={() => setFilter(item)}
                >
                  <Text style={[s.filterChipText, filter === item && s.filterChipTextActive]}>
                    {item === 'all' ? 'All' : item === 'work' ? 'Field work' : 'Expenses'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
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
        ) : !visibleLogs.length ? (
          <View style={s.emptyState}>
            <Ionicons name="document-text-outline" size={40} color={theme.colors.textMuted} />
            <Text style={s.emptyTitle}>{t('logbook.noNotesYet')}</Text>
            <Text style={s.emptyText}>{t('logbook.noNotesDesc')}</Text>
          </View>
        ) : (
          <View style={s.logList}>
            <Text style={s.listLabel}>{t('logbook.recentNotes')} · {visibleLogs.length}</Text>
            {visibleLogs.map((log) => {
              const opIcon = getActivity(log.operation_type.toLowerCase().replace(/\s+/g, '_')).icon;
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
                  <View style={{ flex: 1, gap: 5 }}>
                    <View style={s.noteMetaRow}>
                      <View style={s.operationBadge}>
                        <Text style={s.operationBadgeText}>{log.operation_type || 'Activity'}</Text>
                      </View>
                      {typeof log.cost === 'number' && log.cost > 0 ? (
                        <Text style={s.noteCost}>KES {Math.round(log.cost).toLocaleString()}</Text>
                      ) : null}
                    </View>
                    <Text style={s.noteText} numberOfLines={2}>
                      {log.notes?.trim() || log.operation_type}
                    </Text>
                    <Text style={s.noteTime} numberOfLines={1}>
                      {log.farmName} · {fmtDateTime(log.updated_at || log.date)}
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
        style={[s.fab, { bottom: 24 }]}
        onPress={() => setShowAdd(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {showAdd && data?.farmOptions ? (
        <AddLogSheet
          farmOptions={data.farmOptions}
          defaultFarmId={data.activeFarmId}
          lockedFarmId={data.activeFarmId ?? undefined}
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
    paddingTop: 12,
    gap: 18,
  },
  activityHeader: {
    gap: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  filterChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  filterChipTextActive: {
    color: '#fff',
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
    fontSize: 11,
    fontWeight: '500',
    color: theme.colors.textMuted,
  },
  noteText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    color: theme.colors.text,
  },
  noteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  operationBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.primary + '12',
  },
  operationBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  noteCost: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.text,
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
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
});

const sheet = StyleSheet.create({
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
  dynamicGroup: { gap: 9, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 12 },
  incomeGroup: { borderColor: theme.colors.success + '55', backgroundColor: theme.colors.success + '08' },
  emptyHint: { fontSize: 12, lineHeight: 17, color: theme.colors.textMuted },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: theme.colors.textMuted },
  fieldHint: { fontSize: 12, color: theme.colors.textMuted },
  fieldSubLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.text },

  modeControl: { flexDirection: 'row', padding: 3, borderRadius: 13, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border },
  modeOption: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  modeOptionActive: { backgroundColor: theme.colors.surface },
  modeOptionText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  modeOptionTextActive: { color: theme.colors.primary },
  selectionRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  selectionIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary + '12' },
  selectionLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  selectionValue: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  horizontalChoices: { gap: 8, paddingRight: 8 },
  choiceCard: { minWidth: 126, maxWidth: 180, minHeight: 58, justifyContent: 'center', gap: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.background },
  choiceCardActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '0c' },
  choiceCardTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  choiceCardTitleActive: { color: theme.colors.primary },
  choiceCardMeta: { fontSize: 10, color: theme.colors.textMuted },
  pickerScreen: { flex: 1, backgroundColor: theme.colors.background },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  pickerTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  pickerDone: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 19, backgroundColor: theme.colors.primary },
  pickerDoneText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  pickerList: { padding: 16, gap: 8 },
  pickerRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  pickerRowActive: { borderColor: theme.colors.primary },
  pickerRowText: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.colors.text },
  pickerRowTextActive: { color: theme.colors.primary },

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
