export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'JOD', 'ILS'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function normalizeSupportedCurrency(value: string | null | undefined): SupportedCurrency {
  return value === 'EUR' || value === 'JOD' || value === 'ILS' || value === 'USD' ? value : 'USD';
}
