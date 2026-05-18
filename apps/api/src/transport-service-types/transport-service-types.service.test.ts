import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TransportServiceTypesService } from './transport-service-types.service';

function createService(initialRows: any[] = []) {
  const rows = [...initialRows];
  const prisma = {
    transportServiceType: {
      findMany: async () => rows.slice().sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
      findFirst: async ({ where }: any) => {
        const clauses = where?.OR || [];
        return rows.find((row) =>
          clauses.some((clause: any) => {
            const name = clause.name?.equals;
            const code = clause.code?.equals;
            return (
              (name && row.name.toLowerCase() === name.toLowerCase()) ||
              (code && row.code.toLowerCase() === code.toLowerCase())
            );
          }),
        ) || null;
      },
      create: async ({ data }: any) => {
        const row = { id: `service-${rows.length + 1}`, createdAt: new Date(rows.length + 1), ...data };
        rows.push(row);
        return row;
      },
    },
  };

  return { service: new TransportServiceTypesService(prisma as any), rows };
}

describe('TransportServiceTypesService pricing mode catalog', () => {
  it('ensures canonical transport pricing modes without mutating legacy aliases', async () => {
    const { service, rows } = createService([
      { id: 'existing-full', name: 'Full Day', code: 'FULL_DAY', classification: 'FULL_DAY', createdAt: new Date(1) },
    ]);

    await service.findAll();
    await service.findAll();

    assert.equal(rows.filter((row) => row.name === 'Full Day').length, 1);
    assert.equal(rows.filter((row) => row.name === 'Daily Full Day').length, 1);
    assert.equal(rows.find((row) => row.name === 'Daily Full Day')?.classification, 'FULL_DAY');
    assert.equal(rows.find((row) => row.name === 'Petra Overnight')?.classification, 'ADD_ON');
    assert.equal(rows.find((row) => row.name === 'Wadi Rum Overnight')?.classification, 'ADD_ON');
    assert.equal(rows.find((row) => row.name === 'Aqaba Overnight')?.classification, 'ADD_ON');
  });
});
