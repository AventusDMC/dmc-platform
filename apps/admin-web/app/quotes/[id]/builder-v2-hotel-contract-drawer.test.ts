import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — HC-2: read-only hotel contract/rate summary drawer. Source-grep
// tests: the drawer uses the SAFE HC-1/HC-1A summary endpoint, never a raw hotel/
// contract/rate endpoint, never renders raw JSON/objects, shows the "View contract/
// rate" button only for a matched priced hotel line, renders the cost block only on
// payload presence, and exposes no edit/apply/send/lifecycle actions.

const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/hotels-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const proxySrc = readFileSync(new URL('../../api/quotes/[id]/v2/items/[itemId]/hotel-contract-summary/route.ts', import.meta.url), 'utf8');
const typesSrc = readFileSync(new URL('../../../lib/quote-types.ts', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — hotel contract/rate drawer (HC-2)', () => {
  it('HotelContractSummary type matches the safe curated payload (incl. optional cost)', () => {
    contains(typesSrc, [
      'export interface HotelContractSummary',
      'hotel: { name: string | null; city: string | null; category: string | null; preferenceRank: number | null }',
      'contract: {',
      'confidence: string | null',
      'policies: {',
      'supplementsCount: number',
      'mealPlanCodes: string[]',
      'warnings: string[]',
      'export type ViewHotelContractHandler',
    ]);
    // Optional cost block only.
    contains(typesSrc, ['cost?: {', 'tourismFeeCurrency: string | null']);
  });

  it('proxy forwards ONLY to the /hotel-contract-summary endpoint, GET-only', () => {
    contains(proxySrc, ['export async function GET(', '/v2/items/${itemId}/hotel-contract-summary']);
    assert.ok(!/export async function (POST|PATCH|PUT|DELETE)\(/.test(proxySrc), 'proxy must be GET-only');
    // Must not call any raw hotel/contract/rate endpoint.
    assert.ok(!/\/hotels\/|\/hotel-contracts\/|\/hotel-rates\/|\/contracts\//.test(proxySrc), 'proxy must not target a raw hotel/contract/rate endpoint');
  });

  it('client fetches the safe summary proxy (GET) and no raw endpoint', () => {
    contains(clientSrc, [
      'const handleViewHotelContract = async',
      '`/api/quotes/${q.id}/v2/items/${itemId}/hotel-contract-summary`',
      'onViewHotelContract={(itemId: string) => handleViewHotelContract(quote!, itemId)}',
    ]);
    assert.ok(/hotel-contract-summary`,[\s\S]{0,40}method:\s*"GET"/.test(clientSrc), 'summary fetch must be GET');
    assert.ok(!/\/api\/hotels\/|\/api\/hotel-contracts\/|\/hotel-rates\//.test(clientSrc), 'client must not call a raw hotel endpoint');
    assert.ok(!/\.ratePolicies|\.verificationNotes/.test(clientSrc), 'client must not read raw contract internals');
  });

  it('builder threads onViewHotelContract to HotelsStep', () => {
    contains(builderSrc, [
      'onViewHotelContract?: import("../../../lib/quote-types").ViewHotelContractHandler',
      'onViewHotelContract={onViewHotelContract}',
    ]);
  });

  it('View button only for a matched priced hotel line; drawer renders curated fields', () => {
    contains(stepSrc, [
      'onViewHotelContract?: ViewHotelContractHandler',
      'const canViewContract = Boolean(onViewHotelContract && hotel.pricedQuoteItemId)',
      'View contract/rate',
      'onViewHotelContract(hotel.pricedQuoteItemId)',
      'function HotelContractDrawer(',
      'role="dialog"',
      'Contract status',
      'Room category',
      'Meal plan codes',
      'Cost (internal)',
    ]);
    // Cost block only on payload presence; warnings rendered.
    contains(stepSrc, ['{summary.cost ? (', 'summary.warnings.map']);
  });

  it('drawer/step render NO raw JSON / raw objects / PII / lifecycle actions', () => {
    const drawer = stepSrc.slice(stepSrc.indexOf('function HotelContractDrawer('), stepSrc.indexOf('function HotelContractDrawer(') + 5000);
    for (const forbidden of ['JSON.stringify', 'ratePolicies', 'verificationNotes', 'passenger', 'contactEmail', 'clientCompany', 'brandCompany', 'workflowDiagnostics', 'publicToken', 'quoteItems', 'booking', 'invoice', 'restore', 'rollback']) {
      assert.ok(!drawer.includes(forbidden), `drawer must not reference ${forbidden}`);
    }
    // The drawer must not offer edit/apply/send/lifecycle controls.
    assert.ok(!/onApply|Apply hotel price|onSend|Mark as Sent|Edit contract/.test(drawer), 'drawer must have no edit/apply/send actions');
  });

  it('ambiguous rows keep the existing "resolve in Classic" note and get no View button', () => {
    // The View button is gated on pricedQuoteItemId (undefined for ambiguous rows),
    // and the existing ambiguous-match note is preserved.
    contains(stepSrc, ['duplicate in Classic Builder.', 'hotel.pricingMatchAmbiguous && !hotel.pricedQuoteItemId']);
  });
});
