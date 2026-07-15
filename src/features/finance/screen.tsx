import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal as NativeModal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  type ModalProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/core/card';
import { Screen } from '@/components/layout/screen';
import { SkeletonCard } from '@/components/state/skeleton';
import { financeApi } from '@/lib/api/finance';
import { mobileApi } from '@/lib/api/mobile';
import { farmRepository } from '@/lib/db/repositories';
import type { FarmRecord, JourneyRecord, PlotRecord } from '@/lib/domain/types';
import type { Budget, FarmLoan, FinanceRecord, FinanceType, LoanType } from '@/features/finance/types';
import { SalesTab } from '@/features/finance/sales-tab';
import { catLabel, fmtDate, fmtMoney, todayIso } from '@/features/finance/helpers';
import { toAbsoluteUrl } from '@/lib/utils/url';
import { useI18n } from '@/lib/i18n';
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

type FinanceTab = 'overview' | 'records' | 'owed' | 'loans' | 'budget';

const TABS: { id: FinanceTab; labelKey: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'overview', labelKey: 'finance.tabOverview', icon: 'pie-chart-outline' },
  { id: 'records', labelKey: 'finance.tabRecords', icon: 'receipt-outline' },
  { id: 'owed', labelKey: 'finance.tabOwed', icon: 'hand-left-outline' },
  { id: 'loans', labelKey: 'finance.tabLoans', icon: 'cash-outline' },
  { id: 'budget', labelKey: 'finance.tabBudget', icon: 'wallet-outline' },
];

// ─── Overview tab ───────────────────────────────────────────────────────────

function OverviewTab({ farmId }: { farmId: string }) {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['finance-summary', farmId],
    queryFn: () => financeApi.summary(farmId),
  });

  if (isLoading) return <SkeletonCard />;
  if (isError || !data) {
    return (
      <Card>
        <Text style={s.muted}>{t('finance.couldNotLoad')}</Text>
        <TouchableOpacity onPress={() => void refetch()}><Text style={s.link}>{t('common.retry')}</Text></TouchableOpacity>
      </Card>
    );
  }

  const profit = data.profit_loss ?? data.total_income - data.total_expenses;
  const expenseCats = data.by_category.filter((c) => c.type === 'expense' && c.amount > 0);
  const maxCat = Math.max(1, ...expenseCats.map((c) => c.amount));
  const months = (data.by_month ?? []).slice(-6);
  const maxMonth = Math.max(1, ...months.map((m) => Math.max(m.expenses, m.income)));

  return (
    <View style={{ gap: 12 }}>
      <View style={s.statRow}>
        <View style={[s.statCard, { backgroundColor: '#eaf8ef' }]}>
          <Text style={s.statLabel}>{t('finance.income')}</Text>
          <Text style={[s.statValue, { color: theme.colors.primary }]}>{fmtMoney(data.total_income)}</Text>
        </View>
        <View style={[s.statCard, { backgroundColor: '#fdecea' }]}>
          <Text style={s.statLabel}>{t('finance.expenses')}</Text>
          <Text style={[s.statValue, { color: theme.colors.danger }]}>{fmtMoney(data.total_expenses)}</Text>
        </View>
      </View>
      <Card>
        <Text style={s.statLabel}>{t('finance.profitLoss')}</Text>
        <Text style={[s.bigValue, { color: profit >= 0 ? theme.colors.primary : theme.colors.danger }]}>{fmtMoney(profit)}</Text>
        {typeof data.outstanding_debt === 'number' && data.outstanding_debt > 0 ? (
          <Text style={s.muted}>{t('finance.outstandingDebt')}: {fmtMoney(data.outstanding_debt)}</Text>
        ) : null}
        <Text style={s.subtle}>{t('finance.recordsCount', { n: data.records_count })}</Text>
      </Card>

      {months.length > 0 ? (
        <Card>
          <Text style={s.cardTitle}>{t('finance.monthlyTrend')}</Text>
          <View style={s.chartRow}>
            {months.map((m) => (
              <View key={m.month} style={s.chartCol}>
                <View style={s.chartBars}>
                  <View style={[s.chartBar, { height: `${Math.round((m.income / maxMonth) * 100)}%` as `${number}%`, backgroundColor: theme.colors.primary }]} />
                  <View style={[s.chartBar, { height: `${Math.round((m.expenses / maxMonth) * 100)}%` as `${number}%`, backgroundColor: theme.colors.danger }]} />
                </View>
                <Text style={s.chartLabel}>{m.month.slice(5)}</Text>
              </View>
            ))}
          </View>
          <View style={s.legendRow}>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: theme.colors.primary }]} /><Text style={s.subtle}>{t('finance.income')}</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: theme.colors.danger }]} /><Text style={s.subtle}>{t('finance.expenses')}</Text></View>
          </View>
        </Card>
      ) : null}

      {expenseCats.length > 0 ? (
        <Card>
          <Text style={s.cardTitle}>{t('finance.spendingByCategory')}</Text>
          <View style={{ gap: 8, marginTop: 8 }}>
            {expenseCats.sort((a, b) => b.amount - a.amount).map((c) => (
              <View key={c.category_id} style={{ gap: 4 }}>
                <View style={s.rowBetween}>
                  <Text style={s.catName}>{catLabel(c.category_id)}</Text>
                  <Text style={s.catAmt}>{fmtMoney(c.amount)}</Text>
                </View>
                <View style={s.barTrack}><View style={[s.barFill, { width: `${Math.round((c.amount / maxCat) * 100)}%` as `${number}%` }]} /></View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

// ─── Records tab ─────────────────────────────────────────────────────────────

function RecordsTab({ farmId }: { farmId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FinanceRecord | 'new' | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['finance-records', farmId],
    queryFn: () => financeApi.listRecords(farmId),
  });
  const records = data ?? [];

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['finance-records', farmId] });
    void qc.invalidateQueries({ queryKey: ['finance-summary', farmId] });
  }

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity style={s.addBtn} onPress={() => setEditing('new')} activeOpacity={0.85}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={s.addBtnText}>{t('finance.addRecord')}</Text>
      </TouchableOpacity>

      {isLoading ? (
        <SkeletonCard />
      ) : records.length === 0 ? (
        <Card><Text style={s.muted}>{t('finance.noRecords')}</Text></Card>
      ) : (
        records.map((r) => (
          <TouchableOpacity key={r.id} activeOpacity={0.7} onPress={() => setEditing(r)}>
            <RecordRow record={r} />
          </TouchableOpacity>
        ))
      )}

      {editing ? (
        <RecordSheet
          farmId={farmId}
          record={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); invalidate(); }}
        />
      ) : null}
    </View>
  );
}

function RecordRow({ record }: { record: FinanceRecord }) {
  const income = record.type === 'income' || record.type === 'financing_inflow';
  return (
    <View style={s.recordRow}>
      <View style={[s.recordIcon, { backgroundColor: income ? '#eaf8ef' : '#fdecea' }]}>
        <Ionicons name={income ? 'arrow-down-outline' : 'arrow-up-outline'} size={16} color={income ? theme.colors.primary : theme.colors.danger} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.recordDesc} numberOfLines={1}>{record.description || catLabel(record.category_id)}</Text>
        <Text style={s.subtle}>{catLabel(record.category_id)} · {fmtDate(record.date)}{record.receipt_url ? ' · 📎' : ''}</Text>
      </View>
      <Text style={[s.recordAmt, { color: income ? theme.colors.primary : theme.colors.danger }]}>
        {income ? '+' : '-'}{fmtMoney(record.amount, record.currency)}
      </Text>
    </View>
  );
}

const RECORD_TYPES: FinanceType[] = ['expense', 'income'];

function RecordSheet({
  farmId,
  record,
  onClose,
  onSaved,
}: {
  farmId: string;
  record: FinanceRecord | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const isEdit = !!record;
  const [type, setType] = useState<FinanceType>(record?.type ?? 'expense');
  const [category, setCategory] = useState(record?.category_id ?? 'other');
  const [amount, setAmount] = useState(record ? String(record.amount) : '');
  const [description, setDescription] = useState(record?.description ?? '');
  const [plotId, setPlotId] = useState<string | null>(record?.plot_id ?? null);
  const [journeyId, setJourneyId] = useState<string | null>(record?.journey_id ?? null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(record?.receipt_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plotsQuery = useQuery({ queryKey: ['finance-plots', farmId], queryFn: () => mobileApi.listFarmPlots(farmId).catch(() => [] as PlotRecord[]) });
  const journeysQuery = useQuery({ queryKey: ['finance-journeys', farmId], queryFn: () => mobileApi.listFarmJourneys(farmId).catch(() => [] as JourneyRecord[]) });
  const plots = plotsQuery.data ?? [];
  const journeys = journeysQuery.data ?? [];

  const categories = type === 'income'
    ? ['harvest_sale', 'sale', 'other']
    : ['seed', 'fertilizer', 'pesticide', 'labor', 'land_preparation', 'transport', 'equipment', 'postharvest', 'other'];

  async function attachReceipt() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('finance.errPhotoPerm'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const uploaded = await mobileApi.uploadImage(asset.uri, asset.mimeType ?? 'image/jpeg', 'logs');
      if (uploaded?.url) setReceiptUrl(uploaded.url);
    } catch {
      setError('finance.errReceipt');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const value = parseFloat(amount);
    if (!value || value <= 0) { setError('finance.errAmount'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        type,
        category_id: category,
        description: description.trim() || catLabel(category),
        amount: value,
        plot_id: plotId,
        journey_id: journeyId,
        receipt_url: receiptUrl,
      };
      if (record) {
        await financeApi.updateRecord(farmId, record.id, payload);
      } else {
        await financeApi.createRecord(farmId, { ...payload, date: todayIso(), payment_method: 'cash' });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'finance.errSave');
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!record) return;
    Alert.alert(t('finance.deleteRecord'), t('finance.deleteRecordConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void financeApi.deleteRecord(farmId, record.id).then(onSaved).catch(() => setError('finance.errSave'));
        },
      },
    ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={saving ? undefined : onClose}>
        <View style={s.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.handle} />
          <Text style={s.sheetTitle}>{isEdit ? t('finance.editRecord') : t('finance.addRecord')}</Text>

          <View style={s.segment}>
            {RECORD_TYPES.map((rt) => (
              <TouchableOpacity
                key={rt}
                style={[s.segmentBtn, type === rt && s.segmentBtnActive]}
                onPress={() => { setType(rt); setCategory(rt === 'income' ? 'harvest_sale' : 'other'); }}
              >
                <Text style={[s.segmentText, type === rt && s.segmentTextActive]}>{t(rt === 'income' ? 'finance.income' : 'finance.expense')}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.fieldLabel}>{t('finance.category')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            {categories.map((c) => (
              <TouchableOpacity key={c} style={[s.chip, category === c && s.chipActive]} onPress={() => setCategory(c)}>
                <Text style={[s.chipText, category === c && s.chipTextActive]}>{catLabel(c)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={s.fieldLabel}>{t('finance.amount')}</Text>
          <TextInput style={s.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0 TZS" placeholderTextColor={theme.colors.textMuted} />

          <Text style={s.fieldLabel}>{t('finance.descriptionOptional')}</Text>
          <TextInput style={s.input} value={description} onChangeText={setDescription} placeholder={t('finance.descriptionPlaceholder')} placeholderTextColor={theme.colors.textMuted} />

          {plots.length > 0 ? (
            <>
              <Text style={s.fieldLabel}>{t('finance.plotOptional')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                <TouchableOpacity style={[s.chip, !plotId && s.chipActive]} onPress={() => setPlotId(null)}>
                  <Text style={[s.chipText, !plotId && s.chipTextActive]}>{t('finance.none')}</Text>
                </TouchableOpacity>
                {plots.map((p) => (
                  <TouchableOpacity key={p.id} style={[s.chip, plotId === p.id && s.chipActive]} onPress={() => setPlotId(p.id)}>
                    <Text style={[s.chipText, plotId === p.id && s.chipTextActive]}>{p.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : null}

          {journeys.length > 0 ? (
            <>
              <Text style={s.fieldLabel}>{t('finance.journeyOptional')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                <TouchableOpacity style={[s.chip, !journeyId && s.chipActive]} onPress={() => setJourneyId(null)}>
                  <Text style={[s.chipText, !journeyId && s.chipTextActive]}>{t('finance.none')}</Text>
                </TouchableOpacity>
                {journeys.map((j) => (
                  <TouchableOpacity key={j.id} style={[s.chip, journeyId === j.id && s.chipActive]} onPress={() => setJourneyId(j.id)}>
                    <Text style={[s.chipText, journeyId === j.id && s.chipTextActive]}>{j.common_name ?? j.crop_name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : null}

          <Text style={s.fieldLabel}>{t('finance.receipt')}</Text>
          <View style={s.receiptRow}>
            {receiptUrl ? (
              <Image source={{ uri: toAbsoluteUrl(receiptUrl) ?? receiptUrl }} style={s.receiptThumb} />
            ) : null}
            <TouchableOpacity style={s.receiptBtn} disabled={uploading} onPress={() => void attachReceipt()}>
              <Ionicons name={receiptUrl ? 'swap-horizontal-outline' : 'image-outline'} size={16} color={theme.colors.text} />
              <Text style={s.receiptBtnText}>{uploading ? t('finance.uploading') : receiptUrl ? t('finance.replaceReceipt') : t('finance.attachReceipt')}</Text>
            </TouchableOpacity>
            {receiptUrl ? (
              <TouchableOpacity onPress={() => setReceiptUrl(null)} hitSlop={8}><Ionicons name="close-circle" size={20} color={theme.colors.textMuted} /></TouchableOpacity>
            ) : null}
          </View>

          {error ? <Text style={s.error}>{t(error)}</Text> : null}
          <TouchableOpacity style={[s.primaryBtn, saving && s.btnDisabled]} disabled={saving} onPress={() => void save()}>
            <Text style={s.primaryBtnText}>{saving ? t('common.saving') : t('common.save')}</Text>
          </TouchableOpacity>
          {isEdit ? (
            <TouchableOpacity onPress={confirmDelete} style={s.deleteBtn}><Text style={s.deleteText}>{t('finance.deleteRecord')}</Text></TouchableOpacity>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Loans tab ───────────────────────────────────────────────────────────────

const LOAN_TYPES: LoanType[] = ['input_loan', 'seasonal_loan', 'equipment_loan', 'emergency_loan', 'other'];

function LoansTab({ farmId }: { farmId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [repayLoan, setRepayLoan] = useState<FarmLoan | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['finance-loans', farmId], queryFn: () => financeApi.listLoans(farmId) });
  const loans = data ?? [];

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['finance-loans', farmId] });
    void qc.invalidateQueries({ queryKey: ['finance-summary', farmId] });
  }

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity style={s.addBtn} onPress={() => setAdding(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={s.addBtnText}>{t('finance.addLoan')}</Text>
      </TouchableOpacity>

      {isLoading ? (
        <SkeletonCard />
      ) : loans.length === 0 ? (
        <Card><Text style={s.muted}>{t('finance.noLoans')}</Text></Card>
      ) : (
        loans.map((loan) => (
          <Card key={loan.id}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>{loan.lender_name}</Text>
              <View style={[s.statusPill, loan.status === 'paid' && s.statusPillPaid]}>
                <Text style={[s.statusText, loan.status === 'paid' && s.statusTextPaid]}>{t(`finance.loanStatus.${loan.status}`)}</Text>
              </View>
            </View>
            <Text style={s.subtle}>{catLabel(loan.loan_type)} · {fmtDate(loan.disbursed_date)}</Text>
            <View style={[s.rowBetween, { marginTop: 8 }]}>
              <View><Text style={s.subtle}>{t('finance.outstanding')}</Text><Text style={s.fig}>{fmtMoney(loan.outstanding_balance, loan.currency)}</Text></View>
              <View><Text style={s.subtle}>{t('finance.repaid')}</Text><Text style={s.fig}>{fmtMoney(loan.amount_repaid, loan.currency)}</Text></View>
              <View><Text style={s.subtle}>{t('finance.payable')}</Text><Text style={s.fig}>{fmtMoney(loan.total_payable, loan.currency)}</Text></View>
            </View>
            {loan.status !== 'paid' ? (
              <TouchableOpacity style={s.outlineBtn} onPress={() => setRepayLoan(loan)}><Text style={s.outlineBtnText}>{t('finance.recordRepayment')}</Text></TouchableOpacity>
            ) : null}
          </Card>
        ))
      )}

      {adding ? <AddLoanSheet farmId={farmId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); invalidate(); }} /> : null}
      {repayLoan ? <RepayLoanSheet farmId={farmId} loan={repayLoan} onClose={() => setRepayLoan(null)} onSaved={() => { setRepayLoan(null); invalidate(); }} /> : null}
    </View>
  );
}

function AddLoanSheet({ farmId, onClose, onSaved }: { farmId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [lender, setLender] = useState('');
  const [loanType, setLoanType] = useState<LoanType>('seasonal_loan');
  const [principal, setPrincipal] = useState('');
  const [payable, setPayable] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const p = parseFloat(principal);
    if (!lender.trim()) { setError('finance.errLender'); return; }
    if (!p || p <= 0) { setError('finance.errAmount'); return; }
    setSaving(true);
    setError(null);
    try {
      await financeApi.createLoan(farmId, {
        lender_name: lender.trim(),
        loan_type: loanType,
        principal_amount: p,
        total_payable: parseFloat(payable) || p,
        disbursed_date: todayIso(),
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
      <TouchableWithoutFeedback onPress={saving ? undefined : onClose}><View style={s.backdrop} /></TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.handle} />
        <Text style={s.sheetTitle}>{t('finance.addLoan')}</Text>
        <Text style={s.fieldLabel}>{t('finance.lender')}</Text>
        <TextInput style={s.input} value={lender} onChangeText={setLender} placeholder={t('finance.lenderPlaceholder')} placeholderTextColor={theme.colors.textMuted} />
        <Text style={s.fieldLabel}>{t('finance.loanType')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {LOAN_TYPES.map((lt) => (
            <TouchableOpacity key={lt} style={[s.chip, loanType === lt && s.chipActive]} onPress={() => setLoanType(lt)}>
              <Text style={[s.chipText, loanType === lt && s.chipTextActive]}>{catLabel(lt)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={s.fieldLabel}>{t('finance.principal')}</Text>
        <TextInput style={s.input} value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" placeholder="0 TZS" placeholderTextColor={theme.colors.textMuted} />
        <Text style={s.fieldLabel}>{t('finance.totalPayable')}</Text>
        <TextInput style={s.input} value={payable} onChangeText={setPayable} keyboardType="decimal-pad" placeholder={t('finance.payableHint')} placeholderTextColor={theme.colors.textMuted} />
        {error ? <Text style={s.error}>{t(error)}</Text> : null}
        <TouchableOpacity style={[s.primaryBtn, saving && s.btnDisabled]} disabled={saving} onPress={() => void save()}>
          <Text style={s.primaryBtnText}>{saving ? t('common.saving') : t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function RepayLoanSheet({ farmId, loan, onClose, onSaved }: { farmId: string; loan: FarmLoan; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState(String(loan.outstanding_balance));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const value = parseFloat(amount);
    if (!value || value <= 0) { setError('finance.errAmount'); return; }
    setSaving(true);
    setError(null);
    try {
      await financeApi.recordLoanRepayment(farmId, loan.id, { amount: value, date: todayIso(), payment_method: 'cash' });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'finance.errSave');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={saving ? undefined : onClose}><View style={s.backdrop} /></TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.handle} />
        <Text style={s.sheetTitle}>{t('finance.recordRepayment')}</Text>
        <Text style={s.subtle}>{loan.lender_name} · {t('finance.outstanding')} {fmtMoney(loan.outstanding_balance, loan.currency)}</Text>
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

// ─── Budget tab (create + line items) ─────────────────────────────────────────

function BudgetTab({ farmId }: { farmId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openBudget, setOpenBudget] = useState<Budget | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['finance-budgets', farmId], queryFn: () => financeApi.listBudgets(farmId) });
  const budgets = data ?? [];

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['finance-budgets', farmId] });
  }

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity style={s.addBtn} onPress={() => setCreating(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={s.addBtnText}>{t('finance.newBudget')}</Text>
      </TouchableOpacity>

      {isLoading ? (
        <SkeletonCard />
      ) : budgets.length === 0 ? (
        <Card><Text style={s.muted}>{t('finance.noBudgets')}</Text></Card>
      ) : (
        budgets.map((b) => {
          const spent = b.total_actual_expense;
          const planned = b.total_estimated_expense || 1;
          const pct = Math.min(100, Math.round((spent / planned) * 100));
          return (
            <TouchableOpacity key={b.id} activeOpacity={0.8} onPress={() => setOpenBudget(b)}>
              <Card>
                <View style={s.rowBetween}>
                  <Text style={s.cardTitle}>{b.name}</Text>
                  <View style={s.statusPill}><Text style={s.statusText}>{t(`finance.budgetStatus.${b.status}`)}</Text></View>
                </View>
                <Text style={s.subtle}>{b.season_name ?? ''} {b.season_year ?? ''}</Text>
                <View style={[s.rowBetween, { marginTop: 8 }]}>
                  <Text style={s.subtle}>{t('finance.spentOfPlanned')}</Text>
                  <Text style={s.catAmt}>{fmtMoney(spent, b.currency)} / {fmtMoney(b.total_estimated_expense, b.currency)}</Text>
                </View>
                <View style={s.barTrack}><View style={[s.barFill, { width: `${pct}%` as `${number}%` }, pct >= 100 && { backgroundColor: theme.colors.danger }]} /></View>
                <Text style={[s.link, { marginTop: 8 }]}>{t('finance.manageItems')}</Text>
              </Card>
            </TouchableOpacity>
          );
        })
      )}

      {creating ? <CreateBudgetSheet farmId={farmId} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); invalidate(); }} /> : null}
      {openBudget ? (
        <BudgetDetailModal farmId={farmId} budget={openBudget} onClose={() => setOpenBudget(null)} onChanged={invalidate} />
      ) : null}
    </View>
  );
}

function CreateBudgetSheet({ farmId, onClose, onSaved }: { farmId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [season, setSeason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setError('finance.errBudgetName'); return; }
    setSaving(true);
    setError(null);
    try {
      await financeApi.createBudget(farmId, {
        name: name.trim(),
        season_name: season.trim() || undefined,
        season_year: new Date().getFullYear(),
        status: 'active',
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
      <TouchableWithoutFeedback onPress={saving ? undefined : onClose}><View style={s.backdrop} /></TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={s.handle} />
        <Text style={s.sheetTitle}>{t('finance.newBudget')}</Text>
        <Text style={s.fieldLabel}>{t('finance.budgetName')}</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} placeholder={t('finance.budgetNamePlaceholder')} placeholderTextColor={theme.colors.textMuted} />
        <Text style={s.fieldLabel}>{t('finance.seasonOptional')}</Text>
        <TextInput style={s.input} value={season} onChangeText={setSeason} placeholder={t('finance.seasonPlaceholder')} placeholderTextColor={theme.colors.textMuted} />
        {error ? <Text style={s.error}>{t(error)}</Text> : null}
        <TouchableOpacity style={[s.primaryBtn, saving && s.btnDisabled]} disabled={saving} onPress={() => void save()}>
          <Text style={s.primaryBtnText}>{saving ? t('common.saving') : t('common.save')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function BudgetDetailModal({ farmId, budget, onClose, onChanged }: { farmId: string; budget: Budget; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState('seed');
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['budget-items', farmId, budget.id],
    queryFn: () => financeApi.listBudgetItems(farmId, budget.id),
  });
  const items = data ?? [];

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['budget-items', farmId, budget.id] });
    onChanged();
  }

  const cats = ['seed', 'fertilizer', 'pesticide', 'labor', 'land_preparation', 'transport', 'equipment', 'postharvest', 'other'];

  async function addItem() {
    const value = parseFloat(amt);
    if (!value || value <= 0) return;
    setBusy(true);
    try {
      await financeApi.createBudgetItem(farmId, budget.id, { category_id: cat, description: desc.trim() || catLabel(cat), estimated_amount: value });
      setAdding(false); setDesc(''); setAmt('');
      refresh();
    } finally {
      setBusy(false);
    }
  }

  function deleteItem(itemId: string) {
    Alert.alert(t('finance.deleteItem'), t('finance.deleteItemConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => void financeApi.deleteBudgetItem(farmId, budget.id, itemId).then(refresh) },
    ]);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}><View style={s.backdrop} /></TouchableWithoutFeedback>
      <View style={[s.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '88%' }]}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.handle} />
          <Text style={s.sheetTitle}>{budget.name}</Text>
          <Text style={s.subtle}>{t('finance.lineItems')}</Text>

          {isLoading ? (
            <SkeletonCard />
          ) : items.length === 0 ? (
            <Text style={[s.muted, { marginTop: 10 }]}>{t('finance.noItems')}</Text>
          ) : (
            items.map((it) => (
              <View key={it.id} style={s.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.recordDesc}>{it.description || catLabel(it.category_id)}</Text>
                  <Text style={s.subtle}>{catLabel(it.category_id)}</Text>
                </View>
                <Text style={s.catAmt}>{fmtMoney(it.estimated_amount, budget.currency)}</Text>
                <TouchableOpacity onPress={() => deleteItem(it.id)} hitSlop={8} style={{ marginLeft: 10 }}>
                  <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))
          )}

          {adding ? (
            <View style={s.addItemBox}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                {cats.map((c) => (
                  <TouchableOpacity key={c} style={[s.chip, cat === c && s.chipActive]} onPress={() => setCat(c)}>
                    <Text style={[s.chipText, cat === c && s.chipTextActive]}>{catLabel(c)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TextInput style={s.input} value={desc} onChangeText={setDesc} placeholder={t('finance.descriptionPlaceholder')} placeholderTextColor={theme.colors.textMuted} />
              <TextInput style={s.input} value={amt} onChangeText={setAmt} keyboardType="decimal-pad" placeholder="0 TZS" placeholderTextColor={theme.colors.textMuted} />
              <TouchableOpacity style={[s.primaryBtn, busy && s.btnDisabled]} disabled={busy} onPress={() => void addItem()}>
                <Text style={s.primaryBtnText}>{busy ? t('common.saving') : t('finance.addItem')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[s.outlineBtn, { marginTop: 14 }]} onPress={() => setAdding(true)}>
              <Text style={s.outlineBtnText}>{t('finance.addItem')}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={onClose} style={{ marginTop: 14, alignItems: 'center' }}>
            <Text style={s.subtle}>{t('common.close')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Screen shell ────────────────────────────────────────────────────────────

export function FinanceScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<FinanceTab>('overview');
  const [switching, setSwitching] = useState(false);

  const farmsQuery = useQuery({
    queryKey: ['finance-farms'],
    queryFn: async () => {
      const farms = await mobileApi.listFarms().catch(() => [] as FarmRecord[]);
      const selected = await farmRepository.getSelectedFarmId().catch(() => null);
      return { farms, selected };
    },
  });
  const [overrideFarmId, setOverrideFarmId] = useState<string | null>(null);

  const farms = useMemo(() => farmsQuery.data?.farms ?? [], [farmsQuery.data?.farms]);
  const activeFarmId = useMemo(() => {
    if (overrideFarmId) return overrideFarmId;
    const sel = farmsQuery.data?.selected;
    if (sel && farms.some((f) => String(f.id) === String(sel))) return String(sel);
    return farms[0]?.id ? String(farms[0].id) : null;
  }, [overrideFarmId, farmsQuery.data?.selected, farms]);
  const activeFarm = farms.find((f) => String(f.id) === String(activeFarmId)) ?? null;

  return (
    <Screen contentContainerStyle={s.content}>
      <TouchableOpacity style={s.farmBar} onPress={() => farms.length > 1 && setSwitching(true)} activeOpacity={farms.length > 1 ? 0.7 : 1}>
        <Ionicons name="leaf-outline" size={16} color={theme.colors.primary} />
        <Text style={s.farmName} numberOfLines={1}>{activeFarm?.name ?? t('finance.noFarm')}</Text>
        {farms.length > 1 ? <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} /> : null}
      </TouchableOpacity>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabRow}>
        {TABS.map((tb) => (
          <TouchableOpacity key={tb.id} style={[s.tab, tab === tb.id && s.tabActive]} onPress={() => setTab(tb.id)}>
            <Ionicons name={tb.icon} size={15} color={tab === tb.id ? theme.colors.primary : theme.colors.textMuted} />
            <Text style={[s.tabText, tab === tb.id && s.tabTextActive]}>{t(tb.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {!activeFarmId ? (
        <Card><Text style={s.muted}>{t('finance.addFarmFirst')}</Text></Card>
      ) : tab === 'overview' ? (
        <OverviewTab farmId={activeFarmId} />
      ) : tab === 'records' ? (
        <RecordsTab farmId={activeFarmId} />
      ) : tab === 'owed' ? (
        <SalesTab farmId={activeFarmId} />
      ) : tab === 'loans' ? (
        <LoansTab farmId={activeFarmId} />
      ) : (
        <BudgetTab farmId={activeFarmId} />
      )}

      <Modal visible={switching} transparent animationType="fade" onRequestClose={() => setSwitching(false)}>
        <TouchableWithoutFeedback onPress={() => setSwitching(false)}><View style={s.modalOverlay} /></TouchableWithoutFeedback>
        <View style={s.switcher}>
          <Text style={s.sheetTitle}>{t('finance.selectFarm')}</Text>
          {farms.map((f) => (
            <TouchableOpacity key={f.id} style={s.switcherItem} onPress={() => { setOverrideFarmId(String(f.id)); setSwitching(false); }}>
              <Text style={[s.switcherText, String(f.id) === String(activeFarmId) && s.switcherTextActive]}>{f.name}</Text>
              {String(f.id) === String(activeFarmId) ? <Ionicons name="checkmark" size={16} color={theme.colors.primary} /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { gap: 12, paddingTop: 6, paddingBottom: 24 },
  farmBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255, 253, 247, 0.84)', borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 14, paddingVertical: 9 },
  farmName: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text },
  tabRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'rgba(255, 253, 247, 0.84)' },
  tabActive: { borderColor: theme.colors.primary, backgroundColor: '#eaf8ef' },
  tabText: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  tabTextActive: { color: theme.colors.primary },

  statRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderRadius: theme.radius.lg, padding: 14, gap: 4 },
  statLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  statValue: { fontSize: 18, fontWeight: '800' },
  bigValue: { fontSize: 26, fontWeight: '800', marginTop: 2 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  muted: { fontSize: 14, color: theme.colors.textMuted },
  subtle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  link: { color: theme.colors.primary, fontWeight: '700' },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  catName: { fontSize: 13, color: theme.colors.text },
  catAmt: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: 'hidden', marginTop: 4 },
  barFill: { height: '100%' as `${number}%`, backgroundColor: theme.colors.primary, borderRadius: 3 },

  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 110, marginTop: 12 },
  chartCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  chartBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  chartBar: { width: 8, borderRadius: 2, minHeight: 2 },
  chartLabel: { fontSize: 9, color: theme.colors.textMuted },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 10, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },

  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 12 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255, 253, 247, 0.86)', borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 12 },
  recordIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  recordDesc: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  recordAmt: { fontSize: 14, fontWeight: '800' },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
  addItemBox: { marginTop: 12, gap: 8, padding: 12, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: 'rgba(255, 253, 247, 0.86)' },

  fig: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  statusPill: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.pill, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: theme.colors.border },
  statusPillPaid: { backgroundColor: '#eaf8ef', borderColor: '#c7e7d2' },
  statusText: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  statusTextPaid: { color: theme.colors.primary },
  outlineBtn: { borderWidth: 1, borderColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 9, alignItems: 'center' },
  outlineBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 13 },

  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  receiptThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: theme.colors.surfaceMuted },
  receiptBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255, 253, 247, 0.86)' },
  receiptBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', backgroundColor: 'rgba(248, 247, 239, 0.96)', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginBottom: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginTop: 10 },
  input: { height: 46, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, paddingHorizontal: 14, fontSize: 14, color: theme.colors.text, marginTop: 4 },
  segment: { flexDirection: 'row', gap: 8, marginTop: 8 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, alignItems: 'center' },
  segmentBtnActive: { borderColor: theme.colors.primary, backgroundColor: '#eaf8ef' },
  segmentText: { fontSize: 14, fontWeight: '700', color: theme.colors.textMuted },
  segmentTextActive: { color: theme.colors.primary },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  chipActive: { borderColor: theme.colors.primary, backgroundColor: '#eaf8ef' },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  chipTextActive: { color: theme.colors.primary },
  primaryBtn: { marginTop: 14, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, paddingVertical: 14, alignItems: 'center' },
  btnDisabled: { backgroundColor: theme.colors.disabled },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  deleteBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  deleteText: { color: theme.colors.danger, fontWeight: '700', fontSize: 14 },
  error: { color: theme.colors.danger, fontSize: 13, marginTop: 6 },

  modalOverlay: { flex: 1, backgroundColor: theme.colors.overlay },
  switcher: { position: 'absolute', left: 20, right: 20, top: '30%', backgroundColor: 'rgba(255, 253, 247, 0.94)', borderRadius: 20, padding: 16, gap: 4 },
  switcherItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  switcherText: { fontSize: 15, color: theme.colors.text },
  switcherTextActive: { color: theme.colors.primary, fontWeight: '700' },
});
