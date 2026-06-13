import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';

// Phase P.3X-5B — service-card operational meta labels are locale-aware.
// Q-2026-0073 (ES) showed an English "Date" label on service cards because
// buildOperationalMeta hardcoded the prefixes. English output is unchanged.

function quoteWithDatedService() {
  return {
    id: 'q-p3x5b',
    quoteCurrency: 'USD',
    title: 'Jordan Explorer',
    createdAt: new Date('2026-04-27T08:00:00.000Z'),
    travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
    nightCount: 1,
    adults: 2,
    children: 0,
    totalCost: 200,
    totalSell: 240,
    pricePerPax: 120,
    quoteOptions: [],
    itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Day 1: Petra' }],
    quoteItems: [
      {
        id: 'a-1',
        itineraryId: 'day-1',
        service: { name: 'Petra Guided Visit', category: 'Activity', serviceType: { name: 'Activity', code: 'ACTIVITY' } },
        activity: { name: 'Petra Guided Visit', description: 'Explore the rose-red city with a local expert.' },
        serviceDate: new Date('2026-06-01T00:00:00.000Z'),
        startTime: '09:00',
        pickupTime: '08:30',
        pickupLocation: 'Hotel lobby',
        meetingPoint: 'Visitor center',
        participantCount: 2,
        totalCost: 100,
        totalSell: 120,
      },
    ],
  };
}

function serviceMeta(vm: any): string {
  const items = (vm.days || []).flatMap((d: any) => (d.groups || []).flatMap((g: any) => g.items || []));
  const withMeta = items.find((it: any) => it.meta);
  return withMeta?.meta || '';
}

test('P.3X-5B: English service meta labels are unchanged', () => {
  const meta = serviceMeta(mapQuoteToProposalV3(quoteWithDatedService() as any));
  assert.match(meta, /\bDate\b/);
  assert.match(meta, /\bStart 09:00\b/);
  assert.match(meta, /\bPickup 08:30\b/);
  assert.match(meta, /\bMeeting Visitor center\b/);
  assert.match(meta, /\b2 pax\b/);
});

test('P.3X-5B: Spanish service meta labels are localized (Fecha / Inicio / Recogida / Encuentro)', () => {
  const meta = serviceMeta(mapQuoteToProposalV3(quoteWithDatedService() as any, 'es'));
  assert.match(meta, /\bFecha\b/);
  assert.match(meta, /\bInicio 09:00\b/);
  assert.match(meta, /\bRecogida 08:30\b/);
  assert.match(meta, /\bEncuentro Visitor center\b/);
  assert.doesNotMatch(meta, /\bDate\b/);
  assert.doesNotMatch(meta, /\bStart\b/);
});

test('P.3X-5B: Portuguese service meta labels are localized (Data / Início / Recolha / Encontro)', () => {
  const meta = serviceMeta(mapQuoteToProposalV3(quoteWithDatedService() as any, 'pt'));
  assert.match(meta, /\bData\b/);
  assert.match(meta, /Início 09:00/);
  assert.match(meta, /Recolha 08:30/);
  assert.match(meta, /Encontro Visitor center/);
  assert.doesNotMatch(meta, /\bDate\b/);
});

test('P.3X-5B: Arabic service meta labels are localized (RTL-safe)', () => {
  const meta = serviceMeta(mapQuoteToProposalV3(quoteWithDatedService() as any, 'ar'));
  assert.match(meta, /التاريخ/);
  assert.match(meta, /البداية 09:00/);
  assert.match(meta, /الاستلام 08:30/);
  assert.match(meta, /نقطة اللقاء Visitor center/);
  assert.doesNotMatch(meta, /\bDate\b/);
});
