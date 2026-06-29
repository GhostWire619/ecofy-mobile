import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
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
import { Screen } from '@/components/layout/screen';
import { SkeletonCard } from '@/components/state/skeleton';
import { workersApi } from '@/lib/api/workers';
import type { WageType, Worker } from '@/features/workers/types';
import { fmtMoney, todayIso } from '@/features/finance/helpers';
import { useI18n } from '@/lib/i18n';
import { theme } from '@/lib/theme';

const WAGE_TYPES: WageType[] = ['daily', 'hourly', 'piece', 'monthly'];

function monthStartIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export function WorkersScreen({ farmId }: { farmId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<Worker | null>(null);
  const { data, isLoading, isError } = useQuery({ queryKey: ['workers', farmId], queryFn: () => workersApi.list(farmId) });
  const workers = data ?? [];

  function invalidate() { void qc.invalidateQueries({ queryKey: ['workers', farmId] }); }

  return (
    <Screen contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={s.heading}>{t('workers.title')}</Text>
      </View>

      <TouchableOpacity style={s.addBtn} onPress={() => setAdding(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={s.addBtnText}>{t('workers.addWorker')}</Text>
      </TouchableOpacity>

      {isLoading ? (
        <><SkeletonCard /><SkeletonCard /></>
      ) : isError ? (
        <Card><Text style={s.muted}>{t('workers.couldNotLoad')}</Text></Card>
      ) : workers.length === 0 ? (
        <Card><Text style={s.muted}>{t('workers.empty')}</Text></Card>
      ) : (
        workers.map((w) => (
          <TouchableOpacity key={w.id} activeOpacity={0.8} onPress={() => setDetail(w)}>
            <Card>
              <View style={s.rowBetween}>
                <View style={s.titleRow}>
                  <View style={s.avatar}><Text style={s.avatarText}>{w.name.charAt(0).toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.workerName}>{w.name}</Text>
                    <Text style={s.subtle}>{t(`workers.wage.${w.wage_type}`)} · {fmtMoney(w.wage_rate, w.currency)}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </View>
            </Card>
          </TouchableOpacity>
        ))
      )}

      {adding ? <WorkerSheet farmId={farmId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); invalidate(); }} /> : null}
      {detail ? <WorkerDetailModal farmId={farmId} worker={detail} onClose={() => setDetail(null)} onChanged={invalidate} /> : null}
    </Screen>
  );
}

function WorkerSheet({ farmId, onClose, onSaved }: { farmId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [wageType, setWageType] = useState<WageType>('daily');
  const [wageRate, setWageRate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setError('workers.errName'); return; }
    const rate = parseFloat(wageRate);
    if (!rate || rate <= 0) { setError('workers.errRate'); return; }
    setSaving(true);
    setError(null);
    try {
      await workersApi.create(farmId, { name: name.trim(), phone: phone.trim() || undefined, wage_type: wageType, wage_rate: rate });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'workers.errSave');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={saving ? undefined : onClose}><View style={s.backdrop} /></TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.handle} />
          <Text style={s.sheetTitle}>{t('workers.addWorker')}</Text>
          <Text style={s.fieldLabel}>{t('workers.name')}</Text>
          <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t('workers.namePlaceholder')} placeholderTextColor={theme.colors.textMuted} />
          <Text style={s.fieldLabel}>{t('workers.phoneOptional')}</Text>
          <TextInput style={s.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XX XXX XXX" placeholderTextColor={theme.colors.textMuted} />
          <Text style={s.fieldLabel}>{t('workers.wageType')}</Text>
          <View style={s.wageGrid}>
            {WAGE_TYPES.map((wt) => (
              <TouchableOpacity key={wt} style={[s.wageBtn, wageType === wt && s.wageBtnActive]} onPress={() => setWageType(wt)}>
                <Text style={[s.wageText, wageType === wt && s.wageTextActive]}>{t(`workers.wage.${wt}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.fieldLabel}>{t(`workers.rateLabel.${wageType}`)}</Text>
          <TextInput style={s.input} value={wageRate} onChangeText={setWageRate} keyboardType="decimal-pad" placeholder="0 TZS" placeholderTextColor={theme.colors.textMuted} />
          {error ? <Text style={s.error}>{t(error)}</Text> : null}
          <TouchableOpacity style={[s.primaryBtn, saving && s.btnDisabled]} disabled={saving} onPress={() => void save()}>
            <Text style={s.primaryBtnText}>{saving ? t('common.saving') : t('common.save')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

type WorkerAction = 'labor' | 'advance' | 'pay' | null;

function WorkerDetailModal({ farmId, worker, onClose, onChanged }: { farmId: string; worker: Worker; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [action, setAction] = useState<WorkerAction>(null);
  const summaryQuery = useQuery({ queryKey: ['worker-summary', farmId, worker.id], queryFn: () => workersApi.summary(farmId, worker.id) });
  const sum = summaryQuery.data;

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['worker-summary', farmId, worker.id] });
    void qc.invalidateQueries({ queryKey: ['workers', farmId] });
    onChanged();
  }

  function confirmDelete() {
    Alert.alert(t('workers.deleteWorker'), t('workers.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void workersApi.remove(farmId, worker.id).then(() => { onClose(); onChanged(); }) },
    ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}><View style={s.backdrop} /></TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '90%' }]}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.handle} />
          <Text style={s.sheetTitle}>{worker.name}</Text>
          <Text style={s.subtle}>{t(`workers.wage.${worker.wage_type}`)} · {fmtMoney(worker.wage_rate, worker.currency)}{worker.phone ? ` · ${worker.phone}` : ''}</Text>

          {summaryQuery.isLoading ? (
            <View style={{ marginTop: 12 }}><SkeletonCard /></View>
          ) : sum ? (
            <View style={[s.statGrid, { marginTop: 12 }]}>
              <View style={s.statCell}><Text style={s.statLabel}>{t('workers.earned')}</Text><Text style={s.statValue}>{fmtMoney(sum.earned_total)}</Text></View>
              <View style={s.statCell}><Text style={s.statLabel}>{t('workers.paid')}</Text><Text style={s.statValue}>{fmtMoney(sum.paid_total)}</Text></View>
              <View style={s.statCell}><Text style={s.statLabel}>{t('workers.advances')}</Text><Text style={s.statValue}>{fmtMoney(sum.advances_total)}</Text></View>
              <View style={s.statCell}><Text style={s.statLabel}>{t('workers.unpaid')}</Text><Text style={[s.statValue, { color: sum.unpaid_balance > 0 ? theme.colors.warning : theme.colors.primary }]}>{fmtMoney(sum.unpaid_balance)}</Text></View>
            </View>
          ) : null}

          <View style={s.actionRow}>
            {worker.wage_type !== 'monthly' ? (
              <TouchableOpacity style={s.actionBtn} onPress={() => setAction('labor')}>
                <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
                <Text style={s.actionText}>{t('workers.logLabor')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={s.actionBtn} onPress={() => setAction('advance')}>
              <Ionicons name="arrow-up-circle-outline" size={18} color={theme.colors.primary} />
              <Text style={s.actionText}>{t('workers.giveAdvance')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => setAction('pay')}>
              <Ionicons name="cash-outline" size={18} color={theme.colors.primary} />
              <Text style={s.actionText}>{t('workers.pay')}</Text>
            </TouchableOpacity>
          </View>

          {action === 'labor' ? (
            <LaborForm farmId={farmId} worker={worker} onDone={() => { setAction(null); refresh(); }} />
          ) : action === 'advance' ? (
            <AmountForm
              titleKey="workers.giveAdvance"
              onSubmit={(amount) => workersApi.giveAdvance(farmId, worker.id, { amount, date: todayIso() })}
              onDone={() => { setAction(null); refresh(); }}
            />
          ) : action === 'pay' ? (
            <AmountForm
              titleKey="workers.pay"
              defaultAmount={sum?.unpaid_balance ?? 0}
              onSubmit={(amount) => workersApi.pay(farmId, { worker_id: worker.id, amount, period_start: monthStartIso(), period_end: todayIso() })}
              onDone={() => { setAction(null); refresh(); }}
            />
          ) : null}

          <TouchableOpacity onPress={confirmDelete} style={s.deleteBtn}><Text style={s.deleteText}>{t('workers.deleteWorker')}</Text></TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

function LaborForm({ farmId, worker, onDone }: { farmId: string; worker: Worker; onDone: () => void }) {
  const { t } = useI18n();
  const isPiece = worker.wage_type === 'piece';
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const v = parseFloat(qty);
    if (!v || v <= 0) { setError('workers.errQty'); return; }
    setBusy(true);
    setError(null);
    try {
      await workersApi.logLabor(farmId, worker.id, {
        date: todayIso(),
        hours: isPiece ? undefined : v,
        pieces: isPiece ? v : undefined,
        notes: notes.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'workers.errSave');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.inlineForm}>
      <Text style={s.fieldLabel}>{isPiece ? t('workers.pieces') : t('workers.hours')}</Text>
      <TextInput style={s.input} value={qty} onChangeText={setQty} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
      <Text style={s.fieldLabel}>{t('workers.notesOptional')}</Text>
      <TextInput style={s.input} value={notes} onChangeText={setNotes} placeholder={t('workers.notesPlaceholder')} placeholderTextColor={theme.colors.textMuted} />
      {error ? <Text style={s.error}>{t(error)}</Text> : null}
      <TouchableOpacity style={[s.primaryBtn, busy && s.btnDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={s.primaryBtnText}>{busy ? t('common.saving') : t('workers.logLabor')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function AmountForm({
  titleKey,
  defaultAmount,
  onSubmit,
  onDone,
}: {
  titleKey: string;
  defaultAmount?: number;
  onSubmit: (amount: number) => Promise<unknown>;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const v = parseFloat(amount);
    if (!v || v <= 0) { setError('workers.errAmount'); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(v);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'workers.errSave');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.inlineForm}>
      <Text style={s.fieldLabel}>{t('workers.amount')}</Text>
      <TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0 TZS" placeholderTextColor={theme.colors.textMuted} />
      {error ? <Text style={s.error}>{t(error)}</Text> : null}
      <TouchableOpacity style={[s.primaryBtn, busy && s.btnDisabled]} disabled={busy} onPress={() => void submit()}>
        <Text style={s.primaryBtnText}>{busy ? t('common.saving') : t(titleKey)}</Text>
      </TouchableOpacity>
    </View>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary + '18', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: theme.colors.primary },
  workerName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCell: { width: '47%', backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 12 },
  statLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  statValue: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  actionBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  actionText: { fontSize: 11, fontWeight: '700', color: theme.colors.text, textAlign: 'center' },
  inlineForm: { marginTop: 14, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '90%', backgroundColor: theme.colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginTop: 10 },
  input: { height: 46, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, paddingHorizontal: 14, fontSize: 14, color: theme.colors.text, marginTop: 4 },
  wageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  wageBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  wageBtnActive: { borderColor: theme.colors.primary, backgroundColor: '#eaf8ef' },
  wageText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  wageTextActive: { color: theme.colors.primary },
  primaryBtn: { marginTop: 14, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { backgroundColor: theme.colors.disabled },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  deleteBtn: { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  deleteText: { color: theme.colors.danger, fontWeight: '700', fontSize: 14 },
  error: { color: theme.colors.danger, fontSize: 13, marginTop: 6 },
});
