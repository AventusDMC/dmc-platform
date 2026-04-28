import test = require('node:test');
import assert = require('node:assert/strict');
const { CompaniesService } = require('./companies.service');

test('create company persists submitted data and list includes the new company', async () => {
  const companies: any[] = [
    {
      id: 'agency-1',
      name: 'Agency Company',
      type: 'DMC',
      website: null,
      logoUrl: null,
      primaryColor: null,
      country: 'Jordan',
      city: 'Amman',
      branding: null,
      _count: { contacts: 0 },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];
  const createCalls: any[] = [];
  const service = new CompaniesService({
    company: {
      create: async (args: any) => {
        createCalls.push(args);
        const created = {
          id: 'company-new',
          ...args.data,
          branding: null,
          _count: { contacts: 0 },
          createdAt: new Date('2026-04-27T00:00:00.000Z'),
        };
        companies.unshift(created);
        return created;
      },
      findMany: async () => companies,
    },
  } as any);

  const created = await service.create(
    {
      name: '  Petra Partner  ',
      type: 'CLIENT',
      website: 'https://petra.example',
      country: 'Jordan',
      city: 'Wadi Musa',
    },
    { companyId: 'agency-1' } as any,
  );
  const listed = await service.findAll({ companyId: 'agency-1' } as any);

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].data.name, 'Petra Partner');
  assert.equal(created.id, 'company-new');
  assert.equal(created.name, 'Petra Partner');
  assert.ok(listed.some((company: any) => company.id === 'company-new' && company.name === 'Petra Partner'));
});

test('company performance counts only selected client company and latest quote revisions', async () => {
  const { service, seenQuoteWheres } = createPerformanceService({
    companies: [company('client-1')],
    quotes: [
      quote('quote-old', 'client-1', 'SENT', '2026-06-01', { revisedFromId: null }),
      quote('quote-latest', 'client-1', 'ACCEPTED', '2026-06-05', { revisedFromId: 'quote-old' }),
      quote('quote-other', 'client-2', 'ACCEPTED', '2026-06-07'),
      quote('quote-cancelled', 'client-1', 'CANCELLED', '2026-06-08'),
    ],
    bookings: [],
  });

  const performance = await service.getPerformance('client-1', { companyId: 'dmc-company' } as any);

  assert.equal(performance.totalQuotes, 2);
  assert.equal(performance.sentQuotes, 0);
  assert.equal(performance.confirmedQuotes, 1);
  assert.equal(performance.cancelledQuotes, 1);
  assert.equal(performance.lastQuoteDate, '2026-06-08T12:00:00.000Z');
  assert.deepEqual(seenQuoteWheres[0], { clientCompanyId: 'client-1', revisions: { none: {} } });
});

test('company performance counts latest booking amendments and excludes cancelled booking financials', async () => {
  const { service, seenBookingWheres } = createPerformanceService({
    companies: [company('client-1')],
    quotes: [quote('quote-1', 'client-1', 'ACCEPTED', '2026-06-01')],
    bookings: [
      booking('booking-original', 'client-1', 'confirmed', '2026-06-10', [{ totalCost: 100, totalSell: 150 }]),
      booking('booking-amended', 'client-1', 'confirmed', '2026-06-11', [{ totalCost: 120, totalSell: 220 }], {
        amendedFromId: 'booking-original',
      }),
      booking('booking-cancelled', 'client-1', 'cancelled', '2026-06-12', [{ totalCost: 400, totalSell: 600 }]),
      booking('booking-other', 'client-2', 'confirmed', '2026-06-13', [{ totalCost: 900, totalSell: 1200 }]),
    ],
  });

  const performance = await service.getPerformance('client-1', { companyId: 'dmc-company' } as any);

  assert.equal(performance.totalBookings, 1);
  assert.equal(performance.cancelledBookings, 1);
  assert.equal(performance.totalRevenue, 220);
  assert.equal(performance.totalCost, 120);
  assert.equal(performance.totalProfit, 100);
  assert.equal(performance.avgMargin, 45.45);
  assert.equal(performance.conversionRate, 100);
  assert.equal(performance.lastBookingDate, '2026-06-11T12:00:00.000Z');
  assert.deepEqual(seenBookingWheres[0], { clientCompanyId: 'client-1', amendments: { none: {} } });
});

test('company performance requires auth without filtering by actor company', async () => {
  const { service, seenQuoteWheres, seenBookingWheres } = createPerformanceService({
    companies: [company('client-1')],
    quotes: [quote('quote-1', 'client-1', 'ACCEPTED', '2026-06-01')],
    bookings: [booking('booking-1', 'client-1', 'confirmed', '2026-06-10', [{ totalCost: 80, totalSell: 100 }])],
  });

  await assert.rejects(() => service.getPerformance('client-1', undefined as any), /Company context is required/);

  const performance = await service.getPerformance('client-1', { companyId: 'dmc-company' } as any);

  assert.equal(performance.totalQuotes, 1);
  assert.equal(performance.totalBookings, 1);
  assert.equal(seenQuoteWheres[0].clientCompanyId, 'client-1');
  assert.equal(seenBookingWheres[0].clientCompanyId, 'client-1');
  assert.equal(JSON.stringify(seenQuoteWheres[0]).includes('dmc-company'), false);
  assert.equal(JSON.stringify(seenBookingWheres[0]).includes('dmc-company'), false);
});

function createPerformanceService({
  companies,
  quotes,
  bookings,
}: {
  companies: any[];
  quotes: any[];
  bookings: any[];
}) {
  const seenQuoteWheres: any[] = [];
  const seenBookingWheres: any[] = [];
  const service = new CompaniesService({
    company: {
      findFirst: async ({ where }: any) =>
        companies.find((candidate) => candidate.id === where.id) || null,
    },
    quote: {
      findMany: async ({ where }: any) => {
        seenQuoteWheres.push(where);
        return quotes.filter((candidate) => {
          if (candidate.clientCompanyId !== where.clientCompanyId) return false;
          if (where.revisions?.none && quotes.some((revision) => revision.revisedFromId === candidate.id)) return false;
          return true;
        });
      },
    },
    booking: {
      findMany: async ({ where }: any) => {
        seenBookingWheres.push(where);
        return bookings.filter((candidate) => {
          if (candidate.clientCompanyId !== where.clientCompanyId) return false;
          if (where.amendments?.none && bookings.some((amendment) => amendment.amendedFromId === candidate.id)) {
            return false;
          }
          return true;
        });
      },
    },
  } as any);

  return { service, seenQuoteWheres, seenBookingWheres };
}

function company(id: string) {
  return {
    id,
    name: id,
    website: null,
    logoUrl: null,
    primaryColor: null,
    branding: null,
    _count: {
      contacts: 0,
      leads: 0,
      clientQuotes: 0,
      brandQuotes: 0,
      users: 0,
    },
  };
}

function quote(
  id: string,
  clientCompanyId: string,
  status: string,
  createdDate: string,
  options: { revisedFromId?: string | null } = {},
) {
  return {
    id,
    clientCompanyId,
    status,
    revisedFromId: options.revisedFromId ?? null,
    createdAt: new Date(`${createdDate}T12:00:00.000Z`),
    sentAt: status === 'SENT' ? new Date(`${createdDate}T12:00:00.000Z`) : null,
    acceptedAt: status === 'ACCEPTED' ? new Date(`${createdDate}T12:00:00.000Z`) : null,
  };
}

function booking(
  id: string,
  clientCompanyId: string,
  status: string,
  startDate: string,
  services: Array<{ totalCost: number; totalSell: number; status?: string }>,
  options: { amendedFromId?: string | null } = {},
) {
  return {
    id,
    clientCompanyId,
    status,
    amendedFromId: options.amendedFromId ?? null,
    createdAt: new Date(`${startDate}T10:00:00.000Z`),
    startDate: new Date(`${startDate}T12:00:00.000Z`),
    pricingSnapshotJson: { totalCost: 0, totalSell: 0 },
    services,
  };
}
