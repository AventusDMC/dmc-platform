import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Router-loop guard + formSafeOnly mode — source-grep tests locking
// in the next round of freeze isolation. After PR #127 (form-safe
// mode) operators confirmed formSafe ALSO freezes, so the loop is
// outside the form's input handling. This PR ships:
//   - withRouterCallGuard() wrapping router.push/replace/refresh —
//     throws on 20+ calls in 2 seconds.
//   - formSafeOnly isolation mode that bypasses the manager + shell
//     and mounts a bare uncontrolled form with NO router hooks.

const perfSource = readFileSync(new URL('../hotels/HotelsPerfDebugPanel.tsx', import.meta.url), 'utf8');
const managerSource = readFileSync(new URL('./RoomCategoriesManager.tsx', import.meta.url), 'utf8');
const sectionSource = readFileSync(new URL('../hotels/RoomCategoriesSection.tsx', import.meta.url), 'utf8');
const bareSource = readFileSync(new URL('./BareRoomCategoryForm.tsx', import.meta.url), 'utf8');

describe('withRouterCallGuard — throws on > 20 router calls in 2 seconds', () => {
  it('exports a router-wrapping helper with the spec-mandated threshold', () => {
    assert.match(perfSource, /export function withRouterCallGuard/);
    assert.match(perfSource, /ROUTER_CALL_LIMIT = 20/);
    assert.match(perfSource, /ROUTER_CALL_WINDOW_MS = 2_000/);
  });

  it('throws "Router synchronization loop detected" on overflow', () => {
    assert.match(perfSource, /Router synchronization loop detected/);
  });

  it('intercepts push / replace / refresh / back / forward / prefetch', () => {
    assert.match(perfSource, /methods:\s*GuardedRouterMethod\[\]\s*=\s*\[\s*'push',\s*'replace',\s*'refresh',\s*'back',\s*'forward',\s*'prefetch'\s*\]/);
  });

  it('logs every router.push / router.replace call so the developer can see the storm in real time', () => {
    assert.match(perfSource, /console\.log\(`\[hotels-perf\] router\.\$\{method\} #/);
  });

  it('exposes a test-only counter reset (no leak between scenarios)', () => {
    assert.match(perfSource, /export function __resetRouterCallCounterForTesting/);
  });
});

describe('RoomCategoriesManager — wraps every useRouter() with the call guard', () => {
  it('three router instantiations exist (controlled form / safe form / inner)', () => {
    const matches = managerSource.match(/const router = withRouterCallGuard\(useRouter\(\)\)/g) || [];
    assert.equal(matches.length, 3, `expected 3 guarded router instantiations, got ${matches.length}`);
  });

  it('no unguarded useRouter() calls remain', () => {
    // Only the guarded form should appear — confirm raw useRouter() is
    // never used standalone in the file.
    assert.doesNotMatch(managerSource, /const router = useRouter\(\);/);
  });

  it('imports withRouterCallGuard from the perf panel module', () => {
    assert.match(managerSource, /withRouterCallGuard,?\s*\n?\s*\}\s*from\s*'\.\.\/hotels\/HotelsPerfDebugPanel'/);
  });
});

describe('formSafeOnly isolation mode — nuclear bypass', () => {
  it('section short-circuits when cats=formSafeOnly is set', () => {
    assert.match(sectionSource, /if \(isolationMode === 'formSafeOnly'\)/);
    assert.match(sectionSource, /data-testid="room-categories-form-safe-only"/);
  });

  it('formSafeOnly bypasses TableSectionShell, ladder, and Manager wrapper', () => {
    // The formSafeOnly return block returns a plain <section> with the
    // BareRoomCategoryForm — not the heavy shell. Confirm those three
    // wrappers are explicitly absent from the formSafeOnly return.
    const startIdx = sectionSource.indexOf("if (isolationMode === 'formSafeOnly')");
    assert.ok(startIdx > 0);
    // Take the block until the close of the if statement.
    const afterStart = sectionSource.slice(startIdx);
    const blockEnd = afterStart.indexOf('// Minimal isolation mode');
    const block = afterStart.slice(0, blockEnd);
    assert.doesNotMatch(block, /<TableSectionShell/);
    assert.doesNotMatch(block, /<RoomCategoriesManager/);
    assert.doesNotMatch(block, /<RoomCategoriesIsolationLadder/);
    assert.match(block, /<BareRoomCategoryForm/);
  });

  it('formSafeOnly chip is exposed in the isolation ladder', () => {
    assert.match(sectionSource, /id: 'formSafeOnly'/);
    assert.match(sectionSource, /Bare form mount/);
  });

  it('formSafeOnly mode is accepted by the resolver', () => {
    assert.match(sectionSource, /case 'formSafeOnly':/);
    assert.match(sectionSource, /export type RoomCategoriesIsolationMode = [^;]*'formSafeOnly'/);
  });
});

describe('BareRoomCategoryForm — zero React reactivity', () => {
  it('marked as a client component but uses no React hooks (call sites, not comments)', () => {
    assert.match(bareSource, /'use client'/);
    // Match HOOK INVOCATION patterns, not the literal word inside
    // comments. A real hook is always followed by `(`.
    assert.doesNotMatch(bareSource, /\buseState\(/);
    assert.doesNotMatch(bareSource, /\buseEffect\(/);
    assert.doesNotMatch(bareSource, /\buseRouter\(/);
    assert.doesNotMatch(bareSource, /\buseSearchParams\(/);
    assert.doesNotMatch(bareSource, /\buseMemo\(/);
    assert.doesNotMatch(bareSource, /\buseCallback\(/);
  });

  it('uses native form submit (no onSubmit JS handler)', () => {
    assert.doesNotMatch(bareSource, /onSubmit=/);
    assert.match(bareSource, /action=\{`/);
    assert.match(bareSource, /method="post"/);
  });

  it('inputs use defaultValue, not value+onChange', () => {
    // No `onChange=` attribute on any input/select.
    assert.doesNotMatch(bareSource, /onChange=/);
    // No `value=` attribute (controlled input prop). `value=` on
    // <option> is fine — that's an HTML attribute, not React state.
    assert.doesNotMatch(bareSource, /<input[^>]*\svalue=\{/);
    assert.doesNotMatch(bareSource, /<select[^>]*\svalue=\{/);
    assert.match(bareSource, /defaultValue=/);
  });

  it('exposes data-testid for inspection', () => {
    assert.match(bareSource, /data-testid="bare-room-category-form"/);
  });
});
