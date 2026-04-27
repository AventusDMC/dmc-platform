import { BadRequestException } from '@nestjs/common';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROLES_KEY } from '../auth/auth.decorators';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

function createActivitiesService(overrides: Partial<any> = {}) {
  const prisma = {
    company: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
    },
    activity: {
      create: async ({ data, include }: any) => ({
        id: 'activity-1',
        ...data,
        supplierCompany: include?.supplierCompany ? { id: data.supplierCompanyId, name: 'Petra Experiences' } : undefined,
      }),
      findMany: async (args: any) => [
        {
          id: 'activity-1',
          name: 'Petra by Night',
          supplierCompanyId: 'supplier-company-1',
          pricingBasis: 'PER_PERSON',
          costPrice: 35,
          sellPrice: 55,
          active: true,
          supplierCompany: args.include?.supplierCompany ? { id: 'supplier-company-1', name: 'Petra Experiences' } : undefined,
        },
      ],
      findUnique: async ({ where, include }: any) =>
        where.id === 'missing'
          ? null
          : {
              id: where.id,
              name: 'Petra by Night',
              supplierCompanyId: 'supplier-company-1',
              pricingBasis: 'PER_PERSON',
              costPrice: 35,
              sellPrice: 55,
              active: true,
              supplierCompany: include?.supplierCompany ? { id: 'supplier-company-1', name: 'Petra Experiences' } : undefined,
            },
      update: async ({ where, data, include }: any) => ({
        id: where.id,
        ...data,
        supplierCompany: include?.supplierCompany ? { id: data.supplierCompanyId ?? 'supplier-company-1', name: 'Petra Experiences' } : undefined,
      }),
    },
    ...overrides,
  };

  return {
    service: new ActivitiesService(prisma as any),
    prisma,
  };
}

test('create activity persists supplier company pricing and active state', async () => {
  let createdData: any;
  const { service } = createActivitiesService({
    activity: {
      create: async ({ data }: any) => {
        createdData = data;
        return { id: 'activity-1', ...data };
      },
    },
  });

  const activity = await service.create({
    name: ' Petra by Night ',
    description: ' Evening visit ',
    supplierCompanyId: 'supplier-company-1',
    pricingBasis: 'PER_PERSON',
    costPrice: 35,
    sellPrice: 55,
    durationMinutes: 120,
  });

  assert.equal(activity.id, 'activity-1');
  assert.equal(createdData.name, 'Petra by Night');
  assert.equal(createdData.description, 'Evening visit');
  assert.equal(createdData.supplierCompanyId, 'supplier-company-1');
  assert.equal(createdData.pricingBasis, 'PER_PERSON');
  assert.equal(createdData.costPrice, 35);
  assert.equal(createdData.sellPrice, 55);
  assert.equal(createdData.durationMinutes, 120);
  assert.equal(createdData.active, true);
});

test('list and detail activities are not filtered by actor company', async () => {
  let findManyArgs: any;
  let findUniqueArgs: any;
  const { service } = createActivitiesService({
    activity: {
      findMany: async (args: any) => {
        findManyArgs = args;
        return [{ id: 'activity-1', supplierCompanyId: 'supplier-company-1' }];
      },
      findUnique: async (args: any) => {
        findUniqueArgs = args;
        return { id: args.where.id, supplierCompanyId: 'supplier-company-1' };
      },
    },
  });

  const activities = await service.findAll();
  const activity = await service.findOne('activity-1');

  assert.equal(activities[0].supplierCompanyId, 'supplier-company-1');
  assert.equal(activity.id, 'activity-1');
  assert.equal(findManyArgs.where, undefined);
  assert.deepEqual(findUniqueArgs.where, { id: 'activity-1' });
});

test('update activity validates pricing basis and supplier company without actor-company forcing', async () => {
  let companyLookupWhere: any;
  let updateData: any;
  const { service } = createActivitiesService({
    company: {
      findUnique: async ({ where }: any) => {
        companyLookupWhere = where;
        return { id: where.id };
      },
    },
    activity: {
      findUnique: async ({ where }: any) => ({ id: where.id }),
      update: async ({ data }: any) => {
        updateData = data;
        return { id: 'activity-1', ...data };
      },
    },
  });

  await service.update('activity-1', {
    supplierCompanyId: 'supplier-company-2',
    pricingBasis: 'PER_GROUP',
    active: false,
  });

  assert.deepEqual(companyLookupWhere, { id: 'supplier-company-2' });
  assert.equal(updateData.supplierCompanyId, 'supplier-company-2');
  assert.equal(updateData.pricingBasis, 'PER_GROUP');
  assert.equal(updateData.active, false);
});

test('activity validation rejects unsupported pricing basis and missing supplier company', async () => {
  const { service } = createActivitiesService({
    company: {
      findUnique: async () => null,
    },
  });

  await assert.rejects(
    () =>
      service.create({
        name: 'Bad activity',
        supplierCompanyId: 'missing-company',
        pricingBasis: 'PER_PERSON',
        costPrice: 10,
        sellPrice: 15,
      }),
    (error: unknown) => error instanceof BadRequestException && /Supplier company not found/.test(error.message),
  );

  const validSupplier = createActivitiesService().service;
  await assert.rejects(
    () =>
      validSupplier.create({
        name: 'Bad activity',
        supplierCompanyId: 'supplier-company-1',
        pricingBasis: 'PER_DAY' as any,
        costPrice: 10,
        sellPrice: 15,
      }),
    (error: unknown) => error instanceof BadRequestException && /PER_PERSON or PER_GROUP/.test(error.message),
  );
});

test('activities write routes remain protected for admin and operations users', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ActivitiesController.prototype.create), ['admin', 'operations']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, ActivitiesController.prototype.update), ['admin', 'operations']);
});
