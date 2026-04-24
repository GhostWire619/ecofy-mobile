import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/core/button';
import { Card } from '@/components/core/card';
import { Pill } from '@/components/core/pill';
import { Screen, Section } from '@/components/layout/screen';
import { EmptyState } from '@/components/state/empty-state';
import { farmRepository, offlineMapRepository } from '@/lib/db/repositories';
import { theme } from '@/lib/theme';

export function FarmsScreen() {
  const { data } = useQuery({
    queryKey: ['farms-screen'],
    queryFn: async () => {
      const [farms, regions] = await Promise.all([
        farmRepository.listFarms(),
        offlineMapRepository.listRegions(),
      ]);

      return { farms, regions };
    },
  });

  return (
    <Screen>
      <Section>
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.title}>Farm context</Text>
            <Text style={styles.copy}>
              See all mapped farms, their agronomy context, and which regions are saved offline.
            </Text>
          </View>
          <Button label="New farm" variant="secondary" onPress={() => router.push('/farms/new')} />
        </View>
      </Section>

      {!data?.farms.length ? (
        <EmptyState
          title="No farms yet"
          description="Create a farm to unlock plot mapping, weather cache, offline regions, and journey tracking."
          actionLabel="Create farm"
          onAction={() => router.push('/farms/new')}
        />
      ) : null}

      {data?.farms.map((farm) => {
        const offlineRegion = data.regions.find((region) => region.farm_id === farm.id);

        return (
          <Card key={farm.id}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.cardTitle}>{farm.name}</Text>
                <Text style={styles.copy}>
                  {farm.region}, {farm.country}
                </Text>
              </View>
              <Pill
                label={offlineRegion?.status === 'downloaded' ? 'Offline ready' : 'Online only'}
                tone={offlineRegion?.status === 'downloaded' ? 'success' : 'neutral'}
              />
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaText}>{farm.size_hectares.toFixed(1)} ha</Text>
              <Text style={styles.metaText}>{farm.irrigation_type}</Text>
              <Text style={styles.metaText}>{farm.soil_type ?? 'Soil not set'}</Text>
            </View>
            <Button
              label="Open farm detail"
              variant="secondary"
              onPress={() => router.push(`/farms/${farm.id}`)}
            />
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  rowBetween: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  copy: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  metaText: {
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    fontSize: 12,
    fontWeight: '600',
  },
});
