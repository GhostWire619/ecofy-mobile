import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/core/button';
import { TextField } from '@/components/forms/text-field';
import {
  FarmBoundaryPicker,
  type FarmBoundaryPickerHandle,
  type FarmBoundarySelection,
  type MappingMode,
} from '@/components/map/farm-boundary-picker';
import { mobileApi } from '@/lib/api/mobile';
import { useAuth } from '@/lib/auth/provider';
import { cropCatalog } from '@/lib/constants/crops';
import { farmRepository, journeyRepository } from '@/lib/db/repositories';
import type { CropCatalogItem } from '@/lib/domain/types';
import { useI18n } from '@/lib/i18n';
import { queueFarmSync, queueJourneySync } from '@/lib/sync/engine';
import { theme } from '@/lib/theme';

function normalizeCrop(raw: Record<string, unknown>): CropCatalogItem {
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '');
  const num = (k: string) => (typeof raw[k] === 'number' ? (raw[k] as number) : 0);
  return {
    id: str('id'),
    name: str('name') || str('common_name'),
    common_name: str('common_name') || str('name'),
    local_name: (typeof raw['local_name'] === 'string' ? raw['local_name'] : null),
    variety: (typeof raw['variety'] === 'string' ? raw['variety'] : null),
    maturity_days_max: num('maturity_days_max'),
    difficulty: (['beginner', 'intermediate', 'advanced'].includes(str('difficulty')) ? str('difficulty') : 'beginner') as CropCatalogItem['difficulty'],
    water_needs: (['low', 'medium', 'high'].includes(str('water_needs')) ? str('water_needs') : 'medium') as CropCatalogItem['water_needs'],
    market_demand: (['low', 'medium', 'high'].includes(str('market_demand')) ? str('market_demand') : 'medium') as CropCatalogItem['market_demand'],
    suitability_score: num('suitability_score'),
    expected_yield_label: str('expected_yield_label'),
  };
}

type FarmSetupMode = 'onboarding' | 'add';

const HECTARES_PER_ACRE = 0.404686;

const QUICK_NAMES = ['Home Plot', 'Field A', 'Shamba 1'];

// Default to central Tanzania (Dodoma) — the map geolocates to the farmer's real
// position on open; this is just the fallback before that resolves.
const defaultSelection: FarmBoundarySelection = {
  latitude: -6.1630,
  longitude: 35.7516,
  country: 'Tanzania',
  region: 'Dodoma',
  district: '',
  formattedAddress: '',
  mappingMode: 'polygon',
  mappedAreaHectares: null,
  fieldBoundaryJson: null,
};

// Low-typing farm-size shortcuts (acres) — most smallholders are 1–5 acres.
const QUICK_SIZES = ['1', '2', '5'];

// When the farmer will plant — maps to a planting date the planner uses. Kept to
// three plain, tappable choices instead of a date picker (low-literacy friendly).
type PlantingChoice = 'planted' | 'this_month' | 'later';
const PLANTING_OFFSET_DAYS: Record<PlantingChoice, number> = {
  planted: 0,
  this_month: 0,
  later: 45,
};





// ─── Main screen ─────────────────────────────────────────────────────────────

export function FarmSetupScreen({ mode }: { mode: FarmSetupMode }) {
  const queryClient = useQueryClient();
  const { markOnboardingComplete } = useAuth();
  const { locale, t } = useI18n();
  const sw = locale === 'sw';

  const [crops, setCrops] = useState<CropCatalogItem[]>(cropCatalog);
  const [loadingCrops, setLoadingCrops] = useState(false);

  useEffect(() => {
    setLoadingCrops(true);
    mobileApi.fetchCropCatalog()
      .then((raw) => {
        const normalized = raw.map(normalizeCrop).filter((c) => c.id);
        if (normalized.length > 0) setCrops(normalized);
      })
      .catch(() => { /* keep local fallback */ })
      .finally(() => setLoadingCrops(false));
  }, []);

  const { height: SCREEN_H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Sheet sizing
  const SHEET_H = Math.round(SCREEN_H * 0.80);
  const PEEK_H = 104 + insets.bottom;
  const COLLAPSED_Y = SHEET_H - PEEK_H;

  // Sheet animation
  const translateY = useSharedValue(COLLAPSED_Y);
  const startY = useSharedValue(0);

  const EASE = Easing.out(Easing.cubic);

  const panGesture = Gesture.Pan()
    .onBegin(() => { startY.value = translateY.value; })
    .onUpdate((e) => {
      const next = startY.value + e.translationY;
      translateY.value = Math.max(0, Math.min(next, COLLAPSED_Y));
    })
    .onEnd((e) => {
      const half = COLLAPSED_Y / 2;
      if (translateY.value < half || e.velocityY < -500) {
        translateY.value = withTiming(0, { duration: 280, easing: EASE });
      } else {
        translateY.value = withTiming(COLLAPSED_Y, { duration: 280, easing: EASE });
      }
    });

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Mapping
  const [mappingMode, setMappingMode] = useState<MappingMode>('polygon');
  const [pickerHandle, setPickerHandle] = useState<FarmBoundaryPickerHandle | null>(null);

  // Auto-open sheet when switching to coords mode so user can fill the form
  useEffect(() => {
    if (mappingMode === 'coordinates') {
      translateY.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    }
  }, [mappingMode, translateY]);

  // Farm data
  const [boundarySelection, setBoundarySelection] = useState<FarmBoundarySelection>(defaultSelection);
  const [sizeEditedManually, setSizeEditedManually] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  const [form, setForm] = useState({
    name: mode === 'onboarding' ? 'Main Farm' : '',
    sizeAcres: '',
    cropId: '',
  });
  const [plantingChoice, setPlantingChoice] = useState<PlantingChoice>('this_month');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!boundarySelection.mappedAreaHectares || sizeEditedManually) return;
    const acres = (boundarySelection.mappedAreaHectares / HECTARES_PER_ACRE).toFixed(2);
    setForm((c) => ({ ...c, sizeAcres: acres }));
  }, [boundarySelection.mappedAreaHectares, sizeEditedManually]);

  // Plain-language way to mark the farm — built for farmers who can't read a map.
  // Switching to a GPS mode collapses the sheet so the map's capture button shows.
  function chooseMethod(next: MappingMode) {
    setMappingMode(next);
    if (next === 'point' || next === 'walk') {
      translateY.value = withTiming(COLLAPSED_Y, { duration: 280, easing: EASE });
    }
  }

  const METHODS: { key: MappingMode; emoji: string; title: string; desc: string }[] = [
    { key: 'point', emoji: '📍', title: t('setup.methodPointTitle'), desc: t('setup.methodPointDesc') },
    { key: 'walk', emoji: '🚶', title: t('setup.methodWalkTitle'), desc: t('setup.methodWalkDesc') },
    { key: 'polygon', emoji: '🗺️', title: t('setup.methodDrawTitle'), desc: t('setup.methodDrawDesc') },
  ];

  const selectedCrop = crops.find((c) => c.id === form.cropId) ?? null;

  const locationLine = boundarySelection.formattedAddress ||
    [boundarySelection.region, boundarySelection.country].filter(Boolean).join(', ');

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const sizeHectares = Number(form.sizeAcres) * HECTARES_PER_ACRE;

      if (!form.name.trim()) throw new Error('setup.errEnterName');
      if (!Number.isFinite(sizeHectares) || sizeHectares <= 0)
        throw new Error('setup.errEnterSize');

      const { farm, plot } = await farmRepository.createLocalFarm({
        name: form.name.trim(),
        latitude: boundarySelection.latitude,
        longitude: boundarySelection.longitude,
        region: boundarySelection.region.trim(),
        country: boundarySelection.country.trim(),
        district: boundarySelection.district.trim() || null,
        formatted_address: boundarySelection.formattedAddress.trim() || null,
        size_hectares: sizeHectares,
        soil_type: null,
        irrigation_type: 'rain-fed',
        plot_name: 'Main Plot',
        plot_size_hectares: boundarySelection.mappedAreaHectares ?? sizeHectares,
        field_boundary_json: boundarySelection.fieldBoundaryJson,
        center_latitude: boundarySelection.latitude,
        center_longitude: boundarySelection.longitude,
      });

      await queueFarmSync(farm, plot);

      if (form.cropId) {
        const offsetDays = PLANTING_OFFSET_DAYS[plantingChoice];
        const plantingDate = new Date();
        plantingDate.setDate(plantingDate.getDate() + offsetDays);
        const draft = await journeyRepository.createJourneyDraft({
          farm_id: farm.id,
          plot_id: plot.id,
          crop_id: form.cropId,
          planting_date: plantingDate.toISOString().slice(0, 10),
        });
        await queueJourneySync(draft.journey);
      }

      await queryClient.invalidateQueries();

      if (mode === 'onboarding') {
        // Show the reassuring success state first. We only mark onboarding
        // complete on the Continue tap — otherwise the navigation gate would
        // immediately redirect to Today and skip this screen.
        setSubmitted(true);
        return;
      }
      router.replace(`/farms/${farm.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'setup.errSetupFailed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* ── Full-screen satellite map ── */}
      <FarmBoundaryPicker
        value={boundarySelection}
        onChange={setBoundarySelection}
        mode={mappingMode}
        onModeChange={setMappingMode}
        onHandle={setPickerHandle}
        bottomInset={PEEK_H + 8}
      />

      {/* ── Close button (add mode only) ── */}
      {mode === 'add' && (
        <TouchableOpacity
          style={[s.closeBtn, { top: insets.top + 10 }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
      )}

      {/* ── Bottom sheet ── */}
      <Animated.View style={[s.sheet, { height: SHEET_H }, sheetAnimStyle]}>
        {/* Drag handle — gesture target */}
        <GestureDetector gesture={panGesture}>
          <View style={s.handleArea}>
            <View style={s.handleBar} />
            <View style={s.peekHeader}>
              <View style={s.peekTitleRow}>
                <Text style={s.peekTitle}>
                  {mode === 'onboarding' ? t('setup.setUpYourFarm') : t('setup.addAFarm')}
                </Text>
                {mode === 'add' && (
                  <Text style={s.swipeHint}>{t('setup.swipeUp')}</Text>
                )}
              </View>
              {locationLine ? (
                <Text style={s.peekLocation} numberOfLines={1}>📍 {locationLine}</Text>
              ) : (
                <Text style={s.peekLocationEmpty}>{t('setup.tapMapToSet')}</Text>
              )}
            </View>
          </View>
        </GestureDetector>

        {/* Scrollable form */}
        <ScrollView
          style={s.formScroll}
          contentContainerStyle={[s.formContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Location banner */}
          {boundarySelection.mappedAreaHectares ? (
            <View style={s.locationBanner}>
              <Text style={s.locationBannerText}>
                ✅ {boundarySelection.mappedAreaHectares.toFixed(2)} ha mapped
                {boundarySelection.district ? ` · ${boundarySelection.district}` : ''}
              </Text>
            </View>
          ) : null}

          {/* How to mark the farm — low-literacy first */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>{t('setup.whereIsFarm')}</Text>
            <Text style={s.methodHint}>{t('setup.pickEasiest')}</Text>
            {METHODS.map((m) => {
              const active = mappingMode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[s.methodCard, active && s.methodCardActive]}
                  onPress={() => chooseMethod(m.key)}
                  activeOpacity={0.85}
                  testID={`farm-method-${m.key}`}
                >
                  <Text style={s.methodEmoji}>{m.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.methodTitle}>{m.title}</Text>
                    <Text style={s.methodDesc}>{m.desc}</Text>
                  </View>
                  {active ? <Text style={s.methodCheck}>✓</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Coordinate entry panel */}
          {mappingMode === 'coordinates' && pickerHandle ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>{t('setup.enterCoordinates')}</Text>
              {pickerHandle.coordRows.map((row, i) => (
                <View key={i} style={s.coordPair}>
                  <View style={s.coordField}>
                    <TextField
                      label={`Lat ${i + 1}`}
                      value={row.lat}
                      onChangeText={(v) => {
                        const next = [...pickerHandle.coordRows];
                        next[i] = { ...next[i], lat: v };
                        pickerHandle.setCoordRows(next);
                      }}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={s.coordField}>
                    <TextField
                      label={`Lng ${i + 1}`}
                      value={row.lng}
                      onChangeText={(v) => {
                        const next = [...pickerHandle.coordRows];
                        next[i] = { ...next[i], lng: v };
                        pickerHandle.setCoordRows(next);
                      }}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              ))}
              {pickerHandle.coordError ? (
                <Text style={s.error}>{pickerHandle.coordError}</Text>
              ) : null}
              <TouchableOpacity
                style={s.addCoordBtn}
                onPress={() =>
                  pickerHandle.setCoordRows([...pickerHandle.coordRows, { lat: '', lng: '' }])
                }
              >
                <Text style={s.addCoordText}>{t('setup.addPoint')}</Text>
              </TouchableOpacity>
              <Button
                label={t('setup.applyCoordinates')}
                variant="secondary"
                onPress={pickerHandle.applyCoordinates}
              />
            </View>
          ) : null}

          {/* Farm profile */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>{t('setup.farmProfile')}</Text>

            <TextField
              label={t('setup.farmName')}
              value={form.name}
              onChangeText={(v) => setForm((c) => ({ ...c, name: v }))}
              placeholder={t('setup.farmNamePlaceholder')}
            />
            <View style={s.quickRow}>
              {QUICK_NAMES.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[s.quickChip, form.name === n && s.quickChipActive]}
                  onPress={() => setForm((c) => ({ ...c, name: n }))}
                >
                  <Text style={[s.quickChipText, form.name === n && s.quickChipTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextField
              label={sw ? 'Ukubwa wa shamba (ekari)' : 'Farm size (acres)'}
              value={form.sizeAcres}
              onChangeText={(v) => {
                setSizeEditedManually(true);
                setForm((c) => ({ ...c, sizeAcres: v }));
              }}
              keyboardType="decimal-pad"
              placeholder={sw ? 'mf. 2' : 'e.g. 2'}
              hint={
                boundarySelection.mappedAreaHectares && !sizeEditedManually
                  ? `Auto-filled from boundary · ${(Number(form.sizeAcres) * HECTARES_PER_ACRE).toFixed(2)} ha`
                  : `Converts to ${(Number(form.sizeAcres) * HECTARES_PER_ACRE || 0).toFixed(2)} hectares`
              }
            />
            <View style={s.quickRow}>
              {QUICK_SIZES.map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[s.quickChip, form.sizeAcres === n && s.quickChipActive]}
                  onPress={() => {
                    setSizeEditedManually(true);
                    setForm((c) => ({ ...c, sizeAcres: n }));
                  }}
                >
                  <Text style={[s.quickChipText, form.sizeAcres === n && s.quickChipTextActive]}>
                    {n} {sw ? 'ekari' : 'acres'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Crop — optional inline dropdown */}
          <View style={s.section}>
            <View style={s.fieldLabelRow}>
              <Text style={s.sectionTitle}>{t('onboarding.cropLabel')}</Text>
              <Text style={s.optionalTag}>{t('common.optional')}</Text>
            </View>
            <TouchableOpacity
              style={[s.selectTrigger, cropOpen && s.selectTriggerOpen]}
              onPress={() => setCropOpen((v) => !v)}
              activeOpacity={0.8}
            >
              <Text style={[s.selectText, !form.cropId && s.selectPlaceholder]}>
                {selectedCrop?.common_name ?? t('onboarding.selectCrop')}
              </Text>
              <Text style={s.selectChevron}>{cropOpen ? '⌃' : '⌄'}</Text>
            </TouchableOpacity>

            {cropOpen && (
              <View style={s.dropdownList}>
                {loadingCrops ? (
                  <View style={[s.dropdownItem, { justifyContent: 'center' }]}>
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  </View>
                ) : (
                  <>
                    <Pressable
                      style={[s.dropdownItem, s.dropdownItemBorder]}
                      onPress={() => { setForm((c) => ({ ...c, cropId: '' })); setCropOpen(false); }}
                    >
                      <Text style={[s.dropdownItemText, s.dropdownItemMuted]}>{t('setup.noCropSelected')}</Text>
                    </Pressable>
                    {crops.map((crop, i) => (
                      <Pressable
                        key={crop.id}
                        style={[s.dropdownItem, i < crops.length - 1 && s.dropdownItemBorder]}
                        onPress={() => { setForm((c) => ({ ...c, cropId: crop.id })); setCropOpen(false); }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.dropdownItemText}>{crop.common_name}</Text>
                          {crop.local_name ? <Text style={s.dropdownItemSub}>{crop.local_name}</Text> : null}
                        </View>
                        {form.cropId === crop.id ? <Text style={s.dropdownCheck}>✓</Text> : null}
                      </Pressable>
                    ))}
                  </>
                )}
              </View>
            )}

            {/* Don't know what to plant or which seed? Hand off to the AI. */}
            <TouchableOpacity style={s.aiHelp} onPress={() => router.push('/assistant')} activeOpacity={0.85}>
              <Text style={s.aiHelpEmoji}>💬</Text>
              <Text style={s.aiHelpText}>
                {sw
                  ? 'Hujui upande nini au utumie mbegu gani? Uliza Ecofy AI'
                  : 'Not sure what to plant or which seed? Ask Ecofy AI'}
              </Text>
              <Text style={s.aiHelpChevron}>›</Text>
            </TouchableOpacity>

            {form.cropId ? (
              <View style={s.plantingBlock}>
                <Text style={s.fieldLabel}>{sw ? 'Utapanda lini?' : 'When will you plant?'}</Text>
                <View style={s.plantingRow}>
                  {([
                    { key: 'planted', en: 'Already planted', sw: 'Nimeshapanda' },
                    { key: 'this_month', en: 'This month', sw: 'Mwezi huu' },
                    { key: 'later', en: 'Later', sw: 'Baadaye' },
                  ] as { key: PlantingChoice; en: string; sw: string }[]).map((opt) => {
                    const active = plantingChoice === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[s.plantingChip, active && s.plantingChipActive]}
                        onPress={() => setPlantingChoice(opt.key)}
                        activeOpacity={0.85}
                      >
                        <Text style={[s.plantingChipText, active && s.plantingChipTextActive]}>
                          {sw ? opt.sw : opt.en}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={s.fieldHint}>
                  {sw
                    ? 'Ecofy itachagua mbegu bora kwa eneo lako — unaweza kubadilisha baadaye.'
                    : 'Ecofy will pick the best seed variety for your area — you can change it later.'}
                </Text>
              </View>
            ) : (
              <Text style={s.fieldHint}>
                {sw
                  ? 'Chagua zao la kwanza sasa ili kuruka hatua ya ziada.'
                  : 'Pick the first crop now to skip the extra crop-selection step.'}
              </Text>
            )}
          </View>

          {/* Submit */}
          {error ? <Text style={s.error}>{t(error)}</Text> : null}
          <Button
            label={
              loading
                ? mode === 'onboarding' ? t('setup.creatingFarm') : t('setup.savingFarm')
                : mode === 'onboarding' ? t('onboarding.createFarmProfile') : t('setup.saveFarm')
            }
            onPress={() => void submit()}
            disabled={loading}
          />
        </ScrollView>
      </Animated.View>

      {/* Onboarding success — reassures the farmer the plan is being built. */}
      {submitted && (
        <View style={s.successOverlay}>
          <View style={s.successCard}>
            <Text style={s.successEmoji}>🎉</Text>
            <Text style={s.successTitle}>{sw ? 'Shamba lako liko tayari!' : 'Your farm is ready!'}</Text>
            <Text style={s.successBody}>
              {sw
                ? 'Umeanza safari yako ya kwanza 🌱 Tunaandaa mpango wako wa msimu sasa — utakuwa tayari hivi punde.'
                : "You've started your first journey 🌱 We're preparing your season plan now — it'll be ready in a moment."}
            </Text>
            <Button
              label={sw ? 'Endelea' : 'Continue'}
              onPress={() => {
                void markOnboardingComplete().finally(() =>
                  router.replace('/(tabs)/today' as never),
                );
              }}
            />
          </View>
        </View>
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Close button (add mode)
  closeBtn: {
    position: 'absolute',
    right: 14,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  closeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },

  // Handle area (gesture target)
  handleArea: {
    paddingTop: 10,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  peekHeader: { gap: 4 },
  peekTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  peekTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  swipeHint: { fontSize: 11, color: theme.colors.textMuted },
  peekLocation: { fontSize: 13, color: theme.colors.textMuted },
  peekLocationEmpty: { fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic' },

  // Form scroll
  formScroll: { flex: 1 },
  formContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },

  // Location banner
  locationBanner: {
    backgroundColor: '#eef4eb',
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
  },
  locationBannerText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },

  // Section
  section: { gap: theme.spacing.md },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  methodHint: { fontSize: 13, color: theme.colors.textMuted, marginTop: -6 },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  methodCardActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '0f' },
  methodEmoji: { fontSize: 26 },
  methodTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  methodDesc: { fontSize: 12.5, lineHeight: 17, color: theme.colors.textMuted, marginTop: 2 },
  methodCheck: { fontSize: 18, fontWeight: '800', color: theme.colors.primary },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionalTag: { fontSize: 13, color: theme.colors.textMuted },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  selectTriggerOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: 'transparent',
  },
  selectText: { fontSize: 15, color: theme.colors.text },
  selectPlaceholder: { color: theme.colors.textMuted },
  selectChevron: { fontSize: 16, color: theme.colors.textMuted },
  dropdownList: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: theme.radius.md,
    borderBottomRightRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  dropdownItemText: { fontSize: 15, color: theme.colors.text, flex: 1 },
  dropdownItemMuted: { color: theme.colors.textMuted },
  dropdownItemSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  dropdownCheck: { fontSize: 16, color: theme.colors.primary, fontWeight: '700' },
  fieldHint: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },

  // Quick name chips
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  quickChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  quickChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  quickChipText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  quickChipTextActive: { color: '#ffffff' },

  // Coord entry
  coordPair: { flexDirection: 'row', gap: theme.spacing.sm },
  coordField: { flex: 1 },
  addCoordBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  addCoordText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },

  error: { color: theme.colors.danger, fontSize: 14 },

  // AI help escape hatch
  aiHelp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary + '12',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary + '33',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  aiHelpEmoji: { fontSize: 18 },
  aiHelpText: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.primaryDark, lineHeight: 19 },
  aiHelpChevron: { fontSize: 22, color: theme.colors.primary, fontWeight: '700' },

  // Planting window
  plantingBlock: { gap: theme.spacing.sm },
  fieldLabel: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  plantingRow: { flexDirection: 'row', gap: theme.spacing.sm },
  plantingChip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  plantingChipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceMuted },
  plantingChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted, textAlign: 'center' },
  plantingChipTextActive: { color: theme.colors.primary },

  // Onboarding success overlay
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    backgroundColor: 'rgba(10,23,14,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  successCard: {
    width: '100%',
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  successEmoji: { fontSize: 44 },
  successTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text, textAlign: 'center' },
  successBody: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
