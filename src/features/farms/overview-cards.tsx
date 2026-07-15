import Ionicons from '@expo/vector-icons/Ionicons';
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
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

type TFunc = (key: string, params?: Record<string, string | number>) => string;

/** Risk-level → ring colour + label key. Higher score = more risk = more filled. */
const RISK_VISUAL: Record<string, { labelKey: string; color: string }> = {
  LOW: { labelKey: 'farmCards.riskHealthy', color: '#1f8f54' },
  MODERATE: { labelKey: 'farmCards.riskWatch', color: '#c98a00' },
  HIGH: { labelKey: 'farmCards.riskAtRisk', color: '#e46a11' },
  CRITICAL: { labelKey: 'farmCards.riskCritical', color: '#c73a28' },
};

function riskVisual(level?: string | null) {
  return RISK_VISUAL[(level ?? '').toUpperCase()] ?? { labelKey: 'farmCards.riskStable', color: theme.colors.textMuted };
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
  const { t } = useI18n();
  const subtitleParts = [
    cropName || t('farmCards.noCropYet'),
    variety || null,
    sizeHa ? t('farmCards.haValue', { n: sizeHa }) : null,
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
              {dayN != null ? t('farmCards.dayN', { n: dayN }) : t('farmCards.planted')}
              {harvest ? t('farmCards.harvestAround', { date: harvest }) : ''}
            </Text>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.progressLabel}>{t('farmCards.pctSeason', { pct })}</Text>
        </>
      ) : (
        <TouchableOpacity style={s.setPlantingBtn} onPress={onSetPlanting} activeOpacity={0.85}>
          <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
          <Text style={s.setPlantingText}>{t('farmCards.setPlanting')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Health ring ──────────────────────────────────────────────────────────────
type SignalRow = { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tone: string };

function buildSignals(snap: PlotHealthSnapshot, t: TFunc): SignalRow[] {
  const b = snap.breakdown;
  const sat = b.satellite;
  const satOk = sat.status === 'healthy' || (typeof sat.ndvi === 'number' && sat.ndvi >= 0.6);
  const satValue =
    typeof sat.ndvi === 'number'
      ? `${sat.ndvi.toFixed(2)} ${satOk ? t('farmCards.healthy') : t('farmCards.stressed')}`
      : t('farmCards.noScanYet');

  const weather = b.weather;
  const weatherValue = weather.threats.length > 0 ? weather.threats[0] : t('farmCards.calm');

  const ops = b.operations;
  const opsValue = ops.overdue_count > 0
    ? t('farmCards.overdueN', { n: ops.overdue_count })
    : ops.pending_count > 0
      ? t('farmCards.dueN', { n: ops.pending_count })
      : t('farmCards.upToDate');

  const scout = b.scouting;
  const scoutValue = scout.days_since_last == null
    ? t('farmCards.noVisits')
    : t('farmCards.daysAgoShort', { n: scout.days_since_last });

  return [
    { icon: 'scan-outline', label: t('farmCards.sigNdvi'), value: satValue, tone: satOk ? theme.colors.success : theme.colors.warning },
    { icon: 'rainy-outline', label: t('farmCards.sigWeather'), value: weatherValue, tone: weather.threats.length ? theme.colors.warning : theme.colors.success },
    { icon: 'checkbox-outline', label: t('farmCards.sigTasks'), value: opsValue, tone: ops.overdue_count > 0 ? theme.colors.danger : theme.colors.success },
    { icon: 'eye-outline', label: t('farmCards.sigScouted'), value: scoutValue, tone: (scout.days_since_last ?? 99) > 14 ? theme.colors.warning : theme.colors.success },
  ];
}

export function HealthRingCard({
  snapshot,
  loading,
}: {
  snapshot: PlotHealthSnapshot | null;
  loading: boolean;
}) {
  const { t } = useI18n();
  if (loading) {
    return (
      <View style={[s.card, s.centerRow]}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={s.mutedText}>{t('farmCards.checkingHealth')}</Text>
      </View>
    );
  }
  if (!snapshot) {
    return (
      <View style={s.card}>
        <View style={s.sectionHead}>
          <Ionicons name="pulse-outline" size={18} color={theme.colors.primary} />
          <Text style={s.sectionTitle}>{t('farmCards.fieldHealth')}</Text>
        </View>
        <Text style={s.mutedText}>
          {t('farmCards.monitoringStarts')}
        </Text>
      </View>
    );
  }

  const score = Math.max(0, Math.min(100, Math.round(snapshot.risk_score)));
  const visual = riskVisual(snapshot.risk_level);
  const C = 2 * Math.PI * 32;
  const offset = C * (1 - score / 100);
  const signals = buildSignals(snapshot, t);

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
            <Text style={[s.ringLevel, { color: visual.color }]}>{t(visual.labelKey)}</Text>
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
const WATER_VISUAL: Record<string, { labelKey: string; color: string; bg: string }> = {
  dry: { labelKey: 'farmCards.waterDry', color: '#c17a00', bg: '#fdf3df' },
  adequate: { labelKey: 'farmCards.waterAdequate', color: '#1f8f54', bg: '#e9f7ef' },
  wet: { labelKey: 'farmCards.waterWet', color: '#1f6fb0', bg: '#e6f1fb' },
};

function sourceLabel(source: string, t: TFunc): string {
  if (source === 'isda') return 'iSDA';
  if (source === 'soilgrids') return 'SoilGrids';
  return t('farmCards.estimate');
}

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
  const { t } = useI18n();
  if (loading) {
    return (
      <View style={[s.card, s.centerRow]}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={s.mutedText}>{t('farmCards.soilReading')}</Text>
      </View>
    );
  }
  if (error || !soil) {
    return (
      <View style={s.card}>
        <View style={s.sectionHead}>
          <Ionicons name="layers-outline" size={18} color={theme.colors.info} />
          <Text style={s.sectionTitle}>{t('farmCards.soil')}</Text>
        </View>
        <Text style={s.mutedText}>
          {t('farmCards.soilUnavailable')}
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
        <Text style={s.sectionTitle}>{t('farmCards.soil')}</Text>
        <View style={{ flex: 1 }} />
        <View style={s.sourcePill}>
          <Text style={s.sourcePillText}>
            {sourceLabel(p.source, t)} · {p.confidence}
          </Text>
        </View>
      </View>

      <View style={s.soilGrid}>
        <SoilMetric label={t('farmCards.texture')} value={p.texture_class ?? '–'} />
        <SoilMetric label={t('farmCards.ph')} value={p.ph != null ? p.ph.toFixed(1) : '–'} hint={p.ph_band ?? undefined} />
        <SoilMetric label={t('farmCards.waterHolding')} value={p.water_capacity_mm != null ? t('farmCards.mmPerM', { n: Math.round(p.water_capacity_mm) }) : '–'} />
        <SoilMetric label={t('farmCards.npk')} value={npk} />
      </View>

      {water && ws ? (
        <View style={[s.waterStrip, { backgroundColor: water.bg }]}>
          <Ionicons name="water-outline" size={15} color={water.color} />
          <Text style={[s.waterText, { color: water.color }]}>
            {t('farmCards.soilMoisture', { label: t(water.labelKey), pct: ws.pct })}
          </Text>
        </View>
      ) : null}

      {refreshed ? (
        <Text style={s.soilFooter}>
          <Ionicons name="refresh-outline" size={11} /> {t('farmCards.soilProfileFrom', { source: sourceLabel(p.source, t), date: refreshed })}
        </Text>
      ) : null}
    </View>
  );
}

// ── Farm details (grouped, tap-a-row-to-edit) ────────────────────────────────
export interface FarmDetailItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  missing?: boolean;
  onPress?: () => void;
}
export interface FarmDetailGroup {
  title: string;
  items: FarmDetailItem[];
}

export function FarmDetailsCard({ groups }: { groups: FarmDetailGroup[] }) {
  return (
    <View style={{ gap: 12 }}>
      {groups.map((group) => (
        <View key={group.title} style={s.card}>
          <Text style={s.detailGroupTitle}>{group.title.toUpperCase()}</Text>
          <View>
            {group.items.map((item, i) => (
              <TouchableOpacity
                key={item.key}
                style={[s.detailRow, i < group.items.length - 1 && s.detailRowDivider]}
                onPress={item.onPress}
                disabled={!item.onPress}
                activeOpacity={item.onPress ? 0.6 : 1}
                testID={`farm-detail-${item.key}`}
              >
                <View style={s.detailIcon}>
                  <Ionicons name={item.icon} size={16} color={theme.colors.primary} />
                </View>
                <Text style={s.detailLabel}>{item.label}</Text>
                <Text
                  style={[s.detailValue, item.missing && s.detailValueMissing]}
                  numberOfLines={1}
                >
                  {item.value}
                </Text>
                {item.onPress ? (
                  <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
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
              accessibilityRole="button"
              accessibilityLabel={format(day, 'MMMM d, yyyy')}
              accessibilityState={{ selected: isSelected }}
              testID={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
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
    backgroundColor: 'rgba(255, 253, 247, 0.88)',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(39, 73, 47, 0.10)',
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
    height: 8, borderRadius: 999, backgroundColor: 'rgba(244, 240, 231, 0.72)', overflow: 'hidden',
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
    backgroundColor: 'rgba(248, 247, 239, 0.76)',
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

  // farm details
  detailGroupTitle: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: theme.colors.textMuted,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  detailRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  detailIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  detailLabel: { fontSize: 14, color: theme.colors.textMuted },
  detailValue: { flex: 1, textAlign: 'right', fontSize: 15, fontWeight: '700', color: theme.colors.text },
  detailValueMissing: { color: theme.colors.warning },
});
