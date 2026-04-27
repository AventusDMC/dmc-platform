import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { ContractImportStatus, ContractImportType } from '@prisma/client';
import { ContractImportsService } from '../contract-imports/contract-imports.service';
import { ProposalV3Service } from '../quotes/proposal-v3.service';
import { QuotePricingService } from '../quotes/quote-pricing.service';
import { QuotesService } from '../quotes/quotes.service';

const actorA = {
  id: 'user-a',
  email: 'a@example.com',
  role: 'admin' as const,
  firstName: 'User',
  lastName: 'A',
  name: 'User A',
  auditLabel: 'User A',
  companyId: 'company-a',
};

const actorB = {
  ...actorA,
  id: 'user-b',
  email: 'b@example.com',
  name: 'User B',
  auditLabel: 'User B',
  companyId: 'company-b',
};

function createQuotesService(prisma: Record<string, any>) {
  return new QuotesService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    new QuotePricingService(),
  );
}

function createContractImportsService(prisma: Record<string, any>) {
  return new ContractImportsService({
    contractImportAuditLog: {
      create: async ({ data }: any) => ({ id: 'audit-1', ...data }),
    },
    ...prisma,
  } as any);
}

test('quote listing requires company auth and filters to the actor company', async () => {
  const calls: any[] = [];
  const service = createQuotesService({
    quote: {
      findMany: async (args: any) => {
        calls.push(args);
        return [];
      },
    },
  });

  assert.throws(() => service.findAll(undefined), ForbiddenException);

  const result = await service.findAll(actorA);

  assert.deepEqual(result, []);
  assert.equal(calls[0].where.clientCompanyId, 'company-a');
});

test('quote read and mutation do not cross company boundaries', async () => {
  const quoteFindFirstCalls: any[] = [];
  const service = createQuotesService({
    quote: {
      findFirst: async (args: any) => {
        quoteFindFirstCalls.push(args);
        return args.where.id === 'quote-b' && args.where.clientCompanyId === 'company-b'
          ? { id: 'quote-b', clientCompanyId: 'company-b' }
          : null;
      },
    },
  });
  (service as any).loadQuoteState = async (id: string, _prisma: any, actor: any) =>
    id === 'quote-b' && actor?.companyId === 'company-b' ? { id: 'quote-b', clientCompanyId: 'company-b' } : null;

  assert.equal(await service.findOne('quote-b', actorA), null);
  const ownedQuote = await service.findOne('quote-b', actorB);
  assert.equal(ownedQuote?.id, 'quote-b');
  assert.equal(ownedQuote?.clientCompanyId, 'company-b');
  await assert.rejects(() => service.update('quote-b', { title: 'Blocked' } as any, actorA), /Quote not found/);

  assert.equal(quoteFindFirstCalls[0].where.id, 'quote-b');
  assert.equal(quoteFindFirstCalls[0].where.clientCompanyId, 'company-a');
});

test('quote item mutation stops before hotel contract lookup when the item belongs to another company', async () => {
  let hotelRateLookupCount = 0;
  const service = createQuotesService({
    quoteItem: {
      findFirst: async ({ where }: any) =>
        where.id === 'item-b' && where.quote?.clientCompanyId === 'company-b'
          ? { id: 'item-b', quoteId: 'quote-b', serviceId: 'service-hotel' }
          : null,
    },
    hotelRate: {
      findFirst: async () => {
        hotelRateLookupCount += 1;
        return { id: 'rate-b' };
      },
    },
  });

  await assert.rejects(
    () => service.updateItem('item-b', { contractId: 'contract-b', hotelId: 'hotel-b' } as any, actorA),
    /Quote item not found/,
  );

  assert.equal(hotelRateLookupCount, 0);
});

test('proposal export uses quote ownership scope and returns not found for another company', async () => {
  const quotes = createQuotesService({});
  (quotes as any).loadQuoteState = async (id: string, _prisma: any, actor: any) =>
    id === 'quote-b' && actor?.companyId === 'company-b' ? { id: 'quote-b', title: 'Company B Quote' } : null;
  const proposal = new ProposalV3Service(quotes);

  assert.equal(await proposal.getProposalHtml('quote-b', actorA), null);
});

test('contract import listing and detail are scoped to creator company', async () => {
  const importFindManyCalls: any[] = [];
  const service = createContractImportsService({
    user: {
      findMany: async ({ where }: any) =>
        where.companyId === 'company-a' || (where.companyId === undefined && where.id?.in?.includes('user-a'))
          ? [{ id: 'user-a', firstName: 'User', lastName: 'A', email: 'a@example.com' }]
          : [],
    },
    contractImport: {
      findMany: async (args: any) => {
        importFindManyCalls.push(args);
        return [
          {
            id: 'import-a',
            contractType: ContractImportType.HOTEL,
            sourceFileName: 'a.xlsx',
            createdByUserId: 'user-a',
            approvedByUserId: null,
            extractedJson: null,
            approvedJson: null,
            auditLogs: [],
          },
        ];
      },
      findUnique: async ({ where }: any) => ({
        id: where.id,
        status: ContractImportStatus.ANALYZED,
        createdByUserId: 'user-a',
        approvedByUserId: null,
        extractedJson: null,
        auditLogs: [],
      }),
    },
  });

  const imports = await service.findAll(actorA);
  const detail = await service.findOne('import-a', actorA);

  assert.equal(importFindManyCalls[0].where.OR[0].createdByUserId.in[0], 'user-a');
  assert.equal(imports[0].id, 'import-a');
  assert.equal(detail.id, 'import-a');
  await assert.rejects(() => service.findOne('import-a', actorB), /not accessible for the current company/);
});

test('contract import approval is rejected for another company before approval writes run', async () => {
  let claimCount = 0;
  const service = createContractImportsService({
    user: {
      findMany: async ({ where }: any) =>
        where.companyId === 'company-a' && where.id?.in?.includes('user-a') ? [{ id: 'user-a' }] : [],
    },
    contractImport: {
      findUnique: async () => ({
        id: 'import-a',
        status: ContractImportStatus.ANALYZED,
        supplierId: 'supplier-1',
        sourceFileName: 'contract.xlsx',
        sourceFilePath: 'contract.xlsx',
        createdByUserId: 'user-a',
        approvedByUserId: null,
        extractedJson: {},
        auditLogs: [],
      }),
      updateMany: async () => {
        claimCount += 1;
        return { count: 1 };
      },
    },
  });

  await assert.rejects(() => service.approve('import-a', undefined, actorB), /not accessible for the current company/);
  assert.equal(claimCount, 0);
});
