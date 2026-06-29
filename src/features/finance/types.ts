// Finance ("wealth") domain types — mirror the backend farm_manager finance
// shapes (and the web `lib/farm-manager-types.ts`) so the mobile module reads the
// same ledger the web app does.

export type FinanceType = 'expense' | 'income' | 'financing_inflow' | 'financing_outflow';
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'credit' | 'in_kind';

export type BudgetStatus = 'planning' | 'active' | 'completed' | 'archived';
export type BudgetItemStatus = 'planned' | 'paid' | 'overdue' | 'cancelled';

export type LoanStatus = 'active' | 'paid' | 'restructured' | 'defaulted';
export type LoanType =
  | 'input_loan'
  | 'seasonal_loan'
  | 'equipment_loan'
  | 'emergency_loan'
  | 'other';

export interface Budget {
  id: string;
  farm_id: string;
  journey_id?: string | null;
  plot_id?: string | null;
  name: string;
  season_name?: string;
  season_year?: number;
  currency: string;
  status: BudgetStatus;
  total_estimated_expense: number;
  total_actual_expense: number;
  total_estimated_income: number;
  total_actual_income: number;
  expected_yield?: number | null;
  expected_yield_unit?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BudgetLineItem {
  id: string;
  budget_id: string;
  category_id: string;
  description: string;
  estimated_amount: number;
  actual_amount: number;
  date_planned?: string | null;
  date_actual?: string | null;
  status: BudgetItemStatus;
  notes?: string;
}

export interface FinanceRecord {
  id: string;
  farm_id: string;
  type: FinanceType;
  category_id: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  plot_id?: string | null;
  journey_id?: string | null;
  budget_item_id?: string | null;
  worker_id?: string | null;
  log_id?: string | null;
  payment_method: PaymentMethod;
  receipt_url?: string | null;
  notes?: string;
  created_at?: string;
}

export interface FinanceSummary {
  total_expenses: number;
  total_income: number;
  profit_loss: number;
  by_category: { category_id: string; type: FinanceType; amount: number }[];
  by_plot: { plot_id: string | null; type: FinanceType; amount: number }[];
  by_month: { month: string; expenses: number; income: number }[];
  budget_variance: number;
  records_count: number;
  financing_inflows?: number;
  financing_outflows?: number;
  net_cash_change?: number;
  outstanding_debt?: number;
}

export interface FarmLoan {
  id: string;
  farm_id: string;
  budget_id?: string | null;
  lender_name: string;
  loan_type: LoanType;
  principal_amount: number;
  total_payable: number;
  amount_repaid: number;
  outstanding_balance: number;
  outstanding_principal: number;
  interest_paid: number;
  interest_rate: number;
  interest_type: 'flat' | 'reducing_balance';
  term_months?: number | null;
  currency: string;
  disbursed_date: string;
  due_date?: string | null;
  status: LoanStatus;
  purpose?: string | null;
  notes?: string | null;
  repayments_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface LoanRepayment {
  id: string;
  loan_id: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  date: string;
  payment_method: PaymentMethod;
  notes?: string | null;
  created_at?: string;
}

// ─── Sales / "money owed" (receivables) ──────────────────────────────────────

export type BuyerType = 'trader' | 'processor' | 'market' | 'cooperative' | 'individual' | 'other';
export type SalePaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface Buyer {
  id: string;
  farm_id: string;
  name: string;
  buyer_type: BuyerType;
  phone?: string | null;
  email?: string | null;
  location?: string | null;
  notes?: string | null;
}

export interface Sale {
  id: string;
  farm_id: string;
  buyer_id?: string | null;
  buyer_name?: string | null;
  contract_id?: string | null;
  journey_id?: string | null;
  plot_id?: string | null;
  crop_name?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  amount_received: number;
  outstanding: number;
  payment_status: SalePaymentStatus;
  payment_method?: string | null;
  date: string;
  notes?: string | null;
  created_at?: string;
}

export interface SalesSummary {
  total_sold_value: number;
  total_received: number;
  total_outstanding: number;
  total_quantity: number;
  sale_count: number;
  by_buyer: { buyer_id: string | null; buyer_name: string; sold_value: number; received: number; outstanding: number }[];
  by_crop: { crop_name: string; quantity: number; sold_value: number }[];
}
