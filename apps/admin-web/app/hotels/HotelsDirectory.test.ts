import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Hotels Directory freeze fix — source-grep tests locking in the
// behavioural invariants of the rewritten page.tsx:
//
//   - Uses the lightweight /hotels/directory-summary endpoint for the
//     summary strip (replaces the heavy /api/hotels fetch).
//   - Only loads the full /api/hotels payload on the directory tab,
//     never on room-categories / contracts / other commercial tabs.
//   - Wraps tab content in HotelsDirectoryErrorBoundary.
//   - Shows the "Large hotel directory — showing summary cards first."
//     banner above a configurable threshold.
//   - PR #118 + PR #120 fixes remain intact (RoomTypesPanel still
//     uses its own summary; RoomCategoriesSection still uses its own
//     summary).

describe('Hotels page wiring', () => {
  const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

  it('uses the lightweight /hotels/directory-summary endpoint for the strip', () => {
    assert.match(pageSource, /\/hotels\/directory-summary/);
    assert.match(pageSource, /async function getDirectorySummary/);
  });

  it('only calls the heavy getHotels() when the directory tab is active', () => {
    // The fix conditionally fetches based on isDirectoryTab.
    assert.match(pageSource, /isDirectoryTab\s*=\s*activeTab === 'hotels'/);
    assert.match(pageSource, /isDirectoryTab\s*\?\s*getHotels\(\)/);
  });

  it('derives summary-strip counts from the lightweight summary (not hotels[].roomCategories)', () => {
    assert.match(pageSource, /hotelDirectoryCount\s*=\s*directorySummary\.length/);
    assert.match(pageSource, /roomCategoryCount\s*=\s*directorySummary\.reduce/);
    assert.match(pageSource, /contractedHotelCount\s*=\s*directorySummary\.filter/);
  });

  it('shows the safe-mode banner with the spec-mandated copy when directory is large', () => {
    assert.match(pageSource, /Large hotel directory — showing summary cards first\./);
    assert.match(pageSource, /HOTELS_DIRECTORY_SAFE_MODE_THRESHOLD\s*=\s*50/);
  });

  it('wraps the active tab body in HotelsDirectoryErrorBoundary', () => {
    assert.match(pageSource, /import \{ HotelsDirectoryErrorBoundary \}/);
    assert.match(pageSource, /<HotelsDirectoryErrorBoundary tabLabel=/);
  });

  it('preserves PR #120 — RoomCategoriesSection is still rendered for room-categories tab', () => {
    assert.match(pageSource, /activeTab === 'room-categories'.*RoomCategoriesSection/s);
  });
});

describe('HotelsDirectoryErrorBoundary — class-based fallback', () => {
  const boundarySource = readFileSync(
    new URL('./HotelsDirectoryErrorBoundary.tsx', import.meta.url),
    'utf8',
  );

  it('extends Component with the React error-boundary lifecycle hooks', () => {
    assert.match(boundarySource, /extends Component<Props, State>/);
    assert.match(boundarySource, /static getDerivedStateFromError/);
    assert.match(boundarySource, /componentDidCatch/);
  });

  it('renders a retry button (not a frozen page) on render failure', () => {
    assert.match(boundarySource, /Retry tab/);
    assert.match(boundarySource, /role="alert"/);
  });

  it('logs diagnostics to console.error', () => {
    assert.match(boundarySource, /console\.error\('\[hotels-directory-error-boundary\]/);
  });
});

describe('Hotels Directory does not re-introduce previous freezes', () => {
  it('PR #118 RoomTypesPanel still uses /room-types-summary', () => {
    const roomTypesPanel = readFileSync(
      new URL('./contracts/[contractId]/RoomTypesPanel.tsx', import.meta.url),
      'utf8',
    );
    assert.match(roomTypesPanel, /\/room-types-summary/);
  });

  it('PR #120 RoomCategoriesSection still uses /room-categories-summary', () => {
    const sectionSource = readFileSync(new URL('./RoomCategoriesSection.tsx', import.meta.url), 'utf8');
    assert.match(sectionSource, /\/hotels\/room-categories-summary/);
  });

  it('page.tsx no longer hydrates roomCategories[] arrays in the strip computations', () => {
    const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
    // The OLD code had `hotels.reduce((sum, hotel) => sum + hotel.roomCategories.length, 0)`.
    // The fix derives the count from the directory summary instead.
    assert.doesNotMatch(pageSource, /hotels\.reduce\(\(sum, hotel\) => sum \+ hotel\.roomCategories\.length/);
    assert.doesNotMatch(pageSource, /hotels\.reduce\(\(sum, hotel\) => sum \+ hotel\.roomCategories\.filter/);
  });
});
