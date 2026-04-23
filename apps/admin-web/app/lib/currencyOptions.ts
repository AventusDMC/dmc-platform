export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'JOD'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function normalizeSupportedCurrency(value: string | null | undefined): SupportedCurrency {
  return value === 'EUR' || value === 'JOD' || value === 'USD' ? value : 'USD';
}
