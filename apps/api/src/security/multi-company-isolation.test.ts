import { BadRequestException, ForbiddenException } from '@nestjs/common';
import assert = require('node:assert/strict');
import test = require('node:test');
import { ActivitiesController } from '../activities/activities.controller';
import { ActivitiesService } from '../activities/activities.service';
import { ROLES_KEY } from '../auth/auth.decorators';
import { BookingsService } from '../bookings/bookings.service';
import { CompaniesService } from '../companies/companies.service';
import { ContactsService } from '../contacts/contacts.service';
import { ProposalV3Service } from '../quotes/proposal-v3.service';
import { QuotePricingService } from '../quotes/quote-pricing.service';
import { QuotesService } from '../quotes/quotes.service';
import { RoutesService } from '../routes/routes.service';

const actor = {
  id: 'user-dmc-admin',
  userId: 'user-dmc-admin',
  email: 'admin@dmc.example',
  firstName: 'DMC',
  lastName: 'Admin',
  name: 'DMC Admin',
  auditLabel: 'DMC Admin',
  companyId: 'dmc-company',
  role: 'admin' as const,
};

function createQuotesService(prisma: Record<string, any>) {
  return new QuotesService(prisma as any, { log: async () => null } as any, {} as any, {} as any, new QuotePricingService());
}

function createBookingsService(prisma: Record<string, any>) {
  return new BookingsService(prisma as any, { log: async () => null } as any);
}

test('multi-company services still require authenticated actor context', async () => {
  const companies = new CompaniesService({ company: { findMany: async () => [] } } as any);
  const contacts = new ContactsService({ contact: { findMany: async () => [] } } as any);
  const quotes = createQuotesService({ quote: { findMany: async () => [] } });
  const bookings = createBookingsService({ booking: { findMany: async () => [] } });

  assert.throws(() => companies.findAll(undefined), ForbiddenException);
  assert.throws(() => contacts.findAll(undefined), ForbiddenException);
  assert.throws(() => quotes.findAll(undefined), ForbiddenException);
  await assert.rejects(() => bookings.findAll(undefined), ForbiddenException);
});

test('DMC admin can create and retrieve multiple managed companies', async () => {
  const rows: any[] = [];
  const service = new CompaniesService({
    company: {
      create: async ({ data }: any) => {
        const company = { id: `company-${rows.length + 1}`, ...data, branding: null, _count: { contacts: 0 } };
        rows.push(company);
        return company;
      },
      findMany: async () => rows,
      findFirst: async ({ where }: any) =>
        rows.find((company) => company.id === where.id) ?? null,
    },
  } as any);

  const client = await service.create({ name: 'Client Agent', type: 'agent' }, actor);
  const supplier = await service.create({ name: 'Supplier Partner', type: 'supplier' }, actor);
  const list = await service.findAll(actor);
  const detail = await service.findOne(supplier.id, actor);

  assert.equal(client.name, 'Client Agent');
  assert.equal(supplier.name, 'Supplier Partner');
  assert.equal(list.length, 2);
  assert.equal(detail.id, supplier.id);
});

test('admin can create quote for selected client company different from actor company', async () => {
  let createdQuoteData: any;
  const service = createQuotesService({
    $transaction: async (callback: any) => callback({
      quote: {
        findFirst: async ({ where }: any) => (where?.quoteNumber ? null : null),
        create: async ({ data }: any) => {
          createdQuoteData = data;
          return { id: 'quote-1', ...data };
        },
      },
    }),
    company: {
      findFirst: async ({ where }: any) => (where.id === 'client-company' ? { id: 'client-company' } : null),
    },
    contact: {
      findFirst: async ({ where }: any) =>
        where.id === 'contact-1' ? { id: 'contact-1', companyId: 'client-company' } : null,
    },
  });
  (service as any).recalculateQuoteTotals = async () => null;
  (service as any).loadQuoteState = async () => ({ id: 'quote-1', clientCompanyId: 'client-company' });

  const quote = await service.create(
    {
      clientCompanyId: 'client-company',
      contactId: 'contact-1',
      title: 'External client quote',
      quoteCurrency: 'USD',
      quoteType: 'FIT',
      bookingType: 'FIT',
      adults: 2,
      children: 0,
      roomCount: 1,
      nightCount: 1,
      travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
      validUntil: new Date('2026-05-01T00:00:00.000Z'),
    } as any,
    actor,
  );

  assert.notEqual(actor.companyId, 'client-company');
  assert.equal(quote.clientCompanyId, 'client-company');
  assert.equal(createdQuoteData.clientCompanyId, 'client-company');
});

test('quote creation rejects contact that does not belong to selected client company', async () => {
  const service = createQuotesService({
    company: {
      findFirst: async ({ where }: any) => (where.id === 'client-company' ? { id: 'client-company' } : null),
    },
    contact: {
      findFirst: async ({ where }: any) =>
        where.id === 'contact-other' ? { id: 'contact-other', companyId: 'other-client-company' } : null,
    },
  });

  await assert.rejects(
    () =>
      service.create(
        {
          clientCompanyId: 'client-company',
          contactId: 'contact-other',
          title: 'Bad contact quote',
          quoteCurrency: 'USD',
          quoteType: 'FIT',
          bookingType: 'FIT',
          adults: 1,
          children: 0,
          roomCount: 1,
          nightCount: 1,
          travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
          validUntil: new Date('2026-05-01T00:00:00.000Z'),
        } as any,
        actor,
      ),
    /Contact does not belong to the selected company/,
  );
});

test('supplier companies for activities and route catalog are separated from actor and client companies', async () => {
  let supplierCompanyLookup: any;
  let routeFindManyArgs: any;
  const activities = new ActivitiesService({
    company: {
      findUnique: async ({ where }: any) => {
        supplierCompanyLookup = where;
        return { id: where.id, name: 'Supplier Co' };
      },
    },
    activity: {
      create: async ({ data }: any) => ({ id: 'activity-1', ...data }),
    },
  } as any);
  const routes = new RoutesService({
    route: {
      findMany: async (args: any) => {
        routeFindManyArgs = args;
        return [{ id: 'route-1', name: 'QAIA to Petra', isActive: true, fromPlace: null, toPlace: null }];
      },
    },
  } as any);

  const activity = await activities.create({
    name: 'Petra by Night',
    supplierCompanyId: 'supplier-company',
    pricingBasis: 'PER_PERSON',
    costPrice: 35,
    sellPrice: 55,
  });
  const routeList = await routes.findAll({ active: true });

  assert.notEqual(actor.companyId, 'supplier-company');
  assert.notEqual('client-company', 'supplier-company');
  assert.deepEqual(supplierCompanyLookup, { id: 'supplier-company' });
  assert.equal(activity.supplierCompanyId, 'supplier-company');
  assert.equal(routeList.length, 1);
  assert.equal(routeFindManyArgs.where.companyId, undefined);
  assert.equal(routeFindManyArgs.where.clientCompanyId, undefined);
});

test('quote and booking access are not filtered by actor.companyId but still require auth', async () => {
  let quoteFindManyArgs: any;
  let bookingFindManyArgs: any;
  const quotes = createQuotesService({
    quote: {
      findMany: async (args: any) => {
        quoteFindManyArgs = args;
        return [{ id: 'quote-1', clientCompanyId: 'client-company' }];
      },
    },
  });
  const bookings = createBookingsService({
    booking: {
      findMany: async (args: any) => {
        bookingFindManyArgs = args;
        return [];
      },
    },
  });

  const quoteList = await quotes.findAll(actor);
  const bookingList = await bookings.findAll(actor);

  assert.equal(quoteList[0].clientCompanyId, 'client-company');
  assert.equal(quoteFindManyArgs.where, undefined);
  assert.deepEqual(bookingFindManyArgs.where, {});
  assert.deepEqual(bookingList, []);
});

test('client-facing proposal output hides supplier cost internal notes and passenger passport data', async () => {
  const quotes = createQuotesService({});
  (quotes as any).loadQuoteState = async (_id: string, _prisma: any, scopedActor: any) =>
    scopedActor?.companyId
      ? {
          id: 'quote-1',
          quoteNumber: 'Q-SEC-1',
          title: 'Jordan Proposal',
          destination: 'Jordan',
          quoteCurrency: 'USD',
          totalSell: 660,
          totalCost: 525,
          adults: 2,
          children: 1,
          quoteOptions: [],
          pricingSlabs: [],
          scenarios: [],
          inclusionsText: null,
          exclusionsText: null,
          termsNotesText: null,
          clientCompany: { name: 'Client Co' },
          contact: { firstName: 'Lina', lastName: 'Haddad' },
          quoteItems: [
            {
              id: 'item-1',
              totalSell: 660,
              totalCost: 525,
              costBaseAmount: 4321,
              supplierCostBaseAmount: 4321,
              internalNotes: 'SUPPLIER-SECRET-NOTE',
              pricingDescription: 'Petra by Night',
              service: {
                name: 'Petra by Night',
                category: 'Activity',
                supplierId: 'supplier-company',
              },
            },
          ],
          itineraries: [{ dayNumber: 1, title: 'Petra', description: 'Petra by Night' }],
          passengers: [{ fullName: 'Rana Saleh', passportNumber: 'P9988776' }],
        }
      : null;
  const proposal = new ProposalV3Service(quotes);

  const html = await proposal.getProposalHtml('quote-1', actor);

  assert.ok(html);
  assert.match(html, /Petra by Night/);
  assert.doesNotMatch(html, /SUPPLIER-SECRET-NOTE|supplierCost|costBaseAmount|totalCost|4321/);
  assert.doesNotMatch(html, /P9988776|passport/i);
});

test('booking detail masks passport data and mobile operations hides pricing', async () => {
  const service = createBookingsService({
    booking: {
      findFirst: async () => ({
        id: 'booking-1',
        quoteId: 'quote-1',
        clientCompanyId: 'client-company',
        adults: 2,
        children: 0,
        roomCount: 1,
      }),
      findMany: async () => [
        {
          id: 'booking-1',
          bookingRef: 'BK-1',
          status: 'confirmed',
          pax: 2,
          snapshotJson: { title: 'Secure Booking' },
          passengers: [{ id: 'passenger-1', passportNumber: 'P1234567' }],
          days: [
            {
              id: 'day-1',
              dayNumber: 1,
              title: 'Arrival',
              services: [
                {
                  id: 'service-1',
                  description: 'Arrival transfer',
                  totalCost: 120,
                  totalSell: 180,
                },
              ],
            },
          ],
        },
      ],
    },
    quote: {
      findUnique: async () => ({ clientCompany: { id: 'client-company', name: 'Client Co' }, brandCompany: null, contact: {} }),
    },
    quoteVersion: {
      findUnique: async () => null,
    },
    bookingAuditLog: {
      findMany: async () => [],
    },
    bookingPassenger: {
      findMany: async () => [{ id: 'passenger-1', fullName: 'Rana Saleh', passportNumber: 'P1234567', roomingAssignments: [] }],
    },
    bookingDay: {
      findMany: async () => [],
    },
    bookingRoomingEntry: {
      findMany: async () => [],
    },
    payment: {
      findMany: async () => [],
    },
    bookingService: {
      findMany: async () => [],
    },
  });

  const detail = await service.findOne('booking-1', actor);
  const mobile = await service.getOperationsMobileData({ actor, date: '2026-06-01' });
  const mobileText = JSON.stringify(mobile);

  assert.equal(detail.passengers[0].passportNumber, undefined);
  assert.equal(detail.passengers[0].passportNumberMasked, '****4567');
  assert.doesNotMatch(mobileText, /P1234567/);
  assert.doesNotMatch(mobileText, /totalCost|totalSell|120|180/);
});

test('tenant or organization isolation is not configured; authenticated company context remains required', () => {
  const actorKeys = Object.keys(actor);

  assert.equal(actorKeys.includes('tenantId'), false);
  assert.equal(actorKeys.includes('orgId'), false);
  assert.throws(() => new CompaniesService({} as any).findAll(undefined), ForbiddenException);
});

test('activity catalog is not actor-company filtered and write routes require privileged roles', async () => {
  let findManyArgs: any;
  const activities = new ActivitiesService({
    activity: {
      findMany: async (args: any) => {
        findManyArgs = args;
        return [{ id: 'activity-1', supplierCompanyId: 'supplier-company' }];
      },
    },
  } as any);

  const list = await activities.findAll();

  assert.equal(list[0].supplierCompanyId, 'supplier-company');
  assert.equal(findManyArgs.where, undefined);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ActivitiesController.prototype.create), ['admin', 'operations']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ActivitiesController.prototype.update), ['admin', 'operations']);
});

test('negative security cases reject invalid IDs and invalid supplier assignment', async () => {
  const quotes = createQuotesService({
    company: {
      findFirst: async () => null,
    },
    contact: {
      findFirst: async () => null,
    },
  });
  const activities = new ActivitiesService({
    company: {
      findUnique: async () => null,
    },
  } as any);

  await assert.rejects(
    () =>
      quotes.create(
        {
          clientCompanyId: 'missing-client-company',
          contactId: 'missing-contact',
          title: 'Invalid client quote',
          quoteCurrency: 'USD',
          quoteType: 'FIT',
          bookingType: 'FIT',
          adults: 1,
          children: 0,
          roomCount: 1,
          nightCount: 1,
          travelStartDate: new Date('2026-06-01T00:00:00.000Z'),
          validUntil: new Date('2026-05-01T00:00:00.000Z'),
        } as any,
        actor,
      ),
    /Company not found/,
  );
  await assert.rejects(
    () =>
      activities.create({
        name: 'Bad supplier activity',
        supplierCompanyId: 'missing-supplier-company',
        pricingBasis: 'PER_PERSON',
        costPrice: 10,
        sellPrice: 15,
      }),
    (error: unknown) => error instanceof BadRequestException && /Supplier company not found/.test(error.message),
  );
});
