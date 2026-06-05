import { buildProposalPricingViewModel } from './proposal-pricing';
import {
  ProposalV3AccommodationMatrix,
  ProposalV3AccommodationRow,
  ProposalV3Day,
  ProposalV3DayGroup,
  ProposalV3HotelOptionSet,
  ProposalV3InvestmentRow,
  ProposalV3Quote,
  ProposalV3QuoteItem,
  ProposalV3QuotePlannerDay,
  ProposalV3ViewModel,
} from './proposal-v3.types';
import { formatOriginAwareExcursionName } from './excursion-origin-display';
import { deriveDayCountry } from './quote-day-country';
import {
  intlLocale,
  joinProseList,
  localizeSnapshotLabel,
  prosePhrase,
  proposalLabel,
  proposalTextDirection,
  proseTemplate,
  resolveProposalLanguage,
  unitLabel,
  type ProposalLocale,
} from './proposal-i18n';

// Phase 3A: the proposal renders in one of en/pt/es/ar. The mapper runs fully
// synchronously (no awaits), so a module-scoped active locale set at the start
// of mapQuoteToProposalV3 is safe and avoids threading `language` through every
// formatter call site. Defaults to 'en' → English output is unchanged.
let activeProposalLocale: ProposalLocale = 'en';

// Service group keys are INTERNAL (used for grouping/order/fallback switches in
// English); only the displayed label is localized at emit time.
const GROUP_LABEL_KEY: Record<string, Parameters<typeof proposalLabel>[1]> = {
  Stay: 'groupStay',
  Transfer: 'groupTransfer',
  Experience: 'groupExperience',
  Meal: 'groupMeal',
  Guide: 'groupGuide',
  'Partner Package': 'groupPartnerPackage',
  Other: 'groupOther',
};

function localizeGroupLabel(internalLabel: string): string {
  const key = GROUP_LABEL_KEY[internalLabel];
  return key ? proposalLabel(activeProposalLocale, key) : internalLabel;
}

const INVALID_TEXT_PATTERNS = [
  /\bimported itinerary\b/i,
  /\binternal use only\b/i,
  /\bsystem generated\b/i,
  /\bprogram details to be confirmed\b/i,
  /\bservice to be confirmed\b/i,
  /\bqa\b/i,
  /\bdemo\b/i,
  /\btest\b/i,
  /\bmulti[-\s]?currency\b/i,
];

const PLACEHOLDER_TEXT_PATTERNS = [
  /\bto be confirmed\b/i,
  /\bdetails to be confirmed\b/i,
  /\bprice unavailable\b/i,
];

const INTERNAL_COPY_PATTERNS = [
  /\binternal\b/i,
  /\bsupplier\b/i,
  /\bnet\s*(?:cost|rate|price|amount)\b/i,
  /\bcost\s*(?:price|base|amount|total)?\b/i,
  /\bbase\s*cost\b/i,
  /\btotal\s*cost\b/i,
  /\bfinal\s*cost\b/i,
  /\boverride\b/i,
  /\bmarkup\b/i,
  /\bmargin\b/i,
  /\bgross\s*profit\b/i,
  /\bsell\s*price\b/i,
  /\bprofit\b/i,
  /\bcommission\b/i,
  // Guided Quote Builder auto-fills the quote description with internal
  // planning taxonomy ("Built via Guided Quote Builder. Cities: ... Pax: ...
  // Market: ... Budget: ... Style: ..."). The lead phrase is always present,
  // so rejecting it makes the proposal fall back to a generated human journey
  // sentence instead of echoing the raw internal description.
  /\bbuilt via\b/i,
  /\bguided quote builder\b/i,
];

// Internal style/tier decoration the Guided Quote Builder appends to the quote
// title (e.g. "Amman + Petra (7 nights) · Comfort"). The cities + duration are
// fine on the client document; the trailing " · <style>" is internal taxonomy.
const INTERNAL_TITLE_STYLE_DECORATION =
  /\s*[·•|]\s*(?:comfort|premium|luxury|budget(?:[-\s]?conscious)?|standard|economy)\b[^·•|]*$/i;

function stripInternalTitleDecorations(value: string) {
  return value.replace(INTERNAL_TITLE_STYLE_DECORATION, '').trim();
}

const IMPORTED_SERVICE_SUPPLIER_ID = 'import-itinerary-system';
const AXIS_BRAND_NAME = 'AXIS Destination Management';
const AXIS_LOGO_URL = 'https://axisdmc.com/wp-content/uploads/2024/09/Axis-white-logo-2-1024x482.png';
const AXIS_PRIMARY_COLOR = '#1F9ACF';

type ProposalBrandCompany = NonNullable<ProposalV3Quote['brandCompany']>;

function formatProposalMoney(amount: number, currency = 'USD') {
  if (!Number.isFinite(amount)) {
    return currency === 'JOD' ? '0.000 JD' : currency === 'EUR' ? 'EUR 0.00' : '$0.00';
  }

  const locale = intlLocale(activeProposalLocale);

  if (currency === 'USD') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  if (currency === 'EUR') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  if (currency === 'JOD') {
    return `${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount)} JD`;
  }

  return `${currency} ${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function cleanText(value: string | null | undefined) {
  return (value || '')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\bDescription:\s*/gi, '')
    .replace(/\bNotes:\s*/gi, '')
    .replace(/\bTargeted quote for multi[-\s]?currency pricing QA\b/gi, '')
    .replace(/\bTargeted quote for multi[-\s]?currency\b/gi, '')
    .replace(/\bMulti[-\s]?currency Jordan QA quote\b/gi, '')
    .replace(/\bMulti[-\s]?currency QA\b/gi, '')
    .replace(/\bMulti[-\s]?currency\b/gi, '')
    .replace(/\bQA quote\b/gi, '')
    .replace(/\bQA\b/gi, '')
    .replace(/\bTargeted quote for QA\b/gi, '')
    .replace(/\bImported itinerary:\s*/gi, '')
    .replace(/\bImported Drafts?\b/gi, '')
    .replace(/\bImported Itineraries\b/gi, '')
    .replace(/\bImported Activity\b/gi, '')
    .replace(/\bInternal Use Only\b/gi, '')
    .replace(/\bSystem Generated\b/gi, '')
    .replace(/\bDemo\b/gi, '')
    .replace(/\bTest\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanBrandText(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function formatExternalPackagePricingMatrix(value: unknown, currency = 'USD') {
  const rows = Array.isArray(value) ? value : (value as any)?.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const labels = rows
    .map((row: any) => {
      const label = cleanText(row?.label === undefined || row?.label === null ? '' : String(row.label));
      const paxLabel = label || [row?.paxFrom, row?.paxTo].filter((part) => part !== undefined && part !== null && part !== '').join('-');
      const amount = row?.sellPerPerson ?? row?.costPerPerson;
      const amountNumber = Number(amount);
      const amountLabel = Number.isFinite(amountNumber) ? formatProposalMoney(amountNumber, currency) : null;
      return [paxLabel, amountLabel].filter(Boolean).join(': ');
    })
    .filter(Boolean);

  return labels.length > 0 ? `Pricing Matrix: ${labels.join(' | ')}` : null;
}

function normalizeComparisonText(value: string | null | undefined) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWeakText(value: string | null | undefined) {
  const normalized = normalizeComparisonText(value);
  return !normalized || INVALID_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isPlaceholderText(value: string | null | undefined) {
  const normalized = normalizeComparisonText(value);
  return !normalized || PLACEHOLDER_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isClientSafeCopy(value: string | null | undefined) {
  const cleaned = cleanText(value);
  if (!cleaned || isWeakText(cleaned) || isPlaceholderText(cleaned)) {
    return false;
  }

  return !INTERNAL_COPY_PATTERNS.some((pattern) => pattern.test(cleaned));
}

function ensureSentence(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return '';
  }
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function conciseCopy(value: string | null | undefined, maxLength = 130) {
  const cleaned = ensureSentence(cleanText(value));
  if (!cleaned || cleaned.length <= maxLength) {
    return cleaned;
  }

  const sentence = cleaned.match(/^(.+?[.!?])\s/)?.[1];
  if (sentence && sentence.length <= maxLength) {
    return sentence;
  }

  const truncated = cleaned.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
  return truncated ? `${truncated}.` : '';
}

function summarizeDestinations(destinations: string[]) {
  const cleaned = Array.from(new Set(destinations.map((destination) => cleanText(destination)).filter(Boolean)));

  if (cleaned.length === 0) {
    return '';
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  if (cleaned.length === 2) {
    return `${cleaned[0]} and ${cleaned[1]}`;
  }

  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
}

function formatDestinationSubtitle(destinations: string[]) {
  const cleaned = Array.from(new Set(destinations.map((destination) => cleanText(destination)).filter(Boolean)));
  return cleaned.join(' · ');
}

function isGenericRouteLabel(value: string | null | undefined) {
  const normalized = normalizeComparisonText(value);
  return (
    !normalized ||
    /^day\s*\d+$/.test(normalized) ||
    /^destination\s*\d+$/.test(normalized) ||
    /^(arrival|departure|leisure day|program details|program|details|free day|at leisure)$/.test(normalized) ||
    /^(arrival|departure)\s+(day|transfer)?$/.test(normalized)
  );
}

function cleanRouteAnchor(value: string | null | undefined) {
  const cleaned = cleanText(value)
    .replace(/\bairport\b/gi, '')
    .replace(/\bintl\.?\b/gi, '')
    .replace(/\binternational\b/gi, '')
    .replace(/\bhotel\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned && !isGenericRouteLabel(cleaned) && !isWeakText(cleaned) && !isPlaceholderText(cleaned) ? cleaned : '';
}

function addUniqueRouteAnchor(target: string[], value: string | null | undefined) {
  const cleaned = cleanRouteAnchor(value);
  if (!cleaned) {
    return;
  }

  const normalized = normalizeComparisonText(cleaned);
  if (!target.some((entry) => normalizeComparisonText(entry) === normalized)) {
    target.push(cleaned);
  }
}

export function parseTransportRouteSegments(routeName: string | null | undefined) {
  const cleaned = cleanText(routeName);
  if (!cleaned || isGenericRouteLabel(cleaned) || /general|all routes|any route/i.test(cleaned)) {
    return [];
  }

  const routeMatch = cleaned.match(/^(.+?)\s+(?:to|→)\s+(.+)$/i) || cleaned.match(/^(.+?)\s+-\s+(.+)$/);
  if (!routeMatch) {
    return [];
  }

  const from = cleanRouteAnchor(routeMatch[1]);
  const to = cleanRouteAnchor(routeMatch[2]);
  return from && to && normalizeComparisonText(from) !== normalizeComparisonText(to) ? [{ from, to }] : [];
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(intlLocale(activeProposalLocale), {
    dateStyle: 'medium',
  }).format(date);
}

function formatNightCountLabel(value: number) {
  return `${value} ${unitLabel(activeProposalLocale, 'night', value)}`;
}

function formatGuestCountLabel(value: number) {
  return `${value} ${unitLabel(activeProposalLocale, 'guest', value)}`;
}

function getServiceMix(quote: ProposalV3Quote) {
  return {
    hasHotels: quote.quoteItems.some((item) => isHotelItem(item)) || quote.quoteOptions.some((option) => option.kind === 'HOTEL_OPTION_SET'),
    hasTransport: quote.quoteItems.some((item) => isTransportItem(item)),
    hasExperiences: quote.quoteItems.some((item) => isActivityItem(item) || isGuideItem(item)),
    hasExternalPackages: quote.quoteItems.some((item) => isExternalPackageItem(item)),
  };
}

function extractDayLocation(dayTitle: string | null | undefined, dayNumber: number) {
  const cleaned = cleanText(dayTitle)
    .replace(/^Day\s+\d+\s*[:\-]\s*/i, '')
    .replace(/^Visit\s+/i, '')
    .replace(/^Stay\s+in\s+/i, '')
    .trim();

  return cleaned || `Destination ${dayNumber}`;
}

function getTravelerName(quote: ProposalV3Quote) {
  const companyName = cleanText(quote.clientCompany?.name);
  if (companyName && !isWeakText(companyName)) {
    return companyName;
  }

  const contactName = cleanText([quote.contact?.firstName, quote.contact?.lastName].filter(Boolean).join(' '));
  return contactName && !isWeakText(contactName) ? contactName : 'Private Client';
}

function getBrandName(quote: ProposalV3Quote) {
  const candidates = [
    quote.brandCompany?.branding?.displayName,
    quote.brandCompany?.name,
    quote.clientCompany?.branding?.displayName,
    quote.clientCompany?.name,
  ];
  const cleaned = candidates
    .map((value) => cleanText(value).replace(/^brand\s*-\s*/i, ''))
    .find((value) => value && !isWeakText(value) && !/desert compass|demo|test|placeholder/i.test(value));

  return cleaned || AXIS_BRAND_NAME;
}

function getBrandCompanyCandidates(quote: ProposalV3Quote): ProposalBrandCompany[] {
  return [quote.brandCompany, quote.clientCompany].filter(Boolean) as ProposalBrandCompany[];
}

function getBrandLogoUrl(quote: ProposalV3Quote) {
  for (const company of getBrandCompanyCandidates(quote)) {
    const logoUrl = cleanBrandText(company.branding?.logoUrl || company.logoUrl || '');
    if (logoUrl && !isWeakText(logoUrl)) {
      return logoUrl;
    }
  }

  return AXIS_LOGO_URL;
}

function getAccentColor(quote: ProposalV3Quote) {
  for (const company of getBrandCompanyCandidates(quote)) {
    const color = cleanBrandText(company.branding?.primaryColor || company.primaryColor || '');
    if (color) {
      return color;
    }
  }

  return AXIS_PRIMARY_COLOR;
}

function getBrandHeaderSubtitle(quote: ProposalV3Quote) {
  for (const company of getBrandCompanyCandidates(quote)) {
    const subtitle = cleanBrandText(company.branding?.headerSubtitle || '');
    if (subtitle && !isWeakText(subtitle)) {
      return subtitle;
    }
  }

  return null;
}

function getBrandContactParts(quote: ProposalV3Quote) {
  for (const company of getBrandCompanyCandidates(quote)) {
    const parts = [
      cleanBrandText(company.branding?.website || company.website || ''),
      cleanBrandText(company.branding?.email || ''),
      cleanBrandText(company.branding?.phone || ''),
    ].filter((part) => part && !isWeakText(part));

    if (parts.length > 0) {
      return parts;
    }
  }

  return [];
}

function getFooterLine(quote: ProposalV3Quote, brandName: string) {
  for (const company of getBrandCompanyCandidates(quote)) {
    const footerText = cleanBrandText(company.branding?.footerText || '');
    if (footerText && !isWeakText(footerText)) {
      return footerText;
    }
  }

  return [brandName, ...getBrandContactParts(quote)].join(' | ');
}

type NullableProposalV3QuoteItem = ProposalV3QuoteItem | null | undefined;
type ProposalV3DayPoiAssignment = NonNullable<ProposalV3QuotePlannerDay['poiAssignments']>[number];

type ProposalV3DaySource = {
  id: string;
  dayNumber: number;
  title: string;
  description?: string | null;
  /** Stored manual country override for the day (planner days only); null = derive. */
  country?: string | null;
  items: ProposalV3QuoteItem[];
  /** Phase 3B.2 — ordered POI assignments (planner days only); legacy days have none. */
  poiAssignments?: ProposalV3DayPoiAssignment[];
};

function isPresentQuoteItem(item: NullableProposalV3QuoteItem): item is ProposalV3QuoteItem {
  return Boolean(item && item.service);
}

function getItemServiceClassification(item: NullableProposalV3QuoteItem) {
  return normalizeComparisonText(item?.service?.serviceType?.code || item?.service?.serviceType?.name || item?.service?.category);
}

function sanitizeQuoteItems(quote: ProposalV3Quote): ProposalV3QuoteItem[] {
  return (quote.quoteItems || []).filter(isPresentQuoteItem);
}

function withSanitizedQuoteItems(quote: ProposalV3Quote): ProposalV3Quote {
  return {
    ...quote,
    quoteItems: sanitizeQuoteItems(quote),
  };
}

function isHotelItem(item: NullableProposalV3QuoteItem) {
  const normalized = getItemServiceClassification(item);
  return normalized.includes('hotel') || normalized.includes('accommodation');
}

function isTransportItem(item: NullableProposalV3QuoteItem) {
  const normalized = getItemServiceClassification(item);
  return normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle');
}

function isGuideItem(item: NullableProposalV3QuoteItem) {
  const normalized = getItemServiceClassification(item);
  return normalized.includes('guide');
}

function isMealItem(item: NullableProposalV3QuoteItem) {
  const normalized = getItemServiceClassification(item);
  return normalized.includes('meal') || normalized.includes('breakfast') || normalized.includes('lunch') || normalized.includes('dinner');
}

function isActivityItem(item: NullableProposalV3QuoteItem) {
  const normalized = getItemServiceClassification(item);
  return (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('experience') ||
    normalized.includes('entrance') ||
    normalized.includes('ticket')
  );
}

function isExternalPackageItem(item: NullableProposalV3QuoteItem) {
  const normalized = getItemServiceClassification(item).replace(/\s+/g, '_');
  return normalized === 'external_package' || normalized.includes('external_package') || normalized.includes('partner_package');
}

function getGroupLabel(item: ProposalV3QuoteItem) {
  if (isExternalPackageItem(item)) {
    return 'Partner Package';
  }
  if (isHotelItem(item)) {
    return 'Stay';
  }
  if (isTransportItem(item)) {
    return 'Transfer';
  }
  if (isGuideItem(item)) {
    return 'Guide';
  }
  if (isMealItem(item)) {
    return 'Meal';
  }
  if (isActivityItem(item)) {
    return 'Experience';
  }
  return 'Other';
}

function getFallbackServiceTitle(groupLabel: string, location: string | null) {
  const loc = activeProposalLocale;
  if (groupLabel === 'Stay') {
    return location ? proseTemplate(loc, 'svcStayIn', { location }) : proseTemplate(loc, 'svcStayArrangements');
  }
  if (groupLabel === 'Transfer') {
    return location ? proseTemplate(loc, 'svcTransferTo', { location }) : proseTemplate(loc, 'svcTransferArrangements');
  }
  if (groupLabel === 'Experience') {
    return location ? proseTemplate(loc, 'svcVisit', { location }) : proseTemplate(loc, 'svcExperienceDetails');
  }
  if (groupLabel === 'Meal') {
    return location ? proseTemplate(loc, 'svcDiningIn', { location }) : proseTemplate(loc, 'svcDiningArrangements');
  }
  if (groupLabel === 'Guide') {
    return location ? proseTemplate(loc, 'svcGuidedTourOf', { location }) : proseTemplate(loc, 'svcGuideArrangements');
  }
  return proseTemplate(loc, 'svcProgramDetails');
}

function buildOperationalMeta(item: ProposalV3QuoteItem) {
  return [
    formatDate(item.serviceDate) ? `Date ${formatDate(item.serviceDate)}` : null,
    item.startTime ? `Start ${item.startTime}` : null,
    item.pickupTime ? `Pickup ${item.pickupTime}` : null,
    item.pickupLocation ? `Pickup ${cleanText(item.pickupLocation)}` : null,
    item.meetingPoint ? `Meeting ${cleanText(item.meetingPoint)}` : null,
    item.participantCount ? `${item.participantCount} pax` : null,
  ]
    .filter(Boolean)
    .join(' · ') || null;
}

// Phase 3D.1M — internal operational text that must never reach a client PDF.
// Touring-route transport descriptions carry route paths, vehicle classes, and
// pricing-basis codes (e.g. "Excursion origin variant, Amman -> Dana -> Petra ->
// Amman, Touring route, Sedan 2, PER_VEHICLE"). Detect those signals so the
// description can be replaced with a client-safe sentence.
const INTERNAL_TRANSPORT_MARKERS = /->|→|\bPER[_\s]?(VEHICLE|PERSON|ROOM|NIGHT)\b|excursion origin variant|touring route/i;
// Hotel Stay descriptions can surface the internal contract name + rate breakdown
// (e.g. "Contractual Agreement for Petra Moon Hotel 2026, ..., Rate USD 50.00 x 2
// pax x 1 night"). The client-facing accommodation table already carries the
// clean hotel/room/board/location, so this internal text is dropped.
const INTERNAL_RATE_MARKERS = /contractual agreement|agreement for|\brate\s+(usd|jod|eur|ils|aed|sar)\b|\bx\s*\d+\s*pax\b|\bPER[_\s]?(VEHICLE|PERSON|ROOM|NIGHT)\b/i;

function hasInternalTransportText(text?: string | null): boolean {
  return Boolean(text) && INTERNAL_TRANSPORT_MARKERS.test(String(text));
}

function hasInternalContractText(text?: string | null): boolean {
  return Boolean(text) && INTERNAL_RATE_MARKERS.test(String(text));
}

function extractImportedDescription(item: ProposalV3QuoteItem) {
  if (item.service.supplierId !== IMPORTED_SERVICE_SUPPLIER_ID) {
    return null;
  }

  const description = cleanText(item.pricingDescription);
  return isClientSafeCopy(description) ? description : null;
}

export function getClientSafeActivityDescription(item: ProposalV3QuoteItem) {
  const candidates = [
    item.activity?.description,
    item.externalClientDescription,
    item.pricingDescription,
  ];
  const description = candidates.map((candidate) => conciseCopy(candidate)).find((candidate) => isClientSafeCopy(candidate));
  return description || null;
}

function buildAccommodationRows(quote: ProposalV3Quote): ProposalV3AccommodationRow[] {
  const sortedDays = getProposalDaySources(quote);
  const rows: ProposalV3AccommodationRow[] = [];

  for (const day of sortedDays) {
    const hotelItems = day.items.filter((item) => isHotelItem(item));
    const dayLocation = extractDayLocation(day.title, day.dayNumber);

    for (const item of hotelItems) {
      // Phase 3D.1L — prefer the hotel's own city; fall back to the day's derived
      // location only when the hotel has no city (so e.g. a Petra hotel on a "Dana"
      // day shows Location: Petra, not Dana).
      const location = cleanText(item.hotel?.city || '') || dayLocation;
      rows.push({
        dayLabel: proseTemplate(activeProposalLocale, 'dayNumberLabel', { n: String(day.dayNumber).padStart(2, '0') }),
        hotelName: cleanText(item.hotel?.name || item.service.name) || 'Accommodation details to be confirmed',
        location,
        room: cleanText(item.roomCategory?.name || '') || null,
        meals: item.mealPlan ? String(item.mealPlan).toUpperCase() : null,
        // Phase 3D.1M — the contract name is an internal label (e.g. "Contractual
        // Agreement for Petra Moon Hotel 2026"); never surface it to the client.
        note: (() => {
          const contractName = cleanText(item.contract?.name || '');
          return contractName && !hasInternalContractText(contractName) ? contractName : null;
        })(),
      });
    }
  }

  return rows;
}

function listFactSheetValues(value: unknown) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cleanText(String(entry || ''))).filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map((entry) => cleanText(String(entry || '')))
      .filter(Boolean);
  }

  return String(value)
    .split(/\r?\n|,/)
    .map((entry) => cleanText(entry))
    .filter(Boolean);
}

function getPositiveOptionNights(value: number | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function buildHotelOptionSets(quote: ProposalV3Quote): ProposalV3HotelOptionSet[] {
  return (quote.quoteOptions || [])
    .filter((option) => option.kind === 'HOTEL_OPTION_SET')
    .map((option) => {
      const hotelOptions = Array.isArray(option.hotelOptions) ? option.hotelOptions : [];

      return {
        id: option.id,
        name: cleanText(option.name || '') || 'Hotel option set',
        notes: cleanText(option.notes || '') || null,
        options: hotelOptions.map((hotelOption) => {
          const factSheet = hotelOption.hotel?.factSheet || null;

          return {
            id: hotelOption.id,
            city: cleanText(hotelOption.city || hotelOption.hotel?.city || '') || null,
            hotelName: cleanText(hotelOption.hotelNameSnapshot || hotelOption.hotel?.name || '') || 'Hotel or similar',
            room: cleanText(hotelOption.roomCategory?.name || hotelOption.roomType || '') || null,
            mealPlan: cleanText(hotelOption.mealPlanCode || hotelOption.mealPlan || '') || null,
            nights: getPositiveOptionNights(hotelOption.nights),
            isPrimary: Boolean(hotelOption.isPrimary),
            shortDescription: cleanText(factSheet?.shortDescription || '') || null,
            highlights: listFactSheetValues(factSheet?.highlightsJson).slice(0, 4),
            amenities: listFactSheetValues(factSheet?.amenitiesJson).slice(0, 6),
          };
        }),
      };
    });
}

function getHotelOptionCity(option: ProposalV3HotelOptionSet['options'][number]) {
  return cleanText(option.city || '') || 'City to be confirmed';
}

function sortAccommodationCities(left: string, right: string) {
  if (left === 'City to be confirmed') return 1;
  if (right === 'City to be confirmed') return -1;
  return left.localeCompare(right);
}

function getPrimaryHotelOption(options: ProposalV3HotelOptionSet['options']) {
  return options.find((option) => option.isPrimary) || options[0] || null;
}

export function buildAccommodationMatrix(hotelOptionSets: ProposalV3HotelOptionSet[]): ProposalV3AccommodationMatrix | null {
  if (hotelOptionSets.length < 2 || hotelOptionSets.length > 3) {
    return null;
  }

  if (hotelOptionSets.some((optionSet) => optionSet.options.length === 0)) {
    return null;
  }

  const citySetsByOptionSet = hotelOptionSets.map(
    (optionSet) => new Set(optionSet.options.map(getHotelOptionCity).filter(Boolean)),
  );
  const sharedCities = Array.from(citySetsByOptionSet[0] || []).filter((city) =>
    citySetsByOptionSet.slice(1).some((citySet) => citySet.has(city)),
  );

  if (sharedCities.length === 0) {
    return null;
  }

  const cities = Array.from(new Set(hotelOptionSets.flatMap((optionSet) => optionSet.options.map(getHotelOptionCity))))
    .filter(Boolean)
    .sort(sortAccommodationCities);

  return {
    optionSets: hotelOptionSets.map((optionSet) => ({
      id: optionSet.id,
      name: optionSet.name,
    })),
    rows: cities.map((city) => ({
      city,
      cells: hotelOptionSets.map((optionSet) => {
        const optionsForCity = optionSet.options.filter((option) => getHotelOptionCity(option) === city);
        const primaryOption = getPrimaryHotelOption(optionsForCity);
        const alternatives = optionsForCity.filter((option) => option.id !== primaryOption?.id);

        return {
          optionSetId: optionSet.id,
          primaryHotel: primaryOption?.hotelName || null,
          room: primaryOption?.room || null,
          mealPlan: primaryOption?.mealPlan || null,
          nights: primaryOption?.nights || null,
          isRecommended: Boolean(primaryOption?.isPrimary),
          alternativeHotels: alternatives.map((option) => option.hotelName).filter(Boolean).slice(0, 2),
          hasMoreAlternatives: alternatives.length > 2,
        };
      }),
    })),
  };
}

function buildDayGroups(day: ProposalV3Quote['itineraries'][number], dayItems: ProposalV3QuoteItem[], currency = 'USD'): ProposalV3DayGroup[] {
  const location = extractDayLocation(day.title, day.dayNumber);
  const grouped = new Map<string, ProposalV3DayGroup['items']>();
  const order = ['Stay', 'Transfer', 'Partner Package', 'Experience', 'Meal', 'Guide', 'Other'];

  for (const item of dayItems) {
    const groupLabel = getGroupLabel(item);
    const items = grouped.get(groupLabel) || [];
    // Phase 3D.1L — a generated touring-route transport package should be titled by
    // its route path (e.g. "Amman → Dana → Petra"), not the attached transport
    // service name ("Airport Transfer"). The path lives in the pricingDescription.
    const touringPathCities = isTransportItem(item) ? parseRoutePathCitiesFromDescription(item.pricingDescription) : [];
    const touringPathLabel = touringPathCities.length >= 2 ? formatTouringRoutePathLabel(touringPathCities) : '';
    const excursionName = item.touringRoute
      ? cleanText(formatOriginAwareExcursionName({
          serviceName: item.service.name,
          overrideReason: item.overrideReason,
          touringRoute: item.touringRoute,
        }))
      : '';
    // A genuine excursion template keeps its origin-aware name; but when that name is
    // just the generic transport service ("Airport Transfer — From Amman"), the item
    // is a generated touring package — use the route-path label instead.
    const serviceNameLc = cleanText(item.service?.name || '').toLowerCase();
    const excursionNameIsGenericService = Boolean(excursionName && serviceNameLc && excursionName.toLowerCase().startsWith(serviceNameLc));
    const rawTitle = isExternalPackageItem(item)
      ? cleanText(item.externalPackageCountry || item.service.name || '')
      : excursionName && !excursionNameIsGenericService
        ? excursionName
        : touringPathLabel
          ? touringPathLabel
          : excursionName || cleanText(item.hotel?.name || item.appliedVehicleRate?.routeName || item.service.name || '');
    const importedDescription = extractImportedDescription(item);
    const activityDescription = getClientSafeActivityDescription(item);
    let description =
      cleanText(
        isExternalPackageItem(item)
          ? [
              item.externalClientDescription,
              item.externalHotelsOrSimilar ? `Hotels or Similar: ${item.externalHotelsOrSimilar}` : null,
              formatExternalPackagePricingMatrix(item.externalPackagePricingMatrixJson, currency),
              item.externalPackageSingleSupplement !== null && item.externalPackageSingleSupplement !== undefined
                ? `Single supplement: ${formatProposalMoney(Number(item.externalPackageSingleSupplement), currency)}`
                : null,
              item.externalIncludes ? `Includes: ${item.externalIncludes}` : null,
              item.externalExcludes ? `Excludes: ${item.externalExcludes}` : null,
            ]
              .filter(Boolean)
              .join(' ')
          : activityDescription || importedDescription || '',
      ) ||
      (isTransportItem(item) && item.appliedVehicleRate
        ? cleanText(`${item.appliedVehicleRate.vehicle?.name || ''} ${item.appliedVehicleRate.serviceType?.name || ''}`)
        : null);
    let title = rawTitle || getFallbackServiceTitle(groupLabel, location);

    if (groupLabel === 'Transfer' && /hotel|room|occupancy|meal|breakfast|check in|check out|accommodation/i.test(`${title} ${description || ''}`)) {
      title = getFallbackServiceTitle(groupLabel, location);
      description = null;
    }

    if (isPlaceholderText(title) || isWeakText(title)) {
      title = getFallbackServiceTitle(groupLabel, location);
    }

    if (isPlaceholderText(description) || isWeakText(description)) {
      description = null;
    }

    // Phase 3D.1M — internal operational text hygiene (applies in every locale,
    // English included, because this text is never client-facing).
    if (isTransportItem(item) && (item.touringRoute || touringPathLabel || hasInternalTransportText(description))) {
      // Touring-route transport package → uniform client-safe description.
      description = prosePhrase(activeProposalLocale, 'transportTouringSafe');
    } else if (groupLabel === 'Stay' && hasInternalContractText(description)) {
      // Contract-name / rate breakdown → drop (accommodation table carries the
      // client-facing hotel/room/board/location).
      description = null;
    } else if (hasInternalContractText(description) || hasInternalTransportText(description)) {
      description = null;
    }

    items.push({
      title,
      description,
      meta: isPlaceholderText(buildOperationalMeta(item)) ? null : buildOperationalMeta(item),
    });
    grouped.set(groupLabel, items);
  }

  return order
    .filter((label) => grouped.has(label))
    .map((label) => ({
      label: localizeGroupLabel(label),
      items: grouped.get(label) || [],
    }));
}

function getPositiveDayNumber(value: number | null | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function sortPlannerDays(left: ProposalV3QuotePlannerDay, right: ProposalV3QuotePlannerDay) {
  const leftSort = Number.isFinite(Number(left.sortOrder)) ? Number(left.sortOrder) : left.dayNumber;
  const rightSort = Number.isFinite(Number(right.sortOrder)) ? Number(right.sortOrder) : right.dayNumber;
  return leftSort - rightSort || left.dayNumber - right.dayNumber;
}

function sortPlannerDayItems(
  left: NonNullable<ProposalV3QuotePlannerDay['dayItems']>[number],
  right: NonNullable<ProposalV3QuotePlannerDay['dayItems']>[number],
) {
  const leftSort = Number.isFinite(Number(left.sortOrder)) ? Number(left.sortOrder) : 0;
  const rightSort = Number.isFinite(Number(right.sortOrder)) ? Number(right.sortOrder) : 0;
  return leftSort - rightSort;
}

function buildActivePlannerDaySources(quote: ProposalV3Quote): ProposalV3DaySource[] {
  return (quote.quoteItineraryDays || [])
    .filter((day) => day && day.isActive !== false)
    .sort(sortPlannerDays)
    .map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      title: day.title,
      description: day.notes || null,
      country: (day as any).country ?? null,
      poiAssignments: Array.isArray(day.poiAssignments) ? day.poiAssignments : [],
      items: (day.dayItems || [])
        .filter((dayItem) => dayItem?.isActive !== false && isPresentQuoteItem(dayItem?.quoteService))
        .sort(sortPlannerDayItems)
        .map((dayItem) => ({
          ...(dayItem.quoteService as ProposalV3QuoteItem),
          itineraryId: day.id,
        })),
    }));
}

function buildLegacyDaySources(quote: ProposalV3Quote): ProposalV3DaySource[] {
  return [...quote.itineraries]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      title: day.title,
      description: day.description || null,
      items: quote.quoteItems.filter((item) => item.itineraryId === day.id),
    }));
}

function getProposalDaySources(quote: ProposalV3Quote): ProposalV3DaySource[] {
  const activePlannerDays = buildActivePlannerDaySources(quote);
  return activePlannerDays.length > 0 ? activePlannerDays : buildLegacyDaySources(quote);
}

export function buildRouteIntelligence(
  quote: ProposalV3Quote,
  hotelOptionSets: ProposalV3HotelOptionSet[],
  daySources: ProposalV3DaySource[] = getProposalDaySources(quote),
) {
  const overnightAnchors: string[] = [];
  const hotelCityByDay = new Map<string, string[]>();

  for (const day of daySources) {
    for (const item of day.items.filter((entry) => isHotelItem(entry))) {
      const city = item.hotel?.city || item.hotel?.name || null;
      addUniqueRouteAnchor(overnightAnchors, city);
      const cleaned = cleanRouteAnchor(city);
      if (cleaned) {
        hotelCityByDay.set(day.id, [...(hotelCityByDay.get(day.id) || []), cleaned]);
      }
    }
  }

  if (overnightAnchors.length === 0) {
    for (const option of hotelOptionSets.flatMap((optionSet) => optionSet.options).filter((option) => option.isPrimary)) {
      addUniqueRouteAnchor(overnightAnchors, option.city);
    }
  }

  if (overnightAnchors.length === 0) {
    for (const option of hotelOptionSets.flatMap((optionSet) => optionSet.options)) {
      addUniqueRouteAnchor(overnightAnchors, option.city);
    }
  }

  const externalCountries: string[] = [];
  for (const item of quote.quoteItems.filter((entry) => isExternalPackageItem(entry))) {
    addUniqueRouteAnchor(externalCountries, item.externalPackageCountry);
  }

  const transportSegments: Array<{ from: string; to: string }> = [];
  for (const item of quote.quoteItems.filter((entry) => isTransportItem(entry))) {
    for (const segment of parseTransportRouteSegments(item.appliedVehicleRate?.routeName || item.pricingDescription)) {
      const key = `${normalizeComparisonText(segment.from)}|${normalizeComparisonText(segment.to)}`;
      if (!transportSegments.some((entry) => `${normalizeComparisonText(entry.from)}|${normalizeComparisonText(entry.to)}` === key)) {
        transportSegments.push(segment);
      }
    }
  }

  const fallbackDayAnchors: string[] = [];
  for (const day of daySources) {
    if (hotelCityByDay.has(day.id)) {
      continue;
    }
    addUniqueRouteAnchor(fallbackDayAnchors, extractDayLocation(day.title, day.dayNumber));
  }

  // Phase 3D.1L.2 — the SELLING destinations are the cities of the days the traveller
  // actually visits (days that carry POI assignments), taken from each day's title via
  // extractDayLocation. Day titles are always present; the POI→city relation is NOT
  // reliably loaded in the proposal fetch (that earlier approach silently produced
  // nothing on real quotes, so the hotel city narrowed the title). These destinations
  // are used EXCLUSIVELY when present so the overnight hotel city never overrides the
  // route-aware title — Amman → Dana → Petra reads "Dana · Petra" (not "Petra / Wadi
  // Musa"), while Amman City Sites still reads "Amman" (its POI day is Amman). Quotes
  // with no POI assignments keep the existing hotel/transport/day fallback behaviour.
  const poiDayDestinations: string[] = [];
  for (const day of daySources) {
    if (!Array.isArray(day.poiAssignments) || day.poiAssignments.length === 0) {
      continue;
    }
    const dayDestination = extractDayLocation(day.title, day.dayNumber);
    if (dayDestination && !/^Destination\s+\d+$/i.test(dayDestination)) {
      addUniqueRouteAnchor(poiDayDestinations, dayDestination);
    }
  }

  const routeAnchors: string[] = [];
  if (poiDayDestinations.length > 0) {
    // Route-aware: visited POI-day destinations only (hotel city must not narrow it).
    for (const anchor of poiDayDestinations) addUniqueRouteAnchor(routeAnchors, anchor);
  } else {
    for (const anchor of overnightAnchors) addUniqueRouteAnchor(routeAnchors, anchor);
    for (const country of externalCountries) addUniqueRouteAnchor(routeAnchors, country);
    for (const segment of transportSegments) {
      addUniqueRouteAnchor(routeAnchors, segment.from);
      addUniqueRouteAnchor(routeAnchors, segment.to);
    }
    if (routeAnchors.length === 0) {
      for (const anchor of fallbackDayAnchors) addUniqueRouteAnchor(routeAnchors, anchor);
    }
  }

  const destinationLine = summarizeDestinations(routeAnchors);
  const coverSubtitle =
    routeAnchors.some((value) => value.toLowerCase() === 'amman') &&
    routeAnchors.some((value) => value.toLowerCase() === 'petra') &&
    routeAnchors.some((value) => value.toLowerCase() === 'wadi rum')
      ? 'Amman · Petra · Wadi Rum'
      : formatDestinationSubtitle(routeAnchors) || destinationLine || 'Travel';

  return {
    routeAnchors,
    overnightAnchors,
    transportSegments,
    externalCountries,
    destinationLine,
    coverSubtitle,
  };
}

function appendDayGroups(target: ProposalV3Day, groups: ProposalV3DayGroup[]) {
  for (const group of groups) {
    const existing = target.groups.find((targetGroup) => targetGroup.label === group.label);
    if (existing) {
      existing.items.push(...group.items);
    } else {
      target.groups.push(group);
    }
  }
}

// Phase 3B.2 — resolve one POI assignment's display text via the approved
// fallback chain. Never invents content; only reads POI translations + the
// snapshot stored on the assignment row.
function resolvePoiAssignmentDisplay(assignment: ProposalV3DayPoiAssignment, locale: ProposalLocale) {
  const poi = assignment.pointOfInterest || null;
  const translations = poi && Array.isArray(poi.translations) ? poi.translations : [];
  const pick = (loc: string, field: 'title' | 'shortDescription') => {
    const entry = translations.find((t) => String(t?.locale || '').toLowerCase() === loc);
    return cleanText((entry as { title?: string | null; shortDescription?: string | null } | undefined)?.[field] || '');
  };

  // Title: selected-locale translation → English translation → internal POI
  // name → stored fallbackTitle (covers the deleted-POI case where poi is null).
  const title =
    pick(locale, 'title') ||
    pick('en', 'title') ||
    (poi ? cleanText(poi.name || '') : '') ||
    cleanText(assignment.fallbackTitle || '');

  // Optional short description: selected locale → English. Never falls back to
  // a snapshot (there is none for descriptions).
  const short = conciseCopy(pick(locale, 'shortDescription') || pick('en', 'shortDescription'), 160);

  // City: linked POI city → stored fallbackCity snapshot.
  const city = (poi && poi.city?.name ? cleanText(poi.city.name) : '') || cleanText(assignment.fallbackCity || '');

  return { title, short, city };
}

// Client-safety gate that is script-aware. isClientSafeCopy normalizes to ASCII
// and treats non-Latin text (e.g. Arabic) as "weak/placeholder" because it has
// no a-z characters — which would wrongly discard curated Arabic POI content.
// So only apply the full filter when there is Latin script to validate; trust
// non-Latin curated translations otherwise.
function isComposedCopyClientSafe(value: string | null | undefined): boolean {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return false;
  }
  if (/[a-z]/i.test(cleaned)) {
    return isClientSafeCopy(cleaned);
  }
  return true;
}

// Phase 3D.1J — derive safe route-movement context for a day from its
// touring-route transport package. The package's pricingDescription carries the
// ordered city path, e.g. "… | Amman -> Jerash -> Ajloun -> Amman | …". We only
// produce context when such a path is present, so manually-built POI days (no
// touring transport) keep the plain "Visit X" narrative unchanged.
type DayMovementContext = {
  base: string; // route start/base city (e.g. "Amman")
  endCity: string; // last city in the path
  roundTrip: boolean; // base === endCity (a returning circuit)
  dayCount: number; // route duration in days (metadata on the transport item)
};

// Parse the ordered city path from a touring-route transport package's RAW
// pricingDescription (cleanText rewrites the "|" delimiters, so we must not clean
// before splitting). e.g. "… | Amman -> Dana -> Petra -> Amman | …" → ['Amman',
// 'Dana','Petra','Amman']. Returns [] when no multi-hop path segment is present.
function parseRoutePathCitiesFromDescription(pricingDescription?: string | null): string[] {
  const rawDesc = String(pricingDescription || '');
  if (!rawDesc.trim()) {
    return [];
  }
  const segment = rawDesc
    .split('|')
    .map((part) => part.trim())
    .find((part) => /(?:->|→)/.test(part) && !/general|all routes|any route/i.test(part));
  if (!segment) {
    return [];
  }
  return segment
    .split(/\s*(?:->|→)\s*/)
    .map((city) => cleanRouteAnchor(city))
    .filter((city): city is string => Boolean(city));
}

// Phase 3D.1L — a client-facing label for a touring-route transport package, built
// from its path: dedupe consecutive cities and drop the trailing return-to-origin,
// then join with arrows. ['Amman','Dana','Petra','Amman'] → "Amman → Dana → Petra".
function formatTouringRoutePathLabel(cities: string[]): string {
  const out: string[] = [];
  for (const city of cities) {
    if (!out.length || normalizeComparisonText(out[out.length - 1]) !== normalizeComparisonText(city)) {
      out.push(city);
    }
  }
  if (out.length > 2 && normalizeComparisonText(out[0]) === normalizeComparisonText(out[out.length - 1])) {
    out.pop();
  }
  return out.join(' → ');
}

function deriveDayMovementContext(items: ProposalV3QuoteItem[]): DayMovementContext | null {
  for (const item of items) {
    if (!isTransportItem(item)) {
      continue;
    }
    const cities = parseRoutePathCitiesFromDescription(item.pricingDescription);
    if (cities.length < 2) {
      continue;
    }
    const base = cities[0];
    const endCity = cities[cities.length - 1];
    const dayCount = Math.max(1, Math.floor(Number((item as { dayCount?: number | null }).dayCount ?? 1)) || 1);
    return {
      base,
      endCity,
      roundTrip: normalizeComparisonText(base) === normalizeComparisonText(endCity),
      dayCount,
    };
  }
  return null;
}

// Compose a conservative, client-safe day summary from ordered POI assignments
// in the active locale. Returns null when there is nothing usable (so the caller
// falls back to day.notes).
//
// Phase 3D.1J: when the day carries a touring-route transport package with a known
// route path, wrap the visits in safe movement context — "Depart from {base}",
// "Continue to {poi}" between stops, and (for a single-day returning circuit)
// "Return to {base}". Wording uses "your hotel in {base}" only when the day
// actually has a hotel item; an overnight line is added only when a hotel item
// proves an overnight. Breakfast/lunch/dinner/guide/entrance are NEVER invented.
function composeDayNarrativeFromPois(day: ProposalV3DaySource, locale: ProposalLocale): string | null {
  const assignments = day.poiAssignments;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return null;
  }

  const ordered = [...assignments].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Resolve the usable visit targets first so movement context only wraps real POIs.
  const visits = ordered
    .map((assignment) => {
      const display = resolvePoiAssignmentDisplay(assignment, locale);
      return { label: display.title || display.city, short: display.short, city: display.city };
    })
    .filter((visit) => Boolean(visit.label));

  if (visits.length === 0) {
    return null;
  }

  const movement = deriveDayMovementContext(day.items || []);
  // Phase 3D.1L — use the hotel's ACTUAL city (not the route base/end) for "your
  // hotel"/overnight wording. A hotel item on the day proves an overnight there.
  const hotelItem = (day.items || []).find((item) => isHotelItem(item));
  const hotelCity = hotelItem ? cleanText(hotelItem.hotel?.city || '') || null : null;
  const sameCity = (a: string | null | undefined, b: string | null | undefined) =>
    Boolean(a && b && normalizeComparisonText(a) === normalizeComparisonText(b));

  const sentences: string[] = [];

  const finalize = (raw: string) => {
    let sentence = raw.trim();
    if (sentence && !/[.!?…]$/.test(sentence)) {
      sentence = `${sentence}.`;
    }
    return sentence;
  };

  // Departure — only with a known base, and only when the base differs from the
  // first stop's city (avoids "Depart from Petra. Visit Petra..."). Use the
  // "your hotel in {base}" wording ONLY when the day's hotel is actually in the base.
  if (movement && movement.base && !sameCity(movement.base, visits[0].city)) {
    const departFromBaseHotel = Boolean(hotelCity && sameCity(hotelCity, movement.base));
    const key = departFromBaseHotel ? 'moveDepartFromHotel' : 'moveDepartFrom';
    sentences.push(finalize(proseTemplate(locale, key, { city: movement.base })));
  }

  visits.forEach((visit, index) => {
    // First stop = "Visit X"; subsequent stops use "Continue to X" ONLY when we
    // have route movement context (a touring day). Without it, every stop stays
    // "Visit X" exactly as before (no behaviour change for manual POI days).
    const useContinue = movement !== null && index > 0;
    let sentence = proseTemplate(locale, useContinue ? 'moveContinueTo' : 'svcVisit', { location: visit.label as string });
    if (visit.short && isComposedCopyClientSafe(visit.short)) {
      sentence = `${sentence} — ${visit.short}`;
    }
    sentences.push(finalize(sentence));
  });

  if (movement && movement.base) {
    const lastVisitCity = visits[visits.length - 1].city;
    if (hotelCity) {
      // A hotel proves an overnight in the HOTEL's city — never the route base/end.
      // If that city is neither the last stop nor the base, bridge with "Continue to".
      if (!sameCity(hotelCity, lastVisitCity) && !sameCity(hotelCity, movement.base)) {
        sentences.push(finalize(proseTemplate(locale, 'moveContinueTo', { location: hotelCity })));
      }
      sentences.push(finalize(proseTemplate(locale, 'moveOvernightIn', { city: hotelCity })));
    } else if (movement.dayCount <= 1 && movement.roundTrip && !sameCity(movement.base, lastVisitCity)) {
      // Single-day returning circuit with NO hotel (a day trip) → return to base.
      sentences.push(finalize(proseTemplate(locale, 'moveReturnTo', { city: movement.base })));
    }
    // Multi-day day with no hotel: end after the visits — never invent an overnight.
  }

  if (sentences.length === 0) {
    return null;
  }

  const composed = cleanText(sentences.join(' '));
  // Final client-safety gate: a composed paragraph that fails validation is
  // discarded so the day falls back to its existing notes.
  if (!isComposedCopyClientSafe(composed)) {
    return null;
  }
  return composed;
}

function buildDays(quote: ProposalV3Quote): ProposalV3Day[] {
  const daySources = getProposalDaySources(quote);
  const usingActivePlannerDays = buildActivePlannerDaySources(quote).length > 0;
  const assignedDayIds = new Set(daySources.map((day) => day.id));
  const activePlannerItemIds = new Set(daySources.flatMap((day) => day.items.map((item) => item.id)));
  const days = daySources.map((day) => {
    const location = extractDayLocation(day.title, day.dayNumber);
    const dayItems = day.items.filter((item) => !(isExternalPackageItem(item) && getPositiveDayNumber(item.externalStartDay)));
    // Phase 3B.2 — day-summary precedence:
    //   1) composed POI narrative (when the day has usable POI assignments)
    //   2) existing day.notes (unchanged when there are no POI rows or the
    //      composer produced nothing client-safe)
    //   3) none (item-derived fallback happens downstream as today)
    const notesSummary = cleanText(day.description || '');
    const cleanNotes = isPlaceholderText(notesSummary) ? null : notesSummary || null;
    const composedNarrative = composeDayNarrativeFromPois(day, activeProposalLocale);
    const summary = composedNarrative ?? cleanNotes;

    return {
      dayNumber: day.dayNumber,
      dayNumberLabel: proseTemplate(activeProposalLocale, 'dayNumberLabel', { n: String(day.dayNumber).padStart(2, '0') }),
      title: isWeakText(day.title) ? location : cleanText(day.title) || location,
      summary: summary || null,
      overnightLocation: dayItems.some((item) => isHotelItem(item)) ? location : null,
      // A stored manual override (day.country) wins; otherwise derive from services.
      country:
        (typeof day.country === 'string' && day.country.trim()) ||
        deriveDayCountry({
          items: dayItems.map((item) => ({
            hotelCountry: item.hotel?.cityRecord?.country ?? null,
            externalPackageCountry: item.externalPackageCountry ?? null,
          })),
        }),
      groups: buildDayGroups(day, dayItems, quote.quoteCurrency || 'USD'),
    };
  });

  const externalRangeItems = quote.quoteItems.filter(
    (item) =>
      isExternalPackageItem(item) &&
      (getPositiveDayNumber(item.externalStartDay) ||
        (usingActivePlannerDays ? !activePlannerItemIds.has(item.id) : !item.itineraryId || !assignedDayIds.has(item.itineraryId))),
  );

  if (externalRangeItems.length > 0) {
    const fallbackBaseDayNumber = days.length > 0 ? Math.max(...days.map((day) => day.dayNumber)) + 1 : 1;
    for (const [index, item] of externalRangeItems.entries()) {
      const startDay = getPositiveDayNumber(item.externalStartDay) ?? fallbackBaseDayNumber + index;
      const requestedEndDay = getPositiveDayNumber(item.externalEndDay);
      const endDay = requestedEndDay && requestedEndDay >= startDay ? requestedEndDay : startDay;
      const country = cleanText(item.externalPackageCountry || item.service.name) || 'Partner package';

      for (let dayNumber = startDay; dayNumber <= endDay; dayNumber += 1) {
        const groups = buildDayGroups(
          {
            id: `external-package-${item.id}`,
            dayNumber,
            title: country,
            description: null,
          },
          [item],
          quote.quoteCurrency || 'USD',
        );
        const existingDay = days.find((day) => day.dayNumber === dayNumber);

        if (existingDay) {
          appendDayGroups(existingDay, groups);
          if (!existingDay.overnightLocation) {
            existingDay.overnightLocation = cleanText(item.externalPackageCountry || '') || null;
          }
          if (!existingDay.country) {
            existingDay.country = cleanText(item.externalPackageCountry || '') || null;
          }
          continue;
        }

        days.push({
          dayNumber,
          dayNumberLabel: proseTemplate(activeProposalLocale, 'dayNumberLabel', { n: String(dayNumber).padStart(2, '0') }),
          title: `Day ${dayNumber}: ${country}`,
          summary: null,
          overnightLocation: cleanText(item.externalPackageCountry || '') || null,
          country: cleanText(item.externalPackageCountry || '') || null,
          groups,
        });
      }
    }
  }

  return days.sort((a, b) => a.dayNumber - b.dayNumber);
}

export function buildProposalDocumentTitle(quote: ProposalV3Quote, destinationLine: string) {
  const cleanedTitle = stripInternalTitleDecorations(cleanText(quote.title));
  if (cleanedTitle && !isWeakText(cleanedTitle) && !isPlaceholderText(cleanedTitle)) {
    return cleanedTitle;
  }

  return destinationLine ? `${destinationLine} Travel Proposal` : 'Private Travel Proposal';
}

export function buildAccommodationStory(hotelOptionSets: ProposalV3HotelOptionSet[], destinationLine: string) {
  const factHighlights = hotelOptionSets
    .flatMap((optionSet) => optionSet.options)
    .flatMap((option) => [option.shortDescription, ...option.highlights])
    .map((value) => conciseCopy(value, 120))
    .filter((value) => isClientSafeCopy(value));

  if (factHighlights.length > 0) {
    return factHighlights[0];
  }

  const primaryCities = Array.from(
    new Set(
      hotelOptionSets
        .flatMap((optionSet) => optionSet.options)
        .filter((option) => option.isPrimary)
        .map((option) => cleanText(option.city || ''))
        .filter(Boolean),
    ),
  );
  const cityLine = summarizeDestinations(primaryCities);

  if (cityLine) {
    return proseTemplate(activeProposalLocale, 'accomByLocation', { cities: cityLine });
  }

  return destinationLine ? proseTemplate(activeProposalLocale, 'accomRouting', { dest: destinationLine }) : '';
}

export function buildJourneySummary(quote: ProposalV3Quote, destinationLine: string, dayCount: number, totalPax: number, hotelOptionSets: ProposalV3HotelOptionSet[]) {
  const quoteDescription = cleanText(quote.description || '');
  if (isClientSafeCopy(quoteDescription)) {
    return quoteDescription;
  }

  const loc = activeProposalLocale;
  const mix = getServiceMix(quote);
  const guestLabel = formatGuestCountLabel(totalPax);
  const pillars = [
    mix.hasHotels || hotelOptionSets.length > 0 ? prosePhrase(loc, 'pillarStays') : null,
    mix.hasTransport ? prosePhrase(loc, 'pillarTransport') : null,
    mix.hasExperiences ? prosePhrase(loc, 'pillarExperiences') : null,
    mix.hasExternalPackages ? prosePhrase(loc, 'pillarPartner') : null,
  ].filter(Boolean);
  const arrangementLine = pillars.length > 0 ? joinProseList(loc, pillars) : prosePhrase(loc, 'pillarFallback');

  return destinationLine
    ? proseTemplate(loc, 'journeyWithDest', { dayCount, dest: destinationLine, guests: guestLabel, arrangement: arrangementLine })
    : proseTemplate(loc, 'journeyNoDest', { dayCount, guests: guestLabel, arrangement: arrangementLine });
}

function buildCoverIntro(quote: ProposalV3Quote, destinationLine: string) {
  const brandSubtitle = getBrandHeaderSubtitle(quote);
  if (brandSubtitle) {
    return brandSubtitle;
  }

  const loc = activeProposalLocale;
  const mix = getServiceMix(quote);
  const programParts = [
    mix.hasHotels ? prosePhrase(loc, 'programStays') : null,
    mix.hasTransport ? prosePhrase(loc, 'programTransfers') : null,
    mix.hasExperiences ? prosePhrase(loc, 'programExperiences') : null,
    mix.hasExternalPackages ? prosePhrase(loc, 'programPartner') : null,
  ].filter(Boolean);
  const programLine = programParts.length > 0 ? joinProseList(loc, programParts) : prosePhrase(loc, 'programFallback');

  return destinationLine
    ? proseTemplate(loc, 'coverIntroWithDest', { dest: destinationLine, program: programLine })
    : proseTemplate(loc, 'coverIntroNoDest', { program: programLine });
}

export function buildDayByDayIntro(days: ProposalV3Day[], destinationLine: string) {
  const loc = activeProposalLocale;
  const dayCount = Math.max(days.length, 1);
  const overnightStops = Array.from(new Set(days.map((day) => cleanText(day.overnightLocation || '')).filter(Boolean)));
  const hasDailyServices = days.some((day) => day.groups.length > 0);

  if (destinationLine && overnightStops.length > 0) {
    return proseTemplate(loc, 'dayByDayWithDestOvernight', { dayCount, dest: destinationLine });
  }

  if (destinationLine) {
    return hasDailyServices
      ? proseTemplate(loc, 'dayByDayWithDestServices', { dayCount, dest: destinationLine })
      : proseTemplate(loc, 'dayByDayWithDestPlain', { dayCount, dest: destinationLine });
  }

  return hasDailyServices
    ? proseTemplate(loc, 'dayByDayNoDestServices', { dayCount })
    : proseTemplate(loc, 'dayByDayFinalizing');
}

export function buildDestinationAwareCoverSignature(quote: ProposalV3Quote, destinationLine: string, hotelOptionSets: ProposalV3HotelOptionSet[]) {
  const accommodationStory = buildAccommodationStory(hotelOptionSets, destinationLine);
  if (accommodationStory) {
    return accommodationStory;
  }

  const loc = activeProposalLocale;
  const mix = getServiceMix(quote);
  const focus = [
    mix.hasExperiences ? prosePhrase(loc, 'focusExperiences') : null,
    mix.hasTransport ? prosePhrase(loc, 'focusTransfers') : null,
    mix.hasHotels ? prosePhrase(loc, 'focusStays') : null,
  ].filter(Boolean);
  const focusLine = focus.length > 0 ? joinProseList(loc, focus) : prosePhrase(loc, 'focusFallback');

  return destinationLine
    ? proseTemplate(loc, 'signatureWithDest', { dest: destinationLine, focus: focusLine })
    : proseTemplate(loc, 'signatureNoDest', { focus: focusLine });
}

export function buildDeterministicHighlights(
  quote: ProposalV3Quote,
  destinationLine: string,
  days: ProposalV3Day[],
  hotelOptionSets: ProposalV3HotelOptionSet[],
) {
  const highlights = new Set<string>();
  const destinations = Array.from(new Set(days.map((day) => extractDayLocation(day.title, day.dayNumber)).filter(Boolean)));
  const routeSubtitle = formatDestinationSubtitle(destinations);

  const pushHighlight = (value: string | null | undefined) => {
    const copy = conciseCopy(value, 120);
    // Script-aware gate: isClientSafeCopy is ASCII-based and would discard valid
    // non-Latin (e.g. Arabic) highlights. isComposedCopyClientSafe only applies the
    // ASCII filter when Latin script is present, so localized AR highlights survive.
    if (isComposedCopyClientSafe(copy)) {
      highlights.add(copy);
    }
  };

  if (routeSubtitle) {
    pushHighlight(proseTemplate(activeProposalLocale, 'riRoutePlanned', { dest: routeSubtitle }));
  } else if (destinationLine) {
    pushHighlight(proseTemplate(activeProposalLocale, 'riRoutePlanned', { dest: destinationLine }));
  }

  for (const day of days) {
    const destination = extractDayLocation(day.title, day.dayNumber);
    if (destination && !/^Destination\s+\d+$/i.test(destination)) {
      pushHighlight(proseTemplate(activeProposalLocale, 'riTimeInProgram', { dest: destination }));
    }
    if (highlights.size >= 2) {
      break;
    }
  }

  for (const item of quote.quoteItems) {
    if (isActivityItem(item) || isGuideItem(item)) {
      pushHighlight(getClientSafeActivityDescription(item) || item.activity?.name || item.service.name);
    }
    if (highlights.size >= 4) {
      break;
    }
  }

  for (const option of hotelOptionSets.flatMap((optionSet) => optionSet.options)) {
    pushHighlight(option.shortDescription || option.highlights[0]);
    if (highlights.size >= 4) {
      break;
    }
  }

  return Array.from(highlights).slice(0, 4);
}

function isSafeInvestmentNote(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  if (/0 paying/i.test(normalized)) {
    return false;
  }

  if (/(^|[\s:(])(?:[A-Z]{3}\s+)?0(?:\.0+)?(?:\b|[)\s,.;])/i.test(normalized)) {
    return false;
  }

  return true;
}

function buildInvestment(quote: ProposalV3Quote, currency: string) {
  const pricing = buildProposalPricingViewModel(quote, currency, (amount, resolvedCurrency) =>
    formatProposalMoney(amount, resolvedCurrency),
  );
  const pdfConsistencyLines = buildPdfExportConsistencyLines(quote, currency);
  const slabRows: ProposalV3InvestmentRow[] =
    pricing.mode === 'group'
      ? pricing.slabLines
          .filter((line) => line.label && line.perPerson)
          .map((line) => ({
            label: cleanText(line.label),
            perGuest: cleanText(line.perPerson) || '',
            total: cleanText(line.total || '') || null,
            note: isSafeInvestmentNote(line.note) ? cleanText(line.note || '') : null,
          }))
      : [];

  const pending = pricing.mode === 'pending' || (pricing.mode === 'group' && slabRows.length === 0);

  if (pending) {
    return {
      title: 'Investment',
      snapshotLabel: localizeSnapshotLabel(activeProposalLocale, 'Pricing status'),
      snapshotValue: 'Pricing to be confirmed',
      snapshotHelper: 'Final slab selection depends on confirmed group size',
      summaryNote: prosePhrase(activeProposalLocale, 'pricingSummaryNotePending'),
      mode: 'pending' as const,
      basisLines: [],
      noteLines: [],
      slabRows: [],
      isPending: true,
    };
  }

  return {
    title: pricing.title,
    snapshotLabel: localizeSnapshotLabel(activeProposalLocale, pricing.snapshotLabel),
    snapshotValue: pricing.snapshotValue,
    snapshotHelper: pricing.snapshotHelper,
    summaryNote: prosePhrase(activeProposalLocale, 'pricingSummaryNote'),
    mode: pricing.mode,
    basisLines: pricing.basisLines.filter((line) => !isPlaceholderText(line)),
    noteLines: [
      ...pricing.noteLines.filter((line) => isSafeInvestmentNote(line) && !isPlaceholderText(line)),
      ...pdfConsistencyLines.filter((line) => !isPlaceholderText(line)),
    ],
    slabRows,
    isPending: false,
  };
}

function formatPricingBasisLabel(value: unknown) {
  return String(value || '').trim().toUpperCase() === 'PER_PERSON' ? 'per person/night' : 'per room/night';
}

function formatDisplayNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(2))) : String(value);
}

function humanizeEnum(value: unknown, fallback: string) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallback;
  }

  return normalized
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatSupplementBasis(value: unknown) {
  const normalized = String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
  if (normalized === 'PER_ROOM') return 'per room';
  if (normalized === 'PER_PERSON') return 'per person';
  if (normalized === 'PER_STAY') return 'one-time';
  if (normalized === 'PER_NIGHT') return 'per night';
  return humanizeEnum(value, 'basis unavailable');
}

function formatAgeRange(policy: any) {
  if (policy.ageFrom !== null && policy.ageFrom !== undefined && policy.ageTo !== null && policy.ageTo !== undefined) {
    return `${policy.ageFrom}-${policy.ageTo}`;
  }
  if (policy.ageFrom !== null && policy.ageFrom !== undefined) {
    return `${policy.ageFrom}+`;
  }
  if (policy.ageTo !== null && policy.ageTo !== undefined) {
    return `0-${policy.ageTo}`;
  }
  return 'eligible ages';
}

function formatChildPolicyForPdf(policy: any, currency: string) {
  const policyType = String(policy.policyType || policy.type || '').trim().toUpperCase();
  const ageRange = formatAgeRange(policy);
  const amount = formatDisplayNumber(policy.amount);
  const percent = formatDisplayNumber(policy.percent);
  const policyCurrency = policy.currency || currency;

  if (policyType === 'CHILD_FREE') {
    return `Children ${ageRange} free`;
  }
  if (policyType === 'CHILD_DISCOUNT') {
    return `Children ${ageRange} pay ${percent !== null ? `${percent}%` : 'discounted rate'}`;
  }
  if (policyType === 'CHILD_EXTRA_BED') {
    return `Child extra bed: ${amount !== null ? `${amount} ${policyCurrency}` : percent !== null ? `${percent}%` : 'No details'}`;
  }
  if (policyType === 'CHILD_EXTRA_MEAL') {
    return `Child extra meal: ${amount !== null ? `${amount} ${policyCurrency}` : percent !== null ? `${percent}%` : 'No details'}`;
  }
  return '';
}

function buildPdfExportConsistencyLines(quote: ProposalV3Quote, currency: string) {
  const lines: string[] = [];
  const quoteItems = quote.quoteItems || [];

  for (const item of quoteItems) {
    if (!isHotelItem(item)) {
      continue;
    }

    lines.push(`${cleanText(item.hotel?.name || item.service.name) || 'Hotel'} rate basis: ${formatPricingBasisLabel(item.pricingBasis)}`);

    const ratePolicies = Array.isArray(item.ratePolicies) ? item.ratePolicies : [];
    const childPolicies = ratePolicies
      .map((policy) => formatChildPolicyForPdf(policy, currency))
      .filter(Boolean);
    lines.push(
      childPolicies.length > 0
        ? `Child policy: ${childPolicies.join('; ')}`
        : 'Child policy: No child policy available',
    );

    const supplements = Array.isArray(item.supplements) ? item.supplements : [];
    if (supplements.length > 0) {
      lines.push(
        `Supplements: ${supplements
          .map((supplement: any) => {
            const amount = Number(supplement.amount);
            const amountLabel = Number.isFinite(amount) ? formatProposalMoney(amount, supplement.currency || currency) : 'amount unavailable';
            return `${humanizeEnum(supplement.type, 'Supplement')} ${amountLabel} ${formatSupplementBasis(supplement.chargeBasis)}`;
          })
          .join('; ')}`,
      );
    }
  }

  const itemSellTotal = quoteItems.reduce((sum, item) => sum + Number(item.totalSell ?? 0), 0);
  const totalSell = Number((Number.isFinite(Number(quote.totalSell)) ? Number(quote.totalSell) : itemSellTotal).toFixed(2));

  if (totalSell > 0) {
    lines.push(`Total Package Price: ${formatProposalMoney(totalSell, currency)}`);
  }

  return lines;
}

function parseSupportTextList(value: string | null | undefined) {
  return (value || '')
    .split(/\r?\n+/)
    .map((line) => cleanText(line))
    .filter((line) => line && !isWeakText(line) && !isPlaceholderText(line));
}

function buildDefaultInclusions(quote: ProposalV3Quote) {
  const lines = new Set<string>();

  if (quote.quoteItems.some((item) => isHotelItem(item))) {
    lines.add(proposalLabel(activeProposalLocale, 'inclAccommodation'));
  }
  if (quote.quoteItems.some((item) => isTransportItem(item))) {
    lines.add(proposalLabel(activeProposalLocale, 'inclTransport'));
  }
  if (quote.quoteItems.some((item) => isActivityItem(item))) {
    lines.add(proposalLabel(activeProposalLocale, 'inclExperiences'));
  }
  if (quote.quoteItems.some((item) => isGuideItem(item))) {
    lines.add(proposalLabel(activeProposalLocale, 'inclGuiding'));
  }
  if (quote.quoteItems.some((item) => isExternalPackageItem(item))) {
    lines.add(proposalLabel(activeProposalLocale, 'inclPartner'));
  }

  return Array.from(lines);
}

function buildDefaultNotes(quote: ProposalV3Quote) {
  const pricingNotes = Array.from(
    new Set(
      quote.quoteItems.flatMap((item) => {
        const notes = [
          item.salesTaxPercent
            ? item.salesTaxIncluded
              ? `Applicable taxes are included at ${item.salesTaxPercent}%.`
              : `Applicable taxes are not included and may apply at ${item.salesTaxPercent}%.`
            : null,
          item.serviceChargePercent
            ? item.serviceChargeIncluded
              ? `Service charge is included at ${item.serviceChargePercent}% where applicable.`
              : `Service charge is not included and may apply at ${item.serviceChargePercent}% where applicable.`
            : null,
          item.tourismFeeAmount
            ? `Tourism fee paid to hotel is charged ${item.tourismFeeMode === 'PER_NIGHT_PER_PERSON' ? 'per night per guest' : 'per night per room'} where applicable.`
            : null,
        ].filter(Boolean);

        return notes as string[];
      }),
    ),
  );
  // Phase 3A localizes the three always-present fixed notes. The conditional
  // "N additional options" suffix and the computed tax/service/tourism pricing
  // notes remain English for now (dynamic copy — a later copy pass).
  const altNote =
    quote.quoteOptions.length > 0
      ? `${proposalLabel(activeProposalLocale, 'noteAltSimple')} ${quote.quoteOptions.length} additional option${quote.quoteOptions.length === 1 ? '' : 's'} can be shared if preferred.`
      : proposalLabel(activeProposalLocale, 'noteAltSimple');
  const notes = [
    proposalLabel(activeProposalLocale, 'noteAvailability'),
    altNote,
    proposalLabel(activeProposalLocale, 'noteRegulations'),
    ...pricingNotes,
  ];

  return notes.map((note) => cleanText(note)).filter(Boolean);
}

function getProposalCurrency(quote: ProposalV3Quote) {
  const currency = quote.quoteCurrency?.trim().toUpperCase() || 'USD';
  return ['USD', 'EUR', 'JOD', 'ILS'].includes(currency) ? currency : 'USD';
}

function buildClientFacingTitle(quote: ProposalV3Quote, destinationLine: string) {
  const cleanedTitle = cleanText(quote.title);

  if (
    !cleanedTitle ||
    /\bqa\b/i.test(cleanedTitle) ||
    /\bdemo\b/i.test(cleanedTitle) ||
    /\btest\b/i.test(cleanedTitle) ||
    /\bfit quote\b/i.test(cleanedTitle) ||
    /\bmulti currency\b/i.test(cleanedTitle)
  ) {
    return destinationLine ? `${destinationLine} Journey` : 'Private Travel Proposal';
  }

  return cleanedTitle;
}

function formatDurationLabel(dayCount: number, nightCount: number) {
  const dayWord = unitLabel(activeProposalLocale, 'day', dayCount);
  const nightWord = activeProposalLocale === 'en'
    ? (nightCount === 1 ? 'Night' : 'Nights')
    : unitLabel(activeProposalLocale, 'night', nightCount);
  return `${dayCount} ${dayWord} / ${nightCount} ${nightWord}`;
}

export function mapQuoteToProposalV3(quote: ProposalV3Quote, language?: string | null): ProposalV3ViewModel {
  // Resolve + set the active proposal locale for this (synchronous) render.
  // Explicit `language` (render-time override) wins over the quote's stored
  // proposalLanguage; invalid values fall back to English.
  activeProposalLocale = resolveProposalLanguage(language ?? (quote as { proposalLanguage?: string }).proposalLanguage);
  quote = withSanitizedQuoteItems(quote);
  const sortedDays = getProposalDaySources(quote);
  const days = buildDays(quote);
  const totalPax = quote.adults + quote.children;
  const dayCount = Math.max(days.length, (quote.nightCount || 0) + 1, 1);
  const hotelOptionSets = buildHotelOptionSets(quote);
  const routeIntelligence = buildRouteIntelligence(quote, hotelOptionSets, sortedDays);
  const destinationLine =
    routeIntelligence.destinationLine || stripInternalTitleDecorations(cleanText(quote.title)).replace(/\s+Journey$/i, '');
  const coverSubtitle = routeIntelligence.coverSubtitle || destinationLine || 'Travel';
  const currency = getProposalCurrency(quote);
  const documentTitle = buildProposalDocumentTitle(quote, destinationLine);
  const durationLabel = formatDurationLabel(dayCount, quote.nightCount || Math.max(dayCount - 1, 0));
  const coverIntro = buildCoverIntro(quote, destinationLine);
  const journeySummary = buildJourneySummary(quote, destinationLine, dayCount, totalPax, hotelOptionSets);
  const coverSignature = buildDestinationAwareCoverSignature(quote, destinationLine, hotelOptionSets);
  const dayByDayIntro = buildDayByDayIntro(days, destinationLine);
  const brandName = getBrandName(quote);
  const footerLine = getFooterLine(quote, brandName);
  const contactLine = getBrandContactParts(quote).join(' | ') || footerLine;
  const totalValue =
    typeof quote.totalSell === 'number' && Number.isFinite(quote.totalSell) && quote.totalSell > 0
      ? formatProposalMoney(quote.totalSell, currency)
      : 'To be confirmed';
  const perPersonValue =
    typeof quote.pricePerPax === 'number' && Number.isFinite(quote.pricePerPax) && quote.pricePerPax > 0
      ? formatProposalMoney(quote.pricePerPax, currency)
      : 'To be confirmed';

  return {
    language: activeProposalLocale,
    textDirection: proposalTextDirection(activeProposalLocale),
    documentTitle,
    metaTitle: `${documentTitle || 'Travel Proposal'} | ${brandName}`,
    brandName,
    logoUrl: getBrandLogoUrl(quote),
    accentColor: getAccentColor(quote),
    footerLine,
    contactLine,
    quoteReference: cleanText(quote.quoteNumber) || 'Quote reference to be confirmed',
    travelerName: getTravelerName(quote),
    coverSubtitle,
    destinationLine,
    durationLabel,
    travelDatesLabel: formatDate(quote.travelStartDate) || prosePhrase(activeProposalLocale, 'datesToBeConfirmed'),
    coverIntro,
    coverSignature,
    dayByDayIntro,
    subtitle: `${formatNightCountLabel(quote.nightCount)} · ${formatGuestCountLabel(totalPax)}${destinationLine ? ` · ${destinationLine}` : ''}`,
    proposalDateLabel: formatDate(quote.createdAt) || formatDate(new Date()) || '',
    travelerCountLabel: formatGuestCountLabel(totalPax),
    servicesCountLabel: `${quote.quoteItems.length} ${unitLabel(activeProposalLocale, 'service', quote.quoteItems.length)}`,
    totalDaysLabel: `${dayCount} ${unitLabel(activeProposalLocale, 'itineraryDay', dayCount)}`,
    pricingHighlightTotal: totalValue,
    pricingHighlightPerPax: perPersonValue,
    pricingHighlightCurrency: currency,
    journeySummary,
    highlights: buildDeterministicHighlights(quote, destinationLine, days, hotelOptionSets),
    accommodationRows: buildAccommodationRows(quote),
    hotelOptionSets,
    accommodationMatrix: buildAccommodationMatrix(hotelOptionSets),
    days,
    investment: buildInvestment(quote, currency),
    inclusions: parseSupportTextList(quote.inclusionsText).length
      ? parseSupportTextList(quote.inclusionsText)
      : buildDefaultInclusions(quote),
    notes: parseSupportTextList(quote.termsNotesText).length
      ? parseSupportTextList(quote.termsNotesText)
      : buildDefaultNotes(quote),
  };
}
