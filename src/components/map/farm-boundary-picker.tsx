import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { env } from '@/lib/constants/env';
import { theme } from '@/lib/theme';
import {
  buildBoundaryJson,
  buildBoundaryOverlay,
  calculatePolygonAreaHectares,
  getPolygonCentroid,
  parseBoundaryPoints,
  type BoundaryPoint,
} from '@/lib/maps/geometry';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MappingMode = 'polygon' | 'walk' | 'coordinates' | 'point';

export type FarmBoundarySelection = {
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  district: string;
  formattedAddress: string;
  mappingMode: MappingMode;
  mappedAreaHectares: number | null;
  fieldBoundaryJson: string | null;
};

export type CoordRow = { lat: string; lng: string };
type SearchResult = { place_name: string; center: [number, number] };

// ─── Mapbox lazy load ─────────────────────────────────────────────────────────

let Mapbox: any = null;
if (Platform.OS !== 'web' && env.mapboxAccessToken) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Mapbox = require('@rnmapbox/maps');
    Mapbox?.setAccessToken?.(env.mapboxAccessToken);
  } catch {
    Mapbox = null;
  }
}

// ─── Geocoding ────────────────────────────────────────────────────────────────

async function forwardGeocode(query: string): Promise<SearchResult[]> {
  if (!env.mapboxAccessToken) return [];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${env.mapboxAccessToken}&autocomplete=true&limit=5`;
  const res = await fetch(url);
  return ((await res.json()).features ?? []) as SearchResult[];
}

async function reverseGeocode(lng: number, lat: number): Promise<Partial<FarmBoundarySelection>> {
  if (!env.mapboxAccessToken) return {};
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${env.mapboxAccessToken}&limit=1`;
  const res = await fetch(url);
  const feature = ((await res.json()).features ?? [])[0];
  if (!feature) return {};
  const ctx: { id: string; text: string }[] = feature.context ?? [];
  const get = (p: string) => ctx.find((c) => c.id.startsWith(p))?.text ?? '';
  return {
    formattedAddress: feature.place_name ?? '',
    country: get('country'),
    region: get('region') || get('place'),
    district: get('locality') || get('district') || get('place'),
  };
}

// ─── GeoJSON helpers ──────────────────────────────────────────────────────────

function buildPointsGeoJson(points: BoundaryPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((pt, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: pt },
      properties: { label: String(i + 1) },
    })),
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type FarmBoundaryPickerHandle = {
  coordRows: CoordRow[];
  setCoordRows: (rows: CoordRow[]) => void;
  coordError: string | null;
  applyCoordinates: () => void;
};

type Props = {
  value: FarmBoundarySelection | null;
  onChange: (s: FarmBoundarySelection) => void;
  mode: MappingMode;
  onModeChange: (m: MappingMode) => void;
  /** receives coord-panel state so parent can render it in bottom sheet */
  onHandle?: (h: FarmBoundaryPickerHandle) => void;
  /** bottom offset so floating controls don't overlap the bottom sheet */
  bottomInset?: number;
};

// ─── Floating map button ──────────────────────────────────────────────────────

function MapBtn({ label, active, onPress, disabled }: { label: string; active?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}
      style={[ms.btn, active && ms.btnActive, disabled && ms.btnDisabled]}>
      <Text style={[ms.btnText, active && ms.btnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FarmBoundaryPicker({ value, onChange, mode, onModeChange, onHandle, bottomInset = 88 }: Props) {
  const [points, setPoints] = useState<BoundaryPoint[]>(
    () => parseBoundaryPoints(value?.fieldBoundaryJson ?? null),
  );
  const [centerPin, setCenterPin] = useState<BoundaryPoint | null>(
    value ? [value.longitude, value.latitude] : null,
  );

  // Camera
  const cameraRef = useRef<any>(null);
  const [zoomLevel, setZoomLevel] = useState(14);
  const [cameraCenter, setCameraCenter] = useState<BoundaryPoint>(
    value ? [value.longitude, value.latitude] : [36.8219, -1.2921],
  );

  // Search
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Walk
  const [isWalking, setIsWalking] = useState(false);
  const walkSubRef = useRef<Location.LocationSubscription | null>(null);

  // Coordinates (state lifted to parent via onHandle)
  const [coordRows, setCoordRows] = useState<CoordRow[]>([
    { lat: '', lng: '' }, { lat: '', lng: '' }, { lat: '', lng: '' },
  ]);
  const [coordError, setCoordError] = useState<string | null>(null);

  // Geocoding
  const [isResolving, setIsResolving] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const geoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived
  const overlayShape = useMemo(() => buildBoundaryOverlay(points), [points]);
  const pointsGeoJson = useMemo(() => buildPointsGeoJson(points), [points]);
  const mappedArea = useMemo(
    () => (points.length >= 3 ? Number(calculatePolygonAreaHectares(points).toFixed(2)) : null),
    [points],
  );

  // Expose coord state to parent
  useEffect(() => {
    return () => {
      walkSubRef.current?.remove();
      if (geoTimer.current) clearTimeout(geoTimer.current);
    };
  }, []);

  // Auto-detect user location on mount
  useEffect(() => {
    async function init() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const pt: BoundaryPoint = [pos.coords.longitude, pos.coords.latitude];
        setCameraCenter(pt);
        cameraRef.current?.setCamera({ centerCoordinate: pt, zoomLevel: 15, animationDuration: 800 });
      } catch { /* silent — keep default center */ }
    }
    void init();
  }, []);

  // ── Geocode ──
  const scheduleGeocode = useCallback((lng: number, lat: number, nextPts: BoundaryPoint[], nextMode: MappingMode) => {
    if (geoTimer.current) clearTimeout(geoTimer.current);
    geoTimer.current = setTimeout(async () => {
      setIsResolving(true);
      try {
        const geo = await reverseGeocode(lng, lat);
        const area = nextMode === 'polygon' && nextPts.length >= 3
          ? Number(calculatePolygonAreaHectares(nextPts).toFixed(2)) : null;
        onChange({
          latitude: lat, longitude: lng,
          country: geo.country ?? value?.country ?? '',
          region: geo.region ?? value?.region ?? '',
          district: geo.district ?? value?.district ?? '',
          formattedAddress: geo.formattedAddress ?? value?.formattedAddress ?? '',
          mappingMode: nextMode, mappedAreaHectares: area,
          fieldBoundaryJson: nextMode === 'polygon' ? buildBoundaryJson(nextPts) : null,
        });
      } catch { /* keep existing */ }
      finally { setIsResolving(false); }
    }, 400);
  }, [
    onChange,
    value?.country,
    value?.district,
    value?.formattedAddress,
    value?.region,
  ]);

  // ── Map tap ──
  function handleMapPress(event: any) {
    const coords = event?.geometry?.coordinates ?? event?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;
    const [lng, lat] = [Number(coords[0]), Number(coords[1])];
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const pt: BoundaryPoint = [lng, lat];
    setLocationError(null);
    if (mode === 'point') { setCenterPin(pt); setPoints([]); scheduleGeocode(lng, lat, [], 'point'); return; }
    if (mode === 'polygon') {
      setPoints((prev) => {
        const next = [...prev, pt];
        const c = getPolygonCentroid(next) ?? { latitude: lat, longitude: lng };
        scheduleGeocode(c.longitude, c.latitude, next, 'polygon');
        return next;
      });
    }
  }

  // ── Zoom ──
  function zoomIn() {
    const z = Math.min(zoomLevel + 1.5, 22);
    setZoomLevel(z);
    cameraRef.current?.setCamera({ zoomLevel: z, animationDuration: 250 });
  }
  function zoomOut() {
    const z = Math.max(zoomLevel - 1.5, 1);
    setZoomLevel(z);
    cameraRef.current?.setCamera({ zoomLevel: z, animationDuration: 250 });
  }

  // ── Undo / Clear ──
  function undoPoint() {
    setPoints((prev) => {
      const next = prev.slice(0, -1);
      if (next.length > 0) {
        const c = getPolygonCentroid(next) ?? { latitude: next[0][1], longitude: next[0][0] };
        scheduleGeocode(c.longitude, c.latitude, next, 'polygon');
      }
      return next;
    });
  }
  function clearAll() {
    setPoints([]); setCenterPin(null);
    setCoordRows([{ lat: '', lng: '' }, { lat: '', lng: '' }, { lat: '', lng: '' }]);
    onChange({ latitude: cameraCenter[1], longitude: cameraCenter[0], country: '', region: '', district: '', formattedAddress: '', mappingMode: mode, mappedAreaHectares: null, fieldBoundaryJson: null });
  }

  // ── Search ──
  async function handleSearch() {
    if (!searchText.trim()) return;
    setIsSearching(true); setSearchResults([]); setLocationError(null);
    try {
      const r = await forwardGeocode(searchText.trim());
      if (!r.length) { setLocationError('No results found.'); return; }
      setSearchResults(r);
    } catch { setLocationError('Search failed.'); }
    finally { setIsSearching(false); }
  }

  function selectResult(r: SearchResult) {
    const [lng, lat] = r.center;
    setCameraCenter([lng, lat]); setZoomLevel(15);
    cameraRef.current?.setCamera({ centerCoordinate: [lng, lat], zoomLevel: 15, animationDuration: 600 });
    setSearchResults([]); setSearchText('');
    if (mode === 'point') { setCenterPin([lng, lat]); setPoints([]); }
    scheduleGeocode(lng, lat, points, mode);
  }

  // ── Current location ──
  async function captureCurrentLocation() {
    setLocationError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setLocationError('Location permission denied.'); return; }
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const pt: BoundaryPoint = [pos.coords.longitude, pos.coords.latitude];
      setCameraCenter(pt); setZoomLevel(17);
      cameraRef.current?.setCamera({ centerCoordinate: pt, zoomLevel: 17, animationDuration: 600 });
      if (mode === 'point') { setCenterPin(pt); setPoints([]); scheduleGeocode(pt[0], pt[1], [], 'point'); }
      else { setPoints((prev) => { const next = [...prev, pt]; scheduleGeocode(pt[0], pt[1], next, 'polygon'); return next; }); }
    } catch { setLocationError('Could not get location.'); }
  }

  // ── Walk ──
  async function startWalk() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setLocationError('Location permission required.'); return; }
    setIsWalking(true); setPoints([]);
    let lastPt: BoundaryPoint | null = null;
    walkSubRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 2 },
      (pos) => {
        const pt: BoundaryPoint = [pos.coords.longitude, pos.coords.latitude];
        if (lastPt && Math.hypot(pt[0] - lastPt[0], pt[1] - lastPt[1]) < 0.00002) return;
        lastPt = pt;
        setCameraCenter(pt);
        cameraRef.current?.setCamera({ centerCoordinate: pt, animationDuration: 300 });
        setPoints((prev) => {
          const next = [...prev, pt];
          const c = getPolygonCentroid(next) ?? { latitude: pt[1], longitude: pt[0] };
          scheduleGeocode(c.longitude, c.latitude, next, 'polygon');
          return next;
        });
      },
    );
  }
  function stopWalk() { walkSubRef.current?.remove(); walkSubRef.current = null; setIsWalking(false); }

  // ── Coordinates ──
  const applyCoordinates = useCallback(() => {
    setCoordError(null);
    const parsed: BoundaryPoint[] = [];
    for (let i = 0; i < coordRows.length; i++) {
      const lat = parseFloat(coordRows[i].lat), lng = parseFloat(coordRows[i].lng);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) { setCoordError(`Row ${i + 1}: invalid latitude.`); return; }
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) { setCoordError(`Row ${i + 1}: invalid longitude.`); return; }
      parsed.push([lng, lat]);
    }
    if (parsed.length < 3) { setCoordError('Enter at least 3 points.'); return; }
    setPoints(parsed);
    const c = getPolygonCentroid(parsed) ?? { latitude: parsed[0][1], longitude: parsed[0][0] };
    setCameraCenter([c.longitude, c.latitude]); setZoomLevel(14);
    cameraRef.current?.setCamera({ centerCoordinate: [c.longitude, c.latitude], zoomLevel: 14, animationDuration: 600 });
    scheduleGeocode(c.longitude, c.latitude, parsed, 'polygon');
  }, [coordRows, scheduleGeocode]);

  useEffect(() => {
    onHandle?.({ coordRows, setCoordRows, coordError, applyCoordinates });
  }, [applyCoordinates, coordError, coordRows, onHandle]);

  // ── Summary ──
  const summaryText = isResolving ? '⏳ Detecting…'
    : isWalking ? `🚶 ${points.length} pts`
    : mode === 'point' && centerPin ? `📍 ${centerPin[1].toFixed(4)}, ${centerPin[0].toFixed(4)}`
    : points.length >= 3 ? `✅ ${mappedArea?.toFixed(2) ?? '—'} ha · ${points.length} pts`
    : points.length > 0 ? `${points.length} / 3 pts`
    : mode === 'coordinates' ? 'Enter coords →'
    : 'Tap map to add points';

  const MapView = Mapbox?.MapView;
  const Camera = Mapbox?.Camera;
  const ShapeSource = Mapbox?.ShapeSource;
  const FillLayer = Mapbox?.FillLayer;
  const LineLayer = Mapbox?.LineLayer;
  const CircleLayer = Mapbox?.CircleLayer;
  const SymbolLayer = Mapbox?.SymbolLayer;
  const PointAnnotation = Mapbox?.PointAnnotation;

  const hasAny = points.length > 0 || centerPin !== null;

  if (!MapView) {
    return (
      <View style={ms.fallback}>
        <Text style={ms.fallbackTitle}>Map unavailable</Text>
        <Text style={ms.fallbackCopy}>A native Mapbox build is required.</Text>
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* ── Map (fills screen) ── */}
      <MapView
        style={StyleSheet.absoluteFillObject}
        styleURL={env.mapboxStyleUrl}
        onPress={handleMapPress}
        scaleBarEnabled={false}
        compassEnabled={false}
        attributionEnabled={false}
        logoEnabled={false}
      >
        <Camera ref={cameraRef} centerCoordinate={cameraCenter} zoomLevel={zoomLevel} animationMode="flyTo" animationDuration={600} />

        {overlayShape && (
          <ShapeSource id="boundary-shape" shape={overlayShape}>
            <FillLayer id="boundary-fill" style={{ fillColor: '#FBBC04', fillOpacity: 0.25 }} />
            <LineLayer id="boundary-line" style={{ lineColor: '#FFFFFF', lineWidth: 3 }} />
          </ShapeSource>
        )}

        {points.length > 0 && (
          <ShapeSource id="boundary-dots" shape={pointsGeoJson}>
            <CircleLayer id="boundary-circles" style={{ circleRadius: 10, circleColor: '#FFFFFF', circleStrokeWidth: 3, circleStrokeColor: theme.colors.primary }} />
            <SymbolLayer id="boundary-labels" style={{ textField: ['get', 'label'], textSize: 11, textColor: theme.colors.primary, textFont: ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'], textAllowOverlap: true, textIgnorePlacement: true }} />
          </ShapeSource>
        )}

        {mode === 'point' && centerPin && (
          <PointAnnotation id="drop-pin" coordinate={centerPin}>
            <View style={ms.pin}><View style={ms.pinInner} /></View>
          </PointAnnotation>
        )}
      </MapView>

      {/* ── Search bar — top ── */}
      <View style={ms.searchWrap}>
        <View style={ms.searchBox}>
          <Text style={ms.searchIcon}>🔍</Text>
          <TextInput
            style={ms.searchInput}
            placeholder="Search location…"
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {isSearching
            ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            : <TouchableOpacity onPress={handleSearch} style={ms.searchGoBtn}><Text style={ms.searchGoBtnText}>Go</Text></TouchableOpacity>
          }
        </View>
        {searchResults.length > 0 && (
          <View style={ms.searchDropdown}>
            {searchResults.map((r, i) => (
              <TouchableOpacity key={i} style={[ms.searchResult, i < searchResults.length - 1 && ms.searchResultBorder]} onPress={() => selectResult(r)}>
                <Text style={ms.searchResultText} numberOfLines={2}>📍 {r.place_name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Mode tabs — below search ── */}
      <View style={ms.modeWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ms.modeRow}>
          {([
            { key: 'polygon', label: '✏️ Tap' },
            { key: 'walk', label: '🚶 Walk' },
            { key: 'coordinates', label: '🔢 Coords' },
            { key: 'point', label: '📍 Pin' },
          ] as { key: MappingMode; label: string }[]).map(({ key, label }) => (
            <TouchableOpacity key={key} onPress={() => { if (isWalking) stopWalk(); onModeChange(key); }} style={[ms.modeTab, mode === key && ms.modeTabActive]}>
              <Text style={[ms.modeTabText, mode === key && ms.modeTabTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Zoom column — right ── */}
      <View style={ms.zoomCol}>
        <TouchableOpacity style={ms.zoomBtn} onPress={zoomIn}><Text style={ms.zoomText}>+</Text></TouchableOpacity>
        <View style={ms.zoomDivider} />
        <TouchableOpacity style={ms.zoomBtn} onPress={zoomOut}><Text style={ms.zoomText}>−</Text></TouchableOpacity>
      </View>

      {/* ── Walk start/stop (only in walk mode) ── */}
      {mode === 'walk' && (
        <View style={ms.walkWrap}>
          {isWalking
            ? <MapBtn label="⏹ Stop" active onPress={stopWalk} />
            : <MapBtn label="▶ Start walk" onPress={() => void startWalk()} />
          }
        </View>
      )}

      {/* ── Google Maps-style location button ── */}
      <TouchableOpacity
        style={[ms.locBtn, { bottom: bottomInset + 60 }]}
        onPress={() => void captureCurrentLocation()}
        activeOpacity={0.85}
      >
        <Ionicons name="locate" size={22} color="#1a73e8" />
      </TouchableOpacity>

      {/* ── Undo / Clear ── */}
      {hasAny && (
        <View style={[ms.undoWrap, { bottom: bottomInset + 48 }]}>
          {points.length > 0 && <MapBtn label="Undo" onPress={undoPoint} />}
          <MapBtn label="Clear" onPress={clearAll} />
        </View>
      )}

      {/* ── Summary pill ── */}
      <View style={[ms.summaryPill, { bottom: bottomInset + 4 }]}>
        <Text style={ms.summaryText}>{summaryText}</Text>
      </View>

      {/* ── Error ── */}
      {locationError && (
        <View style={[ms.errorBadge, { bottom: bottomInset + 56 }]}>
          <Text style={ms.errorText}>⚠ {locationError}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Map overlay styles ───────────────────────────────────────────────────────

const ms = StyleSheet.create({
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a2e1a', gap: 8, padding: 24 },
  fallbackTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  fallbackCopy: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' },

  // Search
  searchWrap: { position: 'absolute', top: 56, left: 12, right: 12, gap: 8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12, gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 6 },
    }),
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: '#fff' },
  searchGoBtn: { backgroundColor: theme.colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  searchGoBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  searchDropdown: {
    backgroundColor: 'rgba(20,30,20,0.96)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden',
  },
  searchResult: { padding: 12 },
  searchResultBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  searchResultText: { fontSize: 13, color: '#fff', lineHeight: 18 },

  // Mode tabs
  modeWrap: { position: 'absolute', top: 112, left: 12, right: 12 },
  modeRow: { flexDirection: 'row', gap: 6 },
  modeTab: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  modeTabActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  modeTabText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  modeTabTextActive: { color: '#fff' },

  // Zoom column
  zoomCol: {
    position: 'absolute', right: 12, top: '50%', marginTop: -40,
    backgroundColor: 'rgba(0,0,0,0.60)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  zoomBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  zoomText: { fontSize: 20, color: '#fff', fontWeight: '300', lineHeight: 24 },
  zoomDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },

  // Walk mode button (below mode tabs)
  walkWrap: { position: 'absolute', top: 156, left: 12 },

  // Google Maps-style location button (bottom set inline)
  locBtn: {
    position: 'absolute', right: 12,
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 6 },
    }),
  },

  // Undo / Clear (bottom set inline)
  undoWrap: { position: 'absolute', left: 12, flexDirection: 'row', gap: 6 },

  // Summary pill (bottom set inline)
  summaryPill: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.70)', borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center',
  },
  summaryText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Error (bottom set inline)
  errorBadge: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: 'rgba(197,82,52,0.90)', borderRadius: 10, padding: 10,
  },
  errorText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Floating map button
  btn: {
    backgroundColor: 'rgba(0,0,0,0.60)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  btnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  btnDisabled: { opacity: 0.4 },
  btnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  btnTextActive: { color: '#fff' },

  // Drop pin
  pin: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EA4335', borderWidth: 2.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pinInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
});
