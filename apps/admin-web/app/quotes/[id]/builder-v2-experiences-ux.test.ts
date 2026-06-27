import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { classifyItemApplyKind } from '../../../lib/quote-item-apply-kind';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const experiencesSrc = read('../../../components/quote/v2/steps/experiences-step.tsx');
const sidebarSrc = read('../../../components/quote/v2/quote-summary-sidebar.tsx');
const helpersSrc = read('../../../lib/quote-helpers.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}

const svc = (code: string | null) => ({ service: { serviceType: { code } } });

describe('Quote Builder V2 — Experiences UX polish (PR #563)', () => {
  // ---- 1. Button labels per kind (Meal / Activity / Guide / Entrance) ----
  it('experiences step renders the four kind-specific apply button labels', () => {
    contains(experiencesSrc, [
      'Preview & apply meal pricing',
      'Preview & apply activity pricing',
      'Preview & apply guide pricing',
      'Preview & apply entrance pricing',
    ]);
  });

  // ---- 2. entranceFeeId rows are Entrance even when service type/name is ambiguous ----
  it('entranceFeeId dominates: an entrance is Entrance even with an activity service-type code', () => {
    // Ambiguous: linked to an EntranceFee AND carries an activity-ish service type.
    for (const code of ['EXCURSION', 'ACTIVITY', 'JEEP_TOUR', 'ENTRANCE_TICKET', null]) {
      const kind = classifyItemApplyKind({ entranceFeeId: 'ef-bethany', ...svc(code) });
      assert.deepEqual(
        kind,
        { isEntrance: true, isMeal: false, isActivity: false, isGuide: false },
        `entranceFeeId must win over service-type code ${String(code)}`,
      );
    }
    // Entrance with no service block at all is still Entrance.
    assert.deepEqual(classifyItemApplyKind({ entranceFeeId: 'ef1' }), {
      isEntrance: true,
      isMeal: false,
      isActivity: false,
      isGuide: false,
    });
  });

  // ---- 3. Real activities (Jeep Tour) stay Activity ----
  it('a real activity (JEEP_TOUR) with no entranceFeeId stays Activity', () => {
    for (const code of ['JEEP_TOUR', 'ACTIVITY', 'EXCURSION', 'BOAT_RIDE', 'SAFARI']) {
      const kind = classifyItemApplyKind({ entranceFeeId: null, ...svc(code) });
      assert.equal(kind.isActivity, true, `${code} should classify as Activity`);
      assert.equal(kind.isEntrance, false);
      assert.equal(kind.isMeal, false);
      assert.equal(kind.isGuide, false);
    }
    // Meal + Guide keep their own kind (and are not Activity/Entrance).
    assert.deepEqual(classifyItemApplyKind(svc('MEAL')), { isEntrance: false, isMeal: true, isActivity: false, isGuide: false });
    assert.deepEqual(classifyItemApplyKind(svc('GUIDE')), { isEntrance: false, isMeal: false, isActivity: false, isGuide: true });
  });

  // ---- 4. Hotel / Transport / External stay out-of-scope (read-only / Classic) ----
  it('hotel / transport / external-package codes match no apply kind', () => {
    for (const code of ['HOTEL', 'POINT_TO_POINT', 'AIRPORT_TRANSFER', 'EXTERNAL_PACKAGE', '', null, undefined as any]) {
      const kind = classifyItemApplyKind({ entranceFeeId: null, ...svc(code as any) });
      assert.deepEqual(
        kind,
        { isEntrance: false, isMeal: false, isActivity: false, isGuide: false },
        `${String(code)} must be out of apply scope`,
      );
    }
  });

  it('the four kinds are mutually exclusive (at most one true)', () => {
    const samples = [
      classifyItemApplyKind({ entranceFeeId: 'ef1', ...svc('JEEP_TOUR') }),
      classifyItemApplyKind(svc('MEAL')),
      classifyItemApplyKind(svc('GUIDE')),
      classifyItemApplyKind(svc('JEEP_TOUR')),
      classifyItemApplyKind(svc('HOTEL')),
    ];
    for (const k of samples) {
      const trues = [k.isEntrance, k.isMeal, k.isActivity, k.isGuide].filter(Boolean).length;
      assert.ok(trues <= 1, `expected at most one kind, got ${trues}`);
    }
  });

  // ---- 5. "VIEW ONLY" label replaced with "Limited apply" when apply is enabled ----
  it('experiences header surfaces "Limited apply" (not "View only") when apply is enabled', () => {
    contains(experiencesSrc, [
      'const applyEnabled = Boolean(onApplyItemPricing)',
      'statusLabel={applyEnabled ? "Limited apply" : anyEditable ? "Limited editing" : "View only"}',
      'Pricing apply is available for selected services',
    ]);
  });

  // ---- 6. Readiness card relabelled (no calculation change) ----
  it('readiness card clarifies the checklist vs advisory review items', () => {
    contains(sidebarSrc, [
      'Required-steps checklist',
      'Items to review (',
      'No items to review.',
      // advisory note (apostrophe is HTML-escaped in JSX)
      'these don',
      'affect the checklist above or block sending',
    ]);
  });

  it('readiness PERCENT calculation is unchanged (still the checklist completion ratio)', () => {
    // Business logic untouched: % is done/total of the readiness checklist.
    contains(helpersSrc, [
      'const done = quote.readiness.filter((c) => c.done).length',
      'Math.round((done / quote.readiness.length) * 100)',
      // send gate still keyed on the checklist, not the advisory blocking items
      'return quote.readiness.length > 0 && quote.readiness.every((c) => c.done)',
    ]);
  });
});
