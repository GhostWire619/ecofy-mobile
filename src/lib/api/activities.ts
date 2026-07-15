import { apiRequest } from '@/lib/api/client';
import type { LogRecord } from '@/lib/domain/types';

export type ActivityCreatePayload = {
  operation_type: string;
  plot_id: string;
  journey_id: string;
  date: string;
  cost: number;
  notes?: string | null;
  images?: { url: string; thumbnail_url?: string | null; caption?: string | null }[];
  crew?: { id?: string; name?: string; amount?: number }[];
  crew_total?: number;
  input?: { item_id?: string; item_name?: string; quantity?: number; unit_cost?: number };
  equipment?: { equipment_id?: string; equipment_name?: string; litres?: number };
  sale?: { buyer_id?: string; buyer_name?: string; quantity?: number; amount_received?: number };
  yield_qty?: number;
};

export const activitiesApi = {
  create(farmId: string, payload: ActivityCreatePayload, idempotencyKey: string) {
    return apiRequest<LogRecord>(`/api/farms/${farmId}/activities`, {
      method: 'POST',
      auth: true,
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(payload),
      timeoutMs: 45_000,
    });
  },
};
