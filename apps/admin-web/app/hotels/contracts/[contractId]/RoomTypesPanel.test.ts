import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Room Types freeze fix — behavioural source-grep tests for the
// expandable Room Types panel + the workspace wiring + the API endpoint.
//
// Why source-grep: the admin-web test runner does not currently host
// a React DOM (no @testing-library/react in this monorepo). Source-grep
// + integration tests on the backend service is the established pattern
// across this codebase (admin-nav.test, hotel-contract-display.test,
// quotes-guided-hotels.test). So we lock in behavioural invariants as
// assertions on the file source.

describe('RoomTypesPanel — lazy load contract', () => {
  const panelSource = readFileSync(
    new URL('./RoomTypesPanel.tsx', import.meta.url),
    'utf8',
  );

  it('does NOT fetch the full contract blob on initial tab open', () => {
    // The panel must only ever hit /room-types-summary on mount. The
    // heavy GET /hotel-contracts/:id (full include) must never appear.
    assert.match(panelSource, /\/room-types-summary/);
    // Negative: no full-contract fetch (would be the heavy GET that
    // pulls allotments + supplements + cancellation rules + rates).
    assert.doesNotMatch(panelSource, /fetch\([^)]*\/hotel-contracts\/[^/]*['`]\s*[,)]/);
    // Negative: no ?summary=1 either — that's the page-level loader's
    // path; the panel sits underneath it.
    assert.doesNotMatch(panelSource, /\?summary=1/);
  });

  it('only fetches per-room rate detail when the operator expands a room', () => {
    // toggleRoom is the only path that hits /hotel-rates, and it does
    // so with BOTH contractId AND roomCategoryId narrowing the query.
    assert.match(panelSource, /async function defaultFetchRoomRates/);
    assert.match(panelSource, /\/hotel-rates\?contractId=\$\{encodeURIComponent\(contractId\)\}&roomCategoryId=\$\{encodeURIComponent\(roomCategoryId\)\}/);
    assert.match(panelSource, /limit=50&offset=0/);
  });

  it('uses AbortController so a tab switch cancels stale fetches (no infinite loop)', () => {
    assert.match(panelSource, /new AbortController\(\)/);
    assert.match(panelSource, /return \(\) => controller\.abort\(\)/);
    // Guards against the React 18 "set state after unmount" warning
    // that historically masked real fetch loops.
    assert.match(panelSource, /if \(signal\.aborted\) return/);
  });

  it('useEffect deps array is stable — guards against infinite render loops', () => {
    // The load-summary effect depends only on the memoized loadSummary
    // callback. loadSummary's own deps are [apiBaseUrl, contractId] —
    // both stable per contract. No state in deps that the effect itself
    // sets.
    assert.match(panelSource, /useEffect\(\(\) => \{[\s\S]+?return \(\) => controller\.abort\(\);\s*\}, \[loadSummary\]\)/);
    // Detail fetcher refs use the ref-pattern so parent identity changes
    // don't retrigger the effect.
    assert.match(panelSource, /summaryFetcherRef\.current = fetchSummary/);
    assert.match(panelSource, /detailFetcherRef\.current = fetchRoomRates/);
  });

  it('renders summary counts (rates / occupancy / meal plans / supplements) without leaking individual rate rows', () => {
    // The rendered JSX surfaces room.rateCount + room.occupancyTypes
    // + room.mealPlans + room.supplementCount — never iterates over the
    // detailed rate matrix in the summary view.
    assert.match(panelSource, /\{room\.rateCount\} rates/);
    assert.match(panelSource, /room\.occupancyTypes\.join/);
    assert.match(panelSource, /room\.mealPlans\.join/);
    assert.match(panelSource, /room\.supplementCount/);
    // Detail rate table only renders inside the expanded branch (`isExpanded`).
    assert.match(panelSource, /\{isExpanded \? \(/);
  });

  it('Large-contract banner copy matches spec ("Large contract — showing summary first.")', () => {
    assert.match(panelSource, /Large contract — showing summary first\./);
  });
});

describe('ContractTabErrorBoundary — friendly fallback on render failure', () => {
  const boundarySource = readFileSync(
    new URL('./ContractTabErrorBoundary.tsx', import.meta.url),
    'utf8',
  );

  it('extends class Component with getDerivedStateFromError + componentDidCatch', () => {
    assert.match(boundarySource, /extends Component<Props, State>/);
    assert.match(boundarySource, /static getDerivedStateFromError/);
    assert.match(boundarySource, /componentDidCatch/);
  });

  it('renders a retry button rather than freezing the page', () => {
    assert.match(boundarySource, /onClick=\{this\.handleReset\}/);
    assert.match(boundarySource, /Retry tab/);
    assert.match(boundarySource, /role="alert"/);
  });

  it('logs error diagnostics to console (developer trace) but shows user-friendly message', () => {
    assert.match(boundarySource, /console\.error\('\[contract-tab-error-boundary\]/);
    assert.match(boundarySource, /could not render/);
  });
});

describe('Hotel rates findAll filters by roomCategoryId (scoped detail load)', () => {
  const controllerSource = readFileSync(
    new URL('../../../../../api/src/hotel-rates/hotel-rates.controller.ts', import.meta.url),
    'utf8',
  );
  const serviceSource = readFileSync(
    new URL('../../../../../api/src/hotel-rates/hotel-rates.service.ts', import.meta.url),
    'utf8',
  );

  it('controller accepts roomCategoryId query param', () => {
    assert.match(controllerSource, /@Query\('roomCategoryId'\) roomCategoryId\?: string/);
    assert.match(controllerSource, /roomCategoryId: roomCategoryId \|\| null/);
  });

  it('service narrows the Prisma where clause when roomCategoryId is supplied', () => {
    assert.match(serviceSource, /if \(options\.roomCategoryId\) where\.roomCategoryId = options\.roomCategoryId/);
  });
});
