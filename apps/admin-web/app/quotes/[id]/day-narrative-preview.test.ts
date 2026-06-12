import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDayNarrativePreview, isClientSafeNarrative } from './day-narrative-preview';

// Phase R.7A-1 — English client narrative preview from route/day text only.
// Pure + deterministic; no services, no network, no save.

describe('R.7A-1 — buildDayNarrativePreview (route/day text only)', () => {
  it('1. Amman / Madaba / Mount Nebo / Petra → depart-and-visit narrative', () => {
    const { text, sourceLayer } = buildDayNarrativePreview({ title: 'Amman / Madaba / Mount Nebo / Petra' });
    assert.equal(
      text,
      'After breakfast, depart Amman and visit Madaba, known for its ancient mosaic map, then continue to Mount Nebo, the traditional viewpoint over the Promised Land. Afterwards, proceed south to Petra for overnight.',
    );
    assert.equal(sourceLayer, 'route');
  });

  it('2. Petra Visit / Wadi Rum → visit-origin then continue', () => {
    const { text } = buildDayNarrativePreview({ title: 'Petra Visit / Wadi Rum' });
    assert.equal(
      text,
      'After breakfast, visit Petra, the rose-red city and one of Jordan’s most famous archaeological sites. Later, continue to Wadi Rum for overnight.',
    );
  });

  it('3. Wadi Rum / Dead Sea → transition with bespoke opener', () => {
    const { text } = buildDayNarrativePreview({ title: 'Wadi Rum / Dead Sea' });
    assert.equal(
      text,
      'Enjoy the desert scenery of Wadi Rum before continuing to the Dead Sea, the lowest point on earth, for overnight.',
    );
  });

  it('4. Dead Sea / Bethany / Dead Sea → round-trip, return to base', () => {
    const { text } = buildDayNarrativePreview({ title: 'Dead Sea / Bethany / Dead Sea' });
    assert.equal(
      text,
      'After breakfast, visit Bethany, the Baptism Site on the Jordan River, then return to the Dead Sea for overnight.',
    );
  });

  it('5. Arrival day preview is client-safe', () => {
    const { text, flags } = buildDayNarrativePreview({
      title: 'Arrival Amman',
      notes: 'Meet & assist at Queen Alia International Airport (QAIA) and transfer to your hotel in Amman. Overnight in Amman.',
    });
    assert.equal(text, 'On arrival, meet and assist at the airport, then transfer to Amman for overnight.');
    assert.ok(flags.includes('arrival'));
  });

  it('6. Departure day preview is client-safe', () => {
    const { text, flags } = buildDayNarrativePreview({
      title: 'Departure',
      notes: 'Transfer from the Dead Sea to Queen Alia International Airport (QAIA) for your departure flight.',
    });
    assert.equal(text, 'Transfer from the Dead Sea to the airport for your departure flight.');
    assert.ok(flags.includes('departure'));
    assert.ok(!/overnight/i.test(text), 'departure has no overnight clause');
  });

  it('7. Unknown place falls back safely to "visit <place>" with no descriptor', () => {
    const { text, flags } = buildDayNarrativePreview({ title: 'Karak Visit / Petra' });
    assert.equal(text, 'After breakfast, visit Karak. Later, continue to Petra for overnight.');
    assert.ok(flags.includes('unknown-place'));
  });

  it('8. Same input returns identical output (deterministic)', () => {
    const input = { title: 'Amman / Madaba / Mount Nebo / Petra', notes: 'x', dayNumber: 3 };
    const a = buildDayNarrativePreview(input);
    const b = buildDayNarrativePreview(input);
    assert.equal(a.text, b.text);
    assert.deepEqual(a.flags, b.flags);
  });

  it('9. Leakage: supplier / contract / cost / markup / vehicle class / internal code / "Overnight: No" are scrubbed', () => {
    const dirty = buildDayNarrativePreview({
      title: 'Petra (cost USD 500, supplier Alpha Tours, Coaster 30%, contract C-2026, code ABC123) Visit / Wadi Rum',
      notes: 'Overnight: No. markup 18%. vehicle Hiace. internal XZ99.',
    });
    const leaks = [
      'supplier',
      'Alpha',
      'contract',
      'C-2026',
      'cost',
      'USD',
      '500',
      'markup',
      '18%',
      'vehicle',
      'Hiace',
      'Coaster',
      '30%',
      'ABC123',
      'XZ99',
      'Overnight: No',
    ];
    for (const token of leaks) {
      assert.ok(!dirty.text.includes(token), `preview must not contain "${token}" — got: ${dirty.text}`);
    }
    // The clean place names still resolve to their curated descriptors.
    assert.ok(dirty.text.includes('Petra, the rose-red city'), 'clean Petra descriptor still applied');
    assert.ok(dirty.text.includes('Wadi Rum'), 'clean Wadi Rum still present');
  });

  it('bonus: Amman / Jerash / Amman round-trip reads cleanly', () => {
    const { text } = buildDayNarrativePreview({ title: 'Amman / Jerash / Amman' });
    assert.equal(
      text,
      'After breakfast, visit Jerash, one of the best-preserved Roman cities in the region, then return to Amman for overnight.',
    );
  });
});

describe('R.7A-2 — applied services woven into the preview (applied wins; no suggestions)', () => {
  it('1. route-only output is byte-identical when no applied services are passed (empty or omitted)', () => {
    const omitted = buildDayNarrativePreview({ title: 'Petra Visit / Wadi Rum' });
    const empty = buildDayNarrativePreview({ title: 'Petra Visit / Wadi Rum', appliedServices: [] });
    assert.equal(empty.text, omitted.text);
    assert.equal(empty.sourceLayer, 'route');
    assert.equal(empty.usedServices.length, 0);
  });

  it('2. applied Petra entrance + local guide enriches the Petra preview safely', () => {
    const { text, sourceLayer, usedServices } = buildDayNarrativePreview({
      title: 'Petra Visit / Wadi Rum',
      appliedServices: [{ kind: 'entrance', name: 'Petra' }, { kind: 'guide' }],
    });
    assert.equal(
      text,
      'After breakfast, visit Petra, the rose-red city and one of Jordan’s most famous archaeological sites, with a local guide. Later, continue to Wadi Rum for overnight.',
    );
    assert.equal(sourceLayer, 'service-aware');
    assert.deepEqual(usedServices, ['guide']);
  });

  it('3. applied Jerash entrance + local guide enriches the Jerash round-trip safely', () => {
    const { text, sourceLayer } = buildDayNarrativePreview({
      title: 'Amman / Jerash / Amman',
      appliedServices: [{ kind: 'entrance', name: 'Jerash' }, { kind: 'guide' }],
    });
    assert.equal(
      text,
      'After breakfast, visit Jerash, one of the best-preserved Roman cities in the region, with a local guide, then return to Amman for overnight.',
    );
    assert.equal(sourceLayer, 'service-aware');
  });

  it('4. applied Wadi Rum Jeep Tour enriches the Wadi Rum preview safely', () => {
    const { text, sourceLayer, usedServices } = buildDayNarrativePreview({
      title: 'Wadi Rum / Dead Sea',
      appliedServices: [{ kind: 'activity', name: 'Wadi Rum Jeep Tour' }],
    });
    assert.equal(
      text,
      'Enjoy the desert scenery of Wadi Rum, including a Wadi Rum Jeep Tour, before continuing to the Dead Sea, the lowest point on earth, for overnight.',
    );
    assert.equal(sourceLayer, 'service-aware');
    assert.deepEqual(usedServices, ['activity:Wadi Rum Jeep Tour']);
  });

  it('5. applied hotel never leaks hotel name / room / meal / occupancy (route-only, unchanged)', () => {
    const routeOnly = buildDayNarrativePreview({ title: 'Petra Visit / Wadi Rum' });
    const withHotel = buildDayNarrativePreview({
      title: 'Petra Visit / Wadi Rum',
      appliedServices: [{ kind: 'hotel', name: 'Mövenpick Resort Petra — Deluxe Room, Half Board, Double Occupancy' }],
    });
    assert.equal(withHotel.text, routeOnly.text);
    assert.equal(withHotel.sourceLayer, 'route');
    for (const token of ['Mövenpick', 'Deluxe', 'Room', 'Half Board', 'Occupancy']) {
      assert.ok(!withHotel.text.includes(token), `must not leak "${token}"`);
    }
  });

  it('6. applied transport never leaks vehicle class / supplier / route IDs (route-only, unchanged)', () => {
    const routeOnly = buildDayNarrativePreview({ title: 'Wadi Rum / Dead Sea' });
    const withTransport = buildDayNarrativePreview({
      title: 'Wadi Rum / Dead Sea',
      appliedServices: [{ kind: 'transport', name: 'Coaster 30-seat / Alpha Tours / route-1234 / FULL_DAY' }],
    });
    assert.equal(withTransport.text, routeOnly.text);
    assert.equal(withTransport.sourceLayer, 'route');
    for (const token of ['Coaster', '30-seat', 'Alpha', 'route-1234', 'FULL_DAY']) {
      assert.ok(!withTransport.text.includes(token), `must not leak "${token}"`);
    }
  });

  it('7. sourceLayer = route when no service is woven in', () => {
    assert.equal(buildDayNarrativePreview({ title: 'Wadi Rum / Dead Sea' }).sourceLayer, 'route');
    assert.equal(
      buildDayNarrativePreview({ title: 'Wadi Rum / Dead Sea', appliedServices: [{ kind: 'hotel' }] }).sourceLayer,
      'route',
    );
  });

  it('8. sourceLayer = service-aware when a guide/activity is woven in', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Petra Visit / Wadi Rum', appliedServices: [{ kind: 'guide' }] }).sourceLayer,
      'service-aware',
    );
  });

  it('9. leakage: a dirty applied activity name is scrubbed; no internal data / "Overnight: No"', () => {
    const { text } = buildDayNarrativePreview({
      title: 'Wadi Rum / Dead Sea',
      appliedServices: [
        { kind: 'activity', name: 'Wadi Rum Jeep Tour (cost USD 80, supplier Alpha, Coaster, contract C-9, markup 22%, code WR123)' },
        { kind: 'guide' },
      ],
    });
    for (const token of ['cost', 'USD', '80', 'supplier', 'Alpha', 'Coaster', 'contract', 'C-9', 'markup', '22%', 'WR123', 'Overnight: No', 'pricingDescription']) {
      assert.ok(!text.includes(token), `preview must not contain "${token}" — got: ${text}`);
    }
    assert.ok(text.includes('including a Wadi Rum Jeep Tour'), 'clean activity name still surfaces');
    assert.ok(text.includes('with a local guide'), 'guide still woven');
  });

  it('10. deterministic with services: same input → identical output', () => {
    const input = { title: 'Petra Visit / Wadi Rum', appliedServices: [{ kind: 'guide' as const }] };
    const a = buildDayNarrativePreview(input);
    const b = buildDayNarrativePreview(input);
    assert.equal(a.text, b.text);
    assert.deepEqual(a.usedServices, b.usedServices);
  });
});

// R.7A-3 — client-safe guard before SAVING a narrative into day notes.
describe('R.7A-3 — isClientSafeNarrative', () => {
  it('accepts a normal generated client narrative', () => {
    const { text } = buildDayNarrativePreview({ title: 'Amman / Madaba / Mount Nebo / Petra' });
    assert.equal(isClientSafeNarrative(text), true);
    assert.equal(isClientSafeNarrative('Depart Amman and proceed south to Petra for overnight.'), true);
  });
  it('rejects empty/blank text', () => {
    assert.equal(isClientSafeNarrative(''), false);
    assert.equal(isClientSafeNarrative('   '), false);
    assert.equal(isClientSafeNarrative(null), false);
    assert.equal(isClientSafeNarrative(undefined), false);
  });
  it('rejects supplier / commercial / vehicle-class / enum / internal leakage', () => {
    assert.equal(isClientSafeNarrative('Transfer by Sedan 2 from the supplier.'), false);
    assert.equal(isClientSafeNarrative('Net cost 75 JOD before markup.'), false);
    assert.equal(isClientSafeNarrative('Contract rate applies; margin included.'), false);
    assert.equal(isClientSafeNarrative('Visit Petra. DAILY_FULL_DAY | Jordan Program | Sedan 2'), false);
    assert.equal(isClientSafeNarrative('Private transfer. Overnight: No'), false);
    assert.equal(isClientSafeNarrative('Coaster 17 point_to_point capacity_unit'), false);
  });
  it('does not false-positive on legitimate prose containing substrings (e.g. Pentecost)', () => {
    assert.equal(isClientSafeNarrative('Visit the site associated with Pentecost and the Baptism Site.'), true);
  });
});
