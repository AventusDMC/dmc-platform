import { adminPageFetchJson } from '../lib/admin-server';
import { TableSectionShell } from '../components/TableSectionShell';
import { RoomCategoriesManager, type RoomCategorySummary } from '../hotel-room-categories/RoomCategoriesManager';

// Hotel Master Room Categories freeze fix.
//
// The previous version of this section fetched the full hotels list
// a SECOND time (duplicating the call that the parent page already
// made for the summary strip). On top of that, the heavy hotels list
// endpoint serializes every hotel through resolveOperationalSupplier
// which fans out to a per-hotel supplier lookup. With more than ~20
// hotels the duplicate fetch + N+1 supplier resolution chain produced
// the "Page Unresponsive" symptom.
//
// We now hit a dedicated lightweight summary endpoint that returns
// only what the tab needs (no supplier resolution, no contract blob,
// no rate matrix). The cross-hotel listing renders from the summary;
// per-category detail loads on demand when an operator expands a row.

const API_BASE_URL = '/api';

async function getRoomCategoriesSummary(hotelId?: string): Promise<RoomCategorySummary[]> {
  const url = hotelId
    ? `${API_BASE_URL}/hotels/room-categories-summary?hotelId=${encodeURIComponent(hotelId)}`
    : `${API_BASE_URL}/hotels/room-categories-summary`;
  return adminPageFetchJson<RoomCategorySummary[]>(url, 'Room categories summary', {
    cache: 'no-store',
  });
}

// Companion fetch — minimal list of (hotel id, name) tuples used by
// the "add room category" form's dropdown. Comes from the summary too
// (we already have hotel name + id on each row) so the page never
// calls the heavy hotels list endpoint a second time.
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
      <RoomCategoriesManager apiBaseUrl={API_BASE_URL} hotels={hotels} initialSummary={summary} />
    </TableSectionShell>
  );
}
