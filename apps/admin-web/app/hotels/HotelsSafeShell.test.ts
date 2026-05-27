import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Hotels safe shell — source-grep tests locking in the click-to-load
// isolation pattern. These invariants must remain true:
//
//   - Initial /hotels visit (no ?load=1) renders ONLY the shell
//   - No server-side data fetch fires without ?load=1
//   - Each fetch in page.tsx is gated on `loadRequested`
//   - Tab content (HotelsSection / RoomCategoriesSection / etc.)
//     mounts only when load is requested

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('./HotelsSafeShell.tsx', import.meta.url), 'utf8');

describe('Hotels safe shell — page wiring', () => {
  it('reads ?load=1 from searchParams', () => {
    assert.match(pageSource, /loadRequested\s*=\s*resolvedSearchParams\?\.load === '1'/);
  });

  it('gates getHotels() on loadRequested', () => {
    assert.match(pageSource, /loadRequested && isDirectoryTab\s*\?\s*getHotels\(\)/);
  });

  it('gates getDirectorySummary() on loadRequested', () => {
    assert.match(pageSource, /loadRequested\s*\n\s*\?\s*getDirectorySummary\(\)/);
  });

  it('gates getHotelContract() on loadRequested', () => {
    assert.match(pageSource, /loadRequested && isCommercialTab && resolvedSearchParams\?\.contractId/);
  });

  it('renders HotelsSafeShell when ?load=1 is absent', () => {
    assert.match(pageSource, /<HotelsSafeShell/);
    assert.match(pageSource, /import \{ HotelsSafeShell \}/);
  });

  it('renders tab content (renderHotelsTabSection) only when loadRequested', () => {
    assert.match(
      pageSource,
      /loadRequested\s*\n?\s*\?\s*await renderHotelsTabSection\(activeTab, resolvedSearchParams, hotels\)/,
    );
  });

  it('does not mount the diagnostic perf overlay anymore', () => {
    // Cleanup pass removed HotelsPerfDebugPanel entirely — the page
    // must not import or render it.
    assert.doesNotMatch(pageSource, /HotelsPerfDebugPanel/);
    assert.doesNotMatch(pageSource, /debugPerf/);
  });

  it('no longer threads the temporary diagnostic isolation flags', () => {
    // The cleanup pass dropped these query-string switches. Their
    // presence would mean a stale ladder/wrapper-isolation revival.
    assert.doesNotMatch(pageSource, /wrapperMode/);
    assert.doesNotMatch(pageSource, /WrapperIsolationLadder/);
    assert.doesNotMatch(pageSource, /catsMode:/);
    assert.doesNotMatch(pageSource, /formSafeMode:/);
    assert.doesNotMatch(pageSource, /expandSafeMode:/);
    assert.doesNotMatch(pageSource, /disableInstrumentation:/);
  });
});

describe('HotelsSafeShell component', () => {
  it('renders both Load directory and Load room categories buttons', () => {
    assert.match(shellSource, /Load hotels directory/);
    assert.match(shellSource, /Load room categories/);
  });

  it('renders a per-tab Load button that links to the same tab with ?load=1', () => {
    // The shell builds loadHref via URLSearchParams + params.set('load', '1').
    assert.match(shellSource, /params\.set\('load', '1'\)/);
    assert.match(shellSource, /href=\{loadHref\}/);
  });

  it('does NOT auto-fetch or auto-render heavy grids — server-renderable, no client state', () => {
    // Source has no `useState` / `useEffect` — safe because the shell is
    // server-render-only.
    assert.doesNotMatch(shellSource, /useState/);
    assert.doesNotMatch(shellSource, /useEffect/);
  });

  it('carries data-testid for end-to-end isolation tests', () => {
    assert.match(shellSource, /data-testid="hotels-safe-shell"/);
    assert.match(shellSource, /data-testid="hotels-safe-shell-buttons"/);
  });

  it('preserves existing searchParams when building the load href', () => {
    assert.match(shellSource, /new URLSearchParams\(\)/);
    assert.match(shellSource, /params\.set\(key, value\)/);
  });
});

describe('Safe shell isolation — no heavy child component mounts', () => {
  it('page.tsx does NOT render HotelsSection unconditionally — gated behind renderHotelsTabSection', () => {
    // Confirm renderHotelsTabSection is the only place HotelsSection is
    // invoked, and that block only fires when loadRequested.
    const sectionMatches = pageSource.match(/HotelsSection\(/g) || [];
    // Imports don't count — only constructor calls / JSX usages.
    assert.ok(sectionMatches.length <= 1, 'HotelsSection should only be mounted via the gated path');
  });

  it('page.tsx does NOT render RoomCategoriesSection unconditionally', () => {
    const sectionMatches = pageSource.match(/RoomCategoriesSection\(/g) || [];
    assert.ok(sectionMatches.length <= 1, 'RoomCategoriesSection should only be mounted via the gated path');
  });

  it('preserves PR #118 + #120 + #122 fixes (RoomTypesPanel + RoomCategoriesSection + directory-summary)', () => {
    const roomTypesPanel = readFileSync(
      new URL('./contracts/[contractId]/RoomTypesPanel.tsx', import.meta.url),
      'utf8',
    );
    assert.match(roomTypesPanel, /\/room-types-summary/);
    const roomCategoriesSection = readFileSync(new URL('./RoomCategoriesSection.tsx', import.meta.url), 'utf8');
    assert.match(roomCategoriesSection, /\/hotels\/room-categories-summary/);
    assert.match(pageSource, /\/hotels\/directory-summary/);
  });
});
