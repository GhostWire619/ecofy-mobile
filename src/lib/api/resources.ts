// Inventory + equipment ("resources") API — backed by the farm_manager
// inventory/equipment routes (same store the web farm-manager uses).
import { apiRequest } from '@/lib/api/client';
import type {
  Equipment,
  EquipmentLog,
  EquipmentLogType,
  EquipmentStatus,
  InventoryItem,
  StockMovement,
  StockMovementType,
} from '@/features/resources/types';

function unwrap<T>(payload: T | { success?: boolean; data?: T }): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data?: T }).data as T;
  }
  return payload as T;
}

export const inventoryApi = {
  list(farmId: string): Promise<InventoryItem[]> {
    return apiRequest<InventoryItem[] | { data?: InventoryItem[] }>(`/api/farms/${farmId}/inventory`, {
      method: 'GET',
      auth: true,
    }).then((p) => unwrap(p) ?? []);
  },

  create(
    farmId: string,
    input: { name: string; category?: string; unit?: string; reorder_level?: number | null; unit_cost?: number; opening_qty?: number; notes?: string },
  ): Promise<InventoryItem> {
    return apiRequest<InventoryItem | { data?: InventoryItem }>(`/api/farms/${farmId}/inventory`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }).then(unwrap);
  },

  update(
    farmId: string,
    itemId: string,
    patch: Partial<{ name: string; category: string; unit: string; reorder_level: number | null; unit_cost: number; notes: string }>,
  ): Promise<InventoryItem> {
    return apiRequest<InventoryItem | { data?: InventoryItem }>(`/api/farms/${farmId}/inventory/${itemId}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(patch),
    }).then(unwrap);
  },

  remove(farmId: string, itemId: string): Promise<unknown> {
    return apiRequest(`/api/farms/${farmId}/inventory/${itemId}`, { method: 'DELETE', auth: true });
  },

  listMovements(farmId: string, itemId: string): Promise<StockMovement[]> {
    return apiRequest<StockMovement[] | { data?: StockMovement[] }>(
      `/api/farms/${farmId}/inventory/${itemId}/movements`,
      { method: 'GET', auth: true },
    ).then((p) => unwrap(p) ?? []);
  },

  recordMovement(
    farmId: string,
    itemId: string,
    input: { movement_type: StockMovementType; quantity: number; unit_cost?: number; date: string; plot_id?: string | null; journey_id?: string | null; notes?: string },
  ): Promise<unknown> {
    return apiRequest(`/api/farms/${farmId}/inventory/${itemId}/movements`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    });
  },
};

export const equipmentApi = {
  list(farmId: string): Promise<Equipment[]> {
    return apiRequest<Equipment[] | { data?: Equipment[] }>(`/api/farms/${farmId}/equipment`, {
      method: 'GET',
      auth: true,
    }).then((p) => unwrap(p) ?? []);
  },

  create(
    farmId: string,
    input: { name: string; category?: string; identifier?: string; purchase_cost?: number; status?: EquipmentStatus; notes?: string },
  ): Promise<Equipment> {
    return apiRequest<Equipment | { data?: Equipment }>(`/api/farms/${farmId}/equipment`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    }).then(unwrap);
  },

  update(
    farmId: string,
    equipmentId: string,
    patch: Partial<{ name: string; category: string; identifier: string; purchase_cost: number; status: EquipmentStatus; notes: string }>,
  ): Promise<Equipment> {
    return apiRequest<Equipment | { data?: Equipment }>(`/api/farms/${farmId}/equipment/${equipmentId}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(patch),
    }).then(unwrap);
  },

  remove(farmId: string, equipmentId: string): Promise<unknown> {
    return apiRequest(`/api/farms/${farmId}/equipment/${equipmentId}`, { method: 'DELETE', auth: true });
  },

  listLogs(farmId: string, equipmentId: string): Promise<EquipmentLog[]> {
    return apiRequest<EquipmentLog[] | { data?: EquipmentLog[] }>(
      `/api/farms/${farmId}/equipment/${equipmentId}/logs`,
      { method: 'GET', auth: true },
    ).then((p) => unwrap(p) ?? []);
  },

  recordLog(
    farmId: string,
    equipmentId: string,
    input: { log_type: EquipmentLogType; date: string; cost?: number; litres?: number; hours?: number; notes?: string },
  ): Promise<unknown> {
    return apiRequest(`/api/farms/${farmId}/equipment/${equipmentId}/logs`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    });
  },
};
