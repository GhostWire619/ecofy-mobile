// Workers / team domain types — mirror the backend farm_manager worker routes.

export type WageType = 'daily' | 'hourly' | 'piece' | 'monthly';
export type WorkerStatus = 'active' | 'inactive';
export type WorkerKind = 'employee' | 'group';

export interface Worker {
  id: string;
  farm_id: string;
  name: string;
  phone?: string | null;
  role: string;
  kind: WorkerKind;
  group_size?: number | null;
  wage_type: WageType;
  wage_rate: number;
  currency: string;
  payment_method?: string | null;
  joined_at?: string | null;
  status: WorkerStatus;
  notes?: string | null;
  created_at?: string;
}

export interface WorkerSummary {
  worker: Worker;
  hours_total: number;
  pieces_total: number;
  earned_total: number;
  paid_total: number;
  advances_total: number;
  active_advances_total: number;
  unpaid_balance: number;
  last_activity_date?: string | null;
  by_plot: { plot_id: string | null; hours: number; pieces: number; earned: number }[];
}

export interface LaborEntry {
  id: string;
  farm_id: string;
  worker_id: string;
  date: string;
  hours?: number | null;
  pieces?: number | null;
  computed_cost?: number | null;
  plot_id?: string | null;
  journey_id?: string | null;
  operation_type?: string | null;
  notes?: string | null;
}
