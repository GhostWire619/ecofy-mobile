import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Button } from '@/components/core/button';
import { Pill } from '@/components/core/pill';
import { Screen } from '@/components/layout/screen';
import { useAuth } from '@/lib/auth/provider';
import { sessionRepository, syncRepository } from '@/lib/db/repositories';
import { useI18n } from '@/lib/i18n';
import { useSync } from '@/lib/sync/provider';
import { theme } from '@/lib/theme';

// ─── Menu item ────────────────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  sublabel,
  onPress,
  badge,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sublabel?: string;
  onPress?: () => void;
  badge?: string;
}) {
  return (
    <TouchableOpacity style={s.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={s.menuIcon}>
        <Ionicons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={s.menuLabel}>{label}</Text>
        {sublabel ? <Text style={s.menuSublabel}>{sublabel}</Text> : null}
      </View>
      <View style={s.menuRight}>
        {badge ? <View style={s.menuBadge}><Text style={s.menuBadgeText}>{badge}</Text></View> : null}
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={s.sectionLabel}>{label.toUpperCase()}</Text>;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function SettingsScreen() {
  const queryClient = useQueryClient();
  const { locale, setLocale } = useI18n();
  const { logout, user } = useAuth();
  const { queuedCount, conflictCount } = useSync();
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [loggingOut, setLoggingOut] = useState(false);

  useQuery({
    queryKey: ['settings-session'],
    queryFn: async () => {
      const session = await sessionRepository.getSession();
      if (session?.units) setUnits(session.units as 'metric' | 'imperial');
      return session;
    },
  });

  async function persistUnits(next: 'metric' | 'imperial') {
    const session = await sessionRepository.getSession();
    if (session) {
      await sessionRepository.upsertSession({ ...session, units: next, updated_at: new Date().toISOString() });
    }
    await syncRepository.enqueueJob('profile', user?.id ?? 'local', 'update', {
      units: next,
      preferred_language: locale,
    });
    setUnits(next);
    await queryClient.invalidateQueries({ queryKey: ['settings-session'] });
  }

  async function persistLocale(next: 'en' | 'sw') {
    await setLocale(next);
    await syncRepository.enqueueJob('profile', user?.id ?? 'local', 'update', {
      locale: next,
      preferred_language: next,
      units,
    });
    await queryClient.invalidateQueries({ queryKey: ['settings-session'] });
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  const initials = (user?.full_name ?? user?.email ?? 'F')
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <Screen edges={['bottom']} contentContainerStyle={s.content}>

      {/* ── Header ── */}
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Settings</Text>
      </View>

      {/* ── Profile card ── */}
      <TouchableOpacity style={s.profileCard} activeOpacity={0.88}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.profileName}>{user?.full_name ?? 'Farmer'}</Text>
          <Text style={s.profileEmail}>{user?.email ?? ''}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.primary + '80'} />
      </TouchableOpacity>

      {/* ── Preferences ── */}
      <View style={s.section}>
        <SectionLabel label="Preferences" />
        <View style={s.menuGroup}>
          <View style={s.menuHeader}>
            <Text style={s.menuGroupTitle}>Language</Text>
            <View style={s.toggleRow}>
              {(['en', 'sw'] as const).map((code, i) => (
                <TouchableOpacity
                  key={code}
                  style={[s.toggleBtn, locale === code && s.toggleBtnActive, i === 0 && s.toggleBtnLeft, i === 1 && s.toggleBtnRight]}
                  onPress={() => void persistLocale(code)}
                >
                  <Text style={[s.toggleBtnText, locale === code && s.toggleBtnTextActive]}>
                    {code === 'en' ? 'English' : 'Kiswahili'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[s.menuHeader, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, paddingTop: 14 }]}>
            <Text style={s.menuGroupTitle}>Units</Text>
            <View style={s.toggleRow}>
              {(['metric', 'imperial'] as const).map((u, i) => (
                <TouchableOpacity
                  key={u}
                  style={[s.toggleBtn, units === u && s.toggleBtnActive, i === 0 && s.toggleBtnLeft, i === 1 && s.toggleBtnRight]}
                  onPress={() => void persistUnits(u)}
                >
                  <Text style={[s.toggleBtnText, units === u && s.toggleBtnTextActive]}>
                    {u.charAt(0).toUpperCase() + u.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* ── Offline state ── */}
      <View style={s.section}>
        <SectionLabel label="Sync status" />
        <View style={s.offlineCard}>
          <View style={s.offlineRow}>
            <Pill label={`${queuedCount} queued`} tone={queuedCount > 0 ? 'warning' : 'success'} />
            <Pill label={`${conflictCount} conflicts`} tone={conflictCount > 0 ? 'danger' : 'neutral'} />
          </View>
          <Text style={s.offlineMeta}>
            Field logs, farm edits, and task completions can be captured offline and synced later.
          </Text>
        </View>
      </View>

      {/* ── More ── */}
      <View style={s.section}>
        <SectionLabel label="More" />
        <View style={s.menuGroup}>
          <MenuItem
            icon="sparkles-outline"
            label="AI field desk"
            sublabel="Ask for crop advice, spray windows, and more"
            onPress={() => router.push('/assistant')}
          />
          <MenuItem
            icon="map-outline"
            label="Farm map"
            sublabel="View and manage your mapped farms"
            onPress={() => router.push('/(tabs)/journey')}
          />
        </View>
      </View>

      {/* ── App info ── */}
      <View style={s.section}>
        <SectionLabel label="Support" />
        <View style={s.menuGroup}>
          <MenuItem icon="information-circle-outline" label="About Ecofy" sublabel="Offline-first farm intelligence" />
        </View>
      </View>

      {/* ── Sign out ── */}
      <Button
        label={loggingOut ? 'Signing out…' : 'Sign out'}
        variant="danger"
        disabled={loggingOut}
        onPress={() => void handleLogout()}
      />

      <Text style={s.version}>Ecofy Mobile · offline-first build</Text>
    </Screen>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  content: { gap: theme.spacing.lg, padding: theme.spacing.lg },

  pageHeader: { gap: 2 },
  pageTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
    backgroundColor: theme.colors.primary + '0d',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  profileName: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  profileEmail: { fontSize: 13, color: theme.colors.textMuted },

  section: { gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: theme.colors.textMuted },

  menuGroup: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuGroupTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  menuSublabel: { fontSize: 12, color: theme.colors.textMuted },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuBadge: {
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  menuBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  toggleRow: { flexDirection: 'row', borderRadius: theme.radius.pill, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: 'transparent' },
  toggleBtnLeft: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.colors.border },
  toggleBtnRight: {},
  toggleBtnActive: { backgroundColor: theme.colors.primary },
  toggleBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  toggleBtnTextActive: { color: '#fff' },

  offlineCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  offlineRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  offlineMeta: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },

  version: { textAlign: 'center', fontSize: 12, color: theme.colors.textMuted },
});
