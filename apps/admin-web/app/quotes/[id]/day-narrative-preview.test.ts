import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDayNarrativePreview, isClientSafeNarrative, resolveNarrativeLocale, narrativeTextDirection } from './day-narrative-preview';

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

// R.7B-1 — narrative locale scaffold: locale option + helpers; es/pt/ar fall back
// to English byte-identically (no real translations yet). The existing R.7A
// describe blocks above already assert the English output is byte-identical
// (they call buildDayNarrativePreview with no locale → en).
describe('R.7B-1 — narrative locale scaffold (English byte-identical)', () => {
  const CASES: { title: string; notes?: string; overnightCity?: string; appliedServices?: any[] }[] = [
    { title: 'Amman / Madaba / Mount Nebo / Petra' },
    { title: 'Arrival Amman', overnightCity: 'Amman' },
    { title: 'Departure', notes: 'Transfer from Petra to the airport' },
    { title: 'Amman / Jerash / Amman' },
    { title: 'Petra Visit / Wadi Rum' },
    { title: 'Wadi Rum / Dead Sea' },
    { title: 'Amman City Tour' },
    { title: 'Petra / Wadi Rum', appliedServices: [{ kind: 'guide' }, { kind: 'activity', name: 'Wadi Rum Jeep Tour' }] },
    { title: '' },
  ];

  it('1/3. default locale === explicit en for every case', () => {
    for (const c of CASES) {
      assert.deepEqual(buildDayNarrativePreview(c), buildDayNarrativePreview(c, { locale: 'en' }));
    }
  });

  it('2. default locale is en (omitting options)', () => {
    const a = buildDayNarrativePreview({ title: 'Amman / Madaba / Mount Nebo / Petra' });
    const b = buildDayNarrativePreview({ title: 'Amman / Madaba / Mount Nebo / Petra' }, { locale: 'en' });
    assert.equal(a.text, b.text);
  });

  it('es/pt/ar keep en STRUCTURE (sourceLayer/usedServices/flags) but localize the TEXT', () => {
    for (const c of CASES) {
      const en = buildDayNarrativePreview(c, { locale: 'en' });
      for (const loc of ['es', 'pt', 'ar'] as const) {
        const out = buildDayNarrativePreview(c, { locale: loc });
        // Structure is locale-invariant …
        assert.equal(out.sourceLayer, en.sourceLayer, `${loc} sourceLayer must equal en for "${c.title}"`);
        assert.deepEqual(out.usedServices, en.usedServices, `${loc} usedServices must equal en for "${c.title}"`);
        assert.deepEqual(out.flags, en.flags, `${loc} flags must equal en for "${c.title}"`);
        // … but the prose itself is now genuinely localized (R.7B-2 es/pt, R.7B-3A ar).
        assert.notEqual(out.text, en.text, `${loc} text must differ from en for "${c.title}"`);
      }
    }
  });

  it('R.7B-3A: Arabic no longer falls back to English', () => {
    for (const c of CASES) {
      const en = buildDayNarrativePreview(c, { locale: 'en' });
      const ar = buildDayNarrativePreview(c, { locale: 'ar' });
      assert.notEqual(ar.text, en.text, `ar text must differ from en for "${c.title}"`);
    }
  });

  it('7/8. narrativeTextDirection: ar → rtl, en/es/pt → ltr', () => {
    assert.equal(narrativeTextDirection('ar'), 'rtl');
    assert.equal(narrativeTextDirection('en'), 'ltr');
    assert.equal(narrativeTextDirection('es'), 'ltr');
    assert.equal(narrativeTextDirection('pt'), 'ltr');
  });

  it('resolveNarrativeLocale normalizes + defaults to en', () => {
    assert.equal(resolveNarrativeLocale('es'), 'es');
    assert.equal(resolveNarrativeLocale('AR'), 'ar');
    assert.equal(resolveNarrativeLocale(' Pt '), 'pt');
    assert.equal(resolveNarrativeLocale('fr'), 'en');
    assert.equal(resolveNarrativeLocale(null), 'en');
    assert.equal(resolveNarrativeLocale(undefined), 'en');
    assert.equal(resolveNarrativeLocale(''), 'en');
  });

  it('10. applied guide/activity enrichment still works (English, via default + en)', () => {
    // A linear depart-and-visit day weaves applied services into the sightseeing
    // sentence (a 2-stop transition like "Petra / Wadi Rum" stays route-only).
    const c = { title: 'Amman / Madaba / Mount Nebo / Petra', appliedServices: [{ kind: 'guide' as const }, { kind: 'activity' as const, name: 'Wadi Rum Jeep Tour' }] };
    const out = buildDayNarrativePreview(c);
    assert.equal(out.sourceLayer, 'service-aware');
    assert.ok(out.text.includes('with a local guide'));
    assert.ok(out.text.includes('Wadi Rum Jeep Tour'));
  });
});

// R.7B-2 — real, deterministic Spanish + Portuguese narrative output. Place NAMES
// stay in their recognizable proper form; descriptors + connectives are localized
// (professional tourism tone, not literal translation). English stays byte-identical
// (asserted by the R.7A blocks above); Arabic still falls back to English.
describe('R.7B-2 — Spanish (es) deterministic snapshots', () => {
  it('Arrival', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Arrival', overnightCity: 'Amman' }, { locale: 'es' }).text,
      'A su llegada, recepción y asistencia en el aeropuerto y traslado a Amman para pasar la noche.',
    );
  });
  it('Departure', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Departure', notes: 'Transfer from Amman to the airport' }, { locale: 'es' }).text,
      'Traslado desde Amman al aeropuerto para tomar su vuelo de salida.',
    );
  });
  it('Linear — Amman / Madaba / Mount Nebo / Petra (Monte Nebo, contracted "al")', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Amman / Madaba / Mount Nebo / Petra' }, { locale: 'es' }).text,
      'Tras el desayuno, salga de Amman y visite Madaba, célebre por su antiguo mapa en mosaico, luego continúe al Monte Nebo, el mirador tradicional sobre la Tierra Prometida. A continuación, diríjase hacia el sur a Petra para pasar la noche.',
    );
  });
  it('Visit-origin — Petra Visit / Wadi Rum', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Petra Visit / Wadi Rum' }, { locale: 'es' }).text,
      'Tras el desayuno, visite Petra, la ciudad rosada y uno de los yacimientos arqueológicos más célebres de Jordania. Más tarde, continúe a Wadi Rum para pasar la noche.',
    );
  });
  it('Transition — Wadi Rum / Dead Sea (Mar Muerto, contracted "al")', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Wadi Rum / Dead Sea' }, { locale: 'es' }).text,
      'Disfrute del paisaje desértico de Wadi Rum antes de continuar al Mar Muerto, el punto más bajo de la Tierra, para pasar la noche.',
    );
  });
  it('Round-trip — Dead Sea / Bethany / Dead Sea (Betania, Mar Muerto, contracted "al")', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Dead Sea / Bethany / Dead Sea' }, { locale: 'es' }).text,
      'Tras el desayuno, visite Betania, el lugar del Bautismo a orillas del río Jordán y regrese al Mar Muerto para pasar la noche.',
    );
  });
  it('localized place labels — no raw "Mount Nebo" / "Dead Sea" / "Bethany"', () => {
    const titles = [
      'Amman / Madaba / Mount Nebo / Petra',
      'Wadi Rum / Dead Sea',
      'Dead Sea / Bethany / Dead Sea',
      'Departure',
    ];
    for (const title of titles) {
      const { text } = buildDayNarrativePreview({ title, notes: 'Transfer from the Dead Sea to the airport' }, { locale: 'es' });
      for (const raw of ['Mount Nebo', 'Dead Sea', 'Bethany']) {
        assert.ok(!text.includes(raw), `es must not contain raw "${raw}" — got: ${text}`);
      }
    }
  });
  it('applied local guide phrase woven in Spanish', () => {
    const out = buildDayNarrativePreview(
      { title: 'Petra Visit / Wadi Rum', appliedServices: [{ kind: 'guide' }] },
      { locale: 'es' },
    );
    assert.equal(out.sourceLayer, 'service-aware');
    assert.ok(out.text.includes(', con guía local'), `got: ${out.text}`);
  });
  it('applied Wadi Rum Jeep Tour phrase woven in Spanish', () => {
    const out = buildDayNarrativePreview(
      { title: 'Wadi Rum / Dead Sea', appliedServices: [{ kind: 'activity', name: 'Wadi Rum Jeep Tour' }] },
      { locale: 'es' },
    );
    assert.equal(out.sourceLayer, 'service-aware');
    assert.ok(out.text.includes(', que incluye un Wadi Rum Jeep Tour'), `got: ${out.text}`);
  });
});

describe('R.7B-2 — Portuguese (pt) deterministic snapshots', () => {
  it('Arrival', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Arrival', overnightCity: 'Amman' }, { locale: 'pt' }).text,
      'À chegada, receção e assistência no aeroporto e transporte para Amman para pernoitar.',
    );
  });
  it('Departure', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Departure', notes: 'Transfer from Amman to the airport' }, { locale: 'pt' }).text,
      'Transporte de Amman para o aeroporto para o seu voo de partida.',
    );
  });
  it('Linear — Amman / Madaba / Mount Nebo / Petra (Monte Nebo)', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Amman / Madaba / Mount Nebo / Petra' }, { locale: 'pt' }).text,
      'Após o pequeno-almoço, parta de Amman e visite Madaba, conhecida pelo seu antigo mapa em mosaico, em seguida siga para o Monte Nebo, o miradouro tradicional sobre a Terra Prometida. Em seguida, siga para sul até Petra para pernoitar.',
    );
  });
  it('Visit-origin — Petra Visit / Wadi Rum', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Petra Visit / Wadi Rum' }, { locale: 'pt' }).text,
      'Após o pequeno-almoço, visite Petra, a cidade rosada e um dos sítios arqueológicos mais famosos da Jordânia. Mais tarde, siga para Wadi Rum para pernoitar.',
    );
  });
  it('Transition — Wadi Rum / Dead Sea (Mar Morto)', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Wadi Rum / Dead Sea' }, { locale: 'pt' }).text,
      'Desfrute da paisagem desértica de Wadi Rum antes de seguir para o Mar Morto, o ponto mais baixo da Terra, para pernoitar.',
    );
  });
  it('Round-trip — Dead Sea / Bethany / Dead Sea (Betânia, Mar Morto, contracted "ao")', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Dead Sea / Bethany / Dead Sea' }, { locale: 'pt' }).text,
      'Após o pequeno-almoço, visite Betânia, o local do Batismo às margens do rio Jordão e regresse ao Mar Morto para pernoitar.',
    );
  });
  it('localized place labels — no raw "Mount Nebo" / "Dead Sea" / "Bethany"', () => {
    const titles = [
      'Amman / Madaba / Mount Nebo / Petra',
      'Wadi Rum / Dead Sea',
      'Dead Sea / Bethany / Dead Sea',
      'Departure',
    ];
    for (const title of titles) {
      const { text } = buildDayNarrativePreview({ title, notes: 'Transfer from the Dead Sea to the airport' }, { locale: 'pt' });
      for (const raw of ['Mount Nebo', 'Dead Sea', 'Bethany']) {
        assert.ok(!text.includes(raw), `pt must not contain raw "${raw}" — got: ${text}`);
      }
    }
  });
  it('applied local guide phrase woven in Portuguese', () => {
    const out = buildDayNarrativePreview(
      { title: 'Petra Visit / Wadi Rum', appliedServices: [{ kind: 'guide' }] },
      { locale: 'pt' },
    );
    assert.equal(out.sourceLayer, 'service-aware');
    assert.ok(out.text.includes(', com guia local'), `got: ${out.text}`);
  });
  it('applied Wadi Rum Jeep Tour phrase woven in Portuguese', () => {
    const out = buildDayNarrativePreview(
      { title: 'Wadi Rum / Dead Sea', appliedServices: [{ kind: 'activity', name: 'Wadi Rum Jeep Tour' }] },
      { locale: 'pt' },
    );
    assert.equal(out.sourceLayer, 'service-aware');
    assert.ok(out.text.includes(', incluindo um Wadi Rum Jeep Tour'), `got: ${out.text}`);
  });
});

describe('R.7B-2/-3A — leakage guard holds across en/es/pt/ar', () => {
  const DIRTY = {
    title: 'Petra (cost USD 500, supplier Alpha Tours, Coaster 30%, contract C-2026, code ABC123) Visit / Wadi Rum',
    notes: 'Overnight: No. markup 18%. vehicle Hiace. internal XZ99.',
    appliedServices: [
      { kind: 'activity' as const, name: 'Wadi Rum Jeep Tour (cost USD 80, supplier Alpha, contract C-9, markup 22%, code WR123)' },
      { kind: 'guide' as const },
    ],
  };
  const LEAKS = ['supplier', 'Alpha', 'contract', 'C-2026', 'C-9', 'cost', 'USD', '500', '80', 'markup', '18%', '22%', 'vehicle', 'Hiace', 'Coaster', '30%', 'ABC123', 'WR123', 'XZ99', 'Overnight: No'];
  // The clean activity surfaces in each locale (en/es/pt keep the English name; ar
  // uses the curated MSA translation).
  const CLEAN_ACTIVITY: Record<'en' | 'es' | 'pt' | 'ar', string> = {
    en: 'Wadi Rum Jeep Tour',
    es: 'Wadi Rum Jeep Tour',
    pt: 'Wadi Rum Jeep Tour',
    ar: 'جولة بسيارات الدفع الرباعي في وادي رم',
  };
  for (const loc of ['en', 'es', 'pt', 'ar'] as const) {
    it(`no internal/commercial leak in ${loc}`, () => {
      const { text } = buildDayNarrativePreview(DIRTY, { locale: loc });
      for (const token of LEAKS) {
        assert.ok(!text.includes(token), `${loc} preview must not contain "${token}" — got: ${text}`);
      }
      assert.ok(text.includes(CLEAN_ACTIVITY[loc]), `${loc}: clean activity name should surface`);
    });
  }
});

// R.7B-3A — deterministic Modern Standard Arabic narrative output. Localized place
// names (البتراء / البحر الميت / المغطس / …), Arabic punctuation (،), RTL-safe.
describe('R.7B-3A — Arabic (ar) deterministic snapshots', () => {
  it('Arrival', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Arrival', overnightCity: 'Amman' }, { locale: 'ar' }).text,
      'عند الوصول، الاستقبال والمساعدة في المطار، ثم النقل إلى عمّان للمبيت.',
    );
  });
  it('Departure', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Departure', notes: 'Transfer from Amman to the airport' }, { locale: 'ar' }).text,
      'النقل من عمّان إلى المطار لرحلة المغادرة.',
    );
  });
  it('Linear — Amman / Madaba / Mount Nebo / Petra', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Amman / Madaba / Mount Nebo / Petra' }, { locale: 'ar' }).text,
      'بعد الإفطار، المغادرة من عمّان وزيارة مادبا، المشهورة بخريطتها الفسيفسائية القديمة، ثم المتابعة إلى جبل نيبو، المطلّ التقليدي على الأرض الموعودة. بعد ذلك، التوجه جنوباً إلى البتراء للمبيت.',
    );
  });
  it('Visit-origin — Petra Visit / Wadi Rum', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Petra Visit / Wadi Rum' }, { locale: 'ar' }).text,
      'بعد الإفطار، زيارة البتراء، المدينة الوردية وإحدى أشهر المواقع الأثرية في الأردن. بعد ذلك، المتابعة إلى وادي رم للمبيت.',
    );
  });
  it('Transition — Wadi Rum / Dead Sea', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Wadi Rum / Dead Sea' }, { locale: 'ar' }).text,
      'استمتعوا بالمناظر الصحراوية في وادي رم قبل المتابعة إلى البحر الميت، أخفض نقطة على وجه الأرض، للمبيت.',
    );
  });
  it('Round-trip — Dead Sea / Bethany / Dead Sea', () => {
    assert.equal(
      buildDayNarrativePreview({ title: 'Dead Sea / Bethany / Dead Sea' }, { locale: 'ar' }).text,
      'بعد الإفطار، زيارة المغطس، موقع المعمودية على نهر الأردن، ثم العودة إلى البحر الميت للمبيت.',
    );
  });
  it('localized place labels — no raw "Mount Nebo" / "Dead Sea" / "Bethany"', () => {
    const titles = [
      'Amman / Madaba / Mount Nebo / Petra',
      'Wadi Rum / Dead Sea',
      'Dead Sea / Bethany / Dead Sea',
      'Departure',
    ];
    for (const title of titles) {
      const { text } = buildDayNarrativePreview({ title, notes: 'Transfer from the Dead Sea to the airport' }, { locale: 'ar' });
      for (const raw of ['Mount Nebo', 'Dead Sea', 'Bethany']) {
        assert.ok(!text.includes(raw), `ar must not contain raw "${raw}" — got: ${text}`);
      }
    }
  });
  it('applied local guide phrase woven in Arabic', () => {
    const out = buildDayNarrativePreview(
      { title: 'Petra Visit / Wadi Rum', appliedServices: [{ kind: 'guide' }] },
      { locale: 'ar' },
    );
    assert.equal(out.sourceLayer, 'service-aware');
    assert.ok(out.text.includes('، مع مرشد محلي'), `got: ${out.text}`);
  });
  it('applied Wadi Rum Jeep Tour phrase woven in Arabic', () => {
    const out = buildDayNarrativePreview(
      { title: 'Wadi Rum / Dead Sea', appliedServices: [{ kind: 'activity', name: 'Wadi Rum Jeep Tour' }] },
      { locale: 'ar' },
    );
    assert.equal(out.sourceLayer, 'service-aware');
    assert.ok(out.text.includes('، بما في ذلك جولة بسيارات الدفع الرباعي في وادي رم'), `got: ${out.text}`);
  });
  it('narrativeTextDirection(ar) = rtl', () => {
    assert.equal(narrativeTextDirection('ar'), 'rtl');
  });
});
