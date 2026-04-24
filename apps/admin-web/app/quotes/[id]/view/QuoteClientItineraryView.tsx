import type { ReactNode } from 'react';
import { getItineraryDayDisplay } from '../../../lib/itineraryDayDisplay';

export type ClientQuoteSummary = {
  title: string;
  description: string | null;
  quoteCurrency?: 'USD' | 'EUR' | 'JOD';
  status?: 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';
  adults: number;
  children: number;
  nightCount: number;
  totalSell: number;
  pricePerPax: number;
  currentPricing?: {
    label: string;
    value: number | null;
  } | null;
  priceComputation?: {
    display: {
      summaryLabel: string;
      summaryValue?: string | null;
    };
  } | null;
  invoice?: {
    id: string;
    quoteId: string;
    totalAmount: number;
    currency: string;
    status: 'DRAFT' | 'ISSUED' | 'PAID';
    dueDate: string;
  } | null;
};

type ClientLinkedServiceSummary = {
  id?: string | null;
  serviceDate: string | null;
  startTime: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  paxCount: number | null;
  participantCount: number | null;
  adultCount: number | null;
  childCount: number | null;
  pricingDescription: string | null;
  currency?: string | null;
  quoteCurrency?: string | null;
  totalSell?: number | null;
  salesTaxPercent?: number | null;
  salesTaxIncluded?: boolean | null;
  serviceChargePercent?: number | null;
  serviceChargeIncluded?: boolean | null;
  tourismFeeAmount?: number | null;
  tourismFeeMode?: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
  service: {
    name: string;
    category: string;
    serviceType: {
      name: string;
      code: string | null;
    } | null;
  } | null;
  hotel: {
    name: string;
    city: string;
  } | null;
  roomCategory: {
    name: string;
    code: string | null;
  } | null;
  appliedVehicleRate: {
    routeName: string;
    vehicle: {
      name: string;
    } | null;
    serviceType: {
      name: string;
      code: string | null;
    } | null;
  } | null;
};

type ClientQuoteItineraryDayItem = {
  id?: string | null;
  sortOrder: number;
  notes: string | null;
  isActive: boolean;
  quoteService: ClientLinkedServiceSummary | null;
};

type ClientQuoteItineraryDay = {
  dayNumber: number;
  title: string;
  notes: string | null;
  sortOrder: number;
  isActive: boolean;
  dayItems: ClientQuoteItineraryDayItem[];
};

export type ClientQuoteItineraryResponse = {
  days: ClientQuoteItineraryDay[];
};

type QuoteClientItineraryViewProps = {
  quote: ClientQuoteSummary;
  itinerary: ClientQuoteItineraryResponse;
  interactionPanel?: ReactNode;
};

function formatMoney(amount: number, currency = 'USD') {
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

function parseSafeDate(value: string | null | undefined) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return null;
  }

  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value: string) {
  const parsed = parseSafeDate(value);

  if (!parsed) {
    return 'Date to be confirmed';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(parsed);
}

function formatDateRangeLabel(values: string[]) {
  const validDates = values
    .map((value) => value?.trim())
    .filter(Boolean)
    .map((value) => parseSafeDate(value as string))
    .filter((value): value is Date => value !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  if (validDates.length === 0) {
    return 'Dates to be confirmed';
  }

  const first = validDates[0];
  const last = validDates[validDates.length - 1];
  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const withYearFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (first.toDateString() === last.toDateString()) {
    return withYearFormatter.format(first);
  }

  return `${formatter.format(first)} - ${withYearFormatter.format(last)}`;
}

function getDestinationsSummary(days: ClientQuoteItineraryDay[]) {
  const destinations = Array.from(
    new Set(
      days
        .filter((day) => day.isActive)
        .map((day) => getItineraryDayDisplay({ dayNumber: day.dayNumber, title: day.title, description: day.notes }).city)
        .filter(Boolean),
    ),
  );

  if (destinations.length === 0) {
    return 'Destinations to be confirmed';
  }

  if (destinations.length === 1) {
    return destinations[0];
  }

  if (destinations.length === 2) {
    return `${destinations[0]} and ${destinations[1]}`;
  }

  return `${destinations.slice(0, -1).join(', ')}, and ${destinations[destinations.length - 1]}`;
}

function getPriceSummary(quote: ClientQuoteSummary) {
  const quoteCurrency = quote.quoteCurrency || quote.invoice?.currency || 'USD';
  const helper = quote.priceComputation?.display.summaryLabel || quote.currentPricing?.label || 'Quote total';
  const value =
    quote.totalSell > 0
      ? formatMoney(quote.totalSell, quoteCurrency)
      : quote.priceComputation?.display.summaryValue || (quote.currentPricing?.value !== null && quote.currentPricing?.value !== undefined ? formatMoney(quote.currentPricing.value, quoteCurrency) : formatMoney(quote.pricePerPax, quoteCurrency));

  return {
    helper,
    value,
    perPerson: quote.pricePerPax > 0 ? formatMoney(quote.pricePerPax, quoteCurrency) : null,
    currency: quoteCurrency,
  };
}

function getClientFacingPricingNotes(service: ClientLinkedServiceSummary | null) {
  if (!service) {
    return [];
  }

  const notes = [
    service.salesTaxPercent
      ? service.salesTaxIncluded
        ? `Taxes are included at ${service.salesTaxPercent}%.`
        : `Taxes are not included and may apply at ${service.salesTaxPercent}%.`
      : null,
    service.serviceChargePercent
      ? service.serviceChargeIncluded
        ? `Service charge is included at ${service.serviceChargePercent}%.`
        : `Service charge is not included and may apply at ${service.serviceChargePercent}%.`
      : null,
    service.tourismFeeAmount
      ? `Tourism fee paid to hotel${service.tourismFeeMode === 'PER_NIGHT_PER_PERSON' ? ' per night per guest' : ' per night per room'}.`
      : null,
  ].filter(Boolean) as string[];

  return notes;
}

function getGlobalPricingNotes(days: ClientQuoteItineraryDay[]) {
  const serviceNotes = Array.from(
    new Set(
      days
        .flatMap((day) => day.dayItems)
        .filter((item) => item.isActive)
        .flatMap((item) => getClientFacingPricingNotes(item.quoteService)),
    ),
  );

  return [
    ...serviceNotes,
    'Rates are subject to final availability and confirmation at the time of booking.',
  ];
}

function getServiceTitle(service: ClientLinkedServiceSummary | null) {
  if (!service) {
    return 'Service details unavailable';
  }

  if (service.service?.name) {
    return service.service.name;
  }

  if (service.hotel?.name) {
    return service.hotel.name;
  }

  if (service.appliedVehicleRate?.routeName) {
    return service.appliedVehicleRate.routeName;
  }

  return 'Quote service';
}

function getServiceDetails(service: ClientLinkedServiceSummary | null) {
  if (!service) {
    return [];
  }

  const primary: string[] = [];
  const secondary: string[] = [];

  if (service.hotel?.name) {
    primary.push(service.hotel.name);
  }

  if (service.roomCategory?.name) {
    primary.push(service.roomCategory.name);
  }

  if (service.appliedVehicleRate?.routeName) {
    primary.push(service.appliedVehicleRate.routeName);
  }

  if (service.appliedVehicleRate?.vehicle?.name) {
    primary.push(service.appliedVehicleRate.vehicle.name);
  }

  if (service.service?.serviceType?.name) {
    secondary.push(service.service.serviceType.name);
  } else if (service.service?.category) {
    secondary.push(service.service.category);
  }

  if (service.serviceDate) {
    secondary.push(formatDate(service.serviceDate));
  }

  if (service.startTime) {
    secondary.push(`Start ${service.startTime}`);
  }

  if (service.pickupTime) {
    secondary.push(`Pickup ${service.pickupTime}`);
  }

  if (service.pickupLocation) {
    secondary.push(`Pickup ${service.pickupLocation}`);
  }

  if (service.meetingPoint) {
    secondary.push(`Meeting ${service.meetingPoint}`);
  }

  if (service.paxCount) {
    secondary.push(`${service.paxCount} pax`);
  } else if (service.participantCount) {
    secondary.push(`${service.participantCount} pax`);
  } else {
    const guestBreakdown = [service.adultCount ? `${service.adultCount} adults` : null, service.childCount ? `${service.childCount} children` : null]
      .filter(Boolean)
      .join(' | ');

    if (guestBreakdown) {
      secondary.push(guestBreakdown);
    }
  }

  return [primary.join(' | '), secondary.join(' | ')].filter(Boolean);
}

function getIncludedServices(days: ClientQuoteItineraryDay[]) {
  return Array.from(
    new Set(
      days
        .flatMap((day) => day.dayItems)
        .filter((item) => item.isActive)
        .map((item) => getServiceTitle(item.quoteService))
        .filter((value) => value && value !== 'Service details unavailable'),
    ),
  );
}

function getDayDateLabel(day: ClientQuoteItineraryDay) {
  const datedServices = day.dayItems
    .filter((item) => item.isActive && item.quoteService?.serviceDate)
    .map((item) => item.quoteService?.serviceDate as string);

  if (datedServices.length === 0) {
    return 'Date to be confirmed';
  }

  return formatDateRangeLabel(datedServices);
}

function getDayContextSubtitle(day: ClientQuoteItineraryDay) {
  const title = day.title.toLowerCase();
  const notes = (day.notes || '').toLowerCase();
  const haystack = `${title} ${notes}`;

  if (haystack.includes('arrival')) {
    return 'Arrival';
  }

  if (haystack.includes('departure')) {
    return 'Departure';
  }

  if (haystack.includes('leisure') || haystack.includes('free day') || haystack.includes('at leisure')) {
    return 'Leisure';
  }

  if (haystack.includes('explore') || haystack.includes('tour') || haystack.includes('visit') || haystack.includes('excursion')) {
    return 'Exploration';
  }

  if (haystack.includes('stay') || haystack.includes('overnight')) {
    return 'Stay';
  }

  if (haystack.includes('transfer') || haystack.includes('drive') || haystack.includes('travel')) {
    return 'Transit';
  }

  return null;
}

function getDayDescription(day: ClientQuoteItineraryDay, dayDisplay: ReturnType<typeof getItineraryDayDisplay>) {
  const explicitDescription = day.notes?.trim() || '';
  const derivedDescription = dayDisplay.description?.trim() || '';
  const normalizedTitle = dayDisplay.title.trim().toLowerCase();
  const normalizedDerived = derivedDescription.toLowerCase();

  if (explicitDescription) {
    return explicitDescription;
  }

  if (derivedDescription && normalizedDerived !== normalizedTitle) {
    return derivedDescription;
  }

  return 'Final operating details for this day will be confirmed before departure.';
}

function getServiceTypeLabel(service: ClientLinkedServiceSummary | null) {
  if (!service) {
    return 'Planned Service';
  }

  return service.service?.serviceType?.name || service.service?.category || 'Planned Service';
}

function getServiceIcon(service: ClientLinkedServiceSummary | null) {
  const haystack = [
    service?.service?.category,
    service?.service?.serviceType?.name,
    service?.service?.serviceType?.code,
    service?.appliedVehicleRate?.serviceType?.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (haystack.includes('hotel') || service?.hotel?.name) {
    return 'Stay';
  }

  if (haystack.includes('transfer') || haystack.includes('transport') || haystack.includes('vehicle') || service?.appliedVehicleRate) {
    return 'Ride';
  }

  if (haystack.includes('activity') || haystack.includes('tour') || haystack.includes('excursion')) {
    return 'Explore';
  }

  if (haystack.includes('meal') || haystack.includes('dinner') || haystack.includes('lunch')) {
    return 'Taste';
  }

  return 'Plan';
}

function getServiceMeta(service: ClientLinkedServiceSummary | null) {
  if (!service) {
    return [];
  }

  const meta = [
    service.serviceDate ? formatDate(service.serviceDate) : null,
    service.startTime ? `Start ${service.startTime}` : null,
    service.pickupTime ? `Pickup ${service.pickupTime}` : null,
    service.pickupLocation ? service.pickupLocation : null,
    service.meetingPoint ? `Meet ${service.meetingPoint}` : null,
    service.paxCount ? `${service.paxCount} pax` : service.participantCount ? `${service.participantCount} pax` : null,
  ];

  return meta.filter(Boolean) as string[];
}

function getServiceSummary(service: ClientLinkedServiceSummary | null) {
  if (!service) {
    return 'Final service details will be confirmed before travel.';
  }

  const parts = [
    service.pricingDescription,
    service.hotel?.city ? `Destination: ${service.hotel.city}` : null,
    service.roomCategory?.name ? `Room: ${service.roomCategory.name}` : null,
    service.appliedVehicleRate?.routeName ? `Route: ${service.appliedVehicleRate.routeName}` : null,
  ].filter(Boolean);

  return parts[0] || 'Included as part of your curated itinerary.';
}

function getDaySubtotal(day: ClientQuoteItineraryDay, quoteCurrency: string) {
  const pricedItems = day.dayItems
    .filter((item) => item.isActive && item.quoteService?.totalSell !== null && item.quoteService?.totalSell !== undefined)
    .map((item) => item.quoteService?.totalSell as number)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (pricedItems.length === 0) {
    return null;
  }

  return formatMoney(pricedItems.reduce((sum, value) => sum + value, 0), quoteCurrency);
}

function QuoteHeroSection({
  quote,
  destinationsSummary,
  dateRangeLabel,
  dayCount,
  nightCount,
  priceSummary,
  interactionPanel,
}: {
  quote: ClientQuoteSummary;
  destinationsSummary: string;
  dateRangeLabel: string;
  dayCount: number;
  nightCount: number;
  priceSummary: ReturnType<typeof getPriceSummary>;
  interactionPanel?: ReactNode;
}) {
  const guestCount = Math.max(quote.adults + quote.children, 0);

  return (
    <header className="quote-preview-hero quote-client-hero quote-client-editorial-hero">
      <div className="quote-client-brand-block quote-client-editorial-copy">
        <div className="quote-client-brand-mark quote-client-editorial-mark" aria-hidden="true">
          <span>DMC</span>
        </div>
        <div className="quote-client-hero-stack">
          <p className="eyebrow">Private Travel Proposal</p>
          <p className="quote-client-kicker">{destinationsSummary}</p>
          <h1 className="section-title quote-title quote-client-display-title">{quote.title}</h1>
          {quote.description ? <p className="detail-copy quote-client-hero-description">{quote.description}</p> : null}
          <div className="quote-client-hero-meta">
            <span>{dateRangeLabel}</span>
            <span>{guestCount} guests</span>
            <span>{dayCount} day{dayCount === 1 ? '' : 's'} / {nightCount} night{nightCount === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>
      <div className="quote-preview-meta quote-client-meta quote-client-editorial-aside">
        <div className="quote-client-price-card quote-client-editorial-price-card">
          <p className="detail-copy">Estimated total</p>
          <strong>{priceSummary.value}</strong>
          <span>{priceSummary.currency}</span>
        </div>
        <div className="quote-client-price-grid">
          <div>
            <span>Travel window</span>
            <strong>{dateRangeLabel}</strong>
          </div>
          <div>
            <span>Guest setup</span>
            <strong>{guestCount} travelers</strong>
          </div>
          <div>
            <span>Per person</span>
            <strong>{priceSummary.perPerson || 'On request'}</strong>
          </div>
        </div>
        {interactionPanel}
      </div>
    </header>
  );
}

function QuoteSummaryStrip({
  durationLabel,
  destinationsSummary,
  paxLabel,
  priceSummary,
  includedServices,
}: {
  durationLabel: string;
  destinationsSummary: string;
  paxLabel: string;
  priceSummary: ReturnType<typeof getPriceSummary>;
  includedServices: string[];
}) {
  return (
    <section className="quote-client-summary-strip" aria-label="Trip summary">
      <article className="quote-client-summary-card">
        <span>Duration</span>
        <strong>{durationLabel}</strong>
      </article>
      <article className="quote-client-summary-card">
        <span>Destinations</span>
        <strong>{destinationsSummary}</strong>
      </article>
      <article className="quote-client-summary-card">
        <span>Travel party</span>
        <strong>{paxLabel}</strong>
      </article>
      <article className="quote-client-summary-card">
        <span>Total</span>
        <strong>{priceSummary.value}</strong>
      </article>
      <article className="quote-client-summary-card quote-client-summary-card-wide">
        <span>Trip highlights</span>
        <strong>{includedServices.slice(0, 3).join(' • ') || 'Curated stays, transport, and experiences'}</strong>
      </article>
    </section>
  );
}

function QuoteServiceCard({
  service,
}: {
  service: ClientLinkedServiceSummary | null;
}) {
  const title = getServiceTitle(service);
  const meta = getServiceMeta(service);
  const details = getServiceDetails(service);
  const summary = getServiceSummary(service);
  const typeLabel = getServiceTypeLabel(service);
  const pricingNotes = getClientFacingPricingNotes(service);
  const totalSell = service?.totalSell && service.totalSell > 0 ? formatMoney(service.totalSell, service.quoteCurrency || service.currency || 'USD') : null;

  return (
    <article className="quote-client-service-card" aria-label={`${typeLabel}: ${title}`}>
      <div className="quote-client-service-icon" aria-hidden="true">
        <span>{getServiceIcon(service)}</span>
      </div>
      <div className="quote-client-service-body">
        <div className="quote-client-service-head">
          <div>
            <p className="quote-client-service-type">{typeLabel}</p>
            <strong>{title}</strong>
          </div>
          <span className="quote-client-service-badge">{totalSell || 'Included'}</span>
        </div>
        {meta.length > 0 ? (
          <div className="quote-client-service-meta">
            {meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
        <p className="detail-copy quote-client-service-summary">{summary}</p>
        {pricingNotes.length > 0 ? (
          <div className="quote-client-service-details">
            {pricingNotes.map((note) => (
              <p key={note} className="detail-copy">
                {note}
              </p>
            ))}
          </div>
        ) : null}
        {details.length > 0 ? (
          <div className="quote-client-service-details">
            {details.map((detail) => (
              <p key={detail} className="detail-copy">
                {detail}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function QuoteDayCard({ day }: { day: ClientQuoteItineraryDay }) {
  const dayDisplay = getItineraryDayDisplay({
    dayNumber: day.dayNumber,
    title: day.title,
    description: day.notes,
  });
  const dayContextSubtitle = getDayContextSubtitle(day);
  const dayDescription = getDayDescription(day, dayDisplay);
  const sortedItems = [...day.dayItems]
    .filter((item) => item.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const quoteCurrency = sortedItems.find((item) => item.quoteService?.quoteCurrency)?.quoteService?.quoteCurrency || 'USD';
  const daySubtotal = getDaySubtotal(day, quoteCurrency);

  return (
    <article className="quote-preview-day-card quote-client-editorial-day-card">
      <div className="quote-client-day-rail" aria-hidden="true">
        <span className="quote-client-day-number">{String(day.dayNumber).padStart(2, '0')}</span>
        <span className="quote-client-day-label">Day</span>
      </div>
      <div className="quote-client-day-content">
        <div className="quote-preview-day-head quote-client-day-head quote-client-editorial-day-head">
          <div>
            <p className="quote-client-day-date">{getDayDateLabel(day)}</p>
            {dayContextSubtitle ? <p className="quote-client-day-kicker">{dayContextSubtitle}</p> : null}
            <h3 className="quote-client-day-title">{dayDisplay.title}</h3>
            <p className="detail-copy quote-client-day-subtitle">{dayDisplay.city || 'Destination details to be confirmed'}</p>
            <p className="quote-client-day-description">{dayDescription}</p>
          </div>
          {daySubtotal ? (
            <div className="quote-client-price-card" style={{ minWidth: '10rem' }}>
              <p className="detail-copy">Day subtotal</p>
              <strong>{daySubtotal}</strong>
            </div>
          ) : null}
        </div>

        <div className="quote-client-day-image-placeholder quote-client-day-image-placeholder-hidden" aria-hidden="true">
          <span>Day imagery placeholder</span>
        </div>

        <div className="quote-preview-service-list quote-client-service-grid">
          {sortedItems.length === 0 ? (
            <p className="empty-state">Services for this day will be confirmed separately.</p>
          ) : (
            sortedItems.map((item, index) => (
              <QuoteServiceCard
                key={item.quoteService?.id || item.id || `${day.dayNumber}-${item.sortOrder}-${getServiceTitle(item.quoteService)}-${index}`}
                service={item.quoteService}
              />
            ))
          )}
        </div>
      </div>
    </article>
  );
}

export function QuoteClientItineraryView({ quote, itinerary, interactionPanel }: QuoteClientItineraryViewProps) {
  const sortedDays = [...itinerary.days]
    .filter((day) => day.isActive)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.dayNumber - right.dayNumber);
  const destinationsSummary = getDestinationsSummary(sortedDays);
  const priceSummary = getPriceSummary(quote);
  const includedServices = getIncludedServices(sortedDays);
  const allServiceDates = sortedDays.flatMap((day) =>
    day.dayItems
      .filter((item) => item.isActive && item.quoteService?.serviceDate)
      .map((item) => item.quoteService?.serviceDate as string),
  );
  const dateRangeLabel = formatDateRangeLabel(allServiceDates);
  const safeNightCount = Number.isFinite(quote.nightCount) && quote.nightCount > 0 ? quote.nightCount : 0;
  const derivedDayCount = safeNightCount > 0 ? safeNightCount + 1 : Math.max(sortedDays.length, 1);
  const durationLabel = `${derivedDayCount} day${derivedDayCount === 1 ? '' : 's'} / ${safeNightCount} night${safeNightCount === 1 ? '' : 's'}`;
  const paxLabel = `${Math.max(quote.adults + quote.children, 0)} travelers`;
  const pricingNotes = getGlobalPricingNotes(sortedDays);

  return (
    <main className="page">
      <section className="panel quote-preview-page quote-client-view">
        <QuoteHeroSection
          quote={quote}
          destinationsSummary={destinationsSummary}
          dateRangeLabel={dateRangeLabel}
          dayCount={derivedDayCount}
          nightCount={safeNightCount}
          priceSummary={priceSummary}
          interactionPanel={interactionPanel}
        />

        <QuoteSummaryStrip
          durationLabel={durationLabel}
          destinationsSummary={destinationsSummary}
          paxLabel={paxLabel}
          priceSummary={priceSummary}
          includedServices={includedServices}
        />

        <section className="quote-preview-grid">
          <article className="detail-card quote-client-info-card">
            <p className="eyebrow">Pricing Overview</p>
            <div className="quote-preview-total-list">
              <div>
                <span>Total</span>
                <strong>{priceSummary.value}</strong>
              </div>
              <div>
                <span>Currency</span>
                <strong>{priceSummary.currency}</strong>
              </div>
              <div>
                <span>Per person</span>
                <strong>{priceSummary.perPerson || 'To be confirmed'}</strong>
              </div>
            </div>
            <p className="detail-copy">{priceSummary.helper}</p>
          </article>

          <article className="detail-card quote-client-info-card">
            <p className="eyebrow">Included Services</p>
            <div className="quote-client-chip-list">
              {includedServices.length === 0 ? (
                <p className="empty-state">Included services will be confirmed in the final program.</p>
              ) : (
                includedServices.map((service) => (
                  <span key={service} className="quote-client-chip">
                    {service}
                  </span>
                ))
              )}
            </div>
          </article>

          <article className="detail-card quote-client-info-card">
            <p className="eyebrow">Pricing Notes</p>
            <div className="quote-client-exclusions">
              {pricingNotes.map((note) => (
                <p key={note} className="detail-copy">
                  {note}
                </p>
              ))}
              <p className="detail-copy">International flights, travel insurance, visas, and personal expenses are not included unless stated otherwise.</p>
            </div>
          </article>
        </section>

        <section className="detail-card quote-client-itinerary-card">
          <p className="eyebrow">Day By Day Itinerary</p>
          <h2 className="section-title" style={{ fontSize: '1.55rem', margin: '0 0 0.9rem' }}>Day-by-day journey</h2>
          <div className="quote-preview-day-list quote-client-editorial-day-list">
            {sortedDays.length === 0 ? (
              <p className="empty-state">No itinerary yet.</p>
            ) : (
              sortedDays.map((day) => <QuoteDayCard key={`${day.dayNumber}-${day.sortOrder}`} day={day} />)
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
