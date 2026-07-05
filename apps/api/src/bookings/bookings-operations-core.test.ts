import test = require('node:test');
import assert = require('node:assert/strict');
import fs = require('node:fs');
import path = require('node:path');
import * as XLSX from 'xlsx';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { mapQuoteToProposalV3 } from '../quotes/proposal-v3.mapper';
const { BookingsService } = require('./bookings.service');
const { BookingsController } = require('./bookings.controller');

function createService(prisma: any) {
  return new BookingsService(prisma, { log: async () => null } as any, { log: async () => null } as any, { checkBookingHotelAllotmentAvailability: async () => ({ blockers: [], warnings: [] }) } as any);
}

function capturePdfText(service: any) {
  const lines: string[] = [];
  const doc: any = {
    y: 50,
    page: {
      width: 595,
      height: 842,
      margins: { left: 50, right: 50, top: 50, bottom: 50 },
    },
    font: () => doc,
    fontSize: () => doc,
    fillColor: () => doc,
    strokeColor: () => doc,
    lineWidth: () => doc,
    image: () => doc,
    moveTo: () => doc,
    lineTo: () => doc,
    stroke: () => doc,
    rect: () => doc,
    roundedRect: () => doc,
    fill: () => doc,
    fillAndStroke: () => doc,
    addPage: () => {
      doc.y = 50;
      return doc;
    },
    moveDown: (amount = 1) => {
      doc.y += 12 * amount;
      return doc;
    },
    text: (value: string) => {
      lines.push(String(value));
      doc.y += 12;
      return doc;
    },
  };

  service.createPdf = (write: (doc: any) => void) => {
    write(doc);
    return Promise.resolve(Buffer.from(lines.join('\n')));
  };

  return lines;
}

test('passenger manifest export route uses extensionless URL and Excel response headers', async () => {
  const routePath = (Reflect as any).getMetadata(PATH_METADATA, BookingsController.prototype.downloadPassengerManifestExcel);
  assert.equal(routePath, ':id/passengers/export');

  const controller = new BookingsController(
    {
      exportPassengerManifestExcel: async () => ({
        fileName: 'BK-1-passenger-manifest.xlsx',
        buffer: Buffer.from('excel'),
      }),
    },
    {},
    {},
  );
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };

  await controller.downloadPassengerManifestExcel(
    '11111111-1111-4111-8111-111111111111',
    { companyId: 'company-1', role: 'admin' },
    response,
  );

  assert.equal(headers['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(headers['Content-Disposition'], 'attachment; filename="BK-1-passenger-manifest.xlsx"');
});

test('passenger manifest export is allowed for full-PII roles (admin, operations, super_admin)', async () => {
  for (const role of ['admin', 'operations', 'super_admin']) {
    const calls: any[] = [];
    const controller = new BookingsController(
      {
        exportPassengerManifestExcel: async (id: string, actor: any) => {
          calls.push({ id, actor });
          return { fileName: 'BK-1-passenger-manifest.xlsx', buffer: Buffer.from('excel') };
        },
      },
      {},
      {},
    );
    const headers: Record<string, string> = {};
    const response = { setHeader: (n: string, v: string) => { headers[n] = v; } };

    const stream = await controller.downloadPassengerManifestExcel(
      '11111111-1111-4111-8111-111111111111',
      { companyId: 'company-1', role },
      response,
    );

    assert.equal(calls.length, 1, `service should be called for ${role}`);
    assert.equal(headers['Content-Type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.ok(stream, `stream returned for ${role}`);
  }
});

test('passenger manifest export is blocked (403) for restricted roles incl. agent_admin', async () => {
  for (const role of ['agent_admin', 'agent', 'viewer', 'finance', undefined]) {
    const calls: any[] = [];
    const controller = new BookingsController(
      {
        exportPassengerManifestExcel: async (id: string, actor: any) => {
          calls.push({ id, actor });
          return { fileName: 'x.xlsx', buffer: Buffer.from('excel') };
        },
      },
      {},
      {},
    );
    const response = { setHeader: () => {} };

    await assert.rejects(
      () =>
        controller.downloadPassengerManifestExcel(
          '11111111-1111-4111-8111-111111111111',
          { companyId: 'company-1', role },
          response,
        ),
      /permission to export passenger manifest/i,
      `role=${role} should be blocked`,
    );
    assert.equal(calls.length, 0, `service must NOT be called for role=${role}`);
  }
});

test('admin booking voucher PDF route returns attachment PDF without false permission block', async () => {
  const calls: any[] = [];
  const controller = new BookingsController(
    {
      findOne: async (id: string, actor: any) => {
        calls.push({ method: 'findOne', id, actor });
        return { id, bookingRef: 'BK-1' };
      },
      generateVoucherPdf: async (id: string, actor: any, booking: any) => {
        calls.push({ method: 'generateVoucherPdf', id, actor, booking });
        return Buffer.from('%PDF voucher');
      },
    },
    {},
    {},
  );
  const actor = { id: 'user-1', role: 'admin', companyId: 'dmc-company-1' };
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };

  const stream = await controller.downloadVoucherPdf('11111111-1111-4111-8111-111111111111', actor, response);

  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.equal(headers['Content-Disposition'], 'attachment; filename="bk-1-voucher.pdf"');
  assert.equal(calls[0].method, 'findOne');
  assert.equal(calls[0].actor, actor);
  assert.equal(calls[1].method, 'generateVoucherPdf');
  assert.equal(calls[1].actor, actor);
  assert.ok(stream);
});

test('financial document route exposes booking PDF document types', async () => {
  const routePath = (Reflect as any).getMetadata(PATH_METADATA, BookingsController.prototype.downloadFinancialDocumentPdf);
  assert.equal(routePath, ':id/financial-documents/:documentType/pdf');

  const calls: any[] = [];
  const controller = new BookingsController(
    {
      findOne: async (id: string) => ({ id, bookingRef: 'BK-1' }),
      generateFinancialDocumentPdf: async (id: string, documentType: string, mode: string) => {
        calls.push({ id, documentType, mode });
        return Buffer.from('%PDF financial-document');
      },
    },
    {},
  );
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };

  const stream = await controller.downloadFinancialDocumentPdf('11111111-1111-4111-8111-111111111111', 'supplier-payable-summary', 'PACKAGE', response);

  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.equal(headers['Content-Disposition'], 'attachment; filename="bk-1-supplier-payable-summary.pdf"');
  assert.deepEqual(calls[0], { id: '11111111-1111-4111-8111-111111111111', documentType: 'supplier-payable-summary', mode: 'PACKAGE' });
  assert.ok(stream);
});

test('financial document route rejects booking code before PDF generation', async () => {
  const controller = new BookingsController(
    {
      findOne: async () => {
        throw new Error('findOne should not be called for invalid booking ids');
      },
      generateFinancialDocumentPdf: async () => Buffer.from('%PDF financial-document'),
    },
    {},
    {},
  );
  const response = {
    setHeader: () => null,
  };

  await assert.rejects(
    () => controller.downloadFinancialDocumentPdf('JOR-HL-2026-001', 'client-invoice', 'PACKAGE', response),
    /Financial document download requires a booking UUID/,
  );
});

test('invoice generation route rejects booking code before invoice creation', async () => {
  const controller = new BookingsController(
    {},
    {},
    {
      generateForBooking: async () => {
        throw new Error('generateForBooking should not be called for invalid booking ids');
      },
    },
  );

  assert.throws(
    () => controller.generateInvoice('JOR-HL-2026-001', { id: 'user-1', companyId: 'company-1', auditLabel: 'Finance User' } as any),
    /Invoice generation requires a booking UUID/,
  );
});

test('financial document PDF renders totals deposits balance payment methods and supplier payables', async () => {
  const service = createService({});
  const lines = capturePdfText(service as any);
  (service as any).fetchImageBuffer = async () => null;
  (service as any).findOne = async () => ({
    id: '11111111-1111-4111-8111-111111111111',
    bookingRef: 'JOR-HL-2026-001',
    bookingType: 'GROUP',
    nightCount: 3,
    snapshotJson: { title: 'Jordan Highlights', nightCount: 3 },
    clientSnapshotJson: { name: 'Client Co' },
    brandSnapshotJson: { name: 'DMC Brand' },
    contactSnapshotJson: { firstName: 'Lina', lastName: 'Haddad' },
    quote: { title: 'Jordan Highlights', company: { name: 'Client Co' }, brandCompany: null },
    finance: {
      realizedTotalSell: 2400,
      quotedTotalSell: 2400,
      realizedTotalCost: 1400,
      quotedTotalCost: 1400,
    },
    payments: [
      {
        id: 'payment-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        type: 'CLIENT',
        amount: 600,
        currency: 'USD',
        status: 'PAID',
        method: 'cliq',
        reference: 'CLIQ-001',
        dueDate: null,
        paidAt: new Date('2026-05-17T09:00:00.000Z'),
        notes: null,
        createdAt: new Date('2026-05-17T09:00:00.000Z'),
        updatedAt: new Date('2026-05-17T09:00:00.000Z'),
      },
      {
        id: 'payment-2',
        bookingId: '11111111-1111-4111-8111-111111111111',
        type: 'SUPPLIER',
        amount: 300,
        currency: 'USD',
        status: 'PENDING',
        method: 'bank_transfer',
        reference: 'service:hotel-1',
        dueDate: new Date('2026-05-24T09:00:00.000Z'),
        paidAt: null,
        notes: 'Supplier payment notes',
        createdAt: new Date('2026-05-17T09:00:00.000Z'),
        updatedAt: new Date('2026-05-17T09:00:00.000Z'),
      },
    ],
    services: [
      {
        id: 'hotel-1',
        description: 'Hotel block',
        serviceType: 'HOTEL',
        supplierName: 'Hotel Supplier',
        supplierReference: 'SUP-001',
        serviceDate: new Date('2026-05-29T09:00:00.000Z'),
        totalSell: 1200,
        totalCost: 700,
        status: 'confirmed',
      },
    ],
  });

  await service.generateFinancialDocumentPdf('11111111-1111-4111-8111-111111111111', 'supplier-payable-summary', 'ITEMIZED');
  const text = lines.join('\n');

  assert.match(text, /Supplier Payable Summary/);
  assert.match(text, /Document number/);
  assert.match(text, /Booking reference/);
  assert.match(text, /Supplier Payables/);
  assert.match(text, /Supplier payment notes/);
  assert.match(text, /Payment methods: bank transfer, CliQ, MB WAY, cash, credit card, custom\/manual/);

  lines.length = 0;
  await service.generateFinancialDocumentPdf('11111111-1111-4111-8111-111111111111', 'deposit-invoice', 'PACKAGE');
  const depositText = lines.join('\n');
  assert.match(depositText, /Deposit Invoice/);
  assert.match(depositText, /Deposits received/);
  assert.match(depositText, /Remaining balance/);
});

test('booking voucher PDF uses professional placeholders and no internal pricing leakage', async () => {
  const service = createService({});
  capturePdfText(service as any);

  const buffer = await service.generateVoucherPdf('11111111-1111-4111-8111-111111111111', { companyId: 'dmc-company-1' }, {
    id: '11111111-1111-4111-8111-111111111111',
    bookingRef: 'BK-1',
    bookingType: 'FIT',
    adults: 2,
    children: 0,
    roomCount: 1,
    nightCount: 2,
    snapshotJson: {
      title: 'Jordan Highlights',
      roomCount: 1,
      nightCount: 2,
      itineraries: [{ id: 'day-1', dayNumber: 1, title: 'Arrival', description: 'Airport arrival' }],
      quoteItems: [],
    },
    contactSnapshotJson: { firstName: 'Lina', lastName: 'Haddad' },
    clientSnapshotJson: { name: 'Client Co' },
    passengers: [],
    roomingEntries: [],
    services: [
      {
        id: 'service-1',
        description: 'Airport transfer',
        supplierName: null,
        confirmationStatus: 'pending',
        confirmationNumber: null,
        totalCost: 900,
        totalSell: 1200,
      },
    ],
  });
  const text = buffer.toString('utf8');

  assert.match(text, /Booking Voucher/i);
  assert.match(text, /Pending confirmation/);
  assert.doesNotMatch(text, /To be advised|totalCost|totalSell|gross profit|margin/i);
});

test('bookings controller exposes explicit cancel route', () => {
  const routePath = (Reflect as any).getMetadata(PATH_METADATA, BookingsController.prototype.cancelBooking);
  assert.equal(routePath, ':id/cancel');
  const amendPath = (Reflect as any).getMetadata(PATH_METADATA, BookingsController.prototype.amendBooking);
  assert.equal(amendPath, ':id/amend');
});

test('supplier confirmation tracking preserves references and confirmed timestamps', async () => {
  const existingConfirmedAt = new Date('2026-05-10T09:00:00.000Z');
  const updates: any[] = [];
  const audits: any[] = [];
  const service = createService({
    booking: {
      findFirst: async () => null,
    },
    bookingService: {
      findFirst: async () => ({
        id: 'service-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        supplierConfirmationStatus: 'SENT',
        confirmationSentAt: new Date('2026-05-09T09:00:00.000Z'),
        supplierConfirmedAt: existingConfirmedAt,
        supplierReference: 'SUP-001',
        confirmationNumber: 'SUP-001',
        supplierRemarks: 'Original remarks',
        confirmationDeadline: new Date('2026-05-15T09:00:00.000Z'),
        lastSupplierContactAt: new Date('2026-05-09T09:30:00.000Z'),
      }),
      update: async ({ data }: any) => {
        updates.push(data);
        return { id: 'service-1', ...data };
      },
    },
    bookingAuditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
        return { id: 'audit-1', ...data };
      },
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          update: async (args: any) => (service as any).prisma.bookingService.update(args),
        },
        bookingAuditLog: {
          create: async (args: any) => (service as any).prisma.bookingAuditLog.create(args),
        },
      }),
  });

  const updated = await service.updateSupplierConfirmation('service-1', {
    supplierConfirmationStatus: 'CONFIRMED',
    supplierReference: '',
    supplierRemarks: 'Confirmed manually',
    actor: { label: 'Ops User' },
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(updated.supplierConfirmationStatus, 'CONFIRMED');
  assert.equal(updates[0].supplierReference, 'SUP-001');
  assert.equal(updates[0].confirmationNumber, 'SUP-001');
  assert.equal(updates[0].supplierConfirmedAt, existingConfirmedAt);
  assert.equal(updates[0].confirmationSentAt.toISOString(), '2026-05-09T09:00:00.000Z');
  assert.equal(updates[0].supplierRemarks, 'Confirmed manually');
  assert.equal(audits[0].action, 'service_supplier_confirmation_updated');
});

test('operations dashboard readiness counts supplier confirmation states', async () => {
  const dashboardDate = new Date('2026-05-12T00:00:00.000Z');
  const services = [
    {
      id: 'service-pending',
      bookingId: '11111111-1111-4111-8111-111111111111',
      description: 'Hotel',
      serviceType: 'HOTEL',
      operationType: 'HOTEL',
      operationStatus: 'CONFIRMED',
      serviceDate: dashboardDate,
      pickupTime: null,
      assignedTo: null,
      supplierId: 'supplier-1',
      supplierName: 'Hotel Supplier',
      vehicleId: null,
      status: 'ready',
      confirmationStatus: 'requested',
      supplierConfirmationStatus: 'SENT',
      confirmationDeadline: new Date('2026-05-11T00:00:00.000Z'),
      vouchers: [],
      booking: { id: '11111111-1111-4111-8111-111111111111', bookingRef: 'BK-1', status: 'in_progress', startDate: dashboardDate, endDate: dashboardDate, snapshotJson: {} },
    },
    {
      id: 'service-rejected',
      bookingId: '11111111-1111-4111-8111-111111111111',
      description: 'Activity',
      serviceType: 'ACTIVITY',
      operationType: 'ACTIVITY',
      operationStatus: 'CONFIRMED',
      serviceDate: dashboardDate,
      pickupTime: null,
      assignedTo: null,
      supplierId: 'supplier-2',
      supplierName: 'Activity Supplier',
      vehicleId: null,
      status: 'ready',
      confirmationStatus: 'requested',
      supplierConfirmationStatus: 'REJECTED',
      confirmationDeadline: null,
      vouchers: [],
      booking: { id: '11111111-1111-4111-8111-111111111111', bookingRef: 'BK-1', status: 'in_progress', startDate: dashboardDate, endDate: dashboardDate, snapshotJson: {} },
    },
    {
      id: 'service-confirmed',
      bookingId: '11111111-1111-4111-8111-111111111111',
      description: 'Transfer',
      serviceType: 'TRANSPORT',
      operationType: 'TRANSPORT',
      operationStatus: 'CONFIRMED',
      serviceDate: dashboardDate,
      pickupTime: '09:00',
      assignedTo: 'Driver',
      supplierId: 'supplier-3',
      supplierName: 'Transport Supplier',
      vehicleId: 'vehicle-1',
      status: 'confirmed',
      confirmationStatus: 'confirmed',
      supplierConfirmationStatus: 'CONFIRMED',
      confirmationDeadline: null,
      vouchers: [{ id: 'voucher-1', status: 'ISSUED', type: 'TRANSPORT' }],
      booking: { id: '11111111-1111-4111-8111-111111111111', bookingRef: 'BK-1', status: 'in_progress', startDate: dashboardDate, endDate: dashboardDate, snapshotJson: {} },
    },
  ];
  const bookings = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      bookingRef: 'BK-1',
      status: 'in_progress',
      startDate: dashboardDate,
      endDate: dashboardDate,
      pax: 1,
      adults: 1,
      children: 0,
      roomCount: 1,
      snapshotJson: {},
      passengers: [{ id: 'passenger-1', passportNumber: 'P1', passportExpiryDate: new Date('2027-01-01T00:00:00.000Z') }],
      roomingEntries: [{ id: 'room-1', occupancy: 'single', assignments: [{ bookingPassengerId: 'passenger-1' }] }],
    },
  ];
  const service = createService({
    booking: {
      findMany: async () => bookings,
    },
    bookingService: {
      findMany: async () => services,
    },
  });

  const dashboard = await service.getOperationsDashboard({ actor: { companyId: 'company-1' }, date: '2026-05-12' });

  assert.equal(dashboard.operationalReadiness.pendingSupplierConfirmations, 1);
  assert.equal(dashboard.operationalReadiness.rejectedSupplierConfirmations, 1);
  assert.equal(dashboard.operationalReadiness.overdueSupplierConfirmations, 1);
  assert.equal(dashboard.operationalReadiness.supplierUnconfirmedServices, 2);
});

test('supplier confirmation action persists confirmed lifecycle fields', async () => {
  let updatedData: any;
  const audits: any[] = [];
  const service = createService({
    bookingService: {
      findFirst: async () => ({
        id: 'service-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        description: 'Hotel stay',
        serviceType: 'HOTEL',
        operationType: 'HOTEL',
        serviceDate: new Date('2026-06-01T00:00:00.000Z'),
        pickupTime: null,
        pickupLocation: null,
        meetingPoint: null,
        participantCount: 2,
        supplierId: 'supplier-1',
        supplierName: 'Hotel Supplier',
        supplierConfirmationStatus: 'SENT',
        confirmationStatus: 'requested',
        confirmationSentAt: new Date('2026-05-20T00:00:00.000Z'),
        supplierConfirmedAt: null,
        supplierReference: null,
        confirmationNumber: null,
        supplierRemarks: null,
        confirmationDeadline: new Date('2026-05-25T00:00:00.000Z'),
        lastSupplierContactAt: new Date('2026-05-20T00:00:00.000Z'),
        reconfirmationRequired: false,
        reconfirmationDueAt: null,
        status: 'in_progress',
        totalCost: 100,
        totalSell: 130,
        confirmationRequestedAt: new Date('2026-05-20T00:00:00.000Z'),
        confirmationConfirmedAt: null,
        supplier: { id: 'supplier-1', name: 'Hotel Supplier', email: 'hotel@example.com' },
        booking: { id: '11111111-1111-4111-8111-111111111111', bookingRef: 'BK-1', startDate: null, endDate: null, snapshotJson: {}, contactSnapshotJson: {} },
      }),
      update: async ({ data }: any) => {
        updatedData = data;
        return { id: 'service-1', ...data };
      },
    },
    bookingAuditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
        return { id: 'audit-1', ...data };
      },
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          update: async (args: any) => (service as any).prisma.bookingService.update(args),
        },
        bookingAuditLog: {
          create: async (args: any) => (service as any).prisma.bookingAuditLog.create(args),
        },
      }),
  });

  const updated = await service.performSupplierConfirmationAction('service-1', {
    action: 'mark_confirmed',
    supplierReference: 'CN-100',
    supplierRemarks: 'Confirmed by supplier',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(updated.supplierConfirmationStatus, 'CONFIRMED');
  assert.equal(updated.confirmationStatus, 'confirmed');
  assert.equal(updated.status, 'confirmed');
  assert.equal(updatedData.supplierReference, 'CN-100');
  assert.equal(updatedData.confirmationNumber, 'CN-100');
  assert.ok(updatedData.supplierConfirmedAt);
  assert.ok(updatedData.confirmationConfirmedAt);
  assert.equal(audits[0].action, 'service_supplier_confirmation_mark_confirmed');
});

test('supplier confirmation queues group operational services by service type', async () => {
  const nowPastDue = new Date('2026-05-10T00:00:00.000Z');
  const service = createService({
    bookingService: {
      findMany: async () => [
        {
          id: 'hotel-1',
          bookingId: '11111111-1111-4111-8111-111111111111',
          description: 'Hotel',
          serviceType: 'HOTEL',
          operationType: 'HOTEL',
          serviceDate: nowPastDue,
          supplierId: 'supplier-hotel',
          supplierName: 'Hotel Supplier',
          confirmationStatus: 'requested',
          supplierConfirmationStatus: 'SENT',
          confirmationSentAt: nowPastDue,
          supplierConfirmedAt: null,
          supplierRemarks: null,
          confirmationDeadline: null,
          lastSupplierContactAt: nowPastDue,
          reconfirmationRequired: true,
          reconfirmationDueAt: nowPastDue,
          booking: { id: '11111111-1111-4111-8111-111111111111', bookingRef: 'BK-1', status: 'in_progress', startDate: null, endDate: null },
        },
        {
          id: 'transport-1',
          bookingId: '11111111-1111-4111-8111-111111111111',
          description: 'Transfer',
          serviceType: 'TRANSPORT',
          operationType: 'TRANSPORT',
          serviceDate: nowPastDue,
          supplierId: 'supplier-transport',
          supplierName: 'Transport Supplier',
          confirmationStatus: 'confirmed',
          supplierConfirmationStatus: 'CONFIRMED',
          confirmationSentAt: nowPastDue,
          supplierConfirmedAt: nowPastDue,
          supplierRemarks: null,
          confirmationDeadline: null,
          lastSupplierContactAt: nowPastDue,
          reconfirmationRequired: false,
          reconfirmationDueAt: null,
          booking: { id: '11111111-1111-4111-8111-111111111111', bookingRef: 'BK-1', status: 'in_progress', startDate: null, endDate: null },
        },
        {
          id: 'activity-1',
          bookingId: '11111111-1111-4111-8111-111111111111',
          description: 'Excursion',
          serviceType: 'ACTIVITY',
          operationType: 'ACTIVITY',
          serviceDate: nowPastDue,
          supplierId: 'supplier-activity',
          supplierName: 'Activity Supplier',
          confirmationStatus: 'requested',
          supplierConfirmationStatus: 'REJECTED',
          confirmationSentAt: nowPastDue,
          supplierConfirmedAt: null,
          supplierRemarks: 'No availability',
          confirmationDeadline: null,
          lastSupplierContactAt: nowPastDue,
          reconfirmationRequired: false,
          reconfirmationDueAt: null,
          booking: { id: '11111111-1111-4111-8111-111111111111', bookingRef: 'BK-1', status: 'in_progress', startDate: null, endDate: null },
        },
      ],
    },
  });

  const queues = await service.getSupplierConfirmationQueues({ actor: { companyId: 'company-1' } });

  assert.equal(queues.hotels.count, 1);
  assert.equal(queues.hotels.unconfirmed, 1);
  assert.equal(queues.hotels.overdueReconfirmations, 1);
  assert.equal(queues.transport.count, 1);
  assert.equal(queues.transport.unconfirmed, 0);
  assert.equal(queues.activitiesExcursions.count, 1);
  assert.equal(queues.activitiesExcursions.unconfirmed, 1);
});

test('supplier reconfirmation action marks service requested with due date', async () => {
  let updatedData: any;
  const service = createService({
    bookingService: {
      findFirst: async () => ({
        id: 'service-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        description: 'Excursion',
        serviceType: 'ACTIVITY',
        operationType: 'ACTIVITY',
        serviceDate: new Date('2026-06-01T00:00:00.000Z'),
        pickupTime: '09:00',
        pickupLocation: 'Hotel lobby',
        meetingPoint: null,
        participantCount: 4,
        supplierId: 'supplier-1',
        supplierName: 'Activity Supplier',
        supplierConfirmationStatus: 'CONFIRMED',
        confirmationStatus: 'confirmed',
        confirmationSentAt: new Date('2026-05-20T00:00:00.000Z'),
        supplierConfirmedAt: new Date('2026-05-21T00:00:00.000Z'),
        supplierReference: 'CN-1',
        confirmationNumber: 'CN-1',
        supplierRemarks: null,
        confirmationDeadline: null,
        lastSupplierContactAt: new Date('2026-05-21T00:00:00.000Z'),
        reconfirmationRequired: false,
        reconfirmationDueAt: null,
        status: 'confirmed',
        totalCost: 100,
        totalSell: 130,
        confirmationRequestedAt: new Date('2026-05-20T00:00:00.000Z'),
        confirmationConfirmedAt: new Date('2026-05-21T00:00:00.000Z'),
        supplier: { id: 'supplier-1', name: 'Activity Supplier', email: 'activity@example.com' },
        booking: { id: '11111111-1111-4111-8111-111111111111', bookingRef: 'BK-1', startDate: null, endDate: null, snapshotJson: {}, contactSnapshotJson: {} },
      }),
      update: async ({ data }: any) => {
        updatedData = data;
        return { id: 'service-1', ...data };
      },
    },
    bookingAuditLog: {
      create: async () => ({}),
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          update: async (args: any) => (service as any).prisma.bookingService.update(args),
        },
        bookingAuditLog: {
          create: async (args: any) => (service as any).prisma.bookingAuditLog.create(args),
        },
      }),
  });

  const updated = await service.performSupplierConfirmationAction('service-1', {
    action: 'reconfirm',
    reconfirmationDueAt: '2026-05-30T00:00:00.000Z',
    supplierRemarks: 'Reconfirm before arrival',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(updated.supplierConfirmationStatus, 'SENT');
  assert.equal(updated.confirmationStatus, 'requested');
  assert.equal(updated.reconfirmationRequired, true);
  assert.equal(updatedData.reconfirmationDueAt.toISOString(), '2026-05-30T00:00:00.000Z');
  assert.equal(updated.status, 'in_progress');
});

test('hotel reservation operations persist room block release alternatives and reconfirmation metadata', async () => {
  let updatedData: any;
  const service = createService({
    booking: {
      findFirst: async () => null,
    },
    bookingService: {
      findFirst: async () => ({
        id: 'hotel-service-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        serviceType: 'SERVICE',
        operationType: 'HOTEL',
        serviceDate: new Date('2026-06-01T00:00:00.000Z'),
        startTime: null,
        pickupTime: null,
        pickupLocation: null,
        meetingPoint: null,
        participantCount: 2,
        adultCount: 2,
        childCount: 0,
        supplierReference: null,
        sourceMetadata: {
          hotelReservation: {
            status: 'Requested',
            alternativeHotels: [{ name: 'Backup Hotel', status: 'waitlist' }],
          },
        },
        reconfirmationRequired: false,
        reconfirmationDueAt: null,
        status: 'pending',
        totalCost: 100,
        totalSell: 120,
        supplierId: 'supplier-1',
        supplierName: 'Primary Hotel',
        confirmationStatus: 'pending',
      }),
      update: async ({ data }: any) => {
        updatedData = data;
        return { id: 'hotel-service-1', ...data };
      },
    },
    bookingAuditLog: {
      create: async () => ({}),
    },
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async () => null,
        },
        bookingService: {
          update: async (args: any) => (service as any).prisma.bookingService.update(args),
        },
        bookingAuditLog: {
          create: async (args: any) => (service as any).prisma.bookingAuditLog.create(args),
        },
      }),
  });

  await service.updateOperationalDetails('hotel-service-1', {
    hotelReservationStatus: 'Tentative',
    blockedRoomCount: 2,
    roomTypes: ['DBL', 'TWN'],
    releaseDate: '2026-05-25T12:00:00.000Z',
    hotelReconfirmationDueAt: '2026-05-28T12:00:00.000Z',
    hotelReservationNotes: 'Hold under group name.',
    primaryHotelName: 'Primary Hotel',
    alternativeHotels: ['Backup Hotel', 'Second Backup'],
    activateAlternativeHotel: 'Backup Hotel',
    roomingSent: true,
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(updatedData.sourceMetadata.hotelReservation.status, 'Tentative');
  assert.equal(updatedData.sourceMetadata.hotelReservation.blockedRoomCount, 2);
  assert.deepEqual(updatedData.sourceMetadata.hotelReservation.roomTypes, ['DBL', 'TWN']);
  assert.equal(updatedData.sourceMetadata.hotelReservation.releaseDate, '2026-05-25T12:00:00.000Z');
  assert.equal(updatedData.confirmationDeadline.toISOString(), '2026-05-25T12:00:00.000Z');
  assert.equal(updatedData.reconfirmationDueAt.toISOString(), '2026-05-28T12:00:00.000Z');
  assert.equal(updatedData.reconfirmationRequired, true);
  assert.equal(updatedData.sourceMetadata.hotelReservation.alternativeHotels[0].status, 'active');
  assert.ok(updatedData.sourceMetadata.hotelReservation.roomingSentAt);
});

test('operations dashboard refinement builds department queues KPIs alerts and heatmap', async () => {
  const dashboardDate = new Date('2026-05-12T00:00:00.000Z');
  const services = [
    {
      id: 'hotel-1',
      bookingId: '11111111-1111-4111-8111-111111111111',
      description: 'Hotel stay',
      serviceType: 'HOTEL',
      operationType: 'HOTEL',
      operationStatus: 'REQUESTED',
      serviceDate: dashboardDate,
      startTime: null,
      pickupTime: null,
      assignedTo: null,
      supplierId: 'supplier-hotel',
      supplierName: 'Hotel Supplier',
      vehicleId: null,
      status: 'in_progress',
      confirmationStatus: 'requested',
      supplierConfirmationStatus: 'SENT',
      confirmationDeadline: new Date('2026-05-10T00:00:00.000Z'),
      reconfirmationRequired: true,
      reconfirmationDueAt: dashboardDate,
      vouchers: [],
      booking: { id: '11111111-1111-4111-8111-111111111111', bookingRef: 'BK-1', status: 'in_progress', startDate: dashboardDate, endDate: dashboardDate, snapshotJson: {} },
    },
    {
      id: 'transport-1',
      bookingId: '11111111-1111-4111-8111-111111111111',
      description: 'Airport transfer',
      serviceType: 'TRANSPORT',
      operationType: 'TRANSPORT',
      operationStatus: 'PENDING',
      serviceDate: dashboardDate,
      startTime: null,
      pickupTime: null,
      assignedTo: null,
      supplierId: null,
      supplierName: null,
      vehicleId: null,
      status: 'pending',
      confirmationStatus: 'pending',
      supplierConfirmationStatus: 'NOT_SENT',
      confirmationDeadline: null,
      reconfirmationRequired: false,
      reconfirmationDueAt: null,
      vouchers: [],
      booking: { id: '11111111-1111-4111-8111-111111111111', bookingRef: 'BK-1', status: 'in_progress', startDate: dashboardDate, endDate: dashboardDate, snapshotJson: {} },
    },
    {
      id: 'activity-1',
      bookingId: 'booking-2',
      description: 'Excursion',
      serviceType: 'ACTIVITY',
      operationType: 'ACTIVITY',
      operationStatus: 'CONFIRMED',
      serviceDate: dashboardDate,
      startTime: '10:00',
      pickupTime: null,
      assignedTo: null,
      supplierId: 'supplier-activity',
      supplierName: 'Activity Supplier',
      vehicleId: null,
      status: 'confirmed',
      confirmationStatus: 'confirmed',
      supplierConfirmationStatus: 'CONFIRMED',
      confirmationDeadline: null,
      reconfirmationRequired: false,
      reconfirmationDueAt: null,
      vouchers: [{ id: 'voucher-1', status: 'ISSUED', type: 'ACTIVITY' }],
      booking: { id: 'booking-2', bookingRef: 'BK-2', status: 'in_progress', startDate: dashboardDate, endDate: dashboardDate, snapshotJson: {} },
    },
  ];
  const bookings = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      bookingRef: 'BK-1',
      status: 'in_progress',
      startDate: dashboardDate,
      endDate: dashboardDate,
      pax: 2,
      adults: 2,
      children: 0,
      roomCount: 1,
      snapshotJson: {},
      passengers: [
        { id: 'passenger-1', fullName: 'Lina Haddad', passportNumber: 'P1', passportExpiryDate: new Date('2027-01-01T00:00:00.000Z'), nationality: 'Jordanian' },
        { id: 'passenger-2', fullName: 'Omar Haddad', passportNumber: null, passportExpiryDate: null, nationality: null },
      ],
      roomingEntries: [{ id: 'room-1', roomType: 'DBL', occupancy: 'double', assignments: [{ bookingPassengerId: 'passenger-1' }] }],
    },
    {
      id: 'booking-2',
      bookingRef: 'BK-2',
      status: 'in_progress',
      startDate: dashboardDate,
      endDate: dashboardDate,
      pax: 1,
      adults: 1,
      children: 0,
      roomCount: 1,
      snapshotJson: {},
      passengers: [{ id: 'passenger-3', fullName: 'Nadia Haddad', passportNumber: 'P3', passportExpiryDate: new Date('2027-01-01T00:00:00.000Z'), nationality: 'Jordanian' }],
      roomingEntries: [{ id: 'room-2', roomType: 'SGL', occupancy: 'single', assignments: [{ bookingPassengerId: 'passenger-3' }] }],
    },
  ];
  const serviceWheres: any[] = [];
  const service = createService({
    booking: {
      findMany: async () => bookings,
    },
    bookingService: {
      findMany: async (args: any) => {
        serviceWheres.push(args.where);
        return services;
      },
    },
  });

  const dashboard = await service.getOperationsDashboard({
    actor: { companyId: 'company-1' },
    date: '2026-05-12',
    department: 'transport',
    serviceType: 'TRANSPORT',
    supplier: 'Transport',
    status: 'PENDING',
  });

  assert.equal(dashboard.filters.department, 'transportOperations');
  assert.equal(dashboard.filters.serviceType, 'TRANSPORT');
  assert.equal(dashboard.kpis.bookingsInOperation, 2);
  assert.equal(dashboard.kpis.servicesPendingConfirmation, 2);
  assert.equal(dashboard.kpis.overdueConfirmations, 1);
  assert.equal(dashboard.kpis.reconfirmationsDueToday, 1);
  assert.equal(dashboard.kpis.vouchersPending, 2);
  assert.equal(dashboard.kpis.missingPassengerDocuments, 1);
  assert.equal(dashboard.kpis.missingRooming, 1);
  assert.equal(dashboard.kpis.unassignedSuppliers, 1);
  assert.equal(dashboard.kpis.occupancyMismatch, 1);
  assert.equal(dashboard.kpis.missingTimings, 1);
  assert.equal(dashboard.departmentQueues.transportOperations.count, 1);
  assert.equal(dashboard.departmentQueues.transportOperations.items[0].owningDepartment, 'transportOperations');
  assert.equal(dashboard.alerts.overdueConfirmations.count, 1);
  assert.equal(dashboard.alerts.reconfirmationDueToday.count, 1);
  assert.equal(dashboard.alerts.occupancyMismatch.count, 1);
  assert.equal(dashboard.alerts.missingTimings.count, 1);
  assert.equal(dashboard.alerts.unassignedPassengers.count, 1);
  assert.equal(dashboard.readinessHeatmap.items.find((item: any) => item.id === '11111111-1111-4111-8111-111111111111').health, 'red');
  assert.equal(dashboard.readinessHeatmap.items.find((item: any) => item.id === 'booking-2').health, 'green');
  assert.ok(serviceWheres.some((where) => JSON.stringify(where).includes('TRANSPORT')));
  assert.ok(serviceWheres.some((where) => JSON.stringify(where).includes('Transport')));
});

test('cancel booking sets status to cancelled without deleting related data', async () => {
  let updateData: any;
  let auditLogData: any;
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async () => ({
            id: '11111111-1111-4111-8111-111111111111',
            status: 'confirmed',
            services: [
              {
                id: 'service-1',
                description: 'Hotel',
                serviceType: 'HOTEL',
                serviceDate: new Date('2026-06-01T00:00:00.000Z'),
                status: 'confirmed',
                confirmationStatus: 'confirmed',
                supplierId: 'supplier-1',
                supplierName: 'Hotel Supplier',
                totalCost: 100,
                totalSell: 130,
              },
            ],
          }),
          update: async ({ data }: any) => {
            updateData = data;
            return { id: '11111111-1111-4111-8111-111111111111', status: data.status };
          },
        },
        bookingAuditLog: {
          create: async ({ data }: any) => {
            auditLogData = data;
            return data;
          },
        },
      }),
  });

  const booking = await service.cancelBooking('11111111-1111-4111-8111-111111111111', {
    actor: { userId: 'user-1', label: 'Admin' },
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(booking.status, 'cancelled');
  assert.deepEqual(updateData, {
    status: 'cancelled',
    statusNote: 'Booking cancelled',
  });
  assert.equal(auditLogData.action, 'booking_status_updated');
  assert.equal(auditLogData.oldValue, 'confirmed');
  assert.equal(auditLogData.newValue, 'cancelled');
});

test('old booking amendments cannot be updated', async () => {
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async ({ where }: any) => {
            if (where?.amendedFromId === '11111111-1111-4111-8111-111111111111') {
              return { id: 'booking-2', amendedFromId: '11111111-1111-4111-8111-111111111111' };
            }

            return {
              id: '11111111-1111-4111-8111-111111111111',
              status: 'confirmed',
              services: [
                {
                  id: 'service-1',
                  description: 'Hotel',
                  serviceType: 'HOTEL',
                  serviceDate: new Date('2026-06-01T00:00:00.000Z'),
                  status: 'confirmed',
                  confirmationStatus: 'confirmed',
                  supplierId: 'supplier-1',
                  supplierName: 'Hotel Supplier',
                  totalCost: 100,
                  totalSell: 130,
                },
              ],
            };
          },
        },
      }),
  });

  await assert.rejects(
    () =>
      service.updateBookingStatus('11111111-1111-4111-8111-111111111111', {
        status: 'completed',
        note: 'Complete booking',
        companyActor: { companyId: 'company-1' },
      }),
    /Only the latest booking amendment/,
  );
});

test('amend booking clones days passengers and services without changing original', async () => {
  let createdBookingData: any;
  const createdDays: any[] = [];
  const createdPassengers: any[] = [];
  const createdRoomingEntries: any[] = [];
  const createdRoomingAssignments: any[] = [];
  const createdServices: any[] = [];
  const original = {
    id: '11111111-1111-4111-8111-111111111111',
    quoteId: 'quote-1',
    acceptedVersionId: 'version-1',
    clientCompanyId: 'client-company-1',
    amendmentNumber: 1,
    bookingType: 'FIT',
    status: 'confirmed',
    clientInvoiceStatus: 'unbilled',
    supplierPaymentStatus: 'unpaid',
    statusNote: null,
    bookingRef: 'BK-2026-0001',
    snapshotJson: { title: 'Original booking' },
    clientSnapshotJson: { name: 'Client Co' },
    brandSnapshotJson: null,
    contactSnapshotJson: { firstName: 'Lina', lastName: 'Haddad' },
    itinerarySnapshotJson: [],
    pricingSnapshotJson: { totalSell: 130 },
    adults: 2,
    children: 0,
    pax: 2,
    roomCount: 1,
    nightCount: 2,
    startDate: new Date('2026-06-01T00:00:00.000Z'),
    endDate: new Date('2026-06-03T00:00:00.000Z'),
    days: [{ id: 'day-1', dayNumber: 1, date: new Date('2026-06-01T00:00:00.000Z'), title: 'Arrival', notes: null, status: 'PENDING' }],
    passengers: [{
      id: 'passenger-1',
      fullName: 'Lina Haddad',
      firstName: 'Lina',
      lastName: 'Haddad',
      title: null,
      gender: null,
      dateOfBirth: null,
      nationality: 'Jordanian',
      passportNumber: 'P1234567',
      passportIssueDate: null,
      passportExpiryDate: null,
      arrivalFlight: null,
      departureFlight: null,
      entryPoint: null,
      visaStatus: null,
      roomingNotes: null,
      isLead: true,
      notes: null,
    }],
    roomingEntries: [{
      id: 'rooming-entry-1',
      roomType: 'DBL',
      occupancy: 'double',
      notes: 'Keep rooming',
      sortOrder: 1,
      assignments: [{
        id: 'assignment-1',
        bookingRoomingEntryId: 'rooming-entry-1',
        bookingPassengerId: 'passenger-1',
      }],
    }],
    services: [{
      bookingDayId: 'day-1',
      sourceQuoteItemId: 'item-1',
      serviceOrder: 1,
      serviceType: 'HOTEL',
      operationType: 'HOTEL',
      operationStatus: 'CONFIRMED',
      referenceId: null,
      assignedTo: null,
      guidePhone: null,
      vehicleId: null,
      serviceDate: new Date('2026-06-01T00:00:00.000Z'),
      startTime: null,
      pickupTime: null,
      pickupLocation: null,
      meetingPoint: null,
      participantCount: 2,
      adultCount: 2,
      childCount: 0,
      supplierReference: 'SUP-1',
      reconfirmationRequired: false,
      reconfirmationDueAt: null,
      description: 'Hotel',
      notes: 'Keep data',
      qty: 1,
      unitCost: 100,
      unitSell: 130,
      totalCost: 100,
      totalSell: 130,
      status: 'confirmed',
      supplierId: 'supplier-1',
      supplierName: 'Hotel Supplier',
      confirmationStatus: 'confirmed',
      confirmationNumber: 'CN-1',
      confirmationNotes: null,
      statusNote: null,
      confirmationRequestedAt: null,
      confirmationConfirmedAt: null,
    }],
  };
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async ({ where }: any) => (where?.id === '11111111-1111-4111-8111-111111111111' ? original : null),
          create: async ({ data }: any) => {
            createdBookingData = data;
            return { id: 'booking-2', ...data };
          },
        },
        bookingDay: {
          create: async ({ data }: any) => {
            createdDays.push(data);
            return { id: 'day-2', ...data };
          },
        },
        bookingPassenger: {
          create: async ({ data }: any) => {
            createdPassengers.push(data);
            return { id: 'passenger-2', ...data };
          },
        },
        bookingRoomingEntry: {
          create: async ({ data }: any) => {
            createdRoomingEntries.push(data);
            return { id: 'rooming-entry-2', ...data };
          },
        },
        bookingRoomingAssignment: {
          create: async ({ data }: any) => {
            createdRoomingAssignments.push(data);
            return { id: 'assignment-2', ...data };
          },
        },
        bookingService: {
          create: async ({ data }: any) => {
            createdServices.push(data);
            return { id: 'service-2', ...data };
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const amended = await service.amendBooking('11111111-1111-4111-8111-111111111111', {
    actor: { userId: 'user-1', label: 'Admin' },
    companyActor: { companyId: 'dmc-company-1' },
  });

  assert.equal(amended.id, 'booking-2');
  assert.equal(createdBookingData.quoteId, 'quote-1');
  assert.equal(createdBookingData.clientCompanyId, 'client-company-1');
  assert.equal(createdBookingData.amendmentNumber, 2);
  assert.equal(createdBookingData.amendedFromId, '11111111-1111-4111-8111-111111111111');
  assert.equal(createdDays.length, 1);
  assert.equal(createdPassengers.length, 1);
  assert.equal(createdRoomingEntries.length, 1);
  assert.equal(createdRoomingAssignments.length, 1);
  assert.equal(createdRoomingEntries[0].bookingId, 'booking-2');
  assert.equal(createdRoomingEntries[0].roomType, 'DBL');
  assert.equal(createdRoomingAssignments[0].bookingRoomingEntryId, 'rooming-entry-2');
  assert.equal(createdRoomingAssignments[0].bookingPassengerId, 'passenger-2');
  assert.equal(createdServices.length, 1);
  assert.equal(createdServices[0].bookingDayId, 'day-2');
  assert.equal(original.bookingRef, 'BK-2026-0001');
});

test('passenger manifest allows optional passport/nationality but still validates date order', async () => {
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async () => ({ id: '11111111-1111-4111-8111-111111111111' }),
        },
        bookingPassenger: {
          create: async ({ data }: any) => ({ id: 'passenger-1', ...data }),
          updateMany: async () => ({ count: 0 }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  // PR-2b: nationality + passport are OPTIONAL now — an empty nationality (and no
  // passport) succeeds; missing passport stays a readiness warning, not a blocker.
  const created = await service.createPassenger('11111111-1111-4111-8111-111111111111', {
    fullName: 'Lina Haddad',
    nationality: '',
    companyActor: { companyId: 'company-1' },
  });
  assert.equal(created.firstName, 'Lina');
  assert.equal(created.lastName, 'Haddad');
  assert.ok(!created.passportNumber, 'passport is optional');
  assert.ok(!created.nationality, 'empty nationality is allowed');

  // Date-order integrity is still enforced whenever both dates ARE supplied.
  await assert.rejects(
    () =>
      service.createPassenger('11111111-1111-4111-8111-111111111111', {
        fullName: 'Lina Haddad',
        nationality: 'Jordanian',
        passportNumber: 'P1234567',
        passportIssueDate: '2030-01-01',
        passportExpiryDate: '2029-01-01',
        companyActor: { companyId: 'company-1' },
      }),
    /expiry date cannot be before issue date/i,
  );
});

test('booking detail masks passport number in list response', async () => {
  const service = createService({
    booking: {
      findFirst: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        quoteId: 'quote-1',
        adults: 1,
        children: 0,
        roomCount: 1,
      }),
    },
    quote: {
      findUnique: async () => ({
        clientCompany: { id: 'company-1', name: 'Client Co' },
        brandCompany: null,
        contact: {},
      }),
    },
    quoteVersion: {
      findUnique: async () => null,
    },
    bookingAuditLog: {
      findMany: async () => [],
    },
    bookingPassenger: {
      findMany: async () => [
        {
          id: 'passenger-1',
          fullName: 'Lina Haddad',
          firstName: 'Lina',
          lastName: 'Haddad',
          title: null,
          passportNumber: 'P1234567',
          isLead: true,
          roomingAssignments: [],
        },
      ],
    },
    bookingDay: {
      findMany: async () => [],
    },
    bookingRoomingEntry: {
      findMany: async () => [],
    },
    payment: {
      findMany: async () => [],
    },
    bookingService: {
      findMany: async () => [],
    },
  });

  const booking = await service.findOne('11111111-1111-4111-8111-111111111111', { companyId: 'company-1' });

  assert.equal(booking.passengers[0].passportNumber, undefined);
  assert.equal(booking.passengers[0].passportNumberMasked, '****4567');
});

test('passenger manifest Excel export contains government-ready columns and values', async () => {
  const service = createService({
    booking: {
      findFirst: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        bookingRef: 'BK-2026-0001',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        snapshotJson: { title: 'Jordan Operations Booking' },
        quote: { title: 'Quote title', clientCompany: { id: 'company-1' } },
        passengers: [
          {
            id: 'passenger-1',
            fullName: 'Lina Haddad',
            firstName: 'Lina',
            lastName: 'Haddad',
            gender: 'F',
            dateOfBirth: new Date('1990-02-03T00:00:00.000Z'),
            nationality: 'Jordanian',
            passportNumber: 'P1234567',
            passportIssueDate: new Date('2024-01-01T00:00:00.000Z'),
            passportExpiryDate: new Date('2030-01-01T00:00:00.000Z'),
            arrivalFlight: 'RJ101',
            departureFlight: 'RJ102',
            entryPoint: 'QAIA',
            visaStatus: 'Approved',
            emergencyContactName: 'Omar Haddad',
            emergencyContactPhone: '+962700000000',
            dietaryNotes: 'Vegetarian, no nuts',
            notes: 'Emergency contact: Omar +962700000000',
            roomingNotes: 'Near elevator',
            roomingAssignments: [
              {
                bookingRoomingEntry: {
                  id: 'room-1',
                  roomType: 'TWN',
                  occupancy: 'double',
                  sortOrder: 1,
                },
              },
            ],
          },
        ],
        roomingEntries: [
          {
            id: 'room-1',
            roomType: 'TWN',
            occupancy: 'double',
            sortOrder: 1,
            notes: 'Twin share',
            assignments: [
              {
                bookingPassenger: {
                  id: 'passenger-1',
                  fullName: 'Lina Haddad',
                  firstName: 'Lina',
                  lastName: 'Haddad',
                },
              },
              {
                bookingPassenger: {
                  id: 'passenger-2',
                  fullName: 'Omar Haddad',
                  firstName: 'Omar',
                  lastName: 'Haddad',
                },
              },
            ],
          },
        ],
      }),
    },
  });

  const exported = await service.exportPassengerManifestExcel('11111111-1111-4111-8111-111111111111', { companyId: 'company-1' });
  const workbook = XLSX.read(exported.buffer);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Passenger Manifest']) as any[];
  const roomingRows = XLSX.utils.sheet_to_json(workbook.Sheets['Rooming List']) as any[];
  const movementRows = XLSX.utils.sheet_to_json(workbook.Sheets['Arrival Departure']) as any[];
  const operationalRows = XLSX.utils.sheet_to_json(workbook.Sheets['Operational Manifest']) as any[];

  assert.deepEqual(Object.keys(rows[0]), [
    'Booking Name',
    'Arrival Date',
    'Entry Point',
    'Full Name',
    'Gender',
    'DOB',
    'Nationality',
    'Passport Number',
    'Issue Date',
    'Expiry Date',
    'Flight',
    'Visa Status',
    'Room Assignment',
    'Emergency Contact',
    'Emergency Phone',
    'Dietary',
    'Emergency Notes',
  ]);
  assert.equal(rows[0]['Booking Name'], 'Jordan Operations Booking');
  assert.equal(rows[0]['Arrival Date'], '2026-10-01');
  assert.equal(rows[0]['Entry Point'], 'QAIA');
  assert.equal(rows[0]['Full Name'], 'Lina Haddad');
  assert.equal(rows[0]['Passport Number'], 'P1234567');
  assert.equal(rows[0]['Room Assignment'], 'TWN');
  assert.equal(rows[0]['Emergency Contact'], 'Omar Haddad');
  assert.equal(rows[0]['Emergency Phone'], '+962700000000');
  assert.equal(rows[0]['Dietary'], 'Vegetarian, no nuts');
  assert.equal(roomingRows[0].Capacity, 2);
  assert.equal(roomingRows[0].Status, 'Matched');
  assert.equal(movementRows[0]['Departure Flight'], 'RJ102');
  assert.equal(operationalRows[0]['Emergency Contact'], 'Omar Haddad');
  assert.equal(operationalRows[0]['Emergency Phone'], '+962700000000');
  assert.equal(operationalRows[0]['Dietary'], 'Vegetarian, no nuts');
  assert.equal(operationalRows[0]['Emergency Notes'], 'Emergency contact: Omar +962700000000');
});

test('rooming assignment validates TWN occupancy and prevents over-assignment', async () => {
  const createdRoomingEntries: any[] = [];
  const createdAssignments: any[] = [];
  const existingAssignments = [{ bookingPassengerId: 'passenger-1' }];
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async () => ({ id: '11111111-1111-4111-8111-111111111111', roomingEntries: [] }),
        },
        bookingRoomingEntry: {
          create: async ({ data }: any) => {
            createdRoomingEntries.push(data);
            return { id: 'room-1', ...data };
          },
          findFirst: async () => ({
            id: 'room-1',
            bookingId: '11111111-1111-4111-8111-111111111111',
            roomType: 'TWN',
            occupancy: 'double',
            sortOrder: 1,
            assignments: existingAssignments,
          }),
        },
        bookingPassenger: {
          findFirst: async ({ where }: any) => ({
            id: where.id,
            bookingId: '11111111-1111-4111-8111-111111111111',
            firstName: where.id === 'passenger-2' ? 'Omar' : 'Nadia',
            lastName: 'Haddad',
            title: null,
            roomingAssignments: [],
          }),
        },
        bookingRoomingAssignment: {
          create: async ({ data }: any) => {
            createdAssignments.push(data);
            existingAssignments.push({ bookingPassengerId: data.bookingPassengerId });
            return { id: 'assignment-1', ...data };
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const roomingEntry = await service.createRoomingEntry('11111111-1111-4111-8111-111111111111', {
    roomType: 'TWN',
    occupancy: 'TWN',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(roomingEntry.occupancy, 'double');
  assert.equal(createdRoomingEntries[0].roomType, 'TWN');
  const assignment = await service.assignPassengerToRoom('11111111-1111-4111-8111-111111111111', 'room-1', 'passenger-2', undefined, { companyId: 'company-1' });
  assert.equal(assignment.bookingPassengerId, 'passenger-2');
  await assert.rejects(
    () => service.assignPassengerToRoom('11111111-1111-4111-8111-111111111111', 'room-1', 'passenger-3', undefined, { companyId: 'company-1' }),
    /occupancy limit/i,
  );
  assert.equal(createdAssignments.length, 1);
});

test('rooming reassignment moves a passenger from the previous room assignment', async () => {
  const deletedAssignments: string[] = [];
  const createdAssignments: any[] = [];
  const auditActions: string[] = [];
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        bookingRoomingEntry: {
          findFirst: async () => ({
            id: 'room-2',
            bookingId: '11111111-1111-4111-8111-111111111111',
            roomType: 'DBL',
            occupancy: 'double',
            sortOrder: 2,
            assignments: [],
          }),
        },
        bookingPassenger: {
          findFirst: async () => ({
            id: 'passenger-1',
            bookingId: '11111111-1111-4111-8111-111111111111',
            firstName: 'Lina',
            lastName: 'Haddad',
            title: null,
            roomingAssignments: [{ id: 'assignment-old', bookingRoomingEntryId: 'room-1' }],
          }),
        },
        bookingRoomingAssignment: {
          delete: async ({ where }: any) => {
            deletedAssignments.push(where.id);
            return {};
          },
          create: async ({ data }: any) => {
            createdAssignments.push(data);
            return { id: 'assignment-new', ...data };
          },
        },
        bookingAuditLog: {
          create: async ({ data }: any) => {
            auditActions.push(data.action);
            return {};
          },
        },
      }),
  });

  const assignment = await service.assignPassengerToRoom('11111111-1111-4111-8111-111111111111', 'room-2', 'passenger-1', undefined, { companyId: 'company-1' });

  assert.deepEqual(deletedAssignments, ['assignment-old']);
  assert.equal(createdAssignments[0].bookingRoomingEntryId, 'room-2');
  assert.equal(createdAssignments[0].bookingPassengerId, 'passenger-1');
  assert.equal(assignment.bookingRoomingEntryId, 'room-2');
  assert.deepEqual(auditActions, ['booking_rooming_assignment_moved']);
});

test('rooming auto-assign pairs unassigned passengers into twins with an odd single', async () => {
  const createdRoomingEntries: any[] = [];
  const createdAssignments: any[] = [];
  const auditActions: string[] = [];
  let roomSeq = 0;
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async ({ where }: any) => {
            // assertLatestBookingAmendment probes by amendedFromId — no newer amendment.
            if (where?.amendedFromId !== undefined) return null;
            return {
              id: '11111111-1111-4111-8111-111111111111',
              passengers: [
                { id: 'p1', firstName: 'Lead', lastName: 'A', title: null, isLead: true, roomingAssignments: [{ id: 'a1' }] },
                { id: 'p2', firstName: 'Solo', lastName: 'B', title: null, isLead: false, roomingAssignments: [] },
                { id: 'p3', firstName: 'Solo', lastName: 'C', title: null, isLead: false, roomingAssignments: [] },
                { id: 'p4', firstName: 'Solo', lastName: 'D', title: null, isLead: false, roomingAssignments: [] },
              ],
              roomingEntries: [{ sortOrder: 2 }],
            };
          },
        },
        bookingRoomingEntry: {
          create: async ({ data }: any) => {
            createdRoomingEntries.push(data);
            roomSeq += 1;
            return { id: `room-${roomSeq}`, ...data };
          },
        },
        bookingRoomingAssignment: {
          create: async ({ data }: any) => {
            createdAssignments.push(data);
            return { id: `assignment-${createdAssignments.length}`, ...data };
          },
        },
        bookingAuditLog: {
          create: async ({ data }: any) => {
            auditActions.push(data.action);
            return {};
          },
        },
      }),
  });

  const result = await service.autoAssignRooming('11111111-1111-4111-8111-111111111111', { companyActor: { companyId: 'company-1' } });

  assert.equal(result.roomsCreated, 2);
  assert.equal(result.passengersAssigned, 3);
  // First room is a twin (two solos), second is a single (odd one out).
  assert.equal(createdRoomingEntries[0].roomType, 'TWN');
  assert.equal(createdRoomingEntries[0].occupancy, 'double');
  assert.equal(createdRoomingEntries[1].roomType, 'SGL');
  assert.equal(createdRoomingEntries[1].occupancy, 'single');
  // Sort order continues from the existing max (2 → 3, 4).
  assert.equal(createdRoomingEntries[0].sortOrder, 3);
  assert.equal(createdRoomingEntries[1].sortOrder, 4);
  // The already-assigned lead passenger (p1) is never reassigned.
  assert.deepEqual(createdAssignments.map((a) => a.bookingPassengerId), ['p2', 'p3', 'p4']);
  assert.deepEqual(auditActions, ['booking_rooming_auto_assigned']);
});

test('rooming auto-assign is a no-op when every passenger already has a room', async () => {
  const createdRoomingEntries: any[] = [];
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async ({ where }: any) => {
            if (where?.amendedFromId !== undefined) return null;
            return {
              id: '11111111-1111-4111-8111-111111111111',
              passengers: [
                { id: 'p1', firstName: 'A', lastName: 'A', title: null, isLead: true, roomingAssignments: [{ id: 'a1' }] },
              ],
              roomingEntries: [{ sortOrder: 1 }],
            };
          },
        },
        bookingRoomingEntry: {
          create: async ({ data }: any) => {
            createdRoomingEntries.push(data);
            return { id: 'x', ...data };
          },
        },
        bookingRoomingAssignment: { create: async () => ({}) },
        bookingAuditLog: { create: async () => ({}) },
      }),
  });

  const result = await service.autoAssignRooming('11111111-1111-4111-8111-111111111111', { companyActor: { companyId: 'company-1' } });
  assert.equal(result.roomsCreated, 0);
  assert.equal(result.passengersAssigned, 0);
  assert.equal(createdRoomingEntries.length, 0);
});

test('findPortalBooking surfaces the DMC emergency contact and strips raw brand data', async () => {
  const service = createService({
    booking: {
      findFirst: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        bookingRef: 'BK-1',
        adults: 2,
        children: 0,
        roomCount: 1,
        nightCount: 3,
        snapshotJson: { title: 'Jordan Highlights' },
        contactSnapshotJson: { firstName: 'Lina', lastName: 'Haddad' },
        brandSnapshotJson: {
          name: 'Aventus DMC',
          branding: { displayName: 'Aventus Travel', phone: '+962790000000', email: 'ops@aventus.jo', website: 'https://aventus.jo' },
        },
        services: [],
      }),
    },
  });

  const portal: any = await service.findPortalBooking('11111111-1111-4111-8111-111111111111', 'token-123');
  assert.equal(portal.emergencyContact.name, 'Aventus Travel');
  assert.equal(portal.emergencyContact.phone, '+962790000000');
  assert.equal(portal.emergencyContact.email, 'ops@aventus.jo');
  assert.equal(portal.emergencyContact.website, 'https://aventus.jo');
  // Raw brand snapshot must not leak to the public portal response.
  assert.equal('brandSnapshotJson' in portal, false);
  assert.equal(portal.contactSnapshotJson.firstName, 'Lina');
});

test('findPortalBooking returns null without a token and null emergency contact when no brand data', async () => {
  const noToken = await createService({
    booking: { findFirst: async () => { throw new Error('should not query without token'); } },
  }).findPortalBooking('11111111-1111-4111-8111-111111111111', '');
  assert.equal(noToken, null);

  const service = createService({
    booking: {
      findFirst: async () => ({
        id: '11111111-1111-4111-8111-111111111111',
        bookingRef: 'BK-1',
        adults: 1,
        children: 0,
        roomCount: 1,
        nightCount: 1,
        snapshotJson: {},
        contactSnapshotJson: { firstName: 'A', lastName: 'B' },
        brandSnapshotJson: { name: 'No Contact DMC' },
        services: [],
      }),
    },
  });
  const portal: any = await service.findPortalBooking('11111111-1111-4111-8111-111111111111', 'token-123');
  assert.equal(portal.emergencyContact, null);
});

test('rooming unassignment removes the passenger assignment', async () => {
  const deletedAssignments: string[] = [];
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        bookingRoomingEntry: {
          findFirst: async () => ({
            id: 'room-1',
            bookingId: '11111111-1111-4111-8111-111111111111',
            roomType: 'SGL',
            occupancy: 'single',
            sortOrder: 1,
          }),
        },
        bookingPassenger: {
          findFirst: async () => ({
            id: 'passenger-1',
            bookingId: '11111111-1111-4111-8111-111111111111',
            firstName: 'Lina',
            lastName: 'Haddad',
            title: null,
          }),
        },
        bookingRoomingAssignment: {
          findUnique: async () => ({ id: 'assignment-1' }),
          delete: async ({ where }: any) => {
            deletedAssignments.push(where.id);
            return {};
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const result = await service.unassignPassengerFromRoom('11111111-1111-4111-8111-111111111111', 'room-1', 'passenger-1', undefined, { companyId: 'company-1' });

  assert.deepEqual(deletedAssignments, ['assignment-1']);
  assert.equal(result.bookingPassengerId, 'passenger-1');
});

test('room deletion rules require assignments to be removed first', async () => {
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        bookingRoomingEntry: {
          findFirst: async () => ({
            id: 'room-1',
            bookingId: '11111111-1111-4111-8111-111111111111',
            roomType: 'DBL',
            occupancy: 'double',
            notes: null,
            sortOrder: 1,
            assignments: [{ id: 'assignment-1' }],
          }),
          delete: async () => {
            throw new Error('delete should not run while assigned passengers exist');
          },
        },
      }),
  });

  await assert.rejects(
    () => service.deleteRoomingEntry('11111111-1111-4111-8111-111111111111', 'room-1', undefined, { companyId: 'company-1' }),
    /Unassign passengers from the room before deleting/i,
  );
});

test('operational readiness reports missing passport, unassigned passengers, and room occupancy mismatch', () => {
  const service = createService({});
  const readiness = (service as any).buildOperationalReadinessDashboard({
    pax: 2,
    adults: 2,
    children: 0,
    roomCount: 1,
    snapshotJson: {},
    days: [],
    services: [],
    passengers: [
      {
        id: 'passenger-1',
        firstName: 'Lina',
        lastName: 'Haddad',
        nationality: 'Jordanian',
        passportNumber: 'P1234567',
        passportExpiryDate: new Date('2030-01-01T00:00:00.000Z'),
        roomingAssignments: [{ bookingRoomingEntryId: 'room-1' }],
      },
      {
        id: 'passenger-2',
        firstName: 'Omar',
        lastName: 'Haddad',
        nationality: null,
        passportNumber: null,
        passportExpiryDate: null,
        roomingAssignments: [],
      },
    ],
    roomingEntries: [
      {
        id: 'room-1',
        roomType: 'DBL',
        occupancy: 'double',
        assignments: [{ bookingPassenger: { id: 'passenger-1' } }],
      },
    ],
  });
  const passengerSection = readiness.sections.find((section: any) => section.title === 'Passengers');
  const roomingSection = readiness.sections.find((section: any) => section.title === 'Rooming');

  assert.equal(readiness.summary.passengers.unassigned, 1);
  assert.equal(readiness.summary.rooming.issues.occupancyIssues, 0);
  assert.equal(readiness.summary.rooming.issues.unassignedRooms, 1);
  assert.match(passengerSection.issues.join(' '), /passengers not assigned/i);
  assert.match(roomingSection.issues.join(' '), /room groups incomplete/i);
  assert.equal((service as any).getMissingPassengerReasons({
    pax: 2,
    passengers: [
      { fullName: 'Lina Haddad', nationality: 'Jordanian', passportNumber: 'P1234567', passportExpiryDate: new Date('2030-01-01T00:00:00.000Z') },
      { fullName: 'Omar Haddad', nationality: '', passportNumber: '', passportExpiryDate: null },
    ],
  }).includes('missing required passport fields'), true);
  assert.equal((service as any).getMissingRoomingReasons({
    roomCount: 1,
    passengers: [{ id: 'passenger-1' }, { id: 'passenger-2' }],
    roomingEntries: [
      {
        id: 'room-1',
        roomType: 'DBL',
        occupancy: 'double',
        assignments: [{ bookingPassengerId: 'passenger-1' }],
      },
    ],
  }).includes('room occupancy mismatch'), true);
});

test('operational readiness allows booking with passenger names pending as manifest warning', () => {
  const service = createService({});
  const readiness = (service as any).buildOperationalReadinessDashboard({
    pax: 12,
    adults: 12,
    children: 0,
    roomCount: 6,
    snapshotJson: {},
    days: [],
    services: [
      {
        id: 'service-1',
        serviceType: 'TRANSPORT',
        operationType: 'TRANSPORT',
        status: 'active',
        totalCost: 100,
        totalSell: 130,
        supplierId: 'supplier-1',
        referenceId: 'route-1',
        vehicleId: 'vehicle-1',
        confirmationStatus: 'confirmed',
        vouchers: [],
      },
    ],
    passengers: [],
    roomingEntries: Array.from({ length: 6 }, (_, index) => ({
      id: `room-${index + 1}`,
      roomType: 'DBL',
      occupancy: 'double',
      assignments: [],
    })),
  });
  const passengerSection = readiness.sections.find((section: any) => section.title === 'Passengers');

  assert.equal(readiness.status, 'warning');
  assert.equal(readiness.summary.passengers.manifestStatus, 'PENDING');
  assert.equal(readiness.summary.passengers.namesPending, true);
  assert.equal(readiness.summary.passengers.status, 'warning');
  assert.match(passengerSection.issues.join(' '), /passenger names pending/i);
});

test('DMC admin booking access requires auth without single-client company filtering', async () => {
  let whereClause: any;
  const service = createService({
    booking: {
      findFirst: async ({ where }: any) => {
        whereClause = where;
        return null;
      },
    },
  });

  await service.findOne('11111111-1111-4111-8111-111111111111', { companyId: 'company-a' });

  assert.equal(whereClause.id, '11111111-1111-4111-8111-111111111111');
  assert.equal(whereClause.quote, undefined);
});

test('booking detail loads selected client booking when actor company differs', async () => {
  let baseWhere: any;
  const service = createService({
    booking: {
      findFirst: async ({ where }: any) => {
        if (where?.id === '11111111-1111-4111-8111-111111111111') {
          baseWhere = where;
        }
        return {
          id: '11111111-1111-4111-8111-111111111111',
          quoteId: 'quote-1',
          clientCompanyId: 'client-company-1',
          adults: 2,
          children: 0,
          roomCount: 1,
          snapshotJson: { title: 'Client booking' },
        };
      },
    },
    quote: {
      findUnique: async () => ({
        id: 'quote-1',
        clientCompanyId: 'client-company-1',
        clientCompany: { id: 'client-company-1', name: 'Client Co' },
        brandCompany: null,
        contact: {},
      }),
    },
    quoteVersion: {
      findUnique: async () => null,
    },
    bookingAuditLog: {
      findMany: async () => [],
    },
    bookingPassenger: {
      findMany: async () => [],
    },
    bookingDay: {
      findMany: async () => [],
    },
    bookingRoomingEntry: {
      findMany: async () => [],
    },
    payment: {
      findMany: async () => [],
    },
    bookingService: {
      findMany: async () => [],
    },
  });

  const booking = await service.findOne('11111111-1111-4111-8111-111111111111', { companyId: 'dmc-company-1' });

  assert.equal(baseWhere.id, '11111111-1111-4111-8111-111111111111');
  assert.equal(baseWhere.quote, undefined);
  assert.equal(booking.id, '11111111-1111-4111-8111-111111111111');
  assert.equal(booking.clientCompanyId, 'client-company-1');
});

test('booking passenger service manifest and voucher flows work for selected client booking', async () => {
  const seenWheres: any[] = [];
  const createdRows: any[] = [];
  const updatedRows: any[] = [];
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async ({ where }: any) => {
            seenWheres.push(where);
            return { id: '11111111-1111-4111-8111-111111111111', clientCompanyId: 'client-company-1' };
          },
        },
        bookingPassenger: {
          create: async ({ data }: any) => ({ id: 'passenger-1', ...data }),
          updateMany: async () => ({ count: 0 }),
        },
        bookingService: {
          create: async ({ data }: any) => {
            createdRows.push(data);
            return { id: 'service-1', ...data };
          },
          update: async ({ data }: any) => {
            updatedRows.push(data);
            return { id: 'service-1', bookingId: '11111111-1111-4111-8111-111111111111', ...data };
          },
        },
        voucher: {
          create: async ({ data }: any) => ({ id: 'voucher-1', ...data }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
    bookingDay: {
      findFirst: async ({ where }: any) => {
        seenWheres.push(where);
        return {
          id: 'day-1',
          bookingId: '11111111-1111-4111-8111-111111111111',
          date: new Date('2026-10-01T00:00:00.000Z'),
          booking: { id: '11111111-1111-4111-8111-111111111111', clientCompanyId: 'client-company-1', adults: 2, children: 1 },
        };
      },
    },
    bookingService: {
      count: async () => 0,
      findFirst: async ({ where }: any) => {
        seenWheres.push(where);
        return {
          id: 'service-1',
          bookingId: '11111111-1111-4111-8111-111111111111',
          bookingDayId: 'day-1',
          serviceType: 'GUIDE',
          operationType: 'GUIDE',
          operationStatus: 'PENDING',
          supplierId: 'supplier-1',
          supplierName: 'Guide Supplier',
          assignedTo: 'Guide Lina',
          guidePhone: '+962700000000',
          notes: 'Guide note',
          bookingDay: { id: 'day-1' },
          supplier: { id: 'supplier-1', name: 'Guide Supplier' },
          vehicle: null,
        };
      },
    },
    supplier: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: 'Guide Supplier' }),
    },
    booking: {
      findFirst: async ({ where }: any) => {
        seenWheres.push(where);
        return {
          id: '11111111-1111-4111-8111-111111111111',
          bookingRef: 'BK-DMC-1',
          clientCompanyId: 'client-company-1',
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          snapshotJson: { title: 'Client booking' },
          quote: { title: 'Client quote', clientCompany: { id: 'client-company-1', name: 'Client Co' } },
          passengers: [
            {
              fullName: 'Lina Haddad',
              nationality: 'Jordanian',
              passportNumber: 'P1234567',
              passportExpiryDate: new Date('2030-01-01T00:00:00.000Z'),
              entryPoint: 'QAIA',
            },
          ],
        };
      },
    },
  });

  const passenger = await service.createPassenger('11111111-1111-4111-8111-111111111111', {
    fullName: 'Lina Haddad',
    nationality: 'Jordanian',
    passportNumber: 'P1234567',
    passportExpiryDate: '2030-01-01',
    companyActor: { companyId: 'dmc-company-1' },
  });
  const createdService = await service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
    type: 'GUIDE',
    supplierId: 'supplier-1',
    assignedTo: 'Guide Lina',
    status: 'REQUESTED',
    companyActor: { companyId: 'dmc-company-1' },
  });
  const updatedService = await service.updateBookingService('11111111-1111-4111-8111-111111111111', 'day-1', 'service-1', {
    type: 'GUIDE',
    supplierId: 'supplier-1',
    assignedTo: 'Guide Lina Updated',
    status: 'CONFIRMED',
    companyActor: { companyId: 'dmc-company-1' },
  });
  const manifest = await service.exportPassengerManifestExcel('11111111-1111-4111-8111-111111111111', { companyId: 'dmc-company-1' });
  const voucher = await service.createServiceVoucher('11111111-1111-4111-8111-111111111111', 'service-1', {
    companyActor: { companyId: 'dmc-company-1' },
  });

  assert.equal(passenger.bookingId, '11111111-1111-4111-8111-111111111111');
  assert.equal(createdService.supplierId, 'supplier-1');
  assert.equal(updatedService.assignedTo, 'Guide Lina Updated');
  assert.equal(voucher.bookingId, '11111111-1111-4111-8111-111111111111');
  assert.equal(manifest.fileName, 'bk-dmc-1-passenger-manifest.xlsx');
  assert.ok(seenWheres.every((where) => !where.quote?.clientCompanyId && !where.booking?.quote?.clientCompanyId));
  assert.ok(createdRows.some((row) => row.bookingId === '11111111-1111-4111-8111-111111111111' && row.supplierId === 'supplier-1'));
  assert.ok(updatedRows.some((row) => row.supplierId === 'supplier-1'));
});

test('GET /bookings returns list with post-migration-safe booking service select', async () => {
  let findManyArgs: any;
  const service = createService({
    booking: {
      findMany: async (args: any) => {
        findManyArgs = args;
        return [
          {
            id: '11111111-1111-4111-8111-111111111111',
            quoteId: 'quote-1',
            bookingRef: 'BK-1',
            status: 'confirmed',
            createdAt: new Date('2026-04-27T00:00:00.000Z'),
            updatedAt: new Date('2026-04-27T00:00:00.000Z'),
            snapshotJson: { title: 'Recovered production booking', totalCost: 100, totalSell: 130 },
            clientSnapshotJson: { name: 'Client Co' },
            pricingSnapshotJson: { totalCost: 100, totalSell: 130, currency: 'JOD' },
            roomCount: 1,
            passengers: [],
            roomingEntries: [],
            payments: [],
            auditLogs: [],
            services: [
              {
                id: 'service-1',
                bookingId: '11111111-1111-4111-8111-111111111111',
                serviceType: 'Transport',
                serviceDate: null,
                startTime: null,
                pickupTime: null,
                pickupLocation: null,
                meetingPoint: null,
                reconfirmationRequired: false,
                reconfirmationDueAt: null,
                status: 'ready',
                confirmationStatus: 'pending',
                totalCost: 100,
                totalSell: 130,
              },
            ],
          },
        ];
      },
    },
  });
  const controller = new BookingsController(service, {});

  const bookings = await controller.findAll({ companyId: 'company-1' } as any);

  assert.deepEqual(findManyArgs.where, {});
  assert.equal(findManyArgs.select.services.select.operationType, undefined);
  assert.equal(findManyArgs.select.services.select.bookingDayId, undefined);
  assert.equal(bookings.length, 1);
  assert.equal(bookings[0].id, '11111111-1111-4111-8111-111111111111');
  assert.equal(bookings[0].sourceQuoteId, 'quote-1');
  assert.equal(bookings[0].finance.quotedTotalSell, 130);
  // Currency-label hardening: the finance summary exposes the snapshot currency.
  assert.equal(bookings[0].finance.currency, 'JOD');
  assert.equal(bookings[0].operations.badge.breakdown.pendingConfirmations, 1);
});

test('GET /bookings falls back to base booking list when optional relations fail', async () => {
  const originalConsoleError = console.error;
  const loggedErrors: any[] = [];
  let callCount = 0;
  console.error = (...args: any[]) => {
    loggedErrors.push(args);
  };

  try {
    const service = createService({
      booking: {
        findMany: async (args: any) => {
          callCount += 1;
          if (args.select?.services) {
            throw new Error('column booking_services.bookingDayId does not exist');
          }
          return [
            {
              id: '11111111-1111-4111-8111-111111111111',
              quoteId: 'quote-1',
              bookingRef: 'BK-1',
              status: 'confirmed',
              createdAt: new Date('2026-04-27T00:00:00.000Z'),
              updatedAt: new Date('2026-04-27T00:00:00.000Z'),
              snapshotJson: { title: 'Fallback booking', totalCost: 100, totalSell: 120 },
              clientSnapshotJson: { name: 'Client Co' },
              pricingSnapshotJson: { totalCost: 100, totalSell: 120 },
              roomCount: 1,
            },
          ];
        },
      },
    });
    const controller = new BookingsController(service, {});

    const bookings = await controller.findAll({ companyId: 'company-1' } as any);

    assert.equal(callCount, 2);
    assert.equal(loggedErrors.length, 1);
    assert.match(String(loggedErrors[0][0]), /\[bookings\/findAll\]/);
    assert.equal(bookings.length, 1);
    assert.deepEqual(bookings[0].services, []);
    assert.deepEqual(bookings[0].passengers, []);
    assert.equal(bookings[0].finance.quotedTotalSell, 120);
  } finally {
    console.error = originalConsoleError;
  }
});

test('GET /bookings/:id returns base booking when optional relation loads fail after migration recovery', async () => {
  const originalConsoleError = console.error;
  const loggedErrors: any[] = [];
  console.error = (...args: any[]) => {
    loggedErrors.push(args);
  };

  try {
    const service = createService({
      booking: {
        findFirst: async ({ where }: any) => {
          assert.equal(where.id, '11111111-1111-4111-8111-111111111111');
          return {
            id: '11111111-1111-4111-8111-111111111111',
            quoteId: 'quote-1',
            acceptedVersionId: 'version-1',
            bookingRef: 'BK-1',
            bookingType: 'FIT',
            status: 'confirmed',
            createdAt: new Date('2026-04-27T00:00:00.000Z'),
            updatedAt: new Date('2026-04-27T00:00:00.000Z'),
            snapshotJson: { title: 'Recovered booking', totalCost: 100, totalSell: 120 },
            clientSnapshotJson: { name: 'Client Co' },
            brandSnapshotJson: null,
            contactSnapshotJson: { firstName: 'Lina', lastName: 'Haddad' },
            itinerarySnapshotJson: {},
            pricingSnapshotJson: { totalCost: 100, totalSell: 120 },
            adults: 2,
            children: 0,
            pax: 2,
            roomCount: 1,
            nightCount: 2,
            accessToken: 'token-1',
          };
        },
      },
      quote: {
        findUnique: async () => {
          throw new Error('relation quote failed');
        },
      },
      quoteVersion: {
        findUnique: async () => {
          throw new Error('relation accepted version failed');
        },
      },
      bookingAuditLog: {
        findMany: async () => {
          throw new Error('relation audit logs failed');
        },
      },
      bookingPassenger: {
        findMany: async () => {
          throw new Error('relation passengers failed');
        },
      },
      bookingDay: {
        findMany: async () => {
          throw new Error('relation booking days failed');
        },
      },
      bookingRoomingEntry: {
        findMany: async () => {
          throw new Error('relation rooming failed');
        },
      },
      payment: {
        findMany: async () => {
          throw new Error('relation payments failed');
        },
      },
      bookingService: {
        findMany: async () => {
          throw new Error('relation services failed');
        },
      },
    });
    const controller = new BookingsController(service, {});

    const booking = await controller.findOne('11111111-1111-4111-8111-111111111111', { companyId: 'company-1' } as any);

    assert.equal(booking.id, '11111111-1111-4111-8111-111111111111');
    assert.deepEqual(booking.passengers, []);
    assert.deepEqual(booking.days, []);
    assert.deepEqual(booking.services, []);
    assert.equal(booking.quote.clientCompany, null);
    assert.equal(booking.finance.quotedTotalSell, 120);
    assert.ok(loggedErrors.some((entry) => entry[0] === '[booking/findById]' && entry[1] === 'services'));
  } finally {
    console.error = originalConsoleError;
  }
});

test('operations dashboard returns scoped counts and missing passenger alerts', async () => {
  const bookingBase = {
    id: '11111111-1111-4111-8111-111111111111',
    bookingRef: 'BK-1',
    status: 'draft',
    startDate: new Date('2026-04-27T08:00:00.000Z'),
    endDate: new Date('2026-04-28T08:00:00.000Z'),
    pax: 2,
    adults: 2,
    children: 0,
    snapshotJson: { title: 'Jordan group' },
    passengers: [
      {
        id: 'passenger-1',
        fullName: 'Lina Haddad',
        firstName: 'Lina',
        lastName: 'Haddad',
        nationality: 'Jordanian',
        passportNumber: '',
        passportExpiryDate: null,
        entryPoint: 'QAIA',
      },
    ],
  };
  const transportService = {
    id: 'service-1',
    bookingId: '11111111-1111-4111-8111-111111111111',
    description: 'Airport transfer',
    serviceType: 'TRANSPORT',
    operationType: 'TRANSPORT',
    operationStatus: 'PENDING',
    serviceDate: new Date('2026-04-27T10:00:00.000Z'),
    pickupTime: null,
    assignedTo: null,
    supplierId: null,
    supplierName: null,
    vehicleId: null,
    booking: bookingBase,
  };
  const findManyCalls: any[] = [];
  const service = createService({
    booking: {
      findMany: async (args: any) => {
        findManyCalls.push({ model: 'booking', where: args.where });
        if (args.where?.startDate?.gte && args.where?.startDate?.lt) return [bookingBase];
        if (args.where?.endDate?.gte && args.where?.endDate?.lt) return [bookingBase];
        if (args.where?.status?.in) return [bookingBase];
        if (args.where?.OR) return [bookingBase];
        return [bookingBase];
      },
    },
    bookingService: {
      findMany: async (args: any) => {
        findManyCalls.push({ model: 'bookingService', where: args.where });
        return [transportService];
      },
    },
  });

  const dashboard = await service.getOperationsDashboard({
    actor: { companyId: 'company-1' },
    date: '2026-04-27',
  });

  assert.equal(dashboard.todayArrivals.count, 1);
  assert.equal(dashboard.todayDepartures.count, 1);
  assert.equal(dashboard.activeBookings.count, 1);
  assert.equal(dashboard.pendingServices.count, 1);
  assert.equal(dashboard.unconfirmedServices.count, 1);
  assert.equal(dashboard.missingPassengers.count, 1);
  assert.match(dashboard.missingPassengers.items[0].reasons.join(' '), /incomplete/i);
  assert.match(dashboard.missingPassengers.items[0].reasons.join(' '), /passport/i);
  assert.equal(dashboard.operationalReadiness.missingPassengerData, 1);
  assert.equal(dashboard.operationalReadiness.missingRooming, 1);
  assert.equal(dashboard.operationalReadiness.unconfirmedServices, 1);
  assert.equal(dashboard.operationalReadiness.missingVouchers, 1);
  assert.equal(dashboard.serviceStatusSummary.pending, 1);
  assert.equal(dashboard.alerts.servicesWithoutSupplierOrAssignment.count, 1);
  assert.equal(dashboard.alerts.missingTransportAssignmentForToday.count, 1);
  assert.equal(dashboard.alerts.missingRooming.count, 1);
  assert.equal(dashboard.alerts.missingVouchers.count, 1);
  assert.ok(findManyCalls.every((call) => !call.where.booking?.quote?.clientCompanyId && !call.where.quote?.clientCompanyId));
});

test('operations dashboard filters booking and service statuses', async () => {
  const bookingWheres: any[] = [];
  const serviceWheres: any[] = [];
  const service = createService({
    booking: {
      findMany: async (args: any) => {
        bookingWheres.push(args.where);
        return [];
      },
    },
    bookingService: {
      findMany: async (args: any) => {
        serviceWheres.push(args.where);
        return [];
      },
    },
  });

  const dashboard = await service.getOperationsDashboard({
    actor: { companyId: 'company-1' },
    date: '2026-04-27',
    bookingStatus: 'IN_PROGRESS',
    serviceStatus: 'REQUESTED',
  });

  assert.equal(dashboard.filters.bookingStatus, 'in_progress');
  assert.equal(dashboard.filters.serviceStatus, 'REQUESTED');
  assert.ok(bookingWheres.some((where) => where.status === 'in_progress' || where.status?.in?.includes('in_progress')));
  assert.ok(serviceWheres.every((where) => !where.booking?.quote?.clientCompanyId));
  assert.ok(serviceWheres.some((where) => where.operationStatus === 'REQUESTED' || JSON.stringify(where).includes('REQUESTED')));
});

test('booking operation service statuses support phase one execution workflow', async () => {
  const service = createService({});
  const normalize = (service as any).normalizeBookingOperationServiceStatus.bind(service);

  assert.equal(normalize('pending'), 'PENDING');
  assert.equal(normalize('requested'), 'REQUESTED');
  assert.equal(normalize('confirmed'), 'CONFIRMED');
  assert.equal(normalize('rejected'), 'REJECTED');
  assert.equal(normalize('cancelled'), 'CANCELLED');
  assert.equal(normalize('voucher sent'), 'VOUCHER_SENT');
  assert.equal(normalize('completed'), 'COMPLETED');
  assert.equal((service as any).mapOperationStatusToLifecycleStatus('REJECTED'), 'cancelled');
  assert.equal((service as any).mapOperationStatusToLifecycleStatus('VOUCHER_SENT'), 'confirmed');
  assert.equal((service as any).mapOperationStatusToConfirmationStatus('COMPLETED'), 'confirmed');
});

test('booking operation service status update persists execution status safely', async () => {
  let updateData: any;
  const auditRows: any[] = [];
  const prisma: any = {
    bookingService: {
      findFirst: async () => ({
        id: 'service-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        operationStatus: 'PENDING',
        status: 'pending',
      }),
      update: async ({ data }: any) => {
        updateData = data;
        return { id: 'service-1', ...data };
      },
    },
    bookingAuditLog: {
      create: async ({ data }: any) => {
        auditRows.push(data);
        return data;
      },
    },
    $transaction: async (callback: any) => callback(prisma),
  };
  const service = createService(prisma);
  (service as any).assertLatestBookingAmendment = async () => null;

  const updated = await service.updateOperationalServiceStatus('service-1', {
    status: 'Voucher Sent',
    note: 'Voucher emailed to supplier',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(updated.operationStatus, 'VOUCHER_SENT');
  assert.equal(updateData.operationStatus, 'VOUCHER_SENT');
  assert.equal(updateData.status, 'confirmed');
  assert.equal(updateData.confirmationStatus, 'confirmed');
  assert.equal(updateData.statusNote, 'Voucher emailed to supplier');
  assert.ok(auditRows.some((row) => row.action === 'service_operation_status_updated'));
});

test('operations dashboard requires company scope', async () => {
  const service = createService({});

  await assert.rejects(
    () =>
      service.getOperationsDashboard({
        actor: null,
        date: '2026-04-27',
      }),
    /company context is required/i,
  );
});

test('operations mobile data returns days services masked passports and no pricing', async () => {
  let whereClause: any;
  const service = createService({
    booking: {
      findMany: async ({ where }: any) => {
        whereClause = where;
        return [
          {
            id: '11111111-1111-4111-8111-111111111111',
            bookingRef: 'BK-1',
            status: 'in_progress',
            startDate: new Date('2026-04-27T00:00:00.000Z'),
            endDate: new Date('2026-04-28T00:00:00.000Z'),
            pax: 2,
            adults: 2,
            children: 0,
            roomCount: 1,
            snapshotJson: { title: 'Jordan group' },
            passengers: [
              {
                id: 'passenger-1',
                fullName: 'Lina Haddad',
                firstName: 'Lina',
                lastName: 'Haddad',
                nationality: 'Jordanian',
                passportNumber: 'P1234567',
                passportExpiryDate: new Date('2030-01-01T00:00:00.000Z'),
              },
            ],
            days: [
              {
                id: 'day-1',
                dayNumber: 1,
                date: new Date('2026-04-27T00:00:00.000Z'),
                title: 'Arrival',
                notes: 'Meet and assist',
                status: 'PENDING',
                services: [
                  {
                    id: 'service-1',
                    bookingDayId: 'day-1',
                    serviceType: 'TRANSPORT',
                    operationType: 'TRANSPORT',
                    operationStatus: 'CONFIRMED',
                    supplierId: 'supplier-1',
                    referenceId: 'route-1',
                    vehicleId: 'vehicle-1',
                    description: 'Airport transfer',
                    serviceDate: new Date('2026-04-27T10:00:00.000Z'),
                    startTime: null,
                    pickupTime: '09:00',
                    pickupLocation: 'QAIA',
                    meetingPoint: null,
                    assignedTo: 'Omar Driver',
                    guidePhone: '+962700000000',
                    supplierName: 'Transport Co',
                    confirmationNumber: null,
                    notes: 'Call on arrival',
                    status: 'confirmed',
                    totalCost: 100,
                    totalSell: 150,
                    vouchers: [{ id: 'voucher-1', status: 'DRAFT', type: 'TRANSPORT' }],
                  },
                ],
              },
            ],
          },
        ];
      },
    },
  });

  const mobile = await service.getOperationsMobileData({
    actor: { companyId: 'company-1' },
    date: '2026-04-27',
  });
  const rendered = JSON.stringify(mobile);

  assert.equal(whereClause.quote, undefined);
  assert.equal(mobile.bookings[0].days[0].services[0].operationStatus, 'CONFIRMED');
  assert.equal(mobile.bookings[0].days[0].services[0].vouchers[0].id, 'voucher-1');
  assert.equal(mobile.bookings[0].passengerSummary.maskedPassportSamples[0].passportNumberMasked, '****4567');
  assert.doesNotMatch(rendered, /P1234567/);
  assert.doesNotMatch(rendered, /totalCost|totalSell|margin/i);
});

test('guarantee letter and mobile operations stay client-safe for DMC-managed booking', async () => {
  const service = createService({
    booking: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.id, '11111111-1111-4111-8111-111111111111');
        assert.equal(where.quote, undefined);
        return {
          id: '11111111-1111-4111-8111-111111111111',
          bookingRef: 'BK-DMC-GL',
          clientCompanyId: 'client-company-1',
          pax: 2,
          adults: 2,
          children: 0,
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2026-10-03T00:00:00.000Z'),
          snapshotJson: { title: 'Client booking' },
          quote: {
            clientCompanyId: 'client-company-1',
            clientCompany: { id: 'client-company-1', name: 'Client Co' },
            brandCompany: { name: 'DMC Brand', branding: null },
            contact: {},
          },
          passengers: [
            {
              fullName: 'Lina Haddad',
              nationality: 'Jordanian',
              dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
              passportNumber: 'P1234567',
              passportIssueDate: new Date('2020-01-01T00:00:00.000Z'),
              passportExpiryDate: new Date('2030-01-01T00:00:00.000Z'),
              arrivalFlight: 'RJ100',
              departureFlight: 'RJ101',
              entryPoint: 'QAIA',
            },
          ],
          days: [
            { dayNumber: 1, title: 'Arrival', notes: 'Arrival and transfer' },
            { dayNumber: 2, title: 'Touring', notes: 'Program day' },
          ],
          services: [
            {
              operationType: 'TRANSPORT',
              serviceType: 'TRANSPORT',
              supplierName: 'Internal Supplier',
              assignedTo: 'Driver Omar',
              guidePhone: '+962700000000',
              vehicle: { name: 'Bus 1234' },
              totalCost: 999,
              totalSell: 1200,
              internalNotes: 'hidden supplier cost',
            },
          ],
        };
      },
      findMany: async ({ where }: any) => {
        assert.equal(where.quote, undefined);
        return [
          {
            id: '11111111-1111-4111-8111-111111111111',
            bookingRef: 'BK-DMC-MOB',
            clientCompanyId: 'client-company-1',
            status: 'in_progress',
            startDate: new Date('2026-10-01T00:00:00.000Z'),
            endDate: new Date('2026-10-03T00:00:00.000Z'),
            pax: 2,
            adults: 2,
            children: 0,
            roomCount: 1,
            snapshotJson: { title: 'Client booking' },
            passengers: [{ passportNumber: 'P1234567', passportExpiryDate: new Date('2030-01-01T00:00:00.000Z') }],
            days: [
              {
                id: 'day-1',
                dayNumber: 1,
                date: new Date('2026-10-01T00:00:00.000Z'),
                title: 'Arrival',
                notes: 'Arrival',
                status: 'PENDING',
                services: [
                  {
                    id: 'service-1',
                    bookingDayId: 'day-1',
                    serviceType: 'TRANSPORT',
                    operationType: 'TRANSPORT',
                    operationStatus: 'CONFIRMED',
                    supplierId: 'supplier-1',
                    supplierName: 'Internal Supplier',
                    assignedTo: 'Driver Omar',
                    guidePhone: '+962700000000',
                    pickupTime: '09:00',
                    notes: 'Internal note',
                    totalCost: 999,
                    totalSell: 1200,
                    vouchers: [{ id: 'voucher-1', status: 'DRAFT', type: 'TRANSPORT' }],
                  },
                ],
              },
            ],
          },
        ];
      },
    },
  });
  const lines = capturePdfText(service);

  const guarantee = await service.generateGuaranteeLetterPdf('11111111-1111-4111-8111-111111111111', { companyId: 'dmc-company-1' });
  const mobile = await service.getOperationsMobileData({ actor: { companyId: 'dmc-company-1' }, date: '2026-10-01' });
  const mobileText = JSON.stringify(mobile);
  const guaranteeText = lines.join('\n');

  assert.ok(Buffer.isBuffer(guarantee));
  assert.match(guaranteeText, /Lina Haddad/);
  assert.doesNotMatch(guaranteeText, /999|1200|margin|pricing/i);
  assert.equal(mobile.bookings[0].passengerSummary.maskedPassportSamples[0].passportNumberMasked, '****4567');
  assert.doesNotMatch(mobileText, /P1234567/);
  assert.doesNotMatch(mobileText, /999|1200|totalCost|totalSell|margin/i);
});

test('booking-side DMC operations still require authentication context', async () => {
  const service = createService({
    booking: {
      findFirst: async () => ({ id: '11111111-1111-4111-8111-111111111111' }),
    },
    bookingDay: {
      findFirst: async () => ({ id: 'day-1', bookingId: '11111111-1111-4111-8111-111111111111', booking: { adults: 1, children: 0 } }),
    },
    bookingService: {
      findFirst: async () => ({ id: 'service-1', bookingId: '11111111-1111-4111-8111-111111111111' }),
    },
    $transaction: async (callback: any) =>
      callback({
        booking: {
          findFirst: async () => ({ id: '11111111-1111-4111-8111-111111111111' }),
        },
      }),
  });

  await assert.rejects(() => service.findOne('11111111-1111-4111-8111-111111111111', undefined), /Company context is required/);
  await assert.rejects(
    () =>
      service.createPassenger('11111111-1111-4111-8111-111111111111', {
        fullName: 'Lina Haddad',
        nationality: 'Jordanian',
        passportNumber: 'P1234567',
        passportExpiryDate: '2030-01-01',
      }),
    /Company context is required/,
  );
  await assert.rejects(
    () => service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', { type: 'GUIDE', assignedTo: 'Guide Lina' }),
    /Company context is required/,
  );
  await assert.rejects(() => service.exportPassengerManifestExcel('11111111-1111-4111-8111-111111111111', undefined), /Company context is required/);
  await assert.rejects(() => service.generateGuaranteeLetterPdf('11111111-1111-4111-8111-111111111111', undefined), /Company context is required/);
  await assert.rejects(
    () => service.createServiceVoucher('11111111-1111-4111-8111-111111111111', 'service-1', { companyActor: undefined }),
    /Company context is required/,
  );
});

test('end-to-end operations workflow keeps field data scoped and client-safe', async () => {
  const booking: any = {
    id: '11111111-1111-4111-8111-111111111111',
    bookingRef: 'BK-E2E-1',
    status: 'in_progress',
    startDate: new Date('2026-04-27T00:00:00.000Z'),
    endDate: new Date('2026-04-29T00:00:00.000Z'),
    pax: 2,
    adults: 2,
    children: 0,
    roomCount: 1,
    nightCount: 2,
    snapshotJson: {
      title: 'Jordan Field Operations',
      travelStartDate: '2026-04-27T00:00:00.000Z',
      itineraries: [
        { id: 'day-1', dayNumber: 1, title: 'Arrival', description: 'Arrival and transfer' },
        { id: 'day-2', dayNumber: 2, title: 'Petra', description: 'Petra touring' },
      ],
    },
    clientSnapshotJson: { name: 'Client Co' },
    contactSnapshotJson: { firstName: 'Lina', lastName: 'Haddad', email: 'lina@example.test' },
    brandSnapshotJson: { name: 'DMC Ops' },
    quote: {
      title: 'Jordan Quote',
      clientCompany: { id: 'company-1', name: 'Client Co' },
      brandCompany: { name: 'DMC Ops', branding: null },
      contact: { firstName: 'Lina', lastName: 'Haddad', email: 'lina@example.test' },
    },
    passengers: [],
    days: [
      { id: 'day-1', bookingId: '11111111-1111-4111-8111-111111111111', dayNumber: 1, date: new Date('2026-04-27T00:00:00.000Z'), title: 'Arrival', notes: 'Meet and assist', status: 'PENDING', services: [] },
      { id: 'day-2', bookingId: '11111111-1111-4111-8111-111111111111', dayNumber: 2, date: new Date('2026-04-28T00:00:00.000Z'), title: 'Petra', notes: 'Full-day touring', status: 'PENDING', services: [] },
    ],
    services: [],
  };
  const suppliers: Record<string, any> = {
    'supplier-transport': { id: 'supplier-transport', name: 'Amman Transport', type: 'transport' },
    'supplier-guide': { id: 'supplier-guide', name: 'Jordan Guides', type: 'guide' },
    'supplier-hotel': { id: 'supplier-hotel', name: 'Petra Hotel', type: 'hotel' },
  };
  const vehicles: Record<string, any> = {
    'vehicle-1': { id: 'vehicle-1', name: 'Mercedes Vito', supplierId: 'supplier-transport' },
  };
  const routes: Record<string, any> = {
    'route-1': { id: 'route-1', name: 'QAIA to Petra' },
  };
  const vouchers: any[] = [];
  let serviceSequence = 0;

  const prisma: any = {
    $transaction: async (callback: any) => callback(prisma),
    booking: {
      findFirst: async ({ where }: any) => {
        const scopedCompanyId = where?.quote?.clientCompanyId;
        return !scopedCompanyId || scopedCompanyId === 'company-1' ? booking : null;
      },
      findMany: async ({ where }: any) => {
        const scopedCompanyId = where?.quote?.clientCompanyId;
        return !scopedCompanyId || scopedCompanyId === 'company-1' ? [booking] : [];
      },
    },
    bookingDay: {
      findFirst: async ({ where }: any) => {
        const day = booking.days.find((entry: any) => entry.id === where.id && entry.bookingId === where.bookingId);
        return day ? { ...day, booking: { id: booking.id, adults: booking.adults, children: booking.children } } : null;
      },
    },
    bookingPassenger: {
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: any) => {
        const passenger = { id: `passenger-${booking.passengers.length + 1}`, createdAt: new Date(), ...data };
        booking.passengers.push(passenger);
        return passenger;
      },
    },
    bookingService: {
      count: async () => booking.services.length,
      create: async ({ data }: any) => {
        const service = {
          id: `service-${++serviceSequence}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          vouchers: [],
          ...data,
        };
        booking.services.push(service);
        booking.days.find((day: any) => day.id === service.bookingDayId)?.services.push(service);
        return { ...service, supplier: suppliers[service.supplierId] || null, vehicle: vehicles[service.vehicleId] || null, bookingDay: booking.days.find((day: any) => day.id === service.bookingDayId) };
      },
      findFirst: async ({ where }: any) => {
        const service = booking.services.find((entry: any) => entry.id === where.id && (!where.bookingId || entry.bookingId === where.bookingId));
        if (!service) return null;
        return { ...service, supplier: suppliers[service.supplierId] || null, vehicle: vehicles[service.vehicleId] || null, bookingDay: booking.days.find((day: any) => day.id === service.bookingDayId), booking };
      },
      findMany: async ({ where }: any = {}) => {
        let rows = booking.services;
        const serializedWhere = JSON.stringify(where || {});
        if (serializedWhere.includes('PENDING')) {
          rows = rows.filter((service: any) => service.operationStatus === 'PENDING');
        } else if (serializedWhere.includes('"not":"CONFIRMED"')) {
          rows = rows.filter((service: any) => service.operationStatus !== 'CONFIRMED');
        } else if (serializedWhere.includes('"operationType":"TRANSPORT"')) {
          rows = rows.filter((service: any) => service.operationType === 'TRANSPORT');
        }
        return rows.map((service: any) => ({ ...service, booking }));
      },
      update: async ({ where, data }: any) => {
        const index = booking.services.findIndex((entry: any) => entry.id === where.id);
        booking.services[index] = { ...booking.services[index], ...data };
        const day = booking.days.find((entry: any) => entry.id === booking.services[index].bookingDayId);
        const dayIndex = day.services.findIndex((entry: any) => entry.id === where.id);
        day.services[dayIndex] = booking.services[index];
        return { ...booking.services[index], supplier: suppliers[booking.services[index].supplierId] || null, vehicle: vehicles[booking.services[index].vehicleId] || null, bookingDay: day };
      },
    },
    bookingAuditLog: {
      create: async () => ({}),
    },
    route: {
      findUnique: async ({ where }: any) => routes[where.id] || null,
    },
    vehicle: {
      findUnique: async ({ where }: any) => vehicles[where.id] || null,
    },
    supplier: {
      findUnique: async ({ where }: any) => suppliers[where.id] || null,
    },
    voucher: {
      create: async ({ data }: any) => {
        const voucher = {
          id: `voucher-${vouchers.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          issuedAt: null,
          ...data,
          supplier: suppliers[data.supplierId],
          bookingService: booking.services.find((service: any) => service.id === data.bookingServiceId),
        };
        vouchers.push(voucher);
        voucher.bookingService.vouchers.push({ id: voucher.id, status: voucher.status, type: voucher.type });
        return voucher;
      },
      findFirst: async ({ where }: any) => {
        const voucher = vouchers.find((entry) => entry.id === where.id);
        if (!voucher) return null;
        return {
          ...voucher,
          booking,
          supplier: suppliers[voucher.supplierId],
          bookingService: {
            ...booking.services.find((service: any) => service.id === voucher.bookingServiceId),
            bookingDay: booking.days.find((day: any) => day.id === voucher.bookingService.bookingDayId),
            vehicle: vehicles[voucher.bookingService.vehicleId] || null,
          },
        };
      },
    },
  };
  const service = createService(prisma);
  const pdfLines = capturePdfText(service);

  await service.createPassenger('11111111-1111-4111-8111-111111111111', {
    fullName: 'Lina Haddad',
    firstName: 'Lina',
    lastName: 'Haddad',
    nationality: 'Jordanian',
    passportNumber: 'P1234567',
    passportExpiryDate: '2030-01-01',
    arrivalFlight: 'RJ101',
    entryPoint: 'QAIA',
    companyActor: { companyId: 'company-1' },
  });
  await service.createPassenger('11111111-1111-4111-8111-111111111111', {
    fullName: 'Omar Haddad',
    firstName: 'Omar',
    lastName: 'Haddad',
    nationality: 'Jordanian',
    passportNumber: 'P7654321',
    passportExpiryDate: '2030-01-01',
    companyActor: { companyId: 'company-1' },
  });

  const manifest = await service.exportPassengerManifestExcel('11111111-1111-4111-8111-111111111111', { companyId: 'company-1' });
  const manifestRows = XLSX.utils.sheet_to_json(XLSX.read(manifest.buffer).Sheets['Passenger Manifest']) as any[];
  assert.equal(manifestRows.length, 2);
  assert.equal(manifestRows[0]['Passport Number'], 'P1234567');

  const transport = await service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
    type: 'TRANSPORT',
    referenceId: 'route-1',
    vehicleId: 'vehicle-1',
    pickupTime: '09:00',
    assignedTo: 'Omar Driver',
    guidePhone: '+962700000000',
    status: 'REQUESTED',
    notes: 'Airport pickup',
    companyActor: { companyId: 'company-1' },
  });
  const guide = await service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-2', {
    type: 'GUIDE',
    supplierId: 'supplier-guide',
    assignedTo: 'Nadia Guide',
    guidePhone: '+962711111111',
    status: 'REQUESTED',
    notes: 'English guide',
    companyActor: { companyId: 'company-1' },
  });
  const hotel = await service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
    type: 'HOTEL',
    supplierId: 'supplier-hotel',
    confirmationNumber: 'PETRA-123',
    status: 'CONFIRMED',
    notes: 'One double room',
    companyActor: { companyId: 'company-1' },
  });

  await service.createServiceVoucher('11111111-1111-4111-8111-111111111111', transport.id, { companyActor: { companyId: 'company-1' } });
  await service.createServiceVoucher('11111111-1111-4111-8111-111111111111', guide.id, { companyActor: { companyId: 'company-1' } });
  await service.createServiceVoucher('11111111-1111-4111-8111-111111111111', hotel.id, { companyActor: { companyId: 'company-1' } });
  assert.equal(vouchers.length, 3);

  const guarantee = await service.generateGuaranteeLetterPdf('11111111-1111-4111-8111-111111111111', { companyId: 'company-1' });
  assert.match(guarantee.toString(), /Lina Haddad/);
  assert.match(guarantee.toString(), /Omar Driver/);
  assert.doesNotMatch(guarantee.toString(), /margin|totalSell|totalCost/i);

  const dashboard = await service.getOperationsDashboard({ actor: { companyId: 'company-1' }, date: '2026-04-27' });
  assert.equal(dashboard.todayArrivals.count, 1);
  assert.equal(dashboard.pendingServices.count, 0);
  assert.equal(dashboard.missingPassengers.count, 0);
  assert.equal(dashboard.upcomingBorderCrossings.count, 1);

  const mobile = await service.getOperationsMobileData({ actor: { companyId: 'company-1' }, date: '2026-04-27' });
  assert.equal(mobile.bookings[0].days[0].services.length, 2);
  assert.equal(mobile.bookings[0].passengerSummary.manifestStatus, 'complete');
  assert.equal(mobile.bookings[0].passengerSummary.maskedPassportSamples[0].passportNumberMasked, '****4567');
  assert.doesNotMatch(JSON.stringify(mobile), /P1234567|P7654321|totalCost|totalSell|margin/i);
  assert.equal(mobile.bookings[0].days[0].services[0].vouchers[0].id, 'voucher-1');

  const updatedTransport = await service.updateBookingService('11111111-1111-4111-8111-111111111111', 'day-1', transport.id, {
    type: 'TRANSPORT',
    referenceId: 'route-1',
    vehicleId: 'vehicle-1',
    pickupTime: '09:15',
    assignedTo: 'Omar Driver',
    guidePhone: '+962700000000',
    status: 'DONE',
    notes: 'Guest boarded vehicle',
    companyActor: { companyId: 'company-1' },
  });
  assert.equal(updatedTransport.operationStatus, 'DONE');
  assert.equal(updatedTransport.notes, 'Guest boarded vehicle');

  const proposal = mapQuoteToProposalV3({
    id: 'quote-1',
    quoteNumber: 'Q-1',
    quoteCurrency: 'USD',
    title: 'Client Proposal',
    description: 'Client-safe proposal',
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    travelStartDate: new Date('2026-04-27T00:00:00.000Z'),
    nightCount: 2,
    adults: 2,
    children: 0,
    totalCost: 900,
    totalSell: 1200,
    pricePerPax: 600,
    quoteOptions: [],
    itineraries: [{ dayNumber: 1, title: 'Arrival', description: 'Welcome to Jordan' }],
    quoteItems: [],
    passengers: booking.passengers,
  } as any);
  const proposalText = JSON.stringify(proposal);
  assert.doesNotMatch(proposalText, /P1234567|P7654321|passport|supplier|internal/i);
  assert.ok(pdfLines.length > 0);
});

test('proposal export view model does not leak booking passenger passport data', () => {
  const proposal = mapQuoteToProposalV3({
    id: 'quote-1',
    quoteNumber: 'Q-2026-0001',
    quoteCurrency: 'USD',
    title: 'Client Proposal',
    description: 'Public proposal',
    createdAt: new Date('2026-04-27T00:00:00.000Z'),
    travelStartDate: new Date('2026-10-01T00:00:00.000Z'),
    nightCount: 1,
    adults: 1,
    children: 0,
    totalCost: 100,
    totalSell: 120,
    pricePerPax: 120,
    quoteOptions: [],
    itineraries: [],
    quoteItems: [],
    passengers: [{ fullName: 'Lina Haddad', passportNumber: 'P1234567' }],
  } as any);
  const renderedText = JSON.stringify(proposal);

  assert.doesNotMatch(renderedText, /P1234567/);
  assert.doesNotMatch(renderedText, /passport/i);
});

test('create update and delete booking service assignment rows', async () => {
  const createdRows: any[] = [];
  const updatedRows: any[] = [];
  const deletedIds: string[] = [];
  const service = createService({
    bookingDay: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.booking?.quote, undefined);
        return {
          id: 'day-1',
          bookingId: '11111111-1111-4111-8111-111111111111',
          date: new Date('2026-10-01T00:00:00.000Z'),
          booking: { id: '11111111-1111-4111-8111-111111111111', adults: 2, children: 1 },
        };
      },
    },
    bookingService: {
      count: async () => 0,
      findFirst: async () => ({
        id: 'service-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        bookingDayId: 'day-1',
        operationType: 'GUIDE',
        operationStatus: 'PENDING',
        serviceType: 'GUIDE',
        description: 'Guide: Samir',
        notes: null,
        supplierId: null,
        supplierName: null,
        vehicleId: null,
        vehicle: null,
        referenceId: null,
        assignedTo: 'Samir',
        guidePhone: null,
        pickupTime: null,
        confirmationNumber: null,
      }),
    },
    supplier: {
      findUnique: async () => null,
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          create: async ({ data }: any) => {
            createdRows.push(data);
            return { id: 'service-1', ...data };
          },
          update: async ({ data }: any) => {
            updatedRows.push(data);
            return { id: 'service-1', ...data };
          },
          delete: async ({ where }: any) => {
            deletedIds.push(where.id);
            return { id: where.id };
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const created = await service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
    type: 'GUIDE',
    assignedTo: 'Samir',
    guidePhone: '+962700000000',
    status: 'REQUESTED',
    notes: 'Arabic speaking guide',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(created.operationType, 'GUIDE');
  assert.equal(created.operationStatus, 'REQUESTED');
  assert.equal(created.assignedTo, 'Samir');
  assert.equal(created.guidePhone, '+962700000000');
  assert.equal(created.status, 'in_progress');
  assert.equal(created.confirmationStatus, 'requested');
  assert.equal(createdRows[0].participantCount, 3);

  const updated = await service.updateBookingService('11111111-1111-4111-8111-111111111111', 'day-1', 'service-1', {
    type: 'GUIDE',
    assignedTo: 'Nadia',
    status: 'CONFIRMED',
    notes: 'Met group in lobby',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(updated.assignedTo, 'Nadia');
  assert.equal(updated.operationStatus, 'CONFIRMED');
  assert.equal(updated.notes, 'Met group in lobby');
  assert.equal(updated.status, 'confirmed');
  assert.equal(updatedRows[0].confirmationStatus, 'confirmed');

  const deleted = await service.deleteBookingService('11111111-1111-4111-8111-111111111111', 'day-1', 'service-1', undefined, { companyId: 'company-1' });

  assert.deepEqual(deleted, { id: 'service-1', deleted: true });
  assert.deepEqual(deletedIds, ['service-1']);
});

test('transport booking service uses route and vehicle catalog and saves vehicle supplier', async () => {
  const service = createService({
    bookingDay: {
      findFirst: async () => ({
        id: 'day-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        date: new Date('2026-10-01T00:00:00.000Z'),
        booking: { id: '11111111-1111-4111-8111-111111111111', adults: 2, children: 0 },
      }),
    },
    bookingService: {
      count: async () => 0,
    },
    route: {
      findUnique: async ({ where }: any) => {
        assert.equal(where.id, 'route-1');
        return { id: 'route-1', name: 'QAIA to Amman' };
      },
    },
    vehicle: {
      findUnique: async ({ where }: any) => {
        assert.equal(where.id, 'vehicle-1');
        return { id: 'vehicle-1', name: 'Mercedes Vito', supplierId: 'supplier-transport' };
      },
    },
    supplier: {
      findUnique: async ({ where }: any) => {
        assert.equal(where.id, 'supplier-transport');
        return { id: 'supplier-transport', name: 'Desert Transport' };
      },
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          create: async ({ data }: any) => ({ id: 'service-transport', ...data }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const created = await service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
    type: 'TRANSPORT',
    referenceId: 'route-1',
    vehicleId: 'vehicle-1',
    assignedTo: 'Driver Ali',
    pickupTime: '09:30',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(created.referenceId, 'route-1');
  assert.equal(created.vehicleId, 'vehicle-1');
  assert.equal(created.supplierId, 'supplier-transport');
  assert.equal(created.supplierName, 'Desert Transport');
  assert.equal(created.pickupTime, '09:30');
  assert.match(created.description, /QAIA to Amman/);
});

test('DMC booking operations assign transport supplier and voucher across actor client and supplier companies', async () => {
  const seen: Record<string, any[]> = {
    bookingDay: [],
    bookingService: [],
    route: [],
    vehicle: [],
    supplier: [],
    voucher: [],
  };
  const createdRows: any[] = [];
  const updatedRows: any[] = [];
  const vouchers: any[] = [];
  const service = createService({
    bookingDay: {
      findFirst: async ({ where }: any) => {
        seen.bookingDay.push(where);
        return {
          id: 'day-1',
          bookingId: '11111111-1111-4111-8111-111111111111',
          date: new Date('2026-10-01T00:00:00.000Z'),
          booking: {
            id: '11111111-1111-4111-8111-111111111111',
            clientCompanyId: 'client-company-1',
            adults: 3,
            children: 1,
          },
        };
      },
    },
    bookingService: {
      count: async ({ where }: any) => {
        seen.bookingService.push(where);
        return createdRows.length;
      },
      findFirst: async ({ where }: any) => {
        seen.bookingService.push(where);
        return {
          id: 'service-transport',
          bookingId: '11111111-1111-4111-8111-111111111111',
          bookingDayId: 'day-1',
          serviceType: 'TRANSPORT',
          operationType: 'TRANSPORT',
          operationStatus: 'CONFIRMED',
          referenceId: 'route-1',
          assignedTo: 'Driver Ali',
          guidePhone: null,
          vehicleId: 'vehicle-1',
          pickupTime: '09:30',
          supplierId: 'supplier-company-1',
          supplierName: 'Independent Transport Supplier',
          confirmationNumber: null,
          supplierReference: null,
          notes: 'Arrival pickup',
          description: 'QAIA to Petra with Driver Ali',
          bookingDay: { id: 'day-1', dayNumber: 1, date: new Date('2026-10-01T00:00:00.000Z') },
          supplier: { id: 'supplier-company-1', name: 'Independent Transport Supplier' },
          vehicle: { id: 'vehicle-1', name: 'Mercedes Vito', supplierId: 'supplier-company-1' },
        };
      },
    },
    route: {
      findUnique: async ({ where }: any) => {
        seen.route.push(where);
        return { id: 'route-1', name: 'QAIA to Petra' };
      },
    },
    vehicle: {
      findUnique: async ({ where }: any) => {
        seen.vehicle.push(where);
        return { id: 'vehicle-1', name: 'Mercedes Vito', supplierId: 'supplier-company-1' };
      },
    },
    supplier: {
      findUnique: async ({ where }: any) => {
        seen.supplier.push(where);
        return { id: where.id, name: 'Independent Transport Supplier' };
      },
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          create: async ({ data }: any) => {
            createdRows.push(data);
            return {
              id: 'service-transport',
              ...data,
              supplier: { id: data.supplierId, name: data.supplierName },
              vehicle: { id: data.vehicleId, name: 'Mercedes Vito', supplierId: data.supplierId },
              bookingDay: { id: data.bookingDayId },
            };
          },
          update: async ({ data }: any) => {
            updatedRows.push(data);
            return {
              id: 'service-transport',
              bookingId: '11111111-1111-4111-8111-111111111111',
              bookingDayId: 'day-1',
              ...data,
              supplier: { id: data.supplierId, name: data.supplierName },
              vehicle: { id: data.vehicleId, name: 'Mercedes Vito', supplierId: data.supplierId },
              bookingDay: { id: 'day-1' },
            };
          },
        },
        voucher: {
          create: async ({ data }: any) => {
            const voucher = {
              id: 'voucher-transport',
              ...data,
              supplier: { id: data.supplierId, name: 'Independent Transport Supplier' },
              bookingService: {
                id: data.bookingServiceId,
                bookingDay: { id: 'day-1' },
                vehicle: { id: 'vehicle-1', name: 'Mercedes Vito', supplierId: data.supplierId },
              },
            };
            vouchers.push(voucher);
            return voucher;
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const created = await service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
    type: 'TRANSPORT',
    referenceId: 'route-1',
    vehicleId: 'vehicle-1',
    assignedTo: 'Driver Ali',
    pickupTime: '09:30',
    status: 'REQUESTED',
    companyActor: { companyId: 'dmc-company-1' },
  });
  const updated = await service.updateBookingService('11111111-1111-4111-8111-111111111111', 'day-1', 'service-transport', {
    type: 'TRANSPORT',
    referenceId: 'route-1',
    vehicleId: 'vehicle-1',
    assignedTo: 'Driver Omar',
    pickupTime: '10:00',
    status: 'CONFIRMED',
    companyActor: { companyId: 'dmc-company-1' },
  });
  const voucher = await service.createServiceVoucher('11111111-1111-4111-8111-111111111111', 'service-transport', {
    companyActor: { companyId: 'dmc-company-1' },
  });

  assert.equal(created.supplierId, 'supplier-company-1');
  assert.equal(updated.supplierId, 'supplier-company-1');
  assert.equal(updated.assignedTo, 'Driver Omar');
  assert.equal(voucher.supplierId, 'supplier-company-1');
  assert.equal(voucher.type, 'TRANSPORT');
  assert.equal(vouchers.length, 1);
  assert.ok(createdRows.some((row) => row.bookingId === '11111111-1111-4111-8111-111111111111' && row.supplierId === 'supplier-company-1'));
  assert.ok(updatedRows.some((row) => row.supplierId === 'supplier-company-1'));

  const allWheres = Object.values(seen).flat();
  assert.ok(allWheres.every((where) => where.companyId === undefined && where.clientCompanyId === undefined));
  assert.ok(allWheres.every((where) => where.booking?.quote?.clientCompanyId === undefined));
  assert.deepEqual(seen.route[0], { id: 'route-1' });
  assert.deepEqual(seen.vehicle[0], { id: 'vehicle-1' });
  assert.deepEqual(seen.supplier[0], { id: 'supplier-company-1' });
});

test('DMC booking operations assign activity service and generate supplier voucher across companies', async () => {
  const seenWheres: any[] = [];
  const vouchers: any[] = [];
  const service = createService({
    bookingDay: {
      findFirst: async ({ where }: any) => {
        seenWheres.push(where);
        return {
          id: 'day-1',
          bookingId: '11111111-1111-4111-8111-111111111111',
          dayNumber: 1,
          title: 'Petra touring',
          date: new Date('2026-10-01T00:00:00.000Z'),
          booking: {
            id: '11111111-1111-4111-8111-111111111111',
            clientCompanyId: 'client-company-1',
            adults: 3,
            children: 1,
          },
        };
      },
    },
    bookingService: {
      count: async () => 0,
      findFirst: async ({ where }: any) => {
        seenWheres.push(where);
        return {
          id: 'service-activity',
          bookingId: '11111111-1111-4111-8111-111111111111',
          bookingDayId: 'day-1',
          serviceType: 'ACTIVITY',
          operationType: 'ACTIVITY',
          operationStatus: 'CONFIRMED',
          serviceDate: new Date('2026-10-01T00:00:00.000Z'),
          referenceId: null,
          assignedTo: null,
          guidePhone: null,
          vehicleId: null,
          pickupTime: null,
          supplierId: 'supplier-activity-1',
          supplierName: 'Petra Experiences Supplier',
          confirmationNumber: null,
          supplierReference: null,
          notes: 'Petra by Night confirmed',
          description: 'Petra by Night',
          participantCount: 4,
          adultCount: 3,
          childCount: 1,
          bookingDay: { id: 'day-1', dayNumber: 1, title: 'Petra touring', date: new Date('2026-10-01T00:00:00.000Z') },
          supplier: { id: 'supplier-activity-1', name: 'Petra Experiences Supplier' },
          vehicle: null,
        };
      },
    },
    supplier: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: 'Petra Experiences Supplier' }),
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          create: async ({ data }: any) => ({
            id: 'service-activity',
            ...data,
            supplier: { id: data.supplierId, name: data.supplierName },
            bookingDay: { id: data.bookingDayId },
          }),
          update: async ({ data }: any) => ({
            id: 'service-activity',
            bookingId: '11111111-1111-4111-8111-111111111111',
            bookingDayId: 'day-1',
            ...data,
            supplier: { id: data.supplierId, name: data.supplierName },
            bookingDay: { id: 'day-1' },
          }),
        },
        voucher: {
          create: async ({ data }: any) => {
            const voucher = {
              id: 'voucher-activity',
              ...data,
              supplier: { id: data.supplierId, name: 'Petra Experiences Supplier' },
              bookingService: {
                id: data.bookingServiceId,
                bookingDay: { id: 'day-1' },
                vehicle: null,
              },
            };
            vouchers.push(voucher);
            return voucher;
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const created = await service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
    type: 'ACTIVITY',
    supplierId: 'supplier-activity-1',
    notes: 'Petra by Night',
    status: 'CONFIRMED',
    companyActor: { companyId: 'dmc-company-1' },
  });
  const voucher = await service.createServiceVoucher('11111111-1111-4111-8111-111111111111', 'service-activity', {
    companyActor: { companyId: 'dmc-company-1' },
  });

  assert.equal(created.supplierId, 'supplier-activity-1');
  assert.equal(created.operationType, 'ACTIVITY');
  assert.equal(voucher.type, 'ACTIVITY');
  assert.equal(voucher.supplierId, 'supplier-activity-1');
  assert.equal(vouchers.length, 1);
  assert.ok(seenWheres.every((where) => where.companyId === undefined && where.clientCompanyId === undefined));
  assert.ok(seenWheres.every((where) => where.booking?.quote?.clientCompanyId === undefined));
});

test('dining operation rows generate a RESTAURANT voucher (not a generic SERVICE voucher)', async () => {
  const vouchers: any[] = [];
  const service = createService({
    bookingService: {
      findFirst: async () => ({
        id: 'service-dining',
        bookingId: '11111111-1111-4111-8111-111111111111',
        bookingDayId: 'day-1',
        serviceType: 'DINING',
        operationType: 'DINING',
        operationStatus: 'CONFIRMED',
        serviceDate: new Date('2026-10-02T00:00:00.000Z'),
        supplierId: 'restaurant-supplier-1',
        supplierName: 'Haret Jdoudna',
        restaurantId: 'restaurant-1',
        mealTiming: '19:30',
        mealSeatingNotes: 'Garden terrace',
        mealDietaryRequirements: ['2 vegetarian'],
        participantCount: 4,
        confirmationNumber: 'RES-9001',
        description: 'Dinner at Haret Jdoudna',
        bookingDay: { id: 'day-1', dayNumber: 2, title: 'Madaba', date: new Date('2026-10-02T00:00:00.000Z') },
        supplier: { id: 'restaurant-supplier-1', name: 'Haret Jdoudna' },
        restaurant: { id: 'restaurant-1', name: 'Haret Jdoudna', cuisineType: 'Jordanian', city: 'Madaba', phone: '+962790000000' },
        vehicle: null,
      }),
    },
    supplier: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: 'Haret Jdoudna' }),
    },
    $transaction: async (callback: any) =>
      callback({
        voucher: {
          create: async ({ data }: any) => {
            const voucher = {
              id: 'voucher-dining',
              ...data,
              supplier: { id: data.supplierId, name: 'Haret Jdoudna' },
              bookingService: { id: data.bookingServiceId, bookingDay: { id: 'day-1' }, vehicle: null },
            };
            vouchers.push(voucher);
            return voucher;
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const voucher = await service.createServiceVoucher('11111111-1111-4111-8111-111111111111', 'service-dining', {
    companyActor: { companyId: 'dmc-company-1' },
  });

  assert.equal(voucher.type, 'RESTAURANT');
  assert.equal(vouchers.length, 1);
});

test('hotel confirmation and external package operations services persist constrained fields', async () => {
  const createdRows: any[] = [];
  const service = createService({
    bookingDay: {
      findFirst: async () => ({
        id: 'day-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        date: new Date('2026-10-01T00:00:00.000Z'),
        booking: { id: '11111111-1111-4111-8111-111111111111', adults: 2, children: 0 },
      }),
    },
    bookingService: {
      count: async () => 0,
      findFirst: async () => ({
        id: 'service-external',
        bookingId: '11111111-1111-4111-8111-111111111111',
        bookingDayId: 'day-1',
        operationType: 'EXTERNAL_PACKAGE',
        operationStatus: 'PENDING',
        serviceType: 'EXTERNAL_PACKAGE',
        description: 'External package operations',
        notes: null,
      }),
    },
    supplier: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: 'Hotel Supplier' }),
    },
    $transaction: async (callback: any) =>
      callback({
        bookingService: {
          create: async ({ data }: any) => {
            createdRows.push(data);
            return { id: `service-${createdRows.length}`, ...data };
          },
          update: async ({ data }: any) => ({ id: 'service-external', ...data }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const hotel = await service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
    type: 'HOTEL',
    supplierId: 'supplier-hotel',
    confirmationNumber: 'CN-7788',
    notes: 'Twin rooms confirmed',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(hotel.operationType, 'HOTEL');
  assert.equal(hotel.supplierId, 'supplier-hotel');
  assert.equal(hotel.confirmationNumber, 'CN-7788');

  const external = await service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
    type: 'EXTERNAL_PACKAGE',
    supplierId: 'should-be-ignored',
    assignedTo: 'should be ignored',
    notes: 'Partner package checked',
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(external.operationType, 'EXTERNAL_PACKAGE');
  assert.equal(external.supplierId, null);
  assert.equal(external.assignedTo, null);
  assert.equal(external.notes, 'Partner package checked');

  await assert.rejects(
    () =>
      service.updateBookingService('11111111-1111-4111-8111-111111111111', 'day-1', 'service-external', {
        type: 'TRANSPORT',
        companyActor: { companyId: 'company-1' },
      }),
    /external package.*status and notes/i,
  );
});

test('booking operation service status validation keeps booking-day lookup DMC scoped', async () => {
  const service = createService({
    bookingDay: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.booking?.quote, undefined);
        return null;
      },
    },
  });

  await assert.rejects(
    () =>
      service.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
        type: 'GUIDE',
        assignedTo: 'Samir',
        status: 'BROKEN',
        companyActor: { companyId: 'company-b' },
      }),
    /booking day not found/i,
  );

  const validationService = createService({
    bookingDay: {
      findFirst: async () => ({
        id: 'day-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        date: null,
        booking: { id: '11111111-1111-4111-8111-111111111111', adults: 1, children: 0 },
      }),
    },
  });

  await assert.rejects(
    () =>
      validationService.createBookingService('11111111-1111-4111-8111-111111111111', 'day-1', {
        type: 'GUIDE',
        assignedTo: 'Samir',
        status: 'BROKEN',
        companyActor: { companyId: 'company-1' },
      }),
    /unsupported booking service status/i,
  );
});

test('guarantee letter PDF contains booking passenger transport and guide data without pricing', async () => {
  const service = createService({
    booking: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.id, '11111111-1111-4111-8111-111111111111');
        assert.equal(where.quote, undefined);
        return {
          id: '11111111-1111-4111-8111-111111111111',
          bookingRef: 'BK-GL-001',
          pax: 2,
          adults: 2,
          children: 0,
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2026-10-05T00:00:00.000Z'),
          snapshotJson: { title: 'Jordan Guarantee Trip' },
          brandSnapshotJson: { name: 'DMC Jordan', city: 'Amman', country: 'Jordan' },
          quote: {
            clientCompany: { name: 'Client Co' },
            brandCompany: {
              name: 'DMC Jordan',
              website: 'https://dmc.example',
              branding: { email: 'ops@dmc.example', phone: '+9626000000' },
            },
            contact: { firstName: 'Rana', lastName: 'Ops' },
          },
          passengers: [
            {
              fullName: 'Lina Haddad',
              firstName: 'Lina',
              lastName: 'Haddad',
              nationality: 'Jordanian',
              dateOfBirth: new Date('1990-02-03T00:00:00.000Z'),
              passportNumber: 'P1234567',
              passportIssueDate: new Date('2024-01-01T00:00:00.000Z'),
              passportExpiryDate: new Date('2030-01-01T00:00:00.000Z'),
              arrivalFlight: 'RJ101',
              departureFlight: 'RJ102',
              entryPoint: 'QAIA',
            },
          ],
          days: [
            { dayNumber: 1, title: 'Arrival in Amman' },
            { dayNumber: 2, title: 'Petra visit' },
          ],
          services: [
            {
              operationType: 'TRANSPORT',
              serviceType: 'TRANSPORT',
              supplierName: 'Desert Transport',
              assignedTo: 'Driver Ali',
              guidePhone: '+962799999999',
              vehicle: { name: 'Bus 1234' },
              totalCost: 999,
              totalSell: 1200,
            },
            {
              operationType: 'GUIDE',
              serviceType: 'GUIDE',
              assignedTo: 'Guide Samir',
              guidePhone: '+962788888888',
            },
          ],
        };
      },
    },
  });
  capturePdfText(service as any);

  const buffer = await service.generateGuaranteeLetterPdf('11111111-1111-4111-8111-111111111111', { companyId: 'company-1' });
  const text = buffer.toString('utf8');

  assert.match(text, /To whom it may concern/);
  assert.match(text, /Lina Haddad/);
  assert.match(text, /P1234567/);
  assert.match(text, /2026-10-01/);
  assert.match(text, /2026-10-05/);
  assert.match(text, /Desert Transport/);
  assert.match(text, /Driver Ali/);
  assert.match(text, /Bus 1234/);
  assert.match(text, /Guide Samir/);
  assert.match(text, /Day 1: Arrival in Amman/);
  assert.doesNotMatch(text, /totalCost/);
  assert.doesNotMatch(text, /totalSell/);
  assert.doesNotMatch(text, /margin/i);
  assert.doesNotMatch(text, /pricing/i);
});

test('guarantee letter returns not found when booking does not exist', async () => {
  const service = createService({
    booking: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.id, '11111111-1111-4111-8111-111111111111');
        assert.equal(where.quote, undefined);
        return null;
      },
    },
  });

  await assert.rejects(
    () => service.generateGuaranteeLetterPdf('11111111-1111-4111-8111-111111111111', { companyId: 'company-b' }),
    /booking not found/i,
  );
});

test('service voucher generation creates one supplier voucher per transport service', async () => {
  const service = createService({
    bookingService: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.id, 'service-1');
        assert.equal(where.bookingId, '11111111-1111-4111-8111-111111111111');
        return {
          id: 'service-1',
          bookingId: '11111111-1111-4111-8111-111111111111',
          operationType: 'TRANSPORT',
          serviceType: 'TRANSPORT',
          supplierId: 'supplier-1',
          referenceId: 'route-1',
          vehicleId: 'vehicle-1',
          pickupTime: '09:00',
          assignedTo: 'Driver Ali',
          notes: 'Airport pickup',
        };
      },
    },
    $transaction: async (callback: any) =>
      callback({
        voucher: {
          create: async ({ data }: any) => ({ id: 'voucher-1', ...data }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const voucher = await service.createServiceVoucher('11111111-1111-4111-8111-111111111111', 'service-1', {
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(voucher.bookingServiceId, 'service-1');
  assert.equal(voucher.type, 'TRANSPORT');
  assert.equal(voucher.supplierId, 'supplier-1');
  assert.equal(voucher.status, 'DRAFT');
});

test('service voucher generation allows draft vouchers with unresolved supplier text', async () => {
  const service = createService({
    bookingService: {
      findFirst: async () => ({
        id: 'service-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        operationType: 'HOTEL',
        serviceType: 'HOTEL',
        supplierId: null,
        supplierName: 'Default Supplier',
        confirmationNumber: null,
        supplierReference: null,
      }),
    },
    $transaction: async (callback: any) =>
      callback({
        voucher: {
          findUnique: async () => null,
          create: async ({ data }: any) => ({ id: 'voucher-1', ...data }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const voucher = await service.createServiceVoucher('11111111-1111-4111-8111-111111111111', 'service-1', { companyActor: { companyId: 'company-1' } });

  assert.equal(voucher.status, 'DRAFT');
  assert.equal(voucher.supplierId, null);
});

test('excursion service voucher preserves touring route and vehicle context', async () => {
  const service = createService({
    bookingService: {
      findFirst: async () => ({
        id: 'service-1',
        bookingId: '11111111-1111-4111-8111-111111111111',
        operationType: 'ACTIVITY',
        serviceType: 'Excursion',
        supplierId: 'supplier-1',
        serviceDate: new Date('2026-10-02T00:00:00.000Z'),
        touringRouteId: 'touring-route-1',
        touringRoutePricingId: 'touring-pricing-1',
        touringRoute: { name: 'AMM_PET' },
        touringRoutePricing: {
          supplier: { name: 'Petra Operator' },
          vehicle: { name: 'Sedan 2' },
          touringRoute: { name: 'AMM_PET' },
        },
        pickupLocation: 'Amman hotel',
        participantCount: 2,
        notes: 'Petra Full Day',
      }),
    },
    $transaction: async (callback: any) =>
      callback({
        voucher: {
          findUnique: async () => null,
          create: async ({ data }: any) => ({
            id: 'voucher-1',
            ...data,
            bookingService: {
              touringRoute: { name: 'AMM_PET' },
              touringRoutePricing: {
                supplier: { name: 'Petra Operator' },
                vehicle: { name: 'Sedan 2' },
              },
            },
          }),
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const voucher = await service.createServiceVoucher('11111111-1111-4111-8111-111111111111', 'service-1', {
    companyActor: { companyId: 'company-1' },
  });

  assert.equal(voucher.type, 'EXCURSION');
  assert.equal(voucher.bookingService.touringRoute.name, 'AMM_PET');
  assert.equal(voucher.bookingService.touringRoutePricing.vehicle.name, 'Sedan 2');
});

test('service voucher PDF includes supplier-facing fields and no pricing leakage', async () => {
  const service = createService({
    route: {
      findUnique: async () => ({ name: 'QAIA to Dead Sea' }),
    },
    voucher: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.booking?.quote, undefined);
        return {
          id: 'voucher-1',
          type: 'TRANSPORT',
          status: 'DRAFT',
          notes: 'Meet at arrivals',
          supplier: { name: 'Desert Transport' },
          booking: {
            id: '11111111-1111-4111-8111-111111111111',
            bookingRef: 'BK-001',
            pax: 3,
            adults: 2,
            children: 1,
            roomCount: 1,
            startDate: new Date('2026-10-01T00:00:00.000Z'),
            endDate: new Date('2026-10-03T00:00:00.000Z'),
            snapshotJson: { title: 'Client Group' },
            brandSnapshotJson: { name: 'DMC Jordan' },
            clientSnapshotJson: { name: 'Client Co' },
            quote: {
              clientCompany: { name: 'Client Co' },
              brandCompany: { name: 'DMC Jordan', branding: null },
              contact: {},
            },
            passengers: [],
            days: [],
          },
          bookingService: {
            id: 'service-1',
            referenceId: 'route-1',
            description: 'Airport transfer',
            pickupTime: '09:00',
            startTime: null,
            pickupLocation: 'QAIA arrivals',
            meetingPoint: null,
            assignedTo: 'Driver Ali',
            guidePhone: '+962799999999',
            vehicle: { name: 'Van' },
            touringRoute: null,
            touringRoutePricing: null,
            totalCost: 500,
            totalSell: 700,
          },
        };
      },
    },
  });
  capturePdfText(service as any);

  const buffer = await service.generateServiceVoucherPdf('voucher-1', { companyId: 'company-1' });
  const text = buffer.toString('utf8');

  assert.match(text, /Transport Voucher/);
  assert.match(text, /Client Group/);
  assert.match(text, /QAIA to Dead Sea/);
  assert.match(text, /09:00/);
  assert.match(text, /QAIA arrivals/);
  assert.match(text, /Driver Ali/);
  assert.match(text, /Van/);
  assert.doesNotMatch(text, /totalCost/);
  assert.doesNotMatch(text, /totalSell/);
  assert.doesNotMatch(text, /margin/i);
});

test('operational voucher PDF (Phase 2E) renders via loose operational scope with no mutation or pricing leakage', async () => {
  const bookingId = '11111111-1111-4111-8111-111111111111';
  let bookingWhere: any;
  let voucherWhere: any;
  let mutated = false;
  const service = createService({
    route: { findUnique: async () => ({ name: 'QAIA to Dead Sea' }) },
    bookingService: {
      findFirst: async ({ where }: any) => {
        bookingWhere = where;
        return { id: 'service-1' };
      },
      update: async () => {
        mutated = true;
        return {};
      },
    },
    voucher: {
      findUnique: async ({ where }: any) => {
        voucherWhere = where;
        return {
          id: 'voucher-1',
          type: 'TRANSPORT',
          status: 'GENERATED',
          notes: 'Meet at arrivals',
          supplier: { name: 'Desert Transport' },
          booking: {
            id: bookingId,
            bookingRef: 'BK-001',
            pax: 3,
            adults: 2,
            children: 1,
            roomCount: 1,
            startDate: new Date('2026-10-01T00:00:00.000Z'),
            endDate: new Date('2026-10-03T00:00:00.000Z'),
            snapshotJson: { title: 'Client Group' },
            brandSnapshotJson: { name: 'DMC Jordan' },
            clientSnapshotJson: { name: 'Client Co' },
            quote: {
              clientCompany: { name: 'Client Co' },
              brandCompany: { name: 'DMC Jordan', branding: null },
              contact: {},
            },
            passengers: [],
            days: [],
          },
          bookingService: {
            id: 'service-1',
            referenceId: 'route-1',
            description: 'Airport transfer',
            pickupTime: '09:00',
            startTime: null,
            pickupLocation: 'QAIA arrivals',
            meetingPoint: null,
            assignedTo: 'Driver Ali',
            guidePhone: '+962799999999',
            vehicle: { name: 'Van' },
            touringRoute: null,
            touringRoutePricing: null,
            notes: null,
            confirmationNotes: null,
            totalCost: 500,
            totalSell: 700,
          },
        };
      },
      update: async () => {
        mutated = true;
        return {};
      },
      create: async () => {
        mutated = true;
        return {};
      },
    },
    $transaction: async () => {
      mutated = true;
    },
    bookingAuditLog: {
      create: async () => {
        mutated = true;
        return {};
      },
    },
  });
  capturePdfText(service as any);

  // Actor's company deliberately differs from the booking's client company —
  // the loose operational scope must still resolve it (the exact case the strict
  // GET /vouchers/:id/pdf endpoint 404s).
  const buffer = await service.generateOperationalVoucherPdf(bookingId, 'service-1', { companyId: 'dmc-company' });
  const text = buffer.toString('utf8');

  // Loose scope: NO clientCompanyId filter on the booking where clause.
  assert.deepEqual(bookingWhere.booking, {});
  assert.equal(bookingWhere.id, 'service-1');
  assert.equal(bookingWhere.bookingId, bookingId);
  assert.equal(voucherWhere.bookingServiceId, 'service-1');

  // Pure read — nothing mutated (no status change, no audit, no $transaction).
  assert.equal(mutated, false);

  // Renders the safe supplier-facing content…
  assert.match(text, /Transport Voucher/);
  assert.match(text, /Client Group/);
  assert.match(text, /QAIA to Dead Sea/);
  assert.match(text, /Driver Ali/);
  assert.match(text, /Van/);
  // …and leaks no cost/finance/reference-token data.
  for (const bad of [/totalCost/, /totalSell/i, /margin/i, /payable/i, /\bIBAN\b/, /invoice/i, /proposal/i, /\btoken\b/i, /\$\s*\d/, /USD\s*\d/]) {
    assert.doesNotMatch(text, bad);
  }
});

test('operational voucher PDF (Phase 2E) never surfaces hotel service.notes cost metadata', async () => {
  const bookingId = '22222222-2222-4222-8222-222222222222';
  const service = createService({
    route: { findUnique: async () => null },
    bookingService: { findFirst: async () => ({ id: 'service-2' }) },
    voucher: {
      findUnique: async () => ({
        id: 'voucher-2',
        type: 'HOTEL',
        status: 'GENERATED',
        notes: null, // operator typed nothing → the shared renderer would fall back to service.notes
        supplier: { name: 'Amman Hotel' },
        booking: {
          id: bookingId,
          bookingRef: 'BK-002',
          pax: 2,
          adults: 2,
          children: 0,
          roomCount: 1,
          startDate: new Date('2026-11-01T00:00:00.000Z'),
          endDate: new Date('2026-11-03T00:00:00.000Z'),
          snapshotJson: { title: 'Hotel Group' },
          brandSnapshotJson: { name: 'DMC Jordan' },
          clientSnapshotJson: { name: 'Client Co' },
          quote: {
            clientCompany: { name: 'Client Co' },
            brandCompany: { name: 'DMC Jordan', branding: null },
            contact: {},
          },
          passengers: [],
          days: [],
        },
        bookingService: {
          id: 'service-2',
          referenceId: null,
          description: 'Amman Hotel — Deluxe',
          pickupTime: null,
          startTime: null,
          pickupLocation: null,
          meetingPoint: null,
          assignedTo: null,
          guidePhone: null,
          vehicle: null,
          touringRoute: null,
          touringRoutePricing: null,
          confirmationNumber: 'CNF-77',
          supplierReference: null,
          // Cost-bearing contract metadata that MUST NOT reach the PDF:
          notes: 'Corp Amman Hotel Agreement 2026 | Rate USD 45.00 x 2 pax x 1 night | Supplements USD 20.00',
          confirmationNotes: 'Payable to supplier USD 110.00',
        },
      }),
    },
  });
  capturePdfText(service as any);

  const buffer = await service.generateOperationalVoucherPdf(bookingId, 'service-2', { companyId: 'dmc-company' });
  const text = buffer.toString('utf8');

  assert.match(text, /Hotel Voucher/);
  assert.match(text, /CNF-77/);
  // The finance-safety belt nulled the note fallbacks → no supplier cost leaks.
  assert.doesNotMatch(text, /Rate USD/);
  assert.doesNotMatch(text, /Supplements/);
  assert.doesNotMatch(text, /Payable/i);
  assert.doesNotMatch(text, /45\.00/);
  assert.doesNotMatch(text, /110\.00/);
});

test('operational voucher PDF (Phase 2E) injects explicit cost/finance markers into bookingService.notes AND confirmationNotes and proves none reach the PDF bytes', async () => {
  const bookingId = '44444444-4444-4444-8444-444444444444';
  // Obvious cost-like / internal-finance markers seeded into BOTH note fields.
  const NOTE_MARKERS = ['unitCost', 'totalCost', 'supplierPayable', 'margin', 'CONTRACT_COST_MARKER'];
  const CONFIRMATION_MARKERS = ['supplierPayable', 'INTERNAL_FINANCE_MARKER', 'margin', 'unitCost'];
  const service = createService({
    route: { findUnique: async () => null },
    bookingService: { findFirst: async () => ({ id: 'service-4' }) },
    voucher: {
      findUnique: async () => ({
        id: 'voucher-4',
        type: 'HOTEL',
        status: 'GENERATED',
        notes: null, // operator typed nothing → renderer would otherwise fall back to service.notes
        supplier: { name: 'Amman Hotel' },
        booking: {
          id: bookingId,
          bookingRef: 'BK-004',
          pax: 2,
          adults: 2,
          children: 0,
          roomCount: 1,
          startDate: new Date('2026-12-01T00:00:00.000Z'),
          endDate: new Date('2026-12-03T00:00:00.000Z'),
          snapshotJson: { title: 'Marker Group' },
          brandSnapshotJson: { name: 'DMC Jordan' },
          clientSnapshotJson: { name: 'Client Co' },
          quote: {
            clientCompany: { name: 'Client Co' },
            brandCompany: { name: 'DMC Jordan', branding: null },
            contact: {},
          },
          passengers: [],
          days: [],
        },
        bookingService: {
          id: 'service-4',
          referenceId: null,
          description: 'Amman Hotel — Marker Suite',
          pickupTime: null,
          startTime: null,
          pickupLocation: null,
          meetingPoint: null,
          assignedTo: null,
          guidePhone: null,
          vehicle: null,
          touringRoute: null,
          touringRoutePricing: null,
          confirmationNumber: 'CNF-99',
          supplierReference: null,
          // Explicit cost/internal markers that MUST NOT surface in the PDF:
          notes: `Contract cost metadata | unitCost USD 45.00 | totalCost USD 90.00 | supplierPayable USD 110.00 | margin 22% | CONTRACT_COST_MARKER`,
          confirmationNotes: `INTERNAL_FINANCE_MARKER | supplierPayable USD 110.00 | margin 22% | unitCost USD 45.00`,
        },
      }),
    },
  });
  capturePdfText(service as any);

  const buffer = await service.generateOperationalVoucherPdf(bookingId, 'service-4', { companyId: 'dmc-company' });
  const text = buffer.toString('utf8');

  // Renders the safe operational content…
  assert.match(text, /Hotel Voucher/);
  assert.match(text, /CNF-99/);
  // …and every injected cost/finance marker is absent from the PDF bytes.
  for (const marker of [...NOTE_MARKERS, ...CONFIRMATION_MARKERS]) {
    assert.ok(!text.includes(marker), `PDF must not contain the injected note marker "${marker}"`);
  }
});

test('operational voucher PDF (Phase 2E) 404s when the operation or the voucher is missing', async () => {
  const bookingId = '33333333-3333-4333-8333-333333333333';

  const missingOperation = createService({
    bookingService: { findFirst: async () => null },
    voucher: {
      findUnique: async () => {
        throw new Error('voucher lookup must not run when the operation is missing');
      },
    },
  });
  await assert.rejects(
    () => missingOperation.generateOperationalVoucherPdf(bookingId, 'nope', { companyId: 'dmc-company' }),
    /Booking service not found/,
  );

  const missingVoucher = createService({
    bookingService: { findFirst: async () => ({ id: 'service-3' }) },
    voucher: { findUnique: async () => null },
  });
  await assert.rejects(
    () => missingVoucher.generateOperationalVoucherPdf(bookingId, 'service-3', { companyId: 'dmc-company' }),
    /No voucher has been generated/,
  );
});

test('operational voucher PDF endpoint is a GET, scoped to the operation, role-gated admin/operations', () => {
  const handler = BookingsController.prototype.downloadOperationalVoucherPdf;
  const routePath = (Reflect as any).getMetadata(PATH_METADATA, handler);
  assert.equal(routePath, ':id/operations/:operationId/voucher/pdf');
  const method = (Reflect as any).getMetadata(METHOD_METADATA, handler);
  assert.equal(method, RequestMethod.GET);
  const roles = (Reflect as any).getMetadata('roles', handler);
  assert.deepEqual(roles, ['admin', 'operations']);
});

test('operational voucher SEND PREVIEW (Phase 2F-A) resolves via loose scope, no mutation, assigned-supplier recipient, no finance leak', async () => {
  const bookingId = '55555555-5555-4555-8555-555555555555';
  let bookingWhere: any;
  let mutated = false;
  const service = createService({
    bookingService: {
      findFirst: async ({ where }: any) => {
        bookingWhere = where;
        return {
          id: 'service-1',
          assignedSupplierId: 'sup-1',
          assignedSupplier: { id: 'sup-1', name: 'TEST Hotel Supplier A', email: 'ops@supplier.example' },
          booking: { bookingRef: 'BK-2026-0001' },
        };
      },
      update: async () => {
        mutated = true;
        return {};
      },
    },
    voucher: {
      findUnique: async () => ({ type: 'HOTEL', status: 'GENERATED' }),
      update: async () => {
        mutated = true;
        return {};
      },
      create: async () => {
        mutated = true;
        return {};
      },
    },
    $transaction: async () => {
      mutated = true;
    },
    bookingAuditLog: {
      create: async () => {
        mutated = true;
        return {};
      },
    },
  });

  const preview = await service.getOperationalVoucherSendPreview(bookingId, 'service-1', { companyId: 'dmc-company' });

  // Loose scope: NO clientCompanyId filter on the booking where clause.
  assert.deepEqual(bookingWhere.booking, {});
  assert.equal(bookingWhere.id, 'service-1');
  assert.equal(bookingWhere.bookingId, bookingId);
  // Pure read — nothing mutated (no update/create/$transaction/audit).
  assert.equal(mutated, false);
  // Recipient = ASSIGNED operational supplier; READY.
  assert.equal(preview.recipient.recipientSource, 'assignedOperationalSupplier');
  assert.equal(preview.recipient.supplierId, 'sup-1');
  assert.equal(preview.recipient.email, 'ops@supplier.example');
  assert.equal(preview.readiness, 'READY');
  assert.equal(preview.attachmentName, 'voucher-service-1.pdf');
  assert.equal(preview.note, 'Preview only. No email is sent.');
  // No finance/token/snapshot leakage.
  const json = JSON.stringify(preview).toLowerCase();
  for (const bad of ['unitcost', 'totalcost', 'payable', 'margin', 'snapshot', 'token', 'iban', 'invoice', 'discount']) {
    assert.ok(!json.includes(bad), `send-preview leaked "${bad}"`);
  }
});

test('operational voucher SEND PREVIEW returns NO_VOUCHER when no voucher exists (still no mutation)', async () => {
  let mutated = false;
  const service = createService({
    bookingService: {
      findFirst: async () => ({
        id: 'service-2',
        assignedSupplierId: 'sup-2',
        assignedSupplier: { id: 'sup-2', name: 'S', email: 'ops@x.co' },
        booking: { bookingRef: 'BK-2026-0002' },
      }),
    },
    voucher: {
      findUnique: async () => null,
      update: async () => {
        mutated = true;
        return {};
      },
    },
  });
  const preview = await service.getOperationalVoucherSendPreview('bk', 'service-2', { companyId: 'dmc-company' });
  assert.equal(preview.readiness, 'NO_VOUCHER');
  assert.equal(preview.attachmentName, null);
  assert.equal(mutated, false);
});

test('operational voucher SEND PREVIEW 404s when the operation is missing', async () => {
  const service = createService({
    bookingService: { findFirst: async () => null },
    voucher: {
      findUnique: async () => {
        throw new Error('voucher lookup must not run when the operation is missing');
      },
    },
  });
  await assert.rejects(
    () => service.getOperationalVoucherSendPreview('bk', 'nope', { companyId: 'dmc-company' }),
    /Booking service not found/,
  );
});

test('operational voucher SEND PREVIEW endpoint is a GET, scoped to the operation, role-gated admin/operations', () => {
  const h = BookingsController.prototype.getOperationalVoucherSendPreview;
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, h), ':id/operations/:operationId/voucher/send-preview');
  assert.equal((Reflect as any).getMetadata(METHOD_METADATA, h), RequestMethod.GET);
  assert.deepEqual((Reflect as any).getMetadata('roles', h), ['admin', 'operations']);
});

test('operational voucher SEND endpoint is a POST, scoped to the operation, role-gated admin/operations', () => {
  const h = BookingsController.prototype.sendOperationalVoucherEmail;
  assert.equal((Reflect as any).getMetadata(PATH_METADATA, h), ':id/operations/:operationId/voucher/send');
  assert.equal((Reflect as any).getMetadata(METHOD_METADATA, h), RequestMethod.POST);
  assert.deepEqual((Reflect as any).getMetadata('roles', h), ['admin', 'operations']);
});

test('operational voucher SEND (Phase 2F-B) is blocked feature_disabled when the backend flag is OFF — no readiness/pdf/mail/audit', async () => {
  delete process.env.OPS_V2_VOUCHER_SEND_ENABLED;
  const service = createService({
    voucher: {
      findUnique: async () => {
        throw new Error('voucher must not be queried when the send flag is OFF');
      },
    },
    bookingService: {
      findFirst: async () => {
        throw new Error('booking must not be resolved when the send flag is OFF');
      },
    },
    bookingAuditLog: {
      create: async () => {
        throw new Error('must not write an audit when the send flag is OFF');
      },
      findFirst: async () => {
        throw new Error('must not run a duplicate check when the send flag is OFF');
      },
    },
  });
  const r = await service.sendOperationalVoucherEmail('bk', 'op', { companyActor: { companyId: 'c1' } });
  assert.equal(r.blocked, true);
  assert.equal(r.blockedReason, 'feature_disabled');
  assert.equal(r.sent, false);
  // Loose operational scoping for the actual send path is exercised via
  // getOperationalVoucherSendPreview (see the SEND PREVIEW loose-scope test above),
  // which the send flow reuses server-side to re-resolve readiness + recipient.
});

test('voucher status transitions draft to ready to sent and blocks cross-company access', async () => {
  const updatedRows: any[] = [];
  const service = createService({
    voucher: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.booking?.quote, undefined);
        return {
          id: 'voucher-1',
          bookingId: '11111111-1111-4111-8111-111111111111',
          bookingServiceId: 'service-1',
          status: 'DRAFT',
          issuedAt: null,
        };
      },
    },
    $transaction: async (callback: any) =>
      callback({
        voucher: {
          update: async ({ data }: any) => {
            updatedRows.push(data);
            return { id: 'voucher-1', ...data };
          },
        },
        bookingAuditLog: {
          create: async () => ({}),
        },
      }),
  });

  const ready = await service.updateVoucherStatus('voucher-1', 'READY', undefined, { companyId: 'company-1' });

  assert.equal(ready.status, 'READY');
  assert.equal(updatedRows[0].issuedAt, null);

  const sent = await service.updateVoucherStatus('voucher-1', 'SENT', undefined, { companyId: 'company-1' });

  assert.equal(sent.status, 'SENT');
  assert.ok(updatedRows[1].issuedAt instanceof Date);

  const blocked = createService({
    voucher: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.id, 'voucher-1');
        assert.equal(where.booking?.quote, undefined);
        return null;
      },
    },
  });

  await assert.rejects(
    () => blocked.updateVoucherStatus('voucher-1', 'SENT', undefined, { companyId: 'company-b' }),
    /voucher not found/i,
  );
});

test('guide operations phase one wires assignment overlap language dashboard readiness regressions', () => {
  const bookingsSource = fs.readFileSync(path.join(__dirname, 'bookings.service.ts'), 'utf8');
  const controllerSource = fs.readFileSync(path.join(__dirname, 'bookings.controller.ts'), 'utf8');
  const guidesSource = fs.readFileSync(path.join(__dirname, '..', 'guides', 'guides.service.ts'), 'utf8');

  for (const token of [
    'updateGuideAssignment',
    'guide-assignment',
    'guideConfirmationStatus',
    'guideRequiredLanguages',
    'guideReportingTime',
  ]) {
    assert.match(`${bookingsSource}\n${controllerSource}`, new RegExp(token));
  }

  for (const token of [
    'isGuideLanguageMismatch',
    'getGuideOverlapServiceIds',
    'guideOperations',
    'guideReadinessAlerts',
    'no guide assigned',
    'wrong language',
    'overlapping guide assignment',
    'guide not confirmed',
  ]) {
    assert.match(bookingsSource, new RegExp(token));
  }

  for (const token of ['blockedDates', 'availability', 'overlappingAssignments']) {
    assert.match(guidesSource, new RegExp(token));
  }
});

test('dining operations phase one wires restaurant assignment capacity dietary dashboard readiness regressions', () => {
  const bookingsSource = fs.readFileSync(path.join(__dirname, 'bookings.service.ts'), 'utf8');
  const controllerSource = fs.readFileSync(path.join(__dirname, 'bookings.controller.ts'), 'utf8');
  const restaurantsSource = fs.readFileSync(path.join(__dirname, '..', 'restaurants', 'restaurants.service.ts'), 'utf8');

  for (const token of [
    'updateRestaurantAssignment',
    'restaurant-assignment',
    'restaurantId',
    'mealConfirmationStatus',
    'mealTiming',
    'mealDietaryRequirements',
  ]) {
    assert.match(`${bookingsSource}\n${controllerSource}`, new RegExp(token));
  }

  for (const token of [
    'isMealCapacityExceeded',
    'isMealDietaryMismatch',
    'diningOperations',
    'diningReadinessAlerts',
    'no restaurant assigned',
    'capacity exceeded',
    'dietary requirement unresolved',
    'restaurant not confirmed',
  ]) {
    assert.match(bookingsSource, new RegExp(token));
  }

  for (const token of ['capacityConflicts', 'mealTypes', 'halalSupport', 'vegetarianSupport', 'veganSupport']) {
    assert.match(restaurantsSource, new RegExp(token));
  }
});

test('series operations phase one wires recurring departures cloning templates and dashboard grouping', () => {
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
  const seriesSource = fs.readFileSync(path.join(__dirname, '..', 'series', 'series.service.ts'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(__dirname, 'bookings.service.ts'), 'utf8');

  for (const token of ['model Series', 'model SeriesDeparture', 'seriesCode', 'recurringSchedule', 'destinationCountry', 'packageTemplateId']) {
    assert.match(schemaSource, new RegExp(token));
  }

  for (const token of [
    'cloneDeparture',
    'regenerateOperationalServices',
    'cloneServiceData',
    'sourceMetadata',
    'templateSnapshotJson',
    'bookingRoomingEntry',
    'vouchers',
    'supplierConfirmationStatus',
  ]) {
    assert.match(seriesSource, new RegExp(token));
  }

  for (const token of ['seriesOperations', 'buildSeriesOperationsQueue', 'low occupancy', 'rooming pending', 'unreconfirmed departure', 'voucher pending']) {
    assert.match(dashboardSource, new RegExp(token));
  }
});

test('series capacity phase one wires seat calculations guarantee status and dashboard alerts', () => {
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
  const seriesSource = fs.readFileSync(path.join(__dirname, '..', 'series', 'series.service.ts'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(__dirname, 'bookings.service.ts'), 'utf8');

  for (const token of ['totalCapacity', 'guaranteedMinimumPax', 'sharedCoachCapacity', 'lowOccupancyThreshold']) {
    assert.match(schemaSource, new RegExp(token));
    assert.match(seriesSource, new RegExp(token));
  }

  for (const token of [
    'getSeriesDepartureCapacity',
    'seatsSold',
    'seatsRemaining',
    'guaranteedMinimumPax',
    'sold out',
    'departure below minimum guarantee',
    'departure over capacity',
    'low remaining seats',
    'transport capacity mismatch',
    'capacityStatus',
  ]) {
    assert.match(dashboardSource, new RegExp(token));
  }
});

test('series allotment inventory phase one wires allotment tracking stop sale and dashboard grouping', () => {
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
  const seriesSource = fs.readFileSync(path.join(__dirname, '..', 'series', 'series.service.ts'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(__dirname, 'bookings.service.ts'), 'utf8');

  for (const token of ['reservedSeats', 'stopSaleThreshold', 'hotelAllotmentsJson', 'sharedInventoryJson']) {
    assert.match(schemaSource, new RegExp(token));
    assert.match(seriesSource, new RegExp(token));
    assert.match(dashboardSource, new RegExp(token));
  }

  for (const token of [
    'buildHotelAllotmentsJson',
    'blockedRoomInventory',
    'roomTypeInventory',
    'releaseDeadline',
    'allotment exhausted',
    'overbooked hotel category',
    'departure stop sale triggered',
    'release deadline approaching',
    'getSeriesDepartureInventory',
  ]) {
    assert.match(seriesSource + dashboardSource, new RegExp(token));
  }
});

test('regular tour SIC structure phase one wires variants branches shared and split services', () => {
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
  const seriesSource = fs.readFileSync(path.join(__dirname, '..', 'series', 'series.service.ts'), 'utf8');
  const dashboardSource = fs.readFileSync(path.join(__dirname, 'bookings.service.ts'), 'utf8');

  for (const token of ['programVariantsJson', 'branchExtensionsJson', 'sharedCoreServicesJson', 'splitServicesJson', 'hotelCategoryVariant', 'branchExtension']) {
    assert.match(schemaSource, new RegExp(token));
  }

  for (const token of ['3 star', '4 star', '5 star', '5 star luxury', 'Dead Sea extension', 'Aqaba extension', 'Wadi Rum overnight', 'Border departure variants']) {
    assert.match(seriesSource, new RegExp(token));
  }

  for (const token of ['getSeriesDepartureStructure', 'paxByCategory', 'paxByBranch', 'sharedServices', 'splitServices', 'hotelCategoryVariant', 'branchExtension']) {
    assert.match(dashboardSource, new RegExp(token));
  }
});

test('booking amendments operational sync phase one wires controlled service changes audit and alerts', () => {
  const controllerSource = fs.readFileSync(path.join(__dirname, 'bookings.controller.ts'), 'utf8');
  const bookingsSource = fs.readFileSync(path.join(__dirname, 'bookings.service.ts'), 'utf8');

  for (const token of [
    'operational-amendments',
    'ApplyBookingOperationalAmendmentBody',
    'applyOperationalAmendment',
    'BookingOperationalAmendmentType',
    'add_service',
    'remove_service',
    'change_hotel_category',
    'add_extension',
    'add_meal',
    'add_transfer',
    'add_excursion',
    'upgrade_service',
    'downgrade_service',
  ]) {
    assert.match(`${controllerSource}\n${bookingsSource}`, new RegExp(token));
  }

  for (const token of [
    'operational_amendment_applied',
    'operational_sync_required',
    'confirmProtected',
    'protectedOperations',
    'confirmed supplier assignment requires reconfirmation',
    'assigned guide will be impacted',
    'assigned restaurant will be impacted',
    'rooming impacted',
    'voucher regeneration required',
    'supplier reconfirmation required',
    'amended booking needs reconfirmation',
    'operationalAmendments',
    'mapOperationalAmendmentDashboardAlerts',
    'BookingServiceLifecycleStatus.cancelled',
    'SupplierConfirmationStatus.NOT_SENT',
    'toBookingAmendmentFailureException',
    'Use operational amendments for post-conversion service changes',
  ]) {
    assert.match(bookingsSource, new RegExp(token));
  }
});

test('finance reconciliation phase one wires deposits partial payments supplier payables dashboard and methods', () => {
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
  const bookingsSource = fs.readFileSync(path.join(__dirname, 'bookings.service.ts'), 'utf8');
  const controllerSource = fs.readFileSync(path.join(__dirname, 'bookings.controller.ts'), 'utf8');

  for (const token of [
    'supplierPayableAmount',
    'supplierPayableStatus',
    'supplierPaymentNotes',
    'bank_transfer',
    'cliq',
    'mb_way',
    'credit_card',
    'custom_manual',
  ]) {
    assert.match(schemaSource, new RegExp(token));
  }

  for (const token of [
    'depositsReceived',
    'remainingBalance',
    'clientPaymentStatus',
    'deposit_paid',
    'partially_paid',
    'supplierPayableStatus',
    'supplierPayables',
    'outstandingBalances',
    'unpaidSuppliers',
    'partiallyPaidBookings',
    'overdueBalances',
    'revenueSnapshots',
    'listPaymentMethodOptions',
  ]) {
    assert.match(bookingsSource, new RegExp(token));
  }

  for (const token of ['BookingPaymentMethodBody', 'cliq', 'mb_way', 'custom_manual']) {
    assert.match(controllerSource, new RegExp(token));
  }
});

test('booking operational service grid foundation wires schema conversion validation and read endpoint', () => {
  const schemaSource = fs.readFileSync(path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
  const bookingsSource = fs.readFileSync(path.join(__dirname, 'bookings.service.ts'), 'utf8');
  const controllerSource = fs.readFileSync(path.join(__dirname, 'bookings.controller.ts'), 'utf8');
  const quotesSource = fs.readFileSync(path.join(__dirname, '..', 'quotes', 'quotes.service.ts'), 'utf8');

  for (const token of [
    'operationalDate',
    'operationalTime',
    'supplierConfirmationCode',
    'confirmationReference',
    'confirmationReceivedAt',
    'confirmedBy',
    'voucherGeneratedAt',
    'operationalNotes',
    'pickupLocation',
    'dropoffLocation',
    'assignedVehicleId',
    'assignedGuideId',
    'assignedSupplierId',
    'assignmentStatus',
    'SupplierAssignmentStatus',
    'SERVICE',
    'TICKET',
    'OPERATIONAL_READY',
    'REQUESTED',
  ]) {
    assert.match(schemaSource, new RegExp(token));
  }

  for (const token of [
    'getOperationalServiceGrid',
    'operations-grid',
    'assignOperationalSupplier',
    'assign-supplier',
    'assignedSupplierId',
    'updateOperationalSupplierConfirmation',
    "operations/:operationId/confirmation",
    'Cannot confirm an operational row without an assigned supplier',
    'booking_service_supplier_confirmation_updated',
    'assertSupplierCompatibleWithOperation',
    'Inactive or archived suppliers cannot be assigned',
    'booking_service_supplier_assigned',
    'BookingOperationServiceType.TICKET',
    'BookingOperationServiceType.SERVICE',
    'validateBookingOperationalServiceRows',
    'excursionTemplateComponentId',
    'touringRouteCode',
    'AQ_',
    'JOR-TR-AQABA',
  ]) {
    assert.match(`${bookingsSource}\n${controllerSource}\n${quotesSource}`, new RegExp(token));
  }
});

// --- PR-2a: delete-lead guard (never leave a booking with zero leads) ---------

const DL_BOOKING = '11111111-1111-4111-8111-111111111111';

test('deletePassenger blocks deleting the lead while other passengers exist', async () => {
  const deleted: string[] = [];
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        bookingPassenger: {
          findFirst: async () => ({
            id: 'p-lead', bookingId: DL_BOOKING, firstName: 'Lead', lastName: 'A', title: null,
            isLead: true, roomingAssignments: [],
          }),
          count: async ({ where }: any) => {
            assert.equal(where.NOT.id, 'p-lead');
            assert.equal(where.bookingId, DL_BOOKING);
            return 2; // other passengers remain
          },
          delete: async ({ where }: any) => { deleted.push(where.id); return {}; },
        },
        bookingAuditLog: { create: async () => ({}) },
      }),
  });

  await assert.rejects(
    () => service.deletePassenger(DL_BOOKING, 'p-lead', undefined, { companyId: 'company-1' }),
    /Set another passenger as lead before deleting the lead passenger/,
  );
  assert.deepEqual(deleted, [], 'the lead must not be deleted while other passengers exist');
});

test('deletePassenger allows deleting a non-lead passenger', async () => {
  const deleted: string[] = [];
  let countCalled = false;
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        bookingPassenger: {
          findFirst: async () => ({
            id: 'p2', bookingId: DL_BOOKING, firstName: 'Solo', lastName: 'B', title: null,
            isLead: false, roomingAssignments: [],
          }),
          count: async () => { countCalled = true; return 5; },
          delete: async ({ where }: any) => { deleted.push(where.id); return {}; },
        },
        bookingAuditLog: { create: async () => ({}) },
      }),
  });

  const result = await service.deletePassenger(DL_BOOKING, 'p2', undefined, { companyId: 'company-1' });
  assert.equal(result.id, 'p2');
  assert.deepEqual(deleted, ['p2']);
  assert.equal(countCalled, false, 'a non-lead delete should not invoke the lead-count guard');
});

test('deletePassenger allows deleting the last remaining (lead) passenger', async () => {
  const deleted: string[] = [];
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        bookingPassenger: {
          findFirst: async () => ({
            id: 'p-only', bookingId: DL_BOOKING, firstName: 'Only', lastName: 'One', title: null,
            isLead: true, roomingAssignments: [],
          }),
          count: async () => 0, // no other passengers → allowed
          delete: async ({ where }: any) => { deleted.push(where.id); return {}; },
        },
        bookingAuditLog: { create: async () => ({}) },
      }),
  });

  const result = await service.deletePassenger(DL_BOOKING, 'p-only', undefined, { companyId: 'company-1' });
  assert.equal(result.id, 'p-only');
  assert.deepEqual(deleted, ['p-only']);
});

test('deletePassenger still blocks a passenger with rooming assignments (guard unchanged)', async () => {
  const deleted: string[] = [];
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        bookingPassenger: {
          findFirst: async () => ({
            id: 'p3', bookingId: DL_BOOKING, firstName: 'Room', lastName: 'C', title: null,
            isLead: false, roomingAssignments: [{ bookingRoomingEntryId: 'room-1' }],
          }),
          count: async () => 3,
          delete: async ({ where }: any) => { deleted.push(where.id); return {}; },
        },
        bookingAuditLog: { create: async () => ({}) },
      }),
  });

  await assert.rejects(
    () => service.deletePassenger(DL_BOOKING, 'p3', undefined, { companyId: 'company-1' }),
    /Unassign the passenger from rooming before deleting/,
  );
  assert.deepEqual(deleted, []);
});

test('setLeadPassenger keeps exactly one lead (demotes all others)', async () => {
  let demote: any = null;
  let promote: any = null;
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        bookingPassenger: {
          findFirst: async () => ({
            id: 'p2', bookingId: DL_BOOKING, firstName: 'New', lastName: 'Lead', title: null, isLead: false,
          }),
          updateMany: async ({ where, data }: any) => { demote = { where, data }; return { count: 1 }; },
          update: async ({ where, data }: any) => { promote = { where, data }; return { id: where.id, ...data }; },
        },
        bookingAuditLog: { create: async () => ({}) },
      }),
  });

  const result = await service.setLeadPassenger(DL_BOOKING, 'p2', undefined, { companyId: 'company-1' });
  assert.equal(result.isLead, true);
  assert.deepEqual(demote.data, { isLead: false }, 'all others demoted');
  assert.equal(demote.where.bookingId, DL_BOOKING);
  assert.equal(promote.where.id, 'p2');
  assert.equal(promote.data.isLead, true);
});

test('deletePassenger is pricing-inert (touches no finance/service models)', async () => {
  const touched = new Set<string>();
  const track = (name: string) =>
    new Proxy({}, { get: () => async () => { touched.add(name); return []; } });
  const service = createService({
    $transaction: async (callback: any) =>
      callback({
        bookingPassenger: {
          findFirst: async () => ({
            id: 'p-only', bookingId: DL_BOOKING, firstName: 'A', lastName: 'B', title: null,
            isLead: true, roomingAssignments: [],
          }),
          count: async () => 0,
          delete: async () => ({}),
        },
        bookingAuditLog: { create: async () => ({}) },
        bookingService: track('bookingService'),
        payment: track('payment'),
      }),
  });

  await service.deletePassenger(DL_BOOKING, 'p-only', undefined, { companyId: 'company-1' });
  assert.ok(!touched.has('bookingService'), 'deletePassenger must not touch bookingService (pricing-inert)');
  assert.ok(!touched.has('payment'), 'deletePassenger must not touch payments (pricing-inert)');
});

// --- PR-2b backend fix: passport / nationality / expiry optional on create+update

function passengerMutationService(overrides: {
  existing?: any;
  onCreate?: (data: any) => void;
  onUpdate?: (data: any) => void;
}) {
  return createService({
    $transaction: async (callback: any) =>
      callback({
        // assertLatestBookingAmendment probes amendedFromId → return null (latest);
        // the initial booking lookup returns the booking.
        booking: { findFirst: async ({ where }: any) => (where?.amendedFromId !== undefined ? null : { id: DL_BOOKING }) },
        bookingPassenger: {
          findFirst: async () => overrides.existing ?? null,
          updateMany: async () => ({ count: 0 }),
          create: async ({ data }: any) => {
            overrides.onCreate?.(data);
            return { id: 'p-new', ...data };
          },
          update: async ({ data }: any) => {
            overrides.onUpdate?.(data);
            return { id: overrides.existing?.id ?? 'p-upd', ...data };
          },
        },
        bookingAuditLog: { create: async () => ({}) },
      }),
  });
}

test('createPassenger (fix): succeeds with firstName/lastName only — no passport / nationality', async () => {
  const service = passengerMutationService({});
  const p = await service.createPassenger(DL_BOOKING, {
    firstName: 'Solo',
    lastName: 'Traveler',
    companyActor: { companyId: 'company-1' },
  });
  assert.equal(p.firstName, 'Solo');
  assert.equal(p.lastName, 'Traveler');
  assert.ok(!p.passportNumber, 'passport is optional on create');
  assert.ok(!p.passportExpiryDate, 'passport expiry is optional on create');
  assert.ok(!p.nationality, 'nationality is optional on create');
});

test('createPassenger (fix): succeeds with non-PII fields, still no passport required', async () => {
  const service = passengerMutationService({});
  const p = await service.createPassenger(DL_BOOKING, {
    firstName: 'Ana',
    lastName: 'Lopez',
    title: 'Ms',
    nationality: 'JOR',
    arrivalFlight: 'RJ1',
    dietaryNotes: 'None',
    companyActor: { companyId: 'company-1' },
  });
  assert.equal(p.nationality, 'JOR');
  assert.equal(p.arrivalFlight, 'RJ1');
  assert.equal(p.dietaryNotes, 'None');
  assert.ok(!p.passportNumber, 'passport still optional');
});

test('updatePassenger (fix): edits non-PII fields on a passenger that has NO passport', async () => {
  const existing = {
    id: 'p-1', firstName: 'QA', lastName: 'Contact', title: null, gender: null, dateOfBirth: null,
    nationality: null, passportNumber: null, passportIssueDate: null, passportExpiryDate: null,
    arrivalFlight: null, departureFlight: null, entryPoint: null, visaStatus: null,
    emergencyContactName: null, emergencyContactPhone: null, dietaryNotes: null, roomingNotes: null,
    isLead: true, notes: null,
  };
  const service = passengerMutationService({ existing });
  const p = await service.updatePassenger(DL_BOOKING, 'p-1', {
    dietaryNotes: 'Vegetarian',
    companyActor: { companyId: 'company-1' },
  });
  assert.equal(p.dietaryNotes, 'Vegetarian');
  assert.ok(!p.passportNumber, 'no passport required to edit');
  assert.ok(!p.nationality, 'no nationality required to edit');
});

test('updatePassenger (fix): omitting passport fields preserves existing passport', async () => {
  const existing = {
    id: 'p-2', firstName: 'Has', lastName: 'Passport', title: null, gender: null, dateOfBirth: null,
    nationality: 'JOR', passportNumber: 'P12345', passportIssueDate: null, passportExpiryDate: null,
    arrivalFlight: null, departureFlight: null, entryPoint: null, visaStatus: null,
    emergencyContactName: null, emergencyContactPhone: null, dietaryNotes: null, roomingNotes: null,
    isLead: false, notes: null,
  };
  const service = passengerMutationService({ existing });
  const p = await service.updatePassenger(DL_BOOKING, 'p-2', {
    dietaryNotes: 'Halal',
    companyActor: { companyId: 'company-1' },
  });
  assert.equal(p.dietaryNotes, 'Halal');
  assert.equal(p.passportNumber, 'P12345', 'existing passport preserved when passport fields are omitted');
  assert.equal(p.nationality, 'JOR', 'existing nationality preserved');
});

test('createPassenger (fix): supplied passport still normalizes + persists (Classic path safe)', async () => {
  const service = passengerMutationService({});
  const p = await service.createPassenger(DL_BOOKING, {
    firstName: 'Full', lastName: 'Manifest', nationality: 'GBR', passportNumber: 'X99',
    companyActor: { companyId: 'company-1' },
  });
  assert.equal(p.passportNumber, 'X99', 'supplied passport still stored');
  assert.equal(p.nationality, 'GBR');
});
