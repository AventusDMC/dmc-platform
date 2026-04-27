export type ExternalPackagePricingBasis = 'PER_PERSON' | 'PER_GROUP';

export type ExternalPackageFormState = {
  country: string;
  supplierName: string;
  startDay: string;
  endDay: string;
  startDate: string;
  endDate: string;
  pricingBasis: ExternalPackagePricingBasis;
  netCost: string;
  currency: string;
  includes: string;
  excludes: string;
  internalNotes: string;
  clientDescription: string;
};

export const EXTERNAL_PACKAGE_SERVICE_TYPE_KEY = 'externalPackage';

export const EXTERNAL_PACKAGE_PRICING_BASIS_OPTIONS: Array<{ value: ExternalPackagePricingBasis; label: string }> = [
  { value: 'PER_PERSON', label: 'Per person' },
  { value: 'PER_GROUP', label: 'Per group' },
];

function normalizeServiceTypeText(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function isExternalPackageCategory(value: string | null | undefined) {
  const normalized = normalizeServiceTypeText(value);
  return normalized === 'external_package' || normalized.includes('external_package') || normalized.includes('partner_package');
}

export function getExternalPackagePricingBasisLabel(value: string | null | undefined) {
  return String(value || '').trim().toUpperCase() === 'PER_GROUP' ? 'Per group' : 'Per person';
}

export function createEmptyExternalPackageFormState(currency = 'USD'): ExternalPackageFormState {
  return {
    country: '',
    supplierName: '',
    startDay: '',
    endDay: '',
    startDate: '',
    endDate: '',
    pricingBasis: 'PER_PERSON',
    netCost: '',
    currency,
    includes: '',
    excludes: '',
    internalNotes: '',
    clientDescription: '',
  };
}

export function buildExternalPackagePayload(state: ExternalPackageFormState) {
  return {
    country: state.country.trim(),
    supplierName: state.supplierName.trim() || null,
    startDay: state.startDay.trim() ? Number(state.startDay) : null,
    endDay: state.endDay.trim() ? Number(state.endDay) : null,
    startDate: state.startDate ? new Date(`${state.startDate}T09:00:00`).toISOString() : null,
    endDate: state.endDate ? new Date(`${state.endDate}T09:00:00`).toISOString() : null,
    pricingBasis: state.pricingBasis,
    netCost: Number(state.netCost),
    currency: state.currency.trim().toUpperCase(),
    includes: state.includes.trim() || null,
    excludes: state.excludes.trim() || null,
    internalNotes: state.internalNotes.trim() || null,
    clientDescription: state.clientDescription.trim(),
  };
}

export function validateExternalPackageFormState(state: ExternalPackageFormState) {
  const errors: string[] = [];
  const netCost = Number(state.netCost);
  const startDay = state.startDay.trim() ? Number(state.startDay) : null;
  const endDay = state.endDay.trim() ? Number(state.endDay) : null;
  const startDate = state.startDate ? new Date(`${state.startDate}T09:00:00`) : null;
  const endDate = state.endDate ? new Date(`${state.endDate}T09:00:00`) : null;

  if (!state.country.trim()) {
    errors.push('External package country is required.');
  }
  if (!EXTERNAL_PACKAGE_PRICING_BASIS_OPTIONS.some((option) => option.value === state.pricingBasis)) {
    errors.push('External package pricing basis must be Per person or Per group.');
  }
  if (!state.netCost.trim() || !Number.isFinite(netCost) || netCost < 0) {
    errors.push('External package net cost must be zero or greater.');
  }
  if (!state.currency.trim()) {
    errors.push('External package currency is required.');
  }
  if (!state.clientDescription.trim()) {
    errors.push('External package client description is required.');
  }
  if (startDay !== null && (!Number.isInteger(startDay) || startDay < 1)) {
    errors.push('External package start day must be a positive whole number.');
  }
  if (endDay !== null && (!Number.isInteger(endDay) || endDay < 1)) {
    errors.push('External package end day must be a positive whole number.');
  }
  if (startDay !== null && endDay !== null && endDay < startDay) {
    errors.push('External package end day cannot be before start day.');
  }
  if (startDate && Number.isNaN(startDate.getTime())) {
    errors.push('External package start date is invalid.');
  }
  if (endDate && Number.isNaN(endDate.getTime())) {
    errors.push('External package end date is invalid.');
  }
  if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate < startDate) {
    errors.push('External package end date cannot be before start date.');
  }

  return errors;
}

export function getExternalPackageCalculatedCost(state: Pick<ExternalPackageFormState, 'pricingBasis' | 'netCost'>, paxCount: number) {
  const netCost = Number(state.netCost || 0);
  if (!Number.isFinite(netCost)) {
    return null;
  }

  return state.pricingBasis === 'PER_GROUP' ? netCost : Number((netCost * Math.max(1, paxCount || 1)).toFixed(2));
}

export function getExternalPackageInternalLines(item: {
  externalPackageCountry?: string | null;
  externalSupplierName?: string | null;
  externalPricingBasis?: string | null;
  externalNetCost?: number | null;
  externalInternalNotes?: string | null;
  currency?: string | null;
}) {
  return [
    item.externalPackageCountry ? `Country: ${item.externalPackageCountry}` : null,
    item.externalSupplierName ? `Supplier: ${item.externalSupplierName}` : null,
    item.externalPricingBasis ? `Basis: ${getExternalPackagePricingBasisLabel(item.externalPricingBasis)}` : null,
    item.externalNetCost !== null && item.externalNetCost !== undefined
      ? `Net cost: ${item.currency || 'USD'} ${Number(item.externalNetCost).toFixed(2)}`
      : null,
    item.externalInternalNotes ? `Internal notes: ${item.externalInternalNotes}` : null,
  ].filter((line): line is string => Boolean(line));
}

export function getExternalPackageClientLines(item: {
  externalClientDescription?: string | null;
  externalIncludes?: string | null;
  externalExcludes?: string | null;
}) {
  return [
    item.externalClientDescription || null,
    item.externalIncludes ? `Includes: ${item.externalIncludes}` : null,
    item.externalExcludes ? `Excludes: ${item.externalExcludes}` : null,
  ].filter((line): line is string => Boolean(line));
}
