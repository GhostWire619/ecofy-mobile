import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
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
import {
  farmRepository,
  journeyRepository,
  weatherRepository,
} from '@/lib/db/repositories';
import type { FarmRecord, JourneyRecord, WeatherCacheRecord } from '@/lib/domain/types';
import { theme } from '@/lib/theme';

// ─── Risk helpers ─────────────────────────────────────────────────────────────

type RiskLevel = 'low' | 'moderate' | 'high' | 'critical' | 'none';

const RISK: Record<RiskLevel, { label: string; color: string; dot: string }> = {
  low:      { label: 'Looking good',       color: theme.colors.success,   dot: theme.colors.success   },
  moderate: { label: 'Needs attention',    color: theme.colors.warning,   dot: theme.colors.warning   },
  high:     { label: 'At risk',            color: '#f97316',               dot: '#f97316'              },
  critical: { label: 'Urgent action',      color: theme.colors.danger,    dot: theme.colors.danger    },
  none:     { label: 'No journey',         color: theme.colors.textMuted, dot: theme.colors.textMuted },
};

function deriveRisk(journey?: JourneyRecord | null): RiskLevel {
  if (!journey) return 'none';
  const p = journey.progress_percentage;
  if (p >= 70) return 'low';
  if (p >= 40) return 'moderate';
  if (p >= 10) return 'high';
  return 'critical';
}

// ─── Farm action sheet ────────────────────────────────────────────────────────

function FarmActionSheet({
  farm,
  onClose,
  onDelete,
}: {
  farm: FarmRecord;
  onClose: () => void;
  onDelete: () => void;
}) {
  const actions: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    onPress: () => void;
    destructive?: boolean;
  }[] = [
    {
      icon: 'map-outline',
      label: 'View map',
      onPress: () => { onClose(); router.push(`/farms/${farm.id}` as any); },
    },
    {
      icon: 'create-outline',
      label: 'Edit farm',
      onPress: () => { onClose(); router.push(`/farms/${farm.id}` as any); },
    },
    {
      icon: 'sparkles-outline',
      label: 'Ask AI',
      onPress: () => { onClose(); router.push('/assistant' as any); },
    },
    {
      icon: 'trash-outline',
      label: 'Delete farm',
      destructive: true,
      onPress: () => { onClose(); onDelete(); },
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
            <TouchableOpacity key={a.label} style={s.sheetItem} onPress={a.onPress} activeOpacity={0.7}>
              <View style={[s.sheetItemIcon, a.destructive && s.sheetItemIconDanger]}>
                <Ionicons name={a.icon} size={18} color={a.destructive ? theme.colors.danger : theme.colors.primary} />
              </View>
              <Text style={[s.sheetItemLabel, a.destructive && s.sheetItemLabelDanger]}>{a.label}</Text>
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
}: {
  farm: FarmRecord;
  journey?: JourneyRecord | null;
  weather?: WeatherCacheRecord | null;
  onMenuPress: () => void;
}) {
  const risk = deriveRisk(journey);
  const { label: riskLabel, color: riskColor, dot: riskDot } = RISK[risk];

  const location = [farm.district, farm.region, farm.country].filter(Boolean).join(', ') || 'Location not set';

  const temp = (() => {
    if (!weather?.summary_json) return null;
    try {
      const p = JSON.parse(weather.summary_json) as Record<string, unknown>;
      const t = p.temp ?? p.temperature ?? (p.current as Record<string, unknown>)?.temp;
      return typeof t === 'number' ? t : null;
    } catch { return null; }
  })();

  return (
    <TouchableOpacity style={s.card} activeOpacity={0.75} onPress={() => router.push(`/farms/${farm.id}` as any)}>
      {/* Top row */}
      <View style={s.cardTop}>
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Text style={s.farmName} numberOfLines={1}>{farm.name}</Text>
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
          <TouchableOpacity style={s.menuBtn} onPress={onMenuPress} hitSlop={8} activeOpacity={0.6}>
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
          <View style={s.tag}><Text style={s.tagText}>{farm.size_hectares.toFixed(1)} ha</Text></View>
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
  return (
    <View style={s.emptyCard}>
      <View style={s.emptyIcon}>
        <Ionicons name="leaf-outline" size={28} color={theme.colors.primary} />
      </View>
      <Text style={s.emptyTitle}>No farms</Text>
      <Text style={s.emptyMeta}>
        Create your first farm to unlock offline mapping, weather, and crop journey tracking.
      </Text>
      <TouchableOpacity style={s.emptyBtn} onPress={() => router.push('/farms/new')} activeOpacity={0.8}>
        <Ionicons name="add" size={16} color="#fff" />
        <Text style={s.emptyBtnText}>Add first farm</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function HomeScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [menuFarm, setMenuFarm] = useState<FarmRecord | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['farms-screen'],
    queryFn: async () => {
      const [farms, journeys] = await Promise.all([
        farmRepository.listFarms(),
        journeyRepository.listJourneys(),
      ]);
      const weatherMap: Record<string, WeatherCacheRecord | null> = {};
      await Promise.all(farms.map(async (f) => {
        weatherMap[f.id] = await weatherRepository.getWeatherForFarm(f.id);
      }));
      return { farms, journeys, weatherMap };
    },
  });

  const farms = data?.farms ?? [];
  const journeys = data?.journeys ?? [];

  function journeyForFarm(farmId: string) {
    return journeys.find((j) => j.farm_id === farmId && (j.status === 'active' || j.status === 'planned')) ?? null;
  }

  const filtered = farms.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.name.toLowerCase().includes(q) ||
      f.region.toLowerCase().includes(q) ||
      (f.district ?? '').toLowerCase().includes(q) ||
      (f.country ?? '').toLowerCase().includes(q)
    );
  });

  function handleDelete() {
    if (!menuFarm) return;
    Alert.alert(
      'Delete farm',
      `Are you sure you want to delete "${menuFarm.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await farmRepository.softDeleteFarm(menuFarm.id);
            void queryClient.invalidateQueries({ queryKey: ['farms-screen'] });
          },
        },
      ],
    );
  }

  return (
    <Screen edges={['bottom']} contentContainerStyle={s.content}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.pageTitle}>Farms</Text>
          {!isLoading && (
            <Text style={s.pageSubtitle}>
              {farms.length} farm{farms.length !== 1 ? 's' : ''}
              {search && filtered.length !== farms.length ? ` · ${filtered.length} shown` : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/farms/new')} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.addBtnText}>Add farm</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search ── */}
      <View style={s.searchBar}>
        <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
        <TextInput
          style={s.searchInput}
          placeholder="Search farms by name or location…"
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
        <View style={s.loadingRow}>
          <Text style={s.loadingText}>Loading farms…</Text>
        </View>
      ) : filtered.length > 0 ? (
        filtered.map((farm) => (
          <FarmCard
            key={farm.id}
            farm={farm}
            journey={journeyForFarm(farm.id)}
            weather={data?.weatherMap[farm.id]}
            onMenuPress={() => setMenuFarm(farm)}
          />
        ))
      ) : search ? (
        <View style={s.noResultsCard}>
          <Text style={s.noResultsText}>No farms match "{search}"</Text>
        </View>
      ) : (
        <FarmsEmpty />
      )}

      {/* ── Action sheet ── */}
      {menuFarm && (
        <FarmActionSheet
          farm={menuFarm}
          onClose={() => setMenuFarm(null)}
          onDelete={handleDelete}
        />
      )}

    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  content: { gap: theme.spacing.lg, padding: theme.spacing.lg },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerLeft: { flex: 1, gap: 2 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  pageSubtitle: { fontSize: 13, color: theme.colors.textMuted },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14, paddingVertical: 9,
    shadowColor: theme.colors.primary, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    ...theme.shadow,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, paddingVertical: 0 },

  // ── Card ──
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 20, padding: 14,
    borderWidth: 1, borderColor: theme.colors.border, gap: 10, ...theme.shadow,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  farmName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
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
  sheetItemIconDanger: { backgroundColor: theme.colors.danger + '14' },
  sheetItemLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  sheetItemLabelDanger: { color: theme.colors.danger },

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
