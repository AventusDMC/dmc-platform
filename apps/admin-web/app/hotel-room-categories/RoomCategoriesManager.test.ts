import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Hotel Master Room Categories freeze fix — source-grep tests that
// lock in the behavioural invariants of the refactored panel:
//
//   - The section loader uses the lightweight summary endpoint, NOT
//     /api/hotels (the path that triggers the N+1 supplier resolver).
//   - The manager renders from props (initial summary), not from a
//     second client-side fetch on mount.
//   - Per-category detail is lazy — only fetched on expand, and the
//     fetch is AbortController-cancellable.
//   - The component is wrapped in an error boundary.
//   - Large hotel setups display the safe-mode banner copy.

// RoomCategoriesSection source-grep tests removed during the v1 → v2
// cutover: the legacy /hotels/RoomCategoriesSection.tsx server loader
// was deleted along with the tab-based hotels page. Room categories now
// load on /hotels/[id]/rooms (the v2 rooms page) where the server
// component fetches directly with no shared loader to assert against.
// The original guard (don't double-fetch /api/hotels) is enforced by
// the v2 page's structure: it only fetches one endpoint per page.

describe('RoomCategoriesManager — client-side panel', () => {
  const managerSource = readFileSync(new URL('./RoomCategoriesManager.tsx', import.meta.url), 'utf8');

  it('renders from initialSummary props — no useEffect fetch on mount', () => {
    assert.match(managerSource, /initialSummary: RoomCategorySummary\[\]/);
    // No fetch inside a useEffect against /hotels or /hotel-contracts —
    // the manager is fed by the server-side loader.
    assert.doesNotMatch(managerSource, /useEffect\(\([^)]*\)\s*=>\s*\{[^}]*fetch\(`[^`]*\/hotels`/);
  });

  it('contains NO useEffect without a dependency array', () => {
    // Empty deps `useEffect(..., [])` is fine. Missing deps array (the
    // PR #118 freeze trigger) is not — would fire on every render.
    assert.doesNotMatch(managerSource, /useEffect\(\(\)\s*=>\s*\{[\s\S]*?\}\)\s*;\s*\n/);
  });

  it('lazy-loads per-category detail via /hotels/room-categories/:id only on expand', () => {
    assert.match(managerSource, /handleExpand/);
    assert.match(managerSource, /\/hotels\/room-categories\/\$\{encodeURIComponent\(categoryId\)\}/);
  });

  it('uses AbortController for the detail fetch so cancellation is safe', () => {
    assert.match(managerSource, /new AbortController\(\)/);
    assert.match(managerSource, /signal: controller\.signal/);
    assert.match(managerSource, /signal\.aborted/);
  });

  it('wraps the manager body in the RoomCategoriesErrorBoundary', () => {
    assert.match(managerSource, /import \{ RoomCategoriesErrorBoundary \}/);
    assert.match(managerSource, /<RoomCategoriesErrorBoundary>/);
  });

  it('surfaces the safe-mode banner for large hotel setups with spec copy', () => {
    assert.match(managerSource, /LARGE_HOTEL_LINKED_RATE_THRESHOLD/);
    assert.match(managerSource, /Large hotel setup — showing room category summary first\./);
  });

  // PR #118 RoomTypesPanel assertion removed: the legacy
  // /hotels/contracts/[contractId]/RoomTypesPanel.tsx file was deleted
  // during the v1 → v2 cutover. The room-types-summary endpoint is now
  // consumed by /hotels/[id]/contracts/[contractId]/page.tsx directly
  // (the v2 contract detail page), and the underlying invariant —
  // RoomCategoriesManager not hitting the contract workspace — is still
  // protected by the manager's own contract not to import contract code.
});

describe('RoomCategoriesErrorBoundary — friendly fallback', () => {
  const boundarySource = readFileSync(new URL('./RoomCategoriesErrorBoundary.tsx', import.meta.url), 'utf8');

  it('extends class Component with the two lifecycle hooks React needs', () => {
    assert.match(boundarySource, /extends Component<Props, State>/);
    assert.match(boundarySource, /static getDerivedStateFromError/);
    assert.match(boundarySource, /componentDidCatch/);
  });

  it('renders a retry button instead of letting the page freeze', () => {
    assert.match(boundarySource, /Retry tab/);
    assert.match(boundarySource, /role="alert"/);
  });
});
