// Workers / team API — backed by the farm_manager worker + payroll routes.
import { apiRequest } from '@/lib/api/client';
import type { LaborEntry, WageType, Worker, WorkerStatus, WorkerSummary } from '@/features/workers/types';

function unwrap<T>(payload: T | { success?: boolean; data?: T }): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data?: T }).data as T;
  }
  return payload as T;
}

export const workersApi = {
  list(farmId: string): Promise<Worker[]> {
    return apiRequest<Worker[] | { data?: Worker[] }>(`/api/farms/${farmId}/workers`, {
      method: 'GET',
      auth: true,
    }).then((p) => unwrap(p) ?? []);
  },

  create(
    farmId: string,
    input: {
      name: string;
      phone?: string;
      role?: string;
      kind?: string;
      wage_type: WageType;
      wage_rate: number;
      status?: WorkerStatus;
      notes?: string;
    },
  ): Promise<Worker> {
    return apiRequest<Worker | { data?: Worker }>(`/api/farms/${farmId}/workers`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ role: 'worker', kind: 'employee', ...input, wage_rate: Math.round(input.wage_rate) }),
    }).then(unwrap);
  },

  update(
    farmId: string,
    workerId: string,
    patch: Partial<{ name: string; phone: string; role: string; wage_type: WageType; wage_rate: number; status: WorkerStatus; notes: string }>,
  ): Promise<Worker> {
    return apiRequest<Worker | { data?: Worker }>(`/api/farms/${farmId}/workers/${workerId}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(patch),
    }).then(unwrap);
  },

  remove(farmId: string, workerId: string): Promise<unknown> {
    return apiRequest(`/api/farms/${farmId}/workers/${workerId}`, { method: 'DELETE', auth: true });
  },

  summary(farmId: string, workerId: string): Promise<WorkerSummary> {
    return apiRequest<WorkerSummary | { data?: WorkerSummary }>(
      `/api/farms/${farmId}/workers/${workerId}/summary`,
      { method: 'GET', auth: true },
    ).then(unwrap);
  },

  listLabor(farmId: string, workerId: string): Promise<LaborEntry[]> {
    return apiRequest<LaborEntry[] | { data?: LaborEntry[] }>(
      `/api/farms/${farmId}/workers/${workerId}/labor`,
      { method: 'GET', auth: true },
    ).then((p) => unwrap(p) ?? []);
  },

  logLabor(
    farmId: string,
    workerId: string,
    input: { date: string; hours?: number; pieces?: number; plot_id?: string | null; journey_id?: string | null; operation_type?: string; notes?: string },
  ): Promise<unknown> {
    return apiRequest(`/api/farms/${farmId}/workers/${workerId}/labor`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    });
  },

  giveAdvance(
    farmId: string,
    workerId: string,
    input: { amount: number; date: string; notes?: string },
  ): Promise<unknown> {
    return apiRequest(`/api/farms/${farmId}/workers/${workerId}/advances`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ ...input, amount: Math.round(input.amount) }),
    });
  },

  pay(
    farmId: string,
    input: { worker_id: string; amount: number; period_start: string; period_end: string; payment_method?: string; notes?: string },
  ): Promise<unknown> {
    return apiRequest(`/api/farms/${farmId}/payroll/payments`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ payment_method: 'cash', ...input, amount: Math.round(input.amount) }),
    });
  },
};
