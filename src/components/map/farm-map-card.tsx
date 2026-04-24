import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/core/button';
import { Card } from '@/components/core/card';
import type { FarmRecord, OfflineMapRegionRecord, PlotRecord } from '@/lib/domain/types';
import { theme } from '@/lib/theme';
import { env } from '@/lib/constants/env';

let mapboxModule: any = null;
if (Platform.OS !== 'web' && env.mapboxAccessToken) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mapboxModule = require('@rnmapbox/maps');
    mapboxModule?.setAccessToken?.(env.mapboxAccessToken);
  } catch {
    mapboxModule = null;
  }
}

export function FarmMapCard({
  farm,
  plot,
  mapRegion,
  onDownloadOffline,
  isDownloading = false,
  downloadError,
}: {
  farm: FarmRecord;
  plot?: PlotRecord | null;
  mapRegion?: OfflineMapRegionRecord | null;
  onDownloadOffline?: () => void;
  isDownloading?: boolean;
  downloadError?: string | null;
}) {
  if (!mapboxModule?.MapView) {
    return (
      <Card>
        <Text style={styles.title}>Offline field map</Text>
        <Text style={styles.copy}>
          {env.mapboxAccessToken
            ? 'Mapbox is configured for native builds. Run a development build to see the live farm map and offline downloads.'
            : 'Add EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to enable live field maps and downloadable offline regions.'}
        </Text>
      </Card>
    );
  }

  const MapView = mapboxModule.MapView;
  const Camera = mapboxModule.Camera;
  const ShapeSource = mapboxModule.ShapeSource;
  const FillLayer = mapboxModule.FillLayer;
  const LineLayer = mapboxModule.LineLayer;
  const PointAnnotation = mapboxModule.PointAnnotation;

  const polygon =
    plot?.field_boundary_json && plot.field_boundary_json !== 'null'
      ? JSON.parse(plot.field_boundary_json)
      : null;

  return (
    <Card>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title}>Offline field map</Text>
          <Text style={styles.copy}>
            {mapRegion?.status === 'downloaded'
              ? 'This farm region is available for field use without network.'
              : 'Download this farm region for route finding, plot review, and log placement when offline.'}
          </Text>
        </View>
        <Button
          label={
            isDownloading
              ? 'Downloading...'
              : mapRegion?.status === 'downloaded'
                ? 'Downloaded'
                : 'Save offline'
          }
          variant="secondary"
          accessibilityHint="Downloads this farm region to the device for offline field use."
          onPress={onDownloadOffline}
          disabled={isDownloading || mapRegion?.status === 'downloaded' || !onDownloadOffline}
        />
      </View>
      <View style={styles.mapContainer}>
        <MapView style={StyleSheet.absoluteFillObject} styleURL={env.mapboxStyleUrl}>
          <Camera centerCoordinate={[farm.longitude, farm.latitude]} zoomLevel={13} />
          <PointAnnotation id={`farm-${farm.id}`} coordinate={[farm.longitude, farm.latitude]} />
          {polygon ? (
            <ShapeSource id={`plot-${plot?.id}`} shape={polygon}>
              <FillLayer
                id={`plot-fill-${plot?.id}`}
                style={{ fillColor: '#FBBC04', fillOpacity: 0.22 }}
              />
              <LineLayer
                id={`plot-line-${plot?.id}`}
                style={{ lineColor: '#FFFFFF', lineWidth: 3 }}
              />
            </ShapeSource>
          ) : null}
        </MapView>
      </View>
      {downloadError ? <Text style={styles.error}>{downloadError}</Text> : null}
      {mapRegion ? (
        <Pressable style={styles.regionPill}>
          <Text style={styles.regionLabel}>
            {mapRegion.name} • {Math.round(mapRegion.progress)}% • {mapRegion.status}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  copy: {
    color: theme.colors.textMuted,
    lineHeight: 20,
  },
  mapContainer: {
    height: 220,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: '#2a3d2a',
  },
  regionPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#e6efe8',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
  },
  regionLabel: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  error: {
    color: theme.colors.danger,
    fontSize: 12,
  },
});
