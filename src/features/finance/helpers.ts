// Shared formatting helpers for the finance module.

export function fmtMoney(amount: number | null | undefined, currency = 'TZS'): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return `${currency} ${Math.round(n).toLocaleString()}`;
}

export function fmtDate(value?: string | null): string {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  land_preparation: 'Land prep',
  seed: 'Seed',
  fertilizer: 'Fertilizer',
  pesticide: 'Pesticide',
  labor: 'Labor',
  postharvest: 'Post-harvest',
  transport: 'Transport',
  equipment: 'Equipment',
  sale: 'Sale',
  harvest_sale: 'Harvest sale',
  input_loan: 'Input loan',
  seasonal_loan: 'Seasonal loan',
  equipment_loan: 'Equipment loan',
  emergency_loan: 'Emergency loan',
  other: 'Other',
};

export function catLabel(id: string): string {
  return CATEGORY_LABEL[id] ?? id.replace(/_/g, ' ');
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
