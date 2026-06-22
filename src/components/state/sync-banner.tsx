import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/core/button';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';
import { useSync } from '@/lib/sync/provider';

export function SyncBanner() {
  const { t } = useI18n();
  const { isOnline, isSyncing, queuedCount, conflictCount, flush } = useSync();

  const tone =
    conflictCount > 0 ? styles.danger : queuedCount > 0 ? styles.warning : styles.success;

  const message = !isOnline
    ? t('syncBanner.offlineActive')
    : conflictCount > 0
      ? t('syncBanner.conflictsNeedReview', { n: conflictCount })
      : queuedCount > 0
        ? t('syncBanner.changesWaiting', { n: queuedCount })
        : t('syncBanner.allSynced');

  return (
    <View style={[styles.banner, tone]}>
      <View style={styles.copy}>
        <Text style={styles.title}>{isOnline ? t('settings.syncStatus') : t('syncBanner.offlineFirst')}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      {isOnline && queuedCount > 0 ? (
        <Button
          label={isSyncing ? t('syncBanner.syncing') : t('syncBanner.syncNow')}
          variant="secondary"
          disabled={isSyncing}
          onPress={() => void flush()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderWidth: 1,
  },
  copy: {
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.colors.text,
  },
  message: {
    color: theme.colors.text,
    lineHeight: 20,
  },
  success: {
    backgroundColor: '#e5f4e8',
    borderColor: '#bfe0c5',
  },
  warning: {
    backgroundColor: '#fff3dc',
    borderColor: '#eed29a',
  },
  danger: {
    backgroundColor: '#fde7df',
    borderColor: '#efb8aa',
  },
});
