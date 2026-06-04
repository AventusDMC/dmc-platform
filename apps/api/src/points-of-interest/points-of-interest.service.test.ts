import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PointsOfInterestService } from './points-of-interest.service';

type Captured = { data?: any };

function buildService() {
  const captured: { create: Captured; update: Captured } = { create: {}, update: {} };
  const prisma = {
    pointOfInterest: {
      findUnique: async () => ({ id: 'poi-1' }),
      findMany: async () => [],
      create: async ({ data }: { data: any }) => {
        captured.create.data = data;
        return { id: 'poi-new', ...data };
      },
      update: async ({ data }: { data: any }) => {
        captured.update.data = data;
        return { id: 'poi-1', ...data };
      },
    },
  };
  // The service only touches prisma.pointOfInterest via `(this.prisma as any)`.
  const service = new PointsOfInterestService(prisma as any);
  return { service, captured };
}

describe('PointsOfInterestService', () => {
  it('derives a code from the name when none is given, and sets booleans', async () => {
    const { service, captured } = buildService();
    await service.create({ name: 'Mount Nebo', viewpoint: true, religiousSite: true });
    assert.equal(captured.create.data.code, 'MOUNT_NEBO');
    assert.equal(captured.create.data.name, 'Mount Nebo');
    assert.equal(captured.create.data.viewpoint, true);
    assert.equal(captured.create.data.religiousSite, true);
  });

  it('creates only non-empty translation rows, lowercasing the locale', async () => {
    const { service, captured } = buildService();
    await service.create({
      name: 'Petra',
      translations: [
        { locale: 'EN', title: 'Petra', longDescription: 'The rose-red city.' },
        { locale: 'pt', shortDescription: 'A cidade rosa.' },
        { locale: 'es', title: '', shortDescription: '', longDescription: '' }, // fully empty -> dropped
        { locale: '   ', title: 'no locale' }, // blank locale -> dropped
      ],
    });
    const rows = captured.create.data.translations.create;
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r: any) => r.locale).sort(),
      ['en', 'pt'],
    );
    assert.equal(rows.find((r: any) => r.locale === 'en').title, 'Petra');
    assert.equal(rows.find((r: any) => r.locale === 'pt').shortDescription, 'A cidade rosa.');
  });

  it('replaces translations on update (deleteMany + create)', async () => {
    const { service, captured } = buildService();
    await service.update('poi-1', { name: 'Petra', translations: [{ locale: 'en', title: 'Petra' }] });
    assert.deepEqual(Object.keys(captured.update.data.translations).sort(), ['create', 'deleteMany']);
    assert.equal(captured.update.data.translations.create.length, 1);
  });

  it('leaves translations untouched on update when not provided', async () => {
    const { service, captured } = buildService();
    await service.update('poi-1', { name: 'Petra' });
    assert.equal(captured.update.data.translations, undefined);
  });

  it('normalizes blank optional FK links to null', async () => {
    const { service, captured } = buildService();
    await service.create({ name: 'Jerash', cityId: '', activityId: 'act-1' });
    assert.equal(captured.create.data.cityId, null);
    assert.equal(captured.create.data.activityId, 'act-1');
  });
});
