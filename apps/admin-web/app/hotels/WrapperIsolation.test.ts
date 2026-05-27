import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Wrapper isolation ladder — source-grep tests for the `/hotels`
// page-level isolation that lets operators strip wrappers one at a
// time. After PR #130 confirmed the manager works in
// /hotels-room-categories-debug, the freeze must be in one of the
// wrappers around the tab body.

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

describe('wrapper isolation flag', () => {
  it('page.tsx reads ?wrapper= from searchParams', () => {
    assert.match(pageSource, /wrapper\?:\s*string/);
    assert.match(pageSource, /wrapperMode = \(resolvedSearchParams\?\.wrapper as/);
  });

  it('exposes the five spec-mandated modes', () => {
    for (const mode of ['full', 'noSummary', 'noModuleSwitcher', 'shellOnly', 'minimal']) {
      assert.match(pageSource, new RegExp(`'${mode}'`));
    }
  });
});

describe('wrapper isolation render gates', () => {
  it('minimal mode short-circuits and renders no WorkspaceShell', () => {
    assert.match(pageSource, /if \(wrapperMode === 'minimal'\)/);
    assert.match(pageSource, /data-testid="hotels-wrapper-minimal"/);
    // The minimal branch returns BEFORE the main WorkspaceShell render.
    const minimalIdx = pageSource.indexOf("if (wrapperMode === 'minimal')");
    assert.ok(minimalIdx > 0);
    const afterMinimal = pageSource.slice(minimalIdx);
    const endRelative = afterMinimal.indexOf('return (');
    const block = afterMinimal.slice(0, endRelative > 0 ? endRelative : 1000);
    assert.doesNotMatch(block, /<WorkspaceShell/);
    assert.doesNotMatch(block, /<ModuleSwitcher/);
    assert.doesNotMatch(block, /<SummaryStrip/);
  });

  it('switcher prop only renders ModuleSwitcher when includeModuleSwitcher is true', () => {
    assert.match(pageSource, /includeModuleSwitcher = wrapperMode === 'full' \|\| wrapperMode === 'noSummary'/);
    assert.match(pageSource, /switcher=\{includeModuleSwitcher \? \(/);
  });

  it('summary prop only renders SummaryStrip when includeSummary is true', () => {
    assert.match(pageSource, /includeSummary = wrapperMode === 'full' \|\| wrapperMode === 'noModuleSwitcher'/);
    assert.match(pageSource, /summary=\{includeSummary \? \(/);
  });

  it('shellOnly mode renders shell with both switcher AND summary disabled', () => {
    // shellOnly is in neither includeSummary nor includeModuleSwitcher.
    assert.doesNotMatch(pageSource, /includeSummary = .*'shellOnly'/);
    assert.doesNotMatch(pageSource, /includeModuleSwitcher = .*'shellOnly'/);
  });
});

describe('WrapperIsolationLadder server-rendered chip nav', () => {
  it('uses plain <a href> anchors (no client hooks, no Link import)', () => {
    // The ladder is defined inside page.tsx. It uses plain <a> tags.
    assert.match(pageSource, /function WrapperIsolationLadder\(/);
    assert.match(pageSource, /<a\s+key=\{mode\.id\}/);
  });

  it('renders one chip per mode with the spec-mandated labels', () => {
    for (const mode of ['minimal', 'shellOnly', 'noModuleSwitcher', 'noSummary', 'full']) {
      assert.match(pageSource, new RegExp(`id: '${mode}'`));
    }
    // data-testid follows the chip pattern.
    assert.match(pageSource, /data-testid=\{`hotels-wrapper-\$\{mode\.id\}`\}/);
  });

  it('ladder mounts inside both minimal and full render paths', () => {
    // Two occurrences of `<WrapperIsolationLadder` — one in the minimal
    // early return, one in the full render.
    const matches = pageSource.match(/<WrapperIsolationLadder /g) || [];
    assert.ok(matches.length >= 2, `expected the ladder to render in both paths, got ${matches.length}`);
  });

  it('chips link to /hotels with tab=room-categories preserved', () => {
    assert.match(pageSource, /\/hotels\?tab=room-categories&load=1&wrapper=/);
  });
});

describe('regression — earlier freeze-hunt flags still present', () => {
  it('preserves the load gate, debugPerf overlay, cats ladder, formSafe, expandSafe, noInstrument', () => {
    assert.match(pageSource, /loadRequested = resolvedSearchParams\?\.load === '1'/);
    assert.match(pageSource, /debugPerfEnabled = resolvedSearchParams\?\.debugPerf === '1'/);
    assert.match(pageSource, /catsMode: params\?\.cats/);
    assert.match(pageSource, /formSafeMode: params\?\.formSafe === '1'/);
    assert.match(pageSource, /expandSafeMode: params\?\.expandSafe === '1'/);
    assert.match(pageSource, /disableInstrumentation: params\?\.noInstrument === '1'/);
  });
});
