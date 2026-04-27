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
