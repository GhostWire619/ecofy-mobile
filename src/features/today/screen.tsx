import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageSource } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AchievementModal, SmartNudges } from '@/components/game';
import { Card } from '@/components/core/card';
import { UndoToast } from '@/components/core/undo-toast';
import { Screen, Section } from '@/components/layout/screen';
import { Skeleton, SkeletonCard } from '@/components/state/skeleton';
import { TaskActionsSheet } from '@/components/tasks/task-actions-sheet';
import { TaskCompletionSheet } from '@/components/tasks/task-completion-sheet';
import { StartJourneySheet } from '@/features/farms/start-journey-sheet';
import { normalizeJourneyRecord } from '@/features/farms/data';
import { mobileApi } from '@/lib/api/mobile';
import { useAuth } from '@/lib/auth/provider';
import { bootstrapCurrentUser } from '@/lib/bootstrap/bootstrap';
import { decodeInstructions, farmRepository, journeyRepository } from '@/lib/db/repositories';
import type { AchievementBadge, JourneyRecord, LiveWeatherResponse, TaskRecord } from '@/lib/domain/types';
import { useTaskActions } from '@/lib/hooks/use-task-actions';
import { useTaskCompletion } from '@/lib/hooks/use-task-completion';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';
import {
  assessTodayWeather,
  weatherAdviceForTask,
  workabilityHeadline,
  type TodayWeather,
} from '@/lib/utils/weather-advice';

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const WEATHER_IMAGES = {
  clearDay: require('../../../assets/images/weather/clear-day.png'),
  clearNight: require('../../../assets/images/weather/clear-night.png'),
  partlyCloudy: require('../../../assets/images/weather/partly-cloudy.png'),
  cloudy: require('../../../assets/images/weather/cloudy.png'),
  rain: require('../../../assets/images/weather/rain.png'),
  storm: require('../../../assets/images/weather/storm.png'),
  fog: require('../../../assets/images/weather/fog.png'),
} satisfies Record<string, ImageSource>;

const TODAY_IMAGES = {
  background: require('../../../assets/images/today/home-field-background.png'),
  scan: require('../../../assets/images/today/quick-scan.png'),
  note: require('../../../assets/images/today/quick-note.png'),
  journey: require('../../../assets/images/today/quick-journey.png'),
  ai: require('../../../assets/images/today/quick-ai.png'),
} satisfies Record<string, ImageSource>;

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'today.goodMorning';
  if (h < 17) return 'today.goodAfternoon';
  return 'today.goodEvening';
}

function isNightTime() {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 18;
}

function weatherImage(conditions?: string, night = false): ImageSource {
  const value = conditions?.toLowerCase() ?? '';
  if (value.includes('thunder')) return WEATHER_IMAGES.storm;
  if (value.includes('rain') || value.includes('drizzle') || value.includes('snow')) {
    return WEATHER_IMAGES.rain;
  }
  if (value.includes('fog') || value.includes('mist')) return WEATHER_IMAGES.fog;
  if (value.includes('partly')) return WEATHER_IMAGES.partlyCloudy;
  if (value.includes('cloud') || value.includes('overcast')) return WEATHER_IMAGES.cloudy;
  return night ? WEATHER_IMAGES.clearNight : WEATHER_IMAGES.clearDay;
}

function dayLabel(date: string, index: number) {
  if (index === 0) return 'Today';
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date.slice(0, 3)
    : parsed.toLocaleDateString(undefined, { weekday: 'short' });
}

function roundedTemperature(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}°` : '--';
}

function WeatherWeekWidget({
  farmName,
  weather,
  loading,
  error,
  onRetry,
}: {
  farmName: string;
  weather?: LiveWeatherResponse;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const days = weather?.forecast.slice(0, 7) ?? [];
  const current = weather?.current;
  const workability = workabilityHeadline(assessTodayWeather(weather));
  const nightNow = isNightTime();

  return (
    <Card style={styles.weatherCard}>
      <View style={styles.weatherHeader}>
        <View style={styles.weatherTitleWrap}>
          <View style={styles.weatherTitleIcon}>
            <Image
              source={weatherImage(current?.conditions, nightNow)}
              style={styles.weatherTitleImage}
              contentFit="contain"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.weatherTitle}>{t('today.weatherThisWeek')}</Text>
            {loading && !farmName ? (
              <Skeleton height={10} width={130} style={{ marginTop: 4 }} />
            ) : (
              <Text style={styles.weatherFarm}>Active farm · {farmName}</Text>
            )}
          </View>
        </View>
        {current ? (
          <View style={styles.currentWeather}>
            <Text style={styles.currentTemperature}>
              {roundedTemperature(current.temperature)}
            </Text>
            <Text style={styles.currentCondition} numberOfLines={1}>
              {current.conditions ?? 'Current'}
            </Text>
          </View>
        ) : loading ? (
          <View style={styles.currentWeather}>
            <Skeleton height={22} width={46} />
            <Skeleton height={9} width={38} style={{ marginTop: 5 }} />
          </View>
        ) : null}
      </View>

      {loading ? (
        // Skeleton the forecast only — the card chrome (title, farm) is already up,
        // so the screen feels instant and just the data fills in.
        <View style={styles.weatherSkeleton}>
          <View style={styles.forecastLegend}>
            <Skeleton height={9} width={110} />
            <Skeleton height={9} width={68} />
          </View>
          <View style={styles.forecastRow}>
            {Array.from({ length: 7 }).map((_, i) => (
              <View key={i} style={styles.forecastDay}>
                <Skeleton height={9} width={20} />
                <Skeleton height={28} width={28} radius={14} style={{ marginVertical: 5 }} />
                <Skeleton height={12} width={20} />
                <Skeleton height={9} width={16} style={{ marginTop: 3 }} />
              </View>
            ))}
          </View>
          <Skeleton height={32} width="100%" radius={12} style={{ marginTop: 4 }} />
        </View>
      ) : error ? (
        <TouchableOpacity style={styles.weatherState} onPress={onRetry} activeOpacity={0.75}>
          <Ionicons name="refresh-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.weatherRetry}>{t('today.weatherRetry')}</Text>
        </TouchableOpacity>
      ) : days.length === 0 ? (
        <View style={styles.weatherState}>
          <Ionicons name="location-outline" size={18} color={theme.colors.textMuted} />
          <Text style={styles.weatherStateText}>
            {t('today.addCoordsForecast')}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.forecastLegend}>
            <Text style={styles.temperatureLegendText}>High / Low temperature</Text>
            <View style={styles.rainChanceLabel}>
              <Ionicons name="water" size={10} color={theme.colors.info} />
              <Text style={styles.rainChanceLabelText}>Rain chance</Text>
            </View>
          </View>
          <View style={styles.forecastRow}>
            {days.map((day, index) => {
              const rainChance = day.precipitation_probability;
              // "Today" shows the *current* sky (what the farmer sees now), not the
              // daily aggregate — Open-Meteo's daily code can read "rain" off a
              // forecast shower later in the day, which looks wrong under a clear sky.
              // The rain-% below still flags that rain is likely later.
              const iconConditions =
                index === 0 && current?.conditions ? current.conditions : day.conditions;
              return (
                <View key={`${day.date}-${index}`} style={styles.forecastDay}>
                  <Text style={[styles.forecastDayLabel, index === 0 && styles.forecastToday]}>
                    {index === 0 ? t('common.today') : dayLabel(day.date, index)}
                  </Text>
                  <Image
                    source={weatherImage(iconConditions, index === 0 && nightNow)}
                    style={styles.forecastWeatherImage}
                    contentFit="contain"
                  />
                  <Text style={styles.forecastTemperature}>
                    {roundedTemperature(day.temperature_high)}
                  </Text>
                  <Text style={styles.forecastLow}>
                    {roundedTemperature(day.temperature_low)}
                  </Text>
                  <View style={styles.rainRow}>
                    <Ionicons name="water" size={10} color={theme.colors.info} />
                    <Text style={styles.rainText}>
                      {typeof rainChance === 'number' ? `${Math.round(rainChance)}%` : '--'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          {workability ? (
            <View
              style={[
                styles.weatherFooter,
                workability.tone === 'warn' && styles.weatherFooterWarn,
              ]}
            >
              <Ionicons
                name={workability.tone === 'warn' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                size={14}
                color={workability.tone === 'warn' ? theme.colors.warning : theme.colors.primary}
              />
              <Text
                style={[
                  styles.weatherFooterText,
                  workability.tone === 'warn' && styles.weatherFooterTextWarn,
                ]}
              >
                {t(workability.key, workability.params)}
              </Text>
            </View>
          ) : (
            <View style={styles.weatherFooter}>
              <Ionicons name="water-outline" size={14} color={theme.colors.primary} />
              <Text style={styles.weatherFooterText}>
                {t('today.rainExpectedDays', {
                  mm: Math.round(weather?.summary?.total_rainfall_mm ?? 0),
                  days: days.length,
                })}
              </Text>
            </View>
          )}
        </>
      )}
    </Card>
  );
}

/** Pick the single most important pending task: priority, then earliest due, then sequence. */
function topTask(tasks: TaskRecord[]): TaskRecord | null {
  const pending = tasks.filter((t) => t.status === 'pending');
  if (pending.length === 0) return null;
  return [...pending].sort((a, b) => {
    const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    if (pr !== 0) return pr;
    const ad = a.due_date ?? '9999';
    const bd = b.due_date ?? '9999';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.sequence_order - b.sequence_order;
  })[0];
}

const QUICK_ACTIONS: {
  icon: keyof typeof Ionicons.glyphMap;
  image: ImageSource;
  labelKey: string;
  route: string;
}[] = [
  { icon: 'scan-outline', image: TODAY_IMAGES.scan, labelKey: 'today.scanCrop', route: '/scan' },
  { icon: 'document-text-outline', image: TODAY_IMAGES.note, labelKey: 'today.addNote', route: '/(tabs)/logbook' },
  { icon: 'trophy-outline', image: TODAY_IMAGES.journey, labelKey: 'today.myJourney', route: '/(tabs)/journey' },
  { icon: 'sparkles-outline', image: TODAY_IMAGES.ai, labelKey: 'today.askAi', route: '/assistant' },
];

export function TodayScreen() {
  const { user, refreshBootstrap } = useAuth();
  const { t, localize } = useI18n();
  const queryClient = useQueryClient();
  const [celebrating, setCelebrating] = useState<AchievementBadge | null>(null);
  const [startJourneyOpen, setStartJourneyOpen] = useState(false);

  const { data, refetch, isRefetching, isLoading } = useQuery({
    queryKey: ['today-screen'],
    queryFn: async () => {
      const onlineFarms = await mobileApi.listFarms().catch(() => []);

      // Resolve the active farm. If the farmer hasn't picked one, default to the
      // farm that already has a journey (so Today opens on real work), else the
      // first farm — and persist it so weather + notes stay on the same farm.
      let activeFarmId = await farmRepository.getSelectedFarmId();
      if (!activeFarmId) {
        const anyJourney = await journeyRepository.getActiveJourney().catch(() => null);
        activeFarmId =
          anyJourney?.farm_id ?? (onlineFarms[0]?.id ? String(onlineFarms[0].id) : null);
        if (activeFarmId) {
          await farmRepository.setSelectedFarmId(activeFarmId).catch(() => undefined);
        }
      }

      const activeFarm = activeFarmId
        ? onlineFarms.find((farm) => String(farm.id) === String(activeFarmId)) ??
          (await farmRepository.getFarm(activeFarmId))
        : null;

      // Detect the journey the same authoritative way the Farms tab does — the
      // server list — so an already-started journey is never missed just because
      // the local DB hasn't caught up. Fall back to local when offline.
      let journey: JourneyRecord | null = null;
      if (activeFarmId) {
        try {
          const serverJourneys = (await mobileApi.listFarmJourneys(String(activeFarmId))).map(
            normalizeJourneyRecord,
          );
          journey =
            serverJourneys.find((j) => j.status === 'active' || j.status === 'planned') ?? null;
        } catch {
          // Offline / request failed — fall back to the local copy below.
        }
        if (!journey) {
          journey = await journeyRepository.getActiveJourneyForFarm(String(activeFarmId));
        }
      }

      if (!journey) {
        return { activeFarm, journey: null as null, tasks: [] as TaskRecord[] };
      }

      // Tasks live in the local DB (hydrated by bootstrap). If the server knew
      // about this journey but the local DB doesn't have its tasks yet, pull a
      // fresh bootstrap once so Today shows the plan instead of an empty journey.
      let tasks = await journeyRepository.listTasks(journey.id);
      if (tasks.length === 0) {
        await bootstrapCurrentUser().catch(() => undefined);
        tasks = await journeyRepository.listTasks(journey.id);
      }
      return { activeFarm, journey, tasks };
    },
  });

  const completion = useTaskCompletion({
    farmId: data?.journey?.farm_id ?? null,
    journeyId: data?.journey?.id ?? null,
    plotId: data?.journey?.plot_id ?? null,
    onAchievement: setCelebrating,
  });
  const actions = useTaskActions();

  const firstName = (user?.full_name ?? 'Farmer').split(' ')[0];
  const journey = data?.journey ?? null;
  const activeFarm = data?.activeFarm ?? null;
  const weatherQuery = useQuery({
    queryKey: ['today-weather', activeFarm?.id],
    queryFn: () => mobileApi.getWeatherForFarm(String(activeFarm?.id)),
    enabled: Boolean(activeFarm?.id),
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
  // Fetching weather runs the server's weather re-plan (it may hold/restore
  // weather-blocked tasks and post a nudge). Pull a fresh bootstrap once the
  // weather lands so those changes show up here without waiting for the next sync.
  const weatherSyncedAt = weatherQuery.dataUpdatedAt;
  useEffect(() => {
    if (!weatherSyncedAt) return;
    let cancelled = false;
    void refreshBootstrap()
      .then(() => {
        if (cancelled) return;
        void queryClient.invalidateQueries({ queryKey: ['today-screen'] });
        void queryClient.invalidateQueries({ queryKey: ['smart-nudges'] });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [weatherSyncedAt, refreshBootstrap, queryClient]);
  const plantingDateMissing = Boolean(journey && !journey.planting_date?.trim());
  // Only surface tasks that are actually due now (within ~2 weeks). Future-stage
  // tasks (e.g. "protect flowering" months out) stay in the Journey "Coming up"
  // list, so Today never tells the farmer to act on a stage they haven't reached.
  const horizonIso = (() => {
    const h = new Date();
    h.setDate(h.getDate() + 14);
    return h.toISOString().slice(0, 10);
  })();
  const relevant = (data?.tasks ?? []).filter(
    (t) => t.status === 'pending' && (!t.due_date || t.due_date <= horizonIso),
  );
  const hero = topTask(relevant);
  const remaining = relevant.length;
  // Weather-aware guidance: annotate the hero task and, when it's a poor day for
  // that job, suggest a task that *is* doable today — without hiding anything.
  const todayWeather: TodayWeather | null = assessTodayWeather(weatherQuery.data);
  const heroWeather = hero ? weatherAdviceForTask(hero, todayWeather) : null;
  const altTask =
    hero && heroWeather?.level === 'block'
      ? topTask(
          relevant.filter(
            (t) => t.id !== hero.id && weatherAdviceForTask(t, todayWeather)?.level !== 'block',
          ),
        )
      : null;
  const refreshToday = () => {
    void refetch();
    if (activeFarm?.id) {
      void weatherQuery.refetch();
    }
  };

  return (
    <View style={styles.root}>
    <Image source={TODAY_IMAGES.background} style={styles.backgroundImage} contentFit="cover" />
    <View style={styles.backgroundVeil} />
    <Screen
      safeAreaStyle={styles.transparentSurface}
      style={styles.transparentSurface}
      contentContainerStyle={styles.content}
      onRefresh={refreshToday}
      refreshing={isRefetching || weatherQuery.isRefetching}
    >
      {/* ── Compact greeting ── */}
      <View style={styles.header}>
        <Text style={styles.greeting}>
          {t(greetingKey())}, <Text style={styles.greetingName}>{firstName}</Text> 👋
        </Text>
      </View>

      {activeFarm || isLoading ? (
        <Animated.View entering={FadeInDown.duration(280)}>
          <WeatherWeekWidget
            farmName={activeFarm?.name ?? ''}
            weather={weatherQuery.data}
            loading={isLoading || weatherQuery.isLoading}
            error={weatherQuery.isError}
            onRetry={() => void weatherQuery.refetch()}
          />
        </Animated.View>
      ) : null}

      {/* ── Quick actions ── */}
      <Animated.View entering={FadeInDown.duration(280).delay(50)} style={styles.quickSection}>
        <Text style={styles.quickSectionTitle}>{t('today.quickActions')}</Text>
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity
              key={a.labelKey}
              style={styles.quickItem}
              activeOpacity={0.75}
              onPress={() => router.push(a.route as never)}
            >
              <View style={styles.quickArtShell}>
                <Image source={a.image} style={styles.quickArt} contentFit="contain" />
                <View style={styles.quickMiniBadge}>
                  <Ionicons name={a.icon} size={10} color={theme.colors.primaryDark} />
                </View>
              </View>
              <Text style={styles.quickLabel} numberOfLines={1}>{t(a.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {/* ── Hero: do this today ── */}
      <Animated.View entering={FadeInDown.duration(280).delay(100)}>
        <Section>
          <Text style={styles.sectionTitle}>{t('today.doThisToday')}</Text>
          {isLoading ? (
            <SkeletonCard />
          ) : journey && plantingDateMissing ? (
            <Card>
            <Text style={styles.heroTitle}>{t('today.setPlantingTitle')}</Text>
            <Text style={styles.heroSub}>
              {t('today.setPlantingBody', { farm: activeFarm?.name ?? 'This farm' })}
            </Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/journey')}>
              <Text style={styles.moreLink}>{t('today.openJourneySetup')}</Text>
            </TouchableOpacity>
          </Card>
        ) : hero ? (
          <Card>
            <View style={styles.heroTop}>
              <View style={styles.heroIcon}>
                <Ionicons name="leaf" size={22} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.heroTitle}>{localize(hero.title)}</Text>
                {journey ? (
                  <Text style={styles.heroSub}>
                    {journey.common_name}
                    {journey.current_stage ? ` · ${journey.current_stage.replace(/_/g, ' ')}` : ''}
                  </Text>
                ) : null}
              </View>
              <View style={styles.xpTag}>
                <Ionicons name="star" size={12} color={theme.colors.accent} />
                <Text style={styles.xpTagText}>{hero.xp_value}</Text>
              </View>
            </View>
            {decodeInstructions(hero).slice(0, 3).map((line) => (
              <Text key={line} style={styles.heroInstruction}>• {line}</Text>
            ))}
            {heroWeather ? (
              <View
                style={[
                  styles.weatherNote,
                  heroWeather.level === 'block' ? styles.weatherNoteBlock : styles.weatherNoteCaution,
                ]}
              >
                <Ionicons
                  name="rainy-outline"
                  size={15}
                  color={heroWeather.level === 'block' ? theme.colors.warning : theme.colors.info}
                />
                <Text style={styles.weatherNoteText}>{t(heroWeather.key, heroWeather.params)}</Text>
              </View>
            ) : null}
            {altTask ? (
              <TouchableOpacity
                style={styles.altTask}
                activeOpacity={0.8}
                onPress={() => completion.begin(altTask)}
              >
                <Ionicons name="sunny-outline" size={15} color={theme.colors.primary} />
                <Text style={styles.altTaskText}>
                  {t('today.betterForToday')} <Text style={styles.altTaskTitle}>{localize(altTask.title)}</Text>
                </Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.cta, completion.isCompleting && styles.ctaDisabled]}
              disabled={completion.isCompleting}
              onPress={() => completion.begin(hero)}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.ctaText}>{t('today.markDoneXp', { xp: hero.xp_value })}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => actions.open(hero)} hitSlop={6}>
              <Text style={styles.snoozeLink}>{t('today.snoozeSkip')}</Text>
            </TouchableOpacity>
            {remaining > 1 ? (
              <TouchableOpacity onPress={() => router.push('/(tabs)/journey')}>
                <Text style={styles.moreLink}>
                  {t(remaining - 1 === 1 ? 'today.moreTasksOne' : 'today.moreTasksMany', { count: remaining - 1 })}
                </Text>
              </TouchableOpacity>
            ) : null}
          </Card>
        ) : journey ? (
          <Card>
            <Text style={styles.allDone}>{t('today.allCaughtUp')}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/journey')}>
              <Text style={styles.moreLink}>{t('today.viewJourney')}</Text>
            </TouchableOpacity>
          </Card>
        ) : activeFarm ? (
          <Card>
            <Text style={styles.heroTitle}>{t('today.noJourneyTitle', { farm: activeFarm.name })}</Text>
            <Text style={styles.heroSub}>
              {t('today.noJourneyBody')}
            </Text>
            <TouchableOpacity
              style={styles.cta}
              onPress={() => setStartJourneyOpen(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="leaf" size={18} color="#fff" />
              <Text style={styles.ctaText}>{t('journeyStart.cta')}</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <Card>
            <Text style={styles.heroTitle}>{t('today.startFirstTitle')}</Text>
            <Text style={styles.heroSub}>
              {t('today.startFirstBody')}
            </Text>
            <TouchableOpacity
              style={styles.cta}
              onPress={() => router.push('/farms/new')}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.ctaText}>{t('today.getStarted')}</Text>
            </TouchableOpacity>
          </Card>
          )}
        </Section>
      </Animated.View>

      {/* ── Smart nudges (tick-engine + advisories, all journeys) ── */}
      <Section>
        <SmartNudges title={t('today.smartNudges')} />
      </Section>

      <AchievementModal badge={celebrating} onClose={() => setCelebrating(null)} />
    </Screen>
      <TaskCompletionSheet {...completion.sheet} />
      <TaskActionsSheet {...actions.sheet} />
      <UndoToast {...completion.toast} />
      <StartJourneySheet
        visible={startJourneyOpen}
        farmId={activeFarm?.id ? String(activeFarm.id) : null}
        farm={activeFarm}
        onClose={() => setStartJourneyOpen(false)}
        onStarted={() => void refetch()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f4ec',
  },
  transparentSurface: {
    backgroundColor: 'transparent',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.78,
  },
  backgroundVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 247, 239, 0.58)',
  },
  content: {
    gap: 12,
    paddingTop: 6,
  },
  header: { minHeight: 24, justifyContent: 'center' },
  greeting: { fontSize: 17, lineHeight: 22, color: theme.colors.textMuted },
  greetingName: { fontWeight: '800', color: theme.colors.text },

  sectionTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  weatherCard: {
    padding: 14,
    gap: 12,
    borderColor: '#dce7dc',
    boxShadow: '0 8px 24px rgba(15, 61, 36, 0.07)',
    borderCurve: 'continuous',
  },
  weatherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  weatherTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  weatherTitleIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weatherTitleImage: { width: 38, height: 38 },
  weatherTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  weatherFarm: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  currentWeather: { alignItems: 'flex-end', maxWidth: 100 },
  currentTemperature: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '800',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  currentCondition: { fontSize: 10, color: theme.colors.textMuted, textTransform: 'capitalize' },
  weatherState: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  weatherSkeleton: { gap: 10 },
  weatherStateText: { flexShrink: 1, fontSize: 12, color: theme.colors.textMuted },
  weatherRetry: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  forecastLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  temperatureLegendText: { fontSize: 9, fontWeight: '600', color: theme.colors.textMuted },
  rainChanceLabel: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rainChanceLabelText: { fontSize: 9, fontWeight: '600', color: theme.colors.textMuted },
  forecastRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    paddingHorizontal: 5,
    paddingVertical: 10,
    borderCurve: 'continuous',
  },
  forecastDay: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3 },
  forecastDayLabel: { fontSize: 9, fontWeight: '700', color: theme.colors.textMuted },
  forecastToday: { color: theme.colors.primary },
  forecastWeatherImage: { width: 28, height: 28 },
  forecastTemperature: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  forecastLow: {
    fontSize: 10,
    color: theme.colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  rainRow: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  rainText: {
    fontSize: 8,
    fontWeight: '700',
    color: theme.colors.info,
    fontVariant: ['tabular-nums'],
  },
  weatherFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eef7f1',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  weatherFooterText: { flex: 1, fontSize: 11, lineHeight: 15, color: theme.colors.primaryDark },
  weatherFooterWarn: { backgroundColor: theme.colors.warning + '1f' },
  weatherFooterTextWarn: { color: theme.colors.warning, fontWeight: '700' },

  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  heroSub: { fontSize: 13, color: theme.colors.textMuted, textTransform: 'capitalize' },
  heroInstruction: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  allDone: { fontSize: 15, color: theme.colors.text, fontWeight: '600' },

  weatherNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderRadius: theme.radius.md,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginTop: 8,
  },
  weatherNoteBlock: { backgroundColor: theme.colors.warning + '1c' },
  weatherNoteCaution: { backgroundColor: theme.colors.info + '14' },
  weatherNoteText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: theme.colors.text },
  altTask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 8,
    paddingVertical: 6,
  },
  altTaskText: { flex: 1, fontSize: 13, color: theme.colors.textMuted },
  altTaskTitle: { fontWeight: '800', color: theme.colors.text },

  xpTag: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: theme.colors.accent + '22',
    borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 3,
  },
  xpTagText: { fontSize: 12, fontWeight: '800', color: theme.colors.warning },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill,
    paddingVertical: 13, marginTop: 6,
  },
  ctaDisabled: { backgroundColor: theme.colors.disabled },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  moreLink: { color: theme.colors.primary, fontWeight: '700', fontSize: 13, marginTop: 8, textAlign: 'center' },
  snoozeLink: { color: theme.colors.textMuted, fontWeight: '600', fontSize: 13, marginTop: 8, textAlign: 'center' },

  quickSection: { alignItems: 'center', gap: 8, paddingVertical: 2 },
  quickSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  quickGrid: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  quickItem: {
    width: 76,
    alignItems: 'center',
    gap: 5,
  },
  quickArtShell: {
    width: 64,
    height: 58,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 250, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(21, 87, 56, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
    overflow: 'visible',
    boxShadow: '0 10px 22px rgba(18, 67, 42, 0.11)',
  },
  quickArt: {
    width: 58,
    height: 58,
    marginTop: -8,
  },
  quickMiniBadge: {
    position: 'absolute',
    right: 6,
    bottom: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8f6ec',
    borderWidth: 1,
    borderColor: 'rgba(21, 87, 56, 0.12)',
  },
  quickLabel: { fontSize: 10, fontWeight: '800', color: theme.colors.text },
});
