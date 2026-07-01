import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDocumentsVM } from './ops-documents-vm';
import { DOCS_REDACTED_RAW, EMPTY_DOCS_DETAIL, SAMPLE_DOCS_DETAIL } from './ops-documents.fixtures';

describe('ops-documents-vm — vouchers from services[].vouchers', () => {
  const vm = buildDocumentsVM(SAMPLE_DOCS_DETAIL);
  const vouchers = vm.groups.find((g) => g.title === 'Vouchers')!.documents;
  const byId = Object.fromEntries(vouchers.map((d) => [d.id, d]));

  it('reads every voucher across services', () => {
    assert.deepEqual(vouchers.map((d) => d.id), ['v1', 'v2', 'v3']);
    assert.equal(vm.totalCount, 3);
  });

  it('maps service-linked voucher rows + status badges', () => {
    assert.equal(byId['v1'].name, 'Transport voucher');
    assert.equal(byId['v1'].status, 'Issued');
    assert.equal(byId['v1'].statusVariant, 'success');
    assert.equal(byId['v1'].sourceService, 'Petra transfer');
    assert.equal(byId['v1'].supplier, 'Alpha Transport');
    assert.equal(byId['v1'].date, '2026-06-20');
    assert.equal(byId['v1'].details, 'Details recorded'); // note summarized, not raw

    assert.equal(byId['v2'].status, 'Draft');
    assert.equal(byId['v2'].statusVariant, 'warning');
    assert.equal(byId['v3'].status, 'Sent');
    assert.equal(byId['v3'].statusVariant, 'success');
  });

  it('handles missing supplier + source service safely', () => {
    assert.equal(byId['v3'].supplier, null);
    assert.equal(byId['v3'].sourceService, null);
  });

  it('does not leak snapshotJson, sensitive notes, or service financials', () => {
    const serialized = JSON.stringify(vm);
    for (const raw of DOCS_REDACTED_RAW) {
      assert.ok(!serialized.includes(raw), `documents VM leaked "${raw}"`);
    }
  });
});

describe('ops-documents-vm — a GENERATED voucher (Phase 2C) appears as a document', () => {
  // After a V2 voucher generation, the new record arrives via services[].vouchers
  // with status GENERATED and must render as a Vouchers-group row.
  const vm = buildDocumentsVM({
    services: [
      {
        description: 'Jerash entrance',
        vouchers: [
          {
            id: 'gen-1',
            type: 'ACTIVITY',
            status: 'GENERATED',
            issuedAt: null,
            notes: null,
            supplier: { name: 'Almushtari Logistics' },
            bookingService: { description: 'Jerash entrance', serviceType: 'ACTIVITY' },
          },
        ],
      },
    ],
    passengers: [],
  });
  const vouchers = vm.groups.find((g) => g.title === 'Vouchers')!.documents;

  it('the generated voucher is listed with a Generated badge', () => {
    assert.equal(vouchers.length, 1);
    assert.equal(vouchers[0].id, 'gen-1');
    assert.equal(vouchers[0].status, 'Generated');
    assert.equal(vouchers[0].statusVariant, 'info');
    assert.equal(vouchers[0].sourceService, 'Jerash entrance');
  });
});

describe('ops-documents-vm — manifest + groups', () => {
  it('derives passenger-manifest readiness (1 of 2 with passport → Pending)', () => {
    const vm = buildDocumentsVM(SAMPLE_DOCS_DETAIL);
    const manifest = vm.groups.find((g) => g.title === 'Passenger manifest')!.documents[0];
    assert.equal(manifest.name, 'Passenger manifest');
    assert.equal(manifest.status, 'Pending');
    assert.equal(manifest.sourceService, '1/2 with passport');
  });

  it('includes a supplier-confirmation pointer (In Classic, navigation only)', () => {
    const vm = buildDocumentsVM(SAMPLE_DOCS_DETAIL);
    const grp = vm.groups.find((g) => g.title === 'Supplier confirmation preview')!;
    assert.equal(grp.documents[0].status, 'In Classic');
    assert.equal(grp.documents[0].statusVariant, 'neutral');
  });

  it('emits groups in fixed order', () => {
    const vm = buildDocumentsVM(SAMPLE_DOCS_DETAIL);
    assert.deepEqual(vm.groups.map((g) => g.title), ['Vouchers', 'Passenger manifest', 'Supplier confirmation preview']);
  });
});

describe('ops-documents-vm — empty', () => {
  const vm = buildDocumentsVM(EMPTY_DOCS_DETAIL);

  it('no vouchers → empty Vouchers group, totalCount 0', () => {
    assert.equal(vm.groups.find((g) => g.title === 'Vouchers')!.documents.length, 0);
    assert.equal(vm.totalCount, 0);
  });

  it('no passengers → manifest Not generated', () => {
    const manifest = vm.groups.find((g) => g.title === 'Passenger manifest')!.documents[0];
    assert.equal(manifest.status, 'Not generated');
    assert.equal(manifest.statusVariant, 'neutral');
  });

  it('null detail does not throw', () => {
    assert.equal(buildDocumentsVM(null).totalCount, 0);
  });
});
