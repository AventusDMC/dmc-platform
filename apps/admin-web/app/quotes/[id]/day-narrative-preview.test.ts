import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDayNarrativePreview } from './day-narrative-preview';

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
