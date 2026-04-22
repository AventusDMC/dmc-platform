'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

type ContractOption = {
  id: string;
  name: string;
  hotel: {
    id: string;
    name: string;
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
    currency: string;
    cost: string;
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
  const [currency, setCurrency] = useState(initialValues?.currency || 'USD');
  const [cost, setCost] = useState(initialValues?.cost || '');
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
      const response = await fetch(`/api/hotel-rates${rateId ? `/${rateId}` : ''}`, {
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
          currency,
          cost: Number(cost),
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
        setCurrency(selectedContract?.hotel ? 'USD' : currency);
        setCost('');
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
      <div className="form-row form-row-2">
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
          <input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} required />
        </label>
      </div>

      <div className="form-row">
        <label>
          Cost
          <input value={cost} onChange={(event) => setCost(event.target.value)} type="number" min="0" step="0.01" required />
        </label>
      </div>

      <div className="form-row">
        <button type="submit" disabled={isSubmitting || !canSubmit}>
          {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create rate')}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
