import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  parseScopeCsv,
  isV2ScopedConfigPresent,
  resolveV2DefaultForQuote,
} from '../../../lib/quote-v2-default-scope';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const pageSrc = read('./page.tsx');
const readinessSrc = read('./quote-readiness.ts');
const auditSrc = read('../../../lib/quote-v2-readiness.ts');
const panelSrc = read('../../../components/quote/v2/v2-readiness-panel.tsx');
const setupSrc = read('../../../components/quote/v2/steps/setup-step.tsx');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source NOT to contain: ${f}`);
}

const cfg = (over: Partial<Parameters<typeof resolveV2DefaultForQuote>[0]> = {}) => ({
  globalDefault: false,
  statuses: new Set<string>(),
  roles: new Set<string>(),
  ...over,
});

describe('Quote Builder V2 — scoped default (PR #573)', () => {
  // ---- 1 & 4. default OFF unless explicitly configured ----
  it('with no config, V2 is NOT the default (Classic stays)', () => {
    assert.equal(resolveV2DefaultForQuote(cfg(), { statusCode: 'SENT', role: 'admin' }), false);
    assert.equal(isV2ScopedConfigPresent(cfg()), false);
  });

  it('blanket global default makes V2 default for everyone', () => {
    assert.equal(resolveV2DefaultForQuote(cfg({ globalDefault: true }), { statusCode: 'DRAFT', role: 'viewer' }), true);
  });

  // ---- status-scoped ----
  it('status-scoped: only listed statuses land on V2', () => {
    const c = cfg({ statuses: new Set(['SENT', 'ACCEPTED', 'CONFIRMED']) });
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'SENT', role: 'viewer' }), true);
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'ACCEPTED', role: 'agent' }), true);
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'DRAFT', role: 'admin' }), false);
    // case-insensitive on the raw status code
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'sent', role: null }), true);
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: null, role: 'admin' }), false);
  });

  // ---- role-scoped ----
  it('role-scoped: only listed roles land on V2 (any status)', () => {
    const c = cfg({ roles: new Set(['admin', 'operations']) });
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'DRAFT', role: 'admin' }), true);
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'DRAFT', role: 'OPERATIONS' }), true); // case-insensitive
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'DRAFT', role: 'viewer' }), false);
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'SENT', role: null }), false);
  });

  // ---- both gates ----
  it('both gates require status AND role to match', () => {
    const c = cfg({ statuses: new Set(['SENT']), roles: new Set(['admin']) });
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'SENT', role: 'admin' }), true);
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'SENT', role: 'viewer' }), false);
    assert.equal(resolveV2DefaultForQuote(c, { statusCode: 'DRAFT', role: 'admin' }), false);
  });

  // ---- CSV parsing ----
  it('parseScopeCsv normalises, trims, drops blanks, and cases', () => {
    assert.deepEqual([...parseScopeCsv('SENT, ACCEPTED ,,confirmed', 'upper')], ['SENT', 'ACCEPTED', 'CONFIRMED']);
    assert.deepEqual([...parseScopeCsv('Admin, OPERATIONS', 'lower')], ['admin', 'operations']);
    assert.equal(parseScopeCsv('', 'upper').size, 0);
    assert.equal(parseScopeCsv(undefined, 'lower').size, 0);
    assert.equal(isV2ScopedConfigPresent({ statuses: parseScopeCsv('SENT', 'upper'), roles: new Set() }), true);
  });

  // ---- routing wiring (source-grep; page.tsx imports next/* so can't be imported) ----
  it('page.tsx redirects to /builder-v2 for blanket + scoped default, and falls back to Classic', () => {
    contains(pageSrc, [
      'quoteBuilderV2IsDefault()',
      'quoteBuilderV2ScopedConfigPresent()',
      'quoteBuilderV2DefaultForQuote({ statusCode, role })',
      'redirect(`/quotes/${id}/builder-v2`)',
      '<ClassicQuoteWorkspace {...props} />',
    ]);
  });

  it('quote-readiness wires the env scope and base path stays scope-aware', () => {
    contains(readinessSrc, [
      "process.env.NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT === 'true'",
      'NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT_STATUSES',
      'NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT_ROLES',
      'quoteBuilderV2ScopedConfigPresent()',
      'resolveV2DefaultForQuote(readV2DefaultScopeConfig()',
    ]);
  });

  // ---- 5 & 6. readiness panel copy ----
  it('readiness audit adds Setup and Itinerary rows', () => {
    contains(auditSrc, ['section: "Setup"', 'section: "Itinerary"']);
  });

  it('readiness panel states Classic-only build actions and drops the stale default copy', () => {
    contains(panelSrc, [
      'Quote creation, pax counts, adding/removing services, hotel/transport rate assignment, and pricing setup',
    ]);
    excludes(panelSrc, ['Classic remains the default']);
  });

  // ---- 7. setup dead Edit button removed ----
  it('setup step replaces the dead Edit button with a Classic link', () => {
    contains(setupSrc, ['Edit in Classic']);
    excludes(setupSrc, ['onClick={onEdit}', 'onEdit?: () => void']);
  });
});
