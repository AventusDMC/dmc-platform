import { type SupportedCurrency } from '../lib/currencyOptions';

export type ServiceRate = {
  id: string;
  serviceId: string;
  supplierId: string | null;
  costBaseAmount: number;
  costCurrency: SupportedCurrency;
  pricingMode: 'PER_PERSON' | 'PER_GROUP' | 'PER_VEHICLE' | 'PER_DAY' | 'per_vehicle';
  salesTaxPercent: number;
  salesTaxIncluded: boolean;
  serviceChargePercent: number;
  serviceChargeIncluded: boolean;
  tourismFeeAmount: number | null;
  tourismFeeCurrency: SupportedCurrency | null;
  tourismFeeMode: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
  maxPaxPerUnit?: number | null;
};
