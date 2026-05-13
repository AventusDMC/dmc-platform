'use client';

import { FormEvent, useMemo, useState } from 'react';
import { HotelCategoryCombobox } from '../../components/HotelCategoryCombobox';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { HotelCategoryOption } from '../../lib/hotelCategories';

type Supplier = {
  id: string;
  name: string;
  type: string;
};

type Warning = {
  severity: 'blocker' | 'warning' | 'info';
  field: string;
  message: string;
};

type AssistedBlockTag =
  | 'ROOM_RATE_TABLE'
  | 'SEASON_TABLE'
  | 'SUPPLEMENT_SECTION'
  | 'CHILD_POLICY'
  | 'CANCELLATION_POLICY'
  | 'TAXES_SERVICE_NOTES';

type AssistedColumnRole =
  | 'ROOM_CATEGORY'
  | 'SEASON'
  | 'DATE_RANGE'
  | 'MEAL_PLAN'
  | 'PRICING_BASIS'
  | 'RATE'
  | 'SINGLE_SUPPLEMENT';

type HotelContractLineClassification =
  | 'HOTEL_NAME'
  | 'ROOM_TYPE'
  | 'SEASON'
  | 'DATE_RANGE'
  | 'MEAL_PLAN'
  | 'RATE_ROW'
  | 'SUPPLEMENT'
  | 'CHILD_POLICY'
  | 'CANCELLATION'
  | 'TAX_NOTE'
  | 'UNKNOWN';

type AssistedRateCandidate = {
  id: string;
  lineNumber: number;
  rawLine: string;
  lineType: HotelContractLineClassification;
  detectedRoom?: string;
  detectedMealPlan?: string;
  detectedOccupancy?: string;
  detectedSeason?: string;
  detectedDateRange?: string;
  detectedNumericValues: number[];
  confidence: number;
  mappingSuggestions: Partial<Record<AssistedColumnRole, string>>;
};

type AssistedExtractionBlock = {
  id: string;
  kind: 'RAW_TEXT' | 'DETECTED_TABLE' | 'SKIPPED_SECTION';
  label: string;
  suggestedTag?: AssistedBlockTag;
  tag?: AssistedBlockTag;
  lineStart?: number;
  lineEnd?: number;
  text: string;
  rows?: string[][];
  columns?: string[];
  mappings?: Partial<Record<AssistedColumnRole, string>>;
  approved?: boolean;
  rateCandidateIds?: string[];
};

type AssistedExtractionPreview = {
  mode: 'PDF_ASSISTED_REVIEW';
  importDisabled: boolean;
  oneHotelAtATimeRequired: boolean;
  requiredColumnRoles: AssistedColumnRole[];
  blocks: AssistedExtractionBlock[];
  lineClassifications?: Array<{ lineNumber: number; rawLine: string; type: HotelContractLineClassification; confidence: number }>;
  rateCandidates?: AssistedRateCandidate[];
  qcWarnings: Warning[];
};

type PreviewRate = {
  roomType?: string;
  serviceName?: string;
  routeName?: string;
  occupancyType?: string;
  mealPlan?: string;
  seasonName?: string;
  seasonFrom?: string;
  seasonTo?: string;
  cost?: number;
  currency?: string;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM';
  normalizedPricingBasis?: 'PER_PERSON_NIGHT' | 'PER_ROOM_NIGHT';
  salesTaxPercent?: number | null;
  serviceChargePercent?: number | null;
  salesTaxIncluded?: boolean | null;
  serviceChargeIncluded?: boolean | null;
  uncertain?: boolean;
  notes?: string;
};

type RatePolicyPreview = {
  policyType: string;
  appliesTo?: string | null;
  ageFrom?: number | null;
  ageTo?: number | null;
  amount?: number | null;
  percent?: number | null;
  currency?: string | null;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM';
  mealPlan?: string | null;
  notes?: string | null;
};

type CancellationRulePreview = {
  daysBefore?: number;
  penaltyPercent?: number;
  windowFromValue: number;
  windowToValue: number;
  deadlineUnit: 'DAYS' | 'HOURS' | string;
  penaltyType: 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED' | string;
  penaltyValue?: number | null;
  notes?: string | null;
};

type CancellationPolicyPreview = {
  summary?: string | null;
  notes?: string | null;
  noShowPenaltyType?: string | null;
  noShowPenaltyValue?: number | null;
  rules?: CancellationRulePreview[];
};

type ChildPolicyPreviewValue = {
  rules?: string[];
  items?: Array<{ label: string; description: string }>;
  infantMaxAge?: number | null;
  childMaxAge?: number | null;
  notes?: string | null;
  bands?: Array<{
    label?: string | null;
    minAge?: number | null;
    maxAge?: number | null;
    chargeBasis?: string | null;
    chargeValue?: number | null;
    notes?: string | null;
  }>;
};

type ContractPreview = {
  contractType: 'HOTEL' | 'TRANSPORT' | 'ACTIVITY';
  supplier: {
    id?: string | null;
    name: string;
    isNew: boolean;
  };
  contract: {
    name: string;
    year?: number | null;
    validFrom?: string | null;
    validTo?: string | null;
    currency: string;
  };
  hotel?: {
    name: string;
    city: string;
    category: string;
    hotelCategoryId?: string | null;
  };
  roomCategories?: Array<{ name: string; code?: string | null; description?: string | null; uncertain?: boolean }>;
  seasons?: Array<{ name: string; validFrom?: string | null; validTo?: string | null; uncertain?: boolean }>;
  rates: PreviewRate[];
  mealPlans?: Array<{ code: string; isDefault?: boolean; notes?: string | null; uncertain?: boolean }>;
  taxes: Array<{ name: string; value: number; included: boolean; uncertain?: boolean }>;
  supplements: Array<{ name: string; amount?: number | null; pricingBasis?: 'PER_PERSON' | 'PER_ROOM'; notes?: string; uncertain?: boolean }>;
  policies: Array<{ name: string; value: string; uncertain?: boolean }>;
  ratePolicies?: RatePolicyPreview[];
  cancellationPolicy?: CancellationPolicyPreview | null;
  childPolicy?: ChildPolicyPreviewValue | null;
  multiProperty?: {
    detected: boolean;
    propertyCount: number;
    hotels: ContractPreview[];
    normalizedWorkbooks: Array<{ hotelName: string; fileName: string; rateCount: number; warningCount: number }>;
  };
  parserDiagnostics?: {
    source?: 'workbook' | 'text';
    rowCount?: number;
    parsedTextLineCount?: number;
    first20Lines?: string[];
    detectedHotels?: string[];
    detectedTables?: Array<{ label: string; lineNumber?: number; confidence: number; columns?: string[] }>;
    skippedSections?: Array<{ label: string; reason: string; lineNumber?: number }>;
    confidence?: number;
    warnings?: string[];
    extractionMode?: string;
  };
  assistedExtraction?: AssistedExtractionPreview;
  missingFields: string[];
  uncertainFields: string[];
};

type ContractImport = {
  id: string;
  status: string;
  extractedJson: unknown;
  approvedJson?: unknown | null;
  warnings?: Warning[] | null;
  errors?: Warning[] | null;
  sourceFileName: string;
};

type ContractConflict = {
  code: 'CONTRACT_EXISTS';
  message: string;
  existingContract?: {
    id: string;
    name: string;
    validFrom?: string;
    validTo?: string;
  };
};

type ContractImportFlowProps = {
  suppliers: Supplier[];
  hotelCategories: HotelCategoryOption[];
};

function emptyPreview(contractType: ContractPreview['contractType']): ContractPreview {
  return {
    contractType,
    supplier: { name: '', isNew: true },
    contract: { name: '', validFrom: '', validTo: '', currency: 'JOD' },
    hotel: contractType === 'HOTEL' ? { name: '', city: 'Amman', category: 'Unclassified' } : undefined,
    rates: [],
    taxes: [],
    supplements: [],
    policies: [],
    ratePolicies: [],
    missingFields: [],
    uncertainFields: [],
  };
}

function humanizeKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((entry) => formatPreviewValue(entry))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => {
        const formattedValue = formatPreviewValue(entryValue);
        return formattedValue ? `${humanizeKey(key)}: ${formattedValue}` : '';
      })
      .filter(Boolean)
      .join(', ');
  }
  return String(value);
}

function formatEnumLabel(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return humanizeKey(raw.toLowerCase().replace(/_/g, ' '));
}

function formatMoney(value: unknown, currency?: string | null): string {
  const amount = optionalNumber(value);
  if (amount === null) return '';
  return [currency, amount.toLocaleString(undefined, { maximumFractionDigits: 2 })].filter(Boolean).join(' ');
}

function normalizeCategoryName(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function findHotelCategoryByName(hotelCategories: HotelCategoryOption[], value: unknown): HotelCategoryOption | null {
  const normalized = normalizeCategoryName(value);
  if (!normalized || normalized === 'unclassified') return null;
  return hotelCategories.find((category) => normalizeCategoryName(category.name) === normalized) || null;
}

function stringifyPolicy(value: unknown, fallback: string) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);

  const record = value as Record<string, unknown>;
  return (
    String(record.summary || record.notes || '') ||
    Object.entries(record)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== '')
      .map(([key, entryValue]) => `${key}: ${Array.isArray(entryValue) ? `${entryValue.length} item(s)` : String(entryValue)}`)
      .join(', ') ||
    fallback
  );
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(normalized) ? normalized : null;
}

function deriveTaxes(source: Record<string, any>, rates: PreviewRate[]) {
  const meta = source.meta && typeof source.meta === 'object' ? source.meta : {};
  const rateTaxPercent = rates.map((rate) => optionalNumber(rate.salesTaxPercent)).find((value) => value !== null) ?? null;
  const rateServicePercent = rates.map((rate) => optionalNumber(rate.serviceChargePercent)).find((value) => value !== null) ?? null;
  const defaultTaxPercent = optionalNumber(meta.defaultTaxPercent);
  const defaultServicePercent = optionalNumber(meta.defaultServicePercent);
  const salesTaxPercent = rateTaxPercent ?? defaultTaxPercent;
  const serviceChargePercent = rateServicePercent ?? defaultServicePercent;
  const taxes: ContractPreview['taxes'] = [];

  if (salesTaxPercent !== null) {
    taxes.push({
      name: 'Government Tax',
      value: salesTaxPercent,
      included: Boolean(rates.find((rate) => optionalNumber(rate.salesTaxPercent) !== null)?.salesTaxIncluded ?? meta.taxIncluded),
    });
  }

  if (serviceChargePercent !== null) {
    taxes.push({
      name: 'Service Charge',
      value: serviceChargePercent,
      included: Boolean(rates.find((rate) => optionalNumber(rate.serviceChargePercent) !== null)?.serviceChargeIncluded ?? meta.serviceIncluded),
    });
  }

  return taxes;
}

function formatAgeRange(policy: RatePolicyPreview) {
  if (policy.ageFrom !== null && policy.ageFrom !== undefined && policy.ageTo !== null && policy.ageTo !== undefined) {
    return `${policy.ageFrom}-${policy.ageTo}`;
  }

  if (policy.ageFrom !== null && policy.ageFrom !== undefined) {
    return `${policy.ageFrom}+`;
  }

  if (policy.ageTo !== null && policy.ageTo !== undefined) {
    return `0-${policy.ageTo}`;
  }

  return 'eligible';
}

function normalizePricingBasis(value: unknown): 'PER_PERSON' | 'PER_ROOM' | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  if (/\bper\s+person\b|\bpp\b|\bper\s+pax\b/i.test(raw)) return 'PER_PERSON';
  if (/\bper\s+room\b|\bper\s+unit\b/i.test(raw)) return 'PER_ROOM';

  const normalized = raw.replace(/[\s-]+/g, '_').toUpperCase();
  if (normalized === 'PER_PERSON' || normalized === 'PERSON' || normalized === 'PAX') return 'PER_PERSON';
  if (normalized === 'PER_ROOM' || normalized === 'ROOM' || normalized === 'UNIT') return 'PER_ROOM';
  return undefined;
}

function formatChildPolicy(policy: RatePolicyPreview) {
  const policyType = String(policy.policyType || '').trim().toUpperCase();
  const ageRange = formatAgeRange(policy);

  if (policyType === 'CHILD_FREE') {
    return `Children ${ageRange} free`;
  }

  if (policyType === 'CHILD_DISCOUNT') {
    const percent = optionalNumber(policy.percent);
    return `Children ${ageRange} pay ${percent !== null ? `${percent}%` : 'discounted rate'}`;
  }

  if (policyType === 'CHILD_EXTRA_BED') {
    const amount = optionalNumber(policy.amount);
    const currency = policy.currency || 'JOD';
    return `Children ${ageRange} extra bed ${amount !== null ? `${currency} ${amount}` : 'available'}`;
  }

  return '';
}

function childBandDescription(band: any, fallbackCurrency: string): string {
  const minAge = optionalNumber(band?.minAge);
  const maxAge = optionalNumber(band?.maxAge);
  const ageRange = minAge !== null || maxAge !== null ? `${minAge ?? 0}-${maxAge ?? minAge ?? ''}` : '';
  const basis = String(band?.chargeBasis || '').trim().toUpperCase();
  const value = optionalNumber(band?.chargeValue);
  const agePrefix = ageRange ? `Children ${ageRange} ` : '';
  const notes = String(band?.notes || '').trim();

  if (basis === 'FREE') {
    return notes || `${agePrefix}free`.trim();
  }

  if (basis === 'PERCENT_OF_ADULT') {
    return notes || `${agePrefix}pay ${value !== null ? `${value}%` : 'percentage of adult rate'}`.trim();
  }

  if (basis === 'FIXED_AMOUNT') {
    return notes || `${agePrefix}pay ${value !== null ? `${fallbackCurrency} ${value}` : 'fixed child rate'}`.trim();
  }

  return notes || String(band?.label || '').trim();
}

function childBandLabel(band: any): string {
  const label = String(band?.label || '').trim();
  if (label) return label;
  const basis = String(band?.chargeBasis || '').trim().toUpperCase();
  if (basis === 'FIXED_AMOUNT') return 'Extra bed';
  if (basis === 'PERCENT_OF_ADULT') return 'Child charge';
  if (basis === 'FREE') return 'Existing bedding';
  return 'Child policy';
}

function mapSourceChildPolicy(source: Record<string, any>, fallbackCurrency: string) {
  const childPolicy = source.childPolicy && typeof source.childPolicy === 'object' ? source.childPolicy : null;
  if (!childPolicy) return null;

  if (Array.isArray(childPolicy.rules)) {
    const rules = childPolicy.rules.map((rule: unknown) => String(rule || '').trim()).filter(Boolean);
    const items = rules.map((rule: string) => ({ label: inferChildPolicyLabel(rule), description: rule }));
    return rules.length > 0 ? { ...childPolicy, rules, items } : null;
  }

  const bandItems = Array.isArray(childPolicy.bands)
    ? childPolicy.bands
        .map((band: any) => ({ label: childBandLabel(band), description: childBandDescription(band, fallbackCurrency) }))
        .filter((item: { label: string; description: string }) => item.description)
    : [];
  const notes = String(childPolicy.notes || '').trim();
  const noteItems = notes ? [{ label: 'Notes', description: notes }] : [];
  const items = [...bandItems, ...noteItems];
  const rules = items.map((item) => item.description).filter(Boolean);

  return rules.length > 0 ? { ...childPolicy, rules, items } : null;
}

function inferChildPolicyLabel(rule: string): string {
  if (/extra\s*bed/i.test(rule)) return 'Extra bed';
  if (/meal/i.test(rule)) return 'Meals';
  if (/free|existing bedding|sharing/i.test(rule)) return 'Existing bedding';
  return 'Child policy';
}

function deriveChildPolicy(ratePolicies: RatePolicyPreview[]) {
  const rules = ratePolicies
    .filter((policy) => {
      const policyType = String(policy.policyType || '').trim().toUpperCase();
      return policyType === 'CHILD_FREE' || policyType === 'CHILD_DISCOUNT' || policyType === 'CHILD_EXTRA_BED';
    })
    .map(formatChildPolicy)
    .filter(Boolean);

  return rules.length > 0 ? { rules } : null;
}

function mapExtractedToUI(extractedJson: unknown, hotelCategories: HotelCategoryOption[] = []): ContractPreview {
  const source = (extractedJson && typeof extractedJson === 'object' ? extractedJson : {}) as Record<string, any>;
  const contractType = String(source.contractType || 'HOTEL').toUpperCase() as ContractPreview['contractType'];
  const contract = source.contract && typeof source.contract === 'object' ? source.contract : {};
  const supplier = source.supplier && typeof source.supplier === 'object' ? source.supplier : {};
  const hotel = source.hotel && typeof source.hotel === 'object' ? source.hotel : {};
  const cancellationPolicy = normalizeCancellationPolicy(source.cancellationPolicy || null);
  const policies = Array.isArray(source.policies) ? [...source.policies] : [];

  if (cancellationPolicy && !policies.some((policy) => /cancel/i.test(String(policy?.name || '')))) {
    policies.push({
      name: 'Cancellation policy',
      value: stringifyPolicy(cancellationPolicy, 'Cancellation policy extracted.'),
    });
  }

  const rates: PreviewRate[] = Array.isArray(source.rates)
    ? source.rates.map((rate: any) => ({
        roomType: rate.roomType || rate.roomCategory || rate.roomName || '',
        serviceName: rate.serviceName || '',
        routeName: rate.routeName || '',
        occupancyType: rate.occupancyType || rate.occupancy || 'DBL',
        mealPlan: rate.mealPlan || 'BB',
        seasonName: rate.seasonName || rate.season || 'Imported',
        seasonFrom: rate.seasonFrom || '',
        seasonTo: rate.seasonTo || '',
        cost: typeof rate.cost === 'number' ? rate.cost : Number(rate.cost ?? rate.price ?? rate.rate) || undefined,
        currency: rate.currency || contract.currency || source.currency || 'JOD',
        pricingBasis: normalizePricingBasis(rate.pricingBasis),
        normalizedPricingBasis:
          rate.normalizedPricingBasis === 'PER_PERSON_NIGHT' || rate.normalizedPricingBasis === 'PER_ROOM_NIGHT'
            ? rate.normalizedPricingBasis
            : undefined,
        salesTaxPercent: rate.salesTaxPercent ?? null,
        serviceChargePercent: rate.serviceChargePercent ?? null,
        salesTaxIncluded: rate.salesTaxIncluded ?? null,
        serviceChargeIncluded: rate.serviceChargeIncluded ?? null,
        uncertain: Boolean(rate.uncertain),
        notes: rate.notes || undefined,
      }))
    : [];
  const ratePolicies: RatePolicyPreview[] = Array.isArray(source.ratePolicies)
    ? source.ratePolicies.map((policy: any) => ({
        policyType: String(policy.policyType || policy.type || ''),
        appliesTo: policy.appliesTo || null,
        ageFrom: policy.ageFrom ?? null,
        ageTo: policy.ageTo ?? null,
        amount: policy.amount ?? null,
        percent: policy.percent ?? null,
        currency: policy.currency || contract.currency || source.currency || 'JOD',
        pricingBasis: normalizePricingBasis(policy.pricingBasis),
        mealPlan: policy.mealPlan || null,
        notes: policy.notes || null,
      }))
    : [];
  const childPolicy = mapSourceChildPolicy(source, String(contract.currency || source.currency || 'JOD')) || deriveChildPolicy(ratePolicies);
  const importedHotelCategoryId = String(hotel.hotelCategoryId || source.hotelCategoryId || '').trim();
  const importedHotelCategoryName = String(hotel.category || source.category || '').trim();
  const matchedHotelCategory = importedHotelCategoryId
    ? hotelCategories.find((category) => category.id === importedHotelCategoryId) || null
    : findHotelCategoryByName(hotelCategories, importedHotelCategoryName);

  return {
    contractType,
    supplier: {
      id: supplier.id || null,
      name: String(supplier.name || source.supplierName || source.hotelName || ''),
      isNew: supplier.isNew ?? !supplier.id,
    },
    contract: {
      name: String(contract.name || source.contractName || source.hotelName || 'Imported Contract'),
      year: contract.year ?? source.contractYear ?? null,
      validFrom: contract.validFrom || source.contractStartDate || source.validFrom || '',
      validTo: contract.validTo || source.contractEndDate || source.validTo || '',
      currency: String(contract.currency || source.currency || 'JOD'),
    },
    hotel:
      contractType === 'HOTEL'
        ? {
            name: String(hotel.name || source.hotelName || supplier.name || ''),
            city: String(hotel.city || source.city || 'Amman'),
            category: matchedHotelCategory?.name || importedHotelCategoryName || 'Unclassified',
            hotelCategoryId: matchedHotelCategory?.id || importedHotelCategoryId || null,
          }
        : undefined,
    roomCategories: Array.isArray(source.roomCategories) ? source.roomCategories : [],
    seasons: Array.isArray(source.seasons) ? source.seasons : [],
    rates,
    mealPlans: Array.isArray(source.mealPlans) ? source.mealPlans : [],
    taxes: deriveTaxes(source, rates),
    supplements: Array.isArray(source.supplements)
      ? source.supplements.map((supplement: any) => ({
          name: supplement.name || supplement.type || 'Supplement',
          amount: supplement.amount ?? supplement.cost ?? null,
          pricingBasis: normalizePricingBasis(supplement.pricingBasis),
          notes: supplement.notes || supplement.chargeBasis || undefined,
          uncertain: Boolean(supplement.uncertain),
        }))
      : [],
    policies,
    ratePolicies,
    cancellationPolicy,
    childPolicy,
    multiProperty: source.multiProperty,
    parserDiagnostics: source.parserDiagnostics,
    assistedExtraction: source.assistedExtraction,
    missingFields: Array.isArray(source.missingFields) ? source.missingFields : [],
    uncertainFields: Array.isArray(source.uncertainFields) ? source.uncertainFields : [],
  };
}

function normalizeCancellationPolicy(value: unknown): CancellationPolicyPreview | null {
  if (!value || typeof value !== 'object') return null;
  const policy = value as Record<string, any>;
  return {
    summary: policy.summary || null,
    notes: policy.notes || null,
    noShowPenaltyType: policy.noShowPenaltyType || null,
    noShowPenaltyValue: policy.noShowPenaltyValue ?? null,
    rules: Array.isArray(policy.rules)
      ? policy.rules.map((rule: any) => ({
          daysBefore: Number(rule.daysBefore ?? rule.windowFromValue ?? 0),
          penaltyPercent: rule.penaltyPercent ?? (rule.penaltyType === 'PERCENT' ? rule.penaltyValue : undefined),
          windowFromValue: Number(rule.windowFromValue ?? rule.daysBefore ?? 0),
          windowToValue: Number(rule.windowToValue ?? 0),
          deadlineUnit: rule.deadlineUnit || 'DAYS',
          penaltyType: rule.penaltyType || 'PERCENT',
          penaltyValue: rule.penaltyValue ?? rule.penaltyPercent ?? null,
          notes: rule.notes || null,
        }))
      : [],
  };
}

const assistedBlockTagOptions: Array<{ value: AssistedBlockTag; label: string }> = [
  { value: 'ROOM_RATE_TABLE', label: 'Room/rate table' },
  { value: 'SEASON_TABLE', label: 'Season table' },
  { value: 'SUPPLEMENT_SECTION', label: 'Supplement section' },
  { value: 'CHILD_POLICY', label: 'Child policy' },
  { value: 'CANCELLATION_POLICY', label: 'Cancellation policy' },
  { value: 'TAXES_SERVICE_NOTES', label: 'Taxes/service notes' },
];

const assistedColumnRoleOptions: Array<{ value: AssistedColumnRole; label: string }> = [
  { value: 'ROOM_CATEGORY', label: 'Room category' },
  { value: 'SEASON', label: 'Season' },
  { value: 'DATE_RANGE', label: 'Date range' },
  { value: 'MEAL_PLAN', label: 'Meal plan' },
  { value: 'PRICING_BASIS', label: 'Pricing basis' },
  { value: 'RATE', label: 'Rate' },
  { value: 'SINGLE_SUPPLEMENT', label: 'Single supplement' },
];

function buildAssistedQcWarnings(assisted?: AssistedExtractionPreview): Warning[] {
  if (!assisted) return [];
  const warnings: Warning[] = [
    {
      severity: 'blocker',
      field: 'assistedExtraction',
      message: 'Raw PDF extraction is assisted-review only. Import stays disabled until QC passes and a normalized workbook is reviewed.',
    },
  ];
  const approvedRoomRateBlocks = assisted.blocks.filter((block) => block.tag === 'ROOM_RATE_TABLE' && block.approved);
  const mappedRoles = new Set<string>();
  for (const block of approvedRoomRateBlocks) {
    for (const [role, sourceColumn] of Object.entries(block.mappings || {})) {
      if (sourceColumn) mappedRoles.add(role);
    }
  }
  for (const role of assisted.requiredColumnRoles || []) {
    if (!mappedRoles.has(role)) {
      warnings.push({
        severity: 'warning',
        field: `assistedExtraction.mappings.${role}`,
        message: `${formatEnumLabel(role)} is not mapped on an approved room/rate table.`,
      });
    }
  }
  return warnings;
}

export function ContractImportFlow({ suppliers, hotelCategories }: ContractImportFlowProps) {
  const [contractType, setContractType] = useState<ContractPreview['contractType']>('HOTEL');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [contractYear, setContractYear] = useState(String(new Date().getFullYear()));
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [contractImport, setContractImport] = useState<ContractImport | null>(null);
  const [preview, setPreview] = useState<ContractPreview>(emptyPreview('HOTEL'));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [contractConflict, setContractConflict] = useState<ContractConflict | null>(null);

  const assistedWarnings = useMemo(() => buildAssistedQcWarnings(preview.assistedExtraction), [preview.assistedExtraction]);
  const warnings = useMemo(() => [...(contractImport?.warnings || []), ...assistedWarnings], [contractImport, assistedWarnings]);
  const blockers = warnings.filter((warning) => warning.severity === 'blocker');
  const isMultiPropertyPreview = Boolean(preview.multiProperty?.detected);
  const isAssistedExtractionPreview = Boolean(preview.assistedExtraction?.importDisabled);

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setContractConflict(null);

    if (!file) {
      console.error('Analyze error', 'No contract file selected');
      setError('Choose a contract file before analyzing.');
      return;
    }

    const formData = new FormData();
    formData.set('contractType', contractType);
    formData.set('supplierId', supplierId);
    formData.set('supplierName', supplierName);
    formData.set('contractYear', contractYear);
    formData.set('validFrom', validFrom);
    formData.set('validTo', validTo);
    formData.set('file', file);

    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/contract-imports/analyze', {
        method: 'POST',
        body: formData,
      });
      const rawResponse = await response.text();

      if (!response.ok) {
        let message = 'Could not analyze contract.';
        try {
          const parsedError = rawResponse ? (JSON.parse(rawResponse) as { message?: string | string[]; error?: string }) : null;
          const parsedMessage = parsedError?.message;
          message = Array.isArray(parsedMessage) ? parsedMessage.join(', ') : parsedMessage || parsedError?.error || message;
        } catch {
          message = rawResponse || message;
        }
        throw new Error(message);
      }

      if (!rawResponse) {
        console.error('Analyze response was empty', {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error('Contract analysis returned an empty response.');
      }

      const data = JSON.parse(rawResponse) as ContractImport;
      if (!data.extractedJson) {
        console.error('Analyze response missing extractedJson', data);
        throw new Error('Contract analysis did not return extracted preview data.');
      }

      const mappedPreview = mapExtractedToUI(data.extractedJson, hotelCategories);
      setContractImport(data);
      setPreview(mappedPreview);
      setMessage('Contract analyzed. Review and edit extracted values before approval.');
    } catch (caughtError) {
      console.error('Analyze error', caughtError);
      setError(caughtError instanceof Error ? caughtError.message : 'Could not analyze contract.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleApprove(mode?: 'replace' | 'version') {
    if (!contractImport) return;
    setError('');
    setMessage('');
    setIsApproving(true);

    try {
      const response = await fetch(`/api/contract-imports/${contractImport.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: preview, mode }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload?.code === 'CONTRACT_EXISTS') {
          setContractConflict(payload as ContractConflict);
          setMessage('');
          return;
        }
        const parsedMessage = Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message || payload?.error;
        throw new Error(parsedMessage || (await getErrorMessage(response, 'Could not approve contract import.')));
      }

      const data = await readJsonResponse<ContractImport>(response, 'Contract import approve');
      const mappedPreview = mapExtractedToUI(data.approvedJson || data.extractedJson, hotelCategories);
      setContractImport(data);
      setPreview(mappedPreview);
      setContractConflict(null);
      setMessage('Contract approved and imported.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not approve contract import.');
    } finally {
      setIsApproving(false);
    }
  }

  function updatePreview(next: Partial<ContractPreview>) {
    setPreview((current) => ({ ...current, ...next }));
  }

  function updateAssistedBlock(blockId: string, patch: Partial<AssistedExtractionBlock>) {
    setPreview((current) => {
      if (!current.assistedExtraction) return current;
      const assistedExtraction = {
        ...current.assistedExtraction,
        blocks: current.assistedExtraction.blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
      };
      return {
        ...current,
        assistedExtraction: {
          ...assistedExtraction,
          qcWarnings: buildAssistedQcWarnings(assistedExtraction),
        },
      };
    });
  }

  function updateAssistedMapping(blockId: string, role: AssistedColumnRole, sourceColumn: string) {
    setPreview((current) => {
      if (!current.assistedExtraction) return current;
      const assistedExtraction = {
        ...current.assistedExtraction,
        blocks: current.assistedExtraction.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                mappings: {
                  ...(block.mappings || {}),
                  [role]: sourceColumn,
                },
              }
            : block,
        ),
      };
      return {
        ...current,
        assistedExtraction: {
          ...assistedExtraction,
          qcWarnings: buildAssistedQcWarnings(assistedExtraction),
        },
      };
    });
  }

  function updateContract(field: keyof ContractPreview['contract'], value: string) {
    setPreview((current) => ({
      ...current,
      contract: { ...current.contract, [field]: field === 'year' ? Number(value) || null : value },
    }));
  }

  function updateSupplierName(value: string) {
    setPreview((current) => ({
      ...current,
      supplier: { ...current.supplier, name: value, isNew: !current.supplier.id },
    }));
  }

  function updateHotel(field: keyof NonNullable<ContractPreview['hotel']>, value: string) {
    setPreview((current) => ({
      ...current,
      hotel: { ...(current.hotel || { name: '', city: '', category: '' }), [field]: value },
    }));
  }

  function updateHotelCategoryId(value: string) {
    const selectedCategory = hotelCategories.find((category) => category.id === value) || null;
    setPreview((current) => ({
      ...current,
      hotel: {
        ...(current.hotel || { name: '', city: '', category: '' }),
        hotelCategoryId: value || null,
        category: selectedCategory?.name || current.hotel?.category || '',
      },
    }));
  }

  function updateRate(index: number, field: keyof PreviewRate, value: string) {
    setPreview((current) => ({
      ...current,
      rates: current.rates.map((rate, rateIndex) =>
        rateIndex === index
          ? {
              ...rate,
              [field]: ['cost', 'salesTaxPercent', 'serviceChargePercent'].includes(field)
                ? Number(value) || 0
                : ['salesTaxIncluded', 'serviceChargeIncluded'].includes(field)
                  ? value === 'true'
                  : value,
            }
          : rate,
      ),
    }));
  }

  function updateRatePolicy(index: number, field: keyof RatePolicyPreview, value: string) {
    setPreview((current) => ({
      ...current,
      ratePolicies: (current.ratePolicies || []).map((policy, policyIndex) =>
        policyIndex === index
          ? {
              ...policy,
              [field]: ['ageFrom', 'ageTo', 'amount', 'percent'].includes(field) ? Number(value) || 0 : value,
            }
          : policy,
      ),
    }));
  }

  function addRatePolicy() {
    setPreview((current) => ({
      ...current,
      ratePolicies: [
        ...(current.ratePolicies || []),
        {
          policyType: 'CHILD_DISCOUNT',
          appliesTo: 'All rooms',
          ageFrom: 6,
          ageTo: 11,
          amount: null,
          percent: 50,
          currency: current.contract.currency || 'JOD',
          pricingBasis: 'PER_PERSON',
          mealPlan: 'BB',
          notes: '',
        },
      ],
    }));
  }

  function addRate() {
    setPreview((current) => ({
      ...current,
      rates: [
        ...current.rates,
        {
          roomType: current.contractType === 'HOTEL' ? 'Standard' : '',
          serviceName: current.contractType === 'ACTIVITY' ? 'Activity service' : '',
          routeName: current.contractType === 'TRANSPORT' ? 'Route' : '',
          occupancyType: 'DBL',
          mealPlan: 'BB',
          seasonName: 'Imported',
          cost: 0,
          currency: current.contract.currency || 'JOD',
          pricingBasis: 'PER_ROOM',
        },
      ],
    }));
  }

  function updateCancellationPolicy(field: keyof CancellationPolicyPreview, value: string) {
    setPreview((current) => ({
      ...current,
      cancellationPolicy: {
        ...(current.cancellationPolicy || { rules: [] }),
        [field]: field === 'noShowPenaltyValue' ? Number(value) || null : value,
      },
    }));
  }

  function updateCancellationRule(index: number, field: keyof CancellationRulePreview, value: string) {
    setPreview((current) => {
      const policy = current.cancellationPolicy || { rules: [] };
      const rules = policy.rules || [];
      return {
        ...current,
        cancellationPolicy: {
          ...policy,
          rules: rules.map((rule, ruleIndex) => {
            if (ruleIndex !== index) return rule;
            const numericFields: Array<keyof CancellationRulePreview> = ['daysBefore', 'penaltyPercent', 'windowFromValue', 'windowToValue', 'penaltyValue'];
            const nextValue = numericFields.includes(field) ? Number(value) || 0 : value;
            const nextRule = { ...rule, [field]: nextValue };
            if (field === 'daysBefore') {
              nextRule.windowFromValue = Number(value) || 0;
            }
            if (field === 'penaltyPercent') {
              nextRule.penaltyType = 'PERCENT';
              nextRule.penaltyValue = Number(value) || 0;
            }
            return nextRule;
          }),
        },
      };
    });
  }

  function addCancellationRule() {
    setPreview((current) => ({
      ...current,
      cancellationPolicy: {
        ...(current.cancellationPolicy || {
          summary: 'Cancellation policy extracted from contract.',
          notes: null,
          noShowPenaltyType: 'FULL_STAY',
          noShowPenaltyValue: null,
        }),
        rules: [
          ...(current.cancellationPolicy?.rules || []),
          {
            daysBefore: 1,
            penaltyPercent: 100,
            windowFromValue: 1,
            windowToValue: 0,
            deadlineUnit: 'DAYS',
            penaltyType: 'PERCENT',
            penaltyValue: 100,
            notes: 'Manual cancellation rule.',
          },
        ],
      },
    }));
  }

  async function handleDownloadExcel() {
    if (!contractImport) return;
    setError('');
    try {
      const response = await fetch(`/api/contract-imports/${contractImport.id}/export-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: preview }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not export extracted contract.'));
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileName = disposition.match(/filename="?([^"]+)"?/i)?.[1] || 'extracted-contract.xlsx';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not export extracted contract.');
    }
  }

  return (
    <div className="contract-import-layout">
      <form className="form-card" onSubmit={handleAnalyze}>
        <div className="form-grid">
          <label>
            Contract type
            <select value={contractType} onChange={(event) => setContractType(event.target.value as ContractPreview['contractType'])}>
              <option value="HOTEL">Hotel</option>
              <option value="TRANSPORT">Transport</option>
              <option value="ACTIVITY">Activity</option>
            </select>
          </label>
          <label>
            Existing supplier
            <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">New supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            New supplier name
            <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} disabled={Boolean(supplierId)} />
          </label>
          <label>
            Contract year
            <input value={contractYear} onChange={(event) => setContractYear(event.target.value)} inputMode="numeric" />
          </label>
          <label>
            Valid from
            <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
          </label>
          <label>
            Valid to
            <input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} />
          </label>
          <label className="wide-field">
            Contract file
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
        </div>
        <button className="primary-button" type="submit" disabled={isAnalyzing}>
          {isAnalyzing ? 'Analyzing...' : 'Analyze contract'}
        </button>
      </form>

      {error ? <div className="form-error">{error}</div> : null}
      {message ? <div className="success-message">{message}</div> : null}

      {contractImport ? (
        <section className="table-section">
          <div className="section-header">
            <div>
              <h2>Review extracted data</h2>
              <p>{contractImport.sourceFileName} | Status: {contractImport.status}</p>
            </div>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => void handleDownloadExcel()}>
                Download Extracted Excel
              </button>
              <button className="primary-button" onClick={() => void handleApprove()} disabled={isApproving || blockers.length > 0 || isMultiPropertyPreview || isAssistedExtractionPreview}>
                {isApproving ? 'Importing...' : 'Approve import'}
              </button>
            </div>
          </div>

          {contractConflict ? (
            <div className="warning-list">
              <p className="form-error">A contract already exists for this hotel/year.</p>
              {contractConflict.existingContract ? (
                <p className="empty-state">
                  Existing contract: {contractConflict.existingContract.name} ({contractConflict.existingContract.validFrom || '-'} to{' '}
                  {contractConflict.existingContract.validTo || '-'})
                </p>
              ) : null}
              <div className="button-row">
                <button className="danger-button" type="button" onClick={() => void handleApprove('replace')} disabled={isApproving}>
                  Replace existing contract
                </button>
                <button className="secondary-button" type="button" onClick={() => void handleApprove('version')} disabled={isApproving}>
                  Create new version
                </button>
                <button className="secondary-button" type="button" onClick={() => setContractConflict(null)} disabled={isApproving}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="warning-list">
              {warnings.map((warning) => (
                <p key={`${warning.field}-${warning.message}`} className={warning.severity === 'blocker' ? 'form-error' : 'empty-state'}>
                  {warning.message}
                </p>
              ))}
            </div>
          ) : null}

          <ImportPreviewSummary preview={preview} warnings={warnings} />
          <ExtractionDiagnostics diagnostics={preview.parserDiagnostics} />
          <AssistedExtractionReview
            assistedExtraction={preview.assistedExtraction}
            onUpdateBlock={updateAssistedBlock}
            onUpdateMapping={updateAssistedMapping}
          />

          {isMultiPropertyPreview ? (
            <section className="table-section">
              <div className="section-header">
                <div>
                  <h3>Multi-property extraction preview</h3>
                  <p>Automatic import is disabled. Download the normalized workbooks and review each hotel separately.</p>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Hotel</th>
                      <th>Workbook</th>
                      <th>Rates</th>
                      <th>QC warnings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.multiProperty?.normalizedWorkbooks || []).map((workbook) => (
                      <tr key={workbook.fileName}>
                        <td>{workbook.hotelName}</td>
                        <td>{workbook.fileName}</td>
                        <td>{workbook.rateCount}</td>
                        <td>{workbook.warningCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <div className="form-grid">
            <label>
              Supplier
              <input value={preview.supplier.name} onChange={(event) => updateSupplierName(event.target.value)} />
            </label>
            <label>
              Contract name
              <input value={preview.contract.name} onChange={(event) => updateContract('name', event.target.value)} />
            </label>
            <label>
              Currency
              <input value={preview.contract.currency} onChange={(event) => updateContract('currency', event.target.value.toUpperCase())} />
            </label>
            <label>
              Valid from
              <input value={preview.contract.validFrom || ''} type="date" onChange={(event) => updateContract('validFrom', event.target.value)} />
            </label>
            <label>
              Valid to
              <input value={preview.contract.validTo || ''} type="date" onChange={(event) => updateContract('validTo', event.target.value)} />
            </label>
            {preview.contractType === 'HOTEL' ? (
              <>
                <label>
                  Hotel
                  <input value={preview.hotel?.name || ''} onChange={(event) => updateHotel('name', event.target.value)} />
                </label>
                <label>
                  City
                  <input value={preview.hotel?.city || ''} onChange={(event) => updateHotel('city', event.target.value)} />
                </label>
                <HotelCategoryCombobox
                  label="Category"
                  hotelCategories={hotelCategories}
                  value={preview.hotel?.hotelCategoryId || ''}
                  onChange={updateHotelCategoryId}
                  placeholder="Search active categories"
                />
                {!preview.hotel?.hotelCategoryId ? (
                  <p className="form-helper">
                    {preview.hotel?.category && preview.hotel.category !== 'Unclassified'
                      ? `Imported category "${preview.hotel.category}" is not linked to a standard category. Select one before approval.`
                      : 'Select a standard hotel category before approval.'}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="section-header">
            <h3>Rates</h3>
            <button className="secondary-button" type="button" onClick={addRate}>
              Add rate
            </button>
          </div>
          <PreviewList title="Room categories" items={preview.roomCategories || []} empty="No room categories extracted." />
          <PreviewList title="Seasons" items={preview.seasons || []} empty="No seasons extracted." />
          {preview.rates.length === 0 ? <p className="empty-state">No rates extracted yet. Add rates before approval if needed.</p> : null}
          {preview.rates.length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{preview.contractType === 'HOTEL' ? 'Room' : 'Service/Route'}</th>
                    <th>Season</th>
                    <th>Occupancy</th>
                    <th>Meal</th>
                    <th>Cost</th>
                    <th>Currency</th>
                    <th>Pricing Basis</th>
                    <th>Tax %</th>
                    <th>Service %</th>
                    <th>Tax Incl.</th>
                    <th>Svc Incl.</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rates.map((rate, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          value={preview.contractType === 'TRANSPORT' ? rate.routeName || '' : rate.roomType || rate.serviceName || ''}
                          onChange={(event) =>
                            updateRate(index, preview.contractType === 'TRANSPORT' ? 'routeName' : preview.contractType === 'HOTEL' ? 'roomType' : 'serviceName', event.target.value)
                          }
                        />
                      </td>
                      <td><input value={rate.seasonName || ''} onChange={(event) => updateRate(index, 'seasonName', event.target.value)} /></td>
                      <td><input value={rate.occupancyType || ''} onChange={(event) => updateRate(index, 'occupancyType', event.target.value)} /></td>
                      <td><input value={rate.mealPlan || ''} onChange={(event) => updateRate(index, 'mealPlan', event.target.value)} /></td>
                      <td><input value={String(rate.cost ?? '')} onChange={(event) => updateRate(index, 'cost', event.target.value)} inputMode="decimal" /></td>
                      <td><input value={rate.currency || ''} onChange={(event) => updateRate(index, 'currency', event.target.value.toUpperCase())} /></td>
                      <td>
                        <select value={rate.pricingBasis || 'PER_ROOM'} onChange={(event) => updateRate(index, 'pricingBasis', event.target.value)}>
                          <option value="PER_ROOM">PER_ROOM</option>
                          <option value="PER_PERSON">PER_PERSON</option>
                        </select>
                      </td>
                      <td><input value={String(rate.salesTaxPercent ?? '')} onChange={(event) => updateRate(index, 'salesTaxPercent', event.target.value)} inputMode="decimal" /></td>
                      <td><input value={String(rate.serviceChargePercent ?? '')} onChange={(event) => updateRate(index, 'serviceChargePercent', event.target.value)} inputMode="decimal" /></td>
                      <td>
                        <select value={String(Boolean(rate.salesTaxIncluded))} onChange={(event) => updateRate(index, 'salesTaxIncluded', event.target.value)}>
                          <option value="false">No</option>
                          <option value="true">Yes</option>
                        </select>
                      </td>
                      <td>
                        <select value={String(Boolean(rate.serviceChargeIncluded))} onChange={(event) => updateRate(index, 'serviceChargeIncluded', event.target.value)}>
                          <option value="false">No</option>
                          <option value="true">Yes</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <MealPlansPreview mealPlans={preview.mealPlans || []} />
          <TaxesPreview taxes={preview.taxes} />
          <SupplementsPreview supplements={preview.supplements} currency={preview.contract.currency} />
          <section>
            <div className="section-header">
              <h3>Rate policies</h3>
              <button className="secondary-button" type="button" onClick={addRatePolicy}>
                Add rate policy
              </button>
            </div>
            {(preview.ratePolicies || []).length === 0 ? <p className="empty-state">No rate policies extracted.</p> : null}
            {(preview.ratePolicies || []).length > 0 ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Policy Type</th>
                      <th>Applies To</th>
                      <th>Age From</th>
                      <th>Age To</th>
                      <th>Amount</th>
                      <th>Percent</th>
                      <th>Currency</th>
                      <th>Pricing Basis</th>
                      <th>Meal Plan</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.ratePolicies || []).map((policy, index) => (
                      <tr key={index}>
                        <td>
                          <select value={policy.policyType} onChange={(event) => updateRatePolicy(index, 'policyType', event.target.value)}>
                            <option value="CHILD_FREE">Child free</option>
                            <option value="CHILD_DISCOUNT">Child discount</option>
                            <option value="CHILD_EXTRA_BED">Child extra bed</option>
                            <option value="MEAL_SUPPLEMENT">Meal supplement</option>
                            <option value="MINIMUM_STAY">Minimum stay</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </td>
                        <td><input value={policy.appliesTo || ''} onChange={(event) => updateRatePolicy(index, 'appliesTo', event.target.value)} /></td>
                        <td><input value={String(policy.ageFrom ?? '')} onChange={(event) => updateRatePolicy(index, 'ageFrom', event.target.value)} inputMode="numeric" /></td>
                        <td><input value={String(policy.ageTo ?? '')} onChange={(event) => updateRatePolicy(index, 'ageTo', event.target.value)} inputMode="numeric" /></td>
                        <td><input value={String(policy.amount ?? '')} onChange={(event) => updateRatePolicy(index, 'amount', event.target.value)} inputMode="decimal" /></td>
                        <td><input value={String(policy.percent ?? '')} onChange={(event) => updateRatePolicy(index, 'percent', event.target.value)} inputMode="decimal" /></td>
                        <td><input value={policy.currency || ''} onChange={(event) => updateRatePolicy(index, 'currency', event.target.value.toUpperCase())} /></td>
                        <td>
                          <select value={policy.pricingBasis || 'PER_ROOM'} onChange={(event) => updateRatePolicy(index, 'pricingBasis', event.target.value)}>
                            <option value="PER_ROOM">Per room</option>
                            <option value="PER_PERSON">Per person</option>
                          </select>
                        </td>
                        <td><input value={policy.mealPlan || ''} onChange={(event) => updateRatePolicy(index, 'mealPlan', event.target.value.toUpperCase())} /></td>
                        <td><input value={policy.notes || ''} onChange={(event) => updateRatePolicy(index, 'notes', event.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
          <section>
            <div className="section-header">
              <h3>Cancellation policy</h3>
              <button className="secondary-button" type="button" onClick={addCancellationRule}>
                Add cancellation rule
              </button>
            </div>
            {!preview.cancellationPolicy ? <p className="empty-state">No cancellation policy extracted.</p> : null}
            {preview.cancellationPolicy ? (
              <div className="section-stack">
                <div className="form-grid">
                  <label>
                    Summary
                    <input
                      value={preview.cancellationPolicy.summary || ''}
                      onChange={(event) => updateCancellationPolicy('summary', event.target.value)}
                    />
                  </label>
                  <label>
                    Notes
                    <input
                      value={preview.cancellationPolicy.notes || ''}
                      onChange={(event) => updateCancellationPolicy('notes', event.target.value)}
                    />
                  </label>
                </div>
                {(preview.cancellationPolicy.rules || []).length > 0 ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Days before arrival</th>
                          <th>Penalty %</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(preview.cancellationPolicy.rules || []).map((rule, index) => (
                          <tr key={index}>
                            <td>
                              <input
                                value={String(rule.daysBefore ?? rule.windowFromValue ?? '')}
                                onChange={(event) => updateCancellationRule(index, 'daysBefore', event.target.value)}
                                inputMode="numeric"
                              />
                            </td>
                            <td>
                              <input
                                value={String(rule.penaltyPercent ?? (rule.penaltyType === 'PERCENT' ? rule.penaltyValue ?? '' : ''))}
                                onChange={(event) => updateCancellationRule(index, 'penaltyPercent', event.target.value)}
                                inputMode="decimal"
                              />
                            </td>
                            <td>
                              <input
                                value={rule.notes || ''}
                                onChange={(event) => updateCancellationRule(index, 'notes', event.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty-state">No cancellation rules extracted.</p>
                )}
              </div>
            ) : null}
          </section>
          <ChildPolicyPreview value={preview.childPolicy} />
          <PoliciesPreview policies={preview.policies} />
        </section>
      ) : null}
    </div>
  );
}

function PreviewList({ title, items, empty }: { title: string; items: Array<Record<string, unknown>>; empty: string }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length === 0 ? <p className="empty-state">{empty}</p> : null}
      {items.length > 0 ? (
        <div className="summary-strip">
          {items.map((item, index) => (
            <div className="summary-card" key={index}>
              {Object.entries(item)
                .map(([key, value]) => [key, formatPreviewValue(value)] as const)
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <p key={key}>
                    <span>{humanizeKey(key)}</span>
                    <strong>{value}</strong>
                  </p>
                ))}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TaxesPreview({ taxes }: { taxes: ContractPreview['taxes'] }) {
  return (
    <section>
      <h3>Taxes and service charges:</h3>
      {taxes.length === 0 ? <p className="empty-state">No taxes defined</p> : null}
      {taxes.length > 0 ? (
        <div className="summary-strip">
          {taxes.map((tax) => (
            <div className="summary-card" key={tax.name}>
              <p>
                <span>{tax.name}</span>
                <strong>{Number(tax.value).toFixed(2)}%</strong>
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MealPlansPreview({ mealPlans }: { mealPlans: NonNullable<ContractPreview['mealPlans']> }) {
  return (
    <section>
      <h3>Meal plans</h3>
      {mealPlans.length === 0 ? <p className="empty-state">No meal plans extracted.</p> : null}
      {mealPlans.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Meal plan</th>
                <th>Default</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {mealPlans.map((mealPlan, index) => (
                <tr key={`${mealPlan.code}-${index}`}>
                  <td>{mealPlan.code || 'Meal plan'}</td>
                  <td>{mealPlan.isDefault ? 'Yes' : 'No'}</td>
                  <td>{mealPlan.notes || 'No notes'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function SupplementsPreview({ supplements, currency }: { supplements: ContractPreview['supplements']; currency: string }) {
  return (
    <section>
      <h3>Supplements and add-ons</h3>
      {supplements.length === 0 ? <p className="empty-state">No supplements extracted.</p> : null}
      {supplements.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplement</th>
                <th>Amount</th>
                <th>Pricing basis</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {supplements.map((supplement, index) => (
                <tr key={`${supplement.name}-${index}`}>
                  <td>{supplement.name || 'Supplement'}</td>
                  <td>{formatMoney(supplement.amount, currency) || 'No amount'}</td>
                  <td>{formatEnumLabel(supplement.pricingBasis) || 'Not specified'}</td>
                  <td>{supplement.notes || 'No notes'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function PoliciesPreview({ policies }: { policies: ContractPreview['policies'] }) {
  return (
    <section>
      <h3>Policies</h3>
      {policies.length === 0 ? <p className="empty-state">No policies extracted.</p> : null}
      {policies.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Policy type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy, index) => (
                <tr key={`${policy.name}-${index}`}>
                  <td>{policy.name || 'Policy'}</td>
                  <td>{policy.value || 'No description'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ChildPolicyPreview({ value }: { value?: ChildPolicyPreviewValue | null }) {
  const items =
    value?.items?.length
      ? value.items
      : value?.rules?.map((rule) => ({ label: inferChildPolicyLabel(rule), description: rule })) || [];

  return (
    <section>
      <h3>Child policy</h3>
      {items.length === 0 ? <p className="empty-state">No child policy extracted.</p> : null}
      {items.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Policy area</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={`${item.label}-${index}`}>
                  <td>{item.label}</td>
                  <td>{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function ExtractionDiagnostics({ diagnostics }: { diagnostics?: ContractPreview['parserDiagnostics'] }) {
  if (!diagnostics) return null;
  const detectedHotels = diagnostics.detectedHotels || [];
  const detectedTables = diagnostics.detectedTables || [];
  const skippedSections = diagnostics.skippedSections || [];
  const warnings = diagnostics.warnings || [];

  return (
    <section>
      <h3>Extraction diagnostics</h3>
      <div className="summary-strip">
        <div className="summary-card">
          <p><span>Source</span><strong>{diagnostics.extractionMode || diagnostics.source || 'Unknown'}</strong></p>
          <p><span>Confidence</span><strong>{diagnostics.confidence !== undefined ? `${Math.round(diagnostics.confidence * 100)}%` : 'Not scored'}</strong></p>
        </div>
        <div className="summary-card">
          <p><span>Detected hotels</span><strong>{detectedHotels.length}</strong></p>
          <p><span>Detected tables</span><strong>{detectedTables.length}</strong></p>
        </div>
        <div className="summary-card">
          <p><span>Parsed lines</span><strong>{diagnostics.parsedTextLineCount || 0}</strong></p>
          <p><span>Skipped sections</span><strong>{skippedSections.length}</strong></p>
        </div>
      </div>
      {detectedHotels.length > 0 ? <PreviewList title="Detected hotels" items={detectedHotels.map((name) => ({ name }))} empty="No hotels detected." /> : null}
      {detectedTables.length > 0 ? <PreviewList title="Detected tables" items={detectedTables} empty="No tables detected." /> : null}
      {skippedSections.length > 0 ? <PreviewList title="Skipped sections" items={skippedSections} empty="No skipped sections." /> : null}
      {warnings.length > 0 ? (
        <div className="warning-list">
          {warnings.map((warning) => (
            <p key={warning} className="empty-state">{warning}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ImportPreviewSummary({ preview, warnings }: { preview: ContractPreview; warnings: Warning[] }) {
  const roomCount = preview.roomCategories?.length || new Set(preview.rates.map((rate) => rate.roomType).filter(Boolean)).size;
  const seasonCount = preview.seasons?.length || new Set(preview.rates.map((rate) => rate.seasonName).filter(Boolean)).size;
  const unresolvedCandidates = (preview.assistedExtraction?.rateCandidates || []).filter((candidate) => {
    const mapped = preview.assistedExtraction?.blocks.some((block) => block.approved && (block.rateCandidateIds || []).includes(candidate.id));
    return !mapped;
  }).length;
  const blockerCount = warnings.filter((warning) => warning.severity === 'blocker').length;
  const warningCount = warnings.filter((warning) => warning.severity === 'warning').length;
  const infoCount = warnings.filter((warning) => warning.severity === 'info').length;

  return (
    <section>
      <h3>Import preview summary</h3>
      <div className="summary-strip">
        <div className="summary-card">
          <p><span>Seasons</span><strong>{seasonCount}</strong></p>
          <p><span>Room categories</span><strong>{roomCount}</strong></p>
        </div>
        <div className="summary-card">
          <p><span>Rates</span><strong>{preview.rates.length}</strong></p>
          <p><span>Supplements</span><strong>{preview.supplements.length}</strong></p>
        </div>
        <div className="summary-card">
          <p><span>Cancellation</span><strong>{preview.cancellationPolicy ? 'Present' : 'Missing'}</strong></p>
          <p><span>Child policy</span><strong>{preview.childPolicy ? 'Present' : 'Missing'}</strong></p>
        </div>
        <div className="summary-card">
          <p><span>Unresolved candidates</span><strong>{unresolvedCandidates}</strong></p>
          <p><span>Validation</span><strong>{blockerCount} / {warningCount} / {infoCount}</strong></p>
        </div>
      </div>
    </section>
  );
}

function AssistedExtractionReview({
  assistedExtraction,
  onUpdateBlock,
  onUpdateMapping,
}: {
  assistedExtraction?: AssistedExtractionPreview;
  onUpdateBlock: (blockId: string, patch: Partial<AssistedExtractionBlock>) => void;
  onUpdateMapping: (blockId: string, role: AssistedColumnRole, sourceColumn: string) => void;
}) {
  if (!assistedExtraction) return null;
  const qcWarnings = buildAssistedQcWarnings(assistedExtraction);
  const roomRateBlocks = assistedExtraction.blocks.filter((block) => block.tag === 'ROOM_RATE_TABLE' || block.suggestedTag === 'ROOM_RATE_TABLE');
  const rateCandidates = assistedExtraction.rateCandidates || [];

  return (
    <section>
      <div className="section-header">
        <div>
          <h3>Semi-assisted PDF extraction</h3>
          <p>Review detected blocks, tag their purpose, map rate columns, then export a normalized workbook for one hotel at a time.</p>
        </div>
      </div>

      <div className="warning-list">
        {qcWarnings.map((warning) => (
          <p key={`${warning.field}-${warning.message}`} className={warning.severity === 'blocker' ? 'form-error' : 'empty-state'}>
            {warning.message}
          </p>
        ))}
      </div>

      {rateCandidates.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Parsed interpretation</th>
                <th>Raw extracted row</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {rateCandidates.slice(0, 80).map((candidate) => (
                <tr key={candidate.id}>
                  <td>{candidate.lineNumber}</td>
                  <td>
                    <strong>{candidate.detectedRoom || 'Room not detected'}</strong>
                    <p className="empty-state">
                      {[candidate.detectedSeason, candidate.detectedDateRange, candidate.detectedMealPlan, candidate.detectedOccupancy]
                        .filter(Boolean)
                        .join(' | ') || 'No season/meal/occupancy context'}
                    </p>
                    <p className="empty-state">Values: {(candidate.detectedNumericValues || []).join(', ') || 'None'}</p>
                  </td>
                  <td>
                    <pre className="raw-preview-block">{candidate.rawLine}</pre>
                  </td>
                  <td>{Math.round((candidate.confidence || 0) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Block</th>
              <th>Detected text</th>
              <th>Tag</th>
              <th>Approved</th>
            </tr>
          </thead>
          <tbody>
            {assistedExtraction.blocks.map((block) => (
              <tr key={block.id}>
                <td>
                  <strong>{block.label}</strong>
                  <p className="empty-state">
                    {block.kind} {block.lineStart ? `| lines ${block.lineStart}-${block.lineEnd || block.lineStart}` : ''}
                  </p>
                  {block.suggestedTag ? <p className="empty-state">Suggested: {formatEnumLabel(block.suggestedTag)}</p> : null}
                </td>
                <td>
                  <pre className="raw-preview-block">{block.text.slice(0, 1800)}</pre>
                </td>
                <td>
                  <select
                    value={block.tag || ''}
                    onChange={(event) => onUpdateBlock(block.id, { tag: (event.target.value || undefined) as AssistedBlockTag | undefined })}
                  >
                    <option value="">Unmapped</option>
                    {assistedBlockTagOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(block.approved)}
                      onChange={(event) => onUpdateBlock(block.id, { approved: event.target.checked })}
                    />
                    QC passed
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {roomRateBlocks.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Room/rate block</th>
                {assistedColumnRoleOptions.map((role) => (
                  <th key={role.value}>{role.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roomRateBlocks.map((block) => {
                const sourceColumns = Array.from(new Set([...(block.columns || []), ...(block.rows?.[0] || [])].filter(Boolean)));
                return (
                  <tr key={`mapping-${block.id}`}>
                    <td>{block.label}</td>
                    {assistedColumnRoleOptions.map((role) => (
                      <td key={`${block.id}-${role.value}`}>
                        <select
                          value={block.mappings?.[role.value] || ''}
                          onChange={(event) => onUpdateMapping(block.id, role.value, event.target.value)}
                        >
                          <option value="">Not mapped</option>
                          {sourceColumns.map((column) => (
                            <option key={`${block.id}-${role.value}-${column}`} value={column}>
                              {column}
                            </option>
                          ))}
                          <option value="manual">Manual entry</option>
                        </select>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function PreviewObject({ title, value, empty }: { title: string; value?: Record<string, unknown> | null; empty: string }) {
  if (!value || Object.keys(value).length === 0) {
    return (
      <section>
        <h3>{title}</h3>
        <p className="empty-state">{empty}</p>
      </section>
    );
  }

  return (
    <section>
      <h3>{title}</h3>
      <pre className="raw-preview-block">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}
