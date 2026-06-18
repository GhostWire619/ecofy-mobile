import { Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { FarmSoilResponse, PlotHealthSnapshot } from '@/lib/domain/types';
import { theme } from '@/lib/theme';

/** Risk-level → ring colour + label. Higher score = more risk = more filled. */
const RISK_VISUAL: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Healthy', color: '#1f8f54' },
  MODERATE: { label: 'Watch', color: '#c98a00' },
  HIGH: { label: 'At risk', color: '#e46a11' },
  CRITICAL: { label: 'Critical', color: '#c73a28' },
};

function riskVisual(level?: string | null) {
  return RISK_VISUAL[(level ?? '').toUpperCase()] ?? { label: 'Stable', color: theme.colors.textMuted };
}

function fmtDate(value?: string | null) {
  if (!value) return null;
  try {
    return format(parseISO(value), 'MMM d, yyyy');
  } catch {
    return value;
  }
}

function titleCase(value?: string | null) {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Crop hero ────────────────────────────────────────────────────────────────
export function CropHeroCard({
  farmName,
  cropName,
  variety,
  sizeHa,
  stage,
  progressPct,
  plantingDate,
  harvestDate,
  onEdit,
  onSetPlanting,
}: {
  farmName: string;
  cropName?: string | null;
  variety?: string | null;
  sizeHa?: number | null;
  stage?: string | null;
  progressPct?: number | null;
  plantingDate?: string | null;
  harvestDate?: string | null;
  onEdit: () => void;
  onSetPlanting: () => void;
}) {
  const subtitleParts = [
    cropName || 'No crop yet',
    variety || null,
    sizeHa ? `${sizeHa} ha` : null,
  ].filter(Boolean);

  const pct = Math.max(0, Math.min(100, Math.round(progressPct ?? 0)));
  let dayN: number | null = null;
  if (plantingDate) {
    try {
      dayN = Math.max(0, differenceInCalendarDays(new Date(), parseISO(plantingDate)));
    } catch {
      dayN = null;
    }
  }
  const harvest = fmtDate(harvestDate);

  return (
    <View style={s.card}>
      <View style={s.heroTop}>
        <View style={s.heroIcon}>
          <Ionicons name="leaf" size={22} color={theme.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.heroTitle} numberOfLines={1}>{farmName}</Text>
          <Text style={s.heroSub} numberOfLines={1}>{subtitleParts.join(' · ')}</Text>
        </View>
        <TouchableOpacity onPress={onEdit} style={s.editBtn} accessibilityRole="button" testID="farm-edit-name">
          <Ionicons name="pencil-outline" size={15} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {plantingDate ? (
        <>
          <View style={s.heroMetaRow}>
            {stage ? (
              <View style={s.stageChip}>
                <Text style={s.stageChipText}>{titleCase(stage)}</Text>
              </View>
            ) : null}
            <Text style={s.heroMeta}>
              {dayN != null ? `Day ${dayN}` : 'Planted'}
              {harvest ? ` · harvest ~${harvest}` : ''}
            </Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.progressLabel}>{pct}% through the season</Text>
        </>
      ) : (
        <TouchableOpacity style={s.setPlantingBtn} onPress={onSetPlanting} activeOpacity={0.85}>
          <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
          <Text style={s.setPlantingText}>Set planting date to start the season</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Health ring ──────────────────────────────────────────────────────────────
type SignalRow = { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone: string };

function buildSignals(snap: PlotHealthSnapshot): SignalRow[] {
  const b = snap.breakdown;
  const sat = b.satellite;
  const satOk = sat.status === 'healthy' || (typeof sat.ndvi === 'number' && sat.ndvi >= 0.6);
  const satValue =
    typeof sat.ndvi === 'number'
      ? `${sat.ndvi.toFixed(2)} ${satOk ? 'healthy' : 'stressed'}`
      : 'no scan yet';

  const weather = b.weather;
  const weatherValue = weather.threats.length > 0 ? weather.threats[0] : 'calm';

  const ops = b.operations;
  const opsValue = ops.overdue_count > 0
    ? `${ops.overdue_count} overdue`
    : ops.pending_count > 0
      ? `${ops.pending_count} due`
      : 'up to date';

  const scout = b.scouting;
  const scoutValue = scout.days_since_last == null
    ? 'no visits'
    : `${scout.days_since_last}d ago`;

  return [
    { icon: 'scan-outline', label: 'Crop vigour (NDVI)', value: satValue, tone: satOk ? theme.colors.success : theme.colors.warning },
    { icon: 'rainy-outline', label: 'Weather', value: weatherValue, tone: weather.threats.length ? theme.colors.warning : theme.colors.success },
    { icon: 'checkbox-outline', label: 'Tasks', value: opsValue, tone: ops.overdue_count > 0 ? theme.colors.danger : theme.colors.success },
    { icon: 'eye-outline', label: 'Last scouted', value: scoutValue, tone: (scout.days_since_last ?? 99) > 14 ? theme.colors.warning : theme.colors.success },
  ];
}

export function HealthRingCard({
  snapshot,
  loading,
}: {
  snapshot: PlotHealthSnapshot | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <View style={[s.card, s.centerRow]}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={s.mutedText}>Checking field health…</Text>
      </View>
    );
  }
  if (!snapshot) {
    return (
      <View style={s.card}>
        <View style={s.sectionHead}>
          <Ionicons name="pulse-outline" size={18} color={theme.colors.primary} />
          <Text style={s.sectionTitle}>Field health</Text>
        </View>
        <Text style={s.mutedText}>
          Monitoring starts once this farm has a crop journey and location set.
        </Text>
      </View>
    );
  }

  const score = Math.max(0, Math.min(100, Math.round(snapshot.risk_score)));
  const visual = riskVisual(snapshot.risk_level);
  const C = 2 * Math.PI * 32;
  const offset = C * (1 - score / 100);
  const signals = buildSignals(snapshot);

  return (
    <View style={s.card}>
      <View style={s.healthRow}>
        <View style={s.ringWrap}>
          <Svg width={78} height={78}>
            <Circle cx={39} cy={39} r={32} stroke={theme.colors.border} strokeWidth={8} fill="none" />
            <Circle
              cx={39}
              cy={39}
              r={32}
              stroke={visual.color}
              strokeWidth={8}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              transform="rotate(-90 39 39)"
            />
          </Svg>
          <View style={s.ringCenter}>
            <Text style={s.ringScore}>{score}</Text>
            <Text style={[s.ringLevel, { color: visual.color }]}>{visual.label}</Text>
          </View>
        </View>
        <View style={s.signalCol}>
          {signals.map((sig) => (
            <View key={sig.label} style={s.signalRow}>
              <Ionicons name={sig.icon} size={15} color={sig.tone} />
              <Text style={s.signalLabel} numberOfLines={1}>{sig.label}</Text>
              <Text style={s.signalValue} numberOfLines={1}>{sig.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Soil ───────────────────────────────────────────────────────────────────
const WATER_VISUAL: Record<string, { label: string; color: string; bg: string }> = {
  dry: { label: 'Dry', color: '#c17a00', bg: '#fdf3df' },
  adequate: { label: 'Adequate', color: '#1f8f54', bg: '#e9f7ef' },
  wet: { label: 'Wet', color: '#1f6fb0', bg: '#e6f1fb' },
};

const SOURCE_LABEL: Record<string, string> = { isda: 'iSDA', soilgrids: 'SoilGrids', default: 'estimate' };

function SoilMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={s.soilMetric}>
      <Text style={s.soilMetricLabel}>{label}</Text>
      <Text style={s.soilMetricValue}>
        {value}
        {hint ? <Text style={s.soilMetricHint}>{`  ${hint}`}</Text> : null}
      </Text>
    </View>
  );
}

export function SoilCard({
  soil,
  loading,
  error,
}: {
  soil: FarmSoilResponse | null;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <View style={[s.card, s.centerRow]}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={s.mutedText}>Reading the soil…</Text>
      </View>
    );
  }
  if (error || !soil) {
    return (
      <View style={s.card}>
        <View style={s.sectionHead}>
          <Ionicons name="layers-outline" size={18} color={theme.colors.info} />
          <Text style={s.sectionTitle}>Soil</Text>
        </View>
        <Text style={s.mutedText}>
          Soil data needs farm coordinates. Set the farm location on the map to load it.
        </Text>
      </View>
    );
  }

  const p = soil.profile;
  const ws = soil.water_status;
  const water = ws ? WATER_VISUAL[ws.status] ?? WATER_VISUAL.adequate : null;
  const npk = [p.n_level, p.p_level, p.k_level].map((v) => v ?? '–').join(' · ');
  const refreshed = fmtDate(p.fetched_at);

  return (
    <View style={s.card}>
      <View style={s.sectionHead}>
        <Ionicons name="layers-outline" size={18} color={theme.colors.info} />
        <Text style={s.sectionTitle}>Soil</Text>
        <View style={{ flex: 1 }} />
        <View style={s.sourcePill}>
          <Text style={s.sourcePillText}>
            {SOURCE_LABEL[p.source] ?? p.source} · {p.confidence}
          </Text>
        </View>
      </View>

      <View style={s.soilGrid}>
        <SoilMetric label="Texture" value={p.texture_class ?? '–'} />
        <SoilMetric label="pH" value={p.ph != null ? p.ph.toFixed(1) : '–'} hint={p.ph_band ?? undefined} />
        <SoilMetric label="Water holding" value={p.water_capacity_mm != null ? `${Math.round(p.water_capacity_mm)} mm/m` : '–'} />
        <SoilMetric label="N · P · K" value={npk} />
      </View>

      {water && ws ? (
        <View style={[s.waterStrip, { backgroundColor: water.bg }]}>
          <Ionicons name="water-outline" size={15} color={water.color} />
          <Text style={[s.waterText, { color: water.color }]}>
            Soil moisture: {water.label} · {ws.pct}% of capacity
          </Text>
        </View>
      ) : null}

      {refreshed ? (
        <Text style={s.soilFooter}>
          <Ionicons name="refresh-outline" size={11} /> Soil profile from {SOURCE_LABEL[p.source] ?? p.source} · {refreshed}
        </Text>
      ) : null}
    </View>
  );
}

// ── Inline calendar (dependency-free date picker) ────────────────────────────
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function InlineCalendar({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (value: string) => void;
}) {
  const selected = (() => {
    if (!value) return null;
    try {
      return parseISO(value);
    } catch {
      return null;
    }
  })();
  const [view, setView] = useState<Date>(selected ?? new Date());
  const monthStart = startOfMonth(view);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(view) });
  const leadingBlanks = getDay(monthStart);
  const today = new Date();

  return (
    <View style={cal.wrap}>
      <View style={cal.header}>
        <TouchableOpacity onPress={() => setView((v) => addMonths(v, -1))} style={cal.navBtn} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={cal.monthLabel}>{format(view, 'MMMM yyyy')}</Text>
        <TouchableOpacity onPress={() => setView((v) => addMonths(v, 1))} style={cal.navBtn} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      <View style={cal.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text key={`${d}-${i}`} style={cal.weekday}>{d}</Text>
        ))}
      </View>
      <View style={cal.grid}>
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <View key={`blank-${i}`} style={cal.cell} />
        ))}
        {days.map((day) => {
          const isSelected = selected != null && isSameDay(day, selected);
          const isToday = isSameDay(day, today);
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[cal.cell, isSelected && cal.cellSelected]}
              onPress={() => onChange(format(day, 'yyyy-MM-dd'))}
              activeOpacity={0.8}
            >
              <Text style={[cal.cellText, isSelected && cal.cellTextSelected, isToday && !isSelected && cal.cellTextToday]}>
                {day.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const cal = StyleSheet.create({
  wrap: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.border,
  },
  monthLabel: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellSelected: {},
  cellText: {
    width: 36, height: 36, borderRadius: 18, textAlign: 'center', textAlignVertical: 'center',
    lineHeight: 36, fontSize: 14, color: theme.colors.text,
  },
  cellTextSelected: { backgroundColor: theme.colors.primary, color: '#fff', fontWeight: '800', overflow: 'hidden' },
  cellTextToday: { color: theme.colors.primary, fontWeight: '800' },
});

const s = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    gap: 12,
  },
  centerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mutedText: { fontSize: 13, lineHeight: 19, color: theme.colors.textMuted },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },

  // hero
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  heroSub: { fontSize: 13, color: theme.colors.textMuted, textTransform: 'capitalize' },
  editBtn: {
    width: 34, height: 34, borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  stageChip: {
    backgroundColor: '#e9f7ef', borderRadius: theme.radius.pill,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  stageChipText: { fontSize: 12, fontWeight: '700', color: '#1f8f54' },
  heroMeta: { fontSize: 12, color: theme.colors.textMuted },
  progressTrack: {
    height: 8, borderRadius: 999, backgroundColor: theme.colors.background, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: theme.colors.primary },
  progressLabel: { fontSize: 12, color: theme.colors.textMuted },
  setPlantingBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.primary + '12',
    borderRadius: theme.radius.md, paddingVertical: 11, paddingHorizontal: 12,
  },
  setPlantingText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },

  // health
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ringWrap: { width: 78, height: 78, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringScore: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  ringLevel: { fontSize: 10, fontWeight: '700' },
  signalCol: { flex: 1, gap: 7 },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  signalLabel: { flex: 1, fontSize: 13, color: theme.colors.text },
  signalValue: { fontSize: 13, color: theme.colors.textMuted, maxWidth: 130, textAlign: 'right' },

  // soil
  sourcePill: {
    backgroundColor: '#e6f1fb', borderRadius: theme.radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  sourcePillText: { fontSize: 11, fontWeight: '700', color: '#1f6fb0' },
  soilGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  soilMetric: {
    flexBasis: '47%', flexGrow: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md, padding: 10,
  },
  soilMetricLabel: { fontSize: 12, color: theme.colors.textMuted },
  soilMetricValue: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  soilMetricHint: { fontSize: 11, fontWeight: '400', color: theme.colors.textMuted },
  waterStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: theme.radius.md, paddingHorizontal: 11, paddingVertical: 9,
  },
  waterText: { fontSize: 13, fontWeight: '700', flex: 1 },
  soilFooter: { fontSize: 11, color: theme.colors.textMuted },
});
