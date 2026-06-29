import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Modal,
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
import { SkeletonCard } from '@/components/state/skeleton';
import { salesApi } from '@/lib/api/finance';
import type { Buyer, Sale } from '@/features/finance/types';
import { fmtDate, fmtMoney, todayIso } from '@/features/finance/helpers';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

export function SalesTab({ farmId }: { farmId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [payingSale, setPayingSale] = useState<Sale | null>(null);

  const summaryQuery = useQuery({
    queryKey: ['sales-summary', farmId],
    queryFn: () => salesApi.summary(farmId),
  });
  const salesQuery = useQuery({
    queryKey: ['sales-list', farmId],
    queryFn: () => salesApi.listSales(farmId),
  });

  const sales = salesQuery.data ?? [];
  const owed = sales.filter((s) => s.outstanding > 0);
  const summary = summaryQuery.data;

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['sales-summary', farmId] });
    void qc.invalidateQueries({ queryKey: ['sales-list', farmId] });
    void qc.invalidateQueries({ queryKey: ['finance-summary', farmId] });
    void qc.invalidateQueries({ queryKey: ['finance-records', farmId] });
  }

  return (
    <View style={{ gap: 12 }}>
      {summary ? (
        <View style={s.statRow}>
          <View style={[s.statCard, { backgroundColor: '#fff7e6' }]}>
            <Text style={s.statLabel}>{t('finance.moneyOwed')}</Text>
            <Text style={[s.statValue, { color: theme.colors.warning }]}>{fmtMoney(summary.total_outstanding)}</Text>
          </View>
          <View style={[s.statCard, { backgroundColor: '#eaf8ef' }]}>
            <Text style={s.statLabel}>{t('finance.received')}</Text>
            <Text style={[s.statValue, { color: theme.colors.primary }]}>{fmtMoney(summary.total_received)}</Text>
          </View>
        </View>
      ) : null}

      <TouchableOpacity style={s.addBtn} onPress={() => setCreating(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={s.addBtnText}>{t('finance.recordSale')}</Text>
      </TouchableOpacity>

      {salesQuery.isLoading ? (
        <SkeletonCard />
      ) : sales.length === 0 ? (
        <Card><Text style={s.muted}>{t('finance.noSales')}</Text></Card>
      ) : (
        <>
          {owed.length > 0 ? (
            <Text style={s.sectionLabel}>{t('finance.outstandingSales', { n: owed.length })}</Text>
          ) : null}
          {sales.map((sale) => (
            <Card key={sale.id}>
              <View style={s.rowBetween}>
                <Text style={s.cardTitle}>{sale.buyer_name ?? t('finance.walkInBuyer')}</Text>
                <View style={[s.statusPill, sale.payment_status === 'paid' && s.statusPillPaid, sale.payment_status === 'unpaid' && s.statusPillUnpaid]}>
                  <Text style={[s.statusText, sale.payment_status === 'paid' && s.statusTextPaid]}>
                    {t(`finance.salePaymentStatus.${sale.payment_status}`)}
                  </Text>
                </View>
              </View>
              <Text style={s.subtle}>
                {sale.crop_name ?? t('finance.produce')} · {sale.quantity}{sale.unit} · {fmtDate(sale.date)}
              </Text>
              <View style={[s.rowBetween, { marginTop: 8 }]}>
                <View><Text style={s.subtle}>{t('finance.total')}</Text><Text style={s.fig}>{fmtMoney(sale.total_amount)}</Text></View>
                <View><Text style={s.subtle}>{t('finance.received')}</Text><Text style={s.fig}>{fmtMoney(sale.amount_received)}</Text></View>
                <View><Text style={s.subtle}>{t('finance.owed')}</Text><Text style={[s.fig, sale.outstanding > 0 && { color: theme.colors.warning }]}>{fmtMoney(sale.outstanding)}</Text></View>
              </View>
              {sale.outstanding > 0 ? (
                <TouchableOpacity style={s.outlineBtn} onPress={() => setPayingSale(sale)}>
                  <Text style={s.outlineBtnText}>{t('finance.recordPayment')}</Text>
                </TouchableOpacity>
              ) : null}
            </Card>
          ))}
        </>
      )}

      {creating ? (
        <CreateSaleSheet farmId={farmId} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); invalidate(); }} />
      ) : null}
      {payingSale ? (
        <SalePaymentSheet
          farmId={farmId}
          sale={payingSale}
          onClose={() => setPayingSale(null)}
          onSaved={() => { setPayingSale(null); invalidate(); }}
        />
      ) : null}
    </View>
  );
}

function CreateSaleSheet({ farmId, onClose, onSaved }: { farmId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const buyersQuery = useQuery({ queryKey: ['buyers', farmId], queryFn: () => salesApi.listBuyers(farmId) });
  const buyers = buyersQuery.data ?? [];

  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [newBuyer, setNewBuyer] = useState('');
  const [crop, setCrop] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [received, setReceived] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qty = parseFloat(quantity) || 0;
  const price = parseFloat(unitPrice) || 0;
  const total = Math.round(qty * price);

  async function save() {
    if (qty <= 0 || price <= 0) { setError('finance.errSaleFigures'); return; }
    setSaving(true);
    setError(null);
    try {
      let resolvedBuyer: Buyer | null = buyers.find((b) => b.id === buyerId) ?? null;
      if (!resolvedBuyer && newBuyer.trim()) {
        resolvedBuyer = await salesApi.createBuyer(farmId, { name: newBuyer.trim() });
      }
      await salesApi.createSale(farmId, {
        buyer_id: resolvedBuyer?.id ?? null,
        crop_name: crop.trim() || undefined,
        quantity: qty,
        unit: 'kg',
        unit_price: price,
        amount_received: received.trim() === '' ? undefined : Math.round(parseFloat(received) || 0),
        date: todayIso(),
        payment_method: 'cash',
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'finance.errSave');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={saving ? undefined : onClose}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.handle} />
          <Text style={s.sheetTitle}>{t('finance.recordSale')}</Text>

          <Text style={s.fieldLabel}>{t('finance.buyer')}</Text>
          {buyers.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
              {buyers.map((b) => (
                <TouchableOpacity key={b.id} style={[s.chip, buyerId === b.id && s.chipActive]} onPress={() => { setBuyerId(b.id); setNewBuyer(''); }}>
                  <Text style={[s.chipText, buyerId === b.id && s.chipTextActive]}>{b.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}
          <TextInput
            style={s.input}
            value={newBuyer}
            onChangeText={(v) => { setNewBuyer(v); setBuyerId(null); }}
            placeholder={t('finance.newBuyerPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={s.fieldLabel}>{t('finance.crop')}</Text>
          <TextInput style={s.input} value={crop} onChangeText={setCrop} placeholder={t('finance.cropPlaceholder')} placeholderTextColor={theme.colors.textMuted} />

          <View style={s.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>{t('finance.quantityKg')}</Text>
              <TextInput style={s.input} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel}>{t('finance.unitPrice')}</Text>
              <TextInput style={s.input} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
            </View>
          </View>

          <View style={[s.rowBetween, { marginTop: 10 }]}>
            <Text style={s.fieldLabel}>{t('finance.total')}</Text>
            <Text style={s.totalValue}>{fmtMoney(total)}</Text>
          </View>

          <Text style={s.fieldLabel}>{t('finance.amountReceivedHint')}</Text>
          <TextInput style={s.input} value={received} onChangeText={setReceived} keyboardType="decimal-pad" placeholder={fmtMoney(total)} placeholderTextColor={theme.colors.textMuted} />

          {error ? <Text style={s.error}>{t(error)}</Text> : null}
          <TouchableOpacity style={[s.primaryBtn, saving && s.btnDisabled]} disabled={saving} onPress={() => void save()}>
            <Text style={s.primaryBtnText}>{saving ? t('common.saving') : t('common.save')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function SalePaymentSheet({ farmId, sale, onClose, onSaved }: { farmId: string; sale: Sale; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState(String(sale.outstanding));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const value = parseFloat(amount);
    if (!value || value <= 0) { setError('finance.errAmount'); return; }
    setSaving(true);
    setError(null);
    try {
      await salesApi.recordSalePayment(farmId, sale.id, { amount: value, date: todayIso(), payment_method: 'cash' });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'finance.errSave');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={saving ? undefined : onClose}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.handle} />
        <Text style={s.sheetTitle}>{t('finance.recordPayment')}</Text>
        <Text style={s.subtle}>{sale.buyer_name ?? t('finance.walkInBuyer')} · {t('finance.owed')} {fmtMoney(sale.outstanding)}</Text>
        <Text style={s.fieldLabel}>{t('finance.amount')}</Text>
        <TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0 TZS" placeholderTextColor={theme.colors.textMuted} />
        {error ? <Text style={s.error}>{t(error)}</Text> : null}
        <TouchableOpacity style={[s.primaryBtn, saving && s.btnDisabled]} disabled={saving} onPress={() => void save()}>
          <Text style={s.primaryBtnText}>{saving ? t('common.saving') : t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  statRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderRadius: theme.radius.lg, padding: 14, gap: 4 },
  statLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  statValue: { fontSize: 18, fontWeight: '800' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 12 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: theme.colors.textMuted, textTransform: 'uppercase' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  muted: { fontSize: 14, color: theme.colors.textMuted },
  subtle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  twoCol: { flexDirection: 'row', gap: 12 },
  fig: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  totalValue: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  statusPill: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: theme.colors.border },
  statusPillPaid: { backgroundColor: '#eaf8ef', borderColor: '#c7e7d2' },
  statusPillUnpaid: { backgroundColor: '#fff7e6', borderColor: '#f0dcb0' },
  statusText: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  statusTextPaid: { color: theme.colors.primary },
  outlineBtn: { marginTop: 12, borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 9, alignItems: 'center' },
  outlineBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 13 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', backgroundColor: theme.colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginTop: 10 },
  input: { height: 46, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, paddingHorizontal: 14, fontSize: 14, color: theme.colors.text, marginTop: 4 },
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
