import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  classifyItemApplyKind,
  entranceDisplayLabel,
  ENTRANCE_FALLBACK_LABEL,
} from '../../../lib/quote-item-apply-kind';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const adapterSrc = read('../../../lib/quote-v2-adapter.ts');
const modalSrc = read('../../../components/quote/v2/steps/item-pricing-apply-modal.tsx');
// Backend quote-item load — display fix lives here (the entranceFee relation include).
const quotesServiceSrc = read('../../../../api/src/quotes/quotes.service.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}

const svc = (code: string | null) => ({ service: { serviceType: { code } } });

describe('Quote Builder V2 — entrance site-name display (PR #564)', () => {
  // ---- 1. Entrance row WITH a site name displays the site name ----
  it('shows the actual entrance site name when available', () => {
    assert.equal(entranceDisplayLabel('Bethany / Baptism Site'), 'Bethany / Baptism Site');
    assert.equal(entranceDisplayLabel('Jerash Archaeological Site & Museum'), 'Jerash Archaeological Site & Museum');
    // Trimmed.
    assert.equal(entranceDisplayLabel('  Mount Nebo  '), 'Mount Nebo');
  });

  // ---- 2. Entrance row WITHOUT the relation falls back to the generic label ----
  it('falls back to "Entrance / Jordan Pass" when no site name is available', () => {
    assert.equal(ENTRANCE_FALLBACK_LABEL, 'Entrance / Jordan Pass');
    for (const v of [null, undefined, '', '   ']) {
      assert.equal(entranceDisplayLabel(v as any), 'Entrance / Jordan Pass', `"${String(v)}" should fall back`);
    }
  });

  it('adapter routes the entrance kind chip through entranceDisplayLabel; modal shows the site name', () => {
    contains(adapterSrc, [
      'entranceDisplayLabel(it.entranceFee?.siteName)',
      // raw site name still surfaced for the apply modal (read-only display hint)
      'entranceSiteName: isEntranceItem ? it.entranceFee?.siteName',
    ]);
    contains(modalSrc, ['exp.entranceSiteName || exp.name']);
  });

  it('backend quote-item load includes the entranceFee site name (minimal select)', () => {
    contains(quotesServiceSrc, ['entranceFee: { select: { siteName: true } }']);
  });

  // ---- 3. entranceFeeId still wins classification over ACTIVITY / JEEP_TOUR ----
  it('entranceFeeId still dominates classification (unchanged from PR #563)', () => {
    for (const code of ['ACTIVITY', 'JEEP_TOUR', 'EXCURSION', null]) {
      assert.deepEqual(
        classifyItemApplyKind({ entranceFeeId: 'ef-bethany', ...svc(code) }),
        { isEntrance: true, isMeal: false, isActivity: false, isGuide: false },
        `entranceFeeId must win over ${String(code)}`,
      );
    }
  });

  // ---- 4. Jeep Tour (no entranceFeeId) remains Activity ----
  it('Jeep Tour with no entranceFeeId stays Activity', () => {
    const kind = classifyItemApplyKind({ entranceFeeId: null, ...svc('JEEP_TOUR') });
    assert.deepEqual(kind, { isEntrance: false, isMeal: false, isActivity: true, isGuide: false });
  });

  // ---- 5. Hotel / Transport / External remain out-of-scope ----
  it('hotel / transport / external codes match no apply kind', () => {
    for (const code of ['HOTEL', 'POINT_TO_POINT', 'AIRPORT_TRANSFER', 'EXTERNAL_PACKAGE', null]) {
      assert.deepEqual(
        classifyItemApplyKind({ entranceFeeId: null, ...svc(code) }),
        { isEntrance: false, isMeal: false, isActivity: false, isGuide: false },
        `${String(code)} must be out of apply scope`,
      );
    }
  });
});
