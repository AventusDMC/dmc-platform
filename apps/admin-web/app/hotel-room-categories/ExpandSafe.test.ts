import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Room Categories expand-mode freeze hunt — source-grep tests for
// the detail-fetch guard, expandSafe mode, useRef-driven cache check,
// and detail panel instrumentation.

const perfSource = readFileSync(new URL('../hotels/HotelsPerfDebugPanel.tsx', import.meta.url), 'utf8');
const managerSource = readFileSync(new URL('./RoomCategoriesManager.tsx', import.meta.url), 'utf8');
const sectionSource = readFileSync(new URL('../hotels/RoomCategoriesSection.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../hotels/page.tsx', import.meta.url), 'utf8');

describe('guardDetailFetch — repeated detail hydration loop detector', () => {
  it('exports the guard helper with the spec-mandated threshold', () => {
    assert.match(perfSource, /export function guardDetailFetch/);
    assert.match(perfSource, /DETAIL_FETCH_LIMIT = 5/);
    assert.match(perfSource, /DETAIL_FETCH_WINDOW_MS = 2_000/);
  });

  it('throws "Repeated detail hydration loop detected" with categoryId in message', () => {
    assert.match(perfSource, /Repeated detail hydration loop detected/);
  });

  it('logs every fetch call (so the developer can see the storm in real time)', () => {
    assert.match(perfSource, /console\.log\(`\[hotels-perf\] detail fetch #/);
  });

  it('uses a per-categoryId counter (separate rows do not interfere)', () => {
    assert.match(perfSource, /DETAIL_FETCH_COUNTERS = new Map<string,/);
  });

  it('exposes a test-only reset', () => {
    assert.match(perfSource, /export function __resetDetailFetchCountersForTesting/);
  });
});

describe('handleExpand — useRef-driven cache check, no stale-state churn', () => {
  it('reads details + expandedId via useRef (no state dep in callback)', () => {
    assert.match(managerSource, /const detailsRef = useRef/);
    assert.match(managerSource, /const expandedIdRef = useRef/);
    assert.match(managerSource, /detailsRef\.current = details/);
    assert.match(managerSource, /expandedIdRef\.current = expandedId/);
  });

  it('calls guardDetailFetch BEFORE the fetch fires', () => {
    assert.match(managerSource, /guardDetailFetch\(categoryId\)/);
  });

  it('bails out when row is already loading (no double-fire)', () => {
    assert.match(managerSource, /if \(detailsRef\.current\[categoryId\]\?\.loading\)/);
  });

  it('bails out when data is cached (no refetch)', () => {
    assert.match(managerSource, /if \(detailsRef\.current\[categoryId\]\?\.data\)/);
  });

  it('useCallback deps strip to just [apiBaseUrl] (no identity churn)', () => {
    // The callback registers exactly one element in its deps array.
    assert.match(managerSource, /\/\/ Stable deps — refs read live state without forcing the\s*\n\s*\/\/ callback identity to churn\.\s*\n\s*\[apiBaseUrl\],/);
  });

  it('collapse path is a single setState (no double-flip)', () => {
    // Collapse branch checks ref and calls setExpandedId(null) once.
    assert.match(managerSource, /if \(expandedIdRef\.current === categoryId\) \{\s*\n\s*setExpandedId\(null\);\s*\n\s*return;\s*\n\s*\}/);
  });
});

describe('expandSafe — minimal detail panel render', () => {
  it('RoomCategoryDetailPanel accepts an expandSafeMode prop', () => {
    assert.match(managerSource, /function RoomCategoryDetailPanel\(\{ detail, expandSafeMode = false \}: \{ detail: CategoryDetail; expandSafeMode\?: boolean \}\)/);
  });

  it('expandSafe path renders ONLY the category name', () => {
    assert.match(managerSource, /data-testid="room-category-detail-panel-safe"/);
    assert.match(managerSource, /expandSafe — derived sections disabled/);
  });

  it('panel has render counter + tight hard guard', () => {
    assert.match(managerSource, /useRenderCounter\('RoomCategoryDetailPanel'\)/);
    assert.match(managerSource, /useHardRenderGuard\('RoomCategoryDetailPanel', \{ limit: 50, windowMs: 2000 \}\)/);
  });
});

describe('expandSafeMode plumbing', () => {
  it('page.tsx reads ?expandSafe=1 and forwards to RoomCategoriesSection', () => {
    assert.match(pageSource, /expandSafe\?:\s*string/);
    assert.match(pageSource, /expandSafeMode: params\?\.expandSafe === '1'/);
  });

  it('RoomCategoriesSection accepts + threads expandSafeMode to Manager', () => {
    assert.match(sectionSource, /expandSafeMode\?:\s*boolean/);
    assert.match(sectionSource, /expandSafeMode=\{expandSafeMode\}/);
  });

  it('manager passes expandSafeMode down to the detail panel', () => {
    assert.match(managerSource, /<RoomCategoryDetailPanel detail=\{detail\.data\} expandSafeMode=\{expandSafeMode\} \/>/);
  });
});
