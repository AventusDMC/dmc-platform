import { CityOption } from '../lib/cities';
import { HotelCategoryOption } from '../lib/hotelCategories';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
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

type HotelsSectionFilters = {
  cityId?: string;
  hotelId?: string;
  roomCategoryId?: string;
  status?: string;
};

type HotelsSectionProps = {
  filters?: HotelsSectionFilters;
  initialHotels?: Hotel[];
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

function buildOptions(entries: Array<{ value: string; label: string }>): QueryDropdownFilterOption[] {
  return entries.sort((left, right) => left.label.localeCompare(right.label));
}

function getHotelStatus(hotel: Hotel): HotelDirectoryStatus {
  return hotel._count.contracts > 0 ? 'current' : 'uncontracted';
}

function getHotelStatusLabel(status: HotelDirectoryStatus) {
  if (status === 'current') return 'Contracted';
  if (status === 'upcoming') return 'Upcoming contract';
  if (status === 'expired') return 'Expired only';
  return 'Uncontracted';
}

export async function HotelsSection({ filters, initialHotels }: HotelsSectionProps) {
  const [hotels, cities, hotelCategories] = await Promise.all([
    initialHotels
      ? Promise.resolve(initialHotels)
      : getHotels().catch((error) => {
          if (isNextRedirectError(error)) {
            throw error;
          }

          console.error('[hotels] hotel directory unavailable', error);
          return [] as Hotel[];
        }),
    getCities().catch((error) => {
      if (isNextRedirectError(error)) {
        throw error;
      }

      console.error('[hotels] city filters unavailable', error);
      return [] as CityOption[];
    }),
    getHotelCategories().catch((error) => {
      if (isNextRedirectError(error)) {
        throw error;
      }

      console.error('[hotels] hotel category filters unavailable', error);
      return [] as HotelCategoryOption[];
    }),
  ]);
  const cityId = filters?.cityId || '';
  const hotelId = filters?.hotelId || '';
  const roomCategoryId = filters?.roomCategoryId || '';
  const status = filters?.status || '';
  const hotelsForSelectedCity = cityId ? hotels.filter((hotel) => hotel.cityId === cityId) : hotels;
  const availableHotels = cityId ? hotelsForSelectedCity : hotels;
  const availableRoomCategories = hotels
    .filter((hotel) => {
      if (hotelId) {
        return hotel.id === hotelId;
      }

      if (cityId) {
        return hotel.cityId === cityId;
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

    if (roomCategoryId && !(hotel.roomCategories || []).some((roomCategory) => roomCategory.id === roomCategoryId)) {
      return false;
    }

    if (status && getHotelStatus(hotel) !== status) {
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
            resetKeys: ['hotelId', 'roomCategoryId'],
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
            resetKeys: ['roomCategoryId'],
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
              statusLabel: getHotelStatusLabel(getHotelStatus(hotel)),
              contracts: [],
              rates: [],
            }))}
          />
        ) : null}
      </TableSectionShell>
    </div>
  );
}
