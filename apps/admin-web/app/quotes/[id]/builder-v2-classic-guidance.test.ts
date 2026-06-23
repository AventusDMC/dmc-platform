import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const guidanceSrc = readFileSync(new URL('../../../components/quote/v2/steps/classic-guidance.tsx', import.meta.url), 'utf8');
const setupSrc = readFileSync(new URL('../../../components/quote/v2/steps/setup-step.tsx', import.meta.url), 'utf8');
const hotelsSrc = readFileSync(new URL('../../../components/quote/v2/steps/hotels-step.tsx', import.meta.url), 'utf8');
const experiencesSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');
const transportSrc = readFileSync(new URL('../../../components/quote/v2/steps/transport-step.tsx', import.meta.url), 'utf8');
const pricingSrc = readFileSync(new URL('../../../components/quote/v2/steps/pricing-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const passengersSrc = readFileSync(new URL('../../../components/quote/v2/steps/passengers-step.tsx', import.meta.url), 'utf8');
const itinerarySrc = readFileSync(new URL('../../../components/quote/v2/steps/itinerary-step.tsx', import.meta.url), 'utf8');
const proposalSrc = readFileSync(new URL('../../../components/quote/v2/steps/proposal-step.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
  }
}

describe('Quote Builder V2 — Classic guidance banners', () => {
  it('defines a reusable, presentational ClassicGuidance banner with an Open Classic Builder link', () => {
    contains(guidanceSrc, [
      'export function ClassicGuidance',
      'message',
      'classicHref',
      'Open Classic Builder',
      'href={classicHref}',
    ]);
    // Purely presentational — the banner must never perform any mutation/fetch.
    excludes(guidanceSrc, [
      'fetch(',
      "method: 'POST'",
      "method: 'PATCH'",
      "method: 'DELETE'",
      'method: "POST"',
      'method: "PATCH"',
      'method: "DELETE"',
    ]);
  });

  it('Setup step renders the exact Classic-only guidance message + classic link', () => {
    contains(setupSrc, [
      'import { ClassicGuidance } from "./classic-guidance"',
      '<ClassicGuidance',
      'Quote setup, client details, travel dates, currency, pax counts, room counts, FOC, and single supplement are managed in Classic Builder.',
      'classicHref={classicHref}',
      'classicHref?: string',
    ]);
  });

  it('Hotels step renders the exact Classic-only guidance message + classic link', () => {
    contains(hotelsSrc, [
      'import { ClassicGuidance } from "./classic-guidance"',
      '<ClassicGuidance',
      'Full hotel editing, adding/removing options, room categories, contracts, and manual rates are managed in Classic Builder. V2 currently supports Set as primary only where available.',
      'classicHref={classicHref}',
      'classicHref?: string',
    ]);
  });

  it('Experiences step renders the exact Classic-only guidance message + classic link', () => {
    contains(experiencesSrc, [
      'import { ClassicGuidance } from "./classic-guidance"',
      '<ClassicGuidance',
      'Adding, removing, and pricing services, activities, entrance fees, meals, guides, and external packages are managed in Classic Builder. V2 currently supports limited client text editing only where available.',
      'classicHref={classicHref}',
      'classicHref?: string',
    ]);
  });

  it('Transport step renders the exact Classic-only guidance message + classic link', () => {
    contains(transportSrc, [
      'import { ClassicGuidance } from "./classic-guidance"',
      '<ClassicGuidance',
      'Adding, removing, supplier/rate assignment, touring routes, transfers, and priced transport changes are managed in Classic Builder. V2 currently supports limited client text editing only where available.',
      'classicHref={classicHref}',
      'classicHref?: string',
    ]);
  });

  it('Pricing step renders the exact Classic-only guidance message + classic link', () => {
    contains(pricingSrc, [
      'import { ClassicGuidance } from "./classic-guidance"',
      '<ClassicGuidance',
      'Pricing, markups, overrides, pax/room counts, FOC, single supplement, and recalculation are managed in Classic Builder. V2 pricing is read-only.',
      'classicHref={classicHref}',
      'classicHref?: string',
    ]);
  });

  it('builder threads the /quotes/[id]/classic href into all five Classic-only steps', () => {
    contains(builderSrc, [
      '<SetupStep fields={quote.setupFields} classicHref={`/quotes/${quote.id}/classic`} />',
      '<PricingStep pricing={quote.pricing} classicHref={`/quotes/${quote.id}/classic`} />',
    ]);
    // HotelsStep / ExperiencesStep / TransportStep carry the same classic href.
    const hrefCount = builderSrc.split('classicHref={`/quotes/${quote.id}/classic`}').length - 1;
    assert.ok(hrefCount >= 6, `Expected at least 6 classicHref usages (5 banner steps + passengers), found ${hrefCount}`);
  });

  it('does NOT add guidance banners to the already-editable steps (itinerary, passengers, proposal)', () => {
    excludes(itinerarySrc, ['ClassicGuidance']);
    excludes(passengersSrc, ['ClassicGuidance']);
    excludes(proposalSrc, ['ClassicGuidance']);
  });
});
