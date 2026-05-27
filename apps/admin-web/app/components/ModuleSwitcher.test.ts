import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// ModuleSwitcher freeze fix — source-grep tests for the pure-render
// rewrite. PR #131 confirmed wrapper=noModuleSwitcher was stable, so
// the loop was in this component. This PR removes the `new URL(...)`
// call inside the render path, memoizes the parsed items + active set,
// and adds the render counter + hard guard.

const moduleSwitcherSource = readFileSync(new URL('./ModuleSwitcher.tsx', import.meta.url), 'utf8');
const debugPageSource = readFileSync(new URL('../module-switcher-debug/page.tsx', import.meta.url), 'utf8');
const debugIslandSource = readFileSync(
  new URL('../module-switcher-debug/ModuleSwitcherDebugIsland.tsx', import.meta.url),
  'utf8',
);

describe('ModuleSwitcher — pure render', () => {
  it('no longer calls new URL() (the URL constructor) in the render path', () => {
    // Count `new URL(` occurrences. Every match in the source today
    // is INSIDE a `...` comment literal explaining the removal — there
    // is no `new URL(` call site. We accept up to 3 prose mentions
    // (header comment + inline note + diff narrative) but explicitly
    // forbid the constructor being followed by an actual argument like
    // a quoted string or a variable name without backticks around it.
    const ctorMatches = moduleSwitcherSource.match(/new URL\([^.)]/g) || [];
    assert.equal(
      ctorMatches.length,
      0,
      `Found ${ctorMatches.length} call-site occurrences of new URL(arg) — should be zero.`,
    );
    // Companion: header still narrates the removal.
    assert.match(moduleSwitcherSource, /Replace `new URL\(\.\.\.\)` with a plain string split/);
  });

  it('parses each href ONCE via a plain pure helper (parseHref)', () => {
    assert.match(moduleSwitcherSource, /function parseHref\(href: string\)/);
    assert.match(moduleSwitcherSource, /href\.indexOf\('\?'\)/);
  });

  it('memoizes parsedItems on the items prop identity only', () => {
    assert.match(moduleSwitcherSource, /parsedItems = useMemo\(/);
    assert.match(moduleSwitcherSource, /\[items\],/);
  });

  it('memoizes the active-item Set on (parsedItems, pathname, searchParamsKey, activeId)', () => {
    assert.match(moduleSwitcherSource, /activeItemIds = useMemo\(/);
    assert.match(moduleSwitcherSource, /\[parsedItems, pathname, searchParamsKey, activeId\]/);
  });

  it('uses Set.has(item.id) for O(1) active lookup in the JSX', () => {
    assert.match(moduleSwitcherSource, /activeItemIds\.has\(item\.id\)/);
  });

  it('avoids calling searchParams.get() inside the render loop (single pass via URLSearchParams)', () => {
    // The fix builds ONE URLSearchParams from a string key, not a
    // .get() per render-loop iteration.
    assert.match(moduleSwitcherSource, /searchParamsKey = searchParams \? searchParams\.toString\(\) : ''/);
    assert.match(moduleSwitcherSource, /liveParams = new URLSearchParams\(searchParamsKey\)/);
  });
});

describe('ModuleSwitcher — diagnostic guards', () => {
  it('mounts useRenderCounter and useHardRenderGuard with the spec threshold', () => {
    assert.match(moduleSwitcherSource, /useRenderCounter\('ModuleSwitcher'\)/);
    assert.match(moduleSwitcherSource, /useHardRenderGuard\('ModuleSwitcher', \{ limit: 50, windowMs: 2000 \}\)/);
  });

  it('imports the guard helpers from the perf debug module', () => {
    assert.match(moduleSwitcherSource, /useHardRenderGuard, useRenderCounter,?\s*\}?\s*\}? from '\.\.\/hotels\/HotelsPerfDebugPanel'/);
  });
});

describe('ModuleSwitcher — no state syncing, no effects', () => {
  it('has no useEffect / useState / useLayoutEffect (render loop suspects)', () => {
    assert.doesNotMatch(moduleSwitcherSource, /\buseState\(/);
    assert.doesNotMatch(moduleSwitcherSource, /\buseEffect\(/);
    assert.doesNotMatch(moduleSwitcherSource, /\buseLayoutEffect\(/);
  });

  it('never calls router.push / router.replace from render', () => {
    assert.doesNotMatch(moduleSwitcherSource, /router\.push/);
    assert.doesNotMatch(moduleSwitcherSource, /router\.replace/);
  });

  it('still uses Link for navigation (no manual href mutation)', () => {
    assert.match(moduleSwitcherSource, /import Link from 'next\/link'/);
    assert.match(moduleSwitcherSource, /<Link\s/);
  });
});

describe('/module-switcher-debug — standalone isolation route', () => {
  it('mounts ModuleSwitcher under a plain main element (no shell)', () => {
    assert.match(debugPageSource, /import \{ ModuleSwitcherDebugIsland \}/);
    assert.doesNotMatch(debugPageSource, /<WorkspaceShell/);
    assert.doesNotMatch(debugPageSource, /<TableSectionShell/);
  });

  it('debug island memoizes the items array on the count prop', () => {
    assert.match(debugIslandSource, /const items = useMemo\(/);
    assert.match(debugIslandSource, /\[count\],/);
  });

  it('debug island data-testid is exposed', () => {
    assert.match(debugIslandSource, /data-testid="module-switcher-debug-island"/);
  });

  it("debug island uses 'use client' and imports the real ModuleSwitcher", () => {
    assert.match(debugIslandSource, /'use client'/);
    assert.match(debugIslandSource, /import \{ ModuleSwitcher \} from '\.\.\/components\/ModuleSwitcher'/);
  });
});

describe('parseHref — pure helper covering the URL cases', () => {
  it('handles href with no query string (returns empty queryEntries)', () => {
    assert.match(moduleSwitcherSource, /if \(questionIdx === -1\)/);
    assert.match(moduleSwitcherSource, /queryEntries: \[\]/);
  });

  it('decodes both key and value (decodeURIComponent in try/catch)', () => {
    assert.match(moduleSwitcherSource, /decodeURIComponent\(key\)/);
    assert.match(moduleSwitcherSource, /decodeURIComponent\(value\)/);
    assert.match(moduleSwitcherSource, /\} catch \{/);
  });
});
