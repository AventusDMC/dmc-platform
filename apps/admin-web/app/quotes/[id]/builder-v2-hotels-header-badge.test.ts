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
  it('header badge reads "Preview only" when hotel preview is active, else "View only" (Set-primary unchanged)', () => {
    contains(hotelsSrc, [
      'const previewActive = Boolean(onPreviewItem && hotelPreviewEnabled)',
      'statusLabel={hasEditableAlternatives ? "Set primary only" : previewActive ? "Preview only" : "View only"}',
      'statusTone={hasEditableAlternatives ? "editable" : previewActive ? "preview" : "view"}',
    ]);
  });

  it('helper text reflects the read-only preview state (no apply) when preview is active', () => {
    contains(hotelsSrc, ['read-only pricing preview (no changes are saved and there is no apply)']);
  });

  // ---- 3. no hotel apply controls introduced ----
  it('no hotel apply/confirm control or write is introduced by this change', () => {
    excludes(hotelsSrc, ['onApply', 'apply-preview', 'Apply', "method: 'POST'", 'method: "POST"', 'fetch(']);
    // existing read-only preview affordance is retained
    contains(hotelsSrc, ['Preview hotel pricing', 'PricingPreviewModal', 'hotelPreviewEnabled']);
  });
});
