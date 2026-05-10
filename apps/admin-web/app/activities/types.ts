export type ActivityPricingBasis = 'PER_PERSON' | 'PER_GROUP';

export type ActivityCompany = {
  id: string;
  name: string;
  type?: string | null;
  country?: string | null;
  city?: string | null;
};

export type Activity = {
  id: string;
  code?: string | null;
  name: string;
  description: string | null;
  category?: string | null;
  city?: string | null;
  region?: string | null;
  supplierCompanyId: string;
  supplierCompany?: ActivityCompany | null;
  pricingBasis: ActivityPricingBasis;
  costPrice: number;
  sellPrice: number;
  durationMinutes: number | null;
  currency?: string | null;
  active: boolean;
  rateVariants?: ActivityRateVariant[];
};

export type ActivityRateVariant = {
  id?: string;
  name: string;
  durationMinutes: number | null;
  currency: string;
  costPrice: number;
  sellPrice: number;
  pricingBasis: ActivityPricingBasis;
  maxPaxPerUnit: number | null;
  active: boolean;
  notes?: string | null;
  difficulty?: string | null;
  guideRequired?: boolean | null;
  guideRequirement?: string | null;
  startPoint?: string | null;
  endPoint?: string | null;
  suitability?: string | null;
  fitnessNotes?: string | null;
  waterNotes?: string | null;
  seasonalNotes?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
};

export type ActivityActor = {
  id: string;
  role?: 'admin' | 'operations' | 'finance' | 'viewer' | 'agent' | string | null;
  companyId?: string | null;
};

export function canManageActivities(actor: ActivityActor | null) {
  return actor?.role === 'admin' || actor?.role === 'operations';
}

export function formatActivityPricingBasis(value: string | null | undefined) {
  if (value === 'PER_GROUP') return 'Per group';
  if (value === 'PER_PERSON') return 'Per person';
  return 'Pricing pending';
}

export function formatActivityMoney(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return amount.toFixed(2);
}
