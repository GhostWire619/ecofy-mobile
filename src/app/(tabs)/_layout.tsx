import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth/provider';
import { useEngagement } from '@/lib/hooks/use-engagement';
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
  const { data: engagement } = useEngagement();
  const hasAlerts = (engagement?.reward_eligibility?.length ?? 0) > 0;

  return (
    <View style={s.headerActions}>
      <Pressable
        style={s.bellBtn}
        hitSlop={6}
        accessibilityLabel="Notifications"
        onPress={() => router.push('/notifications')}
      >
        <Ionicons name="notifications-outline" size={22} color={theme.colors.text} />
        {hasAlerts ? <View style={s.bellDot} /> : null}
      </Pressable>
      <Pressable
        style={s.avatar}
        hitSlop={6}
        accessibilityLabel="Profile and settings"
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
  return <Text style={[s.tabLabel, focused && s.tabLabelActive, { color }]}>{label}</Text>;
}

export default function TabsLayout() {
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
          title: 'Today',
          tabBarLabel: ({ focused, color }) => (
            <TabLabel label="Today" focused={focused} color={color} />
          ),
          tabBarIcon: ({ focused, color }) => <TabIcon name="today-outline" focused={focused} color={color} />,
        }}
      />

      {/* ── Farms (dashboard) ── */}
      <Tabs.Screen
        name="home"
        options={{
          title: 'Farms',
          tabBarLabel: ({ focused, color }) => (
            <TabLabel label="Farms" focused={focused} color={color} />
          ),
          tabBarIcon: ({ focused, color }) => <TabIcon name="leaf-outline" focused={focused} color={color} />,
        }}
      />

      {/* ── Journey (gamified guide) ── */}
      <Tabs.Screen
        name="journey"
        options={{
          title: 'Journey',
          tabBarLabel: ({ focused, color }) => (
            <TabLabel label="Journey" focused={focused} color={color} />
          ),
          tabBarIcon: ({ focused, color }) => <TabIcon name="trophy-outline" focused={focused} color={color} />,
        }}
      />

      {/* ── Notes ── */}
      <Tabs.Screen
        name="logbook"
        options={{
          title: 'Notes',
          tabBarLabel: ({ focused, color }) => (
            <TabLabel label="Notes" focused={focused} color={color} />
          ),
          tabBarIcon: ({ focused, color }) => <TabIcon name="document-text-outline" focused={focused} color={color} />,
        }}
      />

      {/* ── Prices ── */}
      <Tabs.Screen
        name="market"
        options={{
          title: 'Prices',
          tabBarLabel: ({ focused, color }) => (
            <TabLabel label="Prices" focused={focused} color={color} />
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
