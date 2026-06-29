import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { Screen } from '@/components/layout/screen';
import { SkeletonCard } from '@/components/state/skeleton';
import { mobileApi } from '@/lib/api/mobile';
import { farmRepository } from '@/lib/db/repositories';
import type { FarmHealthSummary, FarmRecord, JourneyRecord, WeatherCacheRecord } from '@/lib/domain/types';
import { normalizeFarmHealthSummary, normalizeFarmRecord, normalizeJourneyRecord } from '@/features/farms/data';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

// ─── Risk helpers ─────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'moderate' | 'high' | 'critical' | 'none';

const RISK: Record<RiskLevel, { labelKey: string; color: string; dot: string }> = {
  low:      { labelKey: 'farms.lookingGood',   color: theme.colors.success,   dot: theme.colors.success   },
  moderate: { labelKey: 'farms.needsAttention', color: theme.colors.warning,  dot: theme.colors.warning   },
  high:     { labelKey: 'farms.atRisk',        color: '#f97316',               dot: '#f97316'              },
  critical: { labelKey: 'farms.urgentAction',  color: theme.colors.danger,    dot: theme.colors.danger    },
  none:     { labelKey: 'farms.noJourney',     color: theme.colors.textMuted, dot: theme.colors.textMuted },
};

function deriveRisk(input: { journey?: JourneyRecord | null; health?: FarmHealthSummary | null }): RiskLevel {
  const level = input.health?.overall_risk_level?.toLowerCase();
  if (level === 'low') return 'low';
  if (level === 'moderate') return 'moderate';
  if (level === 'high') return 'high';
  if (level === 'critical') return 'critical';
  if (!input.journey) return 'none';
  const p = input.journey.progress_percentage;
  if (p >= 70) return 'low';
  if (p >= 40) return 'moderate';
  if (p >= 10) return 'high';
  return 'critical';
}

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// ─── Farm action sheet ────────────────────────────────────────────────────────

function FarmActionSheet({
  farm,
  isActive,
  onSetActiveFarm,
  onClose,
}: {
  farm: FarmRecord;
  isActive: boolean;
  onSetActiveFarm: (farmId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const actions: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    testID: string;
    onPress: () => void;
  }[] = [
    {
      icon: 'open-outline',
      label: t('farms.openDashboard'),
      testID: 'farm-action-open-dashboard',
      onPress: () => { onClose(); router.push(`/farms/${farm.id}` as any); },
    },
    {
      icon: 'map-outline',
      label: t('farms.viewOnMap'),
      testID: 'farm-action-view-map',
      onPress: () => { onClose(); router.push(`/farms-map/${farm.id}` as any); },
    },
    {
      icon: 'grid-outline',
      label: t('farms.managePlots'),
      testID: 'farm-action-manage-plots',
      onPress: () => { onClose(); router.push(`/plots/${farm.id}` as any); },
    },
    {
      icon: 'cube-outline',
      label: t('farms.manageResources'),
      testID: 'farm-action-manage-resources',
      onPress: () => { onClose(); router.push(`/resources/${farm.id}` as any); },
    },
    {
      icon: 'people-outline',
      label: t('farms.manageWorkers'),
      testID: 'farm-action-manage-workers',
      onPress: () => { onClose(); router.push(`/workers/${farm.id}` as any); },
    },
    {
      icon: isActive ? 'checkmark-circle-outline' : 'radio-button-on-outline',
      label: isActive ? t('farms.activeFarm') : t('farms.setActiveFarm'),
      testID: 'farm-action-set-active',
      onPress: () => { onClose(); onSetActiveFarm(String(farm.id)); },
    },
    {
      icon: 'sparkles-outline',
      label: t('farms.askAI'),
      testID: 'farm-action-ask-ai',
      onPress: () => { onClose(); router.push('/assistant' as any); },
    },
  ];

  return (
    <Modal visible transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: theme.colors.overlay }} />
        </TouchableWithoutFeedback>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetFarmName} numberOfLines={1}>{farm.name}</Text>
          <Text style={s.sheetFarmSub}>{[farm.district, farm.region].filter(Boolean).join(', ')}</Text>
          <View style={s.sheetDivider} />
          {actions.map((a) => (
            <TouchableOpacity key={a.label} style={s.sheetItem} onPress={a.onPress} activeOpacity={0.7} testID={a.testID}>
              <View style={s.sheetItemIcon}>
                <Ionicons name={a.icon} size={18} color={theme.colors.primary} />
              </View>
              <Text style={s.sheetItemLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ height: 8 }} />
        </View>
      </View>
    </Modal>
  );
}

// ─── Farm card ────────────────────────────────────────────────────────────────

function FarmCard({
  farm,
  journey,
  weather,
  onMenuPress,
  healthSummary,
  isActive,
}: {
  farm: FarmRecord;
  journey?: JourneyRecord | null;
  weather?: WeatherCacheRecord | null;
  healthSummary?: FarmHealthSummary | null;
  onMenuPress: () => void;
  isActive: boolean;
}) {
  const { t } = useI18n();
  const risk = deriveRisk({ journey, health: healthSummary });
  const { labelKey: riskLabelKey, color: riskColor, dot: riskDot } = RISK[risk];
  const riskLabel = t(riskLabelKey);

  const location = [farm.district, farm.region, farm.country].filter(Boolean).join(', ') || t('farms.locationNotSet');

  const temp = (() => {
    if (!weather?.summary_json) return null;
    try {
      const p = JSON.parse(weather.summary_json) as Record<string, unknown>;
      const t = p.temp ?? p.temperature ?? (p.current as Record<string, unknown>)?.temp;
      return typeof t === 'number' ? t : null;
    } catch { return null; }
  })();

  return (
    <TouchableOpacity
      style={[s.card, isActive && s.cardActive]}
      activeOpacity={0.75}
      onPress={() => router.push(`/farms/${farm.id}` as any)}
    >
      {/* Top row */}
      <View style={s.cardTop}>
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <View style={s.farmTitleRow}>
            <Text style={s.farmName} numberOfLines={1}>{farm.name}</Text>
            {isActive ? (
              <View style={s.activeFarmBadge}>
                <Text style={s.activeFarmBadgeText}>{t('farms.activeFarm')}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.locationRow}>
            <Ionicons name="location-outline" size={12} color={theme.colors.textMuted} />
            <Text style={s.locationText} numberOfLines={2}>{location}</Text>
          </View>
        </View>

        <View style={s.cardActions}>
          <View style={s.riskBadge}>
            <View style={[s.riskDot, { backgroundColor: riskDot }]} />
            <Text style={[s.riskLabel, { color: riskColor }]}>{riskLabel}</Text>
          </View>
          <TouchableOpacity
            style={s.menuBtn}
            onPress={onMenuPress}
            hitSlop={8}
            activeOpacity={0.6}
            testID={`farm-menu-button-${farm.id}`}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Journey strip */}
      {journey && (
        <View style={s.journeyStrip}>
          <View style={s.journeyRow}>
            <Ionicons name="leaf-outline" size={12} color={theme.colors.primary} />
            <Text style={s.journeyText} numberOfLines={1}>
              {journey.common_name}{journey.current_stage ? ` · ${journey.current_stage}` : ''}
            </Text>
            <Text style={s.journeyPct}>{Math.round(journey.progress_percentage)}%</Text>
          </View>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${Math.min(journey.progress_percentage, 100)}%` as `${number}%` }]} />
          </View>
        </View>
      )}

      {/* Bottom row: tags + weather */}
      <View style={s.cardBottom}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tagRow}>
          <View style={s.tag}><Text style={s.tagText}>{safeNumber(farm.size_hectares, 0).toFixed(1)} ha</Text></View>
          {farm.irrigation_type ? <View style={s.tag}><Text style={s.tagText}>{farm.irrigation_type}</Text></View> : null}
          {farm.soil_type ? <View style={s.tag}><Text style={s.tagText}>{farm.soil_type}</Text></View> : null}
        </ScrollView>
        {temp != null && (
          <View style={s.weatherTag}>
            <Ionicons name="partly-sunny-outline" size={13} color={theme.colors.textMuted} />
            <Text style={s.weatherText}>{Math.round(temp)}°C</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function FarmsEmpty() {
  const { t } = useI18n();
  return (
    <View style={s.emptyCard}>
      <View style={s.emptyIcon}>
        <Ionicons name="leaf-outline" size={28} color={theme.colors.primary} />
      </View>
      <Text style={s.emptyTitle}>{t('farms.emptyTitle')}</Text>
      <Text style={s.emptyMeta}>{t('farms.emptyMeta')}</Text>
      <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/farms/new')} activeOpacity={0.8}>
        <Ionicons name="add" size={16} color="#fff" />
        <Text style={s.emptyBtnText}>{t('farms.addFirstFarm')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function HomeScreen() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [menuFarm, setMenuFarm] = useState<FarmRecord | null>(null);
  const queryClient = useQueryClient();

  const activeFarmQuery = useQuery({
    queryKey: ['active-farm-selection'],
    queryFn: () => farmRepository.getSelectedFarmId(),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['farms-screen'],
    queryFn: async () => {
      // Offline-first: read farms + journeys from the local DB (the source of
      // truth from the backend so the Farms tab matches the farm workspace and map.
      const farms = (await mobileApi.listFarms()).map(normalizeFarmRecord);
      const journeyEntries = await Promise.all(
        farms.map(async (farm) => [
          farm.id,
          (await mobileApi.listFarmJourneys(String(farm.id)).catch(() => [])).map(normalizeJourneyRecord),
        ] as const),
      );
      const journeys = journeyEntries.flatMap(([, farmJourneys]) => farmJourneys);

      const [weatherEntries, healthEntries] = await Promise.all([
        Promise.all(
        farms.map(async (farm) => {
          const weather = await mobileApi.getWeatherForFarm(farm.id).catch(() => null);
          return [
            farm.id,
            weather
              ? ({
                  farm_id: farm.id,
                  summary_json: JSON.stringify(weather),
                  fetched_at: new Date().toISOString(),
                } satisfies WeatherCacheRecord)
              : null,
          ] as const;
        }),
        ),
        Promise.all(
          farms.map(async (farm) => [
            farm.id,
            normalizeFarmHealthSummary(await mobileApi.getFarmHealthSummary(farm.id).catch(() => null)),
          ] as const),
        ),
      ]);

      const weatherMap: Record<string, WeatherCacheRecord | null> = {};
      for (const [farmId, weather] of weatherEntries) {
        weatherMap[farmId] = weather;
      }

      const healthMap: Record<string, FarmHealthSummary | null> = {};
      for (const [farmId, health] of healthEntries) {
        healthMap[farmId] = health;
      }

      return { farms, journeys, weatherMap, healthMap };
    },
  });

  const farms = data?.farms ?? [];
  const journeys = data?.journeys ?? [];
  const activeFarmId = activeFarmQuery.data ?? null;

  function journeyForFarm(farmId: string) {
    return journeys.find((j) => j.farm_id === farmId && (j.status === 'active' || j.status === 'planned')) ?? null;
  }

  async function handleSetActiveFarm(farmId: string) {
    await farmRepository.setSelectedFarmId(farmId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['active-farm-selection'] }),
      queryClient.invalidateQueries({ queryKey: ['today-screen'] }),
      queryClient.invalidateQueries({ queryKey: ['journey-screen'] }),
    ]);
  }

  const filtered = farms.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      safeText(f.name).toLowerCase().includes(q) ||
      safeText(f.region).toLowerCase().includes(q) ||
      (f.district ?? '').toLowerCase().includes(q) ||
      safeText(f.country).toLowerCase().includes(q)
    );
  });

  return (
    <Screen edges={['bottom']} contentContainerStyle={s.content}>

      {/* ── Farm count + primary action ── */}
      <View style={s.utilityRow}>
        <Text style={s.pageSubtitle}>
          {isLoading
            ? t('farms.loadingFarms')
            : `${t(farms.length === 1 ? 'farms.farmCountOne' : 'farms.farmCountMany', { n: farms.length })}${search && filtered.length !== farms.length ? t('farms.shownSuffix', { n: filtered.length }) : ''}`}
        </Text>
        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/farms/new')} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>{t('farms.addFarm')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search ── */}
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder={t('farms.searchFarms')}
          placeholderTextColor={theme.colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Farm list ── */}
      {isLoading ? (
        <View style={{ gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : isError ? (
        <View style={s.noResultsCard}>
          <Text style={s.noResultsText}>{error instanceof Error ? error.message : t('farms.couldNotLoad')}</Text>
        </View>
      ) : filtered.length > 0 ? (
        filtered.map((farm) => (
          <FarmCard
            key={farm.id}
            farm={farm}
            journey={journeyForFarm(farm.id)}
            weather={data?.weatherMap[farm.id]}
            healthSummary={data?.healthMap[farm.id]}
            isActive={String(activeFarmId) === String(farm.id)}
            onMenuPress={() => setMenuFarm(farm)}
          />
        ))
      ) : search ? (
        <View style={s.noResultsCard}>
          <Text style={s.noResultsText}>{t('farms.noFarmsMatchQuery', { q: search })}</Text>
        </View>
      ) : (
        <FarmsEmpty />
      )}

      {/* ── Action sheet ── */}
      {menuFarm && (
        <FarmActionSheet
          farm={menuFarm}
          isActive={String(activeFarmId) === String(menuFarm.id)}
          onSetActiveFarm={(farmId) => void handleSetActiveFarm(farmId)}
          onClose={() => setMenuFarm(null)}
        />
      )}

    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  content: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 8,
    paddingBottom: theme.spacing.lg,
  },

  utilityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  pageSubtitle: { flex: 1, fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, paddingVertical: 0 },

  // ── Card ──
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 20, padding: 14,
    borderWidth: 1, borderColor: theme.colors.border, gap: 10,
  },
  cardActive: {
    borderColor: '#b8d9c6',
    backgroundColor: '#f6fbf7',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  farmTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  farmName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  activeFarmBadge: {
    backgroundColor: '#e7f5ec',
    borderColor: '#c7e7d2',
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  activeFarmBadgeText: { fontSize: 10, fontWeight: '700', color: theme.colors.primary },
  locationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  locationText: { flex: 1, fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },

  riskBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  riskDot: { width: 7, height: 7, borderRadius: 4 },
  riskLabel: { fontSize: 11, fontWeight: '600' },
  menuBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1, borderColor: theme.colors.border,
  },

  // ── Journey ──
  journeyStrip: { gap: 6 },
  journeyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  journeyText: { flex: 1, fontSize: 12, fontWeight: '600', color: theme.colors.text },
  journeyPct: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  progressBar: { height: 4, backgroundColor: theme.colors.border, borderRadius: theme.radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%' as `${number}%`, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill },

  // ── Bottom ──
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagRow: { flexDirection: 'row', gap: 5 },
  tag: {
    backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill,
    paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: theme.colors.border,
  },
  tagText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  weatherTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  weatherText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },

  // ── Action sheet ──
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 10, paddingBottom: 32, paddingHorizontal: 20,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 16 },
  sheetFarmName: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  sheetFarmSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  sheetDivider: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginVertical: 14 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  sheetItemIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  sheetItemLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },

  // ── Empty ──
  emptyCard: {
    backgroundColor: theme.colors.surface, borderRadius: 24, padding: 28,
    borderWidth: 1.5, borderColor: theme.colors.border, borderStyle: 'dashed',
    alignItems: 'center', gap: 10,
  },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  emptyMeta: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 19 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6,
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill,
    paddingHorizontal: 18, paddingVertical: 11,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  loadingRow: { alignItems: 'center', paddingVertical: 32 },
  loadingText: { fontSize: 14, color: theme.colors.textMuted },
  noResultsCard: {
    backgroundColor: theme.colors.surface, borderRadius: 18, padding: 20,
    alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border,
  },
  noResultsText: { fontSize: 14, color: theme.colors.textMuted },
});
