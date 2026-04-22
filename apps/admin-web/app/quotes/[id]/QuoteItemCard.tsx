'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineEntityActions } from '../../components/InlineEntityActions';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
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
  overrideCost: number | null;
  useOverride: boolean;
  currency: string;
  pricingDescription: string | null;
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
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  travelStartDate: string | null;
  itineraries: Array<{
    id: string;
    dayNumber: number;
  }>;
};

type SuggestedService = {
  serviceId: string;
  name: string;
  category: string;
  score: number;
};

type QuoteItemCardProps = {
  apiBaseUrl: string;
  quote: Quote;
  item: QuoteItem;
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
  initialValues: {
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
};

function formatMoney(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency && currency.trim() ? currency : 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  }
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

function getReconfirmationWarning(reconfirmationDueAt: string | null, confirmationLikeResolved = false) {
  if (!reconfirmationDueAt || confirmationLikeResolved) {
    return null;
  }

  const dueAt = new Date(reconfirmationDueAt).getTime();

  if (Number.isNaN(dueAt)) {
    return null;
  }

  const now = Date.now();
  const within48Hours = dueAt > now && dueAt - now <= 48 * 60 * 60 * 1000;

  if (dueAt <= now) {
    return 'Warning: reconfirmation overdue.';
  }

  return within48Hours ? 'Warning: reconfirmation due soon.' : null;
}

export function QuoteItemCard({
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
  initialValues,
}: QuoteItemCardProps) {
  const router = useRouter();
  const [currentItem, setCurrentItem] = useState(item);
  const [suggestions, setSuggestions] = useState<SuggestedService[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(isUnmatchedImportedService(item.service));
  const [suggestionsError, setSuggestionsError] = useState('');
  const [assigningServiceId, setAssigningServiceId] = useState('');
  const isUnmatched = isUnmatchedImportedService(currentItem.service);
  const hotelItemSummary = getHotelItemSummary(currentItem);
  const reconfirmationWarning = getReconfirmationWarning(currentItem.reconfirmationDueAt);
  const itineraryDayNumber = currentItem.itineraryId
    ? quote.itineraries.find((day) => day.id === currentItem.itineraryId)?.dayNumber ?? null
    : null;

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
      ...initialValues,
      serviceId: currentItem.service.id,
    }),
    [currentItem.service.id, initialValues],
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
    <div>
      <article className="quote-item-row">
        <div className="quote-item-row-main">
          <div className="quote-item-row-head">
            <h4>{hotelItemSummary || currentItem.service.name}</h4>
            {!hotelItemSummary ? <span>{currentItem.service.category}</span> : null}
            {isUnmatched ? <em className="quote-item-unmatched-badge">Unmatched</em> : null}
            {currentItem.useOverride ? <em className="quote-item-override-badge">Override active</em> : null}
          </div>
          {!hotelItemSummary ? (
            <p>
              {currentItem.pricingDescription ||
                `Qty ${currentItem.quantity} at ${formatMoney(getFinalItemCost(currentItem), currentItem.currency)}`}
            </p>
          ) : null}
          <p>
            Base {formatMoney(currentItem.baseCost, currentItem.currency)}
            {currentItem.useOverride && currentItem.overrideCost !== null
              ? ` | Override ${formatMoney(currentItem.overrideCost, currentItem.currency)}`
              : ''}
          </p>
          {currentItem.serviceDate || currentItem.startTime || currentItem.pickupTime ? (
            <p>
              {[currentItem.serviceDate ? `Date ${currentItem.serviceDate.slice(0, 10)}` : null, currentItem.startTime ? `Start ${currentItem.startTime}` : null, currentItem.pickupTime ? `Pickup ${currentItem.pickupTime}` : null]
                .filter(Boolean)
                .join(' | ')}
            </p>
          ) : null}
          {currentItem.pickupLocation || currentItem.meetingPoint ? (
            <p>
              {[currentItem.pickupLocation ? `Pickup ${currentItem.pickupLocation}` : null, currentItem.meetingPoint ? `Meeting ${currentItem.meetingPoint}` : null]
                .filter(Boolean)
                .join(' | ')}
            </p>
          ) : null}
          {currentItem.participantCount || currentItem.adultCount || currentItem.childCount ? (
            <p>
              {[currentItem.participantCount ? `${currentItem.participantCount} participants` : null, currentItem.adultCount !== null ? `${currentItem.adultCount} adults` : null, currentItem.childCount !== null ? `${currentItem.childCount} children` : null]
                .filter(Boolean)
                .join(' | ')}
            </p>
          ) : null}
          {currentItem.reconfirmationRequired ? (
            <p>
              Reconfirmation required
              {currentItem.reconfirmationDueAt ? ` | Due ${currentItem.reconfirmationDueAt.slice(0, 16).replace('T', ' ')}` : ''}
            </p>
          ) : null}
          {reconfirmationWarning ? <p className="form-error">{reconfirmationWarning}</p> : null}
          {currentItem.appliedVehicleRate ? (
            <p>
              {currentItem.appliedVehicleRate.routeName} | {currentItem.appliedVehicleRate.vehicle.name} |{' '}
              {currentItem.appliedVehicleRate.serviceType.name}
            </p>
          ) : null}

          {isUnmatched ? (
            <section className="quote-item-suggestions">
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
                          className="secondary-button"
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
            </section>
          ) : null}
        </div>
        <div className="quote-item-row-totals">
          <strong>{formatMoney(currentItem.totalSell, currentItem.currency)}</strong>
          <span>Cost {formatMoney(currentItem.totalCost, currentItem.currency)}</span>
        </div>
      </article>

      <InlineEntityActions
        apiBaseUrl={apiBaseUrl}
        deletePath={optionId ? `/quotes/${quote.id}/options/${optionId}/items/${item.id}` : `/quotes/${quote.id}/items/${item.id}`}
        deleteLabel="quote item"
        confirmMessage={`Delete ${hotelItemSummary || currentItem.service.name}?`}
      >
        <QuoteItemsForm
          apiBaseUrl={apiBaseUrl}
          quoteId={quote.id}
          itemId={item.id}
          optionId={optionId}
          blocks={quoteBlocks}
          services={services}
          transportServiceTypes={transportServiceTypes}
          routes={routes}
          hotels={hotels}
          hotelContracts={hotelContracts}
          hotelRates={hotelRates}
          seasons={seasons}
          defaultPaxCount={totalPax}
          defaultAdultCount={quote.adults}
          defaultChildCount={quote.children}
          defaultRoomCount={quote.roomCount}
          defaultNightCount={quote.nightCount}
          travelStartDate={quote.travelStartDate}
          itineraryDayNumber={itineraryDayNumber}
          itineraryId={item.itineraryId || undefined}
          submitLabel="Save item"
          initialValues={currentInitialValues}
        />
      </InlineEntityActions>
    </div>
  );
}
