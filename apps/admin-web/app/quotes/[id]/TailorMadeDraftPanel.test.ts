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

  it('6. the draft-day apply never implies priced QuoteItems / pricing were created', () => {
    // success copy explicitly states no priced services were added by the DAY apply
    expectSourceContains(panelSource, [
      'No hotels, transport, tickets, guides, or pricing were added.',
    ]);
    // The panel must never carry raw item-write override fields. (Phase R.6A-1
    // adds a single HOTEL apply via the canonical POST /quotes/:id/items path —
    // allowed — but createItem auto-prices; the panel never sets manual cost
    // overrides.)
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
    // (Phase R.6A-1 adds an explicit per-stay hotel apply; the grouping section
    // header copy above stays accurate — suggestions themselves remain read-only.)
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
      // R.6B-2 — footer reflects the per-day apply workflow (apply shipped in R.6B-1).
      'Preview a price per day, then apply OK days one by one. Each applied day adds one transport service; NO_ROUTE / NO_RATE days stay disabled.',
      'Arrival transfer',
      'Touring (full day)',
    ]);
    // no raw vehicle-class / pricing leakage in client-style display
    assert.ok(!/Sedan 2|Coaster \d|Daily Full Day \|/i.test(panelSource), 'no raw vehicle/pricing labels');
  });

  it('R.4: a read-only "Suggested Entrances & Activities" section calls the experience-suggestions proxy', () => {
    expectSourceContains(panelSource, [
      'tailor-made-draft/experience-suggestions',
      'Preview Entrances & Activities',
      'Suggested Entrances &amp; Activities',
      'Entrance',
      'Activity',
    ]);
    // raw rate-field leaks must not appear (the R.6C-0 estimate uses neutral
    // estimatedCost/estimatedSell, not raw catalog field names).
    assert.ok(!/sellPrice|foreignerFeeJod|costPrice/i.test(panelSource), 'no raw rate fields in the panel');
  });

  it('R.6C-0: experience section shows read-only readiness + gross estimate; apply is a disabled placeholder', () => {
    expectSourceContains(panelSource, [
      // readiness status + estimate display
      "e.matchedServiceId || e.matchedActivityId ? 'MATCHED' : 'NO_MATCH'",
      'est. cost ',
      'sell ',
      '(markup ',
      'Jordan Pass may cover this entrance',
      // disabled next-phase placeholder, no enabled apply
      'Apply experience (next phase)',
      'Read-only readiness + estimated prices only',
    ]);
    // No experience /items POST and no experience apply endpoint in R.6C-0.
    assert.ok(!/tailor-made-draft\/experience-apply/.test(panelSource), 'no experience apply endpoint');
    // The two existing /items POSTs (hotel + transport) are unchanged — no third yet.
    const itemsPosts = panelSource.match(/\/quotes\/\$\{quoteId\}\/items\b/g) || [];
    assert.equal(itemsPosts.length, 2, 'still only hotel + transport apply post to /items (no experience apply yet)');
    // The experience apply placeholder is disabled.
    assert.ok(/Apply experience \(next phase\)/.test(panelSource), 'experience apply placeholder present');
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

  it('R.6A-0: hotel-stay configure/price-preview calls the read-only options proxy', () => {
    expectSourceContains(panelSource, [
      'tailor-made-draft/hotel-stay-options',
      'Configure & Preview Price',
      'Preview Price',
      'loadHotelStayOptions',
      'availableRoomCategories',
      'availableMealPlans',
      'availableOccupancyTypes',
    ]);
  });

  it('R.6A-1: applies ONE configured hotel via the canonical /items path with markup 15 and the selected room/meal/occupancy', () => {
    // The apply posts to the canonical quote-item endpoint (createItem hotel branch),
    // not a parallel hotel-pricing endpoint.
    expectSourceContains(panelSource, [
      'applySelectedHotel',
      'Apply Selected Hotel',
      '/quotes/${quoteId}/items',
      'markupPercent: HOTEL_DEFAULT_MARKUP',
      'const HOTEL_DEFAULT_MARKUP = 15',
      'hotelId: candidate.hotelId',
      'contractId: candidate.contractId',
      'roomCategoryId: preview.roomCategoryId',
      'occupancyType: preview.occupancyType',
      'mealPlan: preview.mealPlan',
      'seasonName: preview.seasonName',
      'nightCount: stay.nights',
      'itineraryId: stay.firstItineraryDayId',
    ]);
    // Apply only after an OK price preview; disabled otherwise (and while applying).
    assert.ok(
      /rateStatus !== 'OK'/.test(panelSource) && /!hotelConfig\.pricePreview/.test(panelSource),
      'apply is gated on an OK price preview',
    );
    assert.ok(/disabled=\{[\s\S]*?hotelApplying[\s\S]*?\}/.test(panelSource), 'apply button is disabled while applying / gated');
    // HOTELS ONLY: the panel never posts transport/ticket/activity/guide apply
    // endpoints — apply reuses the canonical /items path, never a parallel apply route.
    assert.ok(
      !/tailor-made-draft\/(transport|experience|guide|hotel)-apply/.test(panelSource),
      'no transport/experience/guide/hotel apply endpoints',
    );
    // Hotel + transport (R.6B-1) both apply through the canonical /items path.
    const itemsPosts = panelSource.match(/\/quotes\/\$\{quoteId\}\/items\b/g) || [];
    assert.equal(itemsPosts.length, 2, 'hotel apply + transport apply post to /items');
    // The hotelServiceId input is wired in from the workspace.
    expectSourceContains(workspaceSource, ['hotelServiceId', '<TailorMadeDraftPanel']);
  });

  it('R.6A-2: conflict guard is STAY-LEVEL — block the applied stay, keep other stays applyable', () => {
    // Per-stay guard keyed on the stay's first itinerary day (not a global flag).
    expectSourceContains(panelSource, [
      'appliedHotelDayIds',
      'sessionAppliedDayIds',
      'stayHasHotelApplied',
      'stayAppliedThisSession',
      'stay.firstItineraryDayId',
    ]);
    // Apply is disabled only for a stay that already has a hotel, not globally.
    assert.ok(
      /disabled=\{[\s\S]*?stayHasHotelApplied\(stay\.firstItineraryDayId\)[\s\S]*?\}/.test(panelSource),
      'apply disabled is keyed on the per-stay guard',
    );
    // No global "any hotel item" guard remains.
    assert.ok(!/hotelConflict|existingHotelItemCount/.test(panelSource), 'no global hotel-conflict guard remains');
    // Required stay-level messages: applied state + block message.
    expectSourceContains(panelSource, [
      'Hotel applied to this stay.',
      'This stay already has a hotel item. Remove the existing hotel item before applying another hotel to this stay.',
    ]);
    // Applying marks only THIS stay's first day as applied (not a global flag).
    expectSourceContains(panelSource, ['setSessionAppliedDayIds']);
    // Workspace derives the per-day applied set from the itinerary's hotel items.
    expectSourceContains(workspaceSource, [
      'appliedHotelDayIds',
      'quoteItinerary.days',
      'quoteService?.hotel',
    ]);
  });

  it('R.6B-0: read-only transport price preview resolves a route+rate via the canonical calculate endpoint', () => {
    expectSourceContains(panelSource, [
      'loadTransportOptions',
      'resolveTransportPlan',
      '/transport-pricing/calculate',
      'Configure & Preview Price',
      'TRANSPORT_DEFAULT_MARKUP',
      'computeTransportSell',
      // graceful statuses
      "status: 'NO_ROUTE'",
      "status: 'NO_RATE'",
    ]);
    // routes + transportServiceTypes are wired from the workspace.
    expectSourceContains(workspaceSource, ['routes', 'transportServiceTypes', 'tailor-made-transport-resolve']);
  });

  it('R.6B-1: applies ONE OK-priced transport day via the canonical /items path with markup 20 and resolved route/service-type', () => {
    expectSourceContains(panelSource, [
      'applySelectedTransport',
      'Apply Selected Transport',
      '/quotes/${quoteId}/items',
      'transportServiceTypeId: p.serviceTypeId',
      'routeId: p.routeId',
      'markupPercent: TRANSPORT_DEFAULT_MARKUP',
      'itineraryId: t.itineraryDayId',
      'paxCount: defaultPax',
      // per-day guard
      'dayHasTransport',
      'sessionAppliedTransportDayIds',
      'Transport applied to this day.',
      'This day already has transport. Remove the existing transport item before applying another to this day.',
    ]);
    // No transport-apply endpoint — reuses the canonical /items path.
    assert.ok(!/tailor-made-draft\/transport-apply/.test(panelSource), 'no parallel transport apply endpoint');
    // Two /items POSTs now: the hotel apply (R.6A) and the transport apply (R.6B-1).
    const itemsPosts = panelSource.match(/\/quotes\/\$\{quoteId\}\/items\b/g) || [];
    assert.equal(itemsPosts.length, 2, 'hotel apply + transport apply both post to /items');
    // Apply enabled only on OK preview + an unapplied day (disabled otherwise).
    assert.ok(
      /disabled=\{[\s\S]*?transportApplying[\s\S]*?dayHasTransport\(t\.itineraryDayId\)[\s\S]*?transportPreview\.status !== 'OK'[\s\S]*?\}/.test(panelSource),
      'transport apply disabled is gated on OK preview + per-day guard',
    );
    // transportServiceId + appliedTransportDayIds wired from the workspace.
    expectSourceContains(workspaceSource, ['transportServiceId', 'appliedTransportDayIds', 'quoteService?.appliedVehicleRate']);
  });

  it('R.6B-2: transport apply is per-day — remaining OK days stay independently applyable', () => {
    // Apply + guard + status are all keyed on the day's own itineraryDayId, so
    // applying one day never blocks the others (only the same day is blocked).
    expectSourceContains(panelSource, [
      'dayHasTransport(t.itineraryDayId)',
      'dayTransportAppliedThisSession(t.itineraryDayId)',
      'applySelectedTransport(t)',
      // session-applied set ACCUMULATES (multiple days), never replaced.
      'setSessionAppliedTransportDayIds((prev) => (prev.includes(dayId) ? prev : [...prev, dayId]))',
      // per-day status rendered inside the transport .map (so each day shows its own).
      'Transport applied to this day.',
      'This day already has transport. Remove the existing transport item before applying another to this day.',
    ]);
    // The per-day status/guard live INSIDE the transport.map((t) => ...) iteration,
    // not a single global flag — confirms independence across days.
    assert.ok(
      /transport\.map\(\(t\)[\s\S]*?dayHasTransport\(t\.itineraryDayId\)[\s\S]*?\}\)/.test(panelSource),
      'per-day transport guard is evaluated within the day map',
    );
    // NO_RATE / NO_ROUTE days stay disabled: apply is gated on status === 'OK'.
    assert.ok(/transportPreview\.status !== 'OK'/.test(panelSource), 'apply disabled unless the previewed status is OK');
    // No batch-apply control.
    assert.ok(!/Apply All Transport|applyAllTransport/i.test(panelSource), 'no batch transport apply');
  });
});

describe('R.6B-0 — transport resolver constant', () => {
  it('mirrors the transport markup as a shared constant (20)', () => {
    const resolverSource = readFileSync(new URL('./tailor-made-transport-resolve.ts', import.meta.url), 'utf8');
    expectSourceContains(resolverSource, ['export const TRANSPORT_DEFAULT_MARKUP = 20', 'resolveTransportPlan', "'NO_ROUTE'"]);
  });
});
