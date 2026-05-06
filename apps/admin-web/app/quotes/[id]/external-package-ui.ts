export type ExternalPackagePricingBasis = 'PER_PERSON' | 'PER_GROUP';

export type ExternalPackagePricingMatrixRow = {
  id: string;
  label: string;
  paxFrom: string;
  paxTo: string;
  freePax: string;
  costPerPerson: string;
  sellPerPerson: string;
  notes: string;
};

export type ExternalPackageFormState = {
  packageName: string;
  country: string;
  supplierName: string;
  startDay: string;
  endDay: string;
  startDate: string;
  endDate: string;
  pricingBasis: ExternalPackagePricingBasis;
  netCost: string;
  singleSupplement: string;
  pricingMatrixRows: ExternalPackagePricingMatrixRow[];
  currency: string;
  includes: string;
  excludes: string;
  internalNotes: string;
  hotelsOrSimilar: string;
  clientItineraryText: string;
};

export function normalizeExternalPackagePricingMatrixRows(value: unknown): ExternalPackagePricingMatrixRow[] {
  const rows = Array.isArray(value) ? value : (value as any)?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  return rows.map((row: any, index) =>
    createExternalPackagePricingMatrixRow({
      id: typeof row?.id === 'string' ? row.id : `matrix-saved-${index}`,
      label: row?.label === undefined || row?.label === null ? '' : String(row.label),
      paxFrom: row?.paxFrom === undefined || row?.paxFrom === null ? '' : String(row.paxFrom),
      paxTo: row?.paxTo === undefined || row?.paxTo === null ? '' : String(row.paxTo),
      freePax: row?.freePax === undefined || row?.freePax === null ? '' : String(row.freePax),
      costPerPerson: row?.costPerPerson === undefined || row?.costPerPerson === null ? '' : String(row.costPerPerson),
      sellPerPerson: row?.sellPerPerson === undefined || row?.sellPerPerson === null ? '' : String(row.sellPerPerson),
      notes: row?.notes === undefined || row?.notes === null ? '' : String(row.notes),
    }),
  );
}

export const EXTERNAL_PACKAGE_SERVICE_TYPE_KEY = 'externalPackage';

export const EXTERNAL_PACKAGE_PRICING_BASIS_OPTIONS: Array<{ value: ExternalPackagePricingBasis; label: string }> = [
  { value: 'PER_PERSON', label: 'Per person' },
  { value: 'PER_GROUP', label: 'Per group' },
];

export function createExternalPackagePricingMatrixRow(partial: Partial<ExternalPackagePricingMatrixRow> = {}): ExternalPackagePricingMatrixRow {
  return {
    id: partial.id || `matrix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: partial.label || '',
    paxFrom: partial.paxFrom || '',
    paxTo: partial.paxTo || '',
    freePax: partial.freePax || '',
    costPerPerson: partial.costPerPerson || '',
    sellPerPerson: partial.sellPerPerson || '',
    notes: partial.notes || '',
  };
}

function getExternalPackagePricingMatrixPayloadRows(state: ExternalPackageFormState) {
  return state.pricingMatrixRows
    .map((row) => ({
      label: row.label.trim(),
      paxFrom: row.paxFrom.trim() ? Number(row.paxFrom) : null,
      paxTo: row.paxTo.trim() ? Number(row.paxTo) : null,
      freePax: row.freePax.trim() ? Number(row.freePax) : null,
      costPerPerson: row.costPerPerson.trim() ? Number(row.costPerPerson) : null,
      sellPerPerson: row.sellPerPerson.trim() ? Number(row.sellPerPerson) : null,
      notes: row.notes.trim() || null,
    }))
    .filter((row) => row.label || row.paxFrom !== null || row.paxTo !== null || row.freePax !== null || row.costPerPerson !== null || row.sellPerPerson !== null || row.notes);
}

function hasCompleteExternalPackageMatrixRow(row: ReturnType<typeof getExternalPackagePricingMatrixPayloadRows>[number]) {
  return Boolean((row.label || row.paxFrom !== null) && row.costPerPerson !== null && Number.isFinite(row.costPerPerson));
}

export function getExternalPackagePricingBasisForService(service: {
  unitType?: string | null;
  category?: string | null;
  serviceType?: { name?: string | null; code?: string | null } | null;
}): ExternalPackagePricingBasis {
  const pricingText = [service.unitType, service.category, service.serviceType?.code, service.serviceType?.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(per[_\s-]?group|group)\b/.test(pricingText)) {
    return 'PER_GROUP';
  }

  return 'PER_PERSON';
}

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
    packageName: '',
    country: '',
    supplierName: '',
    startDay: '',
    endDay: '',
    startDate: '',
    endDate: '',
    pricingBasis: 'PER_PERSON',
    netCost: '',
    singleSupplement: '',
    pricingMatrixRows: [createExternalPackagePricingMatrixRow()],
    currency,
    includes: '',
    excludes: '',
    internalNotes: '',
    hotelsOrSimilar: '',
    clientItineraryText: '',
  };
}

export function buildExternalPackagePayload(state: ExternalPackageFormState) {
  const pricingMatrixRows = getExternalPackagePricingMatrixPayloadRows(state);
  const matrixFallbackCost = pricingMatrixRows.find((row) => hasCompleteExternalPackageMatrixRow(row))?.costPerPerson ?? 0;

  return {
    packageName: state.packageName.trim(),
    country: state.country.trim(),
    supplierName: state.supplierName.trim() || null,
    startDay: state.startDay.trim() ? Number(state.startDay) : null,
    endDay: state.endDay.trim() ? Number(state.endDay) : null,
    startDate: state.startDate ? new Date(`${state.startDate}T09:00:00`).toISOString() : null,
    endDate: state.endDate ? new Date(`${state.endDate}T09:00:00`).toISOString() : null,
    pricingBasis: state.pricingBasis,
    netCost: state.netCost.trim() ? Number(state.netCost) : matrixFallbackCost,
    singleSupplement: state.singleSupplement.trim() ? Number(state.singleSupplement) : null,
    pricingMatrixJson: pricingMatrixRows.length > 0 ? pricingMatrixRows : null,
    currency: state.currency.trim().toUpperCase(),
    includes: state.includes.trim() || null,
    excludes: state.excludes.trim() || null,
    internalNotes: state.internalNotes.trim() || null,
    hotelsOrSimilar: state.hotelsOrSimilar.trim() || null,
    clientDescription: state.clientItineraryText.trim(),
  };
}

export function validateExternalPackageFormState(state: ExternalPackageFormState) {
  const errors: string[] = [];
  const netCost = Number(state.netCost);
  const singleSupplement = state.singleSupplement.trim() ? Number(state.singleSupplement) : null;
  const pricingMatrixRows = getExternalPackagePricingMatrixPayloadRows(state);
  const hasCompleteMatrixRow = pricingMatrixRows.some((row) => hasCompleteExternalPackageMatrixRow(row));
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
  if (!state.netCost.trim() && !hasCompleteMatrixRow) {
    errors.push('Enter a fallback net cost or at least one pricing matrix row with a pax slab and cost pp.');
  } else if (state.netCost.trim() && (!Number.isFinite(netCost) || netCost < 0)) {
    errors.push('External package net cost must be zero or greater.');
  }
  if (singleSupplement !== null && (!Number.isFinite(singleSupplement) || singleSupplement < 0)) {
    errors.push('External package single supplement must be zero or greater.');
  }
  for (const row of state.pricingMatrixRows) {
    for (const [field, value] of Object.entries({
      paxFrom: row.paxFrom,
      paxTo: row.paxTo,
      freePax: row.freePax,
      costPerPerson: row.costPerPerson,
      sellPerPerson: row.sellPerPerson,
    })) {
      if (value.trim() && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        errors.push(`External package matrix ${field} must be zero or greater.`);
      }
    }
  }
  for (const row of pricingMatrixRows) {
    if (row.costPerPerson !== null && !row.label && row.paxFrom === null) {
      errors.push('External package matrix rows with cost pp need a pax slab label or pax from value.');
    }
    if ((row.label || row.paxFrom !== null || row.paxTo !== null || row.freePax !== null || row.sellPerPerson !== null || row.notes) && row.costPerPerson === null) {
      errors.push('External package matrix rows need cost pp, or clear the row.');
    }
  }
  if (!state.currency.trim()) {
    errors.push('External package currency is required.');
  }
  if (!state.packageName.trim()) {
    errors.push('External package name is required.');
  }
  if (!state.clientItineraryText.trim()) {
    errors.push('External package client itinerary text is required.');
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
  externalPackageName?: string | null;
  externalPackageCountry?: string | null;
  externalSupplierName?: string | null;
  externalPricingBasis?: string | null;
  externalNetCost?: number | null;
  externalPackagePricingMatrixJson?: unknown;
  externalPackageSingleSupplement?: number | null;
  externalInternalNotes?: string | null;
  currency?: string | null;
}) {
  return [
    item.externalPackageName ? `Package: ${item.externalPackageName}` : null,
    item.externalPackageCountry ? `Country: ${item.externalPackageCountry}` : null,
    item.externalSupplierName ? `Supplier: ${item.externalSupplierName}` : null,
    item.externalPricingBasis ? `Basis: ${getExternalPackagePricingBasisLabel(item.externalPricingBasis)}` : null,
    item.externalNetCost !== null && item.externalNetCost !== undefined
      ? `Net cost: ${item.currency || 'USD'} ${Number(item.externalNetCost).toFixed(2)}`
      : null,
    Array.isArray(item.externalPackagePricingMatrixJson) && item.externalPackagePricingMatrixJson.length > 0
      ? `Matrix rows: ${item.externalPackagePricingMatrixJson.length}`
      : null,
    item.externalPackageSingleSupplement !== null && item.externalPackageSingleSupplement !== undefined
      ? `Single supplement: ${item.currency || 'USD'} ${Number(item.externalPackageSingleSupplement).toFixed(2)}`
      : null,
    item.externalInternalNotes ? `Internal notes: ${item.externalInternalNotes}` : null,
  ].filter((line): line is string => Boolean(line));
}

export function getExternalPackageClientLines(item: {
  externalPackageName?: string | null;
  externalClientDescription?: string | null;
  externalIncludes?: string | null;
  externalExcludes?: string | null;
  externalHotelsOrSimilar?: string | null;
  externalPackagePricingMatrixJson?: unknown;
  externalPackageSingleSupplement?: number | null;
  currency?: string | null;
}) {
  const matrixRows = Array.isArray(item.externalPackagePricingMatrixJson)
    ? item.externalPackagePricingMatrixJson
        .map((row: any) => `${row.label || `${row.paxFrom || ''}${row.paxTo ? `-${row.paxTo}` : '+'}`}: ${item.currency || ''} ${row.sellPerPerson ?? row.costPerPerson ?? ''}`.trim())
        .filter(Boolean)
    : [];

  return [
    item.externalPackageName || null,
    item.externalClientDescription || null,
    item.externalHotelsOrSimilar ? `Hotels or Similar: ${item.externalHotelsOrSimilar}` : null,
    matrixRows.length > 0 ? `Pricing Matrix: ${matrixRows.join(' | ')}` : null,
    item.externalPackageSingleSupplement !== null && item.externalPackageSingleSupplement !== undefined
      ? `Single supplement: ${item.currency || 'USD'} ${Number(item.externalPackageSingleSupplement).toFixed(2)}`
      : null,
    item.externalIncludes ? `Includes: ${item.externalIncludes}` : null,
    item.externalExcludes ? `Excludes: ${item.externalExcludes}` : null,
  ].filter((line): line is string => Boolean(line));
}
