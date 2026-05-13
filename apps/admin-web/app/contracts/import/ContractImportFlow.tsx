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
  detectedHotel?: string;
  detectedRoom?: string;
  possibleRoom?: string;
  roomName?: string;
  detectedMealPlan?: string;
  detectedOccupancy?: string;
  detectedSeason?: string;
  detectedDateRange?: string;
  detectedNumericValues: number[];
  sourceLines?: Array<number | string>;
  rejectionReason?: string;
  reviewStatus?: 'APPROVED' | 'REJECTED';
  confidence: number;
  mappingSuggestions: Partial<Record<AssistedColumnRole, string>>;
};

type AssistedRateCandidateRejection = {
  lineNumber: number;
  rawLine: string;
  detectedHotel?: string;
  possibleRoom?: string;
  possibleMealPlan?: string;
  possibleOccupancy?: string;
  possibleSeason?: string;
  possibleDateRange?: string;
  possiblePriceValues: number[];
  sourceLines: number[];
  confidence: number;
  rejectionReason: string;
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
  rejectedRateCandidates?: AssistedRateCandidateRejection[];
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
    rateCandidateRejections?: AssistedRateCandidateRejection[];
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

type GuidedStepStatus = 'complete' | 'review' | 'blocked';

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

function getGuidedStatusLabel(status: GuidedStepStatus) {
  if (status === 'complete') return 'Complete';
  if (status === 'blocked') return 'Blocked';
  return 'Needs Review';
}

function getGuidedStatusClass(status: GuidedStepStatus) {
  if (status === 'complete') return 'guided-status guided-status-complete';
  if (status === 'blocked') return 'guided-status guided-status-blocked';
  return 'guided-status guided-status-review';
}

function formatMoney(value: unknown, currency?: string | null): string {
  const amount = optionalNumber(value);
  if (amount === null) return '';
  return [currency, amount.toLocaleString(undefined, { maximumFractionDigits: 2 })].filter(Boolean).join(' ');
}

function collectDetectedHotelNames(preview: ContractPreview): string[] {
  const names = [
    ...(preview.multiProperty?.hotels || []).map((hotelPreview) => hotelPreview.hotel?.name || hotelPreview.supplier?.name || ''),
    ...(preview.multiProperty?.normalizedWorkbooks || []).map((workbook) => workbook.hotelName),
    ...(preview.parserDiagnostics?.detectedHotels || []),
    ...(preview.assistedExtraction?.lineClassifications || [])
      .filter((line) => line.type === 'HOTEL_NAME')
      .map((line) => line.rawLine),
    preview.hotel?.name || '',
  ];
  return Array.from(new Set(names.map((name) => String(name || '').trim()).filter(Boolean)));
}

function getSelectedHotelPreview(preview: ContractPreview, hotelName: string): ContractPreview {
  const normalizedName = normalizeCategoryName(hotelName);
  const selected = (preview.multiProperty?.hotels || []).find((hotelPreview) => {
    const candidates = [hotelPreview.hotel?.name, hotelPreview.supplier?.name, hotelPreview.contract?.name];
    return candidates.some((candidate) => normalizeCategoryName(candidate) === normalizedName);
  });

  if (!selected) {
    return preview;
  }
  const approvedRoomCategories = preview.roomCategories || [];
  const selectedRoomCategories = selected.roomCategories || [];
  const roomCategories = [
    ...selectedRoomCategories,
    ...approvedRoomCategories.filter(
      (approvedRoom) => !selectedRoomCategories.some((selectedRoom) => normalizeCategoryName(selectedRoom.name) === normalizeCategoryName(approvedRoom.name)),
    ),
  ];

  return {
    ...preview,
    ...selected,
    roomCategories,
    multiProperty: undefined,
    parserDiagnostics: preview.parserDiagnostics,
    assistedExtraction: preview.assistedExtraction,
  };
}

function getRoomCandidateNames(preview: ContractPreview): string[] {
  const names = [
    ...(preview.roomCategories || []).map((room) => room.name),
    ...preview.rates.map((rate) => rate.roomType || ''),
    ...(preview.assistedExtraction?.rateCandidates || []).map((candidate) => getCandidateRoomName(candidate)),
  ];
  return Array.from(new Set(names.map((name) => String(name || '').trim()).filter(Boolean)));
}

function detectRoomNameFromText(value: unknown): string {
  const line = String(value || '')
    .replace(/\b(JOD|USD|EUR|BB|HB|FB|SGL|DBL|TPL|TRP)\b/gi, ' ')
    .replace(/\d+(?:,\d{3})*(?:\.\d+)?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const match = line.match(
    /\b((?:classic|superior|deluxe|premium|family|executive|junior|standard|grand|royal|presidential|king|queen|twin)\s+(?:room|suite|chalet|villa)|(?:junior|executive|family|grand|royal|presidential)\s+suite|(?:classic|superior|deluxe|premium|family|executive|standard|grand|king|queen|twin)(?:\s+room)?|chalet|villa|suite)\b/i,
  );
  if (!match) return '';
  const raw = match[1];
  const needsRoomSuffix = /\b(classic|superior|deluxe|premium|family|executive|standard|grand|king|queen|twin)\b/i.test(raw) && !/\b(room|suite|chalet|villa)\b/i.test(raw);
  return `${raw}${needsRoomSuffix ? ' Room' : ''}`.replace(/\s+/g, ' ').trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getCandidateRoomName(candidate: Partial<AssistedRateCandidate> & Record<string, unknown>): string {
  const direct =
    candidate.detectedRoom ||
    candidate.possibleRoom ||
    candidate.roomName ||
    (candidate.mappingSuggestions && typeof candidate.mappingSuggestions === 'object'
      ? String((candidate.mappingSuggestions as Partial<Record<AssistedColumnRole, string>>).ROOM_CATEGORY || '')
      : '');
  if (String(direct || '').trim()) return String(direct).trim();
  const rawLineRoom = detectRoomNameFromText(candidate.rawLine);
  if (rawLineRoom) return rawLineRoom;
  const sourceLines = Array.isArray(candidate.sourceLines) ? candidate.sourceLines : [];
  return sourceLines.map((line) => detectRoomNameFromText(line)).find(Boolean) || '';
}

function getRoomCandidateGroups(preview: ContractPreview, selectedHotelName: string) {
  const candidates = preview.assistedExtraction?.rateCandidates || [];
  const groups = new Map<
    string,
    {
      originalName: string;
      detectedHotel?: string;
      sourceLines: number[];
      values: number[];
      confidence: number;
      count: number;
      approved: boolean;
    }
  >();
  for (const candidate of candidates) {
    const roomName = getCandidateRoomName(candidate).trim();
    if (!roomName) continue;
    if (selectedHotelName && candidate.detectedHotel && normalizeCategoryName(candidate.detectedHotel) !== normalizeCategoryName(selectedHotelName)) continue;
    const key = normalizeCategoryName(roomName);
    const existing = groups.get(key);
    const sourceLines = (candidate.sourceLines || [candidate.lineNumber])
      .map((line) => Number(line))
      .filter((line) => Number.isFinite(line));
    if (existing) {
      existing.sourceLines = Array.from(new Set([...existing.sourceLines, ...sourceLines])).sort((left, right) => left - right);
      existing.values = Array.from(new Set([...existing.values, ...(candidate.detectedNumericValues || [])]));
      existing.confidence = Math.max(existing.confidence, candidate.confidence || 0);
      existing.count += 1;
    } else {
      groups.set(key, {
        originalName: roomName,
        detectedHotel: candidate.detectedHotel,
        sourceLines,
        values: candidate.detectedNumericValues || [],
        confidence: candidate.confidence || 0,
        count: 1,
        approved: (preview.roomCategories || []).some((room) => normalizeCategoryName(room.name) === key),
      });
    }
  }
  return Array.from(groups.values()).sort((left, right) => right.confidence - left.confidence || left.originalName.localeCompare(right.originalName));
}

function getMealPlanCodes(preview: ContractPreview): string[] {
  const codes = [
    ...(preview.mealPlans || []).map((mealPlan) => mealPlan.code),
    ...preview.rates.map((rate) => rate.mealPlan || ''),
    ...(preview.assistedExtraction?.rateCandidates || []).map((candidate) => candidate.detectedMealPlan || ''),
  ];
  return Array.from(new Set(codes.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean)));
}

function findSeasonOverlaps(seasons: NonNullable<ContractPreview['seasons']>) {
  const dated = seasons
    .map((season, index) => ({
      index,
      name: season.name || `Season ${index + 1}`,
      from: season.validFrom ? Date.parse(season.validFrom) : Number.NaN,
      to: season.validTo ? Date.parse(season.validTo) : Number.NaN,
    }))
    .filter((season) => Number.isFinite(season.from) && Number.isFinite(season.to));
  const overlaps: string[] = [];
  for (let index = 0; index < dated.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < dated.length; compareIndex += 1) {
      const current = dated[index];
      const compare = dated[compareIndex];
      if (current.from <= compare.to && compare.from <= current.to) {
        overlaps.push(`${current.name} overlaps ${compare.name}`);
      }
    }
  }
  return overlaps;
}

function getFestiveSeasonWarnings(seasons: NonNullable<ContractPreview['seasons']>) {
  return seasons
    .filter((season) => /festive|christmas|new\s*year|eid|ramadan/i.test(`${season.name || ''} ${season.validFrom || ''} ${season.validTo || ''}`))
    .map((season) => season.name || 'Festive season');
}

function getGuidedStepStatus(options: { blocker?: boolean; review?: boolean }): GuidedStepStatus {
  if (options.blocker) return 'blocked';
  if (options.review) return 'review';
  return 'complete';
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
  const [activeAssistedStep, setActiveAssistedStep] = useState(0);
  const [selectedAssistedHotelName, setSelectedAssistedHotelName] = useState('');

  const assistedWarnings = useMemo(() => buildAssistedQcWarnings(preview.assistedExtraction), [preview.assistedExtraction]);
  const warnings = useMemo(() => [...(contractImport?.warnings || []), ...assistedWarnings], [contractImport, assistedWarnings]);
  const blockers = warnings.filter((warning) => warning.severity === 'blocker');
  const isMultiPropertyPreview = Boolean(preview.multiProperty?.detected);
  const isAssistedExtractionPreview = Boolean(preview.assistedExtraction?.importDisabled);
  const detectedAssistedHotelNames = useMemo(() => collectDetectedHotelNames(preview), [preview]);
  const selectedAssistedHotel = selectedAssistedHotelName || detectedAssistedHotelNames[0] || '';

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
      console.info('[contract-imports/analyze] extracted preview shape', {
        roomCategoriesLength: mappedPreview.roomCategories?.length || 0,
        rateCandidatesLength: mappedPreview.assistedExtraction?.rateCandidates?.length || 0,
        firstRateCandidates: (mappedPreview.assistedExtraction?.rateCandidates || []).slice(0, 5).map((candidate) => ({
          detectedRoom: candidate.detectedRoom,
          possibleRoom: candidate.possibleRoom,
          roomName: candidate.roomName,
          mappingRoomCategory: candidate.mappingSuggestions?.ROOM_CATEGORY,
          rawLine: candidate.rawLine,
          sourceLines: candidate.sourceLines,
        })),
      });
      setActiveAssistedStep(0);
      setSelectedAssistedHotelName('');
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

  function updateRoomCategory(index: number, field: 'name' | 'code' | 'description', value: string) {
    setPreview((current) => ({
      ...current,
      roomCategories: (current.roomCategories || []).map((roomCategory, roomCategoryIndex) =>
        roomCategoryIndex === index ? { ...roomCategory, [field]: value } : roomCategory,
      ),
      rates:
        field === 'name'
          ? current.rates.map((rate) =>
              normalizeCategoryName(rate.roomType) === normalizeCategoryName(current.roomCategories?.[index]?.name) ? { ...rate, roomType: value } : rate,
            )
          : current.rates,
    }));
  }

  function approveRoomCandidate(originalName: string, approvedName: string, sourceLines: number[]) {
    const reviewedName = approvedName.trim();
    if (!reviewedName) return;
    setPreview((current) => {
      const roomCategories = current.roomCategories || [];
      const alreadyApproved = roomCategories.some((roomCategory) => normalizeCategoryName(roomCategory.name) === normalizeCategoryName(reviewedName));
      const nextRoomCategories = alreadyApproved
        ? roomCategories
        : [
            ...roomCategories,
            {
              name: reviewedName,
              code: null,
              description: `Approved from PDF room candidate${sourceLines.length ? ` lines ${sourceLines.join(', ')}` : ''}.`,
              uncertain: false,
            },
          ];
      const nextRates = current.rates.map((rate) =>
        normalizeCategoryName(rate.roomType) === normalizeCategoryName(originalName) ? { ...rate, roomType: reviewedName } : rate,
      );
      const assistedExtraction = current.assistedExtraction
        ? {
            ...current.assistedExtraction,
            rateCandidates: (current.assistedExtraction.rateCandidates || []).map((candidate) =>
              normalizeCategoryName(getCandidateRoomName(candidate)) === normalizeCategoryName(originalName)
                ? {
                    ...candidate,
                    detectedRoom: reviewedName,
                    mappingSuggestions: {
                      ...(candidate.mappingSuggestions || {}),
                      ROOM_CATEGORY: reviewedName,
                    },
                  }
                : candidate,
            ),
          }
        : undefined;
      return {
        ...current,
        roomCategories: nextRoomCategories,
        rates: nextRates,
        assistedExtraction,
      };
    });
  }

  function addManualRoomCategory(roomName: string) {
    const reviewedName = roomName.trim();
    if (!reviewedName) return;
    setPreview((current) => {
      const roomCategories = current.roomCategories || [];
      if (roomCategories.some((roomCategory) => normalizeCategoryName(roomCategory.name) === normalizeCategoryName(reviewedName))) {
        return current;
      }
      return {
        ...current,
        roomCategories: [
          ...roomCategories,
          {
            name: reviewedName,
            code: null,
            description: 'Manually added by operator during assisted PDF review.',
            uncertain: false,
          },
        ],
      };
    });
  }

  function updateSeason(index: number, field: 'name' | 'validFrom' | 'validTo', value: string) {
    setPreview((current) => ({
      ...current,
      seasons: (current.seasons || []).map((season, seasonIndex) => (seasonIndex === index ? { ...season, [field]: value } : season)),
    }));
  }

  function addSeason() {
    setPreview((current) => ({
      ...current,
      seasons: [
        ...(current.seasons || []),
        {
          name: 'Manual season',
          validFrom: current.contract.validFrom || '',
          validTo: current.contract.validTo || '',
          uncertain: true,
        },
      ],
    }));
  }

  function approveSeason(index: number) {
    setPreview((current) => ({
      ...current,
      seasons: (current.seasons || []).map((season, seasonIndex) => (seasonIndex === index ? { ...season, uncertain: false } : season)),
    }));
  }

  function removeSeason(index: number) {
    setPreview((current) => ({
      ...current,
      seasons: (current.seasons || []).filter((_, seasonIndex) => seasonIndex !== index),
    }));
  }

  function addSupplement() {
    setPreview((current) => ({
      ...current,
      supplements: [
        ...current.supplements,
        {
          name: 'Manual supplement',
          amount: null,
          pricingBasis: 'PER_PERSON',
          notes: 'Manually added during guided review.',
          uncertain: true,
        },
      ],
    }));
  }

  function updateSupplement(index: number, field: 'name' | 'amount' | 'pricingBasis' | 'notes', value: string) {
    setPreview((current) => ({
      ...current,
      supplements: current.supplements.map((supplement, supplementIndex) =>
        supplementIndex === index
          ? {
              ...supplement,
              [field]: field === 'amount' ? (value.trim() ? Number(value) || 0 : null) : value,
            }
          : supplement,
      ),
    }));
  }

  function approveSupplement(index: number) {
    setPreview((current) => ({
      ...current,
      supplements: current.supplements.map((supplement, supplementIndex) => (supplementIndex === index ? { ...supplement, uncertain: false } : supplement)),
    }));
  }

  function ignoreSupplement(index: number) {
    setPreview((current) => ({
      ...current,
      policies: [
        ...current.policies,
        {
          name: 'Ignored supplement',
          value: current.supplements[index]?.name || `Supplement ${index + 1}`,
          uncertain: false,
        },
      ],
      supplements: current.supplements.filter((_, supplementIndex) => supplementIndex !== index),
    }));
  }

  function addTax() {
    setPreview((current) => ({
      ...current,
      taxes: [...current.taxes, { name: 'Service note', value: 0, included: false, uncertain: true }],
    }));
  }

  function updateTax(index: number, field: 'name' | 'value' | 'included', value: string) {
    setPreview((current) => ({
      ...current,
      taxes: current.taxes.map((tax, taxIndex) =>
        taxIndex === index
          ? {
              ...tax,
              [field]: field === 'value' ? Number(value) || 0 : field === 'included' ? value === 'true' : value,
              uncertain: false,
            }
          : tax,
      ),
    }));
  }

  function updateChildPolicyNotes(value: string) {
    setPreview((current) => ({
      ...current,
      childPolicy: {
        ...(current.childPolicy || { rules: [] }),
        notes: value,
        rules: current.childPolicy?.rules?.length ? current.childPolicy.rules : value.trim() ? [value] : [],
      },
    }));
  }

  function updateRateCandidate(candidateId: string, patch: Partial<AssistedRateCandidate>) {
    setPreview((current) => {
      if (!current.assistedExtraction) return current;
      return {
        ...current,
        assistedExtraction: {
          ...current.assistedExtraction,
          rateCandidates: (current.assistedExtraction.rateCandidates || []).map((candidate) =>
            candidate.id === candidateId
              ? {
                  ...candidate,
                  ...patch,
                  mappingSuggestions: {
                    ...(candidate.mappingSuggestions || {}),
                    ...(patch.mappingSuggestions || {}),
                  },
                }
              : candidate,
          ),
        },
      };
    });
  }

  function addOperatorNote(step: string, note: string) {
    const trimmed = note.trim();
    if (!trimmed) return;
    setPreview((current) => ({
      ...current,
      policies: [
        ...current.policies,
        {
          name: `Operator note - ${step}`,
          value: trimmed,
          uncertain: false,
        },
      ],
    }));
  }

  function markWarningsReviewed(note: string) {
    setPreview((current) => ({
      ...current,
      policies: [
        ...current.policies,
        {
          name: 'Validation warnings reviewed',
          value: note.trim() || 'Operator reviewed validation warnings and chose to continue with warning.',
          uncertain: false,
        },
      ],
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

  async function handleDownloadExcel(downloadPreview: ContractPreview = preview) {
    if (!contractImport) return;
    setError('');
    try {
      const response = await fetch(`/api/contract-imports/${contractImport.id}/export-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: downloadPreview }),
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
          {isAssistedExtractionPreview ? (
            <>
              <AssistedExtractionWorkflow
                preview={preview}
                warnings={warnings}
                detectedHotelNames={detectedAssistedHotelNames}
                selectedHotelName={selectedAssistedHotel}
                activeStep={activeAssistedStep}
                onStepChange={setActiveAssistedStep}
                onSelectHotel={setSelectedAssistedHotelName}
                onUpdateRoomCategory={updateRoomCategory}
                onApproveRoomCandidate={approveRoomCandidate}
                onAddManualRoomCategory={addManualRoomCategory}
                onAddSeason={addSeason}
                onUpdateSeason={updateSeason}
                onApproveSeason={approveSeason}
                onRemoveSeason={removeSeason}
                onAddSupplement={addSupplement}
                onUpdateSupplement={updateSupplement}
                onApproveSupplement={approveSupplement}
                onIgnoreSupplement={ignoreSupplement}
                onAddTax={addTax}
                onUpdateTax={updateTax}
                onUpdateCancellationPolicy={updateCancellationPolicy}
                onAddCancellationRule={addCancellationRule}
                onUpdateChildPolicyNotes={updateChildPolicyNotes}
                onUpdateRateCandidate={updateRateCandidate}
                onAddOperatorNote={addOperatorNote}
                onMarkWarningsReviewed={markWarningsReviewed}
                onExport={() => void handleDownloadExcel(getSelectedHotelPreview(preview, selectedAssistedHotel))}
              />
              <details className="technical-extraction-details">
                <summary>Show technical extraction details</summary>
                <ExtractionDiagnostics diagnostics={preview.parserDiagnostics} />
                <AssistedExtractionReview
                  assistedExtraction={preview.assistedExtraction}
                  onUpdateBlock={updateAssistedBlock}
                  onUpdateMapping={updateAssistedMapping}
                />
              </details>
            </>
          ) : (
            <>
              <ExtractionDiagnostics diagnostics={preview.parserDiagnostics} />
              <AssistedExtractionReview
                assistedExtraction={preview.assistedExtraction}
                onUpdateBlock={updateAssistedBlock}
                onUpdateMapping={updateAssistedMapping}
              />
            </>
          )}

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
  const rateCandidateRejections = diagnostics.rateCandidateRejections || [];
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
        <div className="summary-card">
          <p><span>Rejected rate lines</span><strong>{rateCandidateRejections.length}</strong></p>
          <p><span>Diagnostics</span><strong>{rateCandidateRejections.length ? 'Review reasons' : 'Clear'}</strong></p>
        </div>
      </div>
      {detectedHotels.length > 0 ? <PreviewList title="Detected hotels" items={detectedHotels.map((name) => ({ name }))} empty="No hotels detected." /> : null}
      {detectedTables.length > 0 ? <PreviewList title="Detected tables" items={detectedTables} empty="No tables detected." /> : null}
      {skippedSections.length > 0 ? <PreviewList title="Skipped sections" items={skippedSections} empty="No skipped sections." /> : null}
      {rateCandidateRejections.length > 0 ? <PreviewList title="Rejected room/rate lines" items={rateCandidateRejections} empty="No rejected rate lines." /> : null}
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
  const blockingWarnings = warnings.filter((warning) => warning.severity === 'blocker' && warning.field !== 'assistedExtraction');
  const blockerCount = blockingWarnings.length;
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

function AssistedExtractionWorkflow({
  preview,
  warnings,
  detectedHotelNames,
  selectedHotelName,
  activeStep,
  onStepChange,
  onSelectHotel,
  onUpdateRoomCategory,
  onApproveRoomCandidate,
  onAddManualRoomCategory,
  onAddSeason,
  onUpdateSeason,
  onApproveSeason,
  onRemoveSeason,
  onAddSupplement,
  onUpdateSupplement,
  onApproveSupplement,
  onIgnoreSupplement,
  onAddTax,
  onUpdateTax,
  onUpdateCancellationPolicy,
  onAddCancellationRule,
  onUpdateChildPolicyNotes,
  onUpdateRateCandidate,
  onAddOperatorNote,
  onMarkWarningsReviewed,
  onExport,
}: {
  preview: ContractPreview;
  warnings: Warning[];
  detectedHotelNames: string[];
  selectedHotelName: string;
  activeStep: number;
  onStepChange: (step: number) => void;
  onSelectHotel: (hotelName: string) => void;
  onUpdateRoomCategory: (index: number, field: 'name' | 'code' | 'description', value: string) => void;
  onApproveRoomCandidate: (originalName: string, approvedName: string, sourceLines: number[]) => void;
  onAddManualRoomCategory: (roomName: string) => void;
  onAddSeason: () => void;
  onUpdateSeason: (index: number, field: 'name' | 'validFrom' | 'validTo', value: string) => void;
  onApproveSeason: (index: number) => void;
  onRemoveSeason: (index: number) => void;
  onAddSupplement: () => void;
  onUpdateSupplement: (index: number, field: 'name' | 'amount' | 'pricingBasis' | 'notes', value: string) => void;
  onApproveSupplement: (index: number) => void;
  onIgnoreSupplement: (index: number) => void;
  onAddTax: () => void;
  onUpdateTax: (index: number, field: 'name' | 'value' | 'included', value: string) => void;
  onUpdateCancellationPolicy: (field: keyof CancellationPolicyPreview, value: string) => void;
  onAddCancellationRule: () => void;
  onUpdateChildPolicyNotes: (value: string) => void;
  onUpdateRateCandidate: (candidateId: string, patch: Partial<AssistedRateCandidate>) => void;
  onAddOperatorNote: (step: string, note: string) => void;
  onMarkWarningsReviewed: (note: string) => void;
  onExport: () => void;
}) {
  const [roomCandidateDrafts, setRoomCandidateDrafts] = useState<Record<string, string>>({});
  const [manualRoomName, setManualRoomName] = useState('');
  const [operatorNotes, setOperatorNotes] = useState<Record<string, string>>({});
  const [warningReviewNote, setWarningReviewNote] = useState('');
  const assisted = preview.assistedExtraction;
  const blockerCount = warnings.filter((warning) => warning.severity === 'blocker' && warning.field !== 'assistedExtraction').length;
  const warningCount = warnings.filter((warning) => warning.severity === 'warning').length;
  const rateCandidates = assisted?.rateCandidates || [];
  const roomCandidates = getRoomCandidateNames(preview);
  const roomCandidateGroups = getRoomCandidateGroups(preview, selectedHotelName);
  const approvedRoomCount = (preview.roomCategories || []).filter((room) => room.name?.trim()).length;
  const mealPlans = getMealPlanCodes(preview);
  const seasonOverlaps = findSeasonOverlaps(preview.seasons || []);
  const festiveSeasons = getFestiveSeasonWarnings(preview.seasons || []);
  const missingMealPlanCount = preview.rates.filter((rate) => !rate.mealPlan).length + rateCandidates.filter((candidate) => !candidate.detectedMealPlan).length;
  const duplicateSupplementNames = Array.from(
    new Set(
      (preview.supplements || [])
        .map((supplement) => normalizeCategoryName(supplement.name))
        .filter((name, index, names) => name && names.indexOf(name) !== index),
    ),
  );
  const selectedWorkbook = (preview.multiProperty?.normalizedWorkbooks || []).find(
    (workbook) => normalizeCategoryName(workbook.hotelName) === normalizeCategoryName(selectedHotelName),
  );
  const policyDetected = Boolean(preview.cancellationPolicy || preview.policies.some((policy) => /cancel/i.test(policy.name)));
  const childPolicyDetected = Boolean(preview.childPolicy || preview.ratePolicies?.some((policy) => String(policy.policyType || '').startsWith('CHILD')));
  const taxesDetected = preview.taxes.length > 0 || preview.policies.some((policy) => /tax|service/i.test(`${policy.name} ${policy.value}`));
  const warningsReviewed = preview.policies.some((policy) => policy.name === 'Validation warnings reviewed');
  const setStepNote = (step: string, value: string) => setOperatorNotes((current) => ({ ...current, [step]: value }));
  const saveStepNote = (step: string) => {
    onAddOperatorNote(step, operatorNotes[step] || '');
    setStepNote(step, '');
  };

  const steps = [
    {
      title: 'Contract Summary',
      status: getGuidedStepStatus({ blocker: blockerCount > 0, review: warningCount > 0 }),
      guidance: 'Confirm the extraction found the expected properties, rates, supplements, and policy sections. Red blockers must be resolved before import; yellow items need operator review before workbook use.',
      body: (
        <div className="guided-summary-grid">
          <GuidedMetric label="Hotels detected" value={detectedHotelNames.length || 0} status={detectedHotelNames.length > 0 ? 'complete' : 'blocked'} />
          <GuidedMetric label="Rate candidates" value={rateCandidates.length || preview.rates.length} status={rateCandidates.length || preview.rates.length ? 'complete' : 'blocked'} />
          <GuidedMetric label="Warnings" value={warningCount} status={warningCount ? 'review' : 'complete'} />
          <GuidedMetric label="Blockers" value={blockerCount} status={blockerCount ? 'blocked' : 'complete'} />
          <GuidedMetric label="Supplements" value={preview.supplements.length} status={preview.supplements.length ? 'complete' : 'review'} />
          <GuidedMetric label="Cancellation policy" value={policyDetected ? 'Detected' : 'Missing'} status={policyDetected ? 'complete' : 'review'} />
          <GuidedMetric label="Child policy" value={childPolicyDetected ? 'Detected' : 'Missing'} status={childPolicyDetected ? 'complete' : 'review'} />
        </div>
      ),
    },
    {
      title: 'Select Hotel',
      status: getGuidedStepStatus({ blocker: detectedHotelNames.length === 0 || !selectedHotelName, review: detectedHotelNames.length > 1 }),
      guidance: 'Choose exactly one property to onboard. Multi-property PDFs should be reviewed and exported one hotel at a time so rates and policies do not cross between hotels.',
      body: (
        <div className="guided-choice-list">
          {detectedHotelNames.length === 0 ? <p className="form-error">No hotel names were confidently detected.</p> : null}
          {detectedHotelNames.map((hotelName) => (
            <label key={hotelName} className={hotelName === selectedHotelName ? 'guided-choice guided-choice-selected' : 'guided-choice'}>
              <input type="radio" name="assisted-hotel" checked={hotelName === selectedHotelName} onChange={() => onSelectHotel(hotelName)} />
              <span>
                <strong>{hotelName}</strong>
                <small>{hotelName === selectedHotelName ? 'Selected for reviewed workbook export' : 'Detected property'}</small>
              </span>
            </label>
          ))}
        </div>
      ),
    },
    {
      title: 'Review Room Categories',
      status: getGuidedStepStatus({ blocker: approvedRoomCount === 0, review: roomCandidateGroups.some((room) => !room.approved) || (preview.roomCategories || []).some((room) => room.uncertain) }),
      guidance: 'Review detected room candidates, rename them if needed, then approve the categories that belong in the selected hotel workbook. Nothing is created until you approve it manually.',
      body: (
        <div className="guided-section-stack">
          {roomCandidateGroups.length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Detected candidate</th>
                    <th>Reviewed name</th>
                    <th>Confidence</th>
                    <th>Source</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {roomCandidateGroups.map((candidate) => {
                    const key = normalizeCategoryName(candidate.originalName);
                    const reviewedName = roomCandidateDrafts[key] ?? candidate.originalName;
                    return (
                      <tr key={key}>
                        <td>
                          <strong>{candidate.originalName}</strong>
                          <p className="empty-state">
                            {[candidate.detectedHotel, `${candidate.count} candidate row(s)`, candidate.values.length ? `Values: ${candidate.values.slice(0, 6).join(', ')}` : 'No values']
                              .filter(Boolean)
                              .join(' | ')}
                          </p>
                        </td>
                        <td>
                          <input
                            value={reviewedName}
                            onChange={(event) => setRoomCandidateDrafts((current) => ({ ...current, [key]: event.target.value }))}
                            aria-label={`Reviewed name for ${candidate.originalName}`}
                          />
                        </td>
                        <td><span className={getGuidedStatusClass(candidate.confidence >= 0.75 ? 'complete' : 'review')}>{Math.round(candidate.confidence * 100)}%</span></td>
                        <td>{candidate.sourceLines.join(', ')}</td>
                        <td>
                          {candidate.approved ? (
                            <span className={getGuidedStatusClass('complete')}>Approved</span>
                          ) : (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => onApproveRoomCandidate(candidate.originalName, reviewedName, candidate.sourceLines)}
                            >
                              Approve room
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">
              {rateCandidates.length > 0
                ? 'Rate candidates found but no room names detected. Open technical details or add room manually.'
                : 'No room candidates were detected for the selected hotel. Review technical extraction details for rejected room/rate lines.'}
            </p>
          )}
          <div className="form-grid">
            <label>
              Manual room category
              <input value={manualRoomName} onChange={(event) => setManualRoomName(event.target.value)} placeholder="e.g. Deluxe Room" />
            </label>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  onAddManualRoomCategory(manualRoomName);
                  setManualRoomName('');
                }}
                disabled={!manualRoomName.trim()}
              >
                Add room category
              </button>
            </div>
          </div>
          {(preview.roomCategories || []).length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reviewed room name</th>
                    <th>Code</th>
                    <th>Description</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.roomCategories || []).map((room, index) => (
                    <tr key={`${room.name}-${index}`}>
                      <td><input value={room.name || ''} onChange={(event) => onUpdateRoomCategory(index, 'name', event.target.value)} /></td>
                      <td><input value={room.code || ''} onChange={(event) => onUpdateRoomCategory(index, 'code', event.target.value)} /></td>
                      <td><input value={room.description || ''} onChange={(event) => onUpdateRoomCategory(index, 'description', event.target.value)} /></td>
                      <td><span className={getGuidedStatusClass(room.uncertain ? 'review' : 'complete')}>{room.uncertain ? 'Review' : 'Safe'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No room categories approved yet. Approve at least one detected candidate to continue.</p>
          )}
          {roomCandidates.length > 0 ? <p className="empty-state">Detected candidates: {roomCandidates.slice(0, 12).join(', ')}</p> : null}
          <GuidedStepNote
            step="Room Categories"
            value={operatorNotes['Room Categories'] || ''}
            onChange={(value) => setStepNote('Room Categories', value)}
            onSave={() => saveStepNote('Room Categories')}
          />
        </div>
      ),
    },
    {
      title: 'Review Meal Plans & Supplements',
      status: getGuidedStepStatus({ blocker: missingMealPlanCount > 0, review: duplicateSupplementNames.length > 0 || preview.supplements.some((supplement) => supplement.uncertain) }),
      guidance: 'Confirm BB, HB, and FB are not mixed with rate inclusions. Watch for duplicated supplements or single supplements counted once as a room rate and again as a supplement.',
      body: (
        <div className="guided-section-stack">
          <div className="guided-chip-row">
            {['BB', 'HB', 'FB'].map((code) => (
              <span key={code} className={getGuidedStatusClass(mealPlans.includes(code) ? 'complete' : 'review')}>
                {code}: {mealPlans.includes(code) ? 'Detected' : 'Not detected'}
              </span>
            ))}
          </div>
          {missingMealPlanCount > 0 ? <p className="form-error">{missingMealPlanCount} rate candidate(s) are missing meal plan context.</p> : null}
          {duplicateSupplementNames.length > 0 ? <p className="empty-state">Possible double-count supplements: {duplicateSupplementNames.join(', ')}</p> : null}
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onAddSupplement}>Add supplement</button>
          </div>
          {(preview.supplements || []).length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Amount</th>
                    <th>Type</th>
                    <th>Notes</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.supplements.map((supplement, index) => (
                    <tr key={`${supplement.name}-${index}`}>
                      <td><input value={supplement.name || ''} onChange={(event) => onUpdateSupplement(index, 'name', event.target.value)} /></td>
                      <td><input value={String(supplement.amount ?? '')} onChange={(event) => onUpdateSupplement(index, 'amount', event.target.value)} inputMode="decimal" /></td>
                      <td>
                        <select value={supplement.pricingBasis || 'PER_PERSON'} onChange={(event) => onUpdateSupplement(index, 'pricingBasis', event.target.value)}>
                          <option value="PER_PERSON">Per person</option>
                          <option value="PER_ROOM">Per room</option>
                        </select>
                      </td>
                      <td><input value={supplement.notes || ''} onChange={(event) => onUpdateSupplement(index, 'notes', event.target.value)} /></td>
                      <td>
                        <div className="button-row">
                          <button className="secondary-button" type="button" onClick={() => onApproveSupplement(index)}>Approve</button>
                          <button className="secondary-button" type="button" onClick={() => onIgnoreSupplement(index)}>Mark ignored</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No supplements extracted. Add one manually or save a note that none apply.</p>
          )}
          <RateCandidateResolutionPanel candidates={rateCandidates} roomCategories={preview.roomCategories || []} onUpdateRateCandidate={onUpdateRateCandidate} />
          <GuidedStepNote
            step="Meal Plans & Supplements"
            value={operatorNotes['Meal Plans & Supplements'] || ''}
            onChange={(value) => setStepNote('Meal Plans & Supplements', value)}
            onSave={() => saveStepNote('Meal Plans & Supplements')}
          />
        </div>
      ),
    },
    {
      title: 'Review Seasons',
      status: getGuidedStepStatus({ blocker: seasonOverlaps.length > 0, review: festiveSeasons.length > 0 || (preview.seasons || []).some((season) => season.uncertain) }),
      guidance: 'Check that date ranges are complete and do not overlap unless the contract clearly uses festive overrides. Festive or holiday rows often need separate manual review.',
      body: (
        <div className="guided-section-stack">
          {seasonOverlaps.length > 0 ? <p className="form-error">Overlapping seasons: {seasonOverlaps.join('; ')}</p> : null}
          {festiveSeasons.length > 0 ? <p className="empty-state">Festive review recommended: {festiveSeasons.join(', ')}</p> : null}
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onAddSeason}>Add season</button>
          </div>
          {(preview.seasons || []).length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.seasons || []).map((season, index) => (
                    <tr key={`${season.name}-${index}`}>
                      <td><input value={season.name || ''} onChange={(event) => onUpdateSeason(index, 'name', event.target.value)} /></td>
                      <td><input type="date" value={season.validFrom || ''} onChange={(event) => onUpdateSeason(index, 'validFrom', event.target.value)} /></td>
                      <td><input type="date" value={season.validTo || ''} onChange={(event) => onUpdateSeason(index, 'validTo', event.target.value)} /></td>
                      <td><span className={getGuidedStatusClass(season.uncertain ? 'review' : 'complete')}>{season.uncertain ? 'Needs Review' : 'Complete'}</span></td>
                      <td>
                        <div className="button-row">
                          <button className="secondary-button" type="button" onClick={() => onApproveSeason(index)}>Approve</button>
                          <button className="secondary-button" type="button" onClick={() => onRemoveSeason(index)}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No seasons extracted. Add a manual season or save a QC note explaining why date ranges are not used.</p>
          )}
          <GuidedStepNote
            step="Seasons"
            value={operatorNotes.Seasons || ''}
            onChange={(value) => setStepNote('Seasons', value)}
            onSave={() => saveStepNote('Seasons')}
          />
        </div>
      ),
    },
    {
      title: 'Review Policies',
      status: getGuidedStepStatus({ review: !policyDetected || !childPolicyDetected || !taxesDetected }),
      guidance: 'Confirm cancellation, child policy, taxes, and service notes are present where the contract includes them. Missing policies can be acceptable only when the source contract truly omits them.',
      body: (
        <div className="guided-section-stack">
          <div className="guided-summary-grid">
            <GuidedMetric label="Cancellation" value={policyDetected ? 'Detected' : 'Missing'} status={policyDetected ? 'complete' : 'review'} />
            <GuidedMetric label="Child policy" value={childPolicyDetected ? 'Detected' : 'Missing'} status={childPolicyDetected ? 'complete' : 'review'} />
            <GuidedMetric label="Taxes/service" value={taxesDetected ? 'Detected' : 'Missing'} status={taxesDetected ? 'complete' : 'review'} />
            <GuidedMetric label="Rate policies" value={preview.ratePolicies?.length || 0} status={preview.ratePolicies?.length ? 'complete' : 'review'} />
          </div>
          <div className="form-grid">
            <label className="wide-field">
              Cancellation summary
              <input value={preview.cancellationPolicy?.summary || ''} onChange={(event) => onUpdateCancellationPolicy('summary', event.target.value)} />
            </label>
            <label className="wide-field">
              Cancellation notes
              <input value={preview.cancellationPolicy?.notes || ''} onChange={(event) => onUpdateCancellationPolicy('notes', event.target.value)} />
            </label>
            <label className="wide-field">
              Child policy notes
              <input value={preview.childPolicy?.notes || preview.childPolicy?.rules?.join('; ') || ''} onChange={(event) => onUpdateChildPolicyNotes(event.target.value)} />
            </label>
          </div>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onAddCancellationRule}>Add cancellation rule</button>
            <button className="secondary-button" type="button" onClick={onAddTax}>Add tax/service note</button>
          </div>
          {(preview.taxes || []).length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tax/service</th>
                    <th>Value %</th>
                    <th>Included</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.taxes.map((tax, index) => (
                    <tr key={`${tax.name}-${index}`}>
                      <td><input value={tax.name || ''} onChange={(event) => onUpdateTax(index, 'name', event.target.value)} /></td>
                      <td><input value={String(tax.value ?? '')} onChange={(event) => onUpdateTax(index, 'value', event.target.value)} inputMode="decimal" /></td>
                      <td>
                        <select value={String(Boolean(tax.included))} onChange={(event) => onUpdateTax(index, 'included', event.target.value)}>
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
          <GuidedStepNote
            step="Policies"
            value={operatorNotes.Policies || ''}
            onChange={(value) => setStepNote('Policies', value)}
            onSave={() => saveStepNote('Policies')}
          />
        </div>
      ),
    },
    {
      title: 'Export Reviewed Workbook',
      status: getGuidedStepStatus({ blocker: !selectedHotelName || blockerCount > 0, review: warningCount > 0 && !warningsReviewed }),
      guidance: 'Export only the selected property after the earlier steps are complete or intentionally accepted for review. Automatic import remains disabled for assisted PDF extraction.',
      body: (
        <div className="guided-export-panel">
          <p><strong>Selected hotel:</strong> {selectedHotelName || 'No hotel selected'}</p>
          {selectedWorkbook ? <p><strong>Workbook:</strong> {selectedWorkbook.fileName}</p> : null}
          {warningCount > 0 ? (
            <div className="form-grid">
              <label className="wide-field">
                Validation warning review note
                <input value={warningReviewNote} onChange={(event) => setWarningReviewNote(event.target.value)} placeholder="Why it is safe to continue with warning" />
              </label>
              <div className="button-row">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    onMarkWarningsReviewed(warningReviewNote);
                    setWarningReviewNote('');
                  }}
                >
                  Mark warnings reviewed
                </button>
              </div>
            </div>
          ) : null}
          <p className="empty-state">This creates a reviewed workbook for operator QC. It does not auto-import the contract.</p>
          <button className="primary-button" type="button" onClick={onExport} disabled={!selectedHotelName || blockerCount > 0}>
            Export reviewed workbook
          </button>
        </div>
      ),
    },
  ];
  const currentStep = steps[Math.min(activeStep, steps.length - 1)] || steps[0];

  return (
    <section className="guided-extraction-workflow">
      <div className="section-header">
        <div>
          <h3>Semi-assisted extraction workflow</h3>
          <p>Follow the steps in order. Parser diagnostics are available below for technical review only.</p>
        </div>
      </div>
      <div className="guided-workflow-layout">
        <ol className="guided-step-list">
          {steps.map((step, index) => (
            <li key={step.title}>
              <button type="button" className={index === activeStep ? 'guided-step-button guided-step-button-active' : 'guided-step-button'} onClick={() => onStepChange(index)}>
                <span>Step {index + 1}</span>
                <strong>{step.title}</strong>
                <em className={getGuidedStatusClass(step.status)}>{getGuidedStatusLabel(step.status)}</em>
              </button>
            </li>
          ))}
        </ol>
        <article className={`guided-step-panel guided-step-panel-${currentStep.status}`}>
          <div className="section-header">
            <div>
              <p className="eyebrow">Step {Math.min(activeStep, steps.length - 1) + 1}</p>
              <h3>{currentStep.title}</h3>
            </div>
            <span className={getGuidedStatusClass(currentStep.status)}>{getGuidedStatusLabel(currentStep.status)}</span>
          </div>
          <p className="guided-step-guidance">{currentStep.guidance}</p>
          {currentStep.body}
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => onStepChange(Math.max(activeStep - 1, 0))} disabled={activeStep === 0}>
              Previous
            </button>
            <button className="secondary-button" type="button" onClick={() => onStepChange(Math.min(activeStep + 1, steps.length - 1))} disabled={activeStep >= steps.length - 1}>
              Next
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

function GuidedMetric({ label, value, status }: { label: string; value: string | number; status: GuidedStepStatus }) {
  return (
    <div className="guided-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <em className={getGuidedStatusClass(status)}>{getGuidedStatusLabel(status)}</em>
    </div>
  );
}

function GuidedStepNote({ step, value, onChange, onSave }: { step: string; value: string; onChange: (value: string) => void; onSave: () => void }) {
  return (
    <div className="form-grid">
      <label className="wide-field">
        Operator note
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={`QC note for ${step}`} />
      </label>
      <div className="button-row">
        <button className="secondary-button" type="button" onClick={onSave} disabled={!value.trim()}>
          Add note
        </button>
      </div>
    </div>
  );
}

function RateCandidateResolutionPanel({
  candidates,
  roomCategories,
  onUpdateRateCandidate,
}: {
  candidates: AssistedRateCandidate[];
  roomCategories: NonNullable<ContractPreview['roomCategories']>;
  onUpdateRateCandidate: (candidateId: string, patch: Partial<AssistedRateCandidate>) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <section>
      <h4>Rate candidate resolution</h4>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Room</th>
              <th>Occupancy</th>
              <th>Meal</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {candidates.slice(0, 40).map((candidate) => (
              <tr key={candidate.id}>
                <td>
                  <strong>{getCandidateRoomName(candidate) || 'Unmapped room'}</strong>
                  <p className="empty-state">Lines {(candidate.sourceLines || [candidate.lineNumber]).join(', ')} | Values {(candidate.detectedNumericValues || []).join(', ') || 'None'}</p>
                </td>
                <td>
                  <select
                    value={candidate.mappingSuggestions?.ROOM_CATEGORY || candidate.detectedRoom || ''}
                    onChange={(event) =>
                      onUpdateRateCandidate(candidate.id, {
                        detectedRoom: event.target.value,
                        mappingSuggestions: { ROOM_CATEGORY: event.target.value },
                      })
                    }
                  >
                    <option value="">Select room</option>
                    {roomCategories.map((room) => (
                      <option key={room.name} value={room.name}>{room.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={candidate.detectedOccupancy || 'DBL'}
                    onChange={(event) => onUpdateRateCandidate(candidate.id, { detectedOccupancy: event.target.value })}
                  >
                    <option value="SGL">SGL</option>
                    <option value="DBL">DBL</option>
                    <option value="TRP">TRP</option>
                    <option value="TPL">TPL</option>
                  </select>
                </td>
                <td>
                  <select
                    value={candidate.detectedMealPlan || 'BB'}
                    onChange={(event) =>
                      onUpdateRateCandidate(candidate.id, {
                        detectedMealPlan: event.target.value,
                        mappingSuggestions: { MEAL_PLAN: event.target.value },
                      })
                    }
                  >
                    <option value="RO">RO</option>
                    <option value="BB">BB</option>
                    <option value="HB">HB</option>
                    <option value="FB">FB</option>
                    <option value="AI">AI</option>
                  </select>
                </td>
                <td>
                  <div className="button-row">
                    <button className="secondary-button" type="button" onClick={() => onUpdateRateCandidate(candidate.id, { reviewStatus: 'APPROVED' })}>Approve</button>
                    <button className="secondary-button" type="button" onClick={() => onUpdateRateCandidate(candidate.id, { reviewStatus: 'REJECTED', rejectionReason: 'Rejected by operator in guided workflow.' })}>Reject</button>
                  </div>
                  {candidate.reviewStatus ? <span className={getGuidedStatusClass(candidate.reviewStatus === 'APPROVED' ? 'complete' : 'review')}>{formatEnumLabel(candidate.reviewStatus)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const rejectedRateCandidates = assistedExtraction.rejectedRateCandidates || [];

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
        <section>
          <h4>Room/Rate Candidate Review</h4>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Possible room</th>
                  <th>Prices</th>
                  <th>Meal</th>
                  <th>Occupancy</th>
                  <th>Source lines</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {rateCandidates.slice(0, 80).map((candidate) => (
                  <tr key={`summary-${candidate.id}`}>
                    <td>{candidate.detectedHotel || 'Unassigned property'}</td>
                    <td>{candidate.detectedRoom || 'Room not detected'}</td>
                    <td>{(candidate.detectedNumericValues || []).join(', ') || 'None'}</td>
                    <td>{candidate.detectedMealPlan || '-'}</td>
                    <td>{candidate.detectedOccupancy || '-'}</td>
                    <td>{(candidate.sourceLines || [candidate.lineNumber]).join(', ')}</td>
                    <td>{Math.round((candidate.confidence || 0) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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
                    {candidate.detectedHotel ? <p className="empty-state">Property: {candidate.detectedHotel}</p> : null}
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

      {rejectedRateCandidates.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Possible interpretation</th>
                <th>Rejection reason</th>
                <th>Raw extracted row</th>
              </tr>
            </thead>
            <tbody>
              {rejectedRateCandidates.slice(0, 80).map((candidate) => (
                <tr key={`rejected-${candidate.lineNumber}-${candidate.rawLine}`}>
                  <td>{candidate.lineNumber}</td>
                  <td>
                    {candidate.detectedHotel ? <p className="empty-state">Property: {candidate.detectedHotel}</p> : null}
                    <strong>{candidate.possibleRoom || 'Room not detected'}</strong>
                    <p className="empty-state">
                      {[candidate.possibleSeason, candidate.possibleDateRange, candidate.possibleMealPlan, candidate.possibleOccupancy]
                        .filter(Boolean)
                        .join(' | ') || 'No season/meal/occupancy context'}
                    </p>
                    <p className="empty-state">Values: {(candidate.possiblePriceValues || []).join(', ') || 'None'}</p>
                    <p className="empty-state">Source lines: {(candidate.sourceLines || [candidate.lineNumber]).join(', ')}</p>
                  </td>
                  <td>{candidate.rejectionReason}</td>
                  <td>
                    <pre className="raw-preview-block">{candidate.rawLine}</pre>
                  </td>
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
