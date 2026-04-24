import { buildProposalPricingViewModel } from './proposal-pricing';
import {
  ProposalV3AccommodationRow,
  ProposalV3Day,
  ProposalV3DayGroup,
  ProposalV3InvestmentRow,
  ProposalV3Quote,
  ProposalV3QuoteItem,
  ProposalV3ViewModel,
} from './proposal-v3.types';

const INVALID_TEXT_PATTERNS = [
  /\bimported itinerary\b/i,
  /\binternal use only\b/i,
  /\bsystem generated\b/i,
  /\bprogram details to be confirmed\b/i,
  /\bservice to be confirmed\b/i,
];

const PLACEHOLDER_TEXT_PATTERNS = [
  /\bto be confirmed\b/i,
  /\bdetails to be confirmed\b/i,
  /\bprice unavailable\b/i,
];

const IMPORTED_SERVICE_SUPPLIER_ID = 'import-itinerary-system';

function formatProposalMoney(amount: number, currency = 'USD') {
  if (!Number.isFinite(amount)) {
    return currency === 'JOD' ? '0.000 JD' : currency === 'EUR' ? 'EUR 0.00' : '$0.00';
  }

  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  if (currency === 'EUR') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }

  if (currency === 'JOD') {
    return `${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount)} JD`;
  }

  return `${currency} ${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function cleanText(value: string | null | undefined) {
  return (value || '')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\bDescription:\s*/gi, '')
    .replace(/\bNotes:\s*/gi, '')
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

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(date);
}

function formatNightCountLabel(value: number) {
  return `${value} night${value === 1 ? '' : 's'}`;
}

function formatGuestCountLabel(value: number) {
  return `${value} guest${value === 1 ? '' : 's'}`;
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
  return (
    cleanText(quote.brandCompany?.name) ||
    cleanText(quote.clientCompany?.name) ||
    'Travel Proposal'
  );
}

function getAccentColor(quote: ProposalV3Quote) {
  return quote.brandCompany?.branding?.primaryColor || quote.clientCompany?.branding?.primaryColor || '#8a6a3a';
}

function isHotelItem(item: ProposalV3QuoteItem) {
  const normalized = normalizeComparisonText(item.service.serviceType?.code || item.service.serviceType?.name || item.service.category);
  return normalized.includes('hotel') || normalized.includes('accommodation');
}

function isTransportItem(item: ProposalV3QuoteItem) {
  const normalized = normalizeComparisonText(item.service.serviceType?.code || item.service.serviceType?.name || item.service.category);
  return normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle');
}

function isGuideItem(item: ProposalV3QuoteItem) {
  const normalized = normalizeComparisonText(item.service.serviceType?.code || item.service.serviceType?.name || item.service.category);
  return normalized.includes('guide');
}

function isMealItem(item: ProposalV3QuoteItem) {
  const normalized = normalizeComparisonText(item.service.serviceType?.code || item.service.serviceType?.name || item.service.category);
  return normalized.includes('meal') || normalized.includes('breakfast') || normalized.includes('lunch') || normalized.includes('dinner');
}

function isActivityItem(item: ProposalV3QuoteItem) {
  const normalized = normalizeComparisonText(item.service.serviceType?.code || item.service.serviceType?.name || item.service.category);
  return (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('experience') ||
    normalized.includes('ticket')
  );
}

function getGroupLabel(item: ProposalV3QuoteItem) {
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
  if (groupLabel === 'Stay') {
    return location ? `Stay in ${location}` : 'Stay arrangements';
  }
  if (groupLabel === 'Transfer') {
    return location ? `Private Transfer to ${location}` : 'Transfer arrangements';
  }
  if (groupLabel === 'Experience') {
    return location ? `Visit ${location}` : 'Experience details';
  }
  if (groupLabel === 'Meal') {
    return location ? `Dining in ${location}` : 'Dining arrangements';
  }
  if (groupLabel === 'Guide') {
    return location ? `Guided Tour of ${location}` : 'Guide arrangements';
  }
  return 'Program details';
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

function extractImportedDescription(item: ProposalV3QuoteItem) {
  if (item.service.supplierId !== IMPORTED_SERVICE_SUPPLIER_ID) {
    return null;
  }

  return cleanText(item.pricingDescription);
}

function buildAccommodationRows(quote: ProposalV3Quote): ProposalV3AccommodationRow[] {
  const sortedDays = [...quote.itineraries].sort((a, b) => a.dayNumber - b.dayNumber);
  const rows: ProposalV3AccommodationRow[] = [];

  for (const day of sortedDays) {
    const hotelItems = quote.quoteItems.filter((item) => item.itineraryId === day.id && isHotelItem(item));
    const location = extractDayLocation(day.title, day.dayNumber);

    for (const item of hotelItems) {
      rows.push({
        dayLabel: `Day ${String(day.dayNumber).padStart(2, '0')}`,
        hotelName: cleanText(item.hotel?.name || item.service.name) || 'Accommodation details to be confirmed',
        location,
        room: cleanText(item.roomCategory?.name || '') || null,
        meals: item.mealPlan ? String(item.mealPlan).toUpperCase() : null,
        note: cleanText(item.contract?.name || '') || null,
      });
    }
  }

  return rows;
}

function buildDayGroups(day: ProposalV3Quote['itineraries'][number], dayItems: ProposalV3QuoteItem[]): ProposalV3DayGroup[] {
  const location = extractDayLocation(day.title, day.dayNumber);
  const grouped = new Map<string, ProposalV3DayGroup['items']>();
  const order = ['Stay', 'Transfer', 'Experience', 'Meal', 'Guide', 'Other'];

  for (const item of dayItems) {
    const groupLabel = getGroupLabel(item);
    const items = grouped.get(groupLabel) || [];
    const rawTitle = cleanText(item.hotel?.name || item.appliedVehicleRate?.routeName || item.service.name || '');
    const importedDescription = extractImportedDescription(item);
    let description =
      cleanText(importedDescription || item.pricingDescription || '') ||
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
      label,
      items: grouped.get(label) || [],
    }));
}

function buildDays(quote: ProposalV3Quote): ProposalV3Day[] {
  const sortedDays = [...quote.itineraries].sort((a, b) => a.dayNumber - b.dayNumber);

  return sortedDays.map((day) => {
    const location = extractDayLocation(day.title, day.dayNumber);
    const dayItems = quote.quoteItems.filter((item) => item.itineraryId === day.id);
    const summary = cleanText(day.description || '');

    return {
      dayNumber: day.dayNumber,
      title: isWeakText(day.title) ? location : cleanText(day.title) || location,
      summary: isPlaceholderText(summary) ? null : summary || null,
      overnightLocation: dayItems.some((item) => isHotelItem(item)) ? location : null,
      groups: buildDayGroups(day, dayItems),
    };
  });
}

function buildJourneySummary(quote: ProposalV3Quote, destinationLine: string) {
  const dayCount = Math.max(quote.itineraries.length, (quote.nightCount || 0) + 1, 1);
  const travelerCount = quote.adults + quote.children;
  const description = cleanText(quote.description);

  if (description && !isWeakText(description) && !isPlaceholderText(description)) {
    return description;
  }

  return destinationLine
    ? `A ${dayCount}-day journey through ${destinationLine} for ${formatGuestCountLabel(travelerCount)}, with accommodation, transport, and touring arranged throughout.`
    : `A ${dayCount}-day journey for ${formatGuestCountLabel(travelerCount)}, with accommodation, transport, and touring arranged throughout.`;
}

function buildCoverIntro() {
  return 'We are pleased to present your tailored journey through Jordan, designed for a smooth and memorable travel experience.';
}

function buildHighlights(quote: ProposalV3Quote, destinationLine: string) {
  const highlights = new Set<string>();

  if (destinationLine) {
    highlights.add(`Curated routing through ${destinationLine}.`);
  }

  if (quote.quoteItems.some((item) => isHotelItem(item))) {
    highlights.add('Accommodation planning aligned to the itinerary.');
  }

  if (quote.quoteItems.some((item) => isTransportItem(item))) {
    highlights.add('Ground transport coverage matched to the journey flow.');
  }

  if (quote.quoteItems.some((item) => isActivityItem(item) || isGuideItem(item))) {
    highlights.add('Experiences and guided touring integrated day by day.');
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
      snapshotLabel: 'Pricing status',
      snapshotValue: 'Pricing to be confirmed',
      snapshotHelper: 'Final slab selection depends on confirmed group size',
      mode: 'pending' as const,
      basisLines: [],
      noteLines: [],
      slabRows: [],
      isPending: true,
    };
  }

  return {
    title: pricing.title,
    snapshotLabel: pricing.snapshotLabel,
    snapshotValue: pricing.snapshotValue,
    snapshotHelper: pricing.snapshotHelper,
    mode: pricing.mode,
    basisLines: pricing.basisLines.filter((line) => !isPlaceholderText(line)),
    noteLines: pricing.noteLines.filter((line) => isSafeInvestmentNote(line) && !isPlaceholderText(line)),
    slabRows,
    isPending: false,
  };
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
    lines.add('Accommodation as outlined in the itinerary.');
  }
  if (quote.quoteItems.some((item) => isTransportItem(item))) {
    lines.add('Private transport and transfers as scheduled.');
  }
  if (quote.quoteItems.some((item) => isActivityItem(item))) {
    lines.add('Experiences and touring specifically mentioned in the program.');
  }
  if (quote.quoteItems.some((item) => isGuideItem(item))) {
    lines.add('Guiding services where indicated.');
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
  const notes = [
    'Rates remain subject to final availability and confirmation at the time of booking.',
    quote.quoteOptions.length > 0
      ? `Alternative options can be prepared on request. ${quote.quoteOptions.length} option${quote.quoteOptions.length === 1 ? '' : 's'} currently available.`
      : 'Alternative arrangements can be prepared on request.',
    ...pricingNotes,
  ];

  return notes.map((note) => cleanText(note)).filter(Boolean);
}

function getProposalCurrency(quote: ProposalV3Quote) {
  const currency = quote.quoteCurrency?.trim().toUpperCase() || 'USD';
  return ['USD', 'EUR', 'JOD'].includes(currency) ? currency : 'USD';
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

function buildProposalTitle() {
  return 'Jordan Travel Proposal';
}

function formatDurationLabel(dayCount: number, nightCount: number) {
  return `${dayCount} Day${dayCount === 1 ? '' : 's'} / ${nightCount} Night${nightCount === 1 ? '' : 's'}`;
}

export function mapQuoteToProposalV3(quote: ProposalV3Quote): ProposalV3ViewModel {
  const sortedDays = [...quote.itineraries].sort((a, b) => a.dayNumber - b.dayNumber);
  const totalPax = quote.adults + quote.children;
  const dayCount = Math.max(sortedDays.length, (quote.nightCount || 0) + 1, 1);
  const destinations = Array.from(new Set(sortedDays.map((day) => extractDayLocation(day.title, day.dayNumber)).filter(Boolean)));
  const destinationLine = summarizeDestinations(destinations) || cleanText(quote.title).replace(/\s+Journey$/i, '');
  const coverSubtitle = formatDestinationSubtitle(destinations) || destinationLine || 'Jordan';
  const currency = getProposalCurrency(quote);
  const documentTitle = buildProposalTitle();
  const durationLabel = formatDurationLabel(dayCount, quote.nightCount || Math.max(dayCount - 1, 0));
  const coverIntro = buildCoverIntro();
  const journeySummary = buildJourneySummary(quote, destinationLine);
  const totalValue =
    typeof quote.totalSell === 'number' && Number.isFinite(quote.totalSell) && quote.totalSell > 0
      ? formatProposalMoney(quote.totalSell, currency)
      : 'To be confirmed';
  const perPersonValue =
    typeof quote.pricePerPax === 'number' && Number.isFinite(quote.pricePerPax) && quote.pricePerPax > 0
      ? formatProposalMoney(quote.pricePerPax, currency)
      : 'To be confirmed';

  return {
    documentTitle,
    metaTitle: `${documentTitle || 'Travel Proposal'} | ${getBrandName(quote)}`,
    brandName: getBrandName(quote),
    accentColor: getAccentColor(quote),
    quoteReference: cleanText(quote.quoteNumber) || 'Quote reference to be confirmed',
    travelerName: getTravelerName(quote),
    coverSubtitle,
    destinationLine,
    durationLabel,
    travelDatesLabel: formatDate(quote.travelStartDate) || 'Dates to be confirmed',
    coverIntro,
    subtitle: `${formatNightCountLabel(quote.nightCount)} · ${formatGuestCountLabel(totalPax)}${destinationLine ? ` · ${destinationLine}` : ''}`,
    proposalDateLabel: formatDate(quote.createdAt) || formatDate(new Date()) || '',
    travelerCountLabel: formatGuestCountLabel(totalPax),
    servicesCountLabel: `${quote.quoteItems.length} service${quote.quoteItems.length === 1 ? '' : 's'}`,
    totalDaysLabel: `${dayCount} itinerary day${dayCount === 1 ? '' : 's'}`,
    pricingHighlightTotal: totalValue,
    pricingHighlightPerPax: perPersonValue,
    pricingHighlightCurrency: currency,
    journeySummary,
    highlights: buildHighlights(quote, destinationLine),
    accommodationRows: buildAccommodationRows(quote),
    days: buildDays(quote),
    investment: buildInvestment(quote, currency),
    inclusions: parseSupportTextList(quote.inclusionsText).length
      ? parseSupportTextList(quote.inclusionsText)
      : buildDefaultInclusions(quote),
    notes: parseSupportTextList(quote.termsNotesText).length
      ? parseSupportTextList(quote.termsNotesText)
      : buildDefaultNotes(quote),
  };
}
