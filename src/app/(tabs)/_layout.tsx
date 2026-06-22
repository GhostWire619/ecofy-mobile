import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth/provider';
import { useEngagement } from '@/lib/hooks/use-engagement';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

function initials(name?: string | null) {
  if (!name?.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || 'U';
}

function HeaderActions() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: engagement } = useEngagement();
  const hasAlerts = (engagement?.reward_eligibility?.length ?? 0) > 0;

  return (
    <View style={s.headerActions}>
      <Pressable
        style={s.bellBtn}
        hitSlop={6}
        accessibilityLabel={t('tabs.notifications')}
        onPress={() => router.push('/notifications')}
      >
        <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
        {hasAlerts ? <View style={s.bellDot} /> : null}
      </Pressable>
      <Pressable
        style={s.avatar}
        hitSlop={6}
        accessibilityLabel={t('tabs.profileSettings')}
        onPress={() => router.push('/settings')}
      >
        <Text style={s.avatarText}>{initials(user?.full_name)}</Text>
      </Pressable>
    </View>
  );
}

type TabIconProps = { name: React.ComponentProps<typeof Ionicons>['name']; focused: boolean; color: string };

function TabIcon({ name, focused, color }: TabIconProps) {
  return (
    <View style={[s.iconWrap, focused && s.iconWrapActive]}>
      <Ionicons name={name} size={20} color={color} strokeWidth={focused ? 2.5 : 2} />
    </View>
  );
}

function TabLabel({
  label,
  focused,
  color,
}: {
  label: string;
  focused: boolean;
  color: string;
}) {
  // Keep to one line and let a longer word (e.g. Swahili) shrink rather than wrap
  // — wrapping to 2 lines would break the fixed tab-bar height.
  return (
    <Text
      style={[s.tabLabel, focused && s.tabLabelActive, { color }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.8}
    >
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs
      initialRouteName="today"
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: s.tabBar,
        headerStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: theme.colors.text, fontWeight: '800', fontSize: 18 },
        headerRight: () => <HeaderActions />,
        headerRightContainerStyle: { paddingRight: 16 },
      }}
    >
      {/* ── Today (daily guide) ── */}
      <Tabs.Screen
        name="today"
        options={{
          title: t('tabs.today'),
          tabBarLabel: ({ focused, color }) => (
            <TabLabel label={t('tabs.today')} focused={focused} color={color} />
          ),
          tabBarIcon: ({ focused, color }) => <TabIcon name="today-outline" focused={focused} color={color} />,
        }}
      />

      {/* ── Farms (dashboard) ── */}
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.farms'),
          tabBarLabel: ({ focused, color }) => (
            <TabLabel label={t('tabs.farms')} focused={focused} color={color} />
          ),
          tabBarIcon: ({ focused, color }) => <TabIcon name="leaf-outline" focused={focused} color={color} />,
        }}
      />

      {/* ── Journey (gamified guide) ── */}
      <Tabs.Screen
        name="journey"
        options={{
          title: t('tabs.journey'),
          tabBarLabel: ({ focused, color }) => (
            <TabLabel label={t('tabs.journey')} focused={focused} color={color} />
          ),
          tabBarIcon: ({ focused, color }) => <TabIcon name="trophy-outline" focused={focused} color={color} />,
        }}
      />

      {/* ── Notes ── */}
      <Tabs.Screen
        name="logbook"
        options={{
          title: t('tabs.notes'),
          tabBarLabel: ({ focused, color }) => (
            <TabLabel label={t('tabs.notes')} focused={focused} color={color} />
          ),
          tabBarIcon: ({ focused, color }) => <TabIcon name="document-text-outline" focused={focused} color={color} />,
        }}
      />

      {/* ── Prices ── */}
      <Tabs.Screen
        name="market"
        options={{
          title: t('tabs.prices'),
          tabBarLabel: ({ focused, color }) => (
            <TabLabel label={t('tabs.prices')} focused={focused} color={color} />
          ),
          tabBarIcon: ({ focused, color }) => <TabIcon name="stats-chart-outline" focused={focused} color={color} />,
        }}
      />

      {/* Hidden routes (still accessible, not shown in tab bar) */}
      <Tabs.Screen name="explore" options={{ href: null }} />
      <Tabs.Screen name="farms"   options={{ href: null }} />
    </Tabs>
  );
}

const s = StyleSheet.create({
  tabBar: {
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
    backgroundColor: theme.colors.surface + 'f2', // ~95% opaque
    borderTopColor: theme.colors.border + '80',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  bellDot: {
    position: 'absolute', top: 8, right: 9,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: theme.colors.danger,
    borderWidth: 1.5, borderColor: theme.colors.surface,
  },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.primary,
  },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  iconWrap: {
    width: 44, height: 28, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: theme.colors.primary + '1e',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
});
