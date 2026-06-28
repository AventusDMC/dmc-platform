import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { classifyItemApplyKind, entranceDisplayLabel } from '../../../lib/quote-item-apply-kind';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');
const experiencesSrc = read('../../../components/quote/v2/steps/experiences-step.tsx');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}

describe('Quote Builder V2 — entrance fields survive the adapter coercion (PR #571 fix)', () => {
  // ---- 1. real quote-item entrance rows keep entrance fields through BOTH adapter layers ----
  it('mapErpQuoteToRaw SETS and mapExperiences CARRIES the entrance fields', () => {
    // produced by mapErpQuoteToRaw (real ERP → RawErpQuote)
    contains(adapterSrc, [
      'isEntrance: Boolean(it.id) && isEntranceItem',
      'ticketRateVariantId: isEntranceItem ? it.ticketRateVariantId',
      'jordanPassCovered: isEntranceItem ? it.jordanPassCovered',
      'entranceSiteName: isEntranceItem ? it.entranceFee?.siteName',
    ]);
    // carried through the RawErpQuote → Experience coercion (was previously DROPPED)
    contains(adapterSrc, [
      'isEntrance: asBool(r.isEntrance)',
      'ticketRateVariantId: asTextOrNull(r.ticketRateVariantId)',
      'jordanPassCovered: typeof r.jordanPassCovered === "boolean" ? r.jordanPassCovered : null',
      'entranceSiteName: asTextOrNull(r.entranceSiteName)',
    ]);
  });

  // ---- 2. Bethany / Baptism Site stays Entrance/Jordan Pass, not Activity ----
  it('Bethany-style row (entranceFeeId + ACTIVITY service code) classifies as Entrance, not Activity', () => {
    const kind = classifyItemApplyKind({ entranceFeeId: 'ef-bethany', service: { serviceType: { code: 'ACTIVITY' } } });
    assert.equal(kind.isEntrance, true);
    assert.equal(kind.isActivity, false);
    // a real activity (no entranceFeeId) stays Activity
    const jeep = classifyItemApplyKind({ entranceFeeId: null, service: { serviceType: { code: 'JEEP_TOUR' } } });
    assert.equal(jeep.isActivity, true);
    assert.equal(jeep.isEntrance, false);
  });

  // ---- 3. entrance preview/apply affordance is gated on the carried isEntrance + entrance flag ----
  it('experiences step gates the entrance affordance on exp.isEntrance + the entrance flag', () => {
    contains(experiencesSrc, [
      'exp.isEntrance && exp.quoteItemId && entrancePricingEnabled',
      'Preview & apply entrance pricing',
      '&& !exp.isEntrance', // entrance rows excluded from the generic read-only preview
    ]);
  });

  // ---- 4. fallback still works when optional display fields are missing ----
  it('entrance row with no site name still classifies as Entrance and uses the generic label', () => {
    const noSite = classifyItemApplyKind({ entranceFeeId: 'ef1', service: { serviceType: { code: null } } });
    assert.equal(noSite.isEntrance, true);
    assert.equal(entranceDisplayLabel(null), 'Entrance / Jordan Pass');
    assert.equal(entranceDisplayLabel(''), 'Entrance / Jordan Pass');
  });

  // ---- 5. External Package preview work remains intact (isExternal still carried) ----
  it('external-package isExternal flag is still carried (PR #571 unaffected)', () => {
    contains(adapterSrc, ['isExternal: Boolean(it.id) && externalPackage', 'isExternal: asBool(r.isExternal)']);
    contains(experiencesSrc, ['Preview external package pricing']);
  });
});
