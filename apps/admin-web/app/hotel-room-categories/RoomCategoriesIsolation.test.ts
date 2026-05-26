import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Room Categories binary-isolation tests — lock in the click-ladder
// freeze-hunt pattern. Each isolation level must be reachable AND
// must gate the right subset of subcomponents. The hard render
// guard must fire before the browser locks.

const sectionSource = readFileSync(new URL('../hotels/RoomCategoriesSection.tsx', import.meta.url), 'utf8');
const managerSource = readFileSync(new URL('./RoomCategoriesManager.tsx', import.meta.url), 'utf8');
const perfSource = readFileSync(new URL('../hotels/HotelsPerfDebugPanel.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../hotels/page.tsx', import.meta.url), 'utf8');

describe('Section-level isolation ladder', () => {
  it('exposes all five isolation modes', () => {
    for (const mode of ['minimal', 'table', 'form', 'expand', 'full']) {
      assert.match(sectionSource, new RegExp(`case '${mode}':`));
    }
  });

  it('defaults to minimal mode (zero client subcomponents on first visit)', () => {
    assert.match(sectionSource, /return 'minimal';/);
    assert.match(sectionSource, /if \(isolationMode === 'minimal'\) \{/);
    assert.match(sectionSource, /room-categories-minimal-count/);
  });

  it('renders the isolation ladder with one link per mode', () => {
    assert.match(sectionSource, /room-categories-isolation-ladder/);
    // The source uses a template literal `room-categories-isolation-${mode.id}`
    // — assert the prefix is present and the modes array drives the IDs.
    assert.match(sectionSource, /data-testid=\{`room-categories-isolation-\$\{mode\.id\}`\}/);
    for (const mode of ['minimal', 'table', 'form', 'expand', 'full']) {
      assert.match(sectionSource, new RegExp(`id:\\s*'${mode}'`));
    }
  });

  it('propagates ?cats= through page.tsx into RoomCategoriesSection', () => {
    assert.match(pageSource, /RoomCategoriesSection\(\{ catsMode: params\?\.cats \}\)/);
    assert.match(pageSource, /cats\?:\s*string/);
  });
});

describe('Manager-level isolation gating', () => {
  it('disables the inline create form below isolation mode "form"', () => {
    assert.match(managerSource, /enableForm = isolationMode === 'form' \|\| isolationMode === 'expand' \|\| isolationMode === 'full'/);
    assert.match(managerSource, /\{enableForm \? \(\s*<RoomCategoryForm/);
  });

  it('disables the per-row expand button below isolation mode "expand"', () => {
    assert.match(managerSource, /enableExpand = isolationMode === 'expand' \|\| isolationMode === 'full'/);
    assert.match(managerSource, /\{enableExpand \? \(/);
    assert.match(managerSource, /\{enableExpand && isExpanded \? \(/);
  });

  it('disables the delete button below isolation mode "full"', () => {
    assert.match(managerSource, /enableDelete = isolationMode === 'full'/);
    assert.match(managerSource, /\{enableDelete \? \(/);
  });

  it('renders the isolation mode in a data attribute for inspection', () => {
    assert.match(managerSource, /data-isolation-mode=\{isolationMode\}/);
  });
});

describe('Render counters + hard render guard', () => {
  it('useRenderCounter is wired in both manager wrappers', () => {
    assert.match(managerSource, /useRenderCounter\('RoomCategoriesManager'\)/);
    assert.match(managerSource, /useRenderCounter\('RoomCategoriesManagerInner'\)/);
  });

  it('useHardRenderGuard throws when > 100 renders in 1 second', () => {
    assert.match(perfSource, /HARD_GUARD_LIMIT = 100/);
    assert.match(perfSource, /HARD_GUARD_WINDOW_MS = 1_000/);
    assert.match(perfSource, /throw new Error\(`Runaway render detected in/);
  });

  it('hard guard is wired in both manager wrappers', () => {
    assert.match(managerSource, /useHardRenderGuard\('RoomCategoriesManager'\)/);
    assert.match(managerSource, /useHardRenderGuard\('RoomCategoriesManagerInner'\)/);
  });

  it('exposes measurePerf for timing memo derivations', () => {
    assert.match(perfSource, /export function measurePerf/);
    assert.match(managerSource, /measurePerf\('RoomCategoriesManager\.sortedRows'/);
    assert.match(managerSource, /measurePerf\('RoomCategoriesManager\.isLargeHotelSetup'/);
  });
});

describe('Stabilized handleExpand dependencies (render-churn fix)', () => {
  it('handleExpand uses setter form for expandedId AND details (no unstable deps)', () => {
    // The OLD code listed [apiBaseUrl, expandedId, details] as deps,
    // so every setDetails fired a new callback identity. The fix
    // strips those deps by using current => ... lookups.
    assert.match(managerSource, /setExpandedId\(\(current\) => \{/);
    assert.match(managerSource, /setDetails\(\(current\) => \{/);
    assert.match(managerSource, /\[apiBaseUrl\],/);
  });

  it('handleExpand explicitly comments the BUG-HUNT context', () => {
    assert.match(managerSource, /BUG-HUNT NOTE/);
  });
});

describe('Error boundary preserved', () => {
  it('RoomCategoriesErrorBoundary still wraps the manager (hard guard throws caught)', () => {
    assert.match(managerSource, /<RoomCategoriesErrorBoundary>/);
    const boundarySource = readFileSync(new URL('./RoomCategoriesErrorBoundary.tsx', import.meta.url), 'utf8');
    assert.match(boundarySource, /componentDidCatch/);
  });
});
