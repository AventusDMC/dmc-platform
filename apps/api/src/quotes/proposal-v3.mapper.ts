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
  const rawName =
    cleanText(quote.brandCompany?.name) ||
    cleanText(quote.clientCompany?.name) ||
    'Travel Proposal';

  if (/brand\s*-\s*desert compass jordan/i.test(rawName)) {
    return 'Desert Compass Jordan';
  }

  return rawName.replace(/^brand\s*-\s*/i, '');
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

function isExternalPackageItem(item: ProposalV3QuoteItem) {
  const normalized = normalizeComparisonText(item.service.serviceType?.code || item.service.serviceType?.name || item.service.category).replace(/\s+/g, '_');
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
  const order = ['Stay', 'Transfer', 'Partner Package', 'Experience', 'Meal', 'Guide', 'Other'];

  for (const item of dayItems) {
    const groupLabel = getGroupLabel(item);
    const items = grouped.get(groupLabel) || [];
    const rawTitle = isExternalPackageItem(item)
      ? cleanText(item.externalPackageCountry || item.service.name || '')
      : cleanText(item.hotel?.name || item.appliedVehicleRate?.routeName || item.service.name || '');
    const importedDescription = extractImportedDescription(item);
    let description =
      cleanText(
        isExternalPackageItem(item)
          ? [
              item.externalClientDescription,
              item.externalIncludes ? `Includes: ${item.externalIncludes}` : null,
              item.externalExcludes ? `Excludes: ${item.externalExcludes}` : null,
            ]
              .filter(Boolean)
              .join(' ')
          : importedDescription || item.pricingDescription || '',
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

function getPositiveDayNumber(value: number | null | undefined) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
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

function buildDays(quote: ProposalV3Quote): ProposalV3Day[] {
  const sortedDays = [...quote.itineraries].sort((a, b) => a.dayNumber - b.dayNumber);
  const days = sortedDays.map((day) => {
    const location = extractDayLocation(day.title, day.dayNumber);
    const dayItems = quote.quoteItems.filter(
      (item) => item.itineraryId === day.id && !(isExternalPackageItem(item) && getPositiveDayNumber(item.externalStartDay)),
    );
    const summary = cleanText(day.description || '');

    return {
      dayNumber: day.dayNumber,
      title: isWeakText(day.title) ? location : cleanText(day.title) || location,
      summary: isPlaceholderText(summary) ? null : summary || null,
      overnightLocation: dayItems.some((item) => isHotelItem(item)) ? location : null,
      groups: buildDayGroups(day, dayItems),
    };
  });

  const assignedItineraryIds = new Set(sortedDays.map((day) => day.id));
  const externalRangeItems = quote.quoteItems.filter(
    (item) =>
      isExternalPackageItem(item) &&
      (getPositiveDayNumber(item.externalStartDay) || !item.itineraryId || !assignedItineraryIds.has(item.itineraryId)),
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
        );
        const existingDay = days.find((day) => day.dayNumber === dayNumber);

        if (existingDay) {
          appendDayGroups(existingDay, groups);
          if (!existingDay.overnightLocation) {
            existingDay.overnightLocation = cleanText(item.externalPackageCountry || '') || null;
          }
          continue;
        }

        days.push({
          dayNumber,
          title: `Day ${dayNumber}: ${country}`,
          summary: null,
          overnightLocation: cleanText(item.externalPackageCountry || '') || null,
          groups,
        });
      }
    }
  }

  return days.sort((a, b) => a.dayNumber - b.dayNumber);
}

function buildJourneySummary(quote: ProposalV3Quote, destinationLine: string) {
  return 'A curated journey through Jordan’s most iconic destinations, combining culture, history, and desert experiences.';
}

function buildCoverIntro() {
  return 'A refined proposal designed for a seamless Jordan experience, with carefully sequenced touring, stays, and private ground arrangements.';
}

function buildHighlights(quote: ProposalV3Quote, destinationLine: string) {
  const highlights = new Set<string>();

  if (destinationLine) {
    highlights.add(`A well-paced routing through ${destinationLine}.`);
  }

  if (quote.quoteItems.some((item) => isHotelItem(item))) {
    highlights.add('Handpicked stays aligned with the journey flow.');
  }

  if (quote.quoteItems.some((item) => isTransportItem(item))) {
    highlights.add('Private transfers coordinated throughout the route.');
  }

  if (quote.quoteItems.some((item) => isActivityItem(item) || isGuideItem(item))) {
    highlights.add('Cultural visits and experiences arranged day by day.');
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

  const itemCostTotal = quoteItems.reduce((sum, item) => sum + Number(item.finalCost ?? item.totalCost ?? 0), 0);
  const itemSellTotal = quoteItems.reduce((sum, item) => sum + Number(item.totalSell ?? 0), 0);
  const totalCost = Number((Number.isFinite(Number(quote.totalCost)) ? Number(quote.totalCost) : itemCostTotal).toFixed(2));
  const totalSell = Number((Number.isFinite(Number(quote.totalSell)) ? Number(quote.totalSell) : itemSellTotal).toFixed(2));
  const margin = Number((totalSell - totalCost).toFixed(2));
  const marginPercent = totalSell > 0 ? Number(((margin / totalSell) * 100).toFixed(2)) : 0;

  if (totalCost > 0 || totalSell > 0) {
    lines.push(`PDF total cost: ${formatProposalMoney(totalCost, currency)}`);
    lines.push(`PDF sell total: ${formatProposalMoney(totalSell, currency)}`);
    lines.push(`PDF margin: ${formatProposalMoney(margin, currency)} (${marginPercent.toFixed(2)}%)`);
  }

  if (quoteItems.some((item) => item.useOverride || item.finalCost !== null && item.finalCost !== undefined)) {
    lines.push('Manual finalCost override reflected in PDF totals.');
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
  if (quote.quoteItems.some((item) => isExternalPackageItem(item))) {
    lines.add('Partner DMC package services as described in the program.');
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
    'Prices are subject to availability and final confirmation at the time of booking.',
    quote.quoteOptions.length > 0
      ? `Alternative arrangements can be prepared on request. ${quote.quoteOptions.length} additional option${quote.quoteOptions.length === 1 ? '' : 's'} can be shared if preferred.`
      : 'Alternative arrangements can be prepared on request.',
    'Any government taxes, entrance rules, or local regulations remain subject to change without prior notice.',
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
  const days = buildDays(quote);
  const totalPax = quote.adults + quote.children;
  const dayCount = Math.max(days.length, (quote.nightCount || 0) + 1, 1);
  const itineraryDestinations = sortedDays.map((day) => extractDayLocation(day.title, day.dayNumber)).filter(Boolean);
  const externalDestinations = quote.quoteItems
    .filter((item) => isExternalPackageItem(item))
    .map((item) => cleanText(item.externalPackageCountry || ''))
    .filter(Boolean);
  const destinations = Array.from(new Set([...itineraryDestinations, ...externalDestinations]));
  const destinationLine = summarizeDestinations(destinations) || cleanText(quote.title).replace(/\s+Journey$/i, '');
  const coverSubtitle =
    destinations.some((value) => value.toLowerCase() === 'amman') &&
    destinations.some((value) => value.toLowerCase() === 'petra') &&
    destinations.some((value) => value.toLowerCase() === 'wadi rum')
      ? 'Amman · Petra · Wadi Rum'
      : formatDestinationSubtitle(destinations) || destinationLine || 'Jordan';
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
    coverSubtitle: 'Amman · Petra · Wadi Rum',
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
