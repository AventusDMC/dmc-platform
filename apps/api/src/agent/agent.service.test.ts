const nodeTestAgent = require('node:test');
const agentAssert = require('node:assert/strict');
const { AgentService } = require('./agent.service');

function createAgentService(overrides?: {
  quotesService?: Partial<any>;
  prisma?: Partial<any>;
}) {
  return new AgentService(
    {
      company: {
        findUnique: async () => ({ id: 'company-1', name: 'Desert Compass' }),
      },
      quote: {
        findMany: async () => [],
      },
      ...overrides?.prisma,
    } as any,
    {
      findAll: async () => [],
      findOne: async () => null,
      ...overrides?.quotesService,
    } as any,
  );
}

nodeTestAgent.test('agent service exposes sanitized quote detail only', async () => {
  const service = createAgentService({
    quotesService: {
      findOne: async () => ({
        id: 'quote-1',
        agentId: 'user-1',
        quoteNumber: 'Q-1001',
        title: 'Jordan Travel Proposal',
        description: 'Client-safe summary',
        status: 'SENT',
        quoteCurrency: 'USD',
        totalSell: 3200,
        pricePerPax: 1600,
        totalCost: 2100,
        markupPercent: 22,
        publicEnabled: true,
        publicToken: 'public-token',
        quoteItems: [
          {
            id: 'item-1',
            itineraryId: 'day-1',
            quantity: 1,
            serviceDate: '2026-05-10',
            startTime: '09:00',
            pickupTime: '08:30',
            pickupLocation: 'Airport',
            meetingPoint: 'Arrivals',
            totalCost: 90,
            markupPercent: 30,
            service: {
              name: 'Airport transfer',
              category: 'Transport',
              serviceType: {
                name: 'Transfer',
              },
            },
          },
        ],
        itineraries: [
          {
            id: 'day-1',
            dayNumber: 1,
            title: 'Arrival in Amman',
            description: 'Arrival and transfer',
          },
        ],
        company: {
          id: 'company-1',
          name: 'Desert Compass',
        },
        contact: {
          id: 'contact-1',
          firstName: 'Layla',
          lastName: 'Haddad',
          email: 'layla@example.com',
        },
      }),
    },
  });

  const quote = await service.getQuote('quote-1', {
    id: 'user-1',
    email: 'agent@example.com',
    role: 'agent',
    firstName: 'Agent',
    lastName: 'User',
    name: 'Agent User',
    auditLabel: 'Agent User',
    companyId: 'company-1',
  });

  agentAssert.ok(quote);
  agentAssert.equal(quote?.publicUrl, '/proposal/public-token');
  agentAssert.equal('totalCost' in (quote as Record<string, unknown>), false);
  agentAssert.equal('markupPercent' in (quote as Record<string, unknown>), false);
  agentAssert.equal('totalCost' in (quote?.itinerary[0].services[0] as Record<string, unknown>), false);
  agentAssert.equal('markupPercent' in (quote?.itinerary[0].services[0] as Record<string, unknown>), false);
});

nodeTestAgent.test('agent proposals only include public-enabled quotes', async () => {
  const service = createAgentService({
    prisma: {
      quote: {
        findMany: async () => [
        {
          id: 'quote-public',
          title: 'Public quote',
          status: 'SENT',
          quoteNumber: 'Q-1',
          publicEnabled: true,
          publicToken: 'token-1',
          updatedAt: '2026-04-25T10:00:00.000Z',
        },
        {
          id: 'quote-private',
          title: 'Private quote',
          status: 'DRAFT',
          quoteNumber: 'Q-2',
          publicEnabled: false,
          publicToken: null,
          updatedAt: '2026-04-25T10:00:00.000Z',
        },
      ],
      },
    },
  });

  const proposals = await service.getProposals({
    id: 'user-1',
    email: 'agent@example.com',
    role: 'agent',
    firstName: 'Agent',
    lastName: 'User',
    name: 'Agent User',
    auditLabel: 'Agent User',
    companyId: 'company-1',
  });

  agentAssert.equal(proposals.length, 1);
  agentAssert.equal(proposals[0].publicUrl, '/proposal/token-1');
  agentAssert.equal(proposals[0].pdfUrl, '/api/public/proposals/token-1/pdf');
});

nodeTestAgent.test('agent portal phase one isolates visibility and exposes finance passenger documents and departures', async () => {
  const seenBookingWhere: any[] = [];
  const seenDepartureWhere: any[] = [];
  const service = createAgentService({
    prisma: {
      booking: {
        findMany: async ({ where }: any) => {
          seenBookingWhere.push(where);
          return [];
        },
        findFirst: async ({ where }: any) => {
          seenBookingWhere.push(where);
          return {
            id: 'booking-1',
            bookingRef: 'BK-1',
            status: 'confirmed',
            adults: 2,
            children: 0,
            roomCount: 1,
            nightCount: 2,
            snapshotJson: { title: 'Jordan Highlights', totalSell: 2400, travelStartDate: '2026-05-29' },
            pricingSnapshotJson: { totalSell: 2400 },
            clientSnapshotJson: { name: 'Client Co' },
            quote: { title: 'Jordan Highlights', clientCompany: { name: 'Client Co' } },
            passengers: [
              {
                id: 'passenger-1',
                fullName: 'Lina Haddad',
                firstName: 'Lina',
                lastName: 'Haddad',
                isLead: true,
                nationality: 'JO',
                passportNumber: 'P123456',
                hotelCategoryVariant: '4 star',
                branchExtension: 'Dead Sea extension',
              },
            ],
            payments: [
              {
                id: 'payment-1',
                type: 'CLIENT',
                amount: 600,
                status: 'PAID',
                method: 'cliq',
                reference: 'CLIQ-001',
              },
            ],
            vouchers: [{ id: 'voucher-1', type: 'HOTEL', status: 'READY' }],
            services: [],
            seriesDeparture: {
              id: 'departure-1',
              seriesId: 'series-1',
              departureCode: 'JOR-001',
              departureDate: '2026-05-29',
              paxCount: 20,
              totalCapacity: 30,
              status: 'PLANNED',
              series: { seriesCode: 'JOR', seriesName: 'Jordan Series' },
              booking: {
                passengers: [
                  { hotelCategoryVariant: '4 star', branchExtension: 'Dead Sea extension' },
                ],
              },
            },
          };
        },
      },
      seriesDeparture: {
        findMany: async ({ where }: any) => {
          seenDepartureWhere.push(where);
          return [
            {
              id: 'departure-1',
              seriesId: 'series-1',
              departureCode: 'JOR-001',
              departureDate: '2026-05-29',
              paxCount: 20,
              totalCapacity: 30,
              status: 'PLANNED',
              series: { seriesCode: 'JOR', seriesName: 'Jordan Series' },
              booking: {
                passengers: [
                  { hotelCategoryVariant: '4 star', branchExtension: 'Dead Sea extension' },
                ],
              },
            },
          ];
        },
      },
    },
  });
  const actor = {
    id: 'agent-1',
    email: 'agent@example.com',
    role: 'agent',
    firstName: 'Agent',
    lastName: 'User',
    name: 'Agent User',
    auditLabel: 'Agent User',
    companyId: 'company-1',
  };

  await service.getBookings(actor as any);
  const booking = await service.getBooking('booking-1', actor as any);
  const departures = await service.getDepartures(actor as any);

  agentAssert.deepEqual(seenBookingWhere[0].quote.OR, [{ agentId: 'agent-1' }, { agentId: null }]);
  agentAssert.equal(seenBookingWhere[0].quote.clientCompanyId, 'company-1');
  agentAssert.deepEqual(seenDepartureWhere[0], { series: { active: true } });
  agentAssert.equal(booking.finance.remainingBalance, 1800);
  agentAssert.equal(booking.passengers[0].passportStatus, 'on_file');
  agentAssert.equal('passportNumber' in booking.passengers[0], false);
  agentAssert.equal(booking.vouchers[0].pdfUrl, '/api/agent/bookings/booking-1/voucher/pdf');
  agentAssert.equal(booking.amendmentRequests.enabled, true);
  agentAssert.equal(departures[0].availability.seatsRemaining, 10);
  agentAssert.deepEqual(departures[0].hotelCategories, ['4 star']);
});

nodeTestAgent.test('agent portal computes commission on bookings from the company rate', async () => {
  const service = createAgentService({
    prisma: {
      company: {
        findUnique: async () => ({ id: 'company-1', name: 'Desert Compass', agentCommissionPercent: 10 }),
      },
      booking: {
        findMany: async () => [
          {
            id: 'booking-1',
            bookingRef: 'BK-1',
            status: 'confirmed',
            snapshotJson: { title: 'Trip', totalSell: 2000 },
            pricingSnapshotJson: { totalSell: 2000 },
            quote: { clientCompany: { name: 'Client Co' } },
          },
        ],
      },
    },
  });
  const actor = { id: 'agent-1', email: 'a@x.com', role: 'agent', name: 'A', auditLabel: 'A', companyId: 'company-1' };

  const me = await service.getMe(actor as any);
  agentAssert.equal(me.company.agentCommissionPercent, 10);

  const bookings = await service.getBookings(actor as any);
  agentAssert.equal(bookings[0].commissionPercent, 10);
  agentAssert.equal(bookings[0].commissionAmount, 200); // 10% of 2000
});

nodeTestAgent.test('agent portal omits commission when no company rate is configured', async () => {
  const service = createAgentService({
    prisma: {
      company: {
        findUnique: async () => ({ id: 'company-1', name: 'Desert Compass', agentCommissionPercent: null }),
      },
      booking: {
        findMany: async () => [
          {
            id: 'booking-1',
            bookingRef: 'BK-1',
            status: 'confirmed',
            snapshotJson: { totalSell: 2000 },
            pricingSnapshotJson: { totalSell: 2000 },
            quote: {},
          },
        ],
      },
    },
  });
  const actor = { id: 'agent-1', email: 'a@x.com', role: 'agent', name: 'A', auditLabel: 'A', companyId: 'company-1' };

  const bookings = await service.getBookings(actor as any);
  agentAssert.equal(bookings[0].commissionPercent, null);
  agentAssert.equal(bookings[0].commissionAmount, null);
});

nodeTestAgent.test('net-rate agents see cost+handling pricing and earn no commission', async () => {
  const service = createAgentService({
    prisma: {
      company: {
        findUnique: async () => ({
          id: 'company-1',
          name: 'Net Partner',
          agentRateMode: 'NET',
          agentNetHandlingPercent: 12,
          agentCommissionPercent: 10, // ignored in NET mode
        }),
      },
      quote: {
        findMany: async () => [
          { id: 'q1', title: 'Trip', status: 'SENT', totalSell: 1500, totalCost: 1000, adults: 2, children: 0, pricePerPax: 750 },
        ],
      },
      booking: {
        findMany: async () => [
          {
            id: 'b1',
            bookingRef: 'BK-1',
            status: 'confirmed',
            snapshotJson: { totalSell: 1500 },
            pricingSnapshotJson: { totalSell: 1500, totalCost: 1000 },
            quote: {},
          },
        ],
      },
    },
  });
  const actor = { id: 'agent-1', email: 'a@x.com', role: 'agent', name: 'A', auditLabel: 'A', companyId: 'company-1' };

  const me = await service.getMe(actor as any);
  agentAssert.equal(me.rateMode, 'NET');
  agentAssert.equal(me.netHandlingPercent, 12);

  const quotes = await service.getQuotes(actor as any);
  agentAssert.equal(quotes[0].rateMode, 'NET');
  agentAssert.equal(quotes[0].totalSell, 1120); // 1000 cost + 12% handling, NOT the 1500 gross
  agentAssert.equal(quotes[0].pricePerPax, 560); // 1120 / 2 pax

  const bookings = await service.getBookings(actor as any);
  agentAssert.equal(bookings[0].rateMode, 'NET');
  agentAssert.equal(bookings[0].totalSell, 1120);
  agentAssert.equal(bookings[0].commissionAmount, null); // net agents add their own margin, no commission
});

nodeTestAgent.test('agent analytics aggregates conversion, value, commission, status mix and trend', async () => {
  const service = createAgentService({
    prisma: {
      company: {
        findUnique: async () => ({ id: 'company-1', name: 'Desert Compass', agentCommissionPercent: 10 }),
      },
      quote: {
        findMany: async () => [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }],
      },
      booking: {
        findMany: async () => [
          { id: 'b1', status: 'confirmed', createdAt: new Date('2026-04-10T00:00:00Z'), pricingSnapshotJson: { totalSell: 1000 }, snapshotJson: {} },
          { id: 'b2', status: 'completed', createdAt: new Date('2026-05-12T00:00:00Z'), pricingSnapshotJson: { totalSell: 3000 }, snapshotJson: {} },
          { id: 'b3', status: 'cancelled', createdAt: new Date('2026-05-20T00:00:00Z'), pricingSnapshotJson: { totalSell: 5000 }, snapshotJson: {} },
        ],
      },
    },
  });
  const actor = { id: 'agent-1', email: 'a@x.com', role: 'agent', name: 'A', auditLabel: 'A', companyId: 'company-1' };

  const analytics = await service.getAnalytics(actor as any);

  agentAssert.equal(analytics.quoteCount, 4);
  agentAssert.equal(analytics.bookingCount, 2); // cancelled excluded
  agentAssert.equal(analytics.cancelledBookings, 1);
  agentAssert.equal(analytics.conversionRate, 50); // 2 of 4
  agentAssert.equal(analytics.totalBookingValue, 4000); // 1000 + 3000
  agentAssert.equal(analytics.avgBookingValue, 2000);
  agentAssert.equal(analytics.commissionPercent, 10);
  agentAssert.equal(analytics.totalCommission, 400); // 10% of 4000
  agentAssert.equal(analytics.bookingsByStatus.reduce((total: number, row: any) => total + row.count, 0), 3);
  agentAssert.equal(analytics.monthlyTrend.length, 2);
  agentAssert.equal(analytics.monthlyTrend[0].month, '2026-04');
  agentAssert.equal(analytics.monthlyTrend[1].bookingValue, 3000);
});

nodeTestAgent.test('agent booking requests enforce stop sale, waitlist over-capacity, and create request audit log', async () => {
  const createdLogs: any[] = [];
  const service = createAgentService({
    prisma: {
      seriesDeparture: {
        findFirst: async () => ({
          id: 'departure-1',
          bookingId: 'booking-1',
          departureCode: 'JOR-001',
          departureDate: '2026-05-29',
          paxCount: 28,
          totalCapacity: 30,
          reservedSeats: 28,
          stopSaleThreshold: 0,
          status: 'PLANNED',
          hotelAllotmentsJson: [{ category: '4 star', blockedRooms: 40, stopSale: false }],
          series: {
            seriesCode: 'JOR',
            seriesName: 'Jordan Series',
            active: true,
            programVariantsJson: [{ label: '4 star' }],
            branchExtensionsJson: [{ label: 'Dead Sea extension' }],
          },
          booking: {
            pax: 28,
            pricingSnapshotJson: { totalSell: 28000, currency: 'USD' },
            passengers: [],
          },
        }),
      },
      bookingAuditLog: {
        create: async ({ data }: any) => {
          createdLogs.push(data);
          return { id: 'request-log-1', createdAt: new Date('2026-05-17T00:00:00Z'), ...data };
        },
      },
    },
  });
  const actor = {
    id: 'agent-1',
    email: 'agent@example.com',
    role: 'agent',
    firstName: 'Agent',
    lastName: 'User',
    name: 'Agent User',
    auditLabel: 'Agent User',
    companyId: 'company-1',
  };

  const request = await service.requestDepartureSeats('departure-1', actor as any, {
    passengerCount: 4,
    hotelCategory: '4 star',
    extension: 'Dead Sea extension',
  });

  agentAssert.equal(request.status, 'waitlisted');
  agentAssert.equal(request.passengerCount, 4);
  agentAssert.equal(createdLogs[0].action, 'agent.booking_request.created');
  agentAssert.equal(createdLogs[0].bookingId, 'booking-1');
  agentAssert.match(createdLogs[0].newValue, /"status":"waitlisted"/);
});

nodeTestAgent.test('agent booking requests reject stop-sale departures before creating audit records', async () => {
  let createCalled = false;
  const service = createAgentService({
    prisma: {
      seriesDeparture: {
        findFirst: async () => ({
          id: 'departure-stop',
          bookingId: 'booking-1',
          paxCount: 10,
          totalCapacity: 20,
          status: 'STOP_SALE',
          series: { seriesName: 'Jordan Series', active: true },
          booking: { passengers: [] },
        }),
      },
      bookingAuditLog: {
        create: async () => {
          createCalled = true;
        },
      },
    },
  });

  await agentAssert.rejects(
    () => service.requestDepartureSeats('departure-stop', { id: 'agent-1', email: 'agent@example.com', auditLabel: 'Agent' } as any, { passengerCount: 1 }),
    /Departure is currently stop sale/,
  );
  agentAssert.equal(createCalled, false);
});

nodeTestAgent.test('agent document access validates assigned invoice and booking before PDF generation', async () => {
  const calls: string[] = [];
  const service = createAgentService({
    prisma: {
      invoice: {
        findFirst: async ({ where }: any) => {
          agentAssert.deepEqual(where.quote.OR, [{ agentId: 'agent-1' }, { agentId: null }]);
          return { id: where.id };
        },
      },
      booking: {
        findFirst: async ({ where }: any) => {
          agentAssert.deepEqual(where.quote.OR, [{ agentId: 'agent-1' }, { agentId: null }]);
          return { id: where.id, bookingRef: 'BK-1' };
        },
      },
    },
  });
  (service as any).invoicesService = {
    generatePdf: async () => {
      calls.push('invoice');
      return Buffer.from('%PDF invoice');
    },
  };
  (service as any).bookingsService = {
    generateVoucherPdf: async () => {
      calls.push('voucher');
      return Buffer.from('%PDF voucher');
    },
  };
  const actor = {
    id: 'agent-1',
    email: 'agent@example.com',
    role: 'agent',
    firstName: 'Agent',
    lastName: 'User',
    name: 'Agent User',
    auditLabel: 'Agent User',
    companyId: 'company-1',
  };

  await service.getInvoicePdf('invoice-1', actor as any);
  await service.getBookingVoucherPdf('booking-1', actor as any);

  agentAssert.deepEqual(calls, ['invoice', 'voucher']);
});

nodeTestAgent.test('agent portal includes unassigned company records as admin demo fallback but excludes other assigned agents', async () => {
  const seenQuoteWhere: any[] = [];
  const service = createAgentService({
    prisma: {
      quote: {
        findMany: async ({ where }: any) => {
          seenQuoteWhere.push(where);
          return [
            {
              id: 'quote-unassigned',
              title: 'Unassigned company quote',
              status: 'SENT',
              clientCompanyId: 'company-1',
              agentId: null,
              clientCompany: { id: 'company-1', name: 'Agency Co' },
              contact: null,
            },
          ];
        },
      },
    },
    quotesService: {
      findOne: async (_id: string) => ({
        id: 'quote-unassigned',
        title: 'Unassigned company quote',
        status: 'SENT',
        clientCompanyId: 'company-1',
        agentId: null,
        clientCompany: { id: 'company-1', name: 'Agency Co' },
        contact: null,
        itineraries: [],
        quoteItems: [],
      }),
    },
  });
  const actor = {
    id: 'agent-1',
    email: 'agent@example.com',
    role: 'agent',
    firstName: 'Agent',
    lastName: 'User',
    name: 'Agent User',
    auditLabel: 'Agent User',
    companyId: 'company-1',
  };

  const quotes = await service.getQuotes(actor as any);
  const quote = await service.getQuote('quote-unassigned', actor as any);
  const otherAgentQuote = await (service as any).canActorViewQuote({ clientCompanyId: 'company-1', agentId: 'agent-2' }, actor);

  agentAssert.deepEqual(seenQuoteWhere[0], {
    clientCompanyId: 'company-1',
    OR: [{ agentId: 'agent-1' }, { agentId: null }],
  });
  agentAssert.equal(quotes.length, 1);
  agentAssert.ok(quote);
  agentAssert.equal(otherAgentQuote, false);
});
