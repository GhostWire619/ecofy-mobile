import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Button } from '@/components/core/button';
import { Pill } from '@/components/core/pill';
import { Screen } from '@/components/layout/screen';
import { authApi } from '@/lib/api/mobile';
import { useAuth } from '@/lib/auth/provider';
import { legalUrls } from '@/lib/constants/env';
import { registerPushNotifications } from '@/lib/notifications/register';
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

// ─── Profile detail row ─────────────────────────────────────────────────────────

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.detailRow, last && s.detailRowLast]}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function SettingsScreen() {
  const queryClient = useQueryClient();
  const { locale, setLocale, t } = useI18n();
  const { logout, deleteAccount, user } = useAuth();
  const { queuedCount, conflictCount } = useSync();
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric');
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  function openLegal(url: string) {
    void WebBrowser.openBrowserAsync(url);
  }

  async function handleTestNotification() {
    try {
      // Register first — this requests the OS permission and stores the token.
      const reg = await registerPushNotifications(locale);
      if (reg.status !== 'ok') {
        const detail = reg.status === 'error' ? `\n\n${reg.error}` : '';
        Alert.alert(
          t('settings.sendTestNotification'),
          `${t('settings.testNotifNoDevice')}\n\n[${reg.status}]${detail}`,
        );
        return;
      }
      const res = await authApi.sendTestNotification();
      if (res.active_push_devices === 0) {
        Alert.alert(t('settings.sendTestNotification'), t('settings.testNotifNoDevice'));
      } else {
        Alert.alert(
          t('settings.sendTestNotification'),
          t('settings.testNotifSent', { n: res.push_result?.sent ?? res.active_push_devices }),
        );
      }
    } catch (e) {
      Alert.alert(
        t('settings.sendTestNotification'),
        `${t('settings.testNotifFailed')}\n\n${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      t('settings.deleteAccountConfirmTitle'),
      t('settings.deleteAccountConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAccountConfirmCta'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeleting(true);
              try {
                await deleteAccount();
              } catch {
                setDeleting(false);
                Alert.alert(t('settings.deleteAccountFailedTitle'), t('settings.deleteAccountFailedBody'));
              }
            })();
          },
        },
      ],
    );
  }

  const initials = (user?.full_name ?? user?.email ?? 'F')
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '';

  return (
    <Screen contentContainerStyle={s.content}>

      {/* ── Header ── */}
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>{t('settings.title')}</Text>
      </View>

      {/* ── Profile summary ── */}
      <View style={s.profileCard}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.profileName}>{user?.full_name ?? t('settings.farmer')}</Text>
          <Text style={s.profileEmail}>{user?.email ?? ''}</Text>
        </View>
      </View>

      {/* ── Profile details ── */}
      <View style={s.section}>
        <SectionLabel label={t('settings.profile')} />
        <View style={s.menuGroup}>
          <DetailRow label={t('auth.fullName')} value={user?.full_name || t('common.notProvided')} />
          <DetailRow label={t('auth.email')} value={user?.email || t('common.notProvided')} />
          <DetailRow label={t('auth.phoneNumber')} value={user?.phone_number || t('common.notProvided')} />
          <DetailRow label={t('farms.location')} value={user?.location || t('common.notProvided')} last />
        </View>
        {memberSince ? (
          <Text style={s.memberSince}>{t('settings.memberSince', { date: memberSince })}</Text>
        ) : null}
      </View>

      {/* ── Preferences ── */}
      <View style={s.section}>
        <SectionLabel label={t('settings.preferences')} />
        <View style={s.menuGroup}>
          <View style={s.menuHeader}>
            <Text style={s.menuGroupTitle}>{t('settings.language')}</Text>
            <View style={s.toggleRow}>
              {(['en', 'sw'] as const).map((code, i) => (
                <TouchableOpacity
                  key={code}
                  style={[s.toggleBtn, locale === code && s.toggleBtnActive, i === 0 && s.toggleBtnLeft, i === 1 && s.toggleBtnRight]}
                  onPress={() => void persistLocale(code)}
                >
                  <Text style={[s.toggleBtnText, locale === code && s.toggleBtnTextActive]}>
                    {code === 'en' ? t('settings.english') : t('settings.kiswahili')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[s.menuHeader, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border, paddingTop: 14 }]}>
            <Text style={s.menuGroupTitle}>{t('settings.units')}</Text>
            <View style={s.toggleRow}>
              {(['metric', 'imperial'] as const).map((u, i) => (
                <TouchableOpacity
                  key={u}
                  style={[s.toggleBtn, units === u && s.toggleBtnActive, i === 0 && s.toggleBtnLeft, i === 1 && s.toggleBtnRight]}
                  onPress={() => void persistUnits(u)}
                >
                  <Text style={[s.toggleBtnText, units === u && s.toggleBtnTextActive]}>
                    {u === 'metric' ? t('settings.metric') : t('settings.imperial')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* ── Offline state ── */}
      <View style={s.section}>
        <SectionLabel label={t('settings.syncStatus')} />
        <View style={s.offlineCard}>
          <View style={s.offlineRow}>
            <Pill label={t('settings.queued', { n: queuedCount })} tone={queuedCount > 0 ? 'warning' : 'success'} />
            <Pill label={t('settings.conflicts', { n: conflictCount })} tone={conflictCount > 0 ? 'danger' : 'neutral'} />
          </View>
          <Text style={s.offlineMeta}>{t('settings.syncMeta')}</Text>
        </View>
      </View>

      {/* ── More ── */}
      <View style={s.section}>
        <SectionLabel label={t('settings.more')} />
        <View style={s.menuGroup}>
          <MenuItem
            icon="sparkles-outline"
            label={t('settings.aiFieldDesk')}
            sublabel={t('settings.aiFieldDeskSub')}
            onPress={() => router.push('/assistant')}
          />
          <MenuItem
            icon="map-outline"
            label={t('settings.farmMap')}
            sublabel={t('settings.farmMapSub')}
            onPress={() => router.push('/(tabs)/journey')}
          />
        </View>
      </View>

      {/* ── App info ── */}
      <View style={s.section}>
        <SectionLabel label={t('settings.support')} />
        <View style={s.menuGroup}>
          <MenuItem icon="information-circle-outline" label={t('settings.aboutEcofy')} sublabel={t('settings.aboutEcofySub')} />
          <MenuItem
            icon="notifications-outline"
            label={t('settings.sendTestNotification')}
            sublabel={t('settings.sendTestNotificationSub')}
            onPress={() => void handleTestNotification()}
          />
        </View>
      </View>

      {/* ── Legal ── */}
      <View style={s.section}>
        <SectionLabel label={t('settings.legal')} />
        <View style={s.menuGroup}>
          <MenuItem
            icon="shield-checkmark-outline"
            label={t('settings.privacyPolicy')}
            onPress={() => openLegal(legalUrls.privacy)}
          />
          <MenuItem
            icon="document-text-outline"
            label={t('settings.termsOfService')}
            onPress={() => openLegal(legalUrls.terms)}
          />
        </View>
      </View>

      {/* ── Sign out ── */}
      <Button
        label={loggingOut ? t('settings.signingOut') : t('settings.signOut')}
        variant="danger"
        disabled={loggingOut || deleting}
        onPress={() => void handleLogout()}
      />

      {/* ── Account deletion (store-compliance) ── */}
      <View style={s.section}>
        <SectionLabel label={t('settings.accountSection')} />
        <View style={s.menuGroup}>
          <MenuItem
            icon="trash-outline"
            label={deleting ? t('settings.deleteAccountPending') : t('settings.deleteAccount')}
            sublabel={t('settings.deleteAccountSub')}
            onPress={deleting ? undefined : confirmDeleteAccount}
          />
        </View>
      </View>

      <Text style={s.version}>{t('settings.versionLine')}</Text>
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

  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { fontSize: 13, color: theme.colors.textMuted },
  detailValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: theme.colors.text },
  memberSince: { fontSize: 12, color: theme.colors.textMuted, paddingHorizontal: 4 },

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
