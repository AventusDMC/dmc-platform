import { CityOption } from '../lib/cities';
import { HotelCategoryOption } from '../lib/hotelCategories';
import { adminPageFetchJson } from '../lib/admin-server';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { QueryDropdownFilters, type QueryDropdownFilterOption } from '../components/QueryDropdownFilters';
import { TableSectionShell } from '../components/TableSectionShell';
import { HotelsCatalogBrowser } from './HotelsCatalogBrowser';
import { HotelsForm } from './HotelsForm';

const API_BASE_URL = '/api';

type Hotel = {
  id: string;
  name: string;
  cityId: string | null;
  city: string;
  hotelCategoryId: string | null;
  category: string;
  supplierId: string;
  cityRecord: CityOption | null;
  hotelCategory: HotelCategoryOption | null;
  roomCategories?: Array<{
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  }>;
  _count: {
    contracts: number;
  };
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
  };
};

type HotelRate = {
  id: string;
  contractId: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | null;
  currency: string;
  cost: number;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  };
};

type HotelsSectionFilters = {
  cityId?: string;
  hotelId?: string;
  contractId?: string;
  roomCategoryId?: string;
  status?: string;
};

type HotelsSectionProps = {
  filters?: HotelsSectionFilters;
};

type HotelDirectoryStatus = 'current' | 'upcoming' | 'expired' | 'uncontracted';

async function getHotels(): Promise<Hotel[]> {
  return adminPageFetchJson<Hotel[]>(`${API_BASE_URL}/hotels`, 'Hotels section hotels', {
    cache: 'no-store',
  });
}

async function getCities(): Promise<CityOption[]> {
  return adminPageFetchJson<CityOption[]>(`${API_BASE_URL}/cities?active=true`, 'Hotels section active cities', {
    cache: 'no-store',
  });
}

async function getHotelCategories(): Promise<HotelCategoryOption[]> {
  return adminPageFetchJson<HotelCategoryOption[]>(`${API_BASE_URL}/hotel-categories?active=true`, 'Hotels section active categories', {
    cache: 'no-store',
  });
}

async function getHotelContracts(): Promise<HotelContract[]> {
  return adminPageFetchJson<HotelContract[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotels section contracts', {
    cache: 'no-store',
  });
}

async function getHotelRates(): Promise<HotelRate[]> {
  return adminPageFetchJson<HotelRate[]>(`${API_BASE_URL}/hotel-rates`, 'Hotels section rates', {
    cache: 'no-store',
  });
}

function buildOptions(entries: Array<{ value: string; label: string }>): QueryDropdownFilterOption[] {
  return entries.sort((left, right) => left.label.localeCompare(right.label));
}

function getContractLifecycleStatus(validFrom: string, validTo: string): Exclude<HotelDirectoryStatus, 'uncontracted'> {
  const today = new Date();
  const start = new Date(validFrom);
  const end = new Date(validTo);

  if (start <= today && end >= today) {
    return 'current';
  }

  if (start > today) {
    return 'upcoming';
  }

  return 'expired';
}

function getHotelStatus(hotelId: string, contractsByHotelId: Map<string, HotelContract[]>): HotelDirectoryStatus {
  const contracts = contractsByHotelId.get(hotelId) || [];

  if (contracts.length === 0) {
    return 'uncontracted';
  }

  const statuses = contracts.map((contract) => getContractLifecycleStatus(contract.validFrom, contract.validTo));

  if (statuses.includes('current')) {
    return 'current';
  }

  if (statuses.includes('upcoming')) {
    return 'upcoming';
  }

  return 'expired';
}

function getHotelStatusLabel(status: HotelDirectoryStatus) {
  if (status === 'current') return 'Current contract';
  if (status === 'upcoming') return 'Upcoming contract';
  if (status === 'expired') return 'Expired only';
  return 'Uncontracted';
}

export async function HotelsSection({ filters }: HotelsSectionProps) {
  const [hotels, cities, hotelCategories, contracts, hotelRates] = await Promise.all([
    getHotels(),
    getCities(),
    getHotelCategories(),
    getHotelContracts(),
    getHotelRates(),
  ]);
  const contractsByHotelId = contracts.reduce<Map<string, HotelContract[]>>((summary, contract) => {
    const current = summary.get(contract.hotel.id) || [];
    current.push(contract);
    summary.set(contract.hotel.id, current);
    return summary;
  }, new Map<string, HotelContract[]>());
  const cityId = filters?.cityId || '';
  const hotelId = filters?.hotelId || '';
  const contractId = filters?.contractId || '';
  const roomCategoryId = filters?.roomCategoryId || '';
  const status = filters?.status || '';
  const hotelsForSelectedCity = cityId ? hotels.filter((hotel) => hotel.cityId === cityId) : hotels;
  const hotelsForSelectedContract = contractId
    ? hotels.filter((hotel) => (contractsByHotelId.get(hotel.id) || []).some((contract) => contract.id === contractId))
    : hotelsForSelectedCity;
  const availableHotels = cityId || contractId ? hotelsForSelectedContract : hotels;
  const availableContracts = contracts.filter((contract) => {
    if (hotelId && contract.hotel.id !== hotelId) {
      return false;
    }

    if (cityId) {
      const contractHotel = hotels.find((hotel) => hotel.id === contract.hotel.id);
      if (!contractHotel || contractHotel.cityId !== cityId) {
        return false;
      }
    }

    return true;
  });
  const availableRoomCategories = hotels
    .filter((hotel) => {
      if (hotelId) {
        return hotel.id === hotelId;
      }

      if (cityId) {
        return hotel.cityId === cityId;
      }

      if (contractId) {
        return (contractsByHotelId.get(hotel.id) || []).some((contract) => contract.id === contractId);
      }

      return true;
    })
    .flatMap((hotel) =>
      (hotel.roomCategories || []).map((category) => ({
        value: category.id,
        label: `${category.name}${category.code ? ` (${category.code})` : ''}`,
      })),
    );
  const filteredHotels = hotels.filter((hotel) => {
    if (cityId && hotel.cityId !== cityId) {
      return false;
    }

    if (hotelId && hotel.id !== hotelId) {
      return false;
    }

    if (contractId && !(contractsByHotelId.get(hotel.id) || []).some((contract) => contract.id === contractId)) {
      return false;
    }

    if (roomCategoryId && !(hotel.roomCategories || []).some((roomCategory) => roomCategory.id === roomCategoryId)) {
      return false;
    }

    if (status && getHotelStatus(hotel.id, contractsByHotelId) !== status) {
      return false;
    }

    return true;
  });

  return (
    <div className="section-stack">
      <QueryDropdownFilters
        eyebrow="Directory filters"
        title="Hotel list filters"
        description="Keep the directory compact by filtering city and hotel first, then open more filters only when you need to narrow the list further."
        filters={[
          {
            key: 'cityId',
            label: 'City',
            placeholder: 'All cities',
            value: cityId,
            options: buildOptions(
              cities.map((city) => ({
                value: city.id,
                label: city.country ? `${city.name}, ${city.country}` : city.name,
              })),
            ),
            resetKeys: ['hotelId', 'contractId', 'roomCategoryId'],
          },
          {
            key: 'hotelId',
            label: 'Hotel',
            placeholder: 'All hotels',
            value: hotelId,
            options: buildOptions(
              availableHotels.map((hotel) => ({
                value: hotel.id,
                label: hotel.name,
              })),
            ),
            resetKeys: ['contractId', 'roomCategoryId'],
          },
          {
            key: 'contractId',
            label: 'Contract',
            placeholder: 'All contracts',
            value: contractId,
            options: buildOptions(
              availableContracts.map((contract) => ({
                value: contract.id,
                label: `${contract.hotel.name} - ${contract.name}`,
              })),
            ),
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
            key: 'status',
            label: 'Status',
            placeholder: 'All statuses',
            value: status,
            options: [
              { value: 'current', label: getHotelStatusLabel('current') },
              { value: 'upcoming', label: getHotelStatusLabel('upcoming') },
              { value: 'expired', label: getHotelStatusLabel('expired') },
              { value: 'uncontracted', label: getHotelStatusLabel('uncontracted') },
            ],
            advanced: true,
          },
        ]}
        advancedTitle="More hotel filters"
        advancedDescription="Contract, room category, and lifecycle filters stay separate from the primary directory controls."
      />

      <TableSectionShell
        title="Hotel Directory"
        description="Maintain the master hotel records that contracts, room categories, and rate setup depend on."
        context={<p>{filteredHotels.length} hotels in scope</p>}
        createPanel={
          <CollapsibleCreatePanel title="Create hotel" description="Add a hotel record without leaving the Hotels workspace." triggerLabelOpen="Add hotel">
            <HotelsForm apiBaseUrl="/api" cities={cities} hotelCategories={hotelCategories} />
          </CollapsibleCreatePanel>
        }
        emptyState={filteredHotels.length === 0 ? <p className="empty-state">No hotels match the current filters.</p> : undefined}
      >
        {filteredHotels.length > 0 ? (
          <HotelsCatalogBrowser
            hotels={filteredHotels.map((hotel) => ({
              id: hotel.id,
              name: hotel.name,
              city: hotel.city,
              category: hotel.category,
              roomCategories: hotel.roomCategories,
              _count: hotel._count,
              statusLabel: getHotelStatusLabel(getHotelStatus(hotel.id, contractsByHotelId)),
              contracts: (contractsByHotelId.get(hotel.id) || []).map((contract) => ({
                id: contract.id,
                name: contract.name,
                validFrom: contract.validFrom,
                validTo: contract.validTo,
                currency: contract.currency,
              })),
              rates: hotelRates
                .filter((rate) => (contractsByHotelId.get(hotel.id) || []).some((contract) => contract.id === rate.contractId))
                .map((rate) => ({
                  id: rate.id,
                  contractId: rate.contractId,
                  seasonName: rate.seasonName,
                  roomCategoryId: rate.roomCategoryId,
                  occupancyType: rate.occupancyType,
                  mealPlan: rate.mealPlan,
                  pricingBasis: rate.pricingBasis,
                  currency: rate.currency,
                  cost: rate.cost,
                  roomCategory: rate.roomCategory,
                })),
            }))}
          />
        ) : null}
      </TableSectionShell>
    </div>
  );
}
