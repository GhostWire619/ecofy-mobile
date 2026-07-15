import type Ionicons from '@expo/vector-icons/Ionicons';

export type ActivityMode = 'work' | 'buy' | 'income';
export type ActivityEntity = 'workers' | 'input' | 'equipment' | 'buyer' | 'yield';

export type ActivityDefinition = {
  id: string;
  label: string;
  mode: ActivityMode;
  icon: keyof typeof Ionicons.glyphMap;
  entities: ActivityEntity[];
  hasAmount: boolean;
  primary?: boolean;
};

export const ACTIVITIES: ActivityDefinition[] = [
  { id: 'tilling', label: 'Tilling', mode: 'work', icon: 'construct-outline', entities: ['equipment'], hasAmount: true, primary: true },
  { id: 'planting', label: 'Planting', mode: 'work', icon: 'leaf-outline', entities: ['input'], hasAmount: true, primary: true },
  { id: 'fertilizing', label: 'Fertilizing', mode: 'work', icon: 'flask-outline', entities: ['input'], hasAmount: true, primary: true },
  { id: 'spraying', label: 'Spraying', mode: 'work', icon: 'shield-checkmark-outline', entities: ['input'], hasAmount: true, primary: true },
  { id: 'weeding', label: 'Weeding', mode: 'work', icon: 'cut-outline', entities: ['workers'], hasAmount: true, primary: true },
  { id: 'irrigation', label: 'Irrigation', mode: 'work', icon: 'water-outline', entities: [], hasAmount: true, primary: true },
  { id: 'scouting', label: 'Scouting', mode: 'work', icon: 'eye-outline', entities: [], hasAmount: false, primary: true },
  { id: 'harvesting', label: 'Harvesting', mode: 'work', icon: 'basket-outline', entities: ['workers', 'yield'], hasAmount: true, primary: true },
  { id: 'mulching', label: 'Mulching', mode: 'work', icon: 'layers-outline', entities: ['workers'], hasAmount: true },
  { id: 'pruning', label: 'Pruning', mode: 'work', icon: 'git-branch-outline', entities: ['workers'], hasAmount: true },
  { id: 'post_harvest', label: 'Post-harvest', mode: 'work', icon: 'cube-outline', entities: [], hasAmount: true },
  { id: 'transport', label: 'Transport', mode: 'work', icon: 'car-outline', entities: ['equipment'], hasAmount: true },
  { id: 'other', label: 'Other work', mode: 'work', icon: 'ellipsis-horizontal-outline', entities: [], hasAmount: true },
  { id: 'input_purchase', label: 'Buy inputs', mode: 'buy', icon: 'bag-add-outline', entities: ['input'], hasAmount: true, primary: true },
  { id: 'equipment_fuel', label: 'Fuel equipment', mode: 'buy', icon: 'speedometer-outline', entities: ['equipment'], hasAmount: true, primary: true },
  { id: 'equipment_service', label: 'Service equipment', mode: 'buy', icon: 'build-outline', entities: ['equipment'], hasAmount: true, primary: true },
  { id: 'crop_sale', label: 'Crop sale', mode: 'income', icon: 'cart-outline', entities: ['buyer', 'yield'], hasAmount: true, primary: true },
  { id: 'by_product_sale', label: 'By-product sale', mode: 'income', icon: 'leaf-outline', entities: ['buyer', 'yield'], hasAmount: true },
  { id: 'subsidy_received', label: 'Subsidy received', mode: 'income', icon: 'business-outline', entities: [], hasAmount: true },
  { id: 'contract_payment', label: 'Contract payment', mode: 'income', icon: 'document-text-outline', entities: [], hasAmount: true },
  { id: 'other_income', label: 'Other income', mode: 'income', icon: 'cash-outline', entities: [], hasAmount: true },
];

export function activitiesForMode(mode: ActivityMode) {
  return ACTIVITIES.filter((activity) => activity.mode === mode);
}

export function getActivity(id: string) {
  return ACTIVITIES.find((activity) => activity.id === id) ?? ACTIVITIES[0];
}
