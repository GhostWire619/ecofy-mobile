// Inventory + equipment ("resources") domain types — mirror the backend
// farm_manager inventory + equipment routes.

export type InventoryCategory =
  | 'seed'
  | 'fertilizer'
  | 'pesticide'
  | 'herbicide'
  | 'fuel'
  | 'feed'
  | 'produce'
  | 'other';

export type StockMovementType = 'in' | 'out' | 'adjust';

export interface InventoryItem {
  id: string;
  farm_id: string;
  name: string;
  category: string;
  unit: string;
  current_qty: number;
  reorder_level?: number | null;
  unit_cost: number;
  low_stock?: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StockMovement {
  id: string;
  item_id: string;
  movement_type: StockMovementType;
  quantity: number;
  unit_cost?: number | null;
  total_cost?: number | null;
  plot_id?: string | null;
  journey_id?: string | null;
  date: string;
  notes?: string | null;
  created_at?: string;
}

export type EquipmentCategory = 'tractor' | 'implement' | 'pump' | 'vehicle' | 'tool' | 'other';
export type EquipmentStatus = 'active' | 'maintenance' | 'retired';
export type EquipmentLogType = 'fuel' | 'maintenance' | 'repair' | 'purchase' | 'usage' | 'other';

export interface Equipment {
  id: string;
  farm_id: string;
  name: string;
  category: string;
  identifier?: string | null;
  purchase_date?: string | null;
  purchase_cost?: number | null;
  status: EquipmentStatus;
  notes?: string | null;
  total_running_cost?: number;
  total_litres?: number;
  total_hours?: number;
  created_at?: string;
}

export interface EquipmentLog {
  id: string;
  equipment_id: string;
  log_type: EquipmentLogType;
  date: string;
  cost?: number | null;
  litres?: number | null;
  hours?: number | null;
  notes?: string | null;
  created_at?: string;
}
