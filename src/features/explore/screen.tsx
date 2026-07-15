import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal as NativeModal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ModalProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Pill } from '@/components/core/pill';
import { cropCatalog } from '@/lib/constants/crops';
import type { CropCatalogItem } from '@/lib/domain/types';
import { theme } from '@/lib/theme';

function Modal({ children, ...props }: ModalProps) {
  return (
    <NativeModal {...props}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {children}
      </KeyboardAvoidingView>
    </NativeModal>
  );
}

// ─── Content tabs ─────────────────────────────────────────────────────────────

type ContentTab = 'market' | 'conditions' | 'inputs' | 'risks';

const CONTENT_TABS: { id: ContentTab; label: string }[] = [
  { id: 'market', label: 'Market' },
  { id: 'conditions', label: 'Conditions' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'risks', label: 'Risks' },
];

// ─── Crop picker modal ────────────────────────────────────────────────────────

function CropPickerModal({
  crops,
  selectedId,
  onSelect,
  onClose,
}: {
  crops: CropCatalogItem[];
  selectedId: string;
  onSelect: (crop: CropCatalogItem) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const filtered = crops.filter(
    (c) =>
      c.common_name.toLowerCase().includes(query.toLowerCase()) ||
      (c.local_name ?? '').toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={picker.overlay}>
        <TouchableOpacity style={picker.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[picker.sheet, { paddingBottom: insets.bottom + 8 }]}>
          {/* Header */}
          <View style={picker.header}>
            <Text style={picker.title}>Choose crop</Text>
            <TouchableOpacity style={picker.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={picker.searchWrap}>
            <Ionicons name="search-outline" size={15} color={theme.colors.textMuted} style={picker.searchIcon} />
            <TextInput
              style={picker.searchInput}
              placeholder="Search crops…"
              placeholderTextColor={theme.colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
          </View>

          {/* List */}
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={picker.list}>
              {filtered.map((crop) => {
                const isSelected = crop.id === selectedId;
                return (
                  <TouchableOpacity
                    key={crop.id}
                    style={[picker.item, isSelected && picker.itemActive]}
                    onPress={() => { onSelect(crop); onClose(); }}
                    activeOpacity={0.75}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[picker.itemName, isSelected && picker.itemNameActive]}>
                        {crop.common_name}
                      </Text>
                      {crop.local_name ? (
                        <Text style={picker.itemSub}>{crop.local_name}</Text>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <View style={picker.checkCircle}>
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Tab content ──────────────────────────────────────────────────────────────

function TabContent({ tab, crop }: { tab: ContentTab; crop: CropCatalogItem }) {
  switch (tab) {
    case 'market':
      return (
        <View style={tc.section}>
          <View style={tc.statRow}>
            <View style={tc.statCard}>
              <Text style={tc.statLabel}>MARKET DEMAND</Text>
              <Text style={tc.statValue}>{crop.market_demand.toUpperCase()}</Text>
            </View>
            <View style={tc.statCard}>
              <Text style={tc.statLabel}>SUITABILITY</Text>
              <Text style={tc.statValue}>{crop.suitability_score}%</Text>
            </View>
          </View>
          <View style={tc.infoCard}>
            <Text style={tc.infoLabel}>EXPECTED YIELD</Text>
            <Text style={tc.infoValue}>{crop.expected_yield_label}</Text>
          </View>
          <View style={tc.infoCard}>
            <Text style={tc.infoLabel}>MATURITY</Text>
            <Text style={tc.infoValue}>Up to {crop.maturity_days_max} days</Text>
          </View>
        </View>
      );
    case 'conditions':
      return (
        <View style={tc.section}>
          <View style={tc.statRow}>
            <View style={tc.statCard}>
              <Text style={tc.statLabel}>WATER NEEDS</Text>
              <Text style={tc.statValue}>{crop.water_needs.toUpperCase()}</Text>
            </View>
            <View style={tc.statCard}>
              <Text style={tc.statLabel}>DIFFICULTY</Text>
              <Text style={tc.statValue}>{crop.difficulty.toUpperCase()}</Text>
            </View>
          </View>
          <View style={tc.noticeCard}>
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.info} />
            <Text style={tc.noticeText}>
              Detailed soil conditions and climate fit data will appear here once a farm plot is mapped.
            </Text>
          </View>
        </View>
      );
    case 'inputs':
      return (
        <View style={tc.section}>
          <View style={tc.noticeCard}>
            <Ionicons name="flask-outline" size={16} color={theme.colors.warning} />
            <Text style={tc.noticeText}>
              Fertilizer, seed, and chemical input recommendations are generated once a journey starts. Tap Start growing to begin.
            </Text>
          </View>
        </View>
      );
    case 'risks':
      return (
        <View style={tc.section}>
          <View style={tc.riskItem}>
            <View style={[tc.riskDot, { backgroundColor: crop.water_needs === 'high' ? theme.colors.danger : theme.colors.warning }]} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={tc.riskTitle}>Water stress</Text>
              <Text style={tc.riskMeta}>
                {crop.water_needs === 'high'
                  ? 'High water demand — irrigation strongly recommended during dry spells.'
                  : crop.water_needs === 'medium'
                  ? 'Moderate water needs — monitor rainfall closely.'
                  : 'Low water demand — drought tolerant.'}
              </Text>
            </View>
          </View>
          <View style={tc.riskItem}>
            <View style={[tc.riskDot, { backgroundColor: crop.difficulty === 'advanced' ? theme.colors.danger : crop.difficulty === 'intermediate' ? theme.colors.warning : theme.colors.success }]} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={tc.riskTitle}>Crop management complexity</Text>
              <Text style={tc.riskMeta}>Difficulty rated as {crop.difficulty}.</Text>
            </View>
          </View>
        </View>
      );
  }
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const crops = cropCatalog;
  const [selectedId, setSelectedId] = useState(crops[0]?.id ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ContentTab>('market');

  const crop = crops.find((c) => c.id === selectedId) ?? crops[0];
  if (!crop) return null;

  const soilFitGood = crop.suitability_score >= 80;

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero card ── */}
        <View style={s.hero}>
          {/* Crop selector pill */}
          <TouchableOpacity style={s.selectorPill} onPress={() => setPickerOpen(true)} activeOpacity={0.8}>
            <Text style={s.selectorPrefix}>Explore</Text>
            <Text style={s.selectorDot}>·</Text>
            <Text style={s.selectorCrop}>{crop.common_name}</Text>
            <Ionicons name="chevron-down" size={12} color={theme.colors.textMuted} />
          </TouchableOpacity>

          {/* Crop name */}
          <Text style={s.heroTitle}>{crop.common_name}</Text>
          {crop.local_name ? (
            <Text style={s.heroSub}>{crop.local_name} · {crop.variety ?? 'Standard variety'}</Text>
          ) : (
            <Text style={s.heroSub}>{crop.variety ?? 'Standard variety'}</Text>
          )}

          {/* Soil fit badge */}
          <View style={[s.fitBadge, soilFitGood ? s.fitBadgeGood : s.fitBadgeFair]}>
            <Ionicons
              name={soilFitGood ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={13}
              color={soilFitGood ? '#166534' : '#92400e'}
            />
            <Text style={[s.fitBadgeText, soilFitGood ? s.fitBadgeTextGood : s.fitBadgeTextFair]}>
              {soilFitGood ? 'Good regional fit' : 'Fair regional fit'}
            </Text>
          </View>

          {/* CTA buttons */}
          <View style={s.ctaRow}>
            <TouchableOpacity
              style={s.ctaSecondary}
              onPress={() => router.push('/assistant')}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles-outline" size={15} color={theme.colors.text} />
              <Text style={s.ctaSecondaryText}>Ask AI</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.ctaPrimary}
              onPress={() => router.push('/farms/new')}
              activeOpacity={0.85}
            >
              <Ionicons name="add-outline" size={15} color="#fff" />
              <Text style={s.ctaPrimaryText}>Start growing</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Content tabs ── */}
        <View style={s.tabRail}>
          {CONTENT_TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[s.tabBtn, activeTab === t.id && s.tabBtnActive]}
              onPress={() => setActiveTab(t.id)}
              activeOpacity={0.8}
            >
              <Text style={[s.tabBtnText, activeTab === t.id && s.tabBtnTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tab content ── */}
        <TabContent tab={activeTab} crop={crop} />

        {/* ── Full crop catalog ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>ALL CROPS</Text>
          {crops.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[s.catalogItem, c.id === selectedId && s.catalogItemActive]}
              onPress={() => setSelectedId(c.id)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[s.catalogName, c.id === selectedId && s.catalogNameActive]}>
                  {c.common_name}
                </Text>
                {c.local_name ? <Text style={s.catalogSub}>{c.local_name}</Text> : null}
              </View>
              <View style={s.catalogRight}>
                <Pill label={`${c.suitability_score}% fit`} tone="info" />
                <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Crop picker modal */}
      {pickerOpen ? (
        <CropPickerModal
          crops={crops}
          selectedId={selectedId}
          onSelect={(c) => { setSelectedId(c.id); setActiveTab('market'); }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  content: { gap: theme.spacing.lg, padding: theme.spacing.lg },

  hero: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.primary + '33',
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    overflow: 'hidden',
  },
  selectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.surface + 'b0',
  },
  selectorPrefix: { fontSize: 12, fontWeight: '600', color: theme.colors.primary },
  selectorDot: { fontSize: 12, color: theme.colors.border },
  selectorCrop: { fontSize: 12, fontWeight: '500', color: theme.colors.text },

  heroTitle: { fontSize: 32, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.5, lineHeight: 36 },
  heroSub: { fontSize: 13, fontStyle: 'italic', color: theme.colors.textMuted },

  fitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  fitBadgeGood: { backgroundColor: '#dcfce7' },
  fitBadgeFair: { backgroundColor: '#fef3c7' },
  fitBadgeText: { fontSize: 12, fontWeight: '600' },
  fitBadgeTextGood: { color: '#166534' },
  fitBadgeTextFair: { color: '#92400e' },

  ctaRow: { flexDirection: 'row', gap: 10 },
  ctaSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface + 'b0',
  },
  ctaSecondaryText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  ctaPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  ctaPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  tabRail: { flexDirection: 'row', gap: 6 },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tabBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  tabBtnTextActive: { color: '#fff' },

  section: { gap: theme.spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: theme.colors.textMuted },

  catalogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  catalogItemActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '0a' },
  catalogName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  catalogNameActive: { color: theme.colors.primary },
  catalogSub: { fontSize: 12, color: theme.colors.textMuted },
  catalogRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

const tc = StyleSheet.create({
  section: { gap: theme.spacing.md },
  statRow: { flexDirection: 'row', gap: theme.spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: theme.colors.textMuted },
  statValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  infoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: theme.colors.textMuted },
  infoValue: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  noticeText: { flex: 1, fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
  riskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  riskDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  riskTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  riskMeta: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 19 },
});

const picker = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 50 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    top: 32,
    backgroundColor: 'rgba(248, 247, 239, 0.96)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  title: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    borderWidth: 0,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, height: 40, fontSize: 14, color: theme.colors.text },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemActive: {
    backgroundColor: theme.colors.primary + '0f',
    borderWidth: 1,
    borderColor: theme.colors.primary + '40',
  },
  itemName: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  itemNameActive: { color: theme.colors.primary },
  itemSub: { fontSize: 12, fontStyle: 'italic', color: theme.colors.textMuted, marginTop: 1 },
  checkCircle: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
