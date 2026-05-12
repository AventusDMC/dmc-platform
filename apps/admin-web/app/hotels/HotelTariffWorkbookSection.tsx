import { QueryDropdownFilters, type QueryDropdownFilterOption } from '../components/QueryDropdownFilters';
import { SummaryStrip } from '../components/SummaryStrip';
import { adminPageFetchJson } from '../lib/admin-server';
import { HotelTariffWorkbookGrid, type HotelTariffWorkbookRow } from './HotelTariffWorkbookGrid';

const API_BASE_URL = '/api';
const MEAL_PLANS = ['BB', 'HB', 'FB'] as const;

type HotelRoomCategory = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type Hotel = {
  id: string;
  cityId: string | null;
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
    city?: string;
    roomCategories: HotelRoomCategory[];
  };
};

type HotelRate = {
  id: string;
  contractId: string;
  seasonName?: string | null;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  pricingMode?: 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT' | null;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | null;
  currency: string;
  cost: number;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  };
};

type MealPlan = {
  code: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  isActive: boolean;
  notes: string | null;
};

type Supplement = {
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

type ChildPolicy = {
  bands: Array<{
    label: string;
    minAge: number;
    maxAge: number;
    chargeBasis: 'FREE' | 'PERCENT_OF_ADULT' | 'FIXED_AMOUNT';
    chargeValue: number | null;
    isActive: boolean;
  }>;
} | null;

type ContractExtras = {
  mealPlans: MealPlan[];
  supplements: Supplement[];
  childPolicy: ChildPolicy;
};

type HotelTariffWorkbookSectionProps = {
  filters?: {
    cityId?: string;
    hotelId?: string;
    contractId?: string;
    roomCategoryId?: string;
    mealPlan?: string;
    status?: string;
    validity?: string;
    activeState?: string;
  };
};

export type HotelTariffWorkbookContractFilter = {
  cityId?: string;
  hotelId?: string;
  contractId?: string;
  status?: string;
  validity?: string;
  activeState?: string;
};

async function getHotels(): Promise<Hotel[]> {
  return adminPageFetchJson<Hotel[]>(`${API_BASE_URL}/hotels`, 'Hotel tariff workbook hotels', {
    cache: 'no-store',
  });
}

async function getHotelContracts(): Promise<HotelContract[]> {
  return adminPageFetchJson<HotelContract[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotel tariff workbook contracts', {
    cache: 'no-store',
  });
}

async function getHotelRates(): Promise<HotelRate[]> {
  return adminPageFetchJson<HotelRate[]>(`${API_BASE_URL}/hotel-rates`, 'Hotel tariff workbook rates', {
    cache: 'no-store',
  });
}

async function getMealPlans(contractId: string): Promise<MealPlan[]> {
  return adminPageFetchJson<MealPlan[]>(`${API_BASE_URL}/contracts/${contractId}/meal-plans`, 'Hotel tariff workbook meal plans', {
    cache: 'no-store',
  }).catch(() => []);
}

async function getSupplements(contractId: string): Promise<Supplement[]> {
  return adminPageFetchJson<Supplement[]>(`${API_BASE_URL}/contracts/${contractId}/supplements`, 'Hotel tariff workbook supplements', {
    cache: 'no-store',
  }).catch(() => []);
}

async function getChildPolicy(contractId: string): Promise<ChildPolicy> {
  return adminPageFetchJson<ChildPolicy>(`${API_BASE_URL}/contracts/${contractId}/child-policy`, 'Hotel tariff workbook child policy', {
    cache: 'no-store',
    allow404: true,
  }).catch(() => null);
}

async function getContractExtras(contractId: string): Promise<ContractExtras> {
  const [mealPlans, supplements, childPolicy] = await Promise.all([
    getMealPlans(contractId),
    getSupplements(contractId),
    getChildPolicy(contractId),
  ]);

  return { mealPlans, supplements, childPolicy };
}

function buildOptions(entries: Array<{ value: string; label: string }>): QueryDropdownFilterOption[] {
  return entries
    .filter((entry, index, collection) => collection.findIndex((current) => current.value === entry.value) === index)
    .sort((left, right) => left.label.localeCompare(right.label));
}

function formatDateRange(from: string, to: string) {
  return `${new Date(from).toLocaleDateString()} - ${new Date(to).toLocaleDateString()}`;
}

function getValidityKey(contract: { validFrom: string; validTo: string }) {
  return `${contract.validFrom}:${contract.validTo}`;
}

function getContractStatus(validFrom: string, validTo: string) {
  const today = new Date();
  const start = new Date(validFrom);
  const end = new Date(validTo);

  if (start <= today && end >= today) return 'current';
  if (start > today) return 'upcoming';
  return 'expired';
}

export function filterHotelTariffContracts<T extends { id: string; validFrom: string; validTo: string; hotel: { id: string } }>(
  contracts: T[],
  hotels: Array<{ id: string; cityId: string | null }>,
  filters: HotelTariffWorkbookContractFilter,
) {
  const cityId = filters.cityId || '';
  const hotelId = filters.hotelId || '';
  const contractId = filters.contractId || '';
  const status = filters.status || '';
  const validity = filters.validity || '';
  const activeState = filters.activeState || '';

  return contracts.filter((contract) => {
    const statusValue = getContractStatus(contract.validFrom, contract.validTo);

    if (hotelId && contract.hotel.id !== hotelId) return false;
    if (cityId && !hotels.find((hotel) => hotel.id === contract.hotel.id && hotel.cityId === cityId)) return false;
    if (contractId && contract.id !== contractId) return false;
    if (status && statusValue !== status) return false;
    if (activeState === 'active' && statusValue === 'expired') return false;
    if (activeState === 'inactive' && statusValue !== 'expired') return false;
    if (validity && getValidityKey(contract) !== validity) return false;

    return true;
  });
}

function formatPricingBasis(rate: HotelRate) {
  if (rate.pricingMode === 'PER_PERSON_PER_NIGHT' || rate.pricingBasis === 'PER_PERSON') {
    return 'per person/night';
  }

  return 'per room/night';
}

function formatSupplementType(type: Supplement['type']) {
  return String(type || 'Supplement')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatChargeBasis(value: Supplement['chargeBasis']) {
  if (value === 'PER_PERSON') return 'per person';
  if (value === 'PER_ROOM') return 'per room';
  if (value === 'PER_STAY') return 'per stay';
  if (value === 'PER_NIGHT') return 'per night';
  return 'charge basis';
}

function formatSupplement(supplement: Supplement) {
  const amount = Number(supplement.amount);
  const amountLabel = Number.isFinite(amount) ? `${amount.toFixed(2)} ${supplement.currency || ''}`.trim() : 'No amount';
  const label = supplement.notes?.split('|')[0]?.trim() || formatSupplementType(supplement.type);

  return `${label}: ${amountLabel} ${formatChargeBasis(supplement.chargeBasis)}`;
}

function formatChildPolicy(childPolicy: ChildPolicy, currency: string) {
  const bands = childPolicy?.bands?.filter((band) => band.isActive) || [];

  if (bands.length === 0) {
    return 'No child policy';
  }

  return bands
    .map((band) => {
      if (band.chargeBasis === 'FREE') {
        return `${band.label || 'Child'} ${band.minAge}-${band.maxAge}: free`;
      }

      if (band.chargeBasis === 'PERCENT_OF_ADULT') {
        return `${band.label || 'Child'} ${band.minAge}-${band.maxAge}: ${band.chargeValue ?? 0}% adult`;
      }

      return `${band.label || 'Child'} ${band.minAge}-${band.maxAge}: ${band.chargeValue ?? 0} ${currency}`;
    })
    .join('; ');
}

function getRoomCategoryLabel(roomCategory: HotelRate['roomCategory']) {
  return `${roomCategory.name}${roomCategory.code ? ` (${roomCategory.code})` : ''}`;
}

function getSupplementsForRoom(supplements: Supplement[], roomCategoryId: string) {
  return supplements.filter((supplement) => supplement.isActive && (!supplement.roomCategoryId || supplement.roomCategoryId === roomCategoryId));
}

function isSingleSupplement(supplement: Supplement) {
  const notes = supplement.notes?.toLowerCase() || '';
  const type = String(supplement.type || '').toLowerCase();

  return notes.includes('single supplement') || type.includes('single');
}

function buildRows(contracts: HotelContract[], rates: HotelRate[], hotels: Hotel[], extrasByContractId: Map<string, ContractExtras>) {
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const hotelById = new Map(hotels.map((hotel) => [hotel.id, hotel]));

  return rates
    .map<HotelTariffWorkbookRow | null>((rate) => {
      const contract = contractById.get(rate.contractId);
      if (!contract) {
        return null;
      }

      const hotel = hotelById.get(contract.hotel.id);
      const extras = extrasByContractId.get(contract.id);
      const roomSupplements = getSupplementsForRoom(extras?.supplements || [], rate.roomCategoryId);
      const singleSupplements = roomSupplements.filter(isSingleSupplement);
      const mealPlan = extras?.mealPlans.find((entry) => entry.code === rate.mealPlan);
      const notes = [rate.seasonName ? `Season: ${rate.seasonName}` : '', mealPlan?.notes ? `Meal plan: ${mealPlan.notes}` : '']
        .filter(Boolean)
        .join(' | ');
      const cost = Number(rate.cost);
      const rateValue = Number.isFinite(cost) ? cost.toFixed(2) : '';

      return {
        id: rate.id,
        hotelName: contract.hotel.name,
        city: hotel?.city || contract.hotel.city || '',
        contractName: contract.name,
        contractStatus: getContractStatus(contract.validFrom, contract.validTo),
        validity: formatDateRange(contract.validFrom, contract.validTo),
        roomCategory: getRoomCategoryLabel(rate.roomCategory),
        mealPlan: rate.mealPlan,
        occupancyType: rate.occupancyType,
        pricingBasis: formatPricingBasis(rate),
        currency: rate.currency || contract.currency,
        bbRate: rate.mealPlan === 'BB' ? rateValue : '',
        hbRate: rate.mealPlan === 'HB' ? rateValue : '',
        fbRate: rate.mealPlan === 'FB' ? rateValue : '',
        supplements: roomSupplements.filter((supplement) => !isSingleSupplement(supplement)).map(formatSupplement).join('; '),
        singleSupplement: singleSupplements.map(formatSupplement).join('; '),
        childPolicy: formatChildPolicy(extras?.childPolicy || null, contract.currency),
        notes,
      };
    })
    .filter((row): row is HotelTariffWorkbookRow => Boolean(row))
    .sort((left, right) =>
      [left.hotelName, left.contractName, left.validity, left.roomCategory, left.mealPlan, left.occupancyType]
        .join('|')
        .localeCompare([right.hotelName, right.contractName, right.validity, right.roomCategory, right.mealPlan, right.occupancyType].join('|')),
    );
}

export async function HotelTariffWorkbookSection({ filters }: HotelTariffWorkbookSectionProps) {
  const [hotels, contracts, rates] = await Promise.all([getHotels(), getHotelContracts(), getHotelRates()]);
  const cityId = filters?.cityId || '';
  const hotelId = filters?.hotelId || '';
  const contractId = filters?.contractId || '';
  const roomCategoryId = filters?.roomCategoryId || '';
  const mealPlan = filters?.mealPlan || '';
  const status = filters?.status || '';
  const validity = filters?.validity || '';
  const activeState = filters?.activeState || '';
  const availableHotels = hotels.filter((hotel) => (cityId ? hotel.cityId === cityId : true));
  const availableContracts = filterHotelTariffContracts(contracts, hotels, {
    cityId,
    hotelId,
    contractId,
    status,
    validity,
    activeState,
  });
  const availableContractIds = new Set(availableContracts.map((contract) => contract.id));
  const visibleRates = rates.filter((rate) => {
    if (!availableContractIds.has(rate.contractId)) return false;
    if (roomCategoryId && rate.roomCategoryId !== roomCategoryId) return false;
    if (mealPlan && rate.mealPlan !== mealPlan) return false;

    return true;
  });
  const visibleRoomCategoryIds = new Set(
    rates.filter((rate) => availableContractIds.has(rate.contractId)).map((rate) => rate.roomCategoryId),
  );
  const availableRoomCategories = hotels
    .filter((hotel) => (hotelId ? hotel.id === hotelId : cityId ? hotel.cityId === cityId : true))
    .flatMap((hotel) =>
      hotel.roomCategories
        .filter((category) => category.isActive && visibleRoomCategoryIds.has(category.id))
        .map((category) => ({
          value: category.id,
          label: `${category.name}${category.code ? ` (${category.code})` : ''}`,
        })),
    );
  const extrasEntries = await Promise.all(availableContracts.map(async (contract) => [contract.id, await getContractExtras(contract.id)] as const));
  const extrasByContractId = new Map(extrasEntries);
  const workbookRows = buildRows(availableContracts, visibleRates, hotels, extrasByContractId);
  const supplementCount = Array.from(extrasByContractId.values()).reduce((sum, extras) => sum + extras.supplements.length, 0);
  const childPolicyCount = Array.from(extrasByContractId.values()).filter((extras) => extras.childPolicy).length;

  return (
    <div className="section-stack">
      <QueryDropdownFilters
        eyebrow="Tariff workbook filters"
        title="Hotel tariff workbook filters"
        description="Filter operational tariff maintenance by hotel, contract, validity, room category, meal plan, and commercial lifecycle."
        filters={[
          {
            key: 'cityId',
            label: 'City',
            placeholder: 'All cities',
            value: cityId,
            options: buildOptions(
              hotels
                .filter((hotel) => hotel.cityId)
                .map((hotel) => ({
                  value: hotel.cityId as string,
                  label: hotel.city,
                })),
            ),
            resetKeys: ['hotelId', 'contractId', 'roomCategoryId'],
          },
          {
            key: 'hotelId',
            label: 'Hotel',
            placeholder: 'All hotels',
            value: hotelId,
            options: buildOptions(availableHotels.map((hotel) => ({ value: hotel.id, label: hotel.name }))),
            resetKeys: ['contractId', 'roomCategoryId'],
          },
          {
            key: 'contractId',
            label: 'Contract',
            placeholder: 'All contracts',
            value: contractId,
            options: buildOptions(availableContracts.map((contract) => ({ value: contract.id, label: `${contract.hotel.name} - ${contract.name}` }))),
          },
          {
            key: 'validity',
            label: 'Validity',
            placeholder: 'All validity ranges',
            value: validity,
            options: buildOptions(contracts.map((contract) => ({ value: getValidityKey(contract), label: formatDateRange(contract.validFrom, contract.validTo) }))),
            advanced: true,
          },
          {
            key: 'roomCategoryId',
            label: 'Room Category',
            placeholder: 'All room categories',
            value: roomCategoryId,
            options: buildOptions(availableRoomCategories),
            advanced: true,
          },
          {
            key: 'mealPlan',
            label: 'Meal Plan',
            placeholder: 'All meal plans',
            value: mealPlan,
            options: MEAL_PLANS.map((code) => ({ value: code, label: code })),
            advanced: true,
          },
          {
            key: 'activeState',
            label: 'Active state',
            placeholder: 'All states',
            value: activeState,
            options: [
              { value: 'active', label: 'Active/current or upcoming' },
              { value: 'inactive', label: 'Inactive/expired' },
            ],
            advanced: true,
          },
          {
            key: 'status',
            label: 'Contract status',
            placeholder: 'All statuses',
            value: status,
            options: [
              { value: 'current', label: 'Current' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'expired', label: 'Expired' },
            ],
            advanced: true,
          },
        ]}
        advancedTitle="Workbook scope"
        advancedDescription="Use advanced filters for validity, room category, meal plan, and active state without changing the underlying rate data."
      />

      <SummaryStrip
        items={[
          { id: 'contracts', label: 'Contracts', value: String(availableContracts.length), helper: 'Workbook scope' },
          { id: 'rows', label: 'Workbook rows', value: String(workbookRows.length), helper: 'Rate lines staged' },
          { id: 'supplements', label: 'Supplements', value: String(supplementCount), helper: 'Contract extras referenced' },
          { id: 'child-policies', label: 'Child policies', value: String(childPolicyCount), helper: 'Contracts configured' },
        ]}
      />

      {workbookRows.length === 0 ? (
        <p className="empty-state">No hotel tariff rows match the selected filters.</p>
      ) : (
        <HotelTariffWorkbookGrid rows={workbookRows} />
      )}
    </div>
  );
}
