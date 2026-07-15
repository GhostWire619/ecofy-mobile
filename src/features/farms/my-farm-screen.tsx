import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { FarmWorkspaceScreen } from '@/features/farms/workspace-screen';
import { mobileApi } from '@/lib/api/mobile';
import { farmRepository } from '@/lib/db/repositories';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

export function MyFarmScreen() {
  const { t } = useI18n();
  const farmQuery = useQuery({
    queryKey: ['my-farm'],
    queryFn: async () => {
      const farms = await mobileApi.listFarms().catch(() => farmRepository.listFarms());
      const activeFarmId = await farmRepository.getSelectedFarmId();
      return (
        farms.find((farm) => String(farm.id) === String(activeFarmId)) ??
        farms[0] ??
        null
      );
    },
  });

  if (farmQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.body}>{t('emptyState.loadingFarm')}</Text>
      </View>
    );
  }

  if (farmQuery.data) {
    return <FarmWorkspaceScreen farmId={String(farmQuery.data.id)} embedded />;
  }

  return (
    <Screen contentContainerStyle={styles.emptyContent}>
      <View style={styles.emptyIcon}><Text style={styles.emptyEmoji}>🌱</Text></View>
      <Text style={styles.title}>{t('emptyState.noFarmRegistered')}</Text>
      <Text style={styles.body}>{t('emptyState.emptyDesc')}</Text>
      {farmQuery.error ? <Text style={styles.error}>{farmQuery.error.message}</Text> : null}
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.push('/farms/new')}>
        <Text style={styles.buttonText}>{t('emptyState.addFarmPlot')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: theme.colors.background },
  emptyContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 28 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary + '16' },
  emptyEmoji: { fontSize: 36 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  error: { color: theme.colors.danger, fontSize: 12, textAlign: 'center' },
  button: { minHeight: 48, borderRadius: 14, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
