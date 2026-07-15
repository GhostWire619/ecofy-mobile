import Ionicons from '@expo/vector-icons/Ionicons';
import { format, parseISO } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal as NativeModal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ModalProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { mobileApi } from '@/lib/api/mobile';
import type {
  AIRecommendation,
  FarmHealthSummary,
  PlotAIRecommendationsResponse,
  PlotHealthSnapshot,
  RemoteSensingSummary,
  RemoteSensingTimeSeries,
} from '@/lib/domain/types';
import { AddLogSheet } from '@/features/logbook/screen';
import {
  loadFarmWorkspaceCore,
  normalizeFarmHealthSummary,
} from '@/features/farms/data';
import {
  CropHeroCard,
  FarmDetailsCard,
  HealthRingCard,
  InlineCalendar,
  SoilCard,
  type FarmDetailGroup,
} from '@/features/farms/overview-cards';
import { StartJourneySheet } from '@/features/farms/start-journey-sheet';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

function Modal({ children, ...props }: ModalProps) {
  return (
    <NativeModal {...props}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {children}
      </KeyboardAvoidingView>
    </NativeModal>
  );
}

type WorkspaceTab = 'overview' | 'notes' | 'ledger' | 'market' | 'risks';

type AsyncData<T> = {
  data: T | null;
  error: string | null;
};

type RecommendationView = {
  id: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  source: string;
};

type SignalTone = 'good' | 'warn' | 'bad' | 'neutral';

type RiskCardItem = {
  key: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  icon: keyof typeof Ionicons.glyphMap;
  riskType: 'weather' | 'satellite' | 'operations' | 'scouting' | 'generic';
  mitigations: string[];
};

type WorkspaceLiveData = {
  recommendations: AsyncData<AIRecommendation[]>;
  farmHealth: AsyncData<FarmHealthSummary>;
  plotHealth: AsyncData<PlotHealthSnapshot>;
  plotAi: AsyncData<PlotAIRecommendationsResponse>;
  latestNdvi: AsyncData<RemoteSensingSummary>;
  ndviTimeseries: AsyncData<RemoteSensingTimeSeries>;
};

type FarmMarketData = {
  latestPrice: number | null;
  latestDate: string | null;
  trendDirection: 'up' | 'down' | 'stable';
  trendChange: number | null;
  region: string | null;
};

type FarmWorkspaceScreenProps = {
  farmId: string;
  onClose?: () => void;
  embedded?: boolean;
};

type EditableFarmField =
  | 'name'
  | 'region'
  | 'size_hectares'
  | 'soil_type'
  | 'irrigation_type'
  | 'crop_name'
  | 'planting_date'
  | 'expected_harvest_date';

type FieldEditorConfig = {
  field: EditableFarmField;
  label: string;
  prompt: string;
  value: string;
  keyboardType?: 'default' | 'decimal-pad';
  choices?: { label: string; value: string }[];
  quickChoices?: { label: string; value: string }[];
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

async function capture<T>(promise: Promise<T>): Promise<AsyncData<T>> {
  try {
    return { data: await promise, error: null };
  } catch (error) {
    return { data: null, error: errorMessage(error) };
  }
}

function fmtDate(value?: string | null, formatString = 'MMM d') {
  if (!value) {
    return 'Not set';
  }

  try {
    return format(parseISO(value), formatString);
  } catch {
    return value;
  }
}

function formatValue(value: number | null | undefined, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }

  return value.toFixed(digits);
}

function formatCurrency(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0 TZS';
  }

  return `${Math.round(value).toLocaleString()} TZS`;
}

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function safeNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

const LOG_OP_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  Scouting: 'eye-outline',
  Spraying: 'water-outline',
  Fertilizing: 'leaf-outline',
  Irrigation: 'rainy-outline',
  Weeding: 'cut-outline',
  Tilling: 'construct-outline',
  Harvesting: 'basket-outline',
};

function toRecommendationView(recommendation: AIRecommendation): RecommendationView {
  return {
    id: safeText(recommendation.id, `rec-${Math.random().toString(36).slice(2, 8)}`),
    title: safeText(recommendation.title, 'Recommendation'),
    message: safeText(recommendation.message, 'No details available yet.'),
    priority:
      recommendation.priority === 'critical' ||
      recommendation.priority === 'high' ||
      recommendation.priority === 'medium' ||
      recommendation.priority === 'low'
        ? recommendation.priority
        : 'medium',
    source: safeText(recommendation.source, 'system'),
  };
}

function pickPrimaryMessage(input: {
  plotHealth: PlotHealthSnapshot | null;
  recommendations: RecommendationView[];
  hasJourney: boolean;
}) {
  if (!input.hasJourney) {
    return 'Start a crop journey to unlock field health and NDVI monitoring.';
  }

  if (input.plotHealth?.actions[0]?.message) {
    return input.plotHealth.actions[0].message;
  }

  if (input.recommendations[0]?.message) {
    return input.recommendations[0].message;
  }

  return 'Your field has issues that need quick action. See what to do below.';
}

function trendDirectionLabel(direction: FarmMarketData['trendDirection']) {
  if (direction === 'up') {
    return 'Rising';
  }

  if (direction === 'down') {
    return 'Falling';
  }

  return 'Stable';
}

function normalizePlotHealthSnapshot(snapshot: PlotHealthSnapshot | null): PlotHealthSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  return {
    ...snapshot,
    plot_name: safeText(snapshot.plot_name, 'Main Field'),
    risk_score: safeNumber(snapshot.risk_score, 0),
    risk_level: snapshot.risk_level ?? 'LOW',
    journey: snapshot.journey
      ? {
          crop_name: safeText(snapshot.journey.crop_name, 'No crop'),
          current_stage: safeText(snapshot.journey.current_stage, 'Not set'),
          progress_percentage: safeNumber(snapshot.journey.progress_percentage, 0),
          days_to_harvest: safeNumber(snapshot.journey.days_to_harvest, 0),
        }
      : null,
    breakdown: {
      satellite: {
        score: safeNumber(snapshot.breakdown?.satellite?.score, 0),
        ndvi: typeof snapshot.breakdown?.satellite?.ndvi === 'number' ? snapshot.breakdown.satellite.ndvi : null,
        trend: safeText(snapshot.breakdown?.satellite?.trend) || null,
        status: safeText(snapshot.breakdown?.satellite?.status) || null,
      },
      weather: {
        score: safeNumber(snapshot.breakdown?.weather?.score, 0),
        threats: asArray(snapshot.breakdown?.weather?.threats).map((item) => safeText(item)).filter(Boolean),
      },
      operations: {
        score: safeNumber(snapshot.breakdown?.operations?.score, 0),
        overdue_count: safeNumber(snapshot.breakdown?.operations?.overdue_count, 0),
        pending_count: safeNumber(snapshot.breakdown?.operations?.pending_count, 0),
      },
      scouting: {
        score: safeNumber(snapshot.breakdown?.scouting?.score, 0),
        days_since_last:
          typeof snapshot.breakdown?.scouting?.days_since_last === 'number'
            ? snapshot.breakdown.scouting.days_since_last
            : null,
      },
    },
    actions: asArray(snapshot.actions)
      .map((action) => ({
        type: action?.type ?? 'operations',
        message: safeText(action?.message),
      }))
      .filter((action) => Boolean(action.message)),
  };
}

function normalizePlotAiRecommendations(data: PlotAIRecommendationsResponse | null): PlotAIRecommendationsResponse | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const entries = Object.entries(data.recommendations ?? {}).map(([key, value]) => [
    key,
    {
      summary: safeText(value?.summary, ''),
      actions: asArray(value?.actions).map((item) => safeText(item)).filter(Boolean),
    },
  ]);

  return {
    ...data,
    recommendations: Object.fromEntries(entries),
    generated_at: safeText(data.generated_at, ''),
    cached: Boolean(data.cached),
  };
}

function statusVisual(level?: string | null) {
  switch ((level ?? '').toUpperCase()) {
    case 'LOW':
      return {
        label: 'Healthy',
        color: '#1f8f54',
        dot: '#1f8f54',
        bg: '#e9f7ef',
        border: '#cfe7d8',
        icon: 'shield-checkmark-outline' as const,
      };
    case 'MODERATE':
      return {
        label: 'Watch',
        color: '#b86b00',
        dot: '#d18a00',
        bg: '#fff6df',
        border: '#f2dfaa',
        icon: 'shield-half-outline' as const,
      };
    case 'HIGH':
      return {
        label: 'At risk',
        color: '#e46a11',
        dot: '#ff7d1a',
        bg: '#fff6ed',
        border: '#f3d7b2',
        icon: 'shield-outline' as const,
      };
    case 'CRITICAL':
      return {
        label: 'Critical',
        color: '#c73a28',
        dot: '#d94a37',
        bg: '#fff0ec',
        border: '#f1c4bb',
        icon: 'warning-outline' as const,
      };
    default:
      return {
        label: 'Stable',
        color: theme.colors.textMuted,
        dot: '#c1b8a5',
        bg: '#f5f2ea',
        border: '#e7e0d1',
        icon: 'shield-outline' as const,
      };
  }
}

function severityVisual(level: RiskCardItem['severity']) {
  switch (level) {
    case 'low':
      return { label: 'Low', bg: '#e5f7ec', color: '#1f8f54' };
    case 'high':
      return { label: 'High', bg: '#ffe7e4', color: '#d43c2e' };
    default:
      return { label: 'Medium', bg: '#fff1d9', color: '#c17a00' };
  }
}

function buildSatelliteSignal(snapshot: PlotHealthSnapshot | null): { message: string; tone: SignalTone } {
  const sat = snapshot?.breakdown?.satellite;
  if (!sat) {
    return { message: 'Satellite scan has not arrived yet.', tone: 'neutral' };
  }
  if (sat.status === 'healthy' || (typeof sat.ndvi === 'number' && sat.ndvi >= 0.6)) {
    return { message: 'Satellite view looks healthy across the field.', tone: 'good' };
  }
  if (sat.trend === 'down' || sat.status === 'warning' || sat.status === 'critical') {
    return { message: 'Satellite detects crop stress in your field. Some areas show reduced vegetation.', tone: 'bad' };
  }
  if (typeof sat.ndvi === 'number') {
    return { message: `Vegetation is uneven. NDVI is ${sat.ndvi.toFixed(2)} and needs attention.`, tone: 'warn' };
  }
  return { message: 'Satellite monitoring is still warming up for this field.', tone: 'neutral' };
}

function buildWeatherSignal(snapshot: PlotHealthSnapshot | null) {
  const weather = snapshot?.breakdown?.weather;
  if (!weather) {
    return { message: 'Weather outlook is still loading.', tone: 'neutral' as SignalTone };
  }
  if (weather.threats.length > 0) {
    return {
      message: `${weather.threats.join('. ')}.`,
      tone: weather.score > 50 ? 'bad' as SignalTone : 'warn' as SignalTone,
    };
  }
  if (weather.score < 20) {
    return { message: 'Conditions look calm for field work today.', tone: 'good' as SignalTone };
  }
  return { message: 'Weather conditions need a quick check before field work.', tone: 'neutral' as SignalTone };
}

function buildOperationsSignal(snapshot: PlotHealthSnapshot | null) {
  const ops = snapshot?.breakdown?.operations;
  if (!ops) {
    return { message: 'Field work status is still syncing.', tone: 'neutral' as SignalTone };
  }
  if (ops.overdue_count > 0) {
    return {
      message: `You have ${ops.overdue_count} overdue task${ops.overdue_count > 1 ? 's' : ''}. Catching up soon will keep your crop on track.`,
      tone: 'bad' as SignalTone,
    };
  }
  if (ops.pending_count > 0) {
    return {
      message: `${ops.pending_count} task${ops.pending_count > 1 ? 's are' : ' is'} coming up next.`,
      tone: 'neutral' as SignalTone,
    };
  }
  return { message: 'Your field work is up to date.', tone: 'good' as SignalTone };
}

function buildScoutingSignal(snapshot: PlotHealthSnapshot | null) {
  const scouting = snapshot?.breakdown?.scouting;
  if (!scouting) {
    return { message: 'Field visit data is not available yet.', tone: 'neutral' as SignalTone };
  }
  if (scouting.days_since_last == null) {
    return { message: 'No field visits recorded yet. A quick walk can catch issues early.', tone: 'warn' as SignalTone };
  }
  if (scouting.days_since_last <= 7) {
    return { message: `Field was checked ${scouting.days_since_last} day${scouting.days_since_last === 1 ? '' : 's'} ago.`, tone: 'good' as SignalTone };
  }
  if (scouting.days_since_last <= 14) {
    return { message: `Last field visit was ${scouting.days_since_last} days ago. Another check is due soon.`, tone: 'neutral' as SignalTone };
  }
  return { message: `It has been ${scouting.days_since_last} days since the last field visit.`, tone: 'bad' as SignalTone };
}

function aiActionsForRisk(plotAi: PlotAIRecommendationsResponse | null, riskType: RiskCardItem['riskType']) {
  if (!plotAi?.recommendations) {
    return [] as string[];
  }

  const candidates: string[] = [];
  const summaries: string[] = [];
  const recommendationEntries = Object.entries(plotAi.recommendations);

  for (const [key, value] of recommendationEntries) {
    const normalizedKey = key.toLowerCase();
    const normalizedSummary = safeText(value?.summary);
    const normalizedActions = asArray(value?.actions).map((item) => safeText(item)).filter(Boolean);

    if (
      (riskType === 'weather' &&
        (normalizedKey.includes('weather') ||
          normalizedKey.includes('irrig') ||
          normalizedKey.includes('rain') ||
          normalizedKey.includes('moist'))) ||
      (riskType === 'satellite' &&
        (normalizedKey.includes('satellite') ||
          normalizedKey.includes('crop') ||
          normalizedKey.includes('ndvi') ||
          normalizedKey.includes('health') ||
          normalizedKey.includes('canopy'))) ||
      (riskType === 'operations' &&
        (normalizedKey.includes('task') ||
          normalizedKey.includes('operation') ||
          normalizedKey.includes('work') ||
          normalizedKey.includes('overdue'))) ||
      (riskType === 'scouting' &&
        (normalizedKey.includes('visit') ||
          normalizedKey.includes('scout') ||
          normalizedKey.includes('inspection'))) ||
      riskType === 'generic'
    ) {
      if (normalizedSummary) {
        summaries.push(normalizedSummary);
      }
      candidates.push(...normalizedActions);
    }
  }

  const matched = Array.from(new Set([...candidates, ...summaries])).filter(Boolean);
  if (matched.length > 0) {
    return matched.slice(0, 4);
  }

  return Array.from(
    new Set(
      recommendationEntries.flatMap(([, value]) => {
        const normalizedSummary = safeText(value?.summary);
        const normalizedActions = asArray(value?.actions).map((item) => safeText(item)).filter(Boolean);
        return normalizedSummary ? [normalizedSummary, ...normalizedActions] : normalizedActions;
      }),
    ),
  ).slice(0, 4);
}

function buildRiskCards(snapshot: PlotHealthSnapshot | null): RiskCardItem[] {
  if (!snapshot) {
    return [];
  }

  const items: RiskCardItem[] = [];
  const weatherThreats = asArray(snapshot.breakdown?.weather?.threats);
  if ((snapshot.breakdown?.weather?.score ?? 0) > 20 || weatherThreats.length > 0) {
    items.push({
      key: 'weather',
      title: 'Weather Risk',
      description: weatherThreats.join('. ') || 'Weather conditions need attention for your next field operations.',
      severity: (snapshot.breakdown?.weather?.score ?? 0) > 50 ? 'high' : (snapshot.breakdown?.weather?.score ?? 0) > 25 ? 'medium' : 'low',
      icon: 'cloud-outline',
      riskType: 'weather',
      mitigations: [
        'Monitor local weather forecasts for upcoming rain patterns',
        'Check soil moisture manually before proceeding with planting',
        'Ensure drainage channels are clear in case of sudden heavy rainfall',
      ],
    });
  }

  if ((snapshot.breakdown?.satellite?.score ?? 0) > 30) {
    items.push({
      key: 'satellite',
      title: 'Crop Health Risk',
      description:
        snapshot.breakdown?.satellite?.trend === 'down'
          ? 'Satellite data suggests your crop canopy may be under stress.'
          : 'Satellite detects crop stress in your field. Some areas show reduced vegetation.',
      severity: (snapshot.breakdown?.satellite?.score ?? 0) > 60 ? 'high' : 'medium',
      icon: 'flower-outline',
      riskType: 'satellite',
      mitigations: [
        'Visit the field to check for crop emergence or soil issues',
        'Verify if the low NDVI is due to late planting or land preparation',
        'Take photos of the plot to document current ground conditions',
      ],
    });
  }

  if ((snapshot.breakdown?.operations?.overdue_count ?? 0) > 0) {
    items.push({
      key: 'operations',
      title: 'Overdue Field Work',
      description: `You have ${snapshot.breakdown.operations.overdue_count} overdue task${snapshot.breakdown.operations.overdue_count > 1 ? 's' : ''}. Delayed actions can affect crop growth.`,
      severity: snapshot.breakdown.operations.overdue_count > 3 ? 'high' : 'medium',
      icon: 'construct-outline',
      riskType: 'operations',
      mitigations: [
        'Review upcoming field tasks and complete the most urgent one first',
        'Mark finished work so the farm plan stays accurate',
        'Set aside time for delayed field operations this week',
      ],
    });
  }

  if ((snapshot.breakdown?.scouting?.score ?? 0) > 30) {
    items.push({
      key: 'scouting',
      title: 'Field Visit Gap',
      description:
        snapshot.breakdown?.scouting?.days_since_last == null
          ? 'No field visits recorded yet. A quick walk can catch issues early.'
          : `Last recorded field visit was ${snapshot.breakdown.scouting.days_since_last} days ago.`,
      severity: (snapshot.breakdown?.scouting?.days_since_last ?? 0) > 21 ? 'high' : 'medium',
      icon: 'eye-outline',
      riskType: 'scouting',
      mitigations: [
        'Walk the field this week and check uneven growth areas',
        'Inspect leaf undersides and crop stands for pests or damage',
        'Record observations so the next recommendation is more accurate',
      ],
    });
  }

  asArray(snapshot.actions).forEach((action, index) => {
    if (!items.some((item) => item.key === action.type || item.title.toLowerCase().includes(action.type))) {
      items.push({
        key: `generic-${index}`,
        title: 'Field Advisory',
        description: safeText(action.message, 'Field conditions need attention.'),
        severity: 'medium',
        icon: 'bulb-outline',
        riskType: 'generic',
        mitigations: [
          'Follow the latest farm recommendation',
          'Check the field conditions on the ground',
        ],
      });
    }
  });

  return items;
}

function MetricPill({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function dataMissing(value: unknown) {
  if (value == null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0 || value.trim().toLowerCase() === 'not set';
  }

  return false;
}

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthOffset(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function FarmFieldEditor({
  config,
  saving,
  error,
  onClose,
  onSave,
}: {
  config: FieldEditorConfig;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(config.value);

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.editorBackdrop}>
        <View style={styles.editorSheet}>
          <View style={styles.editorHandle} />
          <View style={styles.editorHeader}>
            <View style={styles.editorHeaderCopy}>
              <Text style={styles.editorTitle}>{config.label}</Text>
              <Text style={styles.editorPrompt}>{config.prompt}</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.editorCloseButton}>
              <Ionicons name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          {config.choices ? (
            <View style={styles.editorChoiceList}>
              {config.choices.map((choice) => {
                const selected = value === choice.value;
                return (
                  <TouchableOpacity
                    key={choice.value}
                    accessibilityRole="button"
                    onPress={() => setValue(choice.value)}
                    style={[styles.editorChoice, selected ? styles.editorChoiceSelected : null]}
                  >
                    <Text style={[styles.editorChoiceText, selected ? styles.editorChoiceTextSelected : null]}>
                      {choice.label}
                    </Text>
                    {selected ? <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : config.field.includes('date') ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.editorSelectedDate}>
                {value ? fmtDate(value, 'EEE, MMM d, yyyy') : t('farmDetails.noDateSelected')}
              </Text>
              <InlineCalendar value={value} onChange={setValue} />
            </View>
          ) : (
            <>
              {config.quickChoices ? (
                <View style={styles.quickChoiceRow}>
                  {config.quickChoices.map((choice) => (
                    <TouchableOpacity
                      key={choice.value}
                      accessibilityRole="button"
                      onPress={() => setValue(choice.value)}
                      style={[styles.quickChoice, value === choice.value ? styles.quickChoiceSelected : null]}
                    >
                      <Text style={[styles.quickChoiceText, value === choice.value ? styles.quickChoiceTextSelected : null]}>
                        {choice.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <TextInput
                autoFocus={!config.quickChoices}
                value={value}
                onChangeText={setValue}
                keyboardType={config.keyboardType ?? 'default'}
                placeholder={config.field.includes('date') ? 'YYYY-MM-DD' : `Enter ${config.label.toLowerCase()}`}
                placeholderTextColor={theme.colors.textMuted}
                style={styles.editorInput}
              />
            </>
          )}

          {error ? <Text style={styles.editorError}>{error}</Text> : null}

          <TouchableOpacity
            accessibilityRole="button"
            disabled={saving}
            onPress={() => onSave(value)}
            style={[styles.editorSaveButton, saving ? styles.disabledButton : null]}
            testID="farm-field-editor-save"
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={18} color="#fff" />}
            <Text style={styles.editorSaveText}>{saving ? 'Saving...' : 'Save changes'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function SignalCard({
  icon,
  label,
  message,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  message: string;
  tone: SignalTone;
}) {
  const palette =
    tone === 'good'
      ? { bg: '#ebfbf4', border: '#cfe9df', icon: '#1c8f67' }
      : tone === 'warn'
        ? { bg: '#fff8e8', border: '#f1dfb2', icon: '#d08b00' }
        : tone === 'bad'
          ? { bg: '#fff4ed', border: '#f0d2b6', icon: '#df6b19' }
          : { bg: '#f7f4ed', border: '#e5ded0', icon: theme.colors.textMuted };

  return (
    <View style={[styles.signalCard, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <View style={styles.signalIconWrap}>
        <Ionicons name={icon} size={16} color={palette.icon} />
      </View>
      <View style={styles.signalCopy}>
        <Text style={styles.signalLabel}>{label}</Text>
        <Text style={styles.signalMessage}>{message}</Text>
      </View>
    </View>
  );
}

function RiskActionCard({
  item,
  aiActions,
  aiLoading,
}: {
  item: RiskCardItem;
  aiActions: string[];
  aiLoading: boolean;
}) {
  const severity = severityVisual(item.severity);
  const hasAi = !aiLoading && aiActions.length > 0;

  return (
    <View style={styles.riskCard}>
      <View style={styles.riskCardHeader}>
        <View style={styles.riskCardTitleRow}>
          <View style={styles.riskCardIconWrap}>
            <Ionicons name={item.icon} size={16} color={theme.colors.text} />
          </View>
          <Text style={styles.riskCardTitle}>{item.title}</Text>
          {hasAi ? (
            <View style={styles.riskAiBadge}>
              <Ionicons name="sparkles-outline" size={12} color="#8559d3" />
              <Text style={styles.riskAiBadgeText}>AI</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.severityBadge, { backgroundColor: severity.bg }]}>
          <Text style={[styles.severityBadgeText, { color: severity.color }]}>{severity.label}</Text>
        </View>
      </View>

      <Text style={styles.riskCardDescription}>{item.description}</Text>

      <View style={styles.whatToDoCard}>
        <View style={styles.whatToDoHeader}>
          <Ionicons name="bulb-outline" size={14} color="#1c8f67" />
          <Text style={styles.whatToDoTitle}>What to do</Text>
        </View>
        {aiLoading ? (
          <View style={styles.aiLoadingRow}>
            <Ionicons name="sparkles-outline" size={14} color="#8559d3" />
            <Text style={styles.aiLoadingText}>AI is analysing your field...</Text>
          </View>
        ) : (
          (hasAi ? aiActions : item.mitigations).map((action, index) => (
            <View key={`${item.key}-${index}`} style={styles.whatToDoRow}>
              <Ionicons name={hasAi ? 'sparkles-outline' : 'arrow-forward'} size={12} color={hasAi ? '#8559d3' : '#1c8f67'} />
              <Text style={styles.whatToDoText}>{action}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

export function FarmWorkspaceScreen({ farmId, onClose, embedded = false }: FarmWorkspaceScreenProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<WorkspaceTab>('overview');
  const [selectedRiskPlotId, setSelectedRiskPlotId] = useState<string | null>(null);
  const [showAddLog, setShowAddLog] = useState(false);
  const [editorConfig, setEditorConfig] = useState<FieldEditorConfig | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [startJourneyOpen, setStartJourneyOpen] = useState(false);

  const coreQuery = useQuery({
    queryKey: ['farm-workspace-online-core', farmId],
    enabled: Boolean(farmId),
    queryFn: async () => loadFarmWorkspaceCore(farmId),
  });

  const liveQuery = useQuery({
    queryKey: [
      'farm-workspace-online-live',
      farmId,
      coreQuery.data?.journey?.id ?? 'none',
      coreQuery.data?.plot?.id ?? 'none',
    ],
    enabled: Boolean(farmId && coreQuery.data),
    queryFn: async (): Promise<WorkspaceLiveData> => {
      const plotId = coreQuery.data?.plot?.id;
      const journeyId = coreQuery.data?.journey?.id;

      return {
        recommendations: journeyId
          ? await capture(mobileApi.getRecommendationsByJourney(journeyId))
          : { data: null, error: null },
        farmHealth: await capture(mobileApi.getFarmHealthSummary(farmId)),
        plotHealth: plotId
          ? await capture(mobileApi.getPlotHealthSnapshot(farmId, plotId))
          : { data: null, error: null },
        plotAi: plotId
          ? await capture(mobileApi.getPlotAIRecommendations(farmId, plotId))
          : { data: null, error: null },
        latestNdvi: await capture(
          mobileApi.getRemoteSensingLatest(farmId, {
            analysis_type: 'ndvi',
            plot_id: plotId,
          }),
        ),
        ndviTimeseries: await capture(
          mobileApi.getRemoteSensingTimeseries(farmId, {
            analysis_type: 'ndvi',
            plot_id: plotId,
          }),
        ),
      };
    },
  });

  const soilQuery = useQuery({
    queryKey: ['farm-workspace-soil', farmId],
    enabled: Boolean(farmId && mode === 'overview'),
    staleTime: 60 * 60 * 1000,
    queryFn: () => mobileApi.getFarmSoil(farmId),
  });

  const selectedPlotId = selectedRiskPlotId ?? coreQuery.data?.plot?.id ?? null;
  const selectedPlotDetailQuery = useQuery({
    queryKey: ['farm-workspace-risk-detail', farmId, selectedPlotId],
    enabled: Boolean(farmId && selectedPlotId && mode === 'risks'),
    queryFn: async () => ({
      snapshot: selectedPlotId
        ? await capture(mobileApi.getPlotHealthSnapshot(farmId, selectedPlotId))
        : { data: null, error: null },
      plotAi: selectedPlotId
        ? await capture(mobileApi.getPlotAIRecommendations(farmId, selectedPlotId))
        : { data: null, error: null },
    }),
  });

  const cropCatalogQuery = useQuery({
    queryKey: ['farm-workspace-crop-catalog'],
    enabled: editorConfig?.field === 'crop_name',
    queryFn: () => mobileApi.fetchCropCatalog(),
    staleTime: 1000 * 60 * 30,
  });

  const marketQuery = useQuery({
    queryKey: ['farm-workspace-market', coreQuery.data?.journey?.crop_id ?? 'none', coreQuery.data?.farm.region ?? 'none'],
    enabled: Boolean(mode === 'market' && coreQuery.data?.journey?.crop_id),
    queryFn: async (): Promise<FarmMarketData> => {
      const cropId = String(coreQuery.data?.journey?.crop_id ?? '');
      const trendData = await mobileApi.getPriceTrends({
        crop: cropId,
        region: coreQuery.data?.farm.region || undefined,
        interval: 'month',
      });
      const points = asArray(trendData?.points).filter((point) => typeof point?.avg_price === 'number');
      const latestPoint = points[points.length - 1] ?? null;
      const previousPoint = points[points.length - 2] ?? null;
      const trendDirection =
        latestPoint?.avg_price != null && previousPoint?.avg_price != null
          ? latestPoint.avg_price > previousPoint.avg_price + 1
            ? 'up'
            : latestPoint.avg_price < previousPoint.avg_price - 1
              ? 'down'
              : 'stable'
          : 'stable';
      const trendChange =
        latestPoint?.avg_price != null && previousPoint?.avg_price
          ? ((latestPoint.avg_price - previousPoint.avg_price) / previousPoint.avg_price) * 100
          : null;

      return {
        latestPrice: latestPoint?.avg_price ?? latestPoint?.moving_avg ?? latestPoint?.high ?? latestPoint?.low ?? null,
        latestDate: latestPoint?.bucket ?? null,
        trendDirection,
        trendChange,
        region: coreQuery.data?.farm.region ?? null,
      };
    },
  });

  const updateFieldMutation = useMutation({
    gcTime: 0,
    mutationFn: async ({ field, value }: { field: EditableFarmField; value: string }) => {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error('Please enter a value before saving.');
      }

      if (field === 'planting_date' || field === 'expected_harvest_date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
          throw new Error('Use the date format YYYY-MM-DD.');
        }
        const journey = coreQuery.data?.journey;
        if (!journey) {
          throw new Error('Start a crop journey before setting dates.');
        }
        return mobileApi.updateJourney(farmId, journey.id, { [field]: trimmed });
      }

      if (field === 'crop_name') {
        const journey = coreQuery.data?.journey;
        if (journey) {
          return mobileApi.updateJourney(farmId, journey.id, { crop_name: trimmed });
        }
        return mobileApi.createJourney(farmId, {
          crop_name: trimmed,
          plot_id: coreQuery.data?.plot?.id,
        });
      }

      if (field === 'size_hectares') {
        const size = Number(trimmed);
        if (!Number.isFinite(size) || size <= 0) {
          throw new Error('Enter a valid field size in hectares.');
        }
        return mobileApi.updateFarm(farmId, { size_hectares: size });
      }

      return mobileApi.updateFarm(farmId, { [field]: trimmed });
    },
    onSuccess: async () => {
      setEditorConfig(null);
      setSaveMessage('Farm details saved.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['farm-workspace-online-core', farmId] }),
        queryClient.invalidateQueries({ queryKey: ['farms-online'] }),
        queryClient.invalidateQueries({ queryKey: ['today-screen'] }),
      ]);
    },
  });

  const closeScreen = () => {
    if (onClose) {
      onClose();
      return;
    }

    router.back();
  };

  async function handleLogSaved() {
    setShowAddLog(false);
    await queryClient.invalidateQueries({ queryKey: ['farm-workspace-online-core', farmId] });
  }

  function openFieldEditor(field: EditableFarmField) {
    const farm = coreQuery.data?.farm;
    const journey = coreQuery.data?.journey;
    if (!farm) {
      return;
    }

    const configs: Record<EditableFarmField, FieldEditorConfig> = {
      name: {
        field,
        label: 'Farm name',
        prompt: 'Use a short name you easily recognise.',
        value: farm.name,
      },
      region: {
        field,
        label: 'Region',
        prompt: 'Which region is this farm in?',
        value: farm.region,
      },
      size_hectares: {
        field,
        label: 'Field size',
        prompt: 'Enter the total size in hectares.',
        value: farm.size_hectares ? String(farm.size_hectares) : '',
        keyboardType: 'decimal-pad',
      },
      soil_type: {
        field,
        label: 'Soil type',
        prompt: 'Choose the soil that best describes this farm.',
        value: farm.soil_type ?? '',
        choices: [
          { label: 'Loam', value: 'Loam' },
          { label: 'Clay', value: 'Clay' },
          { label: 'Sandy', value: 'Sandy' },
          { label: 'Silt', value: 'Silt' },
        ],
      },
      irrigation_type: {
        field,
        label: 'Water source',
        prompt: 'How does this farm usually receive water?',
        value: farm.irrigation_type,
        choices: [
          { label: 'Rain only', value: 'rain-fed' },
          { label: 'Irrigation', value: 'irrigated' },
        ],
      },
      crop_name: {
        field,
        label: 'Crop',
        prompt: 'What crop is growing on this farm?',
        value: journey?.crop_name ?? '',
      },
      planting_date: {
        field,
        label: 'Planting date',
        prompt: 'When was this crop planted?',
        value: journey?.planting_date ?? '',
        quickChoices: [
          { label: 'Today', value: dateOffset(0) },
          { label: '1 week ago', value: dateOffset(-7) },
          { label: '2 weeks ago', value: dateOffset(-14) },
        ],
      },
      expected_harvest_date: {
        field,
        label: 'Expected harvest',
        prompt: 'When do you expect to harvest?',
        value: journey?.expected_harvest_date ?? '',
        quickChoices: [
          { label: 'In 1 month', value: monthOffset(1) },
          { label: 'In 3 months', value: monthOffset(3) },
          { label: 'In 6 months', value: monthOffset(6) },
        ],
      },
    };

    updateFieldMutation.reset();
    setSaveMessage(null);
    setEditorConfig(configs[field]);
  }

  const combinedRecommendations = useMemo(
    () => asArray(liveQuery.data?.recommendations.data).map(toRecommendationView),
    [liveQuery.data?.recommendations.data],
  );

  const plotHealth = normalizePlotHealthSnapshot(liveQuery.data?.plotHealth.data ?? null);
  const farmHealth = normalizeFarmHealthSummary(liveQuery.data?.farmHealth.data ?? null);
  const selectedPlotHealth = normalizePlotHealthSnapshot(
    selectedRiskPlotId
      ? selectedPlotDetailQuery.data?.snapshot.data ?? null
      : liveQuery.data?.plotHealth.data ?? null,
  );
  const selectedPlotAi = normalizePlotAiRecommendations(
    selectedRiskPlotId
      ? selectedPlotDetailQuery.data?.plotAi.data ?? null
      : liveQuery.data?.plotAi.data ?? null,
  );
  const primaryMessage = pickPrimaryMessage({
    plotHealth,
    recommendations: combinedRecommendations,
    hasJourney: Boolean(coreQuery.data?.journey),
  });
  const farmStatus = statusVisual(farmHealth?.overall_risk_level ?? plotHealth?.risk_level ?? null);
  const fallbackRiskPlot = coreQuery.data?.plot
    ? {
        plot_id: coreQuery.data.plot.id,
        plot_name: coreQuery.data.plot.name,
        risk_score: plotHealth?.risk_score ?? 0,
        risk_level: plotHealth?.risk_level ?? 'HIGH',
        crop: coreQuery.data.journey?.crop_name ?? null,
        ndvi: liveQuery.data?.latestNdvi.data?.value ?? liveQuery.data?.latestNdvi.data?.mean_value ?? null,
      }
    : null;
  const selectedPlotStatus = statusVisual(selectedPlotHealth?.risk_level ?? plotHealth?.risk_level ?? null);
  const riskFieldRows = farmHealth?.plots?.length
    ? [...farmHealth.plots].sort((a, b) => b.risk_score - a.risk_score)
    : fallbackRiskPlot
      ? [fallbackRiskPlot]
      : [];
  const riskCards = buildRiskCards(selectedPlotHealth);
  const satelliteSignal = buildSatelliteSignal(selectedPlotHealth);
  const weatherSignal = buildWeatherSignal(selectedPlotHealth);
  const operationsSignal = buildOperationsSignal(selectedPlotHealth);
  const scoutingSignal = buildScoutingSignal(selectedPlotHealth);
  const isAiLoading = selectedRiskPlotId ? selectedPlotDetailQuery.isFetching : liveQuery.isFetching;
  const farmLogs = [...(coreQuery.data?.logs ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const ledgerEntries = farmLogs.filter((log) => typeof log.cost === 'number' && !Number.isNaN(log.cost));
  const totalExpenses = ledgerEntries.reduce((sum, log) => sum + (log.cost ?? 0), 0);
  const setupChecklist = [
    { key: 'crop', label: 'Crop selected', done: Boolean(coreQuery.data?.journey?.crop_name) },
    { key: 'planting', label: 'Planting date set', done: Boolean(coreQuery.data?.journey?.planting_date) },
    { key: 'boundary', label: 'Field boundary mapped', done: Boolean(coreQuery.data?.plot?.field_boundary_json) },
    { key: 'journey', label: 'Active journey ready', done: Boolean(coreQuery.data?.journey) },
  ];
  const missingSetupItems = setupChecklist.filter((item) => !item.done);
  const logFarmOptions =
    coreQuery.data?.journey && coreQuery.data?.farm
      ? [{ id: String(coreQuery.data.farm.id), name: coreQuery.data.farm.name, journeyId: coreQuery.data.journey.id }]
      : [];

  if (!farmId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={embedded ? [] : ['top', 'bottom']}>
        <View style={[styles.sheet, embedded && styles.embeddedSheet]}>
          <View style={styles.centerState}>
            <Text style={styles.centerTitle}>Farm not found</Text>
            <Text style={styles.centerMessage}>Open a farm from the Farms tab to view its dashboard.</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (coreQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={embedded ? [] : ['top', 'bottom']}>
        <View style={[styles.sheet, embedded && styles.embeddedSheet]}>
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text style={styles.centerMessage}>Loading farm dashboard...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (coreQuery.isError || !coreQuery.data) {
    return (
      <SafeAreaView style={styles.safeArea} edges={embedded ? [] : ['top', 'bottom']}>
        <View style={[styles.sheet, embedded && styles.embeddedSheet]}>
          <View style={styles.centerState}>
            <Text style={styles.centerTitle}>Farm not found</Text>
            <Text style={styles.centerMessage}>{errorMessage(coreQuery.error)}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={closeScreen}>
              <Text style={styles.closeButtonText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const farmRow = coreQuery.data.farm;
  const journeyRow = coreQuery.data.journey;
  const detailGroups: FarmDetailGroup[] = [
    {
      title: t('farmDetails.cropSeason'),
      items: [
        { key: 'crop', icon: 'leaf-outline', label: t('farmDetails.crop'), value: journeyRow?.crop_name ?? t('common.notSet'), missing: dataMissing(journeyRow?.crop_name), onPress: () => openFieldEditor('crop_name') },
        { key: 'stage', icon: 'trending-up-outline', label: t('farmDetails.stage'), value: (journeyRow?.current_stage || '').replace(/_/g, ' ') || t('farmDetails.stageWaiting') },
        { key: 'planting', icon: 'calendar-outline', label: t('farmDetails.plantingDate'), value: journeyRow?.planting_date ? fmtDate(journeyRow.planting_date, 'MMM d, yyyy') : t('common.notSet'), missing: !journeyRow?.planting_date, onPress: () => openFieldEditor('planting_date') },
        { key: 'harvest', icon: 'basket-outline', label: t('farmDetails.harvest'), value: journeyRow?.expected_harvest_date ? fmtDate(journeyRow.expected_harvest_date, 'MMM d, yyyy') : t('common.notSet'), missing: !journeyRow?.expected_harvest_date, onPress: () => openFieldEditor('expected_harvest_date') },
      ],
    },
    {
      title: t('farmDetails.landLocation'),
      items: [
        { key: 'region', icon: 'location-outline', label: t('farmDetails.location'), value: farmRow.region || t('common.notSet'), missing: dataMissing(farmRow.region), onPress: () => openFieldEditor('region') },
        { key: 'field-size', icon: 'resize-outline', label: t('farmDetails.farmSize'), value: t('farmCards.haValue', { n: formatValue(farmRow.size_hectares, 1) }), missing: !farmRow.size_hectares, onPress: () => openFieldEditor('size_hectares') },
        { key: 'irrigation', icon: 'water-outline', label: t('farmDetails.water'), value: farmRow.irrigation_type === 'irrigated' ? t('farmDetails.irrigation') : t('farmDetails.rainOnly'), onPress: () => openFieldEditor('irrigation_type') },
        { key: 'soil-type', icon: 'flask-outline', label: t('farmDetails.soilType'), value: farmRow.soil_type || t('common.notSet'), missing: dataMissing(farmRow.soil_type), onPress: () => openFieldEditor('soil_type') },
        { key: 'boundary', icon: 'map-outline', label: t('farmDetails.farmMap'), value: coreQuery.data.plot?.field_boundary_json ? t('farmDetails.boundaryReady') : t('farmDetails.notMapped'), missing: !coreQuery.data.plot?.field_boundary_json, onPress: () => router.push(`/farms-map/${farmId}` as never) },
      ],
    },
  ];
  const cropChoices = asArray(cropCatalogQuery.data)
    .map((crop) => {
      const name =
        safeText(crop.common_name) ||
        safeText(crop.name) ||
        safeText(crop.local_name);
      return name ? { label: name, value: name } : null;
    })
    .filter((choice): choice is { label: string; value: string } => Boolean(choice))
    .slice(0, 12);
  const resolvedEditorConfig =
    editorConfig?.field === 'crop_name'
      ? {
          ...editorConfig,
          choices:
            cropChoices.length > 0
              ? cropChoices
              : editorConfig.value
                ? [{ label: editorConfig.value, value: editorConfig.value }]
                : undefined,
        }
      : editorConfig;

  return (
    <SafeAreaView style={styles.safeArea} edges={embedded ? [] : ['top', 'bottom']}>
      <View style={[styles.sheet, embedded && styles.embeddedSheet]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              {embedded ? <Text style={styles.eyebrow}>FARM OVERVIEW</Text> : null}
              <Text style={styles.screenTitle}>{coreQuery.data.farm.name}</Text>
              <Text style={styles.screenSubtitle} numberOfLines={1}>
                {coreQuery.data.farm.region || t('farmDetails.farmDashboard')}
              </Text>
            </View>
            {!embedded ? (
              <TouchableOpacity
                accessibilityRole="button"
                onPress={closeScreen}
                style={styles.closeButton}
                testID="farm-workspace-close"
              >
                <Text style={styles.closeButtonText}>{t('common.close')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.topTabBar}>
            <View style={styles.tabRowCompact}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setMode('overview')}
                style={[styles.tabChip, mode === 'overview' ? styles.tabChipActive : null]}
                testID="farm-workspace-tab-overview"
              >
                <Ionicons
                  name="clipboard-outline"
                  size={13}
                  color={mode === 'overview' ? '#fff' : theme.colors.textMuted}
                />
                <Text style={[styles.tabChipText, mode === 'overview' ? styles.tabChipTextActive : null]}>
                  {t('farmDetails.overview')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setMode('notes')}
                style={[styles.tabChip, mode === 'notes' ? styles.tabChipActive : null]}
                testID="farm-workspace-tab-notes"
              >
                <Ionicons
                  name="journal-outline"
                  size={13}
                  color={mode === 'notes' ? '#fff' : theme.colors.textMuted}
                />
                <Text style={[styles.tabChipText, mode === 'notes' ? styles.tabChipTextActive : null]}>
                  {t('farmDetails.notes')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setMode('ledger')}
                style={[styles.tabChip, mode === 'ledger' ? styles.tabChipActive : null]}
                testID="farm-workspace-tab-ledger"
              >
                <Ionicons
                  name="receipt-outline"
                  size={13}
                  color={mode === 'ledger' ? '#fff' : theme.colors.textMuted}
                />
                <Text style={[styles.tabChipText, mode === 'ledger' ? styles.tabChipTextActive : null]}>
                  {t('farmDetails.ledger')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setMode('risks')}
                style={[styles.tabChip, mode === 'risks' ? styles.tabChipActive : null]}
                testID="farm-workspace-tab-risks"
              >
                <Ionicons
                  name="shield-outline"
                  size={13}
                  color={mode === 'risks' ? '#fff' : theme.colors.textMuted}
                />
                <Text style={[styles.tabChipText, mode === 'risks' ? styles.tabChipTextActive : null]}>
                  {t('farmDetails.risks')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {!coreQuery.data.journey ? (
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                {t('today.noJourneyBody')}
              </Text>
              <TouchableOpacity
                onPress={() => setStartJourneyOpen(true)}
                activeOpacity={0.85}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radius.pill,
                  paddingVertical: 12,
                  marginTop: 10,
                }}
              >
                <Ionicons name="leaf" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
                  {t('journeyStart.cta')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {mode === 'overview' ? (
            <>
              <CropHeroCard
                farmName={coreQuery.data.farm.name}
                cropName={coreQuery.data.journey?.crop_name}
                variety={coreQuery.data.journey?.variety}
                sizeHa={coreQuery.data.farm.size_hectares}
                stage={coreQuery.data.journey?.current_stage}
                progressPct={coreQuery.data.journey?.progress_percentage}
                plantingDate={coreQuery.data.journey?.planting_date}
                harvestDate={coreQuery.data.journey?.expected_harvest_date}
                onEdit={() => openFieldEditor('name')}
                onSetPlanting={() => openFieldEditor('planting_date')}
              />

              <HealthRingCard
                snapshot={normalizePlotHealthSnapshot(liveQuery.data?.plotHealth?.data ?? null)}
                loading={liveQuery.isLoading}
              />

              <SoilCard
                soil={soilQuery.data ?? null}
                loading={soilQuery.isLoading}
                error={soilQuery.isError}
              />

              {missingSetupItems.length > 0 ? (
                <View style={styles.inlineNotice}>
                  <Ionicons name="alert-circle-outline" size={16} color="#d08b00" />
                  <Text style={styles.inlineNoticeText}>
                    {t(missingSetupItems.length === 1 ? 'farmDetails.detailsToComplete' : 'farmDetails.detailsToCompletePlural', { count: missingSetupItems.length })}
                  </Text>
                </View>
              ) : null}

              <FarmDetailsCard groups={detailGroups} />
              {saveMessage ? (
                <View style={styles.savedNotice}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
                  <Text style={styles.savedNoticeText}>{saveMessage}</Text>
                </View>
              ) : null}
            </>
          ) : mode === 'notes' ? (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="journal-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.sectionTitle}>Farm Notes</Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={!coreQuery.data.journey}
                    onPress={() => setShowAddLog(true)}
                    style={[styles.refreshButton, !coreQuery.data.journey ? styles.disabledButton : null]}
                    testID="farm-notes-add"
                  >
                    <Ionicons name="add" size={16} color={theme.colors.text} />
                    <Text style={styles.refreshButtonText}>Add note</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.sectionDescription}>
                  {coreQuery.data.journey
                    ? `${farmLogs.length} note${farmLogs.length === 1 ? '' : 's'} for ${coreQuery.data.farm.name}.`
                    : 'Start a crop journey on this farm before adding field notes.'}
                </Text>
              </View>

              {farmLogs.length > 0 ? (
                <View style={styles.logStack}>
                  {farmLogs.map((log) => (
                    <View key={log.id} style={styles.logCard}>
                      <View style={styles.logIconWrap}>
                        <Ionicons
                          name={LOG_OP_ICONS[log.operation_type] ?? 'document-outline'}
                          size={18}
                          color={theme.colors.primary}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={styles.logCardTop}>
                          <Text style={styles.logTitle}>{coreQuery.data.farm.name}</Text>
                          <Text style={styles.logDate}>{fmtDate(log.date)}</Text>
                        </View>
                        <View style={styles.logBadge}>
                          <Ionicons
                            name={LOG_OP_ICONS[log.operation_type] ?? 'document-outline'}
                            size={11}
                            color={theme.colors.primary}
                          />
                          <Text style={styles.logBadgeText}>{log.operation_type}</Text>
                        </View>
                        {log.notes ? (
                          <Text style={styles.logNotes} numberOfLines={2}>{log.notes}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.sectionCard}>
                  <View style={styles.emptyLogState}>
                    <Ionicons name="journal-outline" size={34} color={theme.colors.textMuted} />
                    <Text style={styles.emptyLogTitle}>No notes yet</Text>
                    <Text style={styles.emptyLogText}>
                      Add scouting, spraying, irrigation, harvest, or visit notes for this farm here.
                    </Text>
                  </View>
                </View>
              )}
            </>
          ) : mode === 'ledger' ? (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="receipt-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.sectionTitle}>Farm Ledger</Text>
                </View>
                <View style={styles.metricsRow}>
                  <MetricPill value={formatCurrency(totalExpenses)} label="Recorded spend" />
                  <MetricPill value={`${ledgerEntries.length}`} label="Cost entries" />
                  <MetricPill value="0 TZS" label="Income tracked" />
                </View>
                <Text style={styles.sectionDescription}>
                  Costs come from farm notes with an attached amount. Sales and income can be added when the backend supports income entries.
                </Text>
              </View>

              {ledgerEntries.length > 0 ? (
                <View style={styles.logStack}>
                  {ledgerEntries.map((log) => (
                    <View key={log.id} style={styles.logCard}>
                      <View style={styles.logIconWrap}>
                        <Ionicons
                          name={LOG_OP_ICONS[log.operation_type] ?? 'receipt-outline'}
                          size={18}
                          color={theme.colors.primary}
                        />
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={styles.logCardTop}>
                          <Text style={styles.logTitle}>{log.operation_type}</Text>
                          <Text style={styles.logDate}>{fmtDate(log.date)}</Text>
                        </View>
                        <Text style={styles.logNotes}>{log.notes || 'Cost entry recorded from field note.'}</Text>
                        <Text style={styles.ledgerAmount}>{formatCurrency(log.cost)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.sectionCard}>
                  <View style={styles.emptyLogState}>
                    <Ionicons name="receipt-outline" size={34} color={theme.colors.textMuted} />
                    <Text style={styles.emptyLogTitle}>No ledger entries yet</Text>
                    <Text style={styles.emptyLogText}>
                      Add a note with cost and it will appear in the ledger for this farm.
                    </Text>
                  </View>
                </View>
              )}
            </>
          ) : mode === 'market' ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="trending-up-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.sectionTitle}>Market Outlook</Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => void marketQuery.refetch()}
                  style={styles.refreshButton}
                  testID="farm-market-refresh"
                >
                  <Ionicons name="refresh-outline" size={16} color={theme.colors.text} />
                  <Text style={styles.refreshButtonText}>{marketQuery.isFetching ? 'Refreshing' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
              {!coreQuery.data.journey?.crop_id ? (
                <Text style={styles.sectionDescription}>Set a crop journey first to load market data for this farm.</Text>
              ) : marketQuery.isLoading ? (
                <Text style={styles.sectionDescription}>Loading market outlook...</Text>
              ) : marketQuery.isError ? (
                <Text style={styles.sectionDescription}>Market data is unavailable right now.</Text>
              ) : (
                <>
                  <View style={styles.metricsRow}>
                    <MetricPill value={formatCurrency(marketQuery.data?.latestPrice)} label="Latest price" />
                    <MetricPill value={trendDirectionLabel(marketQuery.data?.trendDirection ?? 'stable')} label="Trend" />
                    <MetricPill value={marketQuery.data?.trendChange != null ? `${marketQuery.data.trendChange.toFixed(1)}%` : '--'} label="Change" />
                  </View>
                  <Text style={styles.sectionDescription}>
                    {coreQuery.data.journey?.crop_name ?? 'This crop'} in {marketQuery.data?.region ?? coreQuery.data.farm.region} was last updated on {fmtDate(marketQuery.data?.latestDate, 'MMM d, yyyy')}.
                  </Text>
                </>
              )}
            </View>
          ) : (
            <>
              {selectedRiskPlotId ? (
                <>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => setSelectedRiskPlotId(null)}
                    style={styles.backLink}
                    testID="farm-risk-back"
                  >
                    <Ionicons name="arrow-back" size={16} color={theme.colors.text} />
                    <Text style={styles.backLinkText}>Back</Text>
                  </TouchableOpacity>

                  <View style={[styles.sectionCard, { borderColor: selectedPlotStatus.border, backgroundColor: selectedPlotStatus.bg }]}>
                    <View style={styles.riskSummaryHeader}>
                      <View style={[styles.riskSummaryIconWrap, { backgroundColor: '#fff8f2' }]}>
                        <Ionicons name={selectedPlotStatus.icon} size={18} color={selectedPlotStatus.color} />
                      </View>
                      <View style={styles.riskSummaryCopy}>
                        <Text style={styles.riskSummaryTitle}>{selectedPlotHealth?.plot_name ?? 'Main Field'}</Text>
                        <Text style={[styles.riskSummaryStatus, { color: selectedPlotStatus.color }]}>{selectedPlotStatus.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.sectionDescription}>
                      {selectedPlotHealth?.journey?.crop_name ?? 'No crop planted'}
                    </Text>
                  </View>

                  <View style={styles.riskBlock}>
                    <Text style={styles.riskBlockLabel}>WHAT&apos;S HAPPENING</Text>
                    <View style={styles.riskSignalStack}>
                      <SignalCard icon="flower-outline" label="Crop health from satellite" message={satelliteSignal.message} tone={satelliteSignal.tone} />
                      <SignalCard icon="cloud-outline" label="Weather outlook" message={weatherSignal.message} tone={weatherSignal.tone} />
                      <SignalCard icon="construct-outline" label="Your field work" message={operationsSignal.message} tone={operationsSignal.tone} />
                      <SignalCard icon="eye-outline" label="Field visits" message={scoutingSignal.message} tone={scoutingSignal.tone} />
                    </View>
                  </View>

                  {isAiLoading ? (
                    <View style={styles.aiBanner}>
                      <View style={styles.aiBannerIconWrap}>
                        <Ionicons name="sparkles-outline" size={18} color="#8559d3" />
                      </View>
                      <View style={styles.aiBannerCopy}>
                        <Text style={styles.aiBannerTitle}>AI is analysing your field...</Text>
                        <Text style={styles.aiBannerText}>Personalised recommendations will appear in each risk card below.</Text>
                      </View>
                      <Text style={styles.aiBannerDots}>•••</Text>
                    </View>
                  ) : null}

                  <View style={styles.riskBlock}>
                    <Text style={styles.riskBlockLabel}>RISKS & WHAT TO DO</Text>
                    <View style={styles.riskCardsStack}>
                      {riskCards.length > 0 ? (
                        riskCards.map((item) => (
                          <RiskActionCard
                            key={item.key}
                            item={item}
                            aiActions={aiActionsForRisk(selectedPlotAi, item.riskType)}
                            aiLoading={isAiLoading}
                          />
                        ))
                      ) : (
                        <View style={styles.emptyRiskCard}>
                          <Ionicons name="checkmark-circle-outline" size={24} color={theme.colors.success} />
                          <Text style={styles.emptyRiskTitle}>No active risks</Text>
                          <Text style={styles.emptyRiskText}>This field does not have any urgent risk cards right now.</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <View style={[styles.sectionCard, { borderColor: farmStatus.border, backgroundColor: farmStatus.bg }]}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.riskSummaryHeader}>
                        <View style={[styles.riskSummaryIconWrap, { backgroundColor: '#fff8f2' }]}>
                          <Ionicons name={farmStatus.icon} size={18} color={farmStatus.color} />
                        </View>
                        <View style={styles.riskSummaryCopy}>
                          <Text style={styles.riskSummaryTitle}>{coreQuery.data.farm.name}</Text>
                          <Text style={[styles.riskSummaryStatus, { color: farmStatus.color }]}>{farmStatus.label}</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        onPress={() => {
                          void liveQuery.refetch();
                          void selectedPlotDetailQuery.refetch();
                        }}
                        style={styles.iconRefreshButton}
                        testID="farm-risks-refresh"
                      >
                        <Ionicons name="refresh-outline" size={16} color={theme.colors.text} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.sectionDescription}>{primaryMessage}</Text>
                  </View>

                  <View style={styles.riskBlock}>
                    <Text style={styles.riskBlockLabel}>YOUR FIELDS ({riskFieldRows.length})</Text>
                    <View style={styles.fieldRowsStack}>
                      {riskFieldRows.length > 0 ? (
                        riskFieldRows.map((plot) => {
                          const plotStatus = statusVisual(plot.risk_level);
                          const healthLabel =
                            typeof plot.ndvi === 'number'
                              ? plot.ndvi >= 0.6
                                ? 'Health: good'
                                : plot.ndvi >= 0.4
                                  ? 'Health: moderate'
                                  : 'Health: low'
                              : 'Health: low';
                          return (
                            <TouchableOpacity
                              key={plot.plot_id}
                              accessibilityRole="button"
                              onPress={() => setSelectedRiskPlotId(plot.plot_id)}
                              style={styles.fieldRowCard}
                              testID={`farm-risk-plot-${plot.plot_id}`}
                            >
                              <View style={[styles.fieldRowDot, { backgroundColor: plotStatus.dot }]} />
                              <View style={styles.fieldRowCopy}>
                                <Text style={styles.fieldRowTitle}>{plot.plot_name}</Text>
                                <Text style={styles.fieldRowMeta}>{plot.crop || 'No crop planted'} · {healthLabel}</Text>
                              </View>
                              <View style={[styles.fieldRowBadge, { backgroundColor: plotStatus.bg, borderColor: plotStatus.border }]}>
                                <Text style={[styles.fieldRowBadgeText, { color: plotStatus.color }]}>{plotStatus.label}</Text>
                              </View>
                              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                            </TouchableOpacity>
                          );
                        })
                      ) : (
                        <Text style={styles.sectionDescription}>
                          Risk signals will appear here once the live monitoring endpoints respond.
                        </Text>
                      )}
                    </View>
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
        {showAddLog ? (
          <AddLogSheet
            farmOptions={logFarmOptions}
            lockedFarmId={String(coreQuery.data.farm.id)}
            onClose={() => setShowAddLog(false)}
            onSaved={() => void handleLogSaved()}
          />
        ) : null}
        {resolvedEditorConfig ? (
          <FarmFieldEditor
            key={resolvedEditorConfig.field}
            config={resolvedEditorConfig}
            saving={updateFieldMutation.isPending}
            error={updateFieldMutation.error ? errorMessage(updateFieldMutation.error) : null}
            onClose={() => setEditorConfig(null)}
            onSave={(value) => updateFieldMutation.mutate({ field: resolvedEditorConfig.field, value })}
          />
        ) : null}
        <StartJourneySheet
          visible={startJourneyOpen}
          farmId={farmId}
          farm={coreQuery.data?.farm ?? null}
          onClose={() => setStartJourneyOpen(false)}
          onStarted={() => void coreQuery.refetch()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  sheet: {
    flex: 1,
    backgroundColor: 'rgba(244, 240, 231, 0.94)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  embeddedSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 10,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  centerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  centerMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  eyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: theme.colors.primary,
  },
  topTabBar: {
    marginTop: -2,
  },
  tabRowCompact: {
    flexDirection: 'row',
    gap: 6,
  },
  tabChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ded8ca',
    backgroundColor: 'rgba(248, 245, 237, 0.84)',
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  tabChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tabChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  tabChipTextActive: {
    color: '#fff',
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
  },
  screenSubtitle: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  closeButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e1ddcf',
    backgroundColor: 'rgba(255,255,255,0.74)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  summaryCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dce8df',
    backgroundColor: '#fbfaf6',
    padding: 14,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f4ec',
  },
  summaryHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  summarySubtitle: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  summaryEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e1ddcf',
    backgroundColor: 'rgba(255, 253, 247, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  summaryEditText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
  summaryMetaInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryDescriptor: {
    color: theme.colors.textMuted,
    fontSize: 12,
    textTransform: 'lowercase',
  },
  compactSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  inlineNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1dfb2',
    backgroundColor: '#fff8e8',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inlineNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: '#8f6500',
  },
  summaryMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryMetaCell: {
    width: '47%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e8e2d7',
    backgroundColor: 'rgba(255, 253, 247, 0.78)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  summaryMetaLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  summaryMetaValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  heroCard: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#1d5d3a',
    padding: 18,
    gap: 12,
  },
  heroOverlay: {
    backgroundColor: 'rgba(8, 28, 14, 0.62)',
    borderRadius: 24,
  },
  heroGlowOne: {
    position: 'absolute',
    top: -40,
    right: -10,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(153, 214, 178, 0.14)',
  },
  heroGlowTwo: {
    position: 'absolute',
    bottom: -50,
    left: -20,
    width: 220,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(17, 40, 26, 0.34)',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#f4f4ec',
  },
  heroDescriptorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroDescriptor: {
    color: 'rgba(243, 243, 234, 0.88)',
    fontSize: 13,
    textTransform: 'lowercase',
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  heroMetaCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  heroMetaLabel: {
    fontSize: 10,
    letterSpacing: 1.4,
    color: 'rgba(240, 244, 236, 0.72)',
  },
  heroMetaValue: {
    fontSize: 23,
    fontWeight: '700',
    color: '#f8f8f1',
  },
  segmentedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  segmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#ece9de',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  segmentButtonActive: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e1d5',
  },
  segmentButtonText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontWeight: '500',
  },
  segmentButtonTextActive: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  infoBanner: {
    borderRadius: 20,
    backgroundColor: '#fff7e1',
    borderWidth: 1,
    borderColor: '#f4dca4',
    padding: 14,
  },
  infoBannerText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#7b5b17',
  },
  monitoringBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#ecebe3',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  monitoringBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textMuted,
  },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eadfcb',
    backgroundColor: 'rgba(251, 250, 246, 0.88)',
    padding: 14,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textMuted,
  },
  fieldStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  fieldStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#f26b1d',
  },
  fieldStatusLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  fieldStatusMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd8c8',
    backgroundColor: 'rgba(255, 254, 252, 0.82)',
    paddingVertical: 12,
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricPill: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e8e2d7',
    backgroundColor: 'rgba(255, 253, 247, 0.78)',
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 2,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '700',
    color: theme.colors.text,
  },
  metricLabel: {
    fontSize: 12,
    color: theme.colors.text,
  },
  noticeStack: {
    gap: 10,
  },
  noticeStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e7e2d8',
    backgroundColor: 'rgba(255, 253, 247, 0.82)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeStripHighlight: {
    borderColor: '#cfe9df',
    backgroundColor: '#ebfbf4',
  },
  noticeIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e1ddcf',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 254, 251, 0.82)',
  },
  disabledButton: {
    opacity: 0.5,
  },
  refreshButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  ndviHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  ndviHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  ndviObservationText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  chartCard: {
    borderTopWidth: 1,
    borderTopColor: '#efe9de',
    paddingTop: 12,
    minHeight: 180,
  },
  ndviFooterCard: {
    alignSelf: 'flex-start',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e7e2d8',
    backgroundColor: 'rgba(255, 253, 247, 0.82)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  ndviFooterDate: {
    fontSize: 14,
    color: theme.colors.text,
  },
  ndviFooterValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  ndviEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#f6f4ed',
    minHeight: 160,
    padding: 16,
  },
  ndviEmptyText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: theme.colors.textMuted,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  riskSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  riskSummaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riskSummaryCopy: {
    flex: 1,
    gap: 2,
  },
  riskSummaryTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
  },
  riskSummaryStatus: {
    fontSize: 15,
    fontWeight: '700',
  },
  iconRefreshButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 253, 247, 0.82)',
    borderWidth: 1,
    borderColor: '#e1ddcf',
  },
  riskBlock: {
    gap: 10,
  },
  riskBlockLabel: {
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  fieldRowsStack: {
    gap: 10,
  },
  fieldRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eadfcb',
    backgroundColor: 'rgba(251, 250, 246, 0.86)',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fieldRowDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  fieldRowCopy: {
    flex: 1,
    gap: 2,
  },
  fieldRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  fieldRowMeta: {
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  fieldRowBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fieldRowBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  riskSignalStack: {
    gap: 10,
  },
  signalCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  signalIconWrap: {
    width: 28,
    alignItems: 'center',
    paddingTop: 2,
  },
  signalCopy: {
    flex: 1,
    gap: 4,
  },
  signalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  signalMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textMuted,
  },
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e3d6ff',
    backgroundColor: '#f5eeff',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  aiBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#efe5ff',
  },
  aiBannerCopy: {
    flex: 1,
    gap: 2,
  },
  aiBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  aiBannerText: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  aiBannerDots: {
    fontSize: 18,
    color: '#8559d3',
    letterSpacing: 2,
  },
  riskCardsStack: {
    gap: 12,
  },
  riskCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#eadfcb',
    backgroundColor: 'rgba(251, 250, 246, 0.88)',
    padding: 16,
    gap: 12,
  },
  riskCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  riskCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    flexWrap: 'wrap',
  },
  riskCardIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3efe8',
  },
  riskCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  riskAiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#efe5ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  riskAiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8559d3',
  },
  severityBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  severityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  riskCardDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textMuted,
  },
  whatToDoCard: {
    borderRadius: 18,
    backgroundColor: '#eef8f3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  whatToDoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  whatToDoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c8f67',
  },
  whatToDoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  whatToDoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.text,
  },
  aiLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiLoadingText: {
    fontSize: 13,
    color: '#8559d3',
    fontWeight: '600',
  },
  emptyRiskCard: {
    alignItems: 'center',
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d3e7db',
    backgroundColor: '#eef8f3',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyRiskTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  emptyRiskText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: theme.colors.textMuted,
  },
  emptyLogState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 26,
    paddingHorizontal: 18,
  },
  emptyLogTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  emptyLogText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: theme.colors.textMuted,
  },
  logStack: { gap: 10 },
  logCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e8e2d7',
    backgroundColor: 'rgba(255, 253, 247, 0.84)',
    padding: 12,
  },
  logIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
  logTitle: {
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
  ledgerAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  dataList: {
    gap: 12,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#efe9de',
  },
  dataLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
    flex: 1,
  },
  dataValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'right',
  },
  dataValueWarn: {
    color: '#d08b00',
  },
  dataValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flex: 1,
  },
  inlineEditButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e1ddcf',
    backgroundColor: 'rgba(255, 253, 247, 0.82)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inlineEditButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text,
  },
  savedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#eaf7ef',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  savedNoticeText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  editorBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 25, 21, 0.34)',
  },
  editorSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#fbfaf6',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 16,
  },
  editorHandle: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#d6d1c5',
    alignSelf: 'center',
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  editorHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  editorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  editorPrompt: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textMuted,
  },
  editorCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e1ddcf',
    backgroundColor: '#fffdfa',
  },
  editorInput: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d9d4c8',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    fontSize: 17,
    color: theme.colors.text,
  },
  editorSelectedDate: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  quickChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChoice: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ded8ca',
    backgroundColor: '#fff',
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  quickChoiceSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: '#edf7f0',
  },
  quickChoiceText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  quickChoiceTextSelected: {
    color: theme.colors.primary,
  },
  editorError: {
    fontSize: 13,
    lineHeight: 18,
    color: '#c73a28',
  },
  editorChoiceList: {
    gap: 10,
  },
  editorChoice: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ded8ca',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  editorChoiceSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: '#edf7f0',
  },
  editorChoiceText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  editorChoiceTextSelected: {
    color: theme.colors.primary,
  },
  editorSaveButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
  },
  editorSaveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  watchlistStack: {
    gap: 10,
  },
  watchlistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  watchlistDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#f26b1d',
    marginTop: 7,
  },
  watchlistText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.text,
  },
  actionCard: {
    borderRadius: 18,
    backgroundColor: '#f2f7f0',
    padding: 14,
    gap: 6,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  actionMessage: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textMuted,
  },
});
