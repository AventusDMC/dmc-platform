'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CurrencySelect } from '../components/CurrencySelect';
import { getErrorMessage, logFetchUrl } from '../lib/api';
import { type SupportedCurrency } from '../lib/currencyOptions';

type ContractOption = {
  id: string;
  name: string;
  hotel: {
    id: string;
    name: string;
    city?: string | null;
    roomCategories: RoomCategoryOption[];
  };
};

type RoomCategoryOption = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type HotelOption = {
  id: string;
  name: string;
  city?: string | null;
  roomCategories: RoomCategoryOption[];
};

type SeasonOption = {
  id: string;
  name: string;
};

type HotelRatesFormProps = {
  apiBaseUrl: string;
  contracts: ContractOption[];
  hotels: HotelOption[];
  seasons: SeasonOption[];
  rateId?: string;
  submitLabel?: string;
  initialValues?: {
    contractId: string;
    seasonId: string;
    seasonName: string;
    roomCategoryId: string;
    occupancyType: (typeof occupancyTypes)[number];
    mealPlan: (typeof mealPlans)[number];
    pricingMode?: '' | 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT';
    pricingBasis?: 'PER_PERSON' | 'PER_ROOM';
    currency: SupportedCurrency;
    cost: string;
    salesTaxPercent?: string;
    salesTaxIncluded?: boolean;
    serviceChargePercent?: string;
    serviceChargeIncluded?: boolean;
    tourismFeeAmount?: string;
    tourismFeeCurrency?: SupportedCurrency | '';
    tourismFeeMode?: '' | 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM';
  };
};

const occupancyTypes = ['SGL', 'DBL', 'TPL'] as const;
const mealPlans = ['RO', 'BB', 'HB', 'FB', 'AI'] as const;

function formatDisplayLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function HotelRatesForm({ apiBaseUrl, contracts, hotels, seasons, rateId, submitLabel, initialValues }: HotelRatesFormProps) {
  const router = useRouter();
  const [contractId, setContractId] = useState(initialValues?.contractId || contracts[0]?.id || '');
  const [seasonId, setSeasonId] = useState(initialValues?.seasonId || '');
  const [seasonName, setSeasonName] = useState(initialValues?.seasonName || '');
  const [roomCategoryId, setRoomCategoryId] = useState(initialValues?.roomCategoryId || '');
  const [occupancyType, setOccupancyType] = useState<(typeof occupancyTypes)[number]>(initialValues?.occupancyType || 'SGL');
  const [mealPlan, setMealPlan] = useState<(typeof mealPlans)[number]>(initialValues?.mealPlan || 'BB');
  const [pricingMode, setPricingMode] = useState<'' | 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT'>(
    initialValues?.pricingMode || '',
  );
  const [pricingBasis, setPricingBasis] = useState<'PER_PERSON' | 'PER_ROOM'>(initialValues?.pricingBasis || 'PER_ROOM');
  const [currency, setCurrency] = useState<SupportedCurrency>(initialValues?.currency || 'USD');
  const [cost, setCost] = useState(initialValues?.cost || '');
  const [salesTaxPercent, setSalesTaxPercent] = useState(initialValues?.salesTaxPercent || '');
  const [salesTaxIncluded, setSalesTaxIncluded] = useState(Boolean(initialValues?.salesTaxIncluded));
  const [serviceChargePercent, setServiceChargePercent] = useState(initialValues?.serviceChargePercent || '');
  const [serviceChargeIncluded, setServiceChargeIncluded] = useState(Boolean(initialValues?.serviceChargeIncluded));
  const [tourismFeeAmount, setTourismFeeAmount] = useState(initialValues?.tourismFeeAmount || '');
  const [tourismFeeCurrency, setTourismFeeCurrency] = useState<SupportedCurrency | ''>(initialValues?.tourismFeeCurrency || '');
  const [tourismFeeMode, setTourismFeeMode] = useState<'' | 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM'>(
    initialValues?.tourismFeeMode || '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(rateId);
  const selectedContract = contracts.find((contract) => contract.id === contractId) || null;
  const selectedHotel = hotels.find((hotel) => hotel.id === selectedContract?.hotel.id) || null;
  const selectedSeason =
    seasons.find((season) => season.id === seasonId) ||
    (seasonName ? seasons.find((season) => season.name.trim().toLowerCase() === seasonName.trim().toLowerCase()) || null : null);
  const selectedSeasonValue = selectedSeason ? selectedSeason.id : seasonName ? `legacy:${seasonName}` : '';
  const availableRoomCategories =
    selectedContract?.hotel.roomCategories?.filter((category) => category.isActive) ||
    selectedHotel?.roomCategories.filter((category) => category.isActive) ||
    [];
  const tourismFeeLocation = selectedContract?.hotel.city || selectedHotel?.city || '';

  useEffect(() => {
    if (availableRoomCategories.length === 0) {
      if (roomCategoryId) {
        setRoomCategoryId('');
      }
      return;
    }

    if (availableRoomCategories.some((category) => category.id === roomCategoryId)) {
      return;
    }

    const nextCategoryId =
      initialValues?.roomCategoryId && availableRoomCategories.some((category) => category.id === initialValues.roomCategoryId)
        ? initialValues.roomCategoryId
        : availableRoomCategories[0].id;

    setRoomCategoryId(nextCategoryId);
  }, [availableRoomCategories, initialValues?.roomCategoryId, roomCategoryId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const url = `/api/hotel-rates${rateId ? `/${rateId}` : ''}`;
      const response = await fetch(logFetchUrl(url), {
        method: rateId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractId,
          seasonId: selectedSeason?.id || undefined,
          seasonName: selectedSeason?.name || seasonName,
          roomCategoryId,
          occupancyType,
          mealPlan,
          pricingMode: pricingMode || undefined,
          pricingBasis,
          currency,
          cost: Number(cost),
          salesTaxPercent: salesTaxPercent.trim() ? Number(salesTaxPercent) : undefined,
          salesTaxIncluded,
          serviceChargePercent: serviceChargePercent.trim() ? Number(serviceChargePercent) : undefined,
          serviceChargeIncluded,
          tourismFeeAmount: tourismFeeAmount.trim() ? Number(tourismFeeAmount) : undefined,
          tourismFeeCurrency: tourismFeeCurrency || undefined,
          tourismFeeMode: tourismFeeMode || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} hotel rate.`));
      }

      if (!isEditing) {
        setSeasonId('');
        setSeasonName('');
        setOccupancyType('SGL');
        setMealPlan('BB');
        setPricingMode('');
        setPricingBasis('PER_ROOM');
        setCurrency(selectedContract?.hotel ? 'USD' : currency);
        setCost('');
        setSalesTaxPercent('');
        setSalesTaxIncluded(false);
        setServiceChargePercent('');
        setServiceChargeIncluded(false);
        setTourismFeeAmount('');
        setTourismFeeCurrency('');
        setTourismFeeMode('');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} hotel rate.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = contracts.length > 0 && availableRoomCategories.length > 0;

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-3">
        <label>
          Contract
          <select value={contractId} onChange={(event) => setContractId(event.target.value)} disabled={contracts.length === 0} required>
            {contracts.length === 0 ? (
              <option value="">Create a contract first</option>
            ) : (
              contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.hotel.name} - {contract.name}
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          Season
          <select
            value={selectedSeasonValue}
            onChange={(event) => {
              if (event.target.value.startsWith('legacy:')) {
                setSeasonId('');
                setSeasonName(event.target.value.slice('legacy:'.length));
                return;
              }

              const nextSeason = seasons.find((season) => season.id === event.target.value) || null;
              setSeasonId(nextSeason?.id || '');
              setSeasonName(nextSeason?.name || '');
            }}
            required
            disabled={seasons.length === 0}
          >
            {seasons.length === 0 ? <option value="">Create a season first</option> : null}
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>
                {formatDisplayLabel(season.name)}
              </option>
            ))}
            {!selectedSeason && seasonName ? (
              <option value={`legacy:${seasonName}`} hidden>
                {formatDisplayLabel(seasonName)}
              </option>
            ) : null}
          </select>
        </label>
      </div>

      <div className="form-row form-row-4">
        <label>
          Room category
          <select value={roomCategoryId} onChange={(event) => setRoomCategoryId(event.target.value)} required disabled={availableRoomCategories.length === 0}>
            {availableRoomCategories.length === 0 ? <option value="">Create an active room category first</option> : null}
            {availableRoomCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}{category.code ? ` (${category.code})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          Occupancy
          <select value={occupancyType} onChange={(event) => setOccupancyType(event.target.value as (typeof occupancyTypes)[number])}>
            {occupancyTypes.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          Meal plan
          <select value={mealPlan} onChange={(event) => setMealPlan(event.target.value as (typeof mealPlans)[number])}>
            {mealPlans.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          Currency
          <CurrencySelect value={currency} onChange={(value) => setCurrency((value || 'USD') as SupportedCurrency)} required />
        </label>
      </div>

      <div className="form-row form-row-2">
        <label>
          Pricing basis
          <select value={pricingBasis} onChange={(event) => setPricingBasis(event.target.value as 'PER_PERSON' | 'PER_ROOM')}>
            <option value="PER_PERSON">Per person/night</option>
            <option value="PER_ROOM">Per room/night</option>
          </select>
        </label>

        <label>
          Pricing mode
          <select
            value={pricingMode}
            onChange={(event) => setPricingMode(event.target.value as '' | 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT')}
          >
            <option value="">Default / legacy</option>
            <option value="PER_ROOM_PER_NIGHT">Per room per night</option>
            <option value="PER_PERSON_PER_NIGHT">Per person per night</option>
          </select>
        </label>

        <label>
          Cost
          <input value={cost} onChange={(event) => setCost(event.target.value)} type="number" min="0" step="0.01" required />
        </label>
      </div>

      <div className="form-row form-row-4">
        <label>
          Sales tax %
          <input
            value={salesTaxPercent}
            onChange={(event) => setSalesTaxPercent(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional"
          />
        </label>

        <label className="checkbox-row">
          <span>Sales tax included</span>
          <input
            checked={salesTaxIncluded}
            onChange={(event) => setSalesTaxIncluded(event.target.checked)}
            type="checkbox"
          />
        </label>

        <label>
          Service charge %
          <input
            value={serviceChargePercent}
            onChange={(event) => setServiceChargePercent(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional"
          />
        </label>

        <label className="checkbox-row">
          <span>Service charge included</span>
          <input
            checked={serviceChargeIncluded}
            onChange={(event) => setServiceChargeIncluded(event.target.checked)}
            type="checkbox"
          />
        </label>
      </div>

      <div className="form-row form-row-3">
        <label>
          Tourism fee paid to hotel
          <input
            value={tourismFeeAmount}
            onChange={(event) => setTourismFeeAmount(event.target.value)}
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional"
          />
        </label>

        <label>
          Tourism fee currency
          <CurrencySelect
            value={tourismFeeCurrency}
            onChange={(value) => setTourismFeeCurrency(value as SupportedCurrency | '')}
            allowEmpty
            emptyLabel="None"
          />
        </label>

        <label>
          Tourism fee basis
          <select
            value={tourismFeeMode}
            onChange={(event) => setTourismFeeMode(event.target.value as '' | 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM')}
          >
            <option value="">None</option>
            <option value="PER_NIGHT_PER_PERSON">Per night per person</option>
            <option value="PER_NIGHT_PER_ROOM">Per night per room</option>
          </select>
        </label>
      </div>

      {tourismFeeLocation ? (
        <p className="table-subcopy">
          Tourism fee follows the hotel stay basis for {selectedContract?.hotel.name || selectedHotel?.name} in {tourismFeeLocation}.
        </p>
      ) : (
        <p className="table-subcopy">Tourism fee is a hotel stay charge, typically driven by nights and pax or nights and rooms.</p>
      )}

      <div className="form-row">
        <button type="submit" disabled={isSubmitting || !canSubmit}>
          {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create rate')}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
