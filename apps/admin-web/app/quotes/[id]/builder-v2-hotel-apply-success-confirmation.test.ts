import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const clientSrc = read('./builder-v2/builder-v2-client.tsx');
const modalSrc = read('../../../components/quote/v2/steps/pricing-preview-modal.tsx');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

describe('Hotel Apply success confirmation polish (PR #586)', () => {
  it('1. confirmation is a client-level toast that survives router.refresh()', () => {
    contains(clientSrc, [
      'const [applyToast, setApplyToast] = useState<{ text: string } | null>(null)',
      'if (parsed?.applied) {',
      'setApplyToast(',
      'router.refresh()',
      'role="status"',
      'aria-live="polite"',
      'fixed bottom-4 right-4', // rendered at client level, outside the modal tree
    ]);
  });

  it('2. shown on every applied result — no delta gate (visible on Δ0)', () => {
    const idx = clientSrc.indexOf('if (parsed?.applied) {');
    const region = clientSrc.slice(idx, idx + 700);
    contains(region, ['setApplyToast(']);
    excludes(region, ['delta', 'Delta', 'deltaNonZero']);
  });

  it('3. toast is dismiss-only (no auto-timeout) with an explicit dismiss control', () => {
    // The prior 6s auto-dismiss is gone → the confirmation persists until dismissed.
    excludes(clientSrc, ['setTimeout(() => setApplyToast(null)', 'setApplyToast(null), 6000']);
    contains(clientSrc, ['onClick={() => setApplyToast(null)}', 'aria-label="Dismiss"']);
  });

  it('4. copy is explicit success + quote total when available', () => {
    contains(clientSrc, ['Pricing applied successfully.', 'Quote total is now ']);
  });

  it('5. the hotel modal CLOSES on successful apply so the toast is unobstructed', () => {
    const idx = modalSrc.indexOf('if (res?.applied) {');
    assert.ok(idx >= 0, 'expected a res.applied success branch in the modal');
    const region = modalSrc.slice(idx, idx + 500);
    contains(region, ['onClose()']);
  });

  it('6. apply request semantics unchanged (same payload/token/ack; no direct fetch/mutation in the modal)', () => {
    contains(modalSrc, ['onApply(quoteItemId, {}, previewToken, deltaNonZero ? ack : false)']);
    excludes(modalSrc, ['fetch(', "method: 'POST'", 'method: "POST"', "method: 'PATCH'", 'apply-preview']);
    // client still posts to the same apply-preview endpoint with the same body.
    contains(clientSrc, ['/items/${quoteItemId}/apply-preview', 'JSON.stringify({ ...payload, previewToken, acknowledgedDelta })']);
  });
});
