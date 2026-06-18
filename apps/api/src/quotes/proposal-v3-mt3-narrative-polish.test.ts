import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// ===========================================================================
// Phase MT3 — generated-narrative polish (mapper feed only; the parity-locked
// R.7B engine is untouched).
//   • Day 07 narrative localizes place tokens via the MT2 alias-canonical title,
//     so EN/PT/AR no longer leak the source-language "Mar Muerto" / "Betania".
//   • Wrong-language stored notes are not fed to the engine.
//   • Entrance/ticket items are no longer woven as "including a <name>".
// Spanish is structurally unaffected (it renders stored notes, not the engine).
// ===========================================================================

const ES_DAY07_NOTES = 'Visita a Betania, el sitio del bautismo, desde el Mar Muerto y regreso al hotel para pernoctar en el Mar Muerto.';

function svc(name: string, code: string) {
  return { quoteService: { id: `qs-${name}`, itineraryId: null, service: { name, category: code, serviceType: { code, name: code } } }, isActive: true };
}

function quote() {
  return {
    id: 'q-mt3', quoteCurrency: 'USD', title: 'Jordania Clásica', adults: 2, children: 0, nightCount: 7, quoteOptions: [],
    totalSell: 2761.01, pricePerPax: 1380.51,
    itineraries: [{ id: 'd1', dayNumber: 1, title: 'Arrival Amman' }],
    quoteItems: [],
    quoteItineraryDays: [
      // Day 02 — entrance tickets + a guide (awkward "a Amman Citadel…" weaving).
      {
        id: 'p2', dayNumber: 2, title: 'Amman / Jerash / Amman', isActive: true,
        notes: 'Tras el desayuno, visita de Jerash.', notesLanguage: 'es',
        dayItems: [svc('Amman Citadel & Jordan Archaeological Museum', 'ENTRANCE_TICKET'), svc('Licensed Jordan Guide Service', 'GUIDE')],
      },
      // Day 04 — Petra entrance ticket (awkward "um Petra Entrance Ticket" in PT).
      {
        id: 'p4', dayNumber: 4, title: 'Petra Visit / Wadi Rum', isActive: true,
        notes: 'Tras el desayuno, visite Petra.', notesLanguage: 'es',
        dayItems: [svc('Petra Entrance Ticket', 'ENTRANCE_TICKET')],
      },
      // Day 05 — a GENUINE activity (must be kept in the narrative).
      {
        id: 'p5', dayNumber: 5, title: 'Wadi Rum / Dead Sea', isActive: true,
        notes: 'Disfrute del desierto.', notesLanguage: 'es',
        dayItems: [{ quoteService: { id: 'qs-jeep', itineraryId: null, activity: { name: 'Wadi Rum Jeep Tour' }, service: { name: 'Wadi Rum Jeep Tour', category: 'ACTIVITY', serviceType: { code: 'ACTIVITY', name: 'ACTIVITY' } } }, isActive: true }],
      },
      // Day 07 — Spanish-authored round-trip title + Spanish notes + a Bethany
      // entrance-fee item (mis-typed ACTIVITY but named "Entrance Fee").
      {
        id: 'p7', dayNumber: 7, title: 'Mar Muerto / Betania / Mar Muerto', isActive: true,
        notes: ES_DAY07_NOTES, notesLanguage: 'es',
        dayItems: [svc('Bethany / Baptism Site Entrance Fee', 'ACTIVITY')],
      },
    ],
  };
}

const summary = (vm: any, n: number) => vm.days.find((d: any) => d.dayNumber === n)?.summary || '';

// ---- Day 07 place-token localization ---------------------------------------
test('MT3: EN Day 07 narrative contains Bethany and Dead Sea, not Betania/Mar Muerto', () => {
  const s = summary(mapQuoteToProposalV3(quote() as any, 'en'), 7);
  assert.match(s, /Bethany/);
  assert.match(s, /Dead Sea/);
  assert.doesNotMatch(s, /Betania|Mar Muerto/);
});

test('MT3: PT Day 07 narrative contains Betânia and Mar Morto, not Betania/Mar Muerto', () => {
  const s = summary(mapQuoteToProposalV3(quote() as any, 'pt'), 7);
  assert.match(s, /Betânia/);
  assert.match(s, /Mar Morto/);
  assert.doesNotMatch(s, /\bBetania\b|Mar Muerto/);
});

test('MT3: AR Day 07 narrative contains المغطس and البحر الميت, not Betania/Mar Muerto', () => {
  const s = summary(mapQuoteToProposalV3(quote() as any, 'ar'), 7);
  assert.match(s, /المغطس/);
  assert.match(s, /البحر الميت/);
  assert.doesNotMatch(s, /Betania|Mar Muerto/);
});

test('MT3: ES Day 07 narrative is unchanged (stored Spanish notes, not the engine)', () => {
  const s = summary(mapQuoteToProposalV3(quote() as any, 'es'), 7);
  assert.equal(s, ES_DAY07_NOTES);
});

// ---- Entrance/ticket weaving removed ---------------------------------------
test('MT3: EN narrative no longer produces "a Amman Citadel" (entrance ticket not woven)', () => {
  const s = summary(mapQuoteToProposalV3(quote() as any, 'en'), 2);
  assert.doesNotMatch(s, /a Amman Citadel/);
  assert.doesNotMatch(s, /Amman Citadel & Jordan Archaeological Museum/);
  // The guide is still woven.
  assert.match(s, /guide/i);
});

test('MT3: PT narrative no longer produces "um Petra Entrance Ticket"', () => {
  const s = summary(mapQuoteToProposalV3(quote() as any, 'pt'), 4);
  assert.doesNotMatch(s, /um Petra Entrance Ticket/);
  assert.doesNotMatch(s, /Petra Entrance Ticket/);
});

test('MT3: a GENUINE activity is still woven (Wadi Rum Jeep Tour kept)', () => {
  for (const loc of ['en', 'pt'] as const) {
    const s = summary(mapQuoteToProposalV3(quote() as any, loc), 5);
    assert.match(s, /Wadi Rum Jeep Tour/, `${loc} keeps the genuine activity`);
  }
});

// ---- Regression: MT2 titles + no mutation ----------------------------------
test('MT3: MT2 title/day-title localization still holds and stored data is not mutated', () => {
  const q: any = quote();
  const before = { title: q.title, days: q.quoteItineraryDays.map((d: any) => d.title) };
  assert.equal(mapQuoteToProposalV3(q, 'en').documentTitle, 'Classic Jordan');
  assert.equal(mapQuoteToProposalV3(q, 'ar').documentTitle, 'الأردن الكلاسيكي');
  assert.equal(mapQuoteToProposalV3(q, 'en').days.find((d: any) => d.dayNumber === 7)?.title, 'Dead Sea / Bethany / Dead Sea');
  assert.equal(mapQuoteToProposalV3(q, 'pt').days.find((d: any) => d.dayNumber === 7)?.title, 'Mar Morto / Betânia / Mar Morto');
  assert.equal(q.title, before.title, 'quote.title not mutated');
  assert.deepEqual(q.quoteItineraryDays.map((d: any) => d.title), before.days, 'day.title not mutated');
});
