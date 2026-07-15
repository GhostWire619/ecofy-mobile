import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/core/card';
import { Screen } from '@/components/layout/screen';
import { SkeletonCard } from '@/components/state/skeleton';
import { equipmentApi, inventoryApi } from '@/lib/api/resources';
import type { Equipment, EquipmentLogType, EquipmentStatus, InventoryItem, StockMovementType } from '@/features/resources/types';
import { fmtMoney, todayIso } from '@/features/finance/helpers';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

type ResourceTab = 'inventory' | 'equipment';

const INVENTORY_CATEGORIES = ['seed', 'fertilizer', 'pesticide', 'herbicide', 'fuel', 'feed', 'produce', 'other'];
const EQUIPMENT_CATEGORIES = ['tractor', 'implement', 'pump', 'vehicle', 'tool', 'other'];
const MOVEMENT_TYPES: StockMovementType[] = ['in', 'out', 'adjust'];
const LOG_TYPES: EquipmentLogType[] = ['fuel', 'maintenance', 'repair', 'usage', 'other'];

function label(id: string) {
  return id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ');
}

export function ResourcesScreen({ farmId }: { farmId: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<ResourceTab>('inventory');

  return (
    <Screen contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.heading}>{t('resources.title')}</Text>
      </View>

      <View style={s.segment}>
        {(['inventory', 'equipment'] as ResourceTab[]).map((tb) => (
          <TouchableOpacity key={tb} style={[s.segmentBtn, tab === tb && s.segmentBtnActive]} onPress={() => setTab(tb)}>
            <Text style={[s.segmentText, tab === tb && s.segmentTextActive]}>{t(tb === 'inventory' ? 'resources.inventory' : 'resources.equipment')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'inventory' ? <InventoryTab farmId={farmId} /> : <EquipmentTab farmId={farmId} />}
    </Screen>
  );
}

// ─── Inventory ───────────────────────────────────────────────────────────────

function InventoryTab({ farmId }: { farmId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [moveItem, setMoveItem] = useState<InventoryItem | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['inventory', farmId], queryFn: () => inventoryApi.list(farmId) });
  const items = data ?? [];

  function invalidate() { void qc.invalidateQueries({ queryKey: ['inventory', farmId] }); }

  function confirmDelete(item: InventoryItem) {
    Alert.alert(t('resources.deleteItem'), t('resources.deleteItemConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void inventoryApi.remove(farmId, item.id).then(invalidate) },
    ]);
  }

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity style={s.addBtn} onPress={() => setAdding(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={s.addBtnText}>{t('resources.addItem')}</Text>
      </TouchableOpacity>

      {isLoading ? (
        <SkeletonCard />
      ) : items.length === 0 ? (
        <Card><Text style={s.muted}>{t('resources.noItems')}</Text></Card>
      ) : (
        items.map((item) => (
          <Card key={item.id}>
            <View style={s.rowBetween}>
              <View style={s.titleRow}>
                <Text style={s.itemName}>{item.name}</Text>
                {item.low_stock ? <View style={s.lowPill}><Text style={s.lowPillText}>{t('resources.lowStock')}</Text></View> : null}
              </View>
              <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} /></TouchableOpacity>
            </View>
            <Text style={s.subtle}>{label(item.category)}{item.unit_cost ? ` · ${fmtMoney(item.unit_cost)}/${item.unit}` : ''}</Text>
            <View style={[s.rowBetween, { marginTop: 8, alignItems: 'flex-end' }]}>
              <Text style={s.qty}>{item.current_qty} <Text style={s.qtyUnit}>{item.unit}</Text></Text>
              <TouchableOpacity style={s.outlineBtn} onPress={() => setMoveItem(item)}>
                <Text style={s.outlineBtnText}>{t('resources.adjustStock')}</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))
      )}

      {adding ? <AddItemSheet farmId={farmId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); invalidate(); }} /> : null}
      {moveItem ? <StockMovementSheet farmId={farmId} item={moveItem} onClose={() => setMoveItem(null)} onSaved={() => { setMoveItem(null); invalidate(); }} /> : null}
    </View>
  );
}

function AddItemSheet({ farmId, onClose, onSaved }: { farmId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('seed');
  const [unit, setUnit] = useState('kg');
  const [openingQty, setOpeningQty] = useState('');
  const [reorder, setReorder] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setError('resources.errName'); return; }
    setSaving(true);
    setError(null);
    try {
      await inventoryApi.create(farmId, {
        name: name.trim(),
        category,
        unit: unit.trim() || 'kg',
        opening_qty: parseFloat(openingQty) || 0,
        reorder_level: reorder.trim() ? parseFloat(reorder) : null,
        unit_cost: Math.round(parseFloat(unitCost) || 0),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'resources.errSave');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetShell onClose={saving ? undefined : onClose} insetsBottom={insets.bottom}>
      <Text style={s.sheetTitle}>{t('resources.addItem')}</Text>
      <Text style={s.fieldLabel}>{t('resources.name')}</Text>
      <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t('resources.itemNamePlaceholder')} placeholderTextColor={theme.colors.textMuted} />
      <Text style={s.fieldLabel}>{t('resources.category')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {INVENTORY_CATEGORIES.map((c) => (
          <TouchableOpacity key={c} style={[s.chip, category === c && s.chipActive]} onPress={() => setCategory(c)}>
            <Text style={[s.chipText, category === c && s.chipTextActive]}>{label(c)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={s.twoCol}>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>{t('resources.unit')}</Text>
          <TextInput style={s.input} value={unit} onChangeText={setUnit} placeholder="kg" placeholderTextColor={theme.colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>{t('resources.openingQty')}</Text>
          <TextInput style={s.input} value={openingQty} onChangeText={setOpeningQty} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
        </View>
      </View>
      <View style={s.twoCol}>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>{t('resources.reorderLevel')}</Text>
          <TextInput style={s.input} value={reorder} onChangeText={setReorder} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>{t('resources.unitCost')}</Text>
          <TextInput style={s.input} value={unitCost} onChangeText={setUnitCost} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
        </View>
      </View>
      {error ? <Text style={s.error}>{t(error)}</Text> : null}
      <SaveButton saving={saving} onPress={() => void save()} />
    </SheetShell>
  );
}

function StockMovementSheet({ farmId, item, onClose, onSaved }: { farmId: string; item: InventoryItem; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<StockMovementType>('in');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const q = parseFloat(quantity);
    if (!q || q <= 0) { setError('resources.errQty'); return; }
    setSaving(true);
    setError(null);
    try {
      await inventoryApi.recordMovement(farmId, item.id, { movement_type: type, quantity: q, date: todayIso(), notes: notes.trim() || undefined });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'resources.errSave');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetShell onClose={saving ? undefined : onClose} insetsBottom={insets.bottom}>
      <Text style={s.sheetTitle}>{item.name}</Text>
      <Text style={s.subtle}>{t('resources.inStock')}: {item.current_qty} {item.unit}</Text>
      <View style={[s.segment, { marginTop: 10 }]}>
        {MOVEMENT_TYPES.map((mt) => (
          <TouchableOpacity key={mt} style={[s.segmentBtn, type === mt && s.segmentBtnActive]} onPress={() => setType(mt)}>
            <Text style={[s.segmentText, type === mt && s.segmentTextActive]}>{t(`resources.movement.${mt}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.fieldLabel}>{t('resources.quantity')} ({item.unit})</Text>
      <TextInput style={s.input} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
      <Text style={s.fieldLabel}>{t('resources.notesOptional')}</Text>
      <TextInput style={s.input} value={notes} onChangeText={setNotes} placeholder={t('resources.notesPlaceholder')} placeholderTextColor={theme.colors.textMuted} />
      {error ? <Text style={s.error}>{t(error)}</Text> : null}
      <SaveButton saving={saving} onPress={() => void save()} />
    </SheetShell>
  );
}

// ─── Equipment ───────────────────────────────────────────────────────────────

function EquipmentTab({ farmId }: { farmId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [logItem, setLogItem] = useState<Equipment | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['equipment', farmId], queryFn: () => equipmentApi.list(farmId) });
  const items = data ?? [];

  function invalidate() { void qc.invalidateQueries({ queryKey: ['equipment', farmId] }); }

  function confirmDelete(item: Equipment) {
    Alert.alert(t('resources.deleteEquipment'), t('resources.deleteEquipmentConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void equipmentApi.remove(farmId, item.id).then(invalidate) },
    ]);
  }

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity style={s.addBtn} onPress={() => setAdding(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={s.addBtnText}>{t('resources.addEquipment')}</Text>
      </TouchableOpacity>

      {isLoading ? (
        <SkeletonCard />
      ) : items.length === 0 ? (
        <Card><Text style={s.muted}>{t('resources.noEquipment')}</Text></Card>
      ) : (
        items.map((item) => (
          <Card key={item.id}>
            <View style={s.rowBetween}>
              <View style={s.titleRow}>
                <Text style={s.itemName}>{item.name}</Text>
                <View style={[s.statusPill, item.status === 'active' && s.statusPillActive]}>
                  <Text style={[s.statusText, item.status === 'active' && s.statusTextActive]}>{t(`resources.status.${item.status}`)}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={8}><Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} /></TouchableOpacity>
            </View>
            <Text style={s.subtle}>{label(item.category)}{item.identifier ? ` · ${item.identifier}` : ''}</Text>
            {item.total_running_cost ? <Text style={s.subtle}>{t('resources.runningCost')}: {fmtMoney(item.total_running_cost)}</Text> : null}
            <TouchableOpacity style={[s.outlineBtn, { marginTop: 10 }]} onPress={() => setLogItem(item)}>
              <Text style={s.outlineBtnText}>{t('resources.logUsage')}</Text>
            </TouchableOpacity>
          </Card>
        ))
      )}

      {adding ? <AddEquipmentSheet farmId={farmId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); invalidate(); }} /> : null}
      {logItem ? <EquipmentLogSheet farmId={farmId} item={logItem} onClose={() => setLogItem(null)} onSaved={() => { setLogItem(null); invalidate(); }} /> : null}
    </View>
  );
}

function AddEquipmentSheet({ farmId, onClose, onSaved }: { farmId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('tractor');
  const [status, setStatus] = useState<EquipmentStatus>('active');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setError('resources.errName'); return; }
    setSaving(true);
    setError(null);
    try {
      await equipmentApi.create(farmId, { name: name.trim(), category, status, purchase_cost: cost.trim() ? Math.round(parseFloat(cost)) : undefined });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'resources.errSave');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetShell onClose={saving ? undefined : onClose} insetsBottom={insets.bottom}>
      <Text style={s.sheetTitle}>{t('resources.addEquipment')}</Text>
      <Text style={s.fieldLabel}>{t('resources.name')}</Text>
      <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t('resources.equipmentNamePlaceholder')} placeholderTextColor={theme.colors.textMuted} />
      <Text style={s.fieldLabel}>{t('resources.category')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {EQUIPMENT_CATEGORIES.map((c) => (
          <TouchableOpacity key={c} style={[s.chip, category === c && s.chipActive]} onPress={() => setCategory(c)}>
            <Text style={[s.chipText, category === c && s.chipTextActive]}>{label(c)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={s.fieldLabel}>{t('resources.statusLabel')}</Text>
      <View style={s.segment}>
        {(['active', 'maintenance', 'retired'] as EquipmentStatus[]).map((st) => (
          <TouchableOpacity key={st} style={[s.segmentBtn, status === st && s.segmentBtnActive]} onPress={() => setStatus(st)}>
            <Text style={[s.segmentText, status === st && s.segmentTextActive]}>{t(`resources.status.${st}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.fieldLabel}>{t('resources.purchaseCostOptional')}</Text>
      <TextInput style={s.input} value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0 TZS" placeholderTextColor={theme.colors.textMuted} />
      {error ? <Text style={s.error}>{t(error)}</Text> : null}
      <SaveButton saving={saving} onPress={() => void save()} />
    </SheetShell>
  );
}

function EquipmentLogSheet({ farmId, item, onClose, onSaved }: { farmId: string; item: Equipment; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [logType, setLogType] = useState<EquipmentLogType>('fuel');
  const [cost, setCost] = useState('');
  const [litres, setLitres] = useState('');
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await equipmentApi.recordLog(farmId, item.id, {
        log_type: logType,
        date: todayIso(),
        cost: cost.trim() ? Math.round(parseFloat(cost)) : undefined,
        litres: litres.trim() ? parseFloat(litres) : undefined,
        hours: hours.trim() ? parseFloat(hours) : undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'resources.errSave');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetShell onClose={saving ? undefined : onClose} insetsBottom={insets.bottom}>
      <Text style={s.sheetTitle}>{item.name}</Text>
      <Text style={s.fieldLabel}>{t('resources.logType')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {LOG_TYPES.map((lt) => (
          <TouchableOpacity key={lt} style={[s.chip, logType === lt && s.chipActive]} onPress={() => setLogType(lt)}>
            <Text style={[s.chipText, logType === lt && s.chipTextActive]}>{label(lt)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={s.fieldLabel}>{t('resources.costBooksExpense')}</Text>
      <TextInput style={s.input} value={cost} onChangeText={setCost} keyboardType="decimal-pad" placeholder="0 TZS" placeholderTextColor={theme.colors.textMuted} />
      <View style={s.twoCol}>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>{t('resources.litres')}</Text>
          <TextInput style={s.input} value={litres} onChangeText={setLitres} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.fieldLabel}>{t('resources.hours')}</Text>
          <TextInput style={s.input} value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
        </View>
      </View>
      {error ? <Text style={s.error}>{t(error)}</Text> : null}
      <SaveButton saving={saving} onPress={() => void save()} />
    </SheetShell>
  );
}

// ─── Shared sheet bits ───────────────────────────────────────────────────────

function SheetShell({ children, onClose, insetsBottom }: { children: React.ReactNode; onClose?: () => void; insetsBottom: number }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.keyboardModal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={onClose}><View style={s.backdrop} /></TouchableWithoutFeedback>
        <View style={[s.sheet, { paddingBottom: insetsBottom + 16 }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            <View style={s.handle} />
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SaveButton({ saving, onPress }: { saving: boolean; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <TouchableOpacity style={[s.primaryBtn, saving && s.btnDisabled]} disabled={saving} onPress={onPress}>
      <Text style={s.primaryBtnText}>{saving ? t('common.saving') : t('common.save')}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  content: { gap: 12, paddingTop: 6, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 12 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  muted: { fontSize: 14, color: theme.colors.textMuted },
  subtle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  itemName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  qty: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  qtyUnit: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  lowPill: { backgroundColor: '#fdecea', borderColor: '#f3c6c0', borderWidth: 1, borderRadius: theme.radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  lowPillText: { fontSize: 10, fontWeight: '700', color: theme.colors.danger },
  statusPill: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, paddingHorizontal: 9, paddingVertical: 2, borderWidth: 1, borderColor: theme.colors.border },
  statusPillActive: { backgroundColor: '#eaf8ef', borderColor: '#c7e7d2' },
  statusText: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  statusTextActive: { color: theme.colors.primary },
  outlineBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' },
  outlineBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 13 },

  segment: { flexDirection: 'row', gap: 8 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, alignItems: 'center' },
  segmentBtnActive: { borderColor: theme.colors.primary, backgroundColor: '#eaf8ef' },
  segmentText: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted },
  segmentTextActive: { color: theme.colors.primary },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  keyboardModal: { flex: 1 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', backgroundColor: 'rgba(248, 247, 239, 0.96)', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginTop: 10 },
  input: { height: 46, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, paddingHorizontal: 14, fontSize: 14, color: theme.colors.text, marginTop: 4 },
  twoCol: { flexDirection: 'row', gap: 12 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#eaf8ef' },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  chipTextActive: { color: theme.colors.primary },
  primaryBtn: { marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { backgroundColor: theme.colors.disabled },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  error: { color: theme.colors.danger, fontSize: 13, marginTop: 6 },
});
