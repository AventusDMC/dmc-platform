'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { HotelRatesForm } from './HotelRatesForm';
import { getErrorMessage } from '../lib/api';
import { type SupportedCurrency } from '../lib/currencyOptions';

type HotelRoomCategory = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
};

type Hotel = {
  id: string;
  name: string;
  city: string;
  roomCategories: HotelRoomCategory[];
};

type HotelContract = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  hotel: {
    id: string;
    name: string;
    roomCategories: HotelRoomCategory[];
  };
};

type HotelRate = {
  id: string;
  contractId: string;
  seasonId: string | null;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  pricingMode?: 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT' | null;
  currency: string;
  cost: number;
  salesTaxPercent?: number | null;
  salesTaxIncluded?: boolean | null;
  serviceChargePercent?: number | null;
  serviceChargeIncluded?: boolean | null;
  tourismFeeAmount?: number | null;
  tourismFeeCurrency?: string | null;
  tourismFeeMode?: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  };
};

type Season = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type HotelContractRatesSectionProps = {
  apiBaseUrl: string;
  contract: HotelContract;
  contractRates: HotelRate[];
  contracts: HotelContract[];
  hotels: Hotel[];
  seasons: Season[];
  seasonByIdEntries: Array<[string, Season]>;
};

function formatDisplayLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function normalizeSupportedCurrency(value: string | null | undefined): SupportedCurrency {
  return value === 'EUR' || value === 'JOD' || value === 'USD' ? value : 'USD';
}

export function HotelContractRatesSection({
  apiBaseUrl,
  contract,
  contractRates,
  contracts,
  hotels,
  seasons,
  seasonByIdEntries,
}: HotelContractRatesSectionProps) {
  const router = useRouter();
  const [isAddingRate, setIsAddingRate] = useState(false);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [deletingRateId, setDeletingRateId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const seasonById = new Map(seasonByIdEntries);
  const sortedRates = [...contractRates].sort((left, right) => {
    const leftSeason = formatDisplayLabel(seasonById.get(left.seasonId || '')?.name || left.seasonName);
    const rightSeason = formatDisplayLabel(seasonById.get(right.seasonId || '')?.name || right.seasonName);
    const seasonComparison = leftSeason.localeCompare(rightSeason);

    if (seasonComparison !== 0) {
      return seasonComparison;
    }

    const roomCategoryComparison = left.roomCategory.name.localeCompare(right.roomCategory.name);
    if (roomCategoryComparison !== 0) {
      return roomCategoryComparison;
    }

    const occupancyComparison = left.occupancyType.localeCompare(right.occupancyType);
    if (occupancyComparison !== 0) {
      return occupancyComparison;
    }

    return left.mealPlan.localeCompare(right.mealPlan);
  });

  function getSeasonLabel(rate: HotelRate) {
    return formatDisplayLabel(seasonById.get(rate.seasonId || '')?.name || rate.seasonName || '');
  }

  async function handleDeleteRate(rate: HotelRate) {
    const seasonLabel = getSeasonLabel(rate) || 'rate';

    if (!window.confirm(`Delete ${seasonLabel} for ${rate.roomCategory.name}?`)) {
      return;
    }

    setDeletingRateId(rate.id);
    setActionError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotel-rates/${rate.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete hotel rate.'));
      }

      router.refresh();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : 'Could not delete hotel rate.');
    } finally {
      setDeletingRateId(null);
    }
  }

  function renderRateForm(rate?: HotelRate) {
    return (
      <InlineRowEditorShell>
        <div className="rates-editor-panel">
        <HotelRatesForm
          apiBaseUrl={apiBaseUrl}
          contracts={contracts}
          hotels={hotels}
          seasons={seasons}
          rateId={rate?.id}
          submitLabel={rate ? 'Save rate' : 'Add rate'}
          initialValues={{
            contractId: rate?.contractId || contract.id,
            seasonId: rate?.seasonId || '',
            seasonName: rate?.seasonName || '',
            roomCategoryId: rate?.roomCategoryId || '',
            occupancyType: rate?.occupancyType || 'SGL',
            mealPlan: rate?.mealPlan || 'BB',
            pricingMode: rate?.pricingMode || '',
            currency: normalizeSupportedCurrency(rate?.currency || contract.currency),
            cost: rate ? String(rate.cost) : '',
            salesTaxPercent:
              rate?.salesTaxPercent === null || rate?.salesTaxPercent === undefined ? '' : String(rate.salesTaxPercent),
            salesTaxIncluded: Boolean(rate?.salesTaxIncluded),
            serviceChargePercent:
              rate?.serviceChargePercent === null || rate?.serviceChargePercent === undefined
                ? ''
                : String(rate.serviceChargePercent),
            serviceChargeIncluded: Boolean(rate?.serviceChargeIncluded),
            tourismFeeAmount:
              rate?.tourismFeeAmount === null || rate?.tourismFeeAmount === undefined ? '' : String(rate.tourismFeeAmount),
            tourismFeeCurrency: rate?.tourismFeeCurrency ? normalizeSupportedCurrency(rate.tourismFeeCurrency) : '',
            tourismFeeMode: rate?.tourismFeeMode || '',
          }}
        />
        {actionError ? <p className="form-error">{actionError}</p> : null}
        <div className="table-action-row">
          <button
            type="button"
            className="compact-button"
            onClick={() => {
              setIsAddingRate(false);
              setEditingRateId(null);
              setActionError('');
            }}
          >
            Cancel
          </button>
        </div>
        </div>
      </InlineRowEditorShell>
    );
  }

  return (
    <article className="entity-card">
      <div className="entity-card-header">
        <div>
          <h3>{contract.name}</h3>
          <p>{contract.hotel.name}</p>
          <div className="table-subcopy">
            Valid {formatDate(contract.validFrom)} - {formatDate(contract.validTo)} | {contract.currency} | {contractRates.length} rates
          </div>
        </div>
        {!isAddingRate ? (
          <button
            type="button"
            className="compact-button"
            onClick={() => {
              setEditingRateId(null);
              setActionError('');
              setIsAddingRate(true);
            }}
          >
            Add rate
          </button>
        ) : null}
      </div>

      {isAddingRate ? renderRateForm() : null}
      {actionError && !isAddingRate ? <p className="form-error">{actionError}</p> : null}

      {contractRates.length === 0 ? (
        <p className="empty-state">No rates for this contract yet. Add the first rate to start pricing this contract.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table allotment-table">
            <thead>
              <tr>
                <th>Room category</th>
                <th>Board</th>
                <th>Occupancy</th>
                <th>Validity / season</th>
                <th>Rate</th>
                <th>Currency</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRates.map((hotelRate) => {
                const seasonLabel = getSeasonLabel(hotelRate);
                const isEditingRate = editingRateId === hotelRate.id;

                return (
                  <Fragment key={hotelRate.id}>
                    <tr>
                      <td>
                        <strong>{hotelRate.roomCategory.name}</strong>
                        {hotelRate.roomCategory.code ? <div className="table-subcopy">{hotelRate.roomCategory.code}</div> : null}
                      </td>
                      <td>{hotelRate.mealPlan}</td>
                      <td>{hotelRate.occupancyType}</td>
                      <td>
                        <strong>{seasonLabel || 'Open rate'}</strong>
                        <div className="table-subcopy">
                          {formatDate(contract.validFrom)} - {formatDate(contract.validTo)}
                        </div>
                      </td>
                      <td>{hotelRate.cost.toFixed(2)}</td>
                      <td>{hotelRate.currency}</td>
                      <td>{seasonLabel || 'Open'}</td>
                      <td>
                        <div className="table-action-row">
                          <button
                            type="button"
                            className="compact-button"
                            onClick={() => {
                              setEditingRateId((current) => (current === hotelRate.id ? null : hotelRate.id));
                              setActionError('');
                              setIsAddingRate(true);
                            }}
                          >
                            {isEditingRate ? 'Close edit' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="compact-button compact-button-danger"
                            onClick={() => handleDeleteRate(hotelRate)}
                            disabled={deletingRateId === hotelRate.id}
                          >
                            {deletingRateId === hotelRate.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isEditingRate ? (
                      <tr>
                        <td colSpan={8}>{renderRateForm(hotelRate)}</td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
