import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const clientSrc = read('./builder-v2/builder-v2-client.tsx');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');
const matcherSrc = read('../../../lib/quote-hotel-line-match.ts');
const hotelsSrc = read('../../../components/quote/v2/steps/hotels-step.tsx');
const typesSrc = read('../../../lib/quote-types.ts');
const flagsSrc = read('../../../../api/src/quotes/quote-pricing-preview-flags.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
}

describe('Hotel Apply UX + row-mapping hardening (PR #583)', () => {
  // ---- 1+2. success toast survives router.refresh(); shows even on Δ0 ----
  it('apply success toast lives in the client (survives router.refresh) and shows on every applied result', () => {
    contains(clientSrc, [
      'const [applyToast, setApplyToast] = useState<{ text: string } | null>(null)',
      'if (parsed?.applied) {',
      'setApplyToast(',
      'router.refresh()',
      'role="status"',
      'aria-live="polite"',
      'fixed bottom-4 right-4', // rendered outside the modal so refresh/close can't clobber it
      'Pricing applied successfully.',
    ]);
    // The toast is set on applied===true with NO delta condition → visible on Δ0.
    const applyIdx = clientSrc.indexOf('if (parsed?.applied) {');
    const region = clientSrc.slice(applyIdx, applyIdx + 600);
    excludes(region, ['delta', 'Delta', 'deltaNonZero']);
    contains(region, ['setApplyToast(']);
  });

  // ---- pure stable-id matcher exists ----
  it('a pure, dependency-free matcher resolves rows by stable id with ambiguity detection', () => {
    contains(matcherSrc, [
      'export function matchPricedHotelLine',
      'l.hotelId === row.hotelId',
      'l.roomCategoryId === row.roomCategoryId',
      'status: "ambiguous"',
      'status: "matched"',
      'status: "none"',
    ]);
  });

  // ---- 3+4. adapter uses stable ids, not name-only; ambiguous → no target ----
  it('adapter matches hotel rows via matchPricedHotelLine (stable ids), not a name-only map', () => {
    contains(adapterSrc, [
      'import { matchPricedHotelLine',
      'const pricedHotelLines: PricedHotelLine[] = []',
      'matchPricedHotelLine(key, pricedHotelLines)',
      'matchHotelRow({ hotelId: ho.hotelId, roomCategoryId: ho.roomCategoryId, name: ho.hotelNameSnapshot })',
      // ambiguous rows get NO preview/apply target (resolved from backend metadata
      // when present, else the heuristic; both feed optPricedQuoteItemId/optAmbiguous)
      'pricedQuoteItemId: optPricedQuoteItemId',
      'pricingMatchAmbiguous: optAmbiguous',
    ]);
    // The old name-only collapsing map must be gone.
    excludes(adapterSrc, ['const hotelLineByName = new Map', 'hotelLineByName.set(', 'matchHotelLine(']);
    // stable ids are surfaced on the option type
    contains(adapterSrc, ['hotelId?: string | null', 'roomCategoryId?: string | null']);
    // carried through the city mapper
    contains(adapterSrc, ['pricingMatchAmbiguous: typeof ro.pricingMatchAmbiguous === "boolean"']);
  });

  // ---- type carries the ambiguity signal ----
  it('HotelSelection exposes pricingMatchAmbiguous', () => {
    contains(typesSrc, ['pricingMatchAmbiguous?: boolean']);
  });

  // ---- 4+5. ambiguous rows hide apply + show helper text; matched still gated ----
  it('hotels step hides apply for ambiguous rows and shows safe helper text', () => {
    contains(hotelsSrc, [
      'const ambiguousMatch = Boolean(',
      'hotel.pricingMatchAmbiguous && !hotel.pricedQuoteItemId',
      'Multiple priced hotel lines match this hotel',
      'Resolve',
    ]);
    // Apply still requires a concrete pricedQuoteItemId (so ambiguous → no apply).
    contains(hotelsSrc, [
      'const canApply = Boolean(canPreview && onApplyItemPricing && hotelApplyEnabled && hotel.pricedQuoteItemId)',
      'const canPreview = Boolean(onPreviewItem && hotel.pricedQuoteItemId && hotelPreviewEnabled)',
    ]);
  });

  // ---- 8+9. this hardening PR did not add its own transport/external apply flag ----
  it('hotel hardening did not weaken the hotel apply flag (later scopes are separate)', () => {
    // External-package (#590) and transport Phase T-A apply landed later behind their
    // own flags; the hotel hardening PR only touched hotel row-matching + toast.
    contains(flagsSrc, ["export const QUOTE_PRICING_HOTEL_APPLY_FLAG = 'quote.pricingHotelApply'"]);
  });

  // ---- apply semantics unchanged: client still posts the same apply-preview ----
  it('apply semantics unchanged (same apply-preview endpoint + token + ack)', () => {
    contains(clientSrc, [
      '/items/${quoteItemId}/apply-preview',
      'JSON.stringify({ ...payload, previewToken, acknowledgedDelta })',
    ]);
  });
});
