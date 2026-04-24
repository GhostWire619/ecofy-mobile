import { Ionicons } from '@expo/vector-icons';
import { differenceInDays, format, parseISO } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FarmMapCard } from '@/components/map/farm-map-card';
import {
  farmRepository,
  journeyRepository,
  marketRepository,
  offlineMapRepository,
  plotRepository,
  weatherRepository,
} from '@/lib/db/repositories';
import type {
  JourneyRecord,
  PriceSnapshotRecord,
  StageRecord,
} from '@/lib/domain/types';
import { theme } from '@/lib/theme';
import { downloadOfflineFarmRegion } from '@/lib/maps/offline';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

function daysLeft(iso: string) {
  try {
    const d = differenceInDays(parseISO(iso), new Date());
    return d;
  } catch { return null; }
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function HeroCard({
  name,
  region,
  country,
  district,
  journey,
  temp,
}: {
  name: string;
  region: string;
  country: string;
  district?: string | null;
  journey?: JourneyRecord | null;
  temp?: number | null;
}) {
  const statusColor =
    journey?.status === 'active'  ? '#34d399' :
    journey?.status === 'planned' ? '#60a5fa' :
    journey?.status === 'paused'  ? '#fbbf24' :
    '#94a3b8';

  const statusLabel =
    journey?.status === 'active'  ? 'Active' :
    journey?.status === 'planned' ? 'Planned' :
    journey?.status === 'paused'  ? 'Paused' :
    'No journey';

  const location = [district, region, country].filter(Boolean).join(', ');

  return (
    <View style={s.hero}>
      {/* decorative ring */}
      <View style={s.heroRing} />

      {/* top badges row */}
      <View style={s.heroBadgeRow}>
        <View style={s.aiBadge}>
          <Ionicons name="sparkles" size={10} color="#a7f3d0" />
          <Text style={s.aiBadgeText}>AI FARM DESK</Text>
        </View>
        {journey && (
          <View style={[s.statusBadge, { borderColor: statusColor + '55' }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        )}
      </View>

      {/* farm name */}
      <Text style={s.heroName} numberOfLines={2}>{name}</Text>
      <View style={s.heroLocRow}>
        <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.6)" />
        <Text style={s.heroLoc} numberOfLines={1}>{location}</Text>
      </View>

      {/* bottom strip: journey + weather */}
      {(journey || temp != null) && (
        <View style={s.heroBottom}>
          {journey ? (
            <View style={s.heroJourneyChip}>
              <Ionicons name="leaf-outline" size={13} color="#34d399" />
              <Text style={s.heroJourneyText} numberOfLines={1}>
                {journey.common_name}
                {journey.current_stage ? ` · ${journey.current_stage}` : ''}
              </Text>
              <Text style={s.heroJourneyPct}>
                {Math.round(journey.progress_percentage)}%
              </Text>
            </View>
          ) : <View />}

          {temp != null && (
            <View style={s.heroWeather}>
              <Ionicons name="partly-sunny-outline" size={14} color="rgba(255,255,255,0.75)" />
              <Text style={s.heroWeatherText}>{Math.round(temp)}°C</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Journey card ─────────────────────────────────────────────────────────────

function JourneyCard({ journey }: { journey: JourneyRecord }) {
  const daysRemaining = daysLeft(journey.expected_harvest_date);
  const pct = Math.min(Math.max(journey.progress_percentage, 0), 100);

  return (
    <View style={s.sectionBlock}>
      <SectionHeader icon="leaf-outline" title="Active Journey" />
      <View style={s.card}>
        {/* crop row */}
        <View style={s.jRow}>
          <Text style={s.jCropName}>{journey.common_name}</Text>
          {journey.variety && (
            <View style={s.jVarietyPill}>
              <Text style={s.jVarietyText}>{journey.variety}</Text>
            </View>
          )}
        </View>

        {/* current stage */}
        {journey.current_stage && (
          <View style={s.jStagePill}>
            <View style={s.jStageDot} />
            <Text style={s.jStageText}>{journey.current_stage}</Text>
          </View>
        )}

        <View style={s.jDates}>
          <View style={s.jDateItem}>
            <Ionicons name="calendar-outline" size={13} color={theme.colors.textMuted} />
            <Text style={s.jDateLabel}>Planted</Text>
            <Text style={s.jDateValue}>{fmtDate(journey.planting_date)}</Text>
          </View>
          <View style={s.jDateSep} />
          <View style={s.jDateItem}>
            <Ionicons name="cut-outline" size={13} color={theme.colors.textMuted} />
            <Text style={s.jDateLabel}>Harvest</Text>
            <Text style={s.jDateValue}>{fmtDate(journey.expected_harvest_date)}</Text>
          </View>
          {daysRemaining != null && daysRemaining >= 0 && (
            <>
              <View style={s.jDateSep} />
              <View style={s.jDateItem}>
                <Ionicons name="hourglass-outline" size={13} color={theme.colors.textMuted} />
                <Text style={s.jDateLabel}>Remaining</Text>
                <Text style={s.jDateValue}>{daysRemaining}d</Text>
              </View>
            </>
          )}
        </View>

        {/* progress bar */}
        <View style={s.jProgressRow}>
          <View style={s.jProgressBar}>
            <View style={[s.jProgressFill, { width: `${pct}%` as `${number}%` }]} />
          </View>
          <Text style={s.jProgressPct}>{Math.round(pct)}%</Text>
        </View>

        {journey.predicted_yield != null && (
          <View style={s.jYieldRow}>
            <Ionicons name="stats-chart-outline" size={12} color={theme.colors.textMuted} />
            <Text style={s.jYieldText}>Predicted yield: {journey.predicted_yield} t/ha</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Stage timeline ───────────────────────────────────────────────────────────

const STAGE_STATUS: Record<StageRecord['status'], { icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = {
  completed: { icon: 'checkmark-circle', color: theme.colors.success },
  active:    { icon: 'radio-button-on',  color: theme.colors.primary },
  upcoming:  { icon: 'ellipse-outline',  color: theme.colors.disabled },
};

function StagesCard({ stages }: { stages: StageRecord[] }) {
  if (stages.length === 0) return null;
  return (
    <View style={s.sectionBlock}>
      <SectionHeader icon="git-branch-outline" title="Stage Timeline" />
      <View style={s.card}>
        {stages.map((stage, idx) => {
          const cfg = STAGE_STATUS[stage.status];
          const isLast = idx === stages.length - 1;
          return (
            <View key={stage.id} style={s.stageRow}>
              <View style={s.stageIconCol}>
                <Ionicons name={cfg.icon} size={18} color={cfg.color} />
                {!isLast && <View style={s.stageLine} />}
              </View>
              <View style={[s.stageContent, !isLast && { marginBottom: 16 }]}>
                <Text style={[s.stageName, stage.status === 'active' && s.stageNameActive]}>
                  {stage.name}
                </Text>
                {(stage.start_date || stage.end_date) && (
                  <Text style={s.stageDates}>
                    {stage.start_date ? fmtDate(stage.start_date) : '—'}
                    {' → '}
                    {stage.end_date ? fmtDate(stage.end_date) : '—'}
                  </Text>
                )}
                {stage.description && (
                  <Text style={s.stageDesc} numberOfLines={2}>{stage.description}</Text>
                )}
                {stage.status === 'active' && (
                  <View style={s.stageActivePill}>
                    <Text style={s.stageActivePillText}>In progress</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Market outlook ───────────────────────────────────────────────────────────

const TREND_ICON: Record<PriceSnapshotRecord['trend'], React.ComponentProps<typeof Ionicons>['name']> = {
  rising:  'trending-up-outline',
  falling: 'trending-down-outline',
  stable:  'remove-outline',
};
const TREND_COLOR: Record<PriceSnapshotRecord['trend'], string> = {
  rising:  theme.colors.success,
  falling: theme.colors.danger,
  stable:  theme.colors.textMuted,
};

function MarketCard({ prices, cropName }: { prices: PriceSnapshotRecord[]; cropName: string }) {
  const relevant = prices.filter((p) =>
    p.commodity.toLowerCase().includes(cropName.toLowerCase()) ||
    cropName.toLowerCase().includes(p.commodity.toLowerCase())
  );
  if (relevant.length === 0) return null;

  return (
    <View style={s.sectionBlock}>
      <SectionHeader icon="stats-chart-outline" title="Market Outlook" />
      <View style={s.card}>
        <Text style={s.marketNote}>Local market prices for {cropName}</Text>
        {relevant.map((p) => (
          <View key={p.id} style={s.marketRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.marketName}>{p.market_name}</Text>
              <Text style={s.marketRegion}>{p.region}</Text>
            </View>
            <View style={s.marketPriceCol}>
              <Text style={s.marketPrice}>
                {p.currency} {p.price}/{p.unit}
              </Text>
              <View style={s.marketTrendRow}>
                <Ionicons name={TREND_ICON[p.trend]} size={13} color={TREND_COLOR[p.trend]} />
                <Text style={[s.marketTrendText, { color: TREND_COLOR[p.trend] }]}>
                  {p.trend.charAt(0).toUpperCase() + p.trend.slice(1)}
                </Text>
              </View>
            </View>
          </View>
        ))}
        <TouchableOpacity
          style={s.marketMoreBtn}
          onPress={() => router.push('/(tabs)/market' as any)}
          activeOpacity={0.7}
        >
          <Text style={s.marketMoreText}>View full market →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Field info ───────────────────────────────────────────────────────────────

function FieldInfoCard({
  sizeHectares,
  soilType,
  irrigationType,
  latitude,
  longitude,
  elevation,
}: {
  sizeHectares: number;
  soilType?: string | null;
  irrigationType: string;
  latitude: number;
  longitude: number;
  elevation?: number | null;
}) {
  const rows: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }[] = [
    { icon: 'resize-outline',       label: 'Size',        value: `${sizeHectares.toFixed(2)} hectares` },
    { icon: 'water-outline',        label: 'Irrigation',  value: irrigationType },
    { icon: 'layers-outline',       label: 'Soil type',   value: soilType ?? 'Not specified' },
    { icon: 'navigate-circle-outline', label: 'Coordinates', value: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` },
  ];
  if (elevation != null) {
    rows.push({ icon: 'trending-up-outline', label: 'Elevation', value: `${Math.round(elevation)} m` });
  }

  return (
    <View style={s.sectionBlock}>
      <SectionHeader icon="leaf-outline" title="Field Info" />
      <View style={s.card}>
        {rows.map((row, idx) => (
          <View key={row.label} style={[s.fieldRow, idx > 0 && s.fieldRowBorder]}>
            <View style={s.fieldIconWrap}>
              <Ionicons name={row.icon} size={15} color={theme.colors.primary} />
            </View>
            <Text style={s.fieldLabel}>{row.label}</Text>
            <Text style={s.fieldValue} numberOfLines={1}>{row.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Ionicons name={icon} size={15} color={theme.colors.primary} />
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FarmDetailScreen() {
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ farmId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['farm-detail', params.farmId],
    queryFn: async () => {
      const farmId = Array.isArray(params.farmId) ? params.farmId[0] : params.farmId;
      if (!farmId) return null;

      const [farm, plots, regions, allJourneys, prices, weather] = await Promise.all([
        farmRepository.getFarm(farmId),
        plotRepository.listPlotsForFarm(farmId),
        offlineMapRepository.listRegions(),
        journeyRepository.listJourneys(),
        marketRepository.listPrices(),
        weatherRepository.getWeatherForFarm(farmId),
      ]);

      const journey = allJourneys.find(
        (j) => j.farm_id === farmId && (j.status === 'active' || j.status === 'planned')
      ) ?? null;

      const stages = journey ? await journeyRepository.listStages(journey.id) : [];

      return {
        farm,
        plot: plots[0] ?? null,
        region: regions.find((r) => r.farm_id === farmId) ?? null,
        journey,
        stages,
        prices,
        weather,
      };
    },
  });

  const markOfflineMutation = useMutation({
    mutationFn: async () => {
      if (!data?.farm) return;
      return downloadOfflineFarmRegion(data.farm, data.region);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['farm-detail', params.farmId] });
      await queryClient.invalidateQueries({ queryKey: ['farms-screen'] });
    },
  });

  const temp = (() => {
    if (!data?.weather?.summary_json) return null;
    try {
      const p = JSON.parse(data.weather.summary_json) as Record<string, unknown>;
      const t = p.temp ?? p.temperature ?? (p.current as Record<string, unknown>)?.temp;
      return typeof t === 'number' ? t : null;
    } catch { return null; }
  })();

  if (isLoading) {
    return (
      <SafeAreaView style={s.safeArea} edges={['bottom']}>
        <View style={s.loading}>
          <Text style={s.loadingText}>Loading farm…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data?.farm) {
    return (
      <SafeAreaView style={s.safeArea} edges={['bottom']}>
        <View style={s.loading}>
          <Ionicons name="leaf-outline" size={36} color={theme.colors.primary} />
          <Text style={s.loadingText}>Farm not found</Text>
          <Text style={s.loadingMeta}>This farm may not be available on this device yet.</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
            <Text style={s.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { farm, journey, stages, prices, plot, region } = data;

  return (
    <SafeAreaView style={s.safeArea} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <HeroCard
          name={farm.name}
          region={farm.region}
          country={farm.country}
          district={farm.district}
          journey={journey}
          temp={temp}
        />

        {/* Journey */}
        {journey && <JourneyCard journey={journey} />}

        {/* Stages */}
        {stages.length > 0 && <StagesCard stages={stages} />}

        {/* Market outlook */}
        {journey && (
          <MarketCard prices={prices} cropName={journey.common_name} />
        )}

        {/* Field info */}
        <FieldInfoCard
          sizeHectares={farm.size_hectares}
          soilType={farm.soil_type}
          irrigationType={farm.irrigation_type}
          latitude={farm.latitude}
          longitude={farm.longitude}
          elevation={farm.elevation}
        />

        {/* Map */}
        <View style={s.sectionBlock}>
          <SectionHeader icon="map-outline" title="Farm Map" />
          <FarmMapCard
            farm={farm}
            plot={plot}
            mapRegion={region}
            isDownloading={markOfflineMutation.isPending}
            downloadError={
              markOfflineMutation.error instanceof Error
                ? markOfflineMutation.error.message
                : null
            }
            onDownloadOffline={() => markOfflineMutation.mutate()}
          />
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.lg },

  // loading / error
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  loadingText: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  loadingMeta: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  backBtn: {
    marginTop: 8, backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill, paddingHorizontal: 24, paddingVertical: 11,
  },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Hero ──
  hero: {
    backgroundColor: theme.colors.primaryDark,
    borderRadius: 24, padding: 20, gap: 6,
    overflow: 'hidden', minHeight: 170,
    ...theme.shadow,
  },
  heroRing: {
    position: 'absolute', right: -60, top: -60,
    width: 200, height: 200, borderRadius: 100,
    borderWidth: 40, borderColor: 'rgba(255,255,255,0.05)',
  },
  heroBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: theme.radius.pill, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  aiBadgeText: { fontSize: 9, fontWeight: '800', color: '#a7f3d0', letterSpacing: 0.8 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: theme.radius.pill, paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  heroName: { fontSize: 24, fontWeight: '800', color: '#fff', lineHeight: 30 },
  heroLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroLoc: { fontSize: 13, color: 'rgba(255,255,255,0.6)', flex: 1 },
  heroBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.15)',
  },
  heroJourneyChip: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1 },
  heroJourneyText: { flex: 1, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  heroJourneyPct: { fontSize: 13, fontWeight: '800', color: '#34d399' },
  heroWeather: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroWeatherText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },

  // ── Section ──
  sectionBlock: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  card: {
    backgroundColor: theme.colors.surface, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: theme.colors.border, ...theme.shadow,
  },

  // ── Journey card ──
  jRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  jCropName: { fontSize: 18, fontWeight: '800', color: theme.colors.text, flex: 1 },
  jVarietyPill: {
    backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  jVarietyText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  jStagePill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: theme.colors.primary + '14',
    borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 5,
    alignSelf: 'flex-start', marginBottom: 12,
  },
  jStageDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.primary },
  jStageText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  jDates: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 },
  jDateItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  jDateSep: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: theme.colors.border, marginHorizontal: 4 },
  jDateLabel: { fontSize: 11, color: theme.colors.textMuted },
  jDateValue: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  jProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  jProgressBar: {
    flex: 1, height: 6, backgroundColor: theme.colors.border,
    borderRadius: theme.radius.pill, overflow: 'hidden',
  },
  jProgressFill: {
    height: '100%' as `${number}%`,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill,
  },
  jProgressPct: { fontSize: 13, fontWeight: '800', color: theme.colors.primary, width: 36, textAlign: 'right' },
  jYieldRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  jYieldText: { fontSize: 12, color: theme.colors.textMuted },

  // ── Stages ──
  stageRow: { flexDirection: 'row', gap: 12 },
  stageIconCol: { alignItems: 'center', width: 20 },
  stageLine: { flex: 1, width: 2, backgroundColor: theme.colors.border, marginTop: 4, borderRadius: 1 },
  stageContent: { flex: 1, gap: 3 },
  stageName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  stageNameActive: { color: theme.colors.primary },
  stageDates: { fontSize: 11, color: theme.colors.textMuted },
  stageDesc: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 17 },
  stageActivePill: {
    alignSelf: 'flex-start', marginTop: 4,
    backgroundColor: theme.colors.primary + '14',
    borderRadius: theme.radius.pill, paddingHorizontal: 9, paddingVertical: 3,
  },
  stageActivePillText: { fontSize: 10, fontWeight: '700', color: theme.colors.primary },

  // ── Market ──
  marketNote: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 10 },
  marketRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
  },
  marketName: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  marketRegion: { fontSize: 11, color: theme.colors.textMuted },
  marketPriceCol: { alignItems: 'flex-end', gap: 3 },
  marketPrice: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  marketTrendRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  marketTrendText: { fontSize: 11, fontWeight: '600' },
  marketMoreBtn: { marginTop: 12, alignSelf: 'flex-end' },
  marketMoreText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },

  // ── Field info ──
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  fieldRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  fieldIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  fieldLabel: { fontSize: 13, color: theme.colors.textMuted, width: 90, flexShrink: 0 },
  fieldValue: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.colors.text, textAlign: 'right' },
});
