'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { HotelContractsForm } from '../../../hotel-contracts/HotelContractsForm';
import { HotelRatesForm } from '../../../hotel-rates/HotelRatesForm';
import { HotelContractSupplementForm } from '../../HotelContractSupplementForm';
import {
  formatCancellationRule,
  formatPricingBasis,
  formatSupplementCharge,
  formatSupplementType,
} from '../../hotel-contract-display';
import { normalizeSupportedCurrency, type SupportedCurrency } from '../../../lib/currencyOptions';

type HotelRoomCategory = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  description?: string | null;
  isActive: boolean;
};

type Hotel = {
  id: string;
  name: string;
  city?: string | null;
  roomCategories: HotelRoomCategory[];
};

type HotelContract = {
  id: string;
  hotelId?: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  ratePolicies?: unknown;
  hotel: {
    id: string;
    name: string;
    city?: string | null;
    roomCategories: HotelRoomCategory[];
  };
  readinessStatus?: 'draft' | 'in_progress' | 'ready';
};

type HotelRate = {
  id: string;
  contractId: string;
  seasonId: string | null;
  seasonName: string;
  seasonFrom?: string | null;
  seasonTo?: string | null;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  pricingMode?: 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT' | null;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | null;
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
};

type Supplement = {
  id: string;
  roomCategoryId: string | null;
  type: 'EXTRA_BREAKFAST' | 'EXTRA_LUNCH' | 'EXTRA_DINNER' | 'GALA_DINNER' | 'EXTRA_BED' | string | null;
  chargeBasis: 'PER_PERSON' | 'PER_ROOM' | 'PER_STAY' | 'PER_NIGHT' | string | null;
  amount: number | string | null;
  currency: string | null;
  isMandatory: boolean;
  isActive: boolean;
  notes: string | null;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

type MealPlan = {
  id: string;
  code: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  isActive: boolean;
  notes: string | null;
};

type CancellationPolicy = {
  id: string;
  summary: string | null;
  notes: string | null;
  noShowPenaltyType: 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED' | null;
  noShowPenaltyValue: number | null;
  rules: Array<{
    id: string;
    windowFromValue: number;
    windowToValue: number;
    deadlineUnit: 'DAYS' | 'HOURS';
    penaltyType: 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED';
    penaltyValue: number | null;
    isActive: boolean;
    notes: string | null;
  }>;
} | null;

type DrawerState =
  | { type: 'contract' }
  | { type: 'rate'; rateId?: string }
  | { type: 'supplement'; supplementId?: string }
  | null;

type HotelContractWorkspaceProps = {
  apiBaseUrl: string;
  contract: HotelContract;
  hotels: Hotel[];
  contracts: HotelContract[];
  rates: HotelRate[];
  seasons: Season[];
  supplements: Supplement[];
  mealPlans: MealPlan[];
  cancellationPolicy: CancellationPolicy;
};

const SUPPLEMENT_TYPES = ['EXTRA_BREAKFAST', 'EXTRA_LUNCH', 'EXTRA_DINNER', 'GALA_DINNER', 'EXTRA_BED'] as const;
const CHARGE_BASIS_VALUES = ['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT'] as const;

function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatMoney(value: number | string | null | undefined, currency: string | null | undefined) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return 'No amount';
  }

  return `${numeric.toFixed(2)} ${currency || 'USD'}`;
}

function formatNoShow(policy: CancellationPolicy) {
  if (!policy?.noShowPenaltyType) {
    return 'No no-show policy configured';
  }

  if (policy.noShowPenaltyType === 'FULL_STAY') {
    return 'Full stay';
  }

  if (policy.noShowPenaltyType === 'PERCENT') {
    return `${Number(policy.noShowPenaltyValue || 0).toFixed(2)}%`;
  }

  if (policy.noShowPenaltyType === 'NIGHTS') {
    return `${Number(policy.noShowPenaltyValue || 0)} nights`;
  }

  return `Fixed ${Number(policy.noShowPenaltyValue || 0).toFixed(2)}`;
}

function humanize(value: string | null | undefined, fallback: string) {
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

function normalizeSupplementType(value: Supplement['type']): (typeof SUPPLEMENT_TYPES)[number] {
  return SUPPLEMENT_TYPES.includes(value as (typeof SUPPLEMENT_TYPES)[number]) ? (value as (typeof SUPPLEMENT_TYPES)[number]) : 'EXTRA_BED';
}

function normalizeChargeBasis(value: Supplement['chargeBasis']): (typeof CHARGE_BASIS_VALUES)[number] {
  return CHARGE_BASIS_VALUES.includes(value as (typeof CHARGE_BASIS_VALUES)[number]) ? (value as (typeof CHARGE_BASIS_VALUES)[number]) : 'PER_NIGHT';
}

export function HotelContractWorkspace({
  apiBaseUrl,
  contract,
  hotels,
  contracts,
  rates,
  seasons,
  supplements,
  mealPlans,
  cancellationPolicy,
}: HotelContractWorkspaceProps) {
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const activeRoomCategories = contract.hotel.roomCategories.filter((roomCategory) => roomCategory.isActive);
  const sortedRates = useMemo(
    () =>
      [...rates].sort(
        (left, right) =>
          left.roomCategory.name.localeCompare(right.roomCategory.name) ||
          left.seasonName.localeCompare(right.seasonName) ||
          left.occupancyType.localeCompare(right.occupancyType) ||
          left.mealPlan.localeCompare(right.mealPlan),
      ),
    [rates],
  );
  const usedRoomCategoryIds = new Set(rates.map((rate) => rate.roomCategoryId).concat(supplements.map((supplement) => supplement.roomCategoryId || '')));
  const usedRoomCategories = contract.hotel.roomCategories.filter((roomCategory) => usedRoomCategoryIds.has(roomCategory.id));
  const visibleRoomCategories = usedRoomCategories.length > 0 ? usedRoomCategories : activeRoomCategories;
  const selectedRate = drawer?.type === 'rate' && drawer.rateId ? rates.find((rate) => rate.id === drawer.rateId) || null : null;
  const selectedSupplement =
    drawer?.type === 'supplement' && drawer.supplementId ? supplements.find((supplement) => supplement.id === drawer.supplementId) || null : null;
  const seasonRows = Array.from(
    new Map(
      rates.map((rate) => [
        `${rate.seasonName}-${rate.seasonFrom || contract.validFrom}-${rate.seasonTo || contract.validTo}`,
        {
          name: rate.seasonName,
          from: rate.seasonFrom || contract.validFrom,
          to: rate.seasonTo || contract.validTo,
        },
      ]),
    ).values(),
  );
  const taxProfiles = Array.from(
    new Map(
      rates.map((rate) => [
        [
          rate.salesTaxPercent ?? 0,
          rate.salesTaxIncluded ? 'included' : 'excluded',
          rate.serviceChargePercent ?? 0,
          rate.serviceChargeIncluded ? 'included' : 'excluded',
          rate.tourismFeeAmount ?? 0,
          rate.tourismFeeCurrency || rate.currency,
          rate.tourismFeeMode || 'none',
        ].join('|'),
        rate,
      ]),
    ).values(),
  );

  function closeDrawer() {
    setDrawer(null);
  }

  function renderDrawerContent() {
    if (!drawer) {
      return null;
    }

    if (drawer.type === 'contract') {
      return (
        <HotelContractsForm
          apiBaseUrl={apiBaseUrl}
          hotels={hotels.map((hotel) => ({ id: hotel.id, name: hotel.name, city: hotel.city || '' }))}
          contractId={contract.id}
          submitLabel="Save contract"
          initialValues={{
            hotelId: contract.hotel.id || contract.hotelId || '',
            name: contract.name,
            validFrom: contract.validFrom.slice(0, 10),
            validTo: contract.validTo.slice(0, 10),
            currency: normalizeSupportedCurrency(contract.currency),
          }}
        />
      );
    }

    if (drawer.type === 'rate') {
      return (
        <HotelRatesForm
          apiBaseUrl={apiBaseUrl}
          contracts={contracts}
          hotels={hotels}
          seasons={seasons}
          rateId={selectedRate?.id}
          submitLabel={selectedRate ? 'Save rate' : 'Add rate'}
          initialValues={{
            contractId: selectedRate?.contractId || contract.id,
            seasonId: selectedRate?.seasonId || '',
            seasonName: selectedRate?.seasonName || '',
            roomCategoryId: selectedRate?.roomCategoryId || '',
            occupancyType: selectedRate?.occupancyType || 'SGL',
            mealPlan: selectedRate?.mealPlan || 'BB',
            pricingMode: selectedRate?.pricingMode || '',
            pricingBasis: selectedRate?.pricingBasis || 'PER_ROOM',
            currency: normalizeSupportedCurrency(selectedRate?.currency || contract.currency),
            cost: selectedRate ? String(selectedRate.cost) : '',
            salesTaxPercent:
              selectedRate?.salesTaxPercent === null || selectedRate?.salesTaxPercent === undefined ? '' : String(selectedRate.salesTaxPercent),
            salesTaxIncluded: Boolean(selectedRate?.salesTaxIncluded),
            serviceChargePercent:
              selectedRate?.serviceChargePercent === null || selectedRate?.serviceChargePercent === undefined
                ? ''
                : String(selectedRate.serviceChargePercent),
            serviceChargeIncluded: Boolean(selectedRate?.serviceChargeIncluded),
            tourismFeeAmount:
              selectedRate?.tourismFeeAmount === null || selectedRate?.tourismFeeAmount === undefined ? '' : String(selectedRate.tourismFeeAmount),
            tourismFeeCurrency: selectedRate?.tourismFeeCurrency ? normalizeSupportedCurrency(selectedRate.tourismFeeCurrency) : '',
            tourismFeeMode: selectedRate?.tourismFeeMode || '',
          }}
        />
      );
    }

    return (
      <HotelContractSupplementForm
        apiBaseUrl={apiBaseUrl}
        contractId={contract.id}
        roomCategories={activeRoomCategories}
        supplementId={selectedSupplement?.id}
        submitLabel={selectedSupplement ? 'Save supplement' : 'Add supplement'}
        initialValues={
          selectedSupplement
            ? {
                roomCategoryId: selectedSupplement.roomCategoryId || '',
                type: normalizeSupplementType(selectedSupplement.type),
                chargeBasis: normalizeChargeBasis(selectedSupplement.chargeBasis),
                amount:
                  selectedSupplement.amount === null || selectedSupplement.amount === undefined ? '' : String(selectedSupplement.amount),
                currency: normalizeSupportedCurrency(selectedSupplement.currency || undefined) as SupportedCurrency,
                isMandatory: selectedSupplement.isMandatory,
                isActive: selectedSupplement.isActive,
                notes: selectedSupplement.notes || '',
              }
            : {
                roomCategoryId: '',
                type: 'EXTRA_BREAKFAST',
                chargeBasis: 'PER_PERSON',
                amount: '0',
                currency: normalizeSupportedCurrency(contract.currency),
                isMandatory: false,
                isActive: true,
                notes: '',
              }
        }
      />
    );
  }

  return (
    <section className="contract-workspace">
      <section className="contract-hero-card">
        <div>
          <p className="eyebrow">Contract Summary</p>
          <h2>{contract.name}</h2>
          <p className="section-copy">
            {contract.hotel.name}
            {contract.hotel.city ? `, ${contract.hotel.city}` : ''} | {contract.currency}
          </p>
        </div>
        <div className="contract-hero-actions">
          <button type="button" className="compact-button" onClick={() => setDrawer({ type: 'contract' })}>
            Edit contract
          </button>
          <button type="button" className="primary-button" onClick={() => setDrawer({ type: 'rate' })}>
            Add rate
          </button>
          <button type="button" className="compact-button" onClick={() => setDrawer({ type: 'supplement' })}>
            Add supplement
          </button>
        </div>
        <div className="contract-meta-grid">
          <div>
            <span>Valid from</span>
            <strong>{formatDate(contract.validFrom)}</strong>
          </div>
          <div>
            <span>Valid to</span>
            <strong>{formatDate(contract.validTo)}</strong>
          </div>
          <div>
            <span>Currency</span>
            <strong>{contract.currency}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{humanize(contract.readinessStatus, 'Draft')}</strong>
          </div>
        </div>
      </section>

      <nav className="contract-workspace-tabs" aria-label="Contract workspace sections">
        <a href="#overview">Overview</a>
        <a href="#rates">Rates</a>
        <a href="#supplements">Supplements</a>
        <a href="#terms">Terms</a>
      </nav>

      <section id="overview" className="contract-section-grid">
        <article className="contract-workspace-card">
          <div className="section-header-inline">
            <div>
              <p className="eyebrow">Rooms</p>
              <h3>Room Categories</h3>
            </div>
            <span>{visibleRoomCategories.length} in scope</span>
          </div>
          {visibleRoomCategories.length === 0 ? (
            <p className="empty-state">No room categories are connected to this contract hotel yet.</p>
          ) : (
            <div className="contract-chip-list">
              {visibleRoomCategories.map((roomCategory) => (
                <span key={roomCategory.id} className="contract-chip">
                  <strong>{roomCategory.name}</strong>
                  {roomCategory.code ? <small>{roomCategory.code}</small> : null}
                </span>
              ))}
            </div>
          )}
        </article>

        <article className="contract-workspace-card">
          <div className="section-header-inline">
            <div>
              <p className="eyebrow">Seasons</p>
              <h3>Validity</h3>
            </div>
            <span>{seasonRows.length || 1} ranges</span>
          </div>
          <div className="contract-list-stack">
            {(seasonRows.length ? seasonRows : [{ name: contract.name, from: contract.validFrom, to: contract.validTo }]).map((season) => (
              <div key={`${season.name}-${season.from}-${season.to}`} className="contract-list-row">
                <strong>{season.name || 'Contract validity'}</strong>
                <span>
                  {formatDate(season.from)} - {formatDate(season.to)}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section id="rates" className="contract-workspace-card">
        <div className="section-header-inline">
          <div>
            <p className="eyebrow">Pricing</p>
            <h3>Rates</h3>
            <p>Room category, occupancy, board, validity, basis, and tax profile for this contract.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => setDrawer({ type: 'rate' })}>
            Add rate
          </button>
        </div>

        {sortedRates.length === 0 ? (
          <p className="empty-state">No rates for this contract yet. Add the first rate to start pricing this contract.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table contract-rates-table">
              <thead>
                <tr>
                  <th>Room category</th>
                  <th>Occupancy</th>
                  <th>Board</th>
                  <th>Season / validity</th>
                  <th>Rate</th>
                  <th>Basis</th>
                  <th>Currency</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRates.map((rate) => (
                  <tr key={rate.id}>
                    <td>
                      <strong>{rate.roomCategory.name}</strong>
                      {rate.roomCategory.code ? <div className="table-subcopy">{rate.roomCategory.code}</div> : null}
                    </td>
                    <td>{rate.occupancyType}</td>
                    <td>{rate.mealPlan}</td>
                    <td>
                      <strong>{humanize(rate.seasonName, 'Open season')}</strong>
                      <div className="table-subcopy">
                        {formatDate(rate.seasonFrom || contract.validFrom)} - {formatDate(rate.seasonTo || contract.validTo)}
                      </div>
                    </td>
                    <td className="numeric-cell">{formatMoney(rate.cost, rate.currency)}</td>
                    <td>{formatPricingBasis(rate.pricingBasis)}</td>
                    <td>{rate.currency}</td>
                    <td>
                      <span className="quote-ui-badge quote-ui-badge-success">Active</span>
                    </td>
                    <td>
                      <button type="button" className="compact-button" onClick={() => setDrawer({ type: 'rate', rateId: rate.id })}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="supplements" className="contract-section-grid">
        <article className="contract-workspace-card">
          <div className="section-header-inline">
            <div>
              <p className="eyebrow">Extras</p>
              <h3>Supplements</h3>
            </div>
            <button type="button" className="compact-button" onClick={() => setDrawer({ type: 'supplement' })}>
              Add supplement
            </button>
          </div>

          {supplements.length === 0 ? (
            <p className="empty-state">No supplements configured for this contract yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Supplement</th>
                    <th>Room scope</th>
                    <th>Charge</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {supplements.map((supplement) => (
                    <tr key={supplement.id}>
                      <td>
                        <strong>{formatSupplementType(supplement.type)}</strong>
                        <div className="table-subcopy">{supplement.isMandatory ? 'Mandatory' : 'Optional'}</div>
                      </td>
                      <td>
                        {supplement.roomCategory
                          ? supplement.roomCategory.code
                            ? `${supplement.roomCategory.name} (${supplement.roomCategory.code})`
                            : supplement.roomCategory.name
                          : 'All room categories'}
                      </td>
                      <td>
                        {formatSupplementCharge(supplement).amountLabel}
                        <div className="table-subcopy">{formatSupplementCharge(supplement).basisLabel}</div>
                      </td>
                      <td>
                        <span className={`quote-ui-badge ${supplement.isActive ? 'quote-ui-badge-success' : 'quote-ui-badge-info'}`}>
                          {supplement.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setDrawer({ type: 'supplement', supplementId: supplement.id })}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="contract-workspace-card">
          <div className="section-header-inline">
            <div>
              <p className="eyebrow">Taxes</p>
              <h3>Taxes & Fees</h3>
            </div>
            <span>{taxProfiles.length} profiles</span>
          </div>

          {taxProfiles.length === 0 ? (
            <p className="empty-state">No tax or fee profiles are available until rates are added.</p>
          ) : (
            <div className="contract-list-stack">
              {taxProfiles.map((rate) => (
                <div key={`${rate.id}-tax`} className="contract-list-row contract-list-row-wide">
                  <strong>{rate.roomCategory.name}</strong>
                  <span>
                    Sales tax {Number(rate.salesTaxPercent || 0).toFixed(2)}% {rate.salesTaxIncluded ? 'included' : 'excluded'}
                  </span>
                  <span>
                    Service {Number(rate.serviceChargePercent || 0).toFixed(2)}% {rate.serviceChargeIncluded ? 'included' : 'excluded'}
                  </span>
                  <span>
                    Tourism fee{' '}
                    {rate.tourismFeeAmount ? `${Number(rate.tourismFeeAmount).toFixed(2)} ${rate.tourismFeeCurrency || rate.currency}` : 'not set'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section id="terms" className="contract-section-grid">
        <article className="contract-workspace-card">
          <div className="section-header-inline">
            <div>
              <p className="eyebrow">Terms</p>
              <h3>Cancellation & Notes</h3>
            </div>
            <Link className="compact-button" href={`/hotels?tab=policies&contractId=${contract.id}`}>
              Manage terms
            </Link>
          </div>
          {cancellationPolicy ? (
            <div className="contract-list-stack">
              <div className="contract-list-row contract-list-row-wide">
                <strong>{cancellationPolicy.summary || 'Cancellation policy'}</strong>
                <span>No-show: {formatNoShow(cancellationPolicy)}</span>
                <span>{cancellationPolicy.notes || 'No cancellation notes'}</span>
              </div>
              {cancellationPolicy.rules.map((rule) => (
                <div key={rule.id} className="contract-list-row contract-list-row-wide">
                  <strong>{rule.isActive ? 'Active rule' : 'Inactive rule'}</strong>
                  <span>{formatCancellationRule(rule)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No cancellation policy or contract notes are configured yet.</p>
          )}
        </article>

        <article className="contract-workspace-card">
          <div className="section-header-inline">
            <div>
              <p className="eyebrow">Board</p>
              <h3>Meal Plans</h3>
            </div>
            <Link className="compact-button" href={`/hotels?tab=meal-plans-supplements&contractId=${contract.id}`}>
              Manage board
            </Link>
          </div>
          {mealPlans.length === 0 ? (
            <p className="empty-state">No meal plans configured for this contract yet.</p>
          ) : (
            <div className="contract-chip-list">
              {mealPlans.map((mealPlan) => (
                <span key={mealPlan.id} className="contract-chip">
                  <strong>{mealPlan.code}</strong>
                  <small>{mealPlan.isActive ? 'Active' : 'Inactive'}</small>
                </span>
              ))}
            </div>
          )}
        </article>
      </section>

      {drawer ? (
        <div className="contract-drawer-backdrop" role="presentation">
          <aside className="contract-drawer" aria-label="Contract editor">
            <div className="contract-drawer-header">
              <div>
                <p className="eyebrow">Edit</p>
                <h3>
                  {drawer.type === 'contract'
                    ? 'Contract'
                    : drawer.type === 'rate'
                      ? selectedRate
                        ? 'Rate'
                        : 'New rate'
                      : selectedSupplement
                        ? 'Supplement'
                        : 'New supplement'}
                </h3>
              </div>
              <button type="button" className="compact-button" onClick={closeDrawer}>
                Close
              </button>
            </div>
            <div className="contract-drawer-body">{renderDrawerContent()}</div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}
