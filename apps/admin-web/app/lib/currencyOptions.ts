export const SUPPORTED_CURRENCIES = ['USD', 'JOD', 'EUR', 'AED', 'SAR', 'ILS', 'EGP'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function normalizeSupportedCurrency(value: string | null | undefined): SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(value as SupportedCurrency) ? (value as SupportedCurrency) : 'USD';
}
