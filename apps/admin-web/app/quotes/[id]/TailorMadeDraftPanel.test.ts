import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const panelSource = readFileSync(new URL('./TailorMadeDraftPanel.tsx', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('./QuoteItineraryWorkspace.tsx', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('Phase R.1c — Tailor-Made Draft Builder panel', () => {
  it('1. renders the panel with a clear draft-only heading + helper text', () => {
    expectSourceContains(panelSource, [
      'Tailor-Made Draft Builder',
      'This creates editable itinerary days only. Hotels, transport, entrances, guides, activities, and pricing will be added in later steps.',
    ]);
  });

  it('2. Preview button calls the preview proxy and renders the day-by-day list', () => {
    expectSourceContains(panelSource, [
      "tailor-made-draft/preview",
      'Preview Draft',
      'Day {day.dayNumber} — {day.title}',
      '{day.narrative}',
      "`Overnight: ${day.overnightCity}`",
      'day.places.join',
    ]);
  });

  it('3. Apply button calls the apply proxy and refreshes the itinerary', () => {
    expectSourceContains(panelSource, [
      "tailor-made-draft/apply",
      'Apply to Quote',
      'router.refresh()',
    ]);
  });

  it('4. a 409 conflict shows a clear, actionable message', () => {
    expectSourceContains(panelSource, [
      'response.status === 409',
      'This quote already has itinerary days. Use “Replace existing itinerary days” if you want to overwrite the draft days.',
    ]);
  });

  it('5. the Replace existing option sends replaceExisting:true', () => {
    expectSourceContains(panelSource, [
      'Replace existing itinerary days',
      'replaceExisting',
      '...buildInput(), replaceExisting',
    ]);
  });

  it('6. the UI never implies priced QuoteItems / pricing were created', () => {
    // success copy explicitly states no priced services were added
    expectSourceContains(panelSource, [
      'No hotels, transport, tickets, guides, or pricing were added.',
    ]);
    // The panel must not POST to any item-creation endpoint nor carry
    // item-write fields. (Phase R.6A-0 adds a READ-ONLY hotel price PREVIEW that
    // displays an estimated cost/sell/markup — that does not create a QuoteItem,
    // so the preview display words are allowed; only item-apply wiring is not.)
    assert.ok(!/\/items\b/.test(panelSource), 'panel must not call the /items endpoint');
    assert.ok(!/useOverride|overrideCost|supplierCost/i.test(panelSource), 'panel must not reference item-write pricing fields');
  });

  it('7. the panel is wired into the live itinerary workspace', () => {
    expectSourceContains(workspaceSource, [
      "import { TailorMadeDraftPanel } from './TailorMadeDraftPanel';",
      '<TailorMadeDraftPanel',
      'quoteId={quote.id}',
    ]);
  });

  it('R.2: read-only "Suggested Hotel Stays" section calls the hotel-suggestions proxy, no apply/pricing', () => {
    expectSourceContains(panelSource, [
      'tailor-made-draft/hotel-suggestions',
      'Preview Hotel Suggestions',
      'Suggested Hotel Stays',
      'Read-only suggestions grouped by overnight city. No hotels have been applied and no pricing has run.',
    ]);
    assert.ok(!/applyHotel|hotelItem/i.test(panelSource), 'no hotel-apply wiring in R.2');
  });

  it('R.2b: candidate hotels render by name + reason under each stay (no contract names, no Apply Hotels)', () => {
    expectSourceContains(panelSource, [
      'tailor-made-hotel-candidates',
      '{c.hotelName}',
      '{c.reason}',
      'No candidate hotels found for this city.',
    ]);
    // still read-only: no contract-name display, no item-write wiring. (R.6A-0
    // adds a disabled "Apply hotel (next phase)" placeholder + read-only price
    // preview; an ENABLED apply / items POST is what must not exist.)
    assert.ok(!/contractName|contract\.name|agreement/i.test(panelSource), 'no contract-name display');
    assert.ok(!/useOverride|overrideCost|supplierCost/i.test(panelSource), 'no item-write pricing fields');
  });

  it('R.3: a read-only "Suggested Transport" section calls the transport-suggestions proxy (no apply/pricing)', () => {
    expectSourceContains(panelSource, [
      'tailor-made-draft/transport-suggestions',
      'Preview Transport Suggestions',
      'Suggested Transport',
      'Read-only planning hints. No transport has been applied and no pricing has run.',
      'Arrival transfer',
      'Touring (full day)',
    ]);
    assert.ok(!/Apply Transport/i.test(panelSource), 'no Apply Transport button in R.3');
    // no raw vehicle-class / pricing leakage in client-style display
    assert.ok(!/Sedan 2|Coaster \d|Daily Full Day \|/i.test(panelSource), 'no raw vehicle/pricing labels');
  });

  it('R.4: a read-only "Suggested Entrances & Activities" section calls the experience-suggestions proxy (no apply/pricing)', () => {
    expectSourceContains(panelSource, [
      'tailor-made-draft/experience-suggestions',
      'Preview Entrances & Activities',
      'Suggested Entrances &amp; Activities',
      'Read-only planning hints. No tickets, entrances, or activities have been applied and no pricing has run.',
      'Entrance',
      'Activity',
    ]);
    // read-only: no Apply button, no pricing fields wired into the section
    assert.ok(!/Apply Entrances|Apply Activities|Apply Tickets/i.test(panelSource), 'no Apply Entrances/Activities button in R.4');
    // raw rate-field leaks must not appear (the R.6A-0 hotel price preview legitimately
    // shows an estimated totalSell/markup, so those words are no longer forbidden panel-wide).
    assert.ok(!/sellPrice|foreignerFeeJod/i.test(panelSource), 'no raw rate fields in the panel');
  });

  it('R.5: a read-only "Suggested Guides" section calls the guide-suggestions proxy (no apply/pricing)', () => {
    expectSourceContains(panelSource, [
      'tailor-made-draft/guide-suggestions',
      'Preview Guide Suggestions',
      'Suggested Guides',
      'Read-only planning hints. No guides have been applied and no pricing has run.',
      "g.guideTypeSuggestion !== 'NONE'",
    ]);
    // read-only: no Apply button, no raw guide metadata / pricing leakage
    assert.ok(!/Apply Guides?/i.test(panelSource), 'no Apply Guides button in R.5');
    assert.ok(!/minPax|maxPax|requiresOperatorConfirmation|Overnight: No/i.test(panelSource), 'no raw guide metadata in R.5 section');
  });

  it('R.6A-0: hotel-stay configure/price-preview calls the read-only options proxy; apply is disabled (next phase)', () => {
    expectSourceContains(panelSource, [
      'tailor-made-draft/hotel-stay-options',
      'Configure & Preview Price',
      'Preview Price',
      'loadHotelStayOptions',
      'availableRoomCategories',
      'availableMealPlans',
      'availableOccupancyTypes',
      'Apply hotel (next phase)',
    ]);
    // the preview must NOT call any apply/items endpoint and the Apply control is disabled
    assert.ok(!/tailor-made-draft\/hotel-apply|\/items\b/.test(panelSource), 'no hotel apply/items POST in R.6A-0');
    assert.ok(/Apply hotel \(next phase\)[^]*?disabled|disabled[^]*?Apply hotel \(next phase\)/.test(panelSource) || panelSource.includes('disabled title="Apply hotels will be enabled in the next phase"'), 'apply hotel button is disabled');
  });
});
