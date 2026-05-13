'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { HotelContractsForm } from '../../../hotel-contracts/HotelContractsForm';
import { HotelRatesForm } from '../../../hotel-rates/HotelRatesForm';
import { HotelContractSupplementForm } from '../../HotelContractSupplementForm';
import {
  formatCancellationRule,
  formatPricingBasis,
  formatSupplementCharge,
  formatSupplementLabel,
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
    _count?: {
      roomCategories?: number;
    };
  };
  cancellationPolicy?: CancellationPolicy | null;
  readinessStatus?: 'draft' | 'in_progress' | 'ready';
  _count?: {
    rates?: number;
    supplements?: number;
    mealPlans?: number;
    allotments?: number;
  };
};

type HotelRate = {
  id: string;
  contractId: string;
  seasonId: string | null;
  seasonName: string;
  seasonFrom?: string | null;
  seasonTo?: string | null;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL' | 'TRP' | 'QUAD' | 'UNIT' | 'SINGLE_SUPPLEMENT' | string;
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
  name?: string | null;
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

type ContractWorkspaceTab = 'overview' | 'rates' | 'supplements' | 'terms';

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
const MAX_CONTRACT_DETAIL_ROWS = 250;
const CONTRACT_SAFE_MODE_THRESHOLD = 500;
const CONTRACT_TAB_PAGE_SIZE = 50;
const ENABLE_CONTRACT_WORKSPACE_TIMING_LOGS = process.env.NODE_ENV !== 'production';
const CONTRACT_WORKSPACE_TABS: Array<{ id: ContractWorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'rates', label: 'Rates' },
  { id: 'supplements', label: 'Supplements' },
  { id: 'terms', label: 'Terms' },
];

function toSafeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function limitRows<T>(value: T[]) {
  return value.slice(0, MAX_CONTRACT_DETAIL_ROWS);
}

async function fetchWorkspaceJson<T>(url: string, label: string): Promise<T> {
  const startedAt = performance.now();
  const response = await fetch(url, { cache: 'no-store' });
  const text = await response.text();
  logContractWorkspaceTiming('[hotel-contract-workspace] lazy fetch', {
    label,
    url,
    durationMs: Math.round(performance.now() - startedAt),
    payloadBytes: text.length,
  });

  if (!response.ok) {
    throw new Error(text || `Could not fetch ${label}.`);
  }

  return text ? (JSON.parse(text) as T) : ([] as T);
}

function logContractWorkspaceTiming(message: string, details: Record<string, unknown>) {
  if (ENABLE_CONTRACT_WORKSPACE_TIMING_LOGS) {
    console.log(message, details);
  }
}

function roomCategoryLabel(roomCategory: { name?: string | null; code?: string | null } | null | undefined) {
  if (!roomCategory?.name) {
    return 'Unassigned room category';
  }

  return roomCategory.code ? `${roomCategory.name} (${roomCategory.code})` : roomCategory.name;
}

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

function normalizeEditableOccupancy(value: HotelRate['occupancyType']): 'SGL' | 'DBL' | 'TPL' {
  return value === 'SGL' || value === 'DBL' || value === 'TPL' ? value : 'SGL';
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
  const renderStartedAt = typeof performance !== 'undefined' ? performance.now() : 0;
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [activeTab, setActiveTab] = useState<ContractWorkspaceTab>('overview');
  const [loadedRates, setLoadedRates] = useState<HotelRate[]>(rates);
  const [loadedSupplements, setLoadedSupplements] = useState<Supplement[]>(supplements);
  const [loadedMealPlans, setLoadedMealPlans] = useState<MealPlan[]>(mealPlans);
  const [loadedCancellationPolicy, setLoadedCancellationPolicy] = useState<CancellationPolicy>(cancellationPolicy);
  const [loadedTabs, setLoadedTabs] = useState<Record<ContractWorkspaceTab, boolean>>({
    overview: true,
    rates: rates.length > 0,
    supplements: supplements.length > 0,
    terms: Boolean(cancellationPolicy || mealPlans.length > 0),
  });
  const [tabError, setTabError] = useState('');
  const [loadingTab, setLoadingTab] = useState<ContractWorkspaceTab | null>(null);
  const [manualTabLoads, setManualTabLoads] = useState<Record<ContractWorkspaceTab, boolean>>({
    overview: true,
    rates: false,
    supplements: false,
    terms: false,
  });
  const safeRates = useMemo(() => toSafeArray(loadedRates).filter((rate) => rate.contractId === contract.id), [contract.id, loadedRates]);
  const safeSupplements = useMemo(() => toSafeArray(loadedSupplements), [loadedSupplements]);
  const safeMealPlans = useMemo(() => toSafeArray(loadedMealPlans), [loadedMealPlans]);
  const safeCancellationRules = useMemo(() => toSafeArray(loadedCancellationPolicy?.rules), [loadedCancellationPolicy]);
  const roomCategories = useMemo(() => toSafeArray(contract.hotel?.roomCategories), [contract.hotel?.roomCategories]);
  const totalRoomCategories = contract.hotel?._count?.roomCategories ?? roomCategories.length;
  const totalRates = contract._count?.rates ?? safeRates.length;
  const totalSupplements = contract._count?.supplements ?? safeSupplements.length;
  const totalMealPlans = contract._count?.mealPlans ?? safeMealPlans.length;
  const isLargeContract =
    totalRoomCategories > CONTRACT_SAFE_MODE_THRESHOLD ||
    totalRates > CONTRACT_SAFE_MODE_THRESHOLD ||
    totalSupplements > CONTRACT_SAFE_MODE_THRESHOLD ||
    totalMealPlans > CONTRACT_SAFE_MODE_THRESHOLD;
  const activeRoomCategories = useMemo(() => roomCategories.filter((roomCategory) => roomCategory.isActive), [roomCategories]);
  const sortedRates = useMemo(
    () =>
      [...safeRates].sort(
        (left, right) =>
          roomCategoryLabel(left.roomCategory).localeCompare(roomCategoryLabel(right.roomCategory)) ||
          String(left.seasonName || '').localeCompare(String(right.seasonName || '')) ||
          String(left.occupancyType || '').localeCompare(String(right.occupancyType || '')) ||
          String(left.mealPlan || '').localeCompare(String(right.mealPlan || '')),
      ),
    [safeRates],
  );
  const displayedRates = useMemo(() => limitRows(sortedRates), [sortedRates]);
  const displayedSupplements = useMemo(() => limitRows(safeSupplements), [safeSupplements]);
  const displayedMealPlans = useMemo(() => limitRows(safeMealPlans), [safeMealPlans]);
  const displayedCancellationRules = useMemo(() => limitRows(safeCancellationRules), [safeCancellationRules]);
  const usedRoomCategoryIds = useMemo(
    () => new Set(safeRates.map((rate) => rate.roomCategoryId).concat(safeSupplements.map((supplement) => supplement.roomCategoryId || ''))),
    [safeRates, safeSupplements],
  );
  const usedRoomCategories = useMemo(
    () => roomCategories.filter((roomCategory) => usedRoomCategoryIds.has(roomCategory.id)),
    [roomCategories, usedRoomCategoryIds],
  );
  const visibleRoomCategories = useMemo(
    () => (usedRoomCategories.length > 0 ? usedRoomCategories : activeRoomCategories),
    [activeRoomCategories, usedRoomCategories],
  );
  const displayedRoomCategories = useMemo(() => limitRows(visibleRoomCategories), [visibleRoomCategories]);
  const selectedRate = drawer?.type === 'rate' && drawer.rateId ? safeRates.find((rate) => rate.id === drawer.rateId) || null : null;
  const selectedSupplement =
    drawer?.type === 'supplement' && drawer.supplementId
      ? safeSupplements.find((supplement) => supplement.id === drawer.supplementId) || null
      : null;
  const seasonRows = useMemo(
    () =>
      Array.from(
        new Map(
          safeRates.map((rate) => [
            `${rate.seasonName}-${rate.seasonFrom || contract.validFrom}-${rate.seasonTo || contract.validTo}`,
            {
              name: rate.seasonName,
              from: rate.seasonFrom || contract.validFrom,
              to: rate.seasonTo || contract.validTo,
            },
          ]),
        ).values(),
      ),
    [contract.validFrom, contract.validTo, safeRates],
  );
  const taxProfiles = useMemo(
    () =>
      limitRows(
        Array.from(
          new Map(
            safeRates.map((rate) => [
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
        ),
      ),
    [safeRates],
  );

  useEffect(() => {
    logContractWorkspaceTiming('[hotel-contract-workspace] render tab', {
      activeTab,
      renderMs: Math.round(performance.now() - renderStartedAt),
      contractId: contract.id,
      largeContractSafeMode: isLargeContract,
      roomCategoriesReturned: roomCategories.length,
      roomCategoriesTotal: totalRoomCategories,
      ratesLoaded: safeRates.length,
      ratesTotal: totalRates,
      supplementsLoaded: safeSupplements.length,
      supplementsTotal: totalSupplements,
      mealPlansLoaded: safeMealPlans.length,
      mealPlansTotal: totalMealPlans,
      derivedSeasonRows: seasonRows.length,
      derivedTaxProfiles: taxProfiles.length,
      displayedRows:
        activeTab === 'rates'
          ? displayedRates.length
          : activeTab === 'supplements'
            ? displayedSupplements.length + taxProfiles.length
            : activeTab === 'terms'
              ? displayedMealPlans.length + displayedCancellationRules.length
              : displayedRoomCategories.length + seasonRows.length,
    });
  });

  useEffect(() => {
    let cancelled = false;

    async function loadTabData() {
      if (loadedTabs[activeTab] || (isLargeContract && !manualTabLoads[activeTab])) {
        return;
      }

      setLoadingTab(activeTab);
      setTabError('');
      try {
        if (activeTab === 'rates') {
          const nextRates = await fetchWorkspaceJson<HotelRate[]>(
            `${apiBaseUrl}/hotel-rates?contractId=${encodeURIComponent(contract.id)}&limit=${CONTRACT_TAB_PAGE_SIZE}&offset=0`,
            'contract rates',
          );
          if (!cancelled) {
            setLoadedRates(Array.isArray(nextRates) ? nextRates.filter((rate) => rate.contractId === contract.id) : []);
          }
        } else if (activeTab === 'supplements') {
          const nextSupplements = await fetchWorkspaceJson<Supplement[]>(
            `${apiBaseUrl}/contracts/${encodeURIComponent(contract.id)}/supplements?limit=${CONTRACT_TAB_PAGE_SIZE}&offset=0`,
            'contract supplements',
          );
          if (!cancelled) {
            setLoadedSupplements(Array.isArray(nextSupplements) ? nextSupplements : []);
          }
        } else if (activeTab === 'terms') {
          const [nextMealPlans, nextCancellationPolicy] = await Promise.all([
            fetchWorkspaceJson<MealPlan[]>(`${apiBaseUrl}/contracts/${encodeURIComponent(contract.id)}/meal-plans`, 'contract meal plans'),
            fetchWorkspaceJson<CancellationPolicy>(
              `${apiBaseUrl}/hotel-contracts/${encodeURIComponent(contract.id)}/cancellation-policy`,
              'contract cancellation policy',
            ).catch((error) => {
              logContractWorkspaceTiming('[hotel-contract-workspace] cancellation policy lazy fetch skipped', {
                contractId: contract.id,
                message: error instanceof Error ? error.message : String(error),
              });
              return null;
            }),
          ]);
          if (!cancelled) {
            setLoadedMealPlans(Array.isArray(nextMealPlans) ? nextMealPlans : []);
            setLoadedCancellationPolicy(nextCancellationPolicy || null);
          }
        }

        if (!cancelled) {
          setLoadedTabs((current) => ({ ...current, [activeTab]: true }));
        }
      } catch (error) {
        if (!cancelled) {
          setTabError(error instanceof Error ? error.message : `Could not load ${activeTab} details.`);
        }
      } finally {
        if (!cancelled) {
          setLoadingTab(null);
        }
      }
    }

    loadTabData();

    return () => {
      cancelled = true;
    };
  }, [activeTab, apiBaseUrl, contract.id, isLargeContract, loadedTabs, manualTabLoads]);

  const formRoomCategories = useMemo(() => {
    const byId = new Map<string, HotelRoomCategory>();
    for (const roomCategory of roomCategories) {
      byId.set(roomCategory.id, roomCategory);
    }
    for (const rate of safeRates) {
      if (rate.roomCategory?.id && !byId.has(rate.roomCategory.id)) {
        byId.set(rate.roomCategory.id, {
          id: rate.roomCategory.id,
          hotelId: contract.hotel.id,
          name: rate.roomCategory.name,
          code: rate.roomCategory.code,
          isActive: true,
        });
      }
    }
    for (const supplement of safeSupplements) {
      if (supplement.roomCategory?.id && !byId.has(supplement.roomCategory.id)) {
        byId.set(supplement.roomCategory.id, {
          id: supplement.roomCategory.id,
          hotelId: contract.hotel.id,
          name: supplement.roomCategory.name,
          code: supplement.roomCategory.code,
          isActive: true,
        });
      }
    }
    return Array.from(byId.values());
  }, [contract.hotel.id, roomCategories, safeRates, safeSupplements]);

  const formHotels = useMemo(
    () =>
      hotels.length > 0
        ? hotels.map((hotel) => (hotel.id === contract.hotel.id ? { ...hotel, roomCategories: formRoomCategories } : hotel))
        : [{ ...contract.hotel, roomCategories: formRoomCategories }],
    [contract.hotel, formRoomCategories, hotels],
  );
  const formContracts = useMemo(
    () =>
      contracts.length > 0
        ? contracts.map((entry) => (entry.id === contract.id ? { ...entry, hotel: { ...contract.hotel, roomCategories: formRoomCategories } } : entry))
        : [{ ...contract, hotel: { ...contract.hotel, roomCategories: formRoomCategories } }],
    [contract, contracts, formRoomCategories],
  );

  function closeDrawer() {
    setDrawer(null);
  }

  function requestTabLoad(tab: ContractWorkspaceTab) {
    logContractWorkspaceTiming('[hotel-contract-workspace] manual tab load requested', {
      contractId: contract.id,
      tab,
      totals: {
        roomCategories: totalRoomCategories,
        rates: totalRates,
        supplements: totalSupplements,
        mealPlans: totalMealPlans,
      },
    });
    setManualTabLoads((current) => ({ ...current, [tab]: true }));
  }

  function renderDrawerContent() {
    if (!drawer) {
      return null;
    }

    if (drawer.type === 'contract') {
      return (
        <HotelContractsForm
          apiBaseUrl={apiBaseUrl}
          hotels={formHotels.map((hotel) => ({ id: hotel.id, name: hotel.name, city: hotel.city || '' }))}
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
          contracts={formContracts}
          hotels={formHotels}
          seasons={seasons}
          rateId={selectedRate?.id}
          submitLabel={selectedRate ? 'Save rate' : 'Add rate'}
          initialValues={{
            contractId: selectedRate?.contractId || contract.id,
            seasonId: selectedRate?.seasonId || '',
            seasonName: selectedRate?.seasonName || '',
            roomCategoryId: selectedRate?.roomCategoryId || '',
            occupancyType: normalizeEditableOccupancy(selectedRate?.occupancyType || 'SGL'),
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
        roomCategories={formRoomCategories.filter((roomCategory) => roomCategory.isActive)}
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
        {CONTRACT_WORKSPACE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'contract-workspace-tab contract-workspace-tab-active' : 'contract-workspace-tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {isLargeContract ? (
        <div className="contract-workspace-card contract-safe-mode-banner">
          <strong>Large contract safe mode</strong>
          <span>
            Summary is shown first. Rates, supplements, and terms load only when their tab is opened.
          </span>
        </div>
      ) : null}

      {isLargeContract && !loadedTabs[activeTab] && !manualTabLoads[activeTab] ? (
        <div className="contract-workspace-card">
          <div className="section-header-inline">
            <div>
              <p className="eyebrow">Safe mode</p>
              <h3>Load {activeTab} details</h3>
              <p>This contract is large, so details are loaded only when requested.</p>
            </div>
            <button type="button" className="primary-button" onClick={() => requestTabLoad(activeTab)}>
              Load first {CONTRACT_TAB_PAGE_SIZE} rows
            </button>
          </div>
        </div>
      ) : null}

      {loadingTab ? (
        <div className="contract-workspace-card">
          <p className="empty-state">Loading {loadingTab} details...</p>
        </div>
      ) : null}

      {tabError ? (
        <div className="contract-workspace-card">
          <p className="form-error">{tabError}</p>
        </div>
      ) : null}

      {activeTab === 'overview' ? <section id="overview" className="contract-section-grid">
        <article className="contract-workspace-card">
          <div className="section-header-inline">
            <div>
              <p className="eyebrow">Rooms</p>
              <h3>Room Categories</h3>
            </div>
            <span>{totalRoomCategories} in scope</span>
          </div>
          {visibleRoomCategories.length === 0 ? (
            <p className="empty-state">No room categories are connected to this contract hotel yet.</p>
          ) : (
            <div className="contract-chip-list">
              {totalRoomCategories > displayedRoomCategories.length ? (
                <p className="table-subcopy">Showing the first {displayedRoomCategories.length} room categories. Open rates to work with detailed pricing rows.</p>
              ) : null}
              {displayedRoomCategories.map((roomCategory) => (
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
      </section> : null}

      {activeTab === 'rates' && (!isLargeContract || loadedTabs.rates || manualTabLoads.rates) ? <section id="rates" className="contract-workspace-card">
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

        {loadingTab === 'rates' ? (
          <p className="empty-state">Loading contract rates...</p>
        ) : sortedRates.length === 0 ? (
          <p className="empty-state">No rates for this contract yet. Add the first rate to start pricing this contract.</p>
        ) : (
          <div className="table-wrap">
            {totalRates > displayedRates.length ? (
              <p className="table-subcopy">Showing the first {displayedRates.length} of {totalRates} rates to keep the contract detail responsive.</p>
            ) : null}
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
                {displayedRates.map((rate) => (
                  <tr key={rate.id}>
                    <td>
                      <strong>{rate.roomCategory?.name || 'Unassigned room category'}</strong>
                      {rate.roomCategory?.code ? <div className="table-subcopy">{rate.roomCategory.code}</div> : null}
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
      </section> : null}

      {activeTab === 'supplements' && (!isLargeContract || loadedTabs.supplements || manualTabLoads.supplements) ? <section id="supplements" className="contract-section-grid">
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

          {loadingTab === 'supplements' ? (
            <p className="empty-state">Loading supplements...</p>
          ) : safeSupplements.length === 0 ? (
            <p className="empty-state">No supplements configured for this contract yet.</p>
          ) : (
            <div className="table-wrap">
              {totalSupplements > displayedSupplements.length ? (
                <p className="table-subcopy">Showing the first {displayedSupplements.length} of {totalSupplements} supplements to keep the contract detail responsive.</p>
              ) : null}
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
                  {displayedSupplements.map((supplement) => (
                    <tr key={supplement.id}>
                      <td>
                        <strong>{formatSupplementLabel(supplement)}</strong>
                        <div className="table-subcopy">{supplement.isMandatory ? 'Mandatory' : 'Optional'}</div>
                      </td>
                      <td>
                        {supplement.roomCategory ? roomCategoryLabel(supplement.roomCategory) : 'All room categories'}
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
                  <strong>{rate.roomCategory?.name || 'Unassigned room category'}</strong>
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
      </section> : null}

      {activeTab === 'terms' && (!isLargeContract || loadedTabs.terms || manualTabLoads.terms) ? <section id="terms" className="contract-section-grid">
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
          {loadingTab === 'terms' ? (
            <p className="empty-state">Loading contract terms...</p>
          ) : loadedCancellationPolicy ? (
            <div className="contract-list-stack">
              <div className="contract-list-row contract-list-row-wide">
                <strong>{loadedCancellationPolicy.summary || 'Cancellation policy'}</strong>
                <span>No-show: {formatNoShow(loadedCancellationPolicy)}</span>
                <span>{loadedCancellationPolicy.notes || 'No cancellation notes'}</span>
              </div>
              {safeCancellationRules.length > displayedCancellationRules.length ? (
                <div className="contract-list-row contract-list-row-wide">
                  <strong>Additional rules hidden</strong>
                  <span>Showing the first {displayedCancellationRules.length} rules to keep the contract detail responsive.</span>
                </div>
              ) : null}
              {displayedCancellationRules.map((rule) => (
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
          {safeMealPlans.length === 0 ? (
            <p className="empty-state">No meal plans configured for this contract yet.</p>
          ) : (
            <div className="contract-chip-list">
              {displayedMealPlans.map((mealPlan) => (
                <span key={mealPlan.id} className="contract-chip">
                  <strong>{mealPlan.code}</strong>
                  <small>{mealPlan.isActive ? 'Active' : 'Inactive'}</small>
                </span>
              ))}
            </div>
          )}
        </article>
      </section> : null}

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
