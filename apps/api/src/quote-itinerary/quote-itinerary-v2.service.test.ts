import { test, afterEach } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuoteItineraryV2Service } from './quote-itinerary-v2.service';

// ── Test harness ────────────────────────────────────────────────────────────
// Fakes for PrismaService + the delegated QuoteItineraryService + AuditService.
// The V2 service is deliberately thin (flag-gate → access-guard → empty-guard →
// audit → delegate), so plain object fakes exercise every branch without a DB.

type Options = {
  flag?: boolean;
  quote?: { id: string; brandCompanyId?: string | null } | null;
  newerRevision?: { id: string } | null;
  existingDays?: Array<{ dayNumber: number }>;
  day?: { id: string; quoteId: string; dayNumber: number; title: string } | null;
  linkedItemCount?: number;
  createdDay?: any;
  updatedDay?: any;
  auditThrows?: boolean;
};

function setFlag(on: boolean) {
  if (on) process.env.QUOTE_ITINERARY_EDIT = 'true';
  else delete process.env.QUOTE_ITINERARY_EDIT;
}

afterEach(() => {
  delete process.env.QUOTE_ITINERARY_EDIT;
});

function build(opts: Options = {}) {
  const calls: Record<string, any[]> = {
    createDay: [],
    updateDay: [],
    removeDay: [],
    auditLog: [],
    quoteUpdate: [],
  };

  const prisma = {
    quote: {
      findFirst: async (args: any) => {
        // revisedFromId lookup → newer-revision check; otherwise quote lookup.
        if (args?.where?.revisedFromId) return opts.newerRevision ?? null;
        return opts.quote === undefined ? { id: 'quote-1', brandCompanyId: null } : opts.quote;
      },
      update: async (args: any) => {
        calls.quoteUpdate.push(args);
        return {};
      },
    },
    quoteItineraryDay: {
      findMany: async () => opts.existingDays ?? [],
      findUnique: async () =>
        opts.day === undefined
          ? { id: 'day-1', quoteId: 'quote-1', dayNumber: 2, title: 'Petra' }
          : opts.day,
    },
    quoteItineraryDayItem: {
      count: async () => opts.linkedItemCount ?? 0,
    },
  };

  const itinerary = {
    createDay: async (quoteId: string, dto: any, actor: any) => {
      calls.createDay.push({ quoteId, dto, actor });
      return opts.createdDay ?? { id: 'day-new', dayNumber: dto.dayNumber, sortOrder: 3, title: dto.title, quoteId };
    },
    updateDay: async (dayId: string, dto: any, actor: any) => {
      calls.updateDay.push({ dayId, dto, actor });
      return opts.updatedDay ?? { id: dayId, dayNumber: 2, title: dto.title ?? 'Petra' };
    },
    removeDay: async (dayId: string, actor: any) => {
      calls.removeDay.push({ dayId, actor });
      return { id: dayId };
    },
  };

  const audit = {
    log: async (values: any) => {
      calls.auditLog.push(values);
      if (opts.auditThrows) throw new Error('audit boom');
      return { id: 'audit-1' };
    },
  };

  setFlag(opts.flag ?? true);

  const service = new QuoteItineraryV2Service(prisma as any, itinerary as any, audit as any);
  return { service, calls };
}

const ACTOR = { id: 'user-1', companyId: 'company-A', auditLabel: 'Alice' };

async function expectRejects(promise: Promise<unknown>, codeOrText: string) {
  await assert.rejects(promise, (err: any) => {
    const response = err?.response ?? err;
    const code = response?.code;
    const message = Array.isArray(response?.message) ? response.message.join('; ') : response?.message ?? err?.message;
    assert.ok(
      code === codeOrText || String(message).includes(codeOrText),
      `expected error code/message to include "${codeOrText}", got code=${code} message=${message}`,
    );
    return true;
  });
}

// ── 1. Add day blocked when flag OFF ─────────────────────────────────────────
test('addDay is blocked (feature_disabled) when the flag is OFF and writes nothing', async () => {
  const { service, calls } = build({ flag: false });
  await expectRejects(service.addDay('quote-1', { title: 'Day 3' }, ACTOR), 'feature_disabled');
  assert.equal(calls.createDay.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

// ── 2. Add day succeeds when flag ON + authorized ────────────────────────────
test('addDay succeeds when the flag is ON, delegates to createDay, and writes a created audit row', async () => {
  const { service, calls } = build({ flag: true, existingDays: [{ dayNumber: 1 }, { dayNumber: 2 }] });
  const result = await service.addDay('quote-1', { notes: 'Arrival day' }, ACTOR);

  assert.equal(calls.createDay.length, 1);
  // Auto-numbered to max+1 and defaulted title.
  assert.equal(calls.createDay[0].dto.dayNumber, 3);
  assert.equal(calls.createDay[0].dto.title, 'Day 3');
  assert.equal(calls.createDay[0].actor.id, 'user-1');
  assert.equal(result.id, 'day-new');

  assert.equal(calls.auditLog.length, 1);
  assert.equal(calls.auditLog[0].action, 'quote.itinerary.day.created');
  assert.equal(calls.auditLog[0].entity, 'quoteItineraryDay');
  assert.equal(calls.auditLog[0].metadata.quoteId, 'quote-1');
  assert.equal(calls.auditLog[0].actor.companyId, 'company-A');
  // 8. Quote totals never recalculated by the V2 edit path.
  assert.equal(calls.quoteUpdate.length, 0);
});

// ── 3. Edit day blocked when flag OFF ────────────────────────────────────────
test('editDay is blocked (feature_disabled) when the flag is OFF and writes nothing', async () => {
  const { service, calls } = build({ flag: false });
  await expectRejects(service.editDay('quote-1', 'day-1', { title: 'New title' }, ACTOR), 'feature_disabled');
  assert.equal(calls.updateDay.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

// ── 4. Edit day succeeds when flag ON + authorized ───────────────────────────
test('editDay succeeds when the flag is ON, delegates to updateDay, and writes an updated audit row', async () => {
  const { service, calls } = build({ flag: true });
  const result = await service.editDay('quote-1', 'day-1', { title: 'Petra & Wadi Rum', notes: 'Updated' }, ACTOR);

  assert.equal(calls.updateDay.length, 1);
  assert.equal(calls.updateDay[0].dayId, 'day-1');
  assert.equal(calls.updateDay[0].dto.title, 'Petra & Wadi Rum');
  assert.equal(result.id, 'day-1');

  assert.equal(calls.auditLog.length, 1);
  assert.equal(calls.auditLog[0].action, 'quote.itinerary.day.updated');
  assert.equal(calls.quoteUpdate.length, 0);
});

// ── 5. Delete EMPTY day succeeds when flag ON ────────────────────────────────
test('deleteDay removes an empty day when the flag is ON and writes a deleted audit row (hadItems:false)', async () => {
  const { service, calls } = build({ flag: true, linkedItemCount: 0 });
  const result = await service.deleteDay('quote-1', 'day-1', ACTOR);

  assert.equal(calls.removeDay.length, 1);
  assert.equal(calls.removeDay[0].dayId, 'day-1');
  assert.deepEqual(result, { id: 'day-1' });

  assert.equal(calls.auditLog.length, 1);
  assert.equal(calls.auditLog[0].action, 'quote.itinerary.day.deleted');
  assert.equal(calls.auditLog[0].metadata.hadItems, false);
  assert.equal(calls.quoteUpdate.length, 0);
});

// ── 6. Delete NON-EMPTY day is rejected ──────────────────────────────────────
test('deleteDay rejects a day that has linked items (day_not_empty) and does not delete', async () => {
  const { service, calls } = build({ flag: true, linkedItemCount: 2 });
  await expectRejects(service.deleteDay('quote-1', 'day-1', ACTOR), 'day_not_empty');
  assert.equal(calls.removeDay.length, 0);
  assert.equal(calls.auditLog.length, 0);
});

// ── 7. Classic parity — delegation reuses the SAME service methods Classic uses ─
test('the V2 edit path delegates to the existing QuoteItineraryService (no forked write path)', async () => {
  const { service, calls } = build({ flag: true });
  await service.addDay('quote-1', {}, ACTOR);
  await service.editDay('quote-1', 'day-1', { title: 'X' }, ACTOR);
  await service.deleteDay('quote-1', 'day-1', ACTOR);
  // Exactly the shared createDay/updateDay/removeDay — Classic's own write path.
  assert.equal(calls.createDay.length, 1);
  assert.equal(calls.updateDay.length, 1);
  assert.equal(calls.removeDay.length, 1);
  // And never a quote-total recalculation.
  assert.equal(calls.quoteUpdate.length, 0);
});

// ── 10. Audit failure does not block the mutation ────────────────────────────
test('a failing audit write does not block the day mutation', async () => {
  const { service, calls } = build({ flag: true, auditThrows: true });
  const result = await service.addDay('quote-1', { title: 'Day 3' }, ACTOR);
  assert.equal(result.id, 'day-new');
  assert.equal(calls.createDay.length, 1);
  assert.equal(calls.auditLog.length, 1); // attempted, threw, swallowed
});

// ── 11. Unauthorized (no company context) is blocked ─────────────────────────
test('a caller without a company context is rejected (company isolation)', async () => {
  const { service, calls } = build({ flag: true });
  await expectRejects(
    service.addDay('quote-1', { title: 'Day 3' }, { id: 'user-1', companyId: null, auditLabel: 'NoCo' }),
    'Company context is required',
  );
  assert.equal(calls.createDay.length, 0);
});

// ── 12. Cross-company access is blocked; legacy null-brand quotes allowed ─────
test('a quote owned by a different company is rejected (cross-company)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: 'quote-1', brandCompanyId: 'company-B' } });
  await expectRejects(service.addDay('quote-1', { title: 'Day 3' }, ACTOR), 'different company');
  assert.equal(calls.createDay.length, 0);
});

test('a legacy quote with no brandCompanyId is accessible (no regression)', async () => {
  const { service, calls } = build({ flag: true, quote: { id: 'quote-1', brandCompanyId: null } });
  const result = await service.addDay('quote-1', { title: 'Day 3' }, ACTOR);
  assert.equal(result.id, 'day-new');
  assert.equal(calls.createDay.length, 1);
});

// ── Missing quote is rejected ────────────────────────────────────────────────
test('editing a day on a missing quote is rejected', async () => {
  const { service } = build({ flag: true, quote: null });
  await expectRejects(service.editDay('quote-x', 'day-1', { title: 'X' }, ACTOR), 'Quote not found');
});

// ── Day belonging to another quote is rejected ───────────────────────────────
test('editing a day that belongs to a different quote is rejected', async () => {
  const { service, calls } = build({
    flag: true,
    day: { id: 'day-1', quoteId: 'other-quote', dayNumber: 1, title: 'X' },
  });
  await expectRejects(service.editDay('quote-1', 'day-1', { title: 'X' }, ACTOR), 'not found for this quote');
  assert.equal(calls.updateDay.length, 0);
});
