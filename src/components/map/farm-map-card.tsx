import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRef, useState } from 'react';

import { Button } from '@/components/core/button';
import { env } from '@/lib/constants/env';
import type {
  FarmHealthSummary,
  FarmRecord,
  OfflineMapRegionRecord,
  PlotHealthSnapshot,
  PlotRecord,
  RemoteSensingOverlay,
  RemoteSensingSummary,
} from '@/lib/domain/types';
import { buildBoundaryGeometry, getPolygonBounds, parseBoundaryPoints } from '@/lib/maps/geometry';
import { resolveApiTileUrl } from '@/lib/maps/monitoring';
import { theme } from '@/lib/theme';

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

type OverlayState = 'idle' | 'loading' | 'ready' | 'boundary_required' | 'unavailable' | 'failed';

type FarmMapCardProps = {
  farm: FarmRecord;
  plot?: PlotRecord | null;
  mapRegion?: OfflineMapRegionRecord | null;
  healthSummary?: FarmHealthSummary | null;
  plotHealth?: PlotHealthSnapshot | null;
  remoteSummary?: RemoteSensingSummary | null;
  remoteOverlay?: RemoteSensingOverlay | null;
  overlayState?: OverlayState;
  overlayError?: string | null;
  isOverlayVisible?: boolean;
  isRefreshingOverlay?: boolean;
  onToggleOverlay?: () => void;
  onRefreshOverlay?: () => void;
  onDownloadOffline?: () => void;
  isDownloading?: boolean;
  downloadError?: string | null;
  height?: number;
  showHeader?: boolean;
  variant?: 'card' | 'fullscreen';
  weatherLabel?: string | null;
  userLocation?: { latitude: number; longitude: number } | null;
  isLocatingUser?: boolean;
  locationError?: string | null;
  onBackPress?: () => void;
  topInset?: number;
};

function riskTone(level?: string | null) {
  switch (level) {
    case 'LOW':
    case 'healthy':
      return { label: 'Healthy', color: theme.colors.success, bg: theme.colors.success + '18' };
    case 'MODERATE':
    case 'moderate':
      return { label: 'Watch', color: theme.colors.warning, bg: theme.colors.warning + '18' };
    case 'HIGH':
    case 'warning':
      return { label: 'At risk', color: '#d97706', bg: '#d9770618' };
    case 'CRITICAL':
    case 'critical':
      return { label: 'Critical', color: theme.colors.danger, bg: theme.colors.danger + '18' };
    default:
      return { label: 'Monitoring', color: theme.colors.textMuted, bg: theme.colors.surface };
  }
}

function formatOverlayValue(summary?: RemoteSensingSummary | null) {
  const value = summary?.value ?? summary?.mean_value;
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return value.toFixed(2);
}

function formatOfflineStatus(mapRegion?: OfflineMapRegionRecord | null) {
  if (!mapRegion) {
    return 'Online only';
  }

  if (mapRegion.status === 'downloaded') {
    return 'Offline ready';
  }

  if (mapRegion.status === 'downloading') {
    return `Downloading ${Math.round(mapRegion.progress)}%`;
  }

  if (mapRegion.status === 'failed') {
    return 'Offline failed';
  }

  return 'Save offline';
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function interpolatePalette(palette: string[], steps = 32): string[] {
  if (palette.length < 2) return palette;
  const result: string[] = [];
  const segments = palette.length - 1;
  const stepsPerSegment = Math.ceil(steps / segments);
  for (let s = 0; s < segments; s++) {
    const from = hexToRgb(palette[s]);
    const to = hexToRgb(palette[s + 1]);
    const count = s === segments - 1 ? stepsPerSegment : stepsPerSegment;
    for (let i = 0; i < count; i++) {
      const t = i / stepsPerSegment;
      const r = Math.round(from.r + (to.r - from.r) * t);
      const g = Math.round(from.g + (to.g - from.g) * t);
      const b = Math.round(from.b + (to.b - from.b) * t);
      result.push(`rgb(${r},${g},${b})`);
    }
  }
  result.push(palette[palette.length - 1]);
  return result;
}

function formatImageDate(date?: string | null) {
  if (!date) return null;
  try {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return date;
  }
}

function OverlayLegend({ overlay }: { overlay?: RemoteSensingOverlay | null }) {
  const basePalette = overlay?.legend?.palette?.length
    ? overlay.legend.palette
    : ['#ef798a', '#ffb347', '#ffd166', '#a6d97a', '#63c98d'];

  const stops = interpolatePalette(basePalette);
  const imageDate = formatImageDate(overlay?.image_date);

  return (
    <View style={styles.legendWrap}>
      <View style={styles.legendHeaderRow}>
        <Text style={styles.legendHeaderTitle}>NDVI</Text>
        <Text style={styles.legendHeaderMeta}>Field health</Text>
      </View>
      <View style={styles.legendBar}>
        {stops.map((color, index) => (
          <View key={index} style={[styles.legendStop, { backgroundColor: color }]} />
        ))}
      </View>
      <View style={styles.legendLabels}>
        <Text style={styles.legendText}>Low vegetation</Text>
        <Text style={styles.legendText}>High vegetation</Text>
      </View>
      {imageDate ? (
        <View style={styles.legendDateRow}>
          <Ionicons name="calendar-outline" size={10} color={theme.colors.textMuted} />
          <Text style={styles.legendDateText}>{imageDate}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function FarmMapCard({
  farm,
  plot,
  mapRegion,
  healthSummary,
  plotHealth,
  remoteSummary,
  remoteOverlay,
  overlayState = 'idle',
  overlayError,
  isOverlayVisible = true,
  isRefreshingOverlay = false,
  onToggleOverlay,
  onRefreshOverlay,
  onDownloadOffline,
  isDownloading = false,
  downloadError,
  height = 360,
  showHeader = true,
  variant = 'card',
  weatherLabel,
  userLocation,
  isLocatingUser = false,
  locationError,
  onBackPress,
  topInset = 0,
}: FarmMapCardProps) {
  const boundaryPoints = parseBoundaryPoints(plot?.field_boundary_json);
  const boundaryGeometry = buildBoundaryGeometry(boundaryPoints);
  const boundaryBounds = getPolygonBounds(boundaryPoints);
  const fallbackLongitude = plot?.center_longitude ?? farm.longitude;
  const fallbackLatitude = plot?.center_latitude ?? farm.latitude;
  const overlayUrl = resolveApiTileUrl(remoteOverlay?.tile_url);
  const showOverlay = Boolean(overlayUrl && isOverlayVisible);
  const riskMeta = riskTone(plotHealth?.risk_level ?? healthSummary?.overall_risk_level);
  const ndviValue = formatOverlayValue(remoteSummary);
  const offlineLabel = formatOfflineStatus(mapRegion);
  const cameraRef = useRef<any>(null);
  const [zoomLevel, setZoomLevel] = useState(boundaryBounds ? 17 : 13);
  const isFullscreen = variant === 'fullscreen';
  const canRequestOverlay = boundaryPoints.length >= 3;
  const isOverlayToggleDisabled = overlayState === 'boundary_required' || (!canRequestOverlay && !showOverlay);

  const setMapZoom = (delta: number) => {
    const nextZoom = Math.max(4, Math.min(20, zoomLevel + delta));
    setZoomLevel(nextZoom);
    cameraRef.current?.setCamera?.({
      centerCoordinate: boundaryBounds
        ? [boundaryBounds.center.longitude, boundaryBounds.center.latitude]
        : [fallbackLongitude, fallbackLatitude],
      zoomLevel: nextZoom,
      animationDuration: 250,
    });
  };

  const recenterMap = () => {
    cameraRef.current?.setCamera?.({
      bounds: boundaryBounds
        ? {
            ne: boundaryBounds.ne,
            sw: boundaryBounds.sw,
            paddingLeft: 40,
            paddingRight: 40,
            paddingTop: isFullscreen ? 180 : 72,
            paddingBottom: isFullscreen ? 160 : 88,
            animationDuration: 500,
          }
        : undefined,
      centerCoordinate: !boundaryBounds ? [fallbackLongitude, fallbackLatitude] : undefined,
      zoomLevel: !boundaryBounds ? 17 : undefined,
      animationDuration: 500,
    });
  };

  const centerOnUser = () => {
    if (!userLocation) {
      recenterMap();
      return;
    }

    cameraRef.current?.setCamera?.({
      centerCoordinate: [userLocation.longitude, userLocation.latitude],
      zoomLevel: Math.max(zoomLevel, 16),
      animationDuration: 500,
    });
  };

  if (!mapboxModule?.MapView) {
    return (
      <View style={[styles.card, isFullscreen ? styles.fullscreenCard : null, { minHeight: height }]}>
        {showHeader ? (
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Monitoring map</Text>
              <Text style={styles.copy}>
                {env.mapboxAccessToken
                  ? 'Mapbox is available in native dev builds. Open the app in a dev client to review the live field boundary and NDVI overlay.'
                  : 'Add EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN to enable the live monitoring map and raster overlays.'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.fallbackSurface, isFullscreen ? styles.fullscreenFallback : null]}>
          <View style={styles.chipRow}>
            <View style={[styles.infoChip, { backgroundColor: riskMeta.bg }]}>
              <Text style={[styles.infoChipText, { color: riskMeta.color }]}>
                {riskMeta.label}
              </Text>
            </View>
            <View style={styles.infoChip}>
              <Text style={styles.infoChipText}>{ndviValue ? `NDVI ${ndviValue}` : 'NDVI pending'}</Text>
            </View>
            <View style={styles.infoChip}>
              <Text style={styles.infoChipText}>{offlineLabel}</Text>
            </View>
          </View>

          <Text style={styles.fallbackLabel}>
            {boundaryPoints.length >= 3
              ? 'Boundary ready. The live map will fit to the selected plot once the native map client is running.'
              : 'Add a farm boundary to unlock the NDVI overlay and fit-to-boundary monitoring view.'}
          </Text>

          {overlayError ? <Text style={styles.errorText}>{overlayError}</Text> : null}
          {locationError ? <Text style={styles.errorText}>{locationError}</Text> : null}
          {downloadError ? <Text style={styles.errorText}>{downloadError}</Text> : null}
        </View>

        {onDownloadOffline ? (
          <View style={styles.footerRow}>
            <Pressable style={styles.offlinePill}>
              <Text style={styles.offlinePillText}>{offlineLabel}</Text>
            </Pressable>
            <Button
              label={
                isDownloading
                  ? 'Downloading...'
                  : mapRegion?.status === 'downloaded'
                    ? 'Downloaded'
                    : 'Save offline'
              }
              variant="secondary"
              onPress={onDownloadOffline}
              disabled={isDownloading || mapRegion?.status === 'downloaded'}
            />
          </View>
        ) : null}
      </View>
    );
  }

  const MapView = mapboxModule.MapView;
  const Camera = mapboxModule.Camera;
  const ShapeSource = mapboxModule.ShapeSource;
  const FillLayer = mapboxModule.FillLayer;
  const LineLayer = mapboxModule.LineLayer;
  const PointAnnotation = mapboxModule.PointAnnotation;
  const RasterSource = mapboxModule.RasterSource;
  const RasterLayer = mapboxModule.RasterLayer;

  return (
    <View style={[styles.card, isFullscreen ? styles.fullscreenCard : null]}>
      {showHeader ? (
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Monitoring map</Text>
            <Text style={styles.copy}>
              Fit to the active farm boundary, review NDVI, and keep offline access ready for field work.
            </Text>
          </View>

          <View style={styles.controlRow}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={isOverlayVisible ? 'Hide NDVI overlay' : 'Show NDVI overlay'}
              disabled={isOverlayToggleDisabled || isRefreshingOverlay}
              onPress={onToggleOverlay}
              style={[
                styles.iconButton,
                (isOverlayToggleDisabled || isRefreshingOverlay) && styles.iconButtonDisabled,
              ]}
              activeOpacity={0.8}
            >
              {isRefreshingOverlay ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons
                  name={isOverlayVisible ? 'eye-outline' : 'eye-off-outline'}
                  size={16}
                  color={theme.colors.text}
                />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Refresh NDVI overlay"
              disabled={isRefreshingOverlay}
              onPress={onRefreshOverlay}
              style={[styles.iconButton, isRefreshingOverlay && styles.iconButtonDisabled]}
              activeOpacity={0.8}
            >
              {isRefreshingOverlay ? (
                <ActivityIndicator size="small" color={theme.colors.textMuted} />
              ) : (
                <Ionicons name="refresh-outline" size={16} color={theme.colors.text} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={[styles.mapFrame, isFullscreen ? styles.fullscreenMapFrame : null, { height }]}>
        <MapView
          style={StyleSheet.absoluteFillObject}
          styleURL={isFullscreen ? 'mapbox://styles/mapbox/satellite-streets-v12' : env.mapboxStyleUrl}
          compassEnabled={false}
          scaleBarEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
        >
          <Camera
            ref={cameraRef}
            bounds={
              boundaryBounds
                ? {
                    ne: boundaryBounds.ne,
                    sw: boundaryBounds.sw,
                    paddingLeft: 40,
                    paddingRight: 40,
                    paddingTop: isFullscreen ? 180 : 72,
                    paddingBottom: isFullscreen ? 160 : 88,
                    animationDuration: 0,
            }
                : undefined
            }
            centerCoordinate={!boundaryBounds ? [fallbackLongitude, fallbackLatitude] : undefined}
            zoomLevel={!boundaryBounds ? zoomLevel : undefined}
          />

          {showOverlay && RasterSource && RasterLayer ? (
            <RasterSource id={`ndvi-source-${farm.id}`} tileSize={256} tileUrlTemplates={[overlayUrl]}>
              <RasterLayer
                id={`ndvi-layer-${farm.id}`}
                style={{ rasterOpacity: remoteOverlay?.opacity ?? 0.74 }}
              />
            </RasterSource>
          ) : null}

          {boundaryGeometry ? (
            <ShapeSource id={`plot-${plot?.id ?? farm.id}`} shape={boundaryGeometry}>
              <FillLayer
                id={`plot-fill-${plot?.id ?? farm.id}`}
                style={{
                  fillColor: '#f4d35e',
                  fillOpacity: showOverlay ? 0.06 : 0.18,
                }}
              />
              <LineLayer
                id={`plot-line-${plot?.id ?? farm.id}`}
                style={{
                  lineColor: '#ffffff',
                  lineWidth: showOverlay ? 3.4 : 2.8,
                }}
              />
            </ShapeSource>
          ) : (
            <PointAnnotation
              id={`farm-${farm.id}`}
              coordinate={[fallbackLongitude, fallbackLatitude]}
            />
          )}

          {userLocation ? (
            <PointAnnotation
              id={`user-location-${farm.id}`}
              coordinate={[userLocation.longitude, userLocation.latitude]}
            >
              <View style={styles.userLocationWrap}>
                <View style={styles.userLocationPulse} />
                <View style={styles.userLocationDot} />
              </View>
            </PointAnnotation>
          ) : null}
        </MapView>

        {isFullscreen ? (
          <>
            <View style={[styles.fullscreenTopBar, { top: topInset + 10 }]}>
              {onBackPress ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={onBackPress}
                  style={styles.mapBackButton}
                  activeOpacity={0.8}
                  testID="farm-map-back"
                >
                  <Ionicons name="arrow-back" size={18} color={theme.colors.text} />
                </TouchableOpacity>
              ) : null}
              <View style={styles.mapFarmLabel}>
                <View style={[styles.riskDotMini, { backgroundColor: riskMeta.color }]} />
                <Text style={styles.mapFarmLabelText} numberOfLines={1}>{farm.name}</Text>
                <Text style={styles.mapFarmLabelMeta}>
                  {(plot?.size_hectares ?? farm.size_hectares ?? 0).toFixed(1)} ha
                </Text>
              </View>
            </View>

            <View style={[styles.zoomRail, { top: topInset + 68 }]}>
              <TouchableOpacity style={styles.railButton} onPress={() => setMapZoom(1)}>
                <Ionicons name="add" size={18} color={theme.colors.text} />
              </TouchableOpacity>
              <View style={styles.railDivider} />
              <TouchableOpacity style={styles.railButton} onPress={() => setMapZoom(-1)}>
                <Ionicons name="remove" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.sideActionStack}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={isOverlayVisible ? 'Hide NDVI overlay' : 'Show NDVI overlay'}
                disabled={isOverlayToggleDisabled || isRefreshingOverlay}
                onPress={onToggleOverlay}
                activeOpacity={0.8}
                style={[
                  styles.floatingRoundButton,
                  (isOverlayToggleDisabled || isRefreshingOverlay) && styles.iconButtonDisabled,
                  isOverlayVisible && !isRefreshingOverlay && styles.floatingRoundButtonActive,
                ]}
              >
                {isRefreshingOverlay ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Ionicons name="layers-outline" size={18} color={isOverlayVisible ? theme.colors.primary : theme.colors.text} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Refresh NDVI overlay"
                disabled={isRefreshingOverlay}
                onPress={onRefreshOverlay}
                activeOpacity={0.8}
                style={[styles.floatingRoundButton, isRefreshingOverlay && styles.iconButtonDisabled]}
              >
                {isRefreshingOverlay ? (
                  <ActivityIndicator size="small" color={theme.colors.textMuted} />
                ) : (
                  <Ionicons name="refresh-outline" size={18} color={theme.colors.text} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={userLocation ? 'Center map on your location' : 'Center map on farm'}
                onPress={centerOnUser}
                activeOpacity={0.8}
                style={styles.floatingRoundButton}
              >
                <Ionicons name="locate-outline" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {isOverlayVisible ? (
              <View style={styles.fullscreenLegendWrap}>
                <View style={styles.legendCard}>
                  <OverlayLegend overlay={remoteOverlay} />
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.mapTopRow}>
            <View style={[styles.mapChip, { backgroundColor: riskMeta.bg }]}>
              <Text style={[styles.mapChipText, { color: riskMeta.color }]}>
                {riskMeta.label}
              </Text>
            </View>
            <View style={styles.mapChip}>
              <Text style={styles.mapChipText}>
                {ndviValue ? `NDVI ${ndviValue}` : 'NDVI pending'}
              </Text>
            </View>
            {remoteSummary?.status ? (
              <View style={styles.mapChip}>
                <Text style={styles.mapChipText}>
                  {String(remoteSummary.status).replace('_', ' ')}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        <View style={[styles.mapBottomOverlay, isFullscreen ? styles.fullscreenBottomOverlay : null]}>
          {overlayState === 'boundary_required' ? (
            <View style={styles.overlayBanner}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.colors.warning} />
              <Text style={styles.overlayBannerText}>
                Map this farm boundary to view NDVI overlays.
              </Text>
            </View>
          ) : null}

          {overlayState === 'unavailable' && overlayError ? (
            <View style={styles.overlayBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color={theme.colors.textMuted} />
              <Text style={styles.overlayBannerText}>{overlayError}</Text>
            </View>
          ) : null}

          {overlayState === 'failed' && overlayError ? (
            <View style={styles.overlayBanner}>
              <Ionicons name="warning-outline" size={14} color={theme.colors.danger} />
              <Text style={styles.overlayBannerText}>{overlayError}</Text>
            </View>
          ) : null}

          {locationError ? (
            <View style={styles.overlayBanner}>
              <Ionicons name="location-outline" size={14} color={theme.colors.warning} />
              <Text style={styles.overlayBannerText}>{locationError}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {!isFullscreen && isOverlayVisible ? <OverlayLegend overlay={remoteOverlay} /> : null}

      {!isFullscreen ? (
        <View style={styles.footerRow}>
          <Pressable style={styles.offlinePill}>
            <Text style={styles.offlinePillText}>{offlineLabel}</Text>
          </Pressable>
          {onDownloadOffline ? (
            <Button
              label={
                isDownloading
                  ? 'Downloading...'
                  : mapRegion?.status === 'downloaded'
                    ? 'Downloaded'
                    : 'Save offline'
              }
              variant="secondary"
              onPress={onDownloadOffline}
              disabled={isDownloading || mapRegion?.status === 'downloaded'}
            />
          ) : null}
        </View>
      ) : null}

      {downloadError ? <Text style={styles.errorText}>{downloadError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: theme.spacing.md,
  },
  fullscreenCard: {
    flex: 1,
    gap: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  copy: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.textMuted,
  },
  controlRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inlineControlsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 2,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  iconButtonDisabled: {
    opacity: 0.45,
  },
  mapFrame: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#20372a',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fullscreenMapFrame: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
  },
  mapTopRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mapChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  mapChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.text,
  },
  mapBottomOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    gap: 8,
  },
  fullscreenBottomOverlay: {
    left: 16,
    right: 88,
    bottom: 102,
  },
  overlayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  overlayBannerText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.text,
    lineHeight: 17,
  },
  legendWrap: {
    gap: 6,
  },
  legendHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: 0.6,
  },
  legendHeaderMeta: {
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  legendBar: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  legendStop: {
    flex: 1,
    height: 10,
  },
  legendLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendText: {
    fontSize: 9,
    color: theme.colors.textMuted,
    letterSpacing: 0.2,
  },
  legendDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  legendDateText: {
    fontSize: 10,
    color: theme.colors.textMuted,
    letterSpacing: 0.2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  offlinePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  offlinePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.danger,
  },
  fallbackSurface: {
    flex: 1,
    minHeight: 220,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  fullscreenFallback: {
    minHeight: 320,
    borderRadius: 0,
    borderWidth: 0,
  },
  fullscreenTopBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mapBackButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapFarmLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  mapFarmLabelText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
  },
  mapFarmLabelMeta: {
    fontSize: 12,
    color: theme.colors.textMuted,
    flexShrink: 0,
  },
  riskDotMini: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  zoomRail: {
    position: 'absolute',
    right: 16,
    zIndex: 3,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    overflow: 'hidden',
  },
  railButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railDivider: {
    height: 1,
    backgroundColor: '#e6dfd2',
  },
  sideActionStack: {
    position: 'absolute',
    right: 16,
    bottom: 112,
    zIndex: 3,
    gap: 12,
  },
  floatingRoundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingRoundButtonActive: {
    backgroundColor: 'rgba(255,255,255,1)',
    borderWidth: 1.5,
    borderColor: theme.colors.primary + '40',
  },
  fullscreenLegendWrap: {
    position: 'absolute',
    left: 16,
    bottom: 102,
    zIndex: 3,
  },
  legendCard: {
    width: 176,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  userLocationWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userLocationPulse: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
  },
  userLocationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  infoChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.text,
  },
  fallbackLabel: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textMuted,
  },
});
