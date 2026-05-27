import { adminPageFetchJson } from '../lib/admin-server';
import { TableSectionShell } from '../components/TableSectionShell';
import { RoomCategoriesManager, type RoomCategorySummary } from '../hotel-room-categories/RoomCategoriesManager';

// Hotel Master Room Categories.
//
// Loads via the lightweight /hotels/room-categories-summary endpoint
// (one row per category, no nested rates/contracts) so switching to
// this tab never triggers the heavy N+1 supplier resolver path.
// Per-category detail loads lazily when the operator expands a row.

const API_BASE_URL = '/api';

async function getRoomCategoriesSummary(hotelId?: string): Promise<RoomCategorySummary[]> {
  const url = hotelId
    ? `${API_BASE_URL}/hotels/room-categories-summary?hotelId=${encodeURIComponent(hotelId)}`
    : `${API_BASE_URL}/hotels/room-categories-summary`;
  return adminPageFetchJson<RoomCategorySummary[]>(url, 'Room categories summary', {
    cache: 'no-store',
  });
}

// Minimal list of (hotel id, name, city) tuples for the "add room
// category" form dropdown. Built from the summary rows so we never
// hit the heavy /api/hotels list endpoint.
function collectHotelOptions(summary: RoomCategorySummary[]) {
  const byId = new Map<string, { id: string; name: string; city: string }>();
  for (const row of summary) {
    if (!byId.has(row.hotelId)) {
      byId.set(row.hotelId, { id: row.hotelId, name: row.hotelName, city: row.hotelCity });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

type RoomCategoriesSectionProps = {
  hotelId?: string;
};

export async function RoomCategoriesSection({ hotelId }: RoomCategoriesSectionProps = {}) {
  const summary = await getRoomCategoriesSummary(hotelId);
  const hotels = collectHotelOptions(summary);
  const activeCount = summary.filter((row) => row.isActive).length;

  return (
    <TableSectionShell
      title="Room Category Setup"
      description="Define sellable room categories per hotel so contracts and rates can reference structured room inventory."
      context={
        <p>
          {summary.length} room categories in scope &middot; {activeCount} active &middot;
          {' '}
          {hotels.length} hotel{hotels.length === 1 ? '' : 's'}
        </p>
      }
    >
      <RoomCategoriesManager
        apiBaseUrl={API_BASE_URL}
        hotels={hotels}
        initialSummary={summary}
      />
    </TableSectionShell>
  );
}
