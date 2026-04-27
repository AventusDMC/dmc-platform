'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineEntityActions } from '../../components/InlineEntityActions';
import { InlineRowEditorShell } from '../../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { getMarginColor, getMarginMetrics } from '../../lib/financials';
import { RouteOption } from '../../lib/routes';
import { QuoteItemsForm } from './QuoteItemsForm';

type SupplierService = {
  id: string;
  supplierId: string;
  name: string;
  category: string;
  serviceTypeId?: string | null;
  serviceType?: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  } | null;
  unitType: string;
  baseCost: number;
  currency: string;
};

type Hotel = {
  id: string;
  name: string;
  city: string;
  category: string;
  hotelCategoryId?: string | null;
  roomCategories: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  }[];
};

type HotelContract = {
  id: string;
  hotelId: string;
  name: string;
  currency: string;
  validFrom: string;
  validTo: string;
  hotel: {
    id: string;
    name: string;
  };
};

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
};

type QuoteBlock = {
  id: string;
  name: string;
  type: 'ITINERARY_DAY' | 'SERVICE_BLOCK';
  title: string;
  description: string | null;
  defaultServiceId: string | null;
  defaultServiceTypeId: string | null;
  defaultCategory: string | null;
  defaultCost: number | null;
  defaultSell: number | null;
  defaultService?: SupplierService | null;
  defaultServiceType?: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  } | null;
};

type HotelRate = {
  id: string;
  contractId: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'BB' | 'HB' | 'FB';
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | null;
  currency: string;
  cost: number;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  };
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
  seasonId: string | null;
  seasonName: string | null;
  roomCategoryId: string | null;
  occupancyType: 'SGL' | 'DBL' | 'TPL' | null;
  mealPlan: 'BB' | 'HB' | 'FB' | null;
  quantity: number;
  paxCount: number | null;
  roomCount: number | null;
  nightCount: number | null;
  dayCount: number | null;
  baseCost: number;
  finalCost?: number | null;
  overrideCost: number | null;
  overrideReason?: string | null;
  useOverride: boolean;
  currency: string;
  pricingDescription: string | null;
  jordanPassCovered?: boolean;
  jordanPassSavingsJod?: number;
  markupPercent: number;
  totalCost: number;
  totalSell: number;
  service: SupplierService;
  appliedVehicleRate: {
    id: string;
    routeId: string | null;
    routeName: string;
    vehicle: {
      name: string;
    };
    serviceType: {
      id: string;
      name: string;
      code: string;
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

type Quote = {
  id: string;
  quoteType: 'FIT' | 'GROUP';
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  travelStartDate: string | null;
  itineraries: Array<{
    id: string;
    dayNumber: number;
    title: string;
  }>;
};

type SuggestedService = {
  serviceId: string;
  name: string;
  category: string;
  score: number;
};

type QuoteItemInitialValues = {
  serviceId: string;
  quantity: string;
  markupPercent: string;
  paxCount: string;
  participantCount: string;
  adultCount: string;
  childCount: string;
  roomCount: string;
  nightCount: string;
  dayCount: string;
  serviceDate: string;
  startTime: string;
  pickupTime: string;
  pickupLocation: string;
  meetingPoint: string;
  reconfirmationRequired: boolean;
  reconfirmationDueAt: string;
  baseCost: string;
  overrideCost: string;
  overrideReason?: string;
  useOverride: boolean;
  transportServiceTypeId: string;
  routeId: string;
  routeName: string;
  hotelId: string;
  contractId: string;
  seasonId: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'BB' | 'HB' | 'FB';
  guideType: 'local' | 'escort';
  guideDuration: 'half_day' | 'full_day';
  overnight: 'no' | 'yes';
};

type QuoteServicesTableProps = {
  apiBaseUrl: string;
  quote: Quote;
  items: QuoteItem[];
  quoteBlocks: QuoteBlock[];
  services: SupplierService[];
  transportServiceTypes: TransportServiceType[];
  routes: RouteOption[];
  hotels: Hotel[];
  hotelContracts: HotelContract[];
  hotelRates: HotelRate[];
  seasons: Array<{
    id: string;
    name: string;
  }>;
  totalPax: number;
  optionId?: string;
  emptyLabel?: string;
};

type ServiceSliceFilter = 'all' | 'issues' | 'missing-supplier' | 'missing-price';

function formatMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseGuideInitialValues(pricingDescription: string | null) {
  const normalized = pricingDescription?.toLowerCase() || '';

  return {
    guideType: normalized.includes('escort') ? ('escort' as const) : ('local' as const),
    guideDuration: normalized.includes('half day') ? ('half_day' as const) : ('full_day' as const),
    overnight: normalized.includes('overnight: yes') ? ('yes' as const) : ('no' as const),
  };
}

function buildQuoteItemInitialValues(item: QuoteItem, totalPax: number, roomCount: number, nightCount: number): QuoteItemInitialValues {
  const guideValues = parseGuideInitialValues(item.pricingDescription);

  return {
    serviceId: item.service.id,
    quantity: String(item.quantity),
    markupPercent: String(item.markupPercent),
    paxCount: String(item.paxCount ?? totalPax),
    participantCount: String(item.participantCount ?? totalPax),
    adultCount: String(item.adultCount ?? 0),
    childCount: String(item.childCount ?? 0),
    roomCount: String(item.roomCount ?? roomCount),
    nightCount: String(item.nightCount ?? nightCount),
    dayCount: String(item.dayCount ?? 1),
    serviceDate: item.serviceDate ? item.serviceDate.slice(0, 10) : '',
    startTime: item.startTime || '',
    pickupTime: item.pickupTime || '',
    pickupLocation: item.pickupLocation || '',
    meetingPoint: item.meetingPoint || '',
    reconfirmationRequired: item.reconfirmationRequired,
    reconfirmationDueAt: item.reconfirmationDueAt ? item.reconfirmationDueAt.slice(0, 16) : '',
    baseCost: String(item.baseCost),
    overrideCost: item.overrideCost === null ? '' : String(item.overrideCost),
    overrideReason: item.overrideReason || '',
    useOverride: item.useOverride,
    transportServiceTypeId: item.appliedVehicleRate?.serviceType.id || '',
    routeId: item.appliedVehicleRate?.routeId || '',
    routeName: item.appliedVehicleRate?.routeName || '',
    hotelId: item.hotelId || '',
    contractId: item.contractId || '',
    seasonId: item.seasonId || '',
    seasonName: item.seasonName || '',
    roomCategoryId: item.roomCategoryId || '',
    occupancyType: item.occupancyType || 'DBL',
    mealPlan: item.mealPlan || 'BB',
    guideType: guideValues.guideType,
    guideDuration: guideValues.guideDuration,
    overnight: guideValues.overnight,
  };
}

function getFinalItemCost(item: Pick<QuoteItem, 'baseCost' | 'overrideCost' | 'useOverride'>) {
  if (item.useOverride && item.overrideCost !== null) {
    return item.overrideCost;
  }

  return item.baseCost;
}

function isUnmatchedImportedService(service: SupplierService) {
  return service.supplierId === 'import-itinerary-system';
}

function getHotelItemSummary(item: Pick<QuoteItem, 'hotel' | 'contract' | 'seasonName' | 'roomCategory' | 'occupancyType' | 'mealPlan'>) {
  if (!item.hotel || !item.contract || !item.seasonName || !item.roomCategory || !item.occupancyType || !item.mealPlan) {
    return null;
  }

  return `${item.hotel.name} | ${item.contract.name} | ${item.seasonName} | ${item.roomCategory.name} | ${item.occupancyType} / ${item.mealPlan}`;
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
  const within48Hours = dueAt > now && dueAt - now <= 48 * 60 * 60 * 1000;

  if (dueAt <= now) {
    return 'Reconfirmation overdue';
  }

  return within48Hours ? 'Reconfirmation due soon' : null;
}

function isActivityService(item: Pick<QuoteItem, 'service'>) {
  const normalized = (item.service.serviceType?.code || item.service.serviceType?.name || item.service.category).trim().toLowerCase();

  return (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('experience') ||
    normalized.includes('sightseeing')
  );
}

function buildWarnings(item: QuoteItem) {
  const warnings: string[] = [];
  const activityService = isActivityService(item);
  const reconfirmationWarning = item.reconfirmationRequired ? getReconfirmationWarning(item.reconfirmationDueAt) : null;

  if (isUnmatchedImportedService(item.service)) {
    warnings.push('Missing supplier');
  }

  if (item.totalCost <= 0 || item.totalSell <= 0 || !item.paxCount) {
    warnings.push('Missing price');
  }

  if (item.totalSell <= item.totalCost) {
    warnings.push('Low margin');
  }

  if (activityService && !item.serviceDate) {
    warnings.push('Activity date missing');
  }

  if (activityService && !item.startTime && !item.pickupTime) {
    warnings.push('Start or pickup time missing');
  }

  if (activityService && !item.pickupLocation && !item.meetingPoint) {
    warnings.push('Pickup or meeting point missing');
  }

  if (activityService && !(item.participantCount || ((item.adultCount || 0) + (item.childCount || 0)))) {
    warnings.push('Participant counts missing');
  }

  if (reconfirmationWarning) {
    warnings.push(reconfirmationWarning);
  }

  return warnings;
}

function hasMissingSupplier(item: QuoteItem) {
  return isUnmatchedImportedService(item.service);
}

function hasMissingPrice(item: QuoteItem) {
  return item.totalCost <= 0 || item.totalSell <= 0 || !item.paxCount;
}

function getServiceStatus(item: QuoteItem) {
  const warnings = buildWarnings(item);

  if (warnings.length === 0) {
    return 'Ready';
  }

  if (hasMissingSupplier(item) || hasMissingPrice(item)) {
    return 'Needs setup';
  }

  return 'Needs review';
}

function getServiceStatusTone(status: string) {
  if (status === 'Ready') {
    return 'success';
  }

  if (status === 'Needs setup') {
    return 'error';
  }

  return 'warning';
}

function getIssueTone(warnings: string[]) {
  if (warnings.length === 0) {
    return 'success';
  }

  if (warnings.some((warning) => warning === 'Missing supplier' || warning === 'Missing price')) {
    return 'error';
  }

  return 'warning';
}

function QuoteServiceRow({
  apiBaseUrl,
  quote,
  item,
  quoteBlocks,
  services,
  transportServiceTypes,
  routes,
  hotels,
  hotelContracts,
  hotelRates,
  seasons,
  totalPax,
  optionId,
}: Omit<QuoteServicesTableProps, 'items' | 'emptyLabel'> & { item: QuoteItem }) {
  const router = useRouter();
  const [currentItem, setCurrentItem] = useState(item);
  const [suggestions, setSuggestions] = useState<SuggestedService[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(isUnmatchedImportedService(item.service));
  const [suggestionsError, setSuggestionsError] = useState('');
  const [assigningServiceId, setAssigningServiceId] = useState('');
  const isUnmatched = isUnmatchedImportedService(currentItem.service);
  const hotelItemSummary = getHotelItemSummary(currentItem);
  const warnings = buildWarnings(currentItem);
  const itineraryDay = currentItem.itineraryId ? quote.itineraries.find((day) => day.id === currentItem.itineraryId) ?? null : null;
  const marginMetrics = getMarginMetrics(currentItem.totalSell, currentItem.totalCost);
  const status = getServiceStatus(currentItem);
  const supplierStatus = hasMissingSupplier(currentItem) ? 'Missing supplier' : 'Supplier assigned';

  useEffect(() => {
    let isCancelled = false;

    if (!isUnmatched || optionId) {
      setSuggestions([]);
      setIsLoadingSuggestions(false);
      setSuggestionsError('');
      return;
    }

    async function loadSuggestions() {
      setIsLoadingSuggestions(true);
      setSuggestionsError('');

      try {
        const response = await fetch(`${apiBaseUrl}/quotes/${quote.id}/items/${item.id}/suggested-services`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'Could not load suggested matches.'));
        }

        const data = await readJsonResponse<SuggestedService[]>(response, 'Could not load suggested matches.');

        if (!isCancelled) {
          setSuggestions(data);
        }
      } catch (caughtError) {
        if (!isCancelled) {
          setSuggestionsError(
            caughtError instanceof Error ? caughtError.message : 'Could not load suggested matches.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSuggestions(false);
        }
      }
    }

    loadSuggestions();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isUnmatched, item.id, optionId, quote.id]);

  const currentInitialValues = useMemo(
    () => ({
      ...buildQuoteItemInitialValues(currentItem, totalPax, quote.roomCount, quote.nightCount),
      serviceId: currentItem.service.id,
    }),
    [currentItem, quote.nightCount, quote.roomCount, totalPax],
  );

  async function handleAssign(serviceId: string) {
    setAssigningServiceId(serviceId);
    setSuggestionsError('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quote.id}/items/${item.id}/assign-service`, {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ serviceId }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not assign service.'));
      }

      const updatedItem = await readJsonResponse<QuoteItem>(response, 'Could not assign service.');
      setCurrentItem(updatedItem);
      setSuggestions([]);
      router.refresh();
    } catch (caughtError) {
      setSuggestionsError(caughtError instanceof Error ? caughtError.message : 'Could not assign service.');
    } finally {
      setAssigningServiceId('');
    }
  }

  return (
    <tr>
      <td>
        <strong>{itineraryDay ? `Day ${itineraryDay.dayNumber}` : 'Unassigned'}</strong>
        <div className="table-subcopy">{itineraryDay?.title || 'Not linked to itinerary day'}</div>
      </td>
      <td>
        <strong>{hotelItemSummary || currentItem.service.name}</strong>
        <div className="table-subcopy">
          {currentItem.service.serviceType?.name || currentItem.service.category}
          {currentItem.useOverride ? ' | Override active' : ''}
          {isUnmatched ? ' | Unmatched import' : ''}
        </div>
      </td>
      <td>
        <span className={`quote-ui-badge quote-ui-badge-${hasMissingSupplier(currentItem) ? 'error' : 'success'}`}>{supplierStatus}</span>
        <div className="table-subcopy">{hasMissingSupplier(currentItem) ? 'Assign supplier' : 'Catalog service linked'}</div>
      </td>
      <td>
        <span className={`quote-ui-badge quote-ui-badge-${getServiceStatusTone(status)}`}>{status}</span>
        <div className="table-subcopy">
          {currentItem.serviceDate ? `Date ${currentItem.serviceDate.slice(0, 10)}` : 'Date pending'}
          {(currentItem.startTime || currentItem.pickupTime) ? ` | ${currentItem.startTime ? `Start ${currentItem.startTime}` : `Pickup ${currentItem.pickupTime}`}` : ''}
        </div>
      </td>
      <td>
        <span className={`quote-ui-badge quote-ui-badge-${getIssueTone(warnings)}`}>
          {warnings.length === 0 ? 'Ready state' : `${warnings.length} issue${warnings.length === 1 ? '' : 's'}`}
        </span>
        <div className="table-subcopy">{warnings[0] || 'No pricing or operational warnings'}</div>
      </td>
      <td className="quote-table-number-cell">
        <strong>{formatMoney(currentItem.totalSell, currentItem.currency)}</strong>
        <div className="table-subcopy" style={{ color: getMarginColor(marginMetrics.tone) }}>
          Cost {formatMoney(currentItem.totalCost, currentItem.currency)} | Margin {marginMetrics.marginPercent.toFixed(2)}%
        </div>
      </td>
      <td>
        <RowDetailsPanel
          summary="View details"
          description="Service edit, matching, pricing, itinerary assignment, and overrides"
          className="operations-row-details"
          bodyClassName="operations-row-details-body"
          groupId={`quote-services-${optionId || 'base'}`}
        >
          <div className="section-stack">
            <div className="quote-preview-total-list">
              <div>
                <span>Service</span>
                <strong>{hotelItemSummary || currentItem.service.name}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{status}</strong>
              </div>
              <div>
                <span>Supplier</span>
                <strong>{supplierStatus}</strong>
              </div>
              <div>
                <span>Total sell</span>
                <strong>{formatMoney(currentItem.totalSell, currentItem.currency)}</strong>
              </div>
              <div>
                <span>Total cost</span>
                <strong>{formatMoney(currentItem.totalCost, currentItem.currency)}</strong>
              </div>
            </div>

            <InlineRowEditorShell>
              <div className="audit-log-list">
                <div className="audit-log-item">
                  <strong>Operational snapshot</strong>
                  <p>Itinerary: {itineraryDay ? `Day ${itineraryDay.dayNumber} | ${itineraryDay.title}` : 'Not linked to itinerary day'}</p>
                  <p>
                    Date: {currentItem.serviceDate ? currentItem.serviceDate.slice(0, 10) : 'Missing'}
                    {' | '}Start: {currentItem.startTime || 'Missing'}
                    {' | '}Pickup: {currentItem.pickupTime || 'Missing'}
                  </p>
                  <p>
                    Pickup: {currentItem.pickupLocation || 'Missing'}
                    {' | '}Meeting: {currentItem.meetingPoint || 'Missing'}
                  </p>
                  <p>
                    Pax: {currentItem.paxCount ?? 'Missing'}
                    {' | '}Participants: {currentItem.participantCount ?? 'Missing'}
                    {' | '}Adults: {currentItem.adultCount ?? 'Missing'}
                    {' | '}Children: {currentItem.childCount ?? 'Missing'}
                  </p>
                </div>
                <div className="audit-log-item">
                  <strong>Pricing snapshot</strong>
                  <p>
                    Base cost: {formatMoney(currentItem.baseCost, currentItem.currency)}
                    {currentItem.useOverride && currentItem.overrideCost !== null
                      ? ` | Override active: ${formatMoney(currentItem.overrideCost, currentItem.currency)} | Final: ${formatMoney(currentItem.finalCost ?? currentItem.totalCost, currentItem.currency)}`
                      : ' | Override inactive'}
                  </p>
                  {currentItem.useOverride && currentItem.overrideReason ? <p>Reason: {currentItem.overrideReason}</p> : null}
                  <p>
                    Qty: {currentItem.quantity}
                    {' | '}Markup: {currentItem.markupPercent.toFixed(2)}%
                    {' | '}Pax basis: {currentItem.paxCount ?? 'Missing'}
                  </p>
                  <p>
                    Reconfirmation: {currentItem.reconfirmationRequired ? 'Required' : 'Not required'}
                    {currentItem.reconfirmationDueAt ? ` | Due ${currentItem.reconfirmationDueAt.slice(0, 16).replace('T', ' ')}` : ''}
                  </p>
                </div>
              </div>
            </InlineRowEditorShell>

            {warnings.length > 0 ? (
              <div className="audit-log-list">
                {warnings.map((warning) => (
                  <div key={warning} className="audit-log-item">
                    <strong>{warning}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            {currentItem.appliedVehicleRate ? (
              <InlineRowEditorShell>
                <div className="audit-log-list">
                  <div className="audit-log-item">
                    <strong>Resolved transport pricing</strong>
                    <p>{currentItem.appliedVehicleRate.routeName}</p>
                    <p>
                      {currentItem.appliedVehicleRate.vehicle.name} | {currentItem.appliedVehicleRate.serviceType.name}
                    </p>
                  </div>
                </div>
              </InlineRowEditorShell>
            ) : null}

            {isUnmatched ? (
              <InlineRowEditorShell>
                <div className="section-stack">
                  <div className="quote-item-suggestions-head">
                    <strong>Suggested matches</strong>
                    {isLoadingSuggestions ? <span>Loading...</span> : null}
                  </div>
                  {suggestionsError ? <p className="form-error">{suggestionsError}</p> : null}
                  {!isLoadingSuggestions && !suggestionsError && suggestions.length === 0 ? (
                    <p className="quote-item-suggestions-empty">No suggested services found.</p>
                  ) : null}
                  {suggestions.length > 0 ? (
                    <div className="quote-item-suggestions-list">
                      {suggestions.map((suggestion) => (
                        <div key={suggestion.serviceId} className="quote-item-suggestion">
                          <div className="quote-item-suggestion-copy">
                            <strong>{suggestion.name}</strong>
                            <span>{suggestion.category}</span>
                          </div>
                          <div className="quote-item-suggestion-actions">
                            <span className="quote-item-suggestion-score">{suggestion.score}</span>
                            <button
                              type="button"
                              className="compact-button"
                              onClick={() => handleAssign(suggestion.serviceId)}
                              disabled={Boolean(assigningServiceId)}
                            >
                              {assigningServiceId === suggestion.serviceId ? 'Assigning...' : 'Assign'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </InlineRowEditorShell>
            ) : null}

            <InlineEntityActions
              apiBaseUrl={apiBaseUrl}
              deletePath={optionId ? `/quotes/${quote.id}/options/${optionId}/items/${currentItem.id}` : `/quotes/${quote.id}/items/${currentItem.id}`}
              deleteLabel="quote item"
              confirmMessage={`Delete ${hotelItemSummary || currentItem.service.name}?`}
            >
              <QuoteItemsForm
                apiBaseUrl={apiBaseUrl}
                quoteId={quote.id}
                itemId={currentItem.id}
                optionId={optionId}
                blocks={quoteBlocks}
                services={services}
                transportServiceTypes={transportServiceTypes}
                routes={routes}
                hotels={hotels}
                hotelContracts={hotelContracts}
                hotelRates={hotelRates}
                seasons={seasons}
                quoteType={quote.quoteType}
                defaultPaxCount={totalPax}
                defaultAdultCount={quote.adults}
                defaultChildCount={quote.children}
                defaultRoomCount={quote.roomCount}
                defaultNightCount={quote.nightCount}
                travelStartDate={quote.travelStartDate}
                itineraryDayNumber={itineraryDay?.dayNumber ?? null}
                itineraryId={currentItem.itineraryId || undefined}
                submitLabel="Save item"
                initialValues={currentInitialValues}
              />
            </InlineEntityActions>
          </div>
        </RowDetailsPanel>
      </td>
    </tr>
  );
}

export function QuoteServicesTable({
  apiBaseUrl,
  quote,
  items,
  quoteBlocks,
  services,
  transportServiceTypes,
  routes,
  hotels,
  hotelContracts,
  hotelRates,
  seasons,
  totalPax,
  optionId,
  emptyLabel = 'No services added yet.',
}: QuoteServicesTableProps) {
  const [activeFilter, setActiveFilter] = useState<ServiceSliceFilter>('all');

  if (items.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  const filteredItems = items.filter((item) => {
    if (activeFilter === 'issues') {
      return buildWarnings(item).length > 0;
    }

    if (activeFilter === 'missing-supplier') {
      return hasMissingSupplier(item);
    }

    if (activeFilter === 'missing-price') {
      return hasMissingPrice(item);
    }

    return true;
  });

  const filterOptions: Array<{ id: ServiceSliceFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'issues', label: 'Issues', count: items.filter((item) => buildWarnings(item).length > 0).length },
    { id: 'missing-supplier', label: 'Missing supplier', count: items.filter(hasMissingSupplier).length },
    { id: 'missing-price', label: 'Missing price', count: items.filter(hasMissingPrice).length },
  ];

  return (
    <div className="section-stack">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {filterOptions.map((filterOption) => (
          <button
            key={filterOption.id}
            type="button"
            className={`secondary-button${activeFilter === filterOption.id ? ' operations-filter-chip-active' : ''}`}
            onClick={() => setActiveFilter(filterOption.id)}
          >
            {filterOption.label} ({filterOption.count})
          </button>
        ))}
      </div>

      <div className="table-wrap">
        <table className="data-table quote-consistency-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Service</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Issues</th>
              <th>Price summary</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  No services match the current slice.
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <QuoteServiceRow
                  key={item.id}
                  apiBaseUrl={apiBaseUrl}
                  quote={quote}
                  item={item}
                  quoteBlocks={quoteBlocks}
                  services={services}
                  transportServiceTypes={transportServiceTypes}
                  routes={routes}
                  hotels={hotels}
                  hotelContracts={hotelContracts}
                  hotelRates={hotelRates}
                  seasons={seasons}
                  totalPax={totalPax}
                  optionId={optionId}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
