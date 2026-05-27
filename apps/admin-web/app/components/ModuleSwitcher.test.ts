import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// ModuleSwitcher source-grep tests covering the pure-render
// invariants that keep the Hotels workspace stable.

const moduleSwitcherSource = readFileSync(new URL('./ModuleSwitcher.tsx', import.meta.url), 'utf8');

describe('ModuleSwitcher — pure render', () => {
  it('no longer calls new URL() (the URL constructor) in the render path', () => {
    // Count `new URL(` call-site occurrences. Comments referencing
    // the removal use `...` ellipses so a `[^.)]` lookahead excludes
    // those — only an actual constructor call would match.
    const ctorMatches = moduleSwitcherSource.match(/new URL\([^.)]/g) || [];
    assert.equal(
      ctorMatches.length,
      0,
      `Found ${ctorMatches.length} call-site occurrences of new URL(arg) — should be zero.`,
    );
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

  it('does not depend on the removed perf debug panel', () => {
    // The diagnostic hooks lived in HotelsPerfDebugPanel — the
    // cleanup pass deleted that module. Any lingering import here
    // would re-introduce the production dependency on diagnostics.
    assert.doesNotMatch(moduleSwitcherSource, /HotelsPerfDebugPanel/);
    assert.doesNotMatch(moduleSwitcherSource, /useHardRenderGuard/);
    assert.doesNotMatch(moduleSwitcherSource, /useRenderCounter/);
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
