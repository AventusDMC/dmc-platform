import { getPlannerCategoryForService, normalizeServiceTaxonomyText } from '../../lib/service-taxonomy';

export type QuoteReadinessStep = 'overview' | 'itinerary' | 'services' | 'pricing' | 'group-pricing' | 'review' | 'preview';
export type QuotePricingFocus =
  | 'all'
  | 'unpriced'
  | 'missing-cost'
  | 'missing-sell'
  | 'missing-currency'
  | 'margin-risk';

export type QuoteReadinessServiceType = {
  id: string;
  name: string;
  code: string | null;
  isActive?: boolean;
};

export type QuoteReadinessService = {
  id: string;
  supplierId: string;
  name: string;
  category: string;
  serviceType?: QuoteReadinessServiceType | null;
};

export type QuoteReadinessItem = {
  id: string;
  serviceId?: string | null;
  activityId?: string | null;
  activityRateVariantId?: string | null;
  ticketRateVariantId?: string | null;
  itineraryId: string | null;
  serviceDate: string | null;
  startTime: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  participantCount: number | null;
  adultCount: number | null;
  childCount: number | null;
  reconfirmationRequired: boolean;
  reconfirmationDueAt: string | null;
  paxCount: number | null;
  totalCost: number;
  totalSell: number;
  currency?: string | null;
  service: QuoteReadinessService | null;
  externalPackageCountry?: string | null;
  externalPackageName?: string | null;
  externalSupplierName?: string | null;
  externalPricingBasis?: string | null;
  externalNetCost?: number | null;
  externalPackagePricingMatrixJson?: unknown;
  externalPackageSingleSupplement?: number | null;
  externalIncludes?: string | null;
  externalExcludes?: string | null;
  externalInternalNotes?: string | null;
  externalHotelsOrSimilar?: string | null;
  externalClientDescription?: string | null;
  hotel?: {
    name: string;
  } | null;
  pricingDescription?: string | null;
  packageTemplateComponentId?: string | null;
  excursionTemplateComponentId?: string | null;
};

export type QuoteReadinessDay = {
  id: string;
  dayNumber: number;
  title: string;
  description: string | null;
};

export type QuoteReadinessOption = {
  id: string;
  name: string;
  quoteItems: QuoteReadinessItem[];
};

export type QuoteReadinessQuote = {
  id: string;
  quoteType: 'FIT' | 'GROUP';
  travelStartDate: string | null;
  nightCount?: number | null;
  pricingMode: 'SLAB' | 'FIXED';
  fixedPricePerPerson: number;
  pricingSlabs: Array<{ id: string }>;
  scenarios: Array<{ id: string }>;
  itineraries: QuoteReadinessDay[];
  quoteItems: QuoteReadinessItem[];
  quoteOptions: QuoteReadinessOption[];
};

export type QuoteReadinessIssue = {
  id: string;
  severity: 'blocker' | 'warning' | 'cleanup';
  code:
    | 'day-no-services'
    | 'overnight-no-hotel'
    | 'city-change-no-transport'
    | 'arrival-departure-no-transfer'
    | 'service-missing-price'
    | 'service-zero-sell'
    | 'unresolved-imported-item'
    | 'service-unassigned-day'
    | 'service-low-margin'
    | 'service-negative-margin'
    | 'possible-duplicate-priced-service'
    | 'service-missing-currency'
    | 'service-date-outside-trip'
    | 'service-operational-details-missing'
    | 'pricing-configuration';
  title: string;
  description: string;
  href: string;
  source: string;
  dayId?: string;
  itemId?: string;
  action?: QuoteIssueAction;
};

export type QuoteIssueAction =
  | {
      type: 'navigate';
      step: QuoteReadinessStep;
      href: string;
    }
  | {
      type: 'focus-day';
      step: 'services';
      href: string;
      dayId: string;
    }
  | {
      type: 'add-service';
      step: 'services';
      href: string;
      dayId: string;
      category: ServicePlannerCategory;
    }
  | {
      type: 'focus-pricing';
      step: 'pricing';
      href: string;
      focus: QuotePricingFocus;
    };

export type QuoteReadinessSuggestion = {
  id: string;
  category: ServicePlannerCategory;
  title: string;
  description: string;
};

export type QuoteReadinessDaySummary = {
  day: QuoteReadinessDay;
  items: QuoteReadinessItem[];
  inferredCity: string | null;
  categories: ServicePlannerCategory[];
  blockers: QuoteReadinessIssue[];
  warnings: QuoteReadinessIssue[];
  cleanupItems: QuoteReadinessIssue[];
  suggestions: QuoteReadinessSuggestion[];
  unpricedCount: number;
  unresolvedCount: number;
  completionPercent: number;
  status: 'blocked' | 'warning' | 'ready';
};

export type QuoteReadinessModel = {
  blockers: QuoteReadinessIssue[];
  warnings: QuoteReadinessIssue[];
  cleanupItems: QuoteReadinessIssue[];
  statusLabel: 'Draft' | 'In Progress' | 'Needs Review' | 'Ready to Share';
  completionPercent: number;
  totalDays: number;
  totalServices: number;
  unresolvedItems: number;
  unpricedServices: number;
  unassignedSuppliers: number;
  daySummaries: QuoteReadinessDaySummary[];
  unassignedItems: QuoteReadinessItem[];
};

export type ServicePlannerCategory = 'hotel' | 'transport' | 'guide' | 'activity' | 'ticketing' | 'meal' | 'externalPackage' | 'other';

type BuildWorkspaceHref = (step: QuoteReadinessStep, params?: Record<string, string | null | undefined>) => string;
type QuoteWorkspaceStepTarget = 'overview' | 'itinerary' | 'services' | 'pricing' | 'review';
type QuoteWorkspaceStep = QuoteReadinessStep;

const QUOTE_STEP_TARGET_TABS: Record<QuoteWorkspaceStep, QuoteWorkspaceStepTarget> = {
  overview: 'overview',
  itinerary: 'itinerary',
  services: 'services',
  pricing: 'pricing',
  'group-pricing': 'pricing',
  review: 'review',
  preview: 'review',
};

const IMPORTED_SERVICE_SUPPLIER_ID = 'import-itinerary-system';

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getQuoteServiceCategoryKey(
  service: (Pick<QuoteReadinessService, 'category' | 'serviceType'> & { name?: string | null }) | null | undefined,
  item?: Pick<
    QuoteReadinessItem,
    | 'externalPackageCountry'
    | 'externalPackageName'
    | 'externalSupplierName'
    | 'externalPricingBasis'
    | 'externalNetCost'
    | 'externalPackagePricingMatrixJson'
    | 'externalPackageSingleSupplement'
    | 'externalIncludes'
    | 'externalExcludes'
    | 'externalInternalNotes'
    | 'externalHotelsOrSimilar'
    | 'externalClientDescription'
    | 'activityId'
    | 'activityRateVariantId'
  >,
): ServicePlannerCategory {
  const hasExternalPackagePayload = Boolean(
    item?.externalPackageName ||
      item?.externalPackageCountry ||
      item?.externalSupplierName ||
      item?.externalClientDescription ||
      item?.externalIncludes ||
      item?.externalExcludes ||
      item?.externalInternalNotes ||
      item?.externalHotelsOrSimilar ||
      item?.externalPricingBasis ||
      (item?.externalNetCost !== null && item?.externalNetCost !== undefined) ||
      (Array.isArray(item?.externalPackagePricingMatrixJson) && item.externalPackagePricingMatrixJson.length > 0) ||
      (item?.externalPackageSingleSupplement !== null && item?.externalPackageSingleSupplement !== undefined),
  );

  if (hasExternalPackagePayload) {
    return 'externalPackage';
  }

  if (item?.activityId || item?.activityRateVariantId) {
    return 'activity';
  }

  if (!service) {
    return 'other';
  }

  if (service.serviceType) {
    return getPlannerCategoryForService({ serviceType: service.serviceType }) as ServicePlannerCategory;
  }

  if (hasLegacyMealSignal(service.name) || hasLegacyMealSignal(service.category)) {
    return 'meal';
  }

  return getPlannerCategoryForService({ category: service.category }) as ServicePlannerCategory;
}

function hasLegacyMealSignal(value: string | null | undefined) {
  const normalized = normalizeServiceTaxonomyText(value);

  return (
    normalized.includes('meal') ||
    normalized.includes('dining') ||
    normalized.includes('breakfast') ||
    normalized.includes('lunch') ||
    normalized.includes('dinner') ||
    normalized.includes('restaurant') ||
    normalized.includes('food')
  );
}

export function isImportedQuoteService(item: Pick<QuoteReadinessItem, 'service'>) {
  return item.service?.supplierId === IMPORTED_SERVICE_SUPPLIER_ID;
}

function getQuoteReadinessItemName(item: QuoteReadinessItem) {
  return item.service?.name || 'External Country Package';
}

export function isQuoteServiceMissingPrice(item: Pick<QuoteReadinessItem, 'totalCost' | 'totalSell' | 'paxCount'>) {
  return item.totalCost <= 0 || item.totalSell <= 0 || !item.paxCount;
}

function isMissingCurrency(item: Pick<QuoteReadinessItem, 'currency'>) {
  return !item.currency || !item.currency.trim();
}

function isNegativeMargin(item: Pick<QuoteReadinessItem, 'totalCost' | 'totalSell'>) {
  return item.totalSell < item.totalCost;
}

function isLowMargin(item: Pick<QuoteReadinessItem, 'totalCost' | 'totalSell'>) {
  if (item.totalSell <= 0 || item.totalCost <= 0 || item.totalSell <= item.totalCost) {
    return false;
  }

  const marginPercent = ((item.totalSell - item.totalCost) / item.totalSell) * 100;
  return marginPercent < 15;
}

function isZeroSell(item: Pick<QuoteReadinessItem, 'totalSell'>) {
  return item.totalSell <= 0;
}

function buildPossibleDuplicateServiceKey(item: QuoteReadinessItem) {
  if (item.totalCost <= 0 && item.totalSell <= 0) {
    return null;
  }

  return [
    item.itineraryId || 'unassigned',
    item.packageTemplateComponentId || item.excursionTemplateComponentId || item.serviceId || item.activityId || item.ticketRateVariantId || 'manual',
    item.service?.name || item.hotel?.name || item.externalPackageName || 'service',
    item.pricingDescription || '',
    item.paxCount ?? '',
    Number(item.totalCost || 0).toFixed(2),
    Number(item.totalSell || 0).toFixed(2),
  ].join('|');
}

function findPossibleDuplicatePricedServices(items: QuoteReadinessItem[]) {
  const groups = new Map<string, QuoteReadinessItem[]>();

  for (const item of items) {
    const key = buildPossibleDuplicateServiceKey(item);

    if (!key) {
      continue;
    }

    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }

  return [...groups.values()].filter((group) => group.length > 1);
}

function normalizeDateOnly(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function buildTripEndDate(quote: Pick<QuoteReadinessQuote, 'travelStartDate' | 'nightCount' | 'itineraries'>) {
  const tripStart = normalizeDateOnly(quote.travelStartDate);

  if (!tripStart) {
    return null;
  }

  const dayCount = Math.max(quote.itineraries.length, (quote.nightCount ?? 0) + 1, 1);
  const tripEnd = new Date(tripStart);
  tripEnd.setUTCDate(tripEnd.getUTCDate() + dayCount - 1);
  tripEnd.setUTCHours(0, 0, 0, 0);
  return tripEnd;
}

export function getAllQuoteServices(quote: Pick<QuoteReadinessQuote, 'quoteItems' | 'quoteOptions'>) {
  return [...quote.quoteItems, ...quote.quoteOptions.flatMap((option) => option.quoteItems)];
}

export function buildQuoteWorkspaceHref(
  quoteId: string,
  step: QuoteWorkspaceStep,
  params?: Record<string, string | null | undefined>,
) {
  const search = new URLSearchParams();
  search.set('tab', QUOTE_STEP_TARGET_TABS[step]);
  search.set('step', step);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  return `/quotes/${quoteId}?${search.toString()}`;
}

function buildIssueHref(
  buildStepHref: BuildWorkspaceHref,
  step: QuoteReadinessStep,
  params?: Record<string, string | null | undefined>,
) {
  return buildStepHref(step, params);
}

function buildDayNarrative(day: QuoteReadinessDay) {
  return `${day.title} ${day.description || ''}`.trim();
}

function hasAnySignal(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function extractCityHint(day: QuoteReadinessDay) {
  const text = buildDayNarrative(day);
  const patterns = [
    /\bovernight in\s+([a-z][a-z\s-]{1,40})/i,
    /\barriv(?:e|al)\s+in\s+([a-z][a-z\s-]{1,40})/i,
    /\bdepart(?:ure)?\s+from\s+([a-z][a-z\s-]{1,40})/i,
    /\bin\s+([a-z][a-z\s-]{1,40})/i,
    /\bto\s+([a-z][a-z\s-]{1,40})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return titleCase(match[1].replace(/[|,.;:]+.*$/, '').trim());
    }
  }

  return null;
}

function dedupeIssues(issues: QuoteReadinessIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.dayId || ''}:${issue.itemId || ''}:${issue.href}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function deriveQuoteStatusLabel(values: {
  blockers: QuoteReadinessIssue[];
  warnings: QuoteReadinessIssue[];
  cleanupItems: QuoteReadinessIssue[];
  completionPercent: number;
  totalDays: number;
  totalServices: number;
}) {
  if (
    values.blockers.length === 0 &&
    values.warnings.length === 0 &&
    values.cleanupItems.length === 0 &&
    values.completionPercent >= 85
  ) {
    return 'Ready to Share' as const;
  }

  if (values.blockers.length === 0) {
    return 'Needs Review' as const;
  }

  if (values.totalDays === 0 && values.totalServices === 0) {
    return 'Draft' as const;
  }

  if (values.completionPercent <= 25) {
    return 'Draft' as const;
  }

  return 'In Progress' as const;
}

export function buildQuoteReadinessModel(
  quote: QuoteReadinessQuote,
  buildStepHref: BuildWorkspaceHref,
): QuoteReadinessModel {
  const allItems = getAllQuoteServices(quote);
  const sortedDays = [...quote.itineraries].sort((left, right) => left.dayNumber - right.dayNumber);
  const blockers: QuoteReadinessIssue[] = [];
  const warnings: QuoteReadinessIssue[] = [];
  const cleanupItems: QuoteReadinessIssue[] = [];
  const unassignedItems = allItems.filter((item) => !item.itineraryId);
  const unresolvedItems = allItems.filter(isImportedQuoteService).length;
  const unpricedServices = allItems.filter(isQuoteServiceMissingPrice).length;
  const unassignedSuppliers = unresolvedItems;
  const tripStart = normalizeDateOnly(quote.travelStartDate);
  const tripEnd = buildTripEndDate(quote);
  const isGroupQuote = quote.quoteType === 'GROUP';

  const arrivalPatterns = [/\barrival\b/i, /\barrive\b/i, /\bairport\b/i];
  const departurePatterns = [/\bdeparture\b/i, /\bdepart\b/i, /\bleave\b/i, /\bcheckout\b/i];
  const overnightPatterns = [/\bovernight\b/i, /\bstay\b/i, /\bcheck-?in\b/i];

  const daySummaries = sortedDays.map((day) => {
    const items = allItems.filter((item) => item.itineraryId === day.id);
    const categories = Array.from(new Set(items.map((item) => getQuoteServiceCategoryKey(item.service, item))));
    const text = buildDayNarrative(day);
    const hasHotel = categories.includes('hotel');
    const hasTransport = categories.includes('transport');
    const dayBlockers: QuoteReadinessIssue[] = [];
    const dayWarnings: QuoteReadinessIssue[] = [];
    const suggestions: QuoteReadinessSuggestion[] = [];

    if (items.length === 0) {
      const href = buildIssueHref(buildStepHref, 'services', { day: day.id, addCategory: 'activity' });
      dayBlockers.push({
        id: `day-no-services-${day.id}`,
        severity: 'blocker',
        code: 'day-no-services',
        title: `Day ${day.dayNumber} has no services`,
        description: 'Add at least one service so the day can be priced and reviewed.',
        href,
        source: 'Service Planner',
        dayId: day.id,
        action: { type: 'add-service', step: 'services', href, dayId: day.id, category: 'activity' },
      });
      suggestions.push({
        id: `day-fill-${day.id}`,
        category: 'activity',
        title: 'Plan the day',
        description: 'Add the first service for this day to start pricing and review.',
      });
    }

    if (hasAnySignal(text, overnightPatterns) && !hasHotel) {
      const href = buildIssueHref(buildStepHref, 'services', { day: day.id, addCategory: 'hotel' });
      dayBlockers.push({
        id: `overnight-no-hotel-${day.id}`,
        severity: 'blocker',
        code: 'overnight-no-hotel',
        title: `Day ${day.dayNumber} looks overnight but has no hotel`,
        description: 'Add a hotel or accommodation service for the overnight stop.',
        href,
        source: 'Service Planner',
        dayId: day.id,
        action: { type: 'add-service', step: 'services', href, dayId: day.id, category: 'hotel' },
      });
      suggestions.push({
        id: `hotel-${day.id}`,
        category: 'hotel',
        title: 'Add hotel',
        description: 'This day looks like an overnight stay and should usually include accommodation.',
      });
    }

    if ((hasAnySignal(text, arrivalPatterns) || hasAnySignal(text, departurePatterns)) && !hasTransport) {
      const href = buildIssueHref(buildStepHref, 'services', { day: day.id, addCategory: 'transport' });
      const issue: QuoteReadinessIssue = {
        id: `transfer-${day.id}`,
        severity: isGroupQuote ? 'blocker' : 'warning',
        code: 'arrival-departure-no-transfer',
        title: `Day ${day.dayNumber} has arrival or departure without transfer`,
        description: isGroupQuote
          ? 'Add a transfer or transport service for airport or station movement.'
          : 'Review whether this FIT needs transfer coverage for airport or station movement.',
        href,
        source: 'Service Planner',
        dayId: day.id,
        action: { type: 'add-service', step: 'services', href, dayId: day.id, category: 'transport' },
      };

      if (isGroupQuote) {
        dayBlockers.push(issue);
      } else {
        dayWarnings.push(issue);
      }

      suggestions.push({
        id: `transfer-${day.id}`,
        category: 'transport',
        title: isGroupQuote ? 'Add transfer' : 'Review transfer',
        description: isGroupQuote
          ? 'Arrival and departure days should usually include transport coverage.'
          : 'Add transport only when this FIT quote includes private transfer arrangements.',
      });
    }

    return {
      day,
      items,
      inferredCity: extractCityHint(day),
      categories,
      blockers: dayBlockers,
      warnings: dayWarnings,
      cleanupItems: [],
      suggestions,
      unpricedCount: items.filter(isQuoteServiceMissingPrice).length,
      unresolvedCount: items.filter(isImportedQuoteService).length,
      completionPercent: 0,
      status: 'ready',
    };
  });

  for (const [index, summary] of daySummaries.entries()) {
    blockers.push(...summary.blockers);
    warnings.push(...summary.warnings);

    const nextSummary = daySummaries[index + 1];
    if (!nextSummary || !summary.inferredCity || !nextSummary.inferredCity || summary.inferredCity === nextSummary.inferredCity) {
      continue;
    }

    const hasTransport = summary.categories.includes('transport') || nextSummary.categories.includes('transport');

    if (!hasTransport) {
      const href = buildIssueHref(buildStepHref, 'services', { day: summary.day.id, addCategory: 'transport' });
      const issue: QuoteReadinessIssue = {
        id: `city-change-${summary.day.id}-${nextSummary.day.id}`,
        severity: isGroupQuote ? 'blocker' : 'warning',
        code: 'city-change-no-transport',
        title: `City change from ${summary.inferredCity} to ${nextSummary.inferredCity} has no transport`,
        description: isGroupQuote
          ? 'Add a transport or transfer service across the day change before sharing the quote.'
          : 'Review whether this FIT quote needs private transport across the city change.',
        href,
        source: 'Service Planner',
        dayId: summary.day.id,
        action: { type: 'add-service', step: 'services', href, dayId: summary.day.id, category: 'transport' },
      };

      if (isGroupQuote) {
        blockers.push(issue);
      } else {
        warnings.push(issue);
      }

      summary.suggestions.push({
        id: `city-change-transport-${summary.day.id}`,
        category: 'transport',
        title: isGroupQuote ? 'Add intercity transport' : 'Review intercity transport',
        description: isGroupQuote
          ? `The itinerary moves from ${summary.inferredCity} to ${nextSummary.inferredCity} without a transport service.`
          : `The itinerary moves from ${summary.inferredCity} to ${nextSummary.inferredCity}; add transport only if it is included in the FIT package.`,
      });
    }
  }

  for (const item of allItems) {
    if (isQuoteServiceMissingPrice(item)) {
      const missingCost = item.totalCost <= 0;
      const missingSell = item.totalSell <= 0;
      const focus: QuotePricingFocus = missingCost ? 'missing-cost' : missingSell ? 'missing-sell' : 'unpriced';
      const href = buildIssueHref(buildStepHref, 'pricing', { pricingFocus: focus });
      blockers.push({
        id: `item-price-${item.id}`,
        severity: 'blocker',
        code: 'service-missing-price',
        title: `${getQuoteReadinessItemName(item)} is missing cost or sell price`,
        description: 'Complete cost, sell, and pax inputs before preview or share.',
        href,
        source: 'Pricing',
        itemId: item.id,
        dayId: item.itineraryId || undefined,
        action: { type: 'focus-pricing', step: 'pricing', href, focus },
      });
    }

    if (isZeroSell(item)) {
      const href = buildIssueHref(buildStepHref, 'pricing', { pricingFocus: 'margin-risk' });
      warnings.push({
        id: `item-zero-sell-${item.id}`,
        severity: 'warning',
        code: 'service-zero-sell',
        title: `${getQuoteReadinessItemName(item)} has zero sell price`,
        description: 'Review commercial setup because the service currently contributes no sell value.',
        href,
        source: 'Pricing',
        itemId: item.id,
        dayId: item.itineraryId || undefined,
        action: { type: 'focus-pricing', step: 'pricing', href, focus: 'margin-risk' },
      });
    }

    if (isImportedQuoteService(item)) {
      const href = buildIssueHref(buildStepHref, 'services', {
        day: item.itineraryId || undefined,
        addCategory: getQuoteServiceCategoryKey(item.service, item),
      });
      cleanupItems.push({
        id: `item-import-${item.id}`,
        severity: 'cleanup',
        code: 'unresolved-imported-item',
        title: `${getQuoteReadinessItemName(item)} is still unresolved from import`,
        description: 'Assign a real supplier service or remove the placeholder before sharing.',
        href,
        source: 'Service Planner',
        itemId: item.id,
        dayId: item.itineraryId || undefined,
        action: item.itineraryId
          ? { type: 'focus-day', step: 'services', href, dayId: item.itineraryId }
          : { type: 'navigate', step: 'services', href },
      });
    }

    if (isMissingCurrency(item)) {
      const href = buildIssueHref(buildStepHref, 'pricing', { pricingFocus: 'missing-currency' });
      warnings.push({
        id: `item-currency-${item.id}`,
        severity: 'warning',
        code: 'service-missing-currency',
        title: `${getQuoteReadinessItemName(item)} has no currency`,
        description: 'Add or correct currency before relying on the commercial totals.',
        href,
        source: 'Pricing',
        itemId: item.id,
        dayId: item.itineraryId || undefined,
        action: { type: 'focus-pricing', step: 'pricing', href, focus: 'missing-currency' },
      });
    }

    if (tripStart && tripEnd) {
      const serviceDate = normalizeDateOnly(item.serviceDate);

      if (serviceDate && (serviceDate.getTime() < tripStart.getTime() || serviceDate.getTime() > tripEnd.getTime())) {
        const href = buildIssueHref(buildStepHref, 'services', { day: item.itineraryId || undefined });
        warnings.push({
          id: `item-date-outside-trip-${item.id}`,
          severity: 'warning',
          code: 'service-date-outside-trip',
          title: `${getQuoteReadinessItemName(item)} falls outside the trip range`,
          description: 'Check the service date because it is outside the current quote travel window.',
          href,
          source: 'Service Planner',
          itemId: item.id,
          dayId: item.itineraryId || undefined,
          action: item.itineraryId
            ? { type: 'focus-day', step: 'services', href, dayId: item.itineraryId }
            : { type: 'navigate', step: 'services', href },
        });
      }
    }

    const category = getQuoteServiceCategoryKey(item.service, item);
    const tracksOperationalDetails = category === 'activity' || category === 'ticketing' || category === 'transport';
    const missingTime = !item.startTime && !item.pickupTime;
    const missingLocation = !item.pickupLocation && !item.meetingPoint;

    if (tracksOperationalDetails && (missingTime || missingLocation)) {
      const href = buildIssueHref(buildStepHref, 'services', { day: item.itineraryId || undefined, addCategory: category });
      const missing = [
        missingTime ? 'start or pickup time' : null,
        missingLocation ? 'pickup location or meeting point' : null,
      ].filter(Boolean).join(' and ');

      warnings.push({
        id: `item-operational-${item.id}`,
        severity: 'warning',
        code: 'service-operational-details-missing',
        title: `${getQuoteReadinessItemName(item)} has operational details missing`,
        description: `Add ${missing} before booking handoff or final operations.`,
        href,
        source: 'Operations Readiness',
        itemId: item.id,
        dayId: item.itineraryId || undefined,
        action: item.itineraryId
          ? { type: 'focus-day', step: 'services', href, dayId: item.itineraryId }
          : { type: 'navigate', step: 'services', href },
      });
    }

    if (isNegativeMargin(item)) {
      const href = buildIssueHref(buildStepHref, 'pricing', { pricingFocus: 'margin-risk' });
      warnings.push({
        id: `item-negative-margin-${item.id}`,
        severity: 'warning',
        code: 'service-negative-margin',
        title: `${getQuoteReadinessItemName(item)} has negative margin`,
        description: 'This service is being sold below cost and should be reviewed before sending.',
        href,
        source: 'Pricing',
        itemId: item.id,
        dayId: item.itineraryId || undefined,
        action: { type: 'focus-pricing', step: 'pricing', href, focus: 'margin-risk' },
      });
    }

    if (!item.itineraryId) {
      const href = buildIssueHref(buildStepHref, 'services');
      cleanupItems.push({
        id: `item-unassigned-${item.id}`,
        severity: 'cleanup',
        code: 'service-unassigned-day',
        title: `${getQuoteReadinessItemName(item)} is not assigned to a day`,
        description: 'Assign the service to a day so it appears in the day-by-day review.',
        href,
        source: 'Service Planner',
        itemId: item.id,
        action: { type: 'navigate', step: 'services', href },
      });
    }

    if (isLowMargin(item)) {
      const href = buildIssueHref(buildStepHref, 'pricing', { pricingFocus: 'margin-risk' });
      warnings.push({
        id: `item-low-margin-${item.id}`,
        severity: 'warning',
        code: 'service-low-margin',
        title: `${getQuoteReadinessItemName(item)} has low margin`,
        description: 'Review commercials before sending the quote.',
        href,
        source: 'Pricing',
        itemId: item.id,
        dayId: item.itineraryId || undefined,
        action: { type: 'focus-pricing', step: 'pricing', href, focus: 'margin-risk' },
      });
    }
  }

  for (const duplicates of findPossibleDuplicatePricedServices(allItems)) {
    const firstItem = duplicates[0];
    const href = buildIssueHref(buildStepHref, 'services', { day: firstItem.itineraryId || undefined });
    warnings.push({
      id: `item-duplicate-priced-${firstItem.id}`,
      severity: 'warning',
      code: 'possible-duplicate-priced-service',
      title: `Possible duplicate priced service: ${getQuoteReadinessItemName(firstItem)} appears ${duplicates.length} times`,
      description: 'Review the duplicate priced rows before conversion. This warning is non-blocking and no rows are removed automatically.',
      href,
      source: 'Service Planner',
      itemId: firstItem.id,
      dayId: firstItem.itineraryId || undefined,
      action: firstItem.itineraryId
        ? { type: 'focus-day', step: 'services', href, dayId: firstItem.itineraryId }
        : { type: 'navigate', step: 'services', href },
    });
  }

  if (quote.pricingMode === 'SLAB' && (quote.pricingSlabs.length === 0 || quote.scenarios.length === 0)) {
    const href = buildIssueHref(buildStepHref, 'group-pricing');
    blockers.push({
      id: 'pricing-configuration-slab',
      severity: 'blocker',
      code: 'pricing-configuration',
      title: 'Group pricing is incomplete',
      description: 'Add pricing slabs and generate scenarios before preview or share.',
      href,
      source: 'Group Pricing',
      action: { type: 'navigate', step: 'group-pricing', href },
    });
  }

  if (quote.pricingMode === 'FIXED' && quote.fixedPricePerPerson <= 0) {
    const href = buildIssueHref(buildStepHref, 'group-pricing');
    blockers.push({
      id: 'pricing-configuration-fixed',
      severity: 'blocker',
      code: 'pricing-configuration',
      title: 'Fixed pricing is incomplete',
      description: 'Set a fixed price per person before preview or share.',
      href,
      source: 'Group Pricing',
      action: { type: 'navigate', step: 'group-pricing', href },
    });
  }

  const dedupedBlockers = dedupeIssues(blockers);
  const dedupedWarnings = dedupeIssues(warnings);
  const dedupedCleanupItems = dedupeIssues(cleanupItems);
  const daysWithServices = daySummaries.filter((summary) => summary.items.length > 0).length;
  const resolvedServices = allItems.filter((item) => !isImportedQuoteService(item) && !isQuoteServiceMissingPrice(item)).length;
  const pricingConfigured =
    quote.pricingMode === 'SLAB' ? quote.pricingSlabs.length > 0 && quote.scenarios.length > 0 : quote.fixedPricePerPerson > 0;
  const totalCheckpoints = Math.max(sortedDays.length, 1) + Math.max(allItems.length, 1) + 3;
  const completedCheckpoints =
    daysWithServices + resolvedServices + (pricingConfigured ? 1 : 0) + (unresolvedItems === 0 ? 1 : 0) + (dedupedBlockers.length === 0 ? 1 : 0);
  const completionPercent = Math.max(0, Math.min(100, Math.round((completedCheckpoints / totalCheckpoints) * 100)));

  const daySummariesWithStatus = daySummaries.map((summary) => {
    const serviceTarget = Math.max(summary.items.length, summary.suggestions.length || 1);
    const resolvedItems = summary.items.filter((item) => !isImportedQuoteService(item) && !isQuoteServiceMissingPrice(item)).length;
    const itemCompletion = serviceTarget > 0 ? Math.round((resolvedItems / serviceTarget) * 100) : 100;
    const blockerCount = dedupedBlockers.filter((issue) => issue.dayId === summary.day.id).length;
    const warningCount = dedupedWarnings.filter((issue) => issue.dayId === summary.day.id).length;
    return {
      ...summary,
      blockers: dedupedBlockers.filter((issue) => issue.dayId === summary.day.id && issue.severity === 'blocker'),
      warnings: dedupedWarnings.filter((issue) => issue.dayId === summary.day.id && issue.severity === 'warning'),
      cleanupItems: dedupedCleanupItems.filter((issue) => issue.dayId === summary.day.id && issue.severity === 'cleanup'),
      completionPercent: Math.max(0, Math.min(100, itemCompletion)),
      status: blockerCount > 0 ? ('blocked' as const) : warningCount > 0 ? ('warning' as const) : ('ready' as const),
    };
  });

  return {
    blockers: dedupedBlockers,
    warnings: dedupedWarnings,
    cleanupItems: dedupedCleanupItems,
    statusLabel: deriveQuoteStatusLabel({
      blockers: dedupedBlockers,
      warnings: dedupedWarnings,
      cleanupItems: dedupedCleanupItems,
      completionPercent,
      totalDays: sortedDays.length,
      totalServices: allItems.length,
    }),
    completionPercent,
    totalDays: sortedDays.length,
    totalServices: allItems.length,
    unresolvedItems,
    unpricedServices,
    unassignedSuppliers,
    daySummaries: daySummariesWithStatus,
    unassignedItems,
  };
}
