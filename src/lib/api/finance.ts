// Finance ("wealth") API — talks to the same backend farm_manager finance routes
// the web app uses, so mobile reads/writes the one ledger:
//   GET            /api/farms/{farm_id}/finance/summary
//   GET|POST       /api/farms/{farm_id}/finance/records
//   GET            /api/farms/{farm_id}/budgets[/{id}/items]
//   GET|POST       /api/farms/{farm_id}/loans[/{id}/repayments]
import { apiRequest } from '@/lib/api/client';
import type {
  Budget,
  BudgetLineItem,
  Buyer,
  BuyerType,
  FarmLoan,
  FinanceRecord,
  FinanceSummary,
  FinanceType,
  LoanRepayment,
  LoanType,
  PaymentMethod,
  Sale,
  SalesSummary,
} from '@/features/finance/types';

/** Unwrap the backend `{ success, data }` envelope (or a bare payload). */
function unwrap<T>(payload: T | { success?: boolean; data?: T }): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data?: T }).data as T;
  }
  return payload as T;
}

function query(params: Record<string, string | number | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

type RecordFilters = {
  type?: FinanceType;
  from?: string;
  to?: string;
  plot_id?: string;
  journey_id?: string;
};

export const financeApi = {
  summary(
    farmId: string,
    filters?: { from?: string; to?: string; plot_id?: string; journey_id?: string },
  ): Promise<FinanceSummary> {
    return apiRequest<FinanceSummary | { data?: FinanceSummary }>(
      `/api/farms/${farmId}/finance/summary${query({ ...filters })}`,
      { method: 'GET', auth: true },
    ).then(unwrap);
  },

  listRecords(farmId: string, filters?: RecordFilters): Promise<FinanceRecord[]> {
    return apiRequest<FinanceRecord[] | { data?: FinanceRecord[] }>(
      `/api/farms/${farmId}/finance/records${query({ ...filters, limit: 500 })}`,
      { method: 'GET', auth: true },
    ).then((p) => unwrap(p) ?? []);
  },

  createRecord(
    farmId: string,
    input: {
      type: FinanceType;
      category_id: string;
      description: string;
      amount: number;
      date: string;
      currency?: string;
      plot_id?: string | null;
      journey_id?: string | null;
      worker_id?: string | null;
      payment_method?: PaymentMethod;
      receipt_url?: string | null;
      notes?: string;
    },
  ): Promise<FinanceRecord> {
    return apiRequest<FinanceRecord | { data?: FinanceRecord }>(
      `/api/farms/${farmId}/finance/records`,
      { method: 'POST', auth: true, body: JSON.stringify({ ...input, amount: Math.round(input.amount) }) },
    ).then(unwrap);
  },

  updateRecord(
    farmId: string,
    recordId: string,
    patch: Partial<{
      type: FinanceType;
      category_id: string;
      description: string;
      amount: number;
      date: string;
      plot_id: string | null;
      journey_id: string | null;
      payment_method: PaymentMethod;
      receipt_url: string | null;
      notes: string;
    }>,
  ): Promise<FinanceRecord> {
    const body = { ...patch, ...(patch.amount != null ? { amount: Math.round(patch.amount) } : {}) };
    return apiRequest<FinanceRecord | { data?: FinanceRecord }>(
      `/api/farms/${farmId}/finance/records/${recordId}`,
      { method: 'PATCH', auth: true, body: JSON.stringify(body) },
    ).then(unwrap);
  },

  deleteRecord(farmId: string, recordId: string): Promise<unknown> {
    return apiRequest(`/api/farms/${farmId}/finance/records/${recordId}`, {
      method: 'DELETE',
      auth: true,
    });
  },

  listBudgets(farmId: string): Promise<Budget[]> {
    return apiRequest<Budget[] | { data?: Budget[] }>(`/api/farms/${farmId}/budgets`, {
      method: 'GET',
      auth: true,
    }).then((p) => unwrap(p) ?? []);
  },

  createBudget(
    farmId: string,
    input: { name: string; season_name?: string; season_year?: number; journey_id?: string | null; plot_id?: string | null; currency?: string; status?: string },
  ): Promise<Budget> {
    return apiRequest<Budget | { data?: Budget }>(`/api/farms/${farmId}/budgets`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }).then(unwrap);
  },

  listBudgetItems(farmId: string, budgetId: string): Promise<BudgetLineItem[]> {
    return apiRequest<BudgetLineItem[] | { data?: BudgetLineItem[] }>(
      `/api/farms/${farmId}/budgets/${budgetId}/items`,
      { method: 'GET', auth: true },
    ).then((p) => unwrap(p) ?? []);
  },

  createBudgetItem(
    farmId: string,
    budgetId: string,
    input: { category_id: string; description: string; estimated_amount: number; notes?: string },
  ): Promise<BudgetLineItem> {
    return apiRequest<BudgetLineItem | { data?: BudgetLineItem }>(
      `/api/farms/${farmId}/budgets/${budgetId}/items`,
      { method: 'POST', auth: true, body: JSON.stringify({ ...input, estimated_amount: Math.round(input.estimated_amount) }) },
    ).then(unwrap);
  },

  updateBudgetItem(
    farmId: string,
    budgetId: string,
    itemId: string,
    patch: Partial<{ category_id: string; description: string; estimated_amount: number; status: string; notes: string }>,
  ): Promise<BudgetLineItem> {
    const body = { ...patch, ...(patch.estimated_amount != null ? { estimated_amount: Math.round(patch.estimated_amount) } : {}) };
    return apiRequest<BudgetLineItem | { data?: BudgetLineItem }>(
      `/api/farms/${farmId}/budgets/${budgetId}/items/${itemId}`,
      { method: 'PATCH', auth: true, body: JSON.stringify(body) },
    ).then(unwrap);
  },

  deleteBudgetItem(farmId: string, budgetId: string, itemId: string): Promise<unknown> {
    return apiRequest(`/api/farms/${farmId}/budgets/${budgetId}/items/${itemId}`, {
      method: 'DELETE',
      auth: true,
    });
  },

  listLoans(farmId: string, status?: string): Promise<FarmLoan[]> {
    return apiRequest<FarmLoan[] | { data?: FarmLoan[] }>(
      `/api/farms/${farmId}/loans${query({ status })}`,
      { method: 'GET', auth: true },
    ).then((p) => unwrap(p) ?? []);
  },

  createLoan(
    farmId: string,
    input: {
      lender_name: string;
      loan_type: LoanType;
      principal_amount: number;
      total_payable?: number;
      interest_rate?: number;
      interest_type?: 'flat' | 'reducing_balance';
      term_months?: number;
      currency?: string;
      disbursed_date: string;
      due_date?: string | null;
      purpose?: string | null;
      notes?: string | null;
    },
  ): Promise<FarmLoan> {
    return apiRequest<FarmLoan | { data?: FarmLoan }>(`/api/farms/${farmId}/loans`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }).then(unwrap);
  },

  listLoanRepayments(farmId: string, loanId: string): Promise<LoanRepayment[]> {
    return apiRequest<LoanRepayment[] | { data?: LoanRepayment[] }>(
      `/api/farms/${farmId}/loans/${loanId}/repayments`,
      { method: 'GET', auth: true },
    ).then((p) => unwrap(p) ?? []);
  },

  recordLoanRepayment(
    farmId: string,
    loanId: string,
    input: {
      amount: number;
      interest_amount?: number;
      date: string;
      payment_method?: PaymentMethod;
      notes?: string | null;
    },
  ): Promise<{ loan: FarmLoan; repayment: LoanRepayment }> {
    return apiRequest<{ loan: FarmLoan; repayment: LoanRepayment } | { data?: { loan: FarmLoan; repayment: LoanRepayment } }>(
      `/api/farms/${farmId}/loans/${loanId}/repayments`,
      { method: 'POST', auth: true, body: JSON.stringify({ ...input, amount: Math.round(input.amount) }) },
    ).then(unwrap);
  },
};

// ─── Sales / "money owed" (receivables) ──────────────────────────────────────
// Backed by the `sales` router: buyers, sales (deliveries), and sale payments.
export const salesApi = {
  listBuyers(farmId: string): Promise<Buyer[]> {
    return apiRequest<Buyer[] | { data?: Buyer[] }>(`/api/farms/${farmId}/buyers`, {
      method: 'GET',
      auth: true,
    }).then((p) => unwrap(p) ?? []);
  },

  createBuyer(
    farmId: string,
    input: { name: string; buyer_type?: BuyerType; phone?: string; location?: string },
  ): Promise<Buyer> {
    return apiRequest<Buyer | { data?: Buyer }>(`/api/farms/${farmId}/buyers`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }).then(unwrap);
  },

  summary(farmId: string): Promise<SalesSummary> {
    return apiRequest<SalesSummary | { data?: SalesSummary }>(
      `/api/farms/${farmId}/sales/summary`,
      { method: 'GET', auth: true },
    ).then(unwrap);
  },

  listSales(farmId: string, paymentStatus?: string): Promise<Sale[]> {
    return apiRequest<Sale[] | { data?: Sale[] }>(
      `/api/farms/${farmId}/sales${query({ payment_status: paymentStatus })}`,
      { method: 'GET', auth: true },
    ).then((p) => unwrap(p) ?? []);
  },

  createSale(
    farmId: string,
    input: {
      buyer_id?: string | null;
      crop_name?: string;
      quantity: number;
      unit?: string;
      unit_price: number;
      amount_received?: number;
      payment_method?: string;
      date: string;
      journey_id?: string | null;
      plot_id?: string | null;
      notes?: string;
    },
  ): Promise<Sale> {
    return apiRequest<Sale | { data?: Sale }>(`/api/farms/${farmId}/sales`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ ...input, unit_price: Math.round(input.unit_price) }),
    }).then(unwrap);
  },

  recordSalePayment(
    farmId: string,
    saleId: string,
    input: { amount: number; date: string; payment_method?: string; notes?: string },
  ): Promise<Sale> {
    return apiRequest<Sale | { data?: Sale }>(
      `/api/farms/${farmId}/sales/${saleId}/payments`,
      { method: 'POST', auth: true, body: JSON.stringify({ ...input, amount: Math.round(input.amount) }) },
    ).then(unwrap);
  },
};
