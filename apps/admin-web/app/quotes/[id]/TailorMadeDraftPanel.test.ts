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

  it('S.2A: the risky free-text generate fields are controlled dropdowns with a Custom fallback', () => {
    expectSourceContains(panelSource, [
      // shared select-with-custom helper + Custom escape value
      'function SelectWithCustom',
      "const CUSTOM_OPTION_VALUE = '__custom__'",
      'Custom…',
      // option catalogs
      "const HOTEL_CATEGORY_OPTIONS = ['3-star', '4-star', '5-star', 'Mixed']",
      "const ARRIVAL_POINT_OPTIONS = ['QAIA', 'Amman', 'Aqaba', 'Allenby', 'Sheikh Hussein', 'Wadi Araba']",
      "const ITINERARY_CITY_OPTIONS = ['Amman', 'Dead Sea', 'Petra', 'Wadi Rum', 'Aqaba', 'Ajloun']",
      "const GUIDE_TYPE_OPTIONS = ['local', 'escort', 'none']",
      "const CURRENCY_OPTIONS = ['USD', 'JOD', 'EUR']",
      // each S.2A field wired to a controlled select (still lifting a plain string)
      'value={hotelCategory} onChange={setHotelCategory} options={HOTEL_CATEGORY_OPTIONS}',
      'value={arrivalCity} onChange={setArrivalCity} options={ITINERARY_CITY_OPTIONS}',
      'value={arrivalAirport} onChange={setArrivalAirport} options={ARRIVAL_POINT_OPTIONS}',
      'value={departureCity} onChange={setDepartureCity} options={ITINERARY_CITY_OPTIONS}',
      'value={departureAirport} onChange={setDepartureAirport} options={ARRIVAL_POINT_OPTIONS}',
      'value={guideType} onChange={setGuideType} options={GUIDE_TYPE_OPTIONS}',
      'value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS}',
      // trip style: friendly labels mapped to existing backend-safe enum values
      "{ value: 'classic', label: 'Classic Jordan' }",
      "{ value: 'religious', label: 'Christian / Biblical' }",
    ]);
    // Backend-unsafe trip styles are NOT exposed as selectable options in S.2A.
    assert.ok(!/label: 'Islamic Heritage'/.test(panelSource), 'Islamic Heritage not exposed as an option');
    assert.ok(!/value: 'family'/.test(panelSource), 'family not exposed as a trip-style value');
    // The submit contract is unchanged — buildInput still emits requiredPlaces +
    // optionalPlaces as string[] (S.2C changed HOW they're collected, not the shape).
    expectSourceContains(panelSource, ['requiredPlaces: [...INCLUDED_PLACES]', 'optionalPlaces: OPTIONAL_ADDON_PLACES.filter']);
  });

  it('S.2C: required/optional places use one grouped selector (fixed included + toggleable add-ons)', () => {
    expectSourceContains(panelSource, [
      // grouped selector legends + helper copy
      'Included in this route',
      'Optional add-ons',
      'These places are part of the current 8-day classic route. Route-level editing will come in a later phase.',
      'Select optional places to weave into the draft itinerary and service suggestions.',
      // place-group constants
      "const INCLUDED_PLACES = ['Amman', 'Petra', 'Wadi Rum', 'Dead Sea']",
      "const OPTIONAL_ADDON_PLACES = ['Jerash', 'Madaba', 'Mount Nebo', 'Bethany']",
      // included = read-only chips (not editable), mapped from the fixed list
      'INCLUDED_PLACES.map((place) =>',
      'place-chip-fixed',
      'aria-disabled="true"',
      // optional add-ons = toggleable checkboxes mapped from the add-on list
      'OPTIONAL_ADDON_PLACES.map((place) =>',
      // buildInput preserves the payload shape: both stay string[]
      'requiredPlaces: [...INCLUDED_PLACES]',
      'optionalPlaces: OPTIONAL_ADDON_PLACES.filter((p) => optionalSelected[p])',
    ]);
    // Default selection preserves today's behavior — all four add-ons start on.
    expectSourceContains(panelSource, [
      'Jerash: true',
      'Madaba: true',
      "'Mount Nebo': true",
      'Bethany: true',
    ]);
    // The old comma free-text Required Places input + state are gone.
    assert.ok(!panelSource.includes('Required places (comma-separated)'), 'comma-based Required Places input removed');
    assert.ok(!/const \[requiredPlaces, setRequiredPlaces\]/.test(panelSource), 'requiredPlaces free-text state removed');
    // The old flat OPTIONAL_PLACES list (with deferred Ajloun/Aqaba) is gone.
    assert.ok(!panelSource.includes('OPTIONAL_PLACES'), 'old flat OPTIONAL_PLACES list removed');
    // Deferred / narrative-only places are NOT in either place GROUP. (Scope the
    // check to the two place-group consts: Ajloun/Aqaba legitimately appear in the
    // S.2A city/airport dropdown catalogs, which are a different control.)
    const placeConsts = (panelSource.match(/const (?:INCLUDED_PLACES|OPTIONAL_ADDON_PLACES) =[^;]*/g) || []).join(' ');
    for (const deferred of ['Ajloun', 'Kerak', 'Little Petra', 'Aqaba', 'Umm Qais', 'Pella', 'Salt', 'Blessed Tree', 'Jordan Valley Islamic Sites', "Mu'ta"]) {
      assert.ok(!placeConsts.includes(deferred), `deferred place not exposed in place groups: ${deferred}`);
    }
  });

  it('S.2B-3: Overnight Sequence is submitted via buildInput when valid + gates Apply', () => {
    expectSourceContains(panelSource, [
      // section + S.2B-3 helper copy (controls overnights → hotel stay suggestions)
      '<legend>Overnight Sequence</legend>',
      'This sequence controls where the clients overnight and is used to generate hotel stay suggestions.',
      // sightseeing separation kept
      'Sightseeing places are controlled separately above',
      // city options + default 8-day classic sequence (still present from S.2B-1)
      "const OVERNIGHT_CITY_OPTIONS = ['Amman', 'Dead Sea', 'Petra', 'Wadi Rum', 'Aqaba', 'Ajloun']",
      "{ city: 'Amman', nights: 2 }",
      "{ city: 'Petra', nights: 1 }",
      "{ city: 'Wadi Rum', nights: 1 }",
      "{ city: 'Dead Sea', nights: 3 }",
      'options={OVERNIGHT_CITY_OPTIONS}',
      'type="number"',
      'min={1}',
      'Math.max(1, Number(e.target.value) || 1)',
      'Total nights: {totalNights} / {expectedNights}',
      // validity (drives submission + Apply gate)
      'const expectedOvernightNights = (Number(durationDays) || 8) - 1',
      'const overnightTotalNights = overnightSequence.reduce',
      'const overnightSequenceValid =',
      'overnightTotalNights === expectedOvernightNights',
      // unbalanced → warning (now enforced, not preview-only)
      'so it will not be applied to the generated draft',
      // Apply is blocked while invalid (guard + disabled button). The disabled
      // expression is the combined gate `applyBlocked`, which includes
      // !overnightSequenceValid (plus the hotfix non-8-day basic-shell confirm).
      'if (!overnightSequenceValid)',
      'disabled={applying || applyBlocked}',
      // add/remove rows
      '+ Add overnight',
      'Remove overnight row',
    ]);
    // S.2B-3 contract: buildInput() submits overnightSequence ONLY when valid.
    const start = panelSource.indexOf('function buildInput');
    assert.ok(start >= 0, 'buildInput present');
    const buildInputBody = panelSource.slice(start, start + 1100);
    assert.ok(buildInputBody.includes('if (overnightSequenceValid)'), 'buildInput guards the overnightSequence submission on validity');
    assert.ok(
      buildInputBody.includes('input.overnightSequence = overnightSequence.map'),
      'buildInput submits the mapped { city, nights } sequence when valid',
    );
    // The preview-only wording is gone (the sequence now shapes the draft).
    assert.ok(!panelSource.includes('planning preview only in this phase'), 'old preview-only helper copy removed');
    assert.ok(!panelSource.includes('Preview only — not enforced in this phase.'), 'old preview-only warning removed');
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

  it('Hotfix: non-8-day durations warn + gate Apply; 8-day classic behavior unchanged', () => {
    expectSourceContains(panelSource, [
      // duration classifier + apply gate
      'const isClassicDuration = (Number(durationDays) || 8) === 8',
      'const applyBlocked = !overnightSequenceValid || (!isClassicDuration && !basicShellConfirmed)',
      'const [basicShellConfirmed, setBasicShellConfirmed] = useState(false)',
      // exact warning copy shown for non-8-day durations
      'The structured route builder is currently optimized for the 8-day classic Jordan program. Other durations will create a basic day shell only. Route-level editing will come in the next phase.',
      // banner only renders when NOT the classic duration
      '{!isClassicDuration ? (',
      // basic-shell confirmation checkbox
      'checked={basicShellConfirmed}',
      // Included chips clarified as 8-day-only when non-classic
      "(8-day classic route only)",
      'these are NOT guaranteed to be placed',
      // Apply button uses the combined gate; handleApply guards confirmation too
      'disabled={applying || applyBlocked}',
      'if (!isClassicDuration && !basicShellConfirmed)',
    ]);
    // 8-day classic behavior is UNCHANGED — the original Included helper copy and
    // the S.2B-3 Apply gate still exist; the guard only adds a non-classic branch.
    expectSourceContains(panelSource, [
      'These places are part of the current 8-day classic route. Route-level editing will come in a later phase.',
    ]);
    // Preview is NOT hard-blocked for non-8-day (operator may still preview the
    // shell); only Apply is gated.
    assert.ok(panelSource.includes('onClick={handlePreview} disabled={previewing}'), 'Preview stays enabled regardless of duration');
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

  it('R.6C-0: experience section shows read-only readiness + gross estimate', () => {
    expectSourceContains(panelSource, [
      // readiness status + estimate display
      "e.matchedServiceId || e.matchedActivityId ? 'MATCHED' : 'NO_MATCH'",
      'est. cost ',
      'sell ',
      '(markup ',
      'Jordan Pass may cover this entrance',
    ]);
  });

  it('R.6C-1: applies one matched experience via the canonical /items path with activity ids + markup 20', () => {
    expectSourceContains(panelSource, [
      // canonical apply path + handler
      'async function applySelectedExperience',
      '/quotes/${quoteId}/items',
      // activity branch carries activityId + the matched variant
      'payload.activityId = e.matchedActivityId',
      'payload.activityRateVariantId = e.matchedActivityRateVariantId',
      // entrance/ticket branch carries the matched service id
      'payload.serviceId = e.matchedServiceId',
      // standard experience markup constant (== API EXPERIENCE_DEFAULT_MARKUP)
      'const EXPERIENCE_DEFAULT_MARKUP = 20',
      'markupPercent: EXPERIENCE_DEFAULT_MARKUP',
      // pax drives the engine (basis / maxPaxPerUnit honoured server-side)
      'paxCount: pax',
      'participantCount: pax',
      // per-(day, record) conflict guard + message
      'const EXPERIENCE_CONFLICT_MESSAGE',
      'This experience is already applied to this day.',
      'const experienceApplied',
      'experienceApplied(e)',
      'appliedExperienceKeys',
      // enabled apply button + single-unit label
      'onClick={() => applySelectedExperience(e)}',
      'Applied to this day',
      'single-unit estimate; final total calculated on apply based on pax',
    ]);
    // The placeholder is gone — apply is real now.
    assert.ok(!/Apply experience \(next phase\)/.test(panelSource), 'no next-phase placeholder remains');
    // NO_MATCH suggestions keep a disabled apply button.
    assert.ok(/readiness === 'NO_MATCH' \? \(\s*<button[^>]*disabled/m.test(panelSource), 'NO_MATCH apply button is disabled');
    // Now three /items POSTs: hotel + transport + experience.
    const itemsPosts = panelSource.match(/\/quotes\/\$\{quoteId\}\/items\b/g) || [];
    assert.equal(itemsPosts.length, 4, 'hotel + transport + experience + guide apply post to /items');
    // Still no parallel experience-apply endpoint — canonical path only.
    assert.ok(!/tailor-made-draft\/experience-apply/.test(panelSource), 'no parallel experience apply endpoint');
  });

  it('R.5/R.6D-0: read-only "Suggested Guides" section with readiness + estimate', () => {
    expectSourceContains(panelSource, [
      'tailor-made-draft/guide-suggestions',
      'Preview Guide Suggestions',
      'Suggested Guides',
      "g.guideTypeSuggestion !== 'NONE'",
      // R.6D-0 readiness + read-only estimate display
      "g.guideTypeSuggestion === 'LOCAL' ? 'MATCHED' : 'NONE'",
      'est. cost ',
      'sell ',
      '(markup ',
    ]);
    // No raw guide metadata leaks into the section.
    assert.ok(!/minPax|maxPax|requiresOperatorConfirmation|Overnight: No/i.test(panelSource), 'no raw guide metadata in guides section');
  });

  it('R.6D-1: applies one matched local guide via the canonical /items guide branch with per-day guard', () => {
    expectSourceContains(panelSource, [
      'async function applySelectedGuide',
      '/quotes/${quoteId}/items',
      'serviceId: guideServiceId',
      "guideType: 'local'",
      "guideDuration: 'full_day'",
      'overnight: false',
      'markupPercent: GUIDE_DEFAULT_MARKUP',
      'const GUIDE_DEFAULT_MARKUP = 20',
      // per-day guard + message
      'const GUIDE_DAY_CONFLICT_MESSAGE',
      'This day already has a guide item.',
      'const dayHasGuide',
      'dayHasGuide(g.itineraryDayId)',
      'appliedGuideDayIds',
      // enabled apply button (MATCHED) + applied state
      'onClick={() => applySelectedGuide(g)}',
      'Guide applied to this day',
    ]);
    // The next-phase placeholder is gone — apply is real now.
    assert.ok(!/Apply guide \(next phase\)/.test(panelSource), 'no next-phase guide placeholder remains');
    // Canonical path only — no parallel guide-apply endpoint.
    assert.ok(!/tailor-made-draft\/guide-apply/.test(panelSource), 'no parallel guide apply endpoint');
    // Escort stays a planning note, never an apply target (apply gated on LOCAL/MATCHED).
    assert.ok(/g\.guideTypeSuggestion !== 'LOCAL'/.test(panelSource), 'guide apply rejects non-local (escort) suggestions');
    // Four /items POSTs now: hotel + transport + experience + guide.
    const itemsPosts = panelSource.match(/\/quotes\/\$\{quoteId\}\/items\b/g) || [];
    assert.equal(itemsPosts.length, 4, 'hotel + transport + experience + guide apply post to /items');
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
    // Hotel + transport (R.6B-1) + experience (R.6C-1) apply through the canonical /items path.
    const itemsPosts = panelSource.match(/\/quotes\/\$\{quoteId\}\/items\b/g) || [];
    assert.equal(itemsPosts.length, 4, 'hotel + transport + experience + guide apply post to /items');
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
    // /items POSTs: hotel (R.6A) + transport (R.6B-1) + experience (R.6C-1).
    const itemsPosts = panelSource.match(/\/quotes\/\$\{quoteId\}\/items\b/g) || [];
    assert.equal(itemsPosts.length, 4, 'hotel + transport + experience + guide apply post to /items');
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
