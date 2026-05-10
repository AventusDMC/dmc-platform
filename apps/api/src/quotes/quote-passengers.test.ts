import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuotesService } from './quotes.service';
import { QuotePricingService } from './quote-pricing.service';

function createService() {
  const passengers: any[] = [];
  const prisma = {
    quote: {
      findFirst: async ({ where }: any) => {
        if (where.id === 'quote-1') return { id: 'quote-1' };
        return null;
      },
    },
    quotePassenger: {
      findMany: async ({ where }: any) => passengers.filter((passenger) => passenger.quoteId === where.quoteId),
      create: async ({ data }: any) => {
        const passenger = { id: `passenger-${passengers.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        passengers.push(passenger);
        return passenger;
      },
      findFirst: async ({ where }: any) =>
        passengers.find((passenger) => passenger.id === where.id && passenger.quoteId === where.quoteId) || null,
      update: async ({ where, data }: any) => {
        const index = passengers.findIndex((passenger) => passenger.id === where.id);
        passengers[index] = { ...passengers[index], ...data, updatedAt: new Date() };
        return passengers[index];
      },
      delete: async ({ where }: any) => {
        const index = passengers.findIndex((passenger) => passenger.id === where.id);
        const [passenger] = passengers.splice(index, 1);
        return passenger;
      },
    },
  };
  const service = new QuotesService(
    prisma as any,
    {} as any,
    {} as any,
    { evaluate: async () => null } as any,
    new QuotePricingService(),
  );
  return { service, passengers };
}

test('quote passenger CRUD preserves quote linkage and passenger counts', async () => {
  const { service, passengers } = createService();
  const actor = { companyId: 'company-1' } as any;

  const created = await service.createPassenger(
    'quote-1',
    {
      firstName: 'Lina',
      lastName: 'Haddad',
      gender: 'F',
      nationality: 'Jordanian',
      passportNumber: 'P1234567',
      passportExpiry: new Date('2030-01-01T00:00:00.000Z'),
      dietaryNotes: 'Vegetarian',
    },
    actor,
  );

  assert.equal(created.quoteId, 'quote-1');
  assert.equal(created.firstName, 'Lina');
  assert.equal(created.lastName, 'Haddad');
  assert.equal(passengers.length, 1);

  const listed = await service.findPassengers('quote-1', actor);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);

  const updated = await service.updatePassenger(
    'quote-1',
    created.id,
    {
      firstName: 'Lina',
      lastName: 'Saleh',
      mobilityNotes: 'Front seat preferred',
      passportNumber: 'P7654321',
    },
    actor,
  );

  assert.equal(updated.lastName, 'Saleh');
  assert.equal(updated.mobilityNotes, 'Front seat preferred');
  assert.equal(updated.passportNumber, 'P7654321');
  assert.equal(passengers.length, 1);

  const removed = await service.removePassenger('quote-1', created.id, actor);
  assert.deepEqual(removed, { id: created.id });
  assert.equal(passengers.length, 0);
});

test('quote passenger validation requires names and rejects wrong quote linkage', async () => {
  const { service } = createService();
  const actor = { companyId: 'company-1' } as any;

  await assert.rejects(
    () => service.createPassenger('quote-1', { firstName: '', lastName: 'Haddad' }, actor),
    /firstName is required/,
  );

  await assert.rejects(
    () => service.updatePassenger('quote-1', 'missing-passenger', { firstName: 'A', lastName: 'B' }, actor),
    /Quote passenger not found/,
  );
});
