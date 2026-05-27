'use client';

import { RoomCategoriesManager, type RoomCategorySummary } from '../hotel-room-categories/RoomCategoriesManager';

// Wraps the manager with mock data + zero page-level wrappers. If
// the manager freezes here, the runaway is inside the manager (not
// the /hotels page's hot containers). If it renders cleanly, the
// freeze is in one of the wrappers we stripped:
//
//   - WorkspaceShell
//   - SummaryStrip
//   - ModuleSwitcher (uses useSearchParams)
//   - HotelsDirectoryErrorBoundary
//   - HotelsPerfDebugPanel (always mounted on /hotels)
//   - TableSectionShell
//   - RoomCategoriesIsolationLadder (anchors + FormSafeToggleLink)

function buildFixture(size: number): {
  hotels: Array<{ id: string; name: string; city: string }>;
  summary: RoomCategorySummary[];
} {
  const hotels = [
    { id: 'h-1', name: 'Mock Hilton', city: 'Amman' },
    { id: 'h-2', name: 'Mock Movenpick', city: 'Petra' },
  ];
  const summary: RoomCategorySummary[] = Array.from({ length: size }, (_, i) => ({
    id: `mock-cat-${i}`,
    hotelId: i % 2 === 0 ? 'h-1' : 'h-2',
    name: `Mock Category ${i + 1}`,
    code: `MC${i + 1}`,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    hotelName: i % 2 === 0 ? 'Mock Hilton' : 'Mock Movenpick',
    hotelCity: i % 2 === 0 ? 'Amman' : 'Petra',
    hotelContractCount: 1,
    linkedRateCount: 4 + i,
    linkedQuoteItemCount: i,
  }));
  return { hotels, summary };
}

export function RoomCategoriesDebugIsland({ fixtureSize }: { fixtureSize: number }) {
  const { hotels, summary } = buildFixture(fixtureSize);
  return (
    <section data-testid="room-categories-debug-island" style={{ marginTop: '1rem' }}>
      <p style={{ fontSize: '0.78rem', color: '#475467', margin: '0 0 0.5rem' }}>
        Manager mounted with {summary.length} mock rows. NO TableSectionShell, NO isolation
        ladder, NO HotelsPerfDebugPanel, NO WorkspaceShell.
      </p>
      <RoomCategoriesManager
        apiBaseUrl="/api"
        hotels={hotels}
        initialSummary={summary}
        isolationMode="full"
      />
    </section>
  );
}
