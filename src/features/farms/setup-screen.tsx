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

const defaultSelection: FarmBoundarySelection = {
  latitude: -1.2921,
  longitude: 36.8219,
  country: 'Kenya',
  region: 'Nairobi',
  district: '',
  formattedAddress: '',
  mappingMode: 'polygon',
  mappedAreaHectares: null,
  fieldBoundaryJson: null,
};





// ─── Main screen ─────────────────────────────────────────────────────────────

export function FarmSetupScreen({ mode }: { mode: FarmSetupMode }) {
  const queryClient = useQueryClient();
  const { markOnboardingComplete } = useAuth();

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mappingMode]);

  // Farm data
  const [boundarySelection, setBoundarySelection] = useState<FarmBoundarySelection>(defaultSelection);
  const [sizeEditedManually, setSizeEditedManually] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  const [form, setForm] = useState({
    name: mode === 'onboarding' ? 'Main Farm' : '',
    sizeAcres: '6.2',
    cropId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!boundarySelection.mappedAreaHectares || sizeEditedManually) return;
    const acres = (boundarySelection.mappedAreaHectares / HECTARES_PER_ACRE).toFixed(2);
    setForm((c) => ({ ...c, sizeAcres: acres }));
  }, [boundarySelection.mappedAreaHectares, sizeEditedManually]);

  const selectedCrop = crops.find((c) => c.id === form.cropId) ?? null;

  const locationLine = boundarySelection.formattedAddress ||
    [boundarySelection.region, boundarySelection.country].filter(Boolean).join(', ');

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const sizeHectares = Number(form.sizeAcres) * HECTARES_PER_ACRE;

      if (!form.name.trim()) throw new Error('Enter a farm name before saving.');
      if (!Number.isFinite(sizeHectares) || sizeHectares <= 0)
        throw new Error('Enter a valid farm size.');

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
        const draft = await journeyRepository.createJourneyDraft({
          farm_id: farm.id,
          plot_id: plot.id,
          crop_id: form.cropId,
        });
        await queueJourneySync(draft.journey);
      }

      await queryClient.invalidateQueries();

      if (mode === 'onboarding') {
        await markOnboardingComplete();
        router.replace('/(tabs)/home');
        return;
      }
      router.replace(`/farms/${farm.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Farm setup failed');
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
                  {mode === 'onboarding' ? 'Set up your farm' : 'Add a farm'}
                </Text>
                {mode === 'add' && (
                  <Text style={s.swipeHint}>↑ Swipe up</Text>
                )}
              </View>
              {locationLine ? (
                <Text style={s.peekLocation} numberOfLines={1}>📍 {locationLine}</Text>
              ) : (
                <Text style={s.peekLocationEmpty}>Tap the map to set your farm location</Text>
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

          {/* Coordinate entry panel */}
          {mappingMode === 'coordinates' && pickerHandle ? (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Enter coordinates</Text>
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
                <Text style={s.addCoordText}>+ Add point</Text>
              </TouchableOpacity>
              <Button
                label="Apply coordinates"
                variant="secondary"
                onPress={pickerHandle.applyCoordinates}
              />
            </View>
          ) : null}

          {/* Farm profile */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Farm profile</Text>

            <TextField
              label="Farm name"
              value={form.name}
              onChangeText={(v) => setForm((c) => ({ ...c, name: v }))}
              placeholder="e.g. Main Farm"
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
              label="Farm size (acres)"
              value={form.sizeAcres}
              onChangeText={(v) => {
                setSizeEditedManually(true);
                setForm((c) => ({ ...c, sizeAcres: v }));
              }}
              keyboardType="decimal-pad"
              hint={
                boundarySelection.mappedAreaHectares && !sizeEditedManually
                  ? `Auto-filled from boundary · ${(Number(form.sizeAcres) * HECTARES_PER_ACRE).toFixed(2)} ha`
                  : `Converts to ${(Number(form.sizeAcres) * HECTARES_PER_ACRE || 0).toFixed(2)} hectares`
              }
            />
          </View>

          {/* Crop — optional inline dropdown */}
          <View style={s.section}>
            <View style={s.fieldLabelRow}>
              <Text style={s.sectionTitle}>Crop</Text>
              <Text style={s.optionalTag}>Optional</Text>
            </View>
            <TouchableOpacity
              style={[s.selectTrigger, cropOpen && s.selectTriggerOpen]}
              onPress={() => setCropOpen((v) => !v)}
              activeOpacity={0.8}
            >
              <Text style={[s.selectText, !form.cropId && s.selectPlaceholder]}>
                {selectedCrop?.common_name ?? 'Select crop'}
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
                      <Text style={[s.dropdownItemText, s.dropdownItemMuted]}>No crop selected</Text>
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

            <Text style={s.fieldHint}>
              Pick the first crop now to skip the extra crop-selection step.
            </Text>
          </View>

          {/* Submit */}
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Button
            label={
              loading
                ? mode === 'onboarding' ? 'Creating farm...' : 'Saving farm...'
                : mode === 'onboarding' ? 'Create Farm Profile' : 'Save farm'
            }
            onPress={() => void submit()}
            disabled={loading}
          />
        </ScrollView>
      </Animated.View>

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
});

