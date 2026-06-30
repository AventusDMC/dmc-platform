import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const hotelsSrc = read('../../../components/quote/v2/steps/hotels-step.tsx');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

describe('Quote Builder V2 — hotels header badge polish (PR #570)', () => {
  // ---- 1 + 2. PREVIEW ONLY when hotel preview is enabled, VIEW ONLY when disabled ----
  it('header badge reads "Apply enabled" / "Preview only" / "View only" by scope (Set-primary unchanged)', () => {
    contains(hotelsSrc, [
      'const previewActive = Boolean(onPreviewItem && hotelPreviewEnabled)',
      // PR #578 adds the apply scope; the badge promotes to "Apply enabled" when on.
      'const applyActive = Boolean(previewActive && onApplyItemPricing && hotelApplyEnabled)',
      'statusLabel={applyActive ? "Apply enabled" : hasEditableAlternatives ? "Set primary only" : previewActive ? "Preview only" : "View only"}',
      'statusTone={applyActive ? "editable" : hasEditableAlternatives ? "editable" : previewActive ? "preview" : "view"}',
    ]);
  });

  it('helper text still reflects the read-only preview state (no apply) when preview-only', () => {
    contains(hotelsSrc, ['read-only pricing preview (no changes are saved and there is no apply)']);
  });

  // ---- 3. apply (PR #578) is delegated — the step itself never writes directly ----
  it('hotel apply is delegated to onApplyItemPricing; the step performs no direct fetch/POST', () => {
    excludes(hotelsSrc, ['apply-preview', "method: 'POST'", 'method: "POST"', 'fetch(']);
    // read-only preview affordance + delegated apply handler are both present
    contains(hotelsSrc, ['Preview hotel pricing', 'PricingPreviewModal', 'hotelPreviewEnabled', 'onApplyItemPricing', 'hotelApplyEnabled']);
  });
});
