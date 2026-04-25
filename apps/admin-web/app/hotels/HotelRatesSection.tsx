import { adminPageFetchJson } from '../lib/admin-server';
import { QueryDropdownFilters, type QueryDropdownFilterOption } from '../components/QueryDropdownFilters';
import { HotelContractRatesSection } from '../hotel-rates/HotelContractRatesSection';

const API_BASE_URL = '/api';

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
  contract: {
    name: string;
    hotel: {
      name: string;
    };
  };
};

type Season = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

async function getHotels(): Promise<Hotel[]> {
  return adminPageFetchJson<Hotel[]>(`${API_BASE_URL}/hotels`, 'Hotel rates hotels', {
    cache: 'no-store',
  });
}

async function getHotelContracts(): Promise<HotelContract[]> {
  return adminPageFetchJson<HotelContract[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotel rates contracts', {
    cache: 'no-store',
  });
}

async function getHotelRates(): Promise<HotelRate[]> {
  return adminPageFetchJson<HotelRate[]>(`${API_BASE_URL}/hotel-rates`, 'Hotel rates list', {
    cache: 'no-store',
  });
}

async function getSeasons(): Promise<Season[]> {
  return adminPageFetchJson<Season[]>(`${API_BASE_URL}/seasons`, 'Hotel rates seasons', {
    cache: 'no-store',
  });
}

type HotelRatesSectionProps = {
  contractId?: string;
  filters?: {
    cityId?: string;
    hotelId?: string;
    contractId?: string;
    roomCategoryId?: string;
    mealPlan?: string;
    status?: string;
  };
};

function buildOptions(entries: Array<{ value: string; label: string }>): QueryDropdownFilterOption[] {
  return entries.sort((left, right) => left.label.localeCompare(right.label));
}

function getContractStatus(validFrom: string, validTo: string) {
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

export async function HotelRatesSection({ contractId, filters }: HotelRatesSectionProps) {
  const [hotels, contracts, hotelRates, seasons] = await Promise.all([getHotels(), getHotelContracts(), getHotelRates(), getSeasons()]);
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const ratesByContractId = new Map<string, HotelRate[]>();
  const cityId = filters?.cityId || '';
  const hotelId = filters?.hotelId || '';
  const selectedContractId = filters?.contractId || contractId || '';
  const roomCategoryId = filters?.roomCategoryId || '';
  const mealPlan = filters?.mealPlan || '';
  const status = filters?.status || '';

  for (const rate of hotelRates) {
    const currentRates = ratesByContractId.get(rate.contractId) || [];
    currentRates.push(rate);
    ratesByContractId.set(rate.contractId, currentRates);
  }

  const availableHotels = hotels.filter((hotel) => (cityId ? hotel.cityId === cityId : true));
  const availableContracts = contracts.filter((contract) => {
    if (selectedContractId && contract.id !== selectedContractId) {
      return false;
    }

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

      if (selectedContractId) {
        return hotel.id === contracts.find((contract) => contract.id === selectedContractId)?.hotel.id;
      }

      if (cityId) {
        return hotel.cityId === cityId;
      }

      return true;
    })
    .flatMap((hotel) =>
      hotel.roomCategories
        .filter((category) => category.isActive)
        .map((category) => ({
          value: category.id,
          label: `${category.name}${category.code ? ` (${category.code})` : ''}`,
        })),
    );
  const visibleContracts = contracts.filter((contract) => {
    if (selectedContractId && contract.id !== selectedContractId) {
      return false;
    }

    if (hotelId && contract.hotel.id !== hotelId) {
      return false;
    }

    if (cityId) {
      const contractHotel = hotels.find((hotel) => hotel.id === contract.hotel.id);
      if (!contractHotel || contractHotel.cityId !== cityId) {
        return false;
      }
    }

    if (status && getContractStatus(contract.validFrom, contract.validTo) !== status) {
      return false;
    }

    const contractRates = ratesByContractId.get(contract.id) || [];

    if (roomCategoryId && !contractRates.some((rate) => rate.roomCategoryId === roomCategoryId)) {
      return false;
    }

    if (mealPlan && !contractRates.some((rate) => rate.mealPlan === mealPlan)) {
      return false;
    }

    return true;
  });

  return (
    <div className="section-stack">
      <QueryDropdownFilters
        eyebrow="Rate filters"
        title="Hotel rate filters"
        description="Filter the pricing matrix by location and commercial scope first, then open advanced filters for room, meal plan, and contract status."
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
                }))
                .filter((entry, index, collection) => collection.findIndex((current) => current.value === entry.value) === index),
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
            value: selectedContractId,
            options: buildOptions(
              availableContracts.map((contract) => ({
                value: contract.id,
                label: `${contract.hotel.name} - ${contract.name}`,
              })),
            ),
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
            options: [
              { value: 'RO', label: 'RO' },
              { value: 'BB', label: 'BB' },
              { value: 'HB', label: 'HB' },
              { value: 'FB', label: 'FB' },
              { value: 'AI', label: 'AI' },
            ],
            advanced: true,
          },
          {
            key: 'status',
            label: 'Status',
            placeholder: 'All statuses',
            value: status,
            options: [
              { value: 'current', label: 'Current contract' },
              { value: 'upcoming', label: 'Upcoming contract' },
              { value: 'expired', label: 'Expired contract' },
            ],
            advanced: true,
          },
        ]}
        advancedTitle="More rate filters"
        advancedDescription="Keep room category, meal plan, and contract lifecycle filters separate from the primary quick filters."
      />

      <div className="detail-card">
        <h2>Rate Matrix</h2>
        <p className="detail-copy">
          Review contract pricing by contract, room category, occupancy, and meal plan without leaving the Hotels workspace.
        </p>
      </div>

      {visibleContracts.length === 0 ? (
        <p className="empty-state">
          {contractId ? 'No matching hotel contract was found for this rate view.' : 'No hotels yet. Create a hotel before adding contracts and rates.'}
        </p>
      ) : (
        <div className="entity-list allotment-table-stack">
          {visibleContracts.map((contract) => {
            const contractRates = (ratesByContractId.get(contract.id) || []).filter((rate) => {
              if (roomCategoryId && rate.roomCategoryId !== roomCategoryId) {
                return false;
              }

              if (mealPlan && rate.mealPlan !== mealPlan) {
                return false;
              }

              return true;
            });

            return (
              <HotelContractRatesSection
                key={contract.id}
                apiBaseUrl="/api"
                contract={contract}
                contractRates={contractRates}
                contracts={contracts}
                hotels={hotels}
                seasons={seasons}
                seasonByIdEntries={Array.from(seasonById.entries())}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
