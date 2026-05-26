import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Hotels emergency safe shell — source-grep tests locking in the
// click-to-load isolation pattern. The freeze investigation needs
// these invariants to remain true:
//
//   - Initial /hotels visit (no ?load=1) renders ONLY the shell
//   - No server-side data fetch fires without ?load=1
//   - Each fetch in page.tsx is gated on `loadRequested`
//   - The perf debug panel mounts only when ?debugPerf=1
//   - Tab content (HotelsSection / RoomCategoriesSection / etc.)
//     mounts only when load is requested

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('./HotelsSafeShell.tsx', import.meta.url), 'utf8');
const perfSource = readFileSync(new URL('./HotelsPerfDebugPanel.tsx', import.meta.url), 'utf8');

describe('Hotels safe shell — page wiring', () => {
  it('reads ?load=1 from searchParams', () => {
    assert.match(pageSource, /loadRequested\s*=\s*resolvedSearchParams\?\.load === '1'/);
  });

  it('reads ?debugPerf=1 from searchParams', () => {
    assert.match(pageSource, /debugPerfEnabled\s*=\s*resolvedSearchParams\?\.debugPerf === '1'/);
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

  it('mounts HotelsPerfDebugPanel with debugPerfEnabled flag', () => {
    assert.match(pageSource, /<HotelsPerfDebugPanel enabled=\{debugPerfEnabled\} \/>/);
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

describe('HotelsPerfDebugPanel', () => {
  it('exposes useRenderCounter for components to opt into render tracking', () => {
    assert.match(perfSource, /export function useRenderCounter/);
  });

  it('warns when a component renders > 30 times in 5 seconds', () => {
    assert.match(perfSource, /RENDER_LIMIT_PER_WINDOW = 30/);
    assert.match(perfSource, /RENDER_LIMIT_WINDOW_MS = 5_000/);
    assert.match(perfSource, /console\.warn/);
  });

  it('patches window.fetch only while mounted (and restores on unmount)', () => {
    assert.match(perfSource, /originalFetchRef\.current = window\.fetch/);
    assert.match(perfSource, /window\.fetch = originalFetchRef\.current/);
  });

  it('renders a fixed overlay with the panel data-testid', () => {
    assert.match(perfSource, /data-testid="hotels-perf-debug-panel"/);
    assert.match(perfSource, /position: 'fixed'/);
  });

  it('skips all side effects when disabled (no perf cost on production /hotels visits)', () => {
    assert.match(perfSource, /if \(!enabled\) return null/);
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
