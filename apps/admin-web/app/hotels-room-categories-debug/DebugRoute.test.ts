import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Standalone debug route + managerOnly mode + noInstrument flag —
// source-grep tests locking in the next layer of isolation after the
// expand-mode freeze ruled out formSafeOnly's culprits.

const debugPageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const debugIslandSource = readFileSync(new URL('./RoomCategoriesDebugIsland.tsx', import.meta.url), 'utf8');
const sectionSource = readFileSync(new URL('../hotels/RoomCategoriesSection.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../hotels/page.tsx', import.meta.url), 'utf8');
const perfSource = readFileSync(new URL('../hotels/HotelsPerfDebugPanel.tsx', import.meta.url), 'utf8');
const managerSource = readFileSync(new URL('../hotel-room-categories/RoomCategoriesManager.tsx', import.meta.url), 'utf8');

describe('Standalone /hotels-room-categories-debug route', () => {
  it('imports RoomCategoriesDebugIsland (not the hotels page wrappers)', () => {
    assert.match(debugPageSource, /import \{ RoomCategoriesDebugIsland \}/);
    // Match JSX usage of the wrappers (`<Name`), not text references
    // in comments. None of the page wrappers may be rendered.
    assert.doesNotMatch(debugPageSource, /<WorkspaceShell[\s>]/);
    assert.doesNotMatch(debugPageSource, /<ModuleSwitcher[\s>]/);
    assert.doesNotMatch(debugPageSource, /<HotelsDirectoryErrorBoundary[\s>]/);
    assert.doesNotMatch(debugPageSource, /<HotelsPerfDebugPanel[\s>]/);
    assert.doesNotMatch(debugPageSource, /<TableSectionShell[\s>]/);
    // Also no imports of those wrappers.
    assert.doesNotMatch(debugPageSource, /from '[^']*WorkspaceShell'/);
    assert.doesNotMatch(debugPageSource, /from '[^']*ModuleSwitcher'/);
  });

  it('supports ?manager=off to skip mounting the manager', () => {
    assert.match(debugPageSource, /managerEnabled = params\?\.manager !== 'off'/);
    assert.match(debugPageSource, /hotels-room-categories-debug-no-manager/);
  });

  it('supports ?size= for fixture row count', () => {
    assert.match(debugPageSource, /fixtureSize = Math\.min\(Math\.max\(Number\(params\?\.size \|\| '4'\), 1\), 50\)/);
  });
});

describe('RoomCategoriesDebugIsland — manager + mock fixture only', () => {
  it("uses 'use client' and imports the real RoomCategoriesManager", () => {
    assert.match(debugIslandSource, /'use client'/);
    assert.match(debugIslandSource, /import \{ RoomCategoriesManager,/);
  });

  it('builds an in-memory fixture without hitting any API', () => {
    assert.match(debugIslandSource, /function buildFixture/);
    assert.doesNotMatch(debugIslandSource, /fetch\(/);
    assert.doesNotMatch(debugIslandSource, /\/api\//);
  });

  it('renders the manager with isolationMode="full"', () => {
    assert.match(debugIslandSource, /isolationMode="full"/);
  });
});

describe('managerOnly isolation mode', () => {
  it('section short-circuits when cats=managerOnly', () => {
    assert.match(sectionSource, /if \(isolationMode === 'managerOnly'\)/);
    assert.match(sectionSource, /data-testid="room-categories-manager-only"/);
  });

  it('managerOnly bypasses TableSectionShell and the isolation ladder', () => {
    const startIdx = sectionSource.indexOf("if (isolationMode === 'managerOnly')");
    assert.ok(startIdx > 0);
    const afterStart = sectionSource.slice(startIdx);
    const blockEnd = afterStart.indexOf('// formSafeOnly');
    const block = afterStart.slice(0, blockEnd);
    assert.doesNotMatch(block, /<TableSectionShell/);
    assert.doesNotMatch(block, /<RoomCategoriesIsolationLadder/);
    assert.match(block, /<RoomCategoriesManager/);
  });

  it('managerOnly chip appears in the isolation ladder', () => {
    assert.match(sectionSource, /id: 'managerOnly'/);
    assert.match(sectionSource, /Manager-only/);
  });

  it('resolver accepts the managerOnly mode', () => {
    assert.match(sectionSource, /case 'managerOnly':/);
    assert.match(sectionSource, /export type RoomCategoriesIsolationMode = [^;]*'managerOnly'/);
  });
});

describe('noInstrument=1 disables every diagnostic hook', () => {
  it('useRenderCounter accepts an enabled flag and short-circuits when false', () => {
    assert.match(perfSource, /export function useRenderCounter\(name: string, enabled: boolean = true\)/);
    assert.match(perfSource, /if \(!enabled \|\| typeof window === 'undefined'\) return/);
  });

  it('useHardRenderGuard accepts an enabled option and short-circuits when false', () => {
    assert.match(perfSource, /options: \{ limit\?: number; windowMs\?: number; enabled\?: boolean \}/);
    assert.match(perfSource, /if \(options\.enabled === false\) return/);
  });

  it('withRouterCallGuard accepts an enabled flag and passes through when false', () => {
    assert.match(perfSource, /export function withRouterCallGuard<T extends Record<string, any>>\(router: T, enabled: boolean = true\)/);
    assert.match(perfSource, /if \(!enabled\) return router/);
  });

  it('guardDetailFetch accepts an enabled flag', () => {
    assert.match(perfSource, /export function guardDetailFetch\(categoryId: string, enabled: boolean = true\)/);
  });

  it('Manager wires disableInstrumentation prop through every hook callsite', () => {
    assert.match(managerSource, /disableInstrumentation\?: boolean/);
    assert.match(managerSource, /useRenderCounter\('RoomCategoriesManager', !disableInstrumentation\)/);
    assert.match(managerSource, /useHardRenderGuard\('RoomCategoriesManager', \{ enabled: !disableInstrumentation \}\)/);
    assert.match(managerSource, /useRenderCounter\('RoomCategoriesManagerInner', !disableInstrumentation\)/);
    assert.match(managerSource, /useHardRenderGuard\('RoomCategoriesManagerInner', \{ enabled: !disableInstrumentation \}\)/);
    assert.match(managerSource, /withRouterCallGuard\(useRouter\(\), !disableInstrumentation\)/);
    assert.match(managerSource, /guardDetailFetch\(categoryId, !disableInstrumentation\)/);
  });

  it('page.tsx + section thread noInstrument → disableInstrumentation', () => {
    assert.match(pageSource, /noInstrument\?:\s*string/);
    assert.match(pageSource, /disableInstrumentation: params\?\.noInstrument === '1'/);
    assert.match(sectionSource, /disableInstrumentation\?:\s*boolean/);
    assert.match(sectionSource, /disableInstrumentation=\{disableInstrumentation\}/);
  });
});
