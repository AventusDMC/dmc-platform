import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildV2ReadinessAudit, V2_READINESS_LABEL } from '../../../lib/quote-v2-readiness';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const panelSrc = read('../../../components/quote/v2/v2-readiness-panel.tsx');
const readinessSrc = read('../../../lib/quote-v2-readiness.ts');
const builderSrc = read('../../../components/quote/v2/quote-builder-v2.tsx');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

const completeSteps = [
  { id: 'hotels', status: 'complete' },
  { id: 'transport', status: 'complete' },
  { id: 'experiences', status: 'complete' },
];

function makeQuote(over: any = {}) {
  return {
    hotelCities: [{ city: 'Amman', nights: 1, options: [{ id: 'h1', name: 'Amman West Hotel', selected: true, contractStatus: 'contracted' }] }],
    transport: [{ id: 't1', route: 'QAIA → Amman', priceStatus: 'complete', amount: 100 }],
    experiences: [
      { id: 'm1', quoteItemId: 'm1', isMeal: true },
      { id: 'a1', quoteItemId: 'a1', isActivity: true },
      { id: 'g1', quoteItemId: 'g1', isGuide: true },
      { id: 'e1', quoteItemId: 'e1', isEntrance: true },
      { id: 'x1', quoteItemId: 'x1' }, // external/other (no apply flags)
    ],
    passengers: [{ id: 'p1' }, { id: 'p2' }],
    roomingGroups: [{ id: 'r1' }],
    passengersLoadError: false,
    roomingLoadError: false,
    steps: completeSteps,
    readiness: [{ done: true }, { done: true }],
    pricing: {},
    ...over,
  } as any;
}
const row = (audit: any, key: string) => audit.rows.find((r: any) => r.key === key);

describe('Quote Builder V2 — readiness audit (PR #568, read-only)', () => {
  // ---- 1 + 4. supported V2 capabilities ----
  it('experiences (meal/activity/guide/entrance) render as Ready in V2', () => {
    const audit = buildV2ReadinessAudit(makeQuote());
    const r = row(audit, 'experiences-apply');
    assert.equal(r.level, 'ready');
    contains(r.label, ['Meal', 'Activity', 'Guide', 'Entrance']);
  });

  // ---- 2. hotels with contract on file are not blockers; editing remains Classic ----
  it('all-contracted hotels → Ready (not a blocker); hotel editing stays Classic-required', () => {
    const audit = buildV2ReadinessAudit(makeQuote());
    assert.equal(row(audit, 'hotels-contracts').level, 'ready');
    assert.equal(row(audit, 'hotels-editing').level, 'classic');
  });

  it('on-request hotel → Needs review (advisory, not Classic)', () => {
    const audit = buildV2ReadinessAudit(
      makeQuote({ hotelCities: [{ city: 'Amman', nights: 1, options: [{ id: 'h1', name: 'X', selected: true, contractStatus: 'on-request' }] }] }),
    );
    assert.equal(row(audit, 'hotels-contracts').level, 'review');
  });

  // ---- 3. transport is Preview only, not Apply ----
  it('transport is Preview only (never an apply/ready capability)', () => {
    const audit = buildV2ReadinessAudit(makeQuote());
    assert.equal(row(audit, 'transport-preview').level, 'preview');
    // no transport row claims apply/ready
    const transportRows = audit.rows.filter((r: any) => r.section === 'Transport');
    assert.ok(transportRows.every((r: any) => r.level !== 'ready'));
  });

  it('unresolved transport pricing surfaces as a review item', () => {
    const audit = buildV2ReadinessAudit(makeQuote({ transport: [{ id: 't1', route: 'x', priceStatus: 'missing', amount: null }] }));
    assert.equal(row(audit, 'transport-rates').level, 'review');
  });

  // ---- 5. hotel/transport/external apply remains unsupported ----
  it('hotel / transport / external-package apply remain unsupported (classic/preview only)', () => {
    const audit = buildV2ReadinessAudit(makeQuote());
    assert.equal(row(audit, 'hotels-editing').level, 'classic');
    assert.equal(row(audit, 'transport-preview').level, 'preview');
    assert.equal(row(audit, 'experiences-other').level, 'classic');
  });

  it('passengers/rooming readable+editable shows Ready; pricing adjustments stay Classic', () => {
    const audit = buildV2ReadinessAudit(makeQuote());
    assert.equal(row(audit, 'passengers').level, 'ready');
    assert.equal(row(audit, 'pricing-adjustments').level, 'classic');
    assert.equal(row(audit, 'pricing-components').level, 'ready'); // all steps complete
  });

  it('counts tally the four levels', () => {
    const audit = buildV2ReadinessAudit(makeQuote());
    assert.ok(audit.counts.ready > 0 && audit.counts.preview > 0 && audit.counts.classic > 0);
    assert.equal(audit.counts.ready + audit.counts.preview + audit.counts.classic + audit.counts.review, audit.rows.length);
  });

  // ---- labels + wiring ----
  it('uses the four clear capability labels', () => {
    assert.deepEqual(V2_READINESS_LABEL, {
      ready: 'Ready in V2', preview: 'Preview only', classic: 'Classic required', review: 'Needs review',
    });
  });

  it('helper reuses existing readiness helpers (does not reimplement send/readiness logic)', () => {
    contains(readinessSrc, ['getComponentStatuses', 'getReadiness', 'canSendQuote']);
    // never claims an apply capability for transport/hotel/external
    contains(readinessSrc, ['level: "preview"', 'level: "classic"']);
  });

  it('panel is informational/read-only and the builder renders it in the sidebar', () => {
    contains(panelSrc, ['V2_READINESS_LABEL', 'V2 readiness', 'aria-expanded']);
    excludes(panelSrc, ['fetch(', 'onApply', "method: 'POST'", 'method: "POST"']);
    contains(builderSrc, ['V2ReadinessPanel', 'buildV2ReadinessAudit(quote,', '<V2ReadinessPanel audit={insights.v2Readiness} />']);
  });

  // ---- 6. V2 default flag untouched ----
  it('does not reference or change the V2 default flag', () => {
    excludes(readinessSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
    excludes(panelSrc, ['NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT']);
  });
});
