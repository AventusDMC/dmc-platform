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
