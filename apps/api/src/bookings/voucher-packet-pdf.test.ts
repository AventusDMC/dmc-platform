import test = require('node:test');
import assert = require('node:assert/strict');
import { renderVoucherPacketPdf, buildVoucherPacketLines } from './voucher-packet-pdf';

function samplePacket() {
  return {
    id: 'packet-1',
    status: 'GENERATED',
    generatedAt: new Date('2026-07-06T00:00:00.000Z'),
    snapshotJson: {
      supplierId: 'sup-1',
      supplierName: 'TEST Hotel Supplier A',
      groupingType: 'HOTEL',
      groupingKey: 'HOTEL:sup-1:2026-07-22',
      bookingRef: 'BK-2026-0002',
      dateRange: { start: '2026-07-22', end: '2026-07-22' },
      dayNumbers: [1],
      serviceCount: 1,
      services: [{ id: 'h1', serviceType: 'HOTEL', serviceDate: '2026-07-22', dayNumber: 1, label: 'QA Hotel Service' }],
    },
  };
}

test('renders a valid, non-trivial PDF buffer', async () => {
  const buf = await renderVoucherPacketPdf(samplePacket());
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(buf.length > 500, 'PDF has content');
});

test('content lines contain supplier, booking ref, grouping type, and service label', () => {
  const text = buildVoucherPacketLines(samplePacket()).map((l) => l.text).join('\n');
  assert.match(text, /Supplier Voucher Packet/);
  assert.match(text, /TEST Hotel Supplier A/);
  assert.match(text, /Booking reference: BK-2026-0002/);
  assert.match(text, /Grouping: HOTEL \(HOTEL:sup-1:2026-07-22\)/);
  assert.match(text, /Services: 1/);
  assert.match(text, /Dates: 2026-07-22/);
  assert.match(text, /QA Hotel Service/);
});

test('content is PII-free and finance-free', () => {
  const text = buildVoucherPacketLines(samplePacket()).map((l) => l.text).join('\n');
  for (const forbidden of ['unitCost', 'unitSell', 'totalCost', 'totalSell', 'margin', 'payable', 'passport', 'dateOfBirth', 'emergencyContact']) {
    assert.ok(!text.includes(forbidden), `content leaked ${forbidden}`);
  }
});

test('renders gracefully with no services / missing snapshot', async () => {
  const a = await renderVoucherPacketPdf({ snapshotJson: { supplierName: 'X', services: [] } });
  assert.equal(a.subarray(0, 5).toString('latin1'), '%PDF-');
  const b = await renderVoucherPacketPdf({});
  assert.equal(b.subarray(0, 5).toString('latin1'), '%PDF-');
});
