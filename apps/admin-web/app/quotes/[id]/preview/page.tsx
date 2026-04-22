import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DownloadPdfButton } from './DownloadPdfButton';
import { formatNightCountLabel } from '../../../lib/formatters';
import { getItineraryDayDisplay } from '../../../lib/itineraryDayDisplay';
import { getValidatedTripSummary } from '../../../lib/tripSummary';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';
const DATA_API_BASE_URL = '/api';

type Company = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
};

type Itinerary = {
  id: string;
  dayNumber: number;
  title: string;
  description: string | null;
  images: {
    id: string;
    sortOrder: number;
    galleryImage: {
      id: string;
      title: string;
      imageUrl: string;
      destination: string | null;
      category: string | null;
    };
  }[];
};

type QuoteItem = {
  id: string;
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
  hotelId: string | null;
  contractId: string | null;
  seasonName: string | null;
  roomCategoryId: string | null;
  occupancyType: 'SGL' | 'DBL' | 'TPL' | null;
  mealPlan: 'BB' | 'HB' | 'FB' | null;
  quantity: number;
  baseCost: number;
  overrideCost: number | null;
  useOverride: boolean;
  unitCost?: number;
  currency: string;
  pricingDescription: string | null;
  totalSell: number;
  service: {
    id: string;
    name: string;
    category: string;
  };
  appliedVehicleRate: {
    id: string;
    routeName: string;
    vehicle: {
      name: string;
    };
    serviceType: {
      name: string;
    };
  } | null;
  hotel: {
    name: string;
  } | null;
  contract: {
    name: string;
  } | null;
  roomCategory: {
    name: string;
  } | null;
};

type QuoteOption = {
  id: string;
  name: string;
  notes: string | null;
  totalSell: number;
  pricePerPax: number;
  quoteItems: QuoteItem[];
};

type QuoteScenario = {
  id: string;
  paxCount: number;
  totalCost: number;
  totalSell: number;
  pricePerPax: number;
};

type Quote = {
  id: string;
  quoteNumber: string | null;
  title: string;
  description: string | null;
  inclusionsText: string | null;
  exclusionsText: string | null;
  termsNotesText: string | null;
  pricingMode: 'SLAB' | 'FIXED';
  pricingType: 'simple' | 'group';
  fixedPricePerPerson: number;
  pricingSlabs: Array<{
    id: string;
    minPax: number;
    maxPax: number | null;
    price: number;
    actualPax?: number;
    focPax?: number;
    payingPax?: number;
    totalCost?: number;
    totalSell?: number;
    pricePerPayingPax?: number;
    pricePerActualPax?: number | null;
    notes?: string | null;
  }>;
  focType: 'none' | 'ratio' | 'fixed';
  focRatio: number | null;
  focCount: number | null;
  focRoomType: 'single' | 'double' | null;
  resolvedFocCount: number;
  resolvedFocRoomType: 'single' | 'double' | null;
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  travelStartDate: string | null;
  singleSupplement?: number | null;
  totalSell: number;
  pricePerPax: number;
  currentPricing?: {
    pricingType: 'simple' | 'group';
    pricingMode: 'SLAB' | 'FIXED';
    paxCount: number;
    isAvailable: boolean;
    label: string;
    value: number | null;
    message: string | null;
      matchedSlab: {
        id?: string;
        minPax: number;
        maxPax: number | null;
        price: number;
        label: string;
        actualPax?: number;
        focPax?: number;
        payingPax?: number;
        totalCost?: number;
        totalSell?: number;
        pricePerPayingPax?: number;
        pricePerActualPax?: number | null;
      } | null;
    } | null;
  priceComputation?: {
    status: 'ok' | 'missing_coverage' | 'invalid_config';
    mode: 'simple' | 'group';
    requestedPax: number;
    matchedSlab?: {
      id?: string;
      minPax: number;
      maxPax: number | null;
      pricePerPayingPax: number;
      label: string;
      actualPax: number;
      focPax: number;
      payingPax: number;
      totalCost?: number;
      totalSell?: number;
      pricePerActualPax?: number | null;
    };
    totals?: {
      pricePerPayingPax?: number;
      pricePerActualPax?: number;
      totalPrice?: number;
      totalCost?: number;
      totalSell?: number;
      actualPax?: number;
      focPax?: number;
      payingPax?: number;
      focCount?: number;
      payablePax?: number;
      singleSupplement?: number;
    };
    display: {
      summaryLabel: string;
      summaryValue?: string | null;
      pricingText?: string;
      focText?: string;
      singleSupplementText?: string;
      slabLines?: Array<{ label: string; value: string; detail?: string }>;
      contextLines?: string[];
    };
    warnings: string[];
  } | null;
  company: Company;
  contact: Contact;
  itineraries: Itinerary[];
  quoteItems: QuoteItem[];
  quoteOptions: QuoteOption[];
  scenarios: QuoteScenario[];
};

type QuotePreviewPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function getQuote(id: string): Promise<Quote | null> {
  return adminPageFetchJson<Quote | null>(`${DATA_API_BASE_URL}/quotes/${id}`, 'Quote preview', {
    cache: 'no-store',
    allow404: true,
  });
}

function formatMoney(amount: number, currency = 'USD') {
  return `${currency} ${amount.toFixed(2)}`;
}

function parseSupportText(text: string | null | undefined) {
  return (text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s*-]+/, '').trim())
    .filter((line) => Boolean(line));
}

function getPriceSummary(quote: Quote) {
  if (quote.priceComputation) {
    return {
      label: quote.priceComputation.display.summaryLabel,
      value: quote.priceComputation.display.summaryValue ?? null,
      slabLines: quote.priceComputation.display.slabLines || [],
      contextLines: quote.priceComputation.display.contextLines || [],
      notes: Array.from(
        new Set([
          ...(quote.priceComputation.display.pricingText && quote.priceComputation.status === 'invalid_config'
            ? [quote.priceComputation.display.pricingText]
            : []),
          ...(quote.priceComputation.display.singleSupplementText ? [quote.priceComputation.display.singleSupplementText] : []),
          ...(quote.priceComputation.display.focText ? [quote.priceComputation.display.focText] : []),
          ...quote.priceComputation.warnings,
        ]),
      ),
    };
  }

  const guestCount = Math.max(quote.adults + quote.children, 1);
  if (quote.pricingMode === 'SLAB') {
    return {
      label: 'Group pricing',
      value:
        quote.currentPricing?.isAvailable && quote.currentPricing.value !== null
          ? formatMoney(quote.currentPricing.value)
          : null,
      slabLines: (quote.pricingSlabs || []).map((slab) => ({
        label:
          `${slab.maxPax === null ? `${slab.minPax}+ guests` : slab.minPax === slab.maxPax ? `${slab.minPax} guest` : `${slab.minPax}\u2013${slab.maxPax} guests`}${slab.focPax ? ` + ${slab.focPax} FOC` : ''}`,
        value: formatMoney(slab.pricePerPayingPax ?? slab.price),
        detail:
          slab.actualPax !== undefined
            ? `${slab.actualPax} actual | ${slab.focPax ?? 0} FOC | ${slab.payingPax ?? slab.actualPax} paying`
            : undefined,
      })),
      contextLines: [
        ...(quote.currentPricing?.matchedSlab
          ? [`Selected group size: ${quote.currentPricing.paxCount} pax (${quote.currentPricing.matchedSlab.label})`]
          : []),
        'Accommodation in double/twin sharing room',
      ],
      notes: [
        ...(!quote.currentPricing?.isAvailable ? [quote.currentPricing?.message || 'Price unavailable for selected passenger count.'] : []),
        quote.singleSupplement !== null && quote.singleSupplement !== undefined
          ? `Single supplement: ${formatMoney(quote.singleSupplement)} per person`
          : 'Single supplement available on request',
      ],
    };
  }

  return {
    label: quote.currentPricing?.label || 'Fixed price',
    value: formatMoney(quote.currentPricing?.value ?? quote.fixedPricePerPerson),
    slabLines: [] as Array<{ label: string; value: string; detail?: string }>,
    contextLines: [`Based on ${guestCount} guests sharing`, 'Accommodation in double/twin sharing room'],
    notes: [
      quote.singleSupplement !== null && quote.singleSupplement !== undefined
        ? `Single supplement: ${formatMoney(quote.singleSupplement)} per person`
        : 'Single supplement available on request',
    ],
  };
}

function getItemSummary(item: QuoteItem) {
  let summary = '';

  if (item.hotel && item.contract && item.seasonName && item.roomCategory && item.occupancyType && item.mealPlan) {
    summary = `${item.hotel.name} | ${item.contract.name} | ${item.seasonName} | ${item.roomCategory.name} | ${item.occupancyType} / ${item.mealPlan}`;
  } else if (item.appliedVehicleRate) {
    summary = `${item.appliedVehicleRate.routeName} | ${item.appliedVehicleRate.vehicle.name} | ${item.appliedVehicleRate.serviceType.name}`;
  } else {
    const finalCost =
      item.useOverride && item.overrideCost !== null ? item.overrideCost : (item.baseCost ?? item.unitCost ?? 0);
    summary = item.pricingDescription || `Qty ${item.quantity} at ${formatMoney(finalCost, item.currency)}`;
  }

  if (item.useOverride && item.overrideCost !== null) {
    return `${summary} | Override active`;
  }

  return summary;
}

function getItemDisplayTitle(item: QuoteItem) {
  if (item.hotel && item.contract && item.seasonName && item.roomCategory && item.occupancyType && item.mealPlan) {
    return `${item.hotel.name} | ${item.contract.name} | ${item.seasonName} | ${item.roomCategory.name} | ${item.occupancyType} / ${item.mealPlan}`;
  }

  return item.service.name;
}

function resolveQuoteItemServiceDate(
  travelStartDate: string | null,
  itineraries: Itinerary[],
  item: Pick<QuoteItem, 'serviceDate' | 'itineraryId'>,
) {
  if (item.serviceDate) {
    return item.serviceDate;
  }

  if (!travelStartDate || !item.itineraryId) {
    return null;
  }

  const itinerary = itineraries.find((day) => day.id === item.itineraryId);

  if (!itinerary) {
    return null;
  }

  const resolvedDate = new Date(travelStartDate);
  resolvedDate.setUTCDate(resolvedDate.getUTCDate() + (itinerary.dayNumber - 1));

  return resolvedDate.toISOString();
}

function getReconfirmationWarning(reconfirmationDueAt: string | null) {
  if (!reconfirmationDueAt) {
    return null;
  }

  const dueAt = new Date(reconfirmationDueAt).getTime();

  if (Number.isNaN(dueAt)) {
    return null;
  }

  const now = Date.now();
  if (dueAt <= now) {
    return 'Reconfirmation overdue';
  }

  return dueAt - now <= 48 * 60 * 60 * 1000 ? 'Reconfirmation due soon' : null;
}

function renderServices(items: QuoteItem[], emptyLabel: string, quote: Pick<Quote, 'travelStartDate' | 'itineraries'>) {
  if (items.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="quote-preview-service-list">
      {items.map((item) => (
        <article key={item.id} className="quote-preview-service-row">
          <div>
            <strong>{getItemDisplayTitle(item)}</strong>
            {item.hotel && item.contract && item.seasonName && item.roomCategory && item.occupancyType && item.mealPlan ? null : (
              <>
                <p>
                  {item.service.category} | {getItemSummary(item)}
                </p>
                {resolveQuoteItemServiceDate(quote.travelStartDate, quote.itineraries, item) ||
                item.startTime ||
                item.pickupTime ||
                item.pickupLocation ||
                item.meetingPoint ||
                item.participantCount !== null ||
                item.reconfirmationRequired ? (
                  <div>
                    <p>
                      {[
                        resolveQuoteItemServiceDate(quote.travelStartDate, quote.itineraries, item)
                          ? `Date ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(resolveQuoteItemServiceDate(quote.travelStartDate, quote.itineraries, item)!))}`
                          : null,
                        item.startTime ? `Start ${item.startTime}` : null,
                        item.pickupTime ? `Pickup ${item.pickupTime}` : null,
                      ]
                        .filter(Boolean)
                        .join(' | ')}
                    </p>
                    {(item.pickupLocation || item.meetingPoint) ? (
                      <p>
                        {[item.pickupLocation ? `Pickup ${item.pickupLocation}` : null, item.meetingPoint ? `Meeting ${item.meetingPoint}` : null]
                          .filter(Boolean)
                          .join(' | ')}
                      </p>
                    ) : null}
                    {(item.participantCount !== null || item.adultCount !== null || item.childCount !== null) ? (
                      <p>
                        {[item.participantCount !== null ? `${item.participantCount} pax` : null, item.adultCount !== null ? `${item.adultCount} adults` : null, item.childCount !== null ? `${item.childCount} children` : null]
                          .filter(Boolean)
                          .join(' | ')}
                      </p>
                    ) : null}
                    {item.reconfirmationRequired ? (
                      <p>
                        Reconfirmation required
                        {item.reconfirmationDueAt ? ` | Due ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.reconfirmationDueAt))}` : ''}
                        {getReconfirmationWarning(item.reconfirmationDueAt) ? ` | ${getReconfirmationWarning(item.reconfirmationDueAt)}` : ''}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
          <strong>{formatMoney(item.totalSell, item.currency)}</strong>
        </article>
      ))}
    </div>
  );
}

export default async function QuotePreviewPage({ params }: QuotePreviewPageProps) {
  const { id } = await params;
  const quote = await getQuote(id);

  if (!quote) {
    notFound();
  }

  const totalPax = quote.adults + quote.children;
  const sortedDays = [...quote.itineraries].sort((a, b) => a.dayNumber - b.dayNumber);
  const unassignedItems = quote.quoteItems.filter((item) => !item.itineraryId);
  const priceSummary = getPriceSummary(quote);
  const hasItineraryDays = sortedDays.length > 0;
  const tripSummary = getValidatedTripSummary({
    quoteTitle: quote.title,
    quoteDescription: quote.description,
    dayTitles: sortedDays.map((day) => day.title),
    totalPax,
    nightCount: quote.nightCount,
  });

  return (
    <main className="page">
      <section className="panel quote-preview-page">
        <Link href={`/quotes/${quote.id}`} className="back-link">
          Back to quote
        </Link>

        <header className="quote-preview-hero">
          <div>
            <p className="eyebrow">Quote Preview</p>
            <h1 className="section-title quote-title">{quote.title}</h1>
            <p className="detail-copy">{quote.quoteNumber || 'Quote number pending'}</p>
            <p className="detail-copy">{tripSummary}</p>
          </div>
          <div className="quote-preview-meta">
            <strong>{quote.company.name}</strong>
            <p>{quote.quoteNumber || 'Quote number pending'}</p>
            <p>
              {quote.contact.firstName} {quote.contact.lastName}
            </p>
            <p>
              {totalPax} pax | {quote.roomCount} rooms | {formatNightCountLabel(quote.nightCount)}
            </p>
            <DownloadPdfButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} />
          </div>
        </header>

        <section className="quote-preview-grid">
          <article className="detail-card">
            <p className="eyebrow">Price Summary</p>
            <p className="detail-copy">{priceSummary.label}</p>
            {priceSummary.value ? <h2 className="section-title">{priceSummary.value}</h2> : null}
            {priceSummary.slabLines.map((slab) => (
              <p key={slab.label} className="detail-copy">
                <strong>{slab.label}</strong> {slab.value}
                {slab.detail ? <span> | {slab.detail}</span> : null}
              </p>
            ))}
            {priceSummary.contextLines.map((line) => (
              <p key={line} className="detail-copy">
                {line}
              </p>
            ))}
            {priceSummary.notes.map((note) => (
              <p key={note} className="detail-copy">
                {note}
              </p>
            ))}
          </article>

          <article className="detail-card">
            <p className="eyebrow">Option Summary</p>
            <div className="quote-preview-option-list">
              {quote.quoteOptions.length === 0 ? (
                <p className="empty-state">No hotel options added yet.</p>
              ) : (
                quote.quoteOptions.map((option) => (
                  <div key={option.id} className="quote-preview-option-row">
                    <div>
                      <strong>{option.name}</strong>
                      <p>{option.notes || 'No notes provided.'}</p>
                    </div>
                    <div>
                      <strong>{formatMoney(option.totalSell)}</strong>
                      <p>{formatMoney(option.pricePerPax)} per pax</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="detail-card">
          <p className="eyebrow">Itinerary By Day</p>
          <div className="quote-preview-day-list">
            {!hasItineraryDays ? (
              <p className="empty-state">Detailed day-by-day itinerary will be provided upon confirmation.</p>
            ) : (
              sortedDays.map((day) => {
                const dayItems = quote.quoteItems.filter((item) => item.itineraryId === day.id);
                const primaryImage = day.images[0]?.galleryImage || null;
                const displayDay = getItineraryDayDisplay(day);
                return (
                  <article key={day.id} className="quote-preview-day-card">
                    <div className="quote-preview-day-head">
                      <div>
                        <p className="eyebrow">{displayDay.dayLabel}</p>
                        <p className="detail-copy">{displayDay.city}</p>
                        <strong>{displayDay.title}</strong>
                        <p>{displayDay.description}</p>
                      </div>
                    </div>
                    {primaryImage ? (
                      <figure className="quote-preview-day-image">
                        <img src={primaryImage.imageUrl} alt={primaryImage.title} className="quote-preview-day-image-asset" />
                      </figure>
                    ) : null}
                    {renderServices(dayItems, 'No services assigned to this day.', quote)}
                  </article>
                );
              })
            )}
          </div>
        </section>

        {hasItineraryDays ? (
          <section className="detail-card">
            <p className="eyebrow">Services Outside Itinerary</p>
            {renderServices(unassignedItems, 'No extra services outside the itinerary.', quote)}
          </section>
        ) : null}

        {parseSupportText(quote.inclusionsText).length > 0 ? (
          <section className="detail-card">
            <p className="eyebrow">Inclusions</p>
            {parseSupportText(quote.inclusionsText).map((line) => (
              <p key={line} className="detail-copy">
                {line}
              </p>
            ))}
          </section>
        ) : null}

        {parseSupportText(quote.exclusionsText).length > 0 ? (
          <section className="detail-card">
            <p className="eyebrow">Exclusions</p>
            {parseSupportText(quote.exclusionsText).map((line) => (
              <p key={line} className="detail-copy">
                {line}
              </p>
            ))}
          </section>
        ) : null}

        {parseSupportText(quote.termsNotesText).length > 0 ? (
          <section className="detail-card">
            <p className="eyebrow">Terms & Notes</p>
            {parseSupportText(quote.termsNotesText).map((line) => (
              <p key={line} className="detail-copy">
                {line}
              </p>
            ))}
          </section>
        ) : null}

        {quote.pricingMode === 'SLAB' ? (
          <section className="detail-card">
            <p className="eyebrow">Group Pricing Table</p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pax count</th>
                    <th>Total sell</th>
                    <th>Price per pax</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.scenarios.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="empty-state">
                        No group pricing generated yet.
                      </td>
                    </tr>
                  ) : (
                    quote.scenarios.map((scenario) => (
                      <tr key={scenario.id}>
                        <td>{scenario.paxCount}</td>
                        <td>{formatMoney(scenario.totalSell)}</td>
                        <td>{formatMoney(scenario.pricePerPax)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
