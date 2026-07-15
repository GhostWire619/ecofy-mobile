import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Stop,
  Line as SvgLine,
  Text as SvgText,
} from 'react-native-svg';

import { Screen } from '@/components/layout/screen';
import { mobileApi } from '@/lib/api/mobile';
import { theme } from '@/lib/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type TrendInterval = 'week' | 'month' | 'year';
type ViewTab = 'prices' | 'comparison' | 'news';

type TrendBucket = {
  bucket: string;
  avg_price: number | null;
  moving_avg: number | null;
  high: number | null;
  low: number | null;
  samples: number | null;
};

type TrendData = {
  crop_id?: string;
  region?: string;
  interval?: string;
  points: TrendBucket[];
};

type PriceRegion = { id: string; name: string };

type CompRegion = {
  region: string;
  district?: string | null;
  date?: string | null;
  mid_price?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  available: boolean;
};

type CompareData = { regions: CompRegion[] };

type CropItem = { id: string; common_name?: string; name?: string };

type LatestPrice = {
  crop_id: string;
  region: string;
  date: string;
  min_price: number | null;
  max_price: number | null;
  mid_price: number | null;
} | null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(value?: number | null) {
  if (value == null || Number.isNaN(value)) return 'N/A';
  return `${value.toLocaleString()} TZS`;
}

function formatDate(value?: string | null) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatBucketLabel(value: string, interval: TrendInterval) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  if (interval === 'year') return d.getFullYear().toString();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    year: interval === 'month' ? '2-digit' : undefined,
    day: interval === 'week' ? 'numeric' : undefined,
  });
}

function formatYTick(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function getTrendDirection(trends: TrendData | null): 'up' | 'down' | 'stable' {
  const pts = trends?.points ?? [];
  const latest = pts[pts.length - 1]?.avg_price;
  const prev = pts[pts.length - 2]?.avg_price;
  if (latest == null || prev == null || prev === 0) return 'stable';
  const pct = ((latest - prev) / prev) * 100;
  if (pct > 1) return 'up';
  if (pct < -1) return 'down';
  return 'stable';
}

function getTrendChangePct(trends: TrendData | null) {
  const pts = trends?.points ?? [];
  const latest = pts[pts.length - 1]?.avg_price;
  const prev = pts[pts.length - 2]?.avg_price;
  if (latest == null || prev == null || prev === 0) return null;
  return ((latest - prev) / prev) * 100;
}

function deriveLatest(trends: TrendData | null, cropId: string, region?: string): LatestPrice {
  const pt = [...(trends?.points ?? [])]
    .reverse()
    .find((p) => p.avg_price != null || p.moving_avg != null || p.high != null || p.low != null);
  if (!pt) return null;
  const mid = pt.avg_price ?? pt.moving_avg ?? pt.high ?? pt.low ?? null;
  return {
    crop_id: cropId,
    region: region || trends?.region || '',
    date: pt.bucket,
    min_price: pt.low ?? mid,
    max_price: pt.high ?? mid,
    mid_price: mid,
  };
}

function rangeLabel(lp: LatestPrice) {
  if (!lp || (lp.min_price == null && lp.max_price == null)) return 'N/A';
  if (lp.min_price != null && lp.max_price != null)
    return `${lp.min_price.toLocaleString()} – ${lp.max_price.toLocaleString()} TZS`;
  return formatPrice(lp.min_price ?? lp.max_price);
}

// ─── SVG Area Chart ───────────────────────────────────────────────────────────

const CHART_H = 260;          // taller container
const Y_LABEL_W = 54;          // slightly wider for 6-char labels like "280k"
const X_LABEL_H = 22;
const PLOT_PAD_RIGHT = 18;     // keeps last x-label inside the SVG
const PLOT_H = CHART_H - X_LABEL_H;
const PLOT_PAD_TOP = 20;       // stops topmost y-label from clipping
const PLOT_PAD_BOTTOM = 10;

function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 2)];
    const p1 = pts[i - 1];
    const p2 = pts[i];
    const p3 = pts[Math.min(pts.length - 1, i + 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

function PriceAreaChart({
  points,
  interval,
  width,
}: {
  points: TrendBucket[];
  interval: TrendInterval;
  width: number;
}) {
  const valid = points.filter((p) => p.avg_price != null);
  if (valid.length < 2) {
    return (
      <View style={{ height: CHART_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>No price data yet</Text>
      </View>
    );
  }

  const prices = valid.map((p) => p.avg_price!);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);

  // ── Axis scale that always contains the data ───────────────────────────────
  // 1. Pick a round tick step based on the visible data range
  const rawRange = Math.max(rawMax - rawMin, rawMax * 0.05, 1000);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawRange / 4)));
  const niceSteps = [1, 2, 2.5, 5, 10].map((n) => n * magnitude);
  const tickStep = niceSteps.find((s) => rawRange / s <= 6) ?? niceSteps[niceSteps.length - 1];

  // 2. Round axis min DOWN and axis max UP to the nearest tickStep
  //    so every data point is guaranteed to sit inside the axis range
  const axisMin = Math.floor(rawMin / tickStep) * tickStep;
  const axisMax = Math.ceil(rawMax / tickStep) * tickStep;
  const axisRange = axisMax - axisMin;
  const tickCount = Math.round(axisRange / tickStep); // dynamic, usually 4-6

  const plotW = width - Y_LABEL_W - PLOT_PAD_RIGHT;

  function toSvgY(price: number) {
    const ratio = (price - axisMin) / axisRange;
    return PLOT_H - PLOT_PAD_BOTTOM - ratio * (PLOT_H - PLOT_PAD_TOP - PLOT_PAD_BOTTOM);
  }

  const svgPts = valid.map((pt, i) => ({
    x: Y_LABEL_W + (i / (valid.length - 1)) * plotW,
    y: toSvgY(pt.avg_price!),
    bucket: pt.bucket,
  }));

  const line = smoothPath(svgPts);
  const area =
    line +
    ` L${svgPts[svgPts.length - 1].x},${PLOT_H} L${svgPts[0].x},${PLOT_H} Z`;

  // Y-axis ticks — derived from the computed axis bounds
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => ({
    value: axisMin + i * tickStep,
    y: toSvgY(axisMin + i * tickStep),
  }));

  // X-axis ticks (~5 evenly spaced)
  const xTickEvery = Math.max(1, Math.ceil(svgPts.length / 5));
  const xTicks = svgPts.filter((_, i) => i % xTickEvery === 0 || i === svgPts.length - 1);

  return (
    <Svg width={width} height={CHART_H}>
      <Defs>
        <LinearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={theme.colors.primary} stopOpacity={0.22} />
          <Stop offset="100%" stopColor={theme.colors.primary} stopOpacity={0.03} />
        </LinearGradient>
      </Defs>

      {/* Grid lines */}
      {yTicks.map((tick) => (
        <SvgLine
          key={tick.value}
          x1={Y_LABEL_W}
          y1={tick.y}
          x2={Y_LABEL_W + plotW}
          y2={tick.y}
          stroke={theme.colors.border}
          strokeWidth={0.8}
          strokeDasharray="4 4"
        />
      ))}

      {/* Area fill */}
      <Path d={area} fill="url(#ag)" />

      {/* Line */}
      <Path
        d={line}
        stroke={theme.colors.primary}
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Y-axis labels */}
      {yTicks.map((tick) => (
        <SvgText
          key={tick.value}
          x={Y_LABEL_W - 5}
          y={tick.y + 3.5}
          fontSize={9}
          fill={theme.colors.textMuted}
          textAnchor="end"
        >
          {formatYTick(tick.value)}
        </SvgText>
      ))}

      {/* X-axis labels — first anchored left, last anchored right, rest centred */}
      {xTicks.map((tick, i) => {
        const anchor =
          i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle';
        return (
          <SvgText
            key={tick.bucket}
            x={tick.x}
            y={CHART_H - 3}
            fontSize={9}
            fill={theme.colors.textMuted}
            textAnchor={anchor}
          >
            {formatBucketLabel(tick.bucket, interval)}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ─── Picker bottom sheet ──────────────────────────────────────────────────────

function PickerSheet<T extends { id: string; name: string }>({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  items: T[];
  selectedId: string;
  onSelect: (item: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* flex:1 column — backdrop fills space above sheet, sheet sits at bottom */}
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: theme.colors.overlay }} />
        </TouchableWithoutFeedback>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 360 }}>
            {items.map((item) => {
              const active = item.id === selectedId;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[s.sheetItem, active && s.sheetItemActive]}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.sheetItemText, active && s.sheetItemTextActive]}>
                    {item.name}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── KPI cell ─────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <View style={s.kpiCell}>
      <Text style={s.kpiLabel}>{label.toUpperCase()}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
        {icon ? <Ionicons name={icon} size={13} color={color ?? theme.colors.text} /> : null}
        <Text style={[s.kpiValue, color ? { color } : {}]} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function MarketScreen() {
  const [activeTab, setActiveTab] = useState<ViewTab>('prices');
  const [selectedCropId, setSelectedCropId] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [interval, setInterval] = useState<TrendInterval>('month');
  const [refreshKey, setRefreshKey] = useState(0);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  const { data: filters, isLoading: filtersLoading } = useQuery({
    queryKey: ['market-filters'],
    queryFn: async () => {
      const [cropsRes, regionsRes] = await Promise.allSettled([
        mobileApi.fetchCropCatalog(),
        mobileApi.getPriceRegions(),
      ]);
      const crops: CropItem[] =
        cropsRes.status === 'fulfilled' ? (cropsRes.value as CropItem[]) : [];
      const regions: PriceRegion[] =
        regionsRes.status === 'fulfilled' &&
        Array.isArray((regionsRes.value as { regions?: PriceRegion[] })?.regions)
          ? (regionsRes.value as { regions: PriceRegion[] }).regions
          : [];
      return { crops, regions };
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!selectedCropId && filters?.crops?.length) {
      setSelectedCropId(filters.crops[0].id);
    }
  }, [filters, selectedCropId]);

  // ── Market data ─────────────────────────────────────────────────────────────
  const { data: marketData, isLoading: marketLoading } = useQuery({
    queryKey: ['market-data', selectedCropId, selectedRegion, interval, refreshKey],
    queryFn: async () => {
      if (!selectedCropId) return { trends: null as TrendData | null, compare: null };
      const regionNames = (filters?.regions ?? []).map((r) => r.name);
      const [trendsRes, compareRes] = await Promise.allSettled([
        mobileApi.getPriceTrends({
          crop: selectedCropId,
          region: selectedRegion || undefined,
          interval,
          moving_window: 3,
        }),
        regionNames.length > 0
          ? mobileApi.getPriceCompare({ crop: selectedCropId, regions: regionNames })
          : Promise.resolve(null),
      ]);
      return {
        trends: trendsRes.status === 'fulfilled' ? (trendsRes.value as TrendData) : null,
        compare:
          compareRes.status === 'fulfilled' ? (compareRes.value as CompareData | null) : null,
      };
    },
    enabled: !!selectedCropId,
    staleTime: 2 * 60 * 1000,
  });

  // ── Derived ─────────────────────────────────────────────────────────────────
  const crops = filters?.crops ?? [];
  const regions = filters?.regions ?? [];
  const trendData = marketData?.trends ?? null;
  const compareData = marketData?.compare ?? null;

  const selectedCrop = crops.find((c) => c.id === selectedCropId) ?? null;
  const cropName = selectedCrop?.common_name ?? selectedCrop?.name ?? 'Select crop';

  const latestPrice = useMemo(
    () => deriveLatest(trendData, selectedCropId, selectedRegion || undefined),
    [trendData, selectedCropId, selectedRegion],
  );

  const dir = getTrendDirection(trendData);
  const pct = getTrendChangePct(trendData);
  const dirLabel = dir === 'up' ? 'Rising' : dir === 'down' ? 'Falling' : 'Stable';
  const dirIcon =
    dir === 'up'
      ? ('trending-up' as const)
      : dir === 'down'
        ? ('trending-down' as const)
        : ('remove-outline' as const);
  const dirColor =
    dir === 'up'
      ? theme.colors.success
      : dir === 'down'
        ? theme.colors.danger
        : theme.colors.textMuted;

  const compRows = useMemo(() => {
    const rows = compareData?.regions ?? [];
    const avail = rows
      .filter((r) => r.available && r.mid_price != null)
      .sort((a, b) => (b.mid_price ?? 0) - (a.mid_price ?? 0));
    const unavail = rows
      .filter((r) => !r.available || r.mid_price == null)
      .sort((a, b) => a.region.localeCompare(b.region));
    return [...avail, ...unavail];
  }, [compareData]);

  const bestRegion = compRows.find((r) => r.available && r.mid_price != null) ?? null;
  const availableCount = compRows.filter((r) => r.available).length;

  const marketNotes = [
    {
      title: 'Price direction',
      body:
        pct != null
          ? `${cropName} is ${dirLabel.toLowerCase()} ${pct > 0 ? 'by' : 'at'} ${Math.abs(pct).toFixed(1)}% versus the previous ${interval} bucket.`
          : 'Price direction will appear once enough historical data is available.',
    },
    {
      title: 'Best region',
      body: bestRegion?.mid_price
        ? `${bestRegion.region} currently shows the strongest observed midpoint at ${bestRegion.mid_price.toLocaleString()} TZS.`
        : 'Regional rankings will appear once comparison data is available.',
    },
    {
      title: 'Latest market update',
      body: latestPrice?.date
        ? `The latest recorded update for ${cropName} was on ${formatDate(latestPrice.date)}${latestPrice.region ? ` in ${latestPrice.region}` : ''}.`
        : 'Latest price updates will appear here when records are available.',
    },
  ];

  // Picker items shaped for PickerSheet
  const cropItems = crops.map((c) => ({ id: c.id, name: c.common_name ?? c.name ?? c.id }));
  const regionItems = [
    { id: '', name: 'Tanzania (all regions)' },
    ...regions.map((r) => ({ id: r.name, name: r.name })),
  ];

  const TABS: { id: ViewTab; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { id: 'prices', label: 'Crop Prices', icon: 'bar-chart-outline' },
    { id: 'comparison', label: 'Comparison', icon: 'git-compare-outline' },
    { id: 'news', label: 'News', icon: 'newspaper-outline' },
  ];

  const INTERVALS: { value: TrendInterval; label: string }[] = [
    { value: 'week', label: 'Weekly' },
    { value: 'month', label: 'Monthly' },
    { value: 'year', label: 'Yearly' },
  ];

  return (
    <Screen contentContainerStyle={s.content}>
      {/* ── Tabs + crop selector ── */}
      <View style={s.topBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[s.tabBtn, activeTab === t.id && s.tabBtnActive]}
              onPress={() => setActiveTab(t.id)}
              activeOpacity={0.8}
            >
              <Ionicons name={t.icon} size={13} color={activeTab === t.id ? '#fff' : theme.colors.textMuted} />
              <Text style={[s.tabBtnText, activeTab === t.id && s.tabBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Crop + Refresh */}
        <View style={s.cropRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.cropLabel}>Crop</Text>
            <TouchableOpacity style={s.cropPicker} onPress={() => setCropModalOpen(true)} activeOpacity={0.8}>
              <Text style={s.cropPickerText} numberOfLines={1}>
                {filtersLoading ? 'Loading…' : cropName}
              </Text>
              <Ionicons name="chevron-down" size={12} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.refreshBtn} onPress={() => setRefreshKey((k) => k + 1)} activeOpacity={0.8}>
            {marketLoading
              ? <ActivityIndicator size="small" color={theme.colors.primary} />
              : <Ionicons name="refresh-outline" size={18} color={theme.colors.text} />
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* ── No crop ── */}
      {!selectedCropId && !filtersLoading && (
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>Choose a crop above to load market prices.</Text>
        </View>
      )}

      {/* ════════════════════════════════════════════════════
          TAB: PRICES
          ════════════════════════════════════════════════════ */}
      {activeTab === 'prices' && !!selectedCropId && (
        <>
          {/* Heading + filters */}
          <View style={s.sectionHead}>
            <Text style={s.trendHeading} numberOfLines={2}>
              Price Trend - {cropName} - {selectedRegion || 'Tanzania'}
            </Text>
            <View style={s.filterRow}>
              {/* Region picker — flex:1 so long names truncate instead of pushing interval down */}
              <View style={[s.filterGroup, { flex: 1, minWidth: 0 }]}>
                <Text style={s.filterGroupLabel}>Region</Text>
                <TouchableOpacity style={s.filterPill} onPress={() => setRegionModalOpen(true)} activeOpacity={0.8}>
                  <Text style={s.filterPillText} numberOfLines={1}>{selectedRegion || 'Tanzania'}</Text>
                  <Ionicons name="chevron-down" size={11} color={theme.colors.text} />
                </TouchableOpacity>
              </View>

              {/* Interval toggle — fixed width, always on the same row */}
              <View style={s.filterGroup}>
                <Text style={s.filterGroupLabel}>Interval</Text>
                <View style={s.intervalGroup}>
                  {INTERVALS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[s.intervalBtn, interval === opt.value && s.intervalBtnActive]}
                      onPress={() => setInterval(opt.value)}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.intervalBtnText, interval === opt.value && s.intervalBtnTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* KPI row */}
          <View style={s.kpiRow}>
            <KpiCell label="Latest price" value={formatPrice(latestPrice?.mid_price)} />
            <View style={s.kpiDivider} />
            <KpiCell
              label="Direction"
              value={`${dirLabel}${pct != null ? ` ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : ''}`}
              color={dirColor}
              icon={dirIcon}
            />
            <View style={s.kpiDivider} />
            <KpiCell label="Range" value={rangeLabel(latestPrice)} />
          </View>

          {/* Chart card */}
          <View
            style={s.chartCard}
            onLayout={(e) => setChartWidth(e.nativeEvent.layout.width - 32)}
          >
            {marketLoading && !trendData ? (
              <View style={{ height: CHART_H, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : chartWidth > 0 ? (
              <PriceAreaChart
                points={trendData?.points ?? []}
                interval={interval}
                width={chartWidth}
              />
            ) : null}
          </View>

          {/* Forecast */}
          <View style={s.forecastRow}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.forecastTitle}>Price Forecast</Text>
              <Text style={s.forecastMeta}>
                Short-term price forecast for {cropName} will appear here.
              </Text>
            </View>
            <View style={s.comingSoonBadge}>
              <Text style={s.comingSoonText}>COMING{'\n'}SOON</Text>
            </View>
          </View>
        </>
      )}

      {/* ════════════════════════════════════════════════════
          TAB: COMPARISON
          ════════════════════════════════════════════════════ */}
      {activeTab === 'comparison' && !!selectedCropId && (
        <>
          <View style={s.kpiRow}>
            <KpiCell label="Best region" value={bestRegion?.region || 'N/A'} />
            <View style={s.kpiDivider} />
            <KpiCell label="Tracked" value={String(compareData?.regions.length ?? regions.length)} />
            <View style={s.kpiDivider} />
            <KpiCell label="Available" value={String(availableCount)} />
          </View>

          <View style={s.compHeader}>
            <Text style={s.compTitle}>Regional Comparison</Text>
            <Text style={s.compMeta}>Latest observed midpoint for each tracked region.</Text>
          </View>

          {marketLoading && compRows.length === 0 ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32, alignSelf: 'center' }} />
          ) : compRows.length > 0 ? (
            compRows.map((row) => (
              <View key={row.region} style={[s.regionCard, selectedRegion === row.region && s.regionCardActive]}>
                <View style={s.regionCardBody}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.regionName}>{row.region}</Text>
                    <Text style={s.regionSub}>{row.district ?? 'N/A'}</Text>
                    <Text style={s.regionSub}>{formatDate(row.date)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    <Text style={s.regionMidPrice}>
                      {row.mid_price != null ? row.mid_price.toLocaleString() : 'N/A'}
                    </Text>
                    <Text style={s.regionRange}>
                      {row.available
                        ? `${row.min_price?.toLocaleString() ?? 'N/A'} – ${row.max_price?.toLocaleString() ?? 'N/A'}`
                        : 'No data'}
                    </Text>
                    <View style={[s.statusBadge, row.available ? s.statusAvail : s.statusNone]}>
                      <Text style={[s.statusText, row.available ? s.statusTextAvail : s.statusTextNone]}>
                        {row.available ? 'Available' : 'No data'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={s.emptyBox}>
              <Text style={s.emptyText}>Regional comparison data will load once synced.</Text>
            </View>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════
          TAB: NEWS
          ════════════════════════════════════════════════════ */}
      {activeTab === 'news' && (
        <View style={s.newsCard}>
          <Text style={s.newsTitle}>Market News</Text>
          <Text style={s.newsMeta}>
            A lightweight news panel with current market notes while live headlines are being connected.
          </Text>
          {marketNotes.map((note) => (
            <View key={note.title} style={s.noteItem}>
              <Text style={s.noteTitle}>{note.title}</Text>
              <Text style={s.noteBody}>{note.body}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Crop picker ── */}
      <PickerSheet
        visible={cropModalOpen}
        title="Select crop"
        items={cropItems}
        selectedId={selectedCropId}
        onSelect={(item) => setSelectedCropId(item.id)}
        onClose={() => setCropModalOpen(false)}
      />

      {/* ── Region picker ── */}
      <PickerSheet
        visible={regionModalOpen}
        title="Select region"
        items={regionItems}
        selectedId={selectedRegion}
        onSelect={(item) => setSelectedRegion(item.id)}
        onClose={() => setRegionModalOpen(false)}
      />

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

  // ── Top bar ──
  topBar: { gap: 10 },
  tabRow: { flexDirection: 'row', gap: 6 },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255, 253, 247, 0.84)',
  },
  tabBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  tabBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  tabBtnTextActive: { color: '#fff' },

  cropRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  cropLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 4 },
  cropPicker: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255, 253, 247, 0.84)',
  },
  cropPickerText: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255, 253, 247, 0.84)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Filters ──
  sectionHead: { gap: 10 },
  trendHeading: { fontSize: 17, fontWeight: '700', color: theme.colors.text, lineHeight: 24 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  filterGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  filterGroupLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted, flexShrink: 0 },
  filterPill: {
    flex: 1,           // fills the remaining space in its (flex:1) group
    minWidth: 0,       // allows flex shrinking below natural content width
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255, 253, 247, 0.84)',
  },
  filterPillText: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600', color: theme.colors.text },
  intervalGroup: {
    flexDirection: 'row',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  intervalBtn: { paddingHorizontal: 11, paddingVertical: 6, backgroundColor: 'transparent' },
  intervalBtnActive: { backgroundColor: theme.colors.primary },
  intervalBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  intervalBtnTextActive: { color: '#fff' },

  // ── KPI ──
  kpiRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 253, 247, 0.86)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...theme.shadow,
  },
  kpiCell: { flex: 1, paddingVertical: 12, paddingHorizontal: 8 },
  kpiDivider: { width: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border, marginVertical: 10 },
  kpiLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: theme.colors.textMuted },
  kpiValue: { fontSize: 11, fontWeight: '700', color: theme.colors.text, flexShrink: 1 },

  // ── Chart ──
  chartCard: {
    backgroundColor: 'rgba(255, 253, 247, 0.86)',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },

  // ── Forecast ──
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 253, 247, 0.86)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  forecastTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  forecastMeta: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 18 },
  comingSoonBadge: {
    backgroundColor: theme.colors.primary + '18',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: theme.colors.primary,
    textAlign: 'center',
  },

  // ── Comparison ──
  compHeader: { gap: 3 },
  compTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  compMeta: { fontSize: 13, color: theme.colors.textMuted },
  regionCard: {
    backgroundColor: 'rgba(255, 253, 247, 0.86)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  regionCardActive: { borderColor: theme.colors.primary + '55', backgroundColor: theme.colors.primary + '06' },
  regionCardBody: { flexDirection: 'row', gap: 12 },
  regionName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  regionSub: { fontSize: 12, color: theme.colors.textMuted },
  regionMidPrice: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  regionRange: { fontSize: 11, color: theme.colors.textMuted },
  statusBadge: { borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  statusAvail: { backgroundColor: theme.colors.success + '18' },
  statusNone: { backgroundColor: theme.colors.border },
  statusText: { fontSize: 10, fontWeight: '700' },
  statusTextAvail: { color: theme.colors.success },
  statusTextNone: { color: theme.colors.textMuted },

  // ── News ──
  newsCard: {
    backgroundColor: 'rgba(255, 253, 247, 0.88)',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 14,
    ...theme.shadow,
  },
  newsTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  newsMeta: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  noteItem: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  noteTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  noteBody: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 20 },

  // ── Empty ──
  emptyBox: {
    backgroundColor: 'rgba(255, 253, 247, 0.86)',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  emptyText: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },

  // ── Bottom sheet ──
  sheet: {
    backgroundColor: 'rgba(255, 253, 247, 0.94)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: 34,
    paddingTop: 10,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  sheetItemActive: { backgroundColor: theme.colors.primary + '0f' },
  sheetItemText: { fontSize: 15, color: theme.colors.text },
  sheetItemTextActive: { fontWeight: '700', color: theme.colors.primary },
});
