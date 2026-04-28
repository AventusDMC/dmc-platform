import test = require('node:test');
import assert = require('node:assert/strict');
import { ReportsService } from './reports.service';

function createService(bookings: any[]) {
  const seenWheres: any[] = [];
  const service = new ReportsService({
    booking: {
      findMany: async ({ where }: any) => {
        seenWheres.push(where);
        return bookings.filter((booking) => {
          if (!matchesWhere(booking, where, bookings)) return false;
          return true;
        });
      },
    },
  } as any);

  return { service, seenWheres };
}

function createFinanceService(invoices: any[], supplierPayments: any[], bookings: any[] = []) {
  const seenInvoiceWheres: any[] = [];
  const seenPaymentWheres: any[] = [];
  const seenBookingWheres: any[] = [];
  const service = new ReportsService({
    booking: {
      findMany: async ({ where }: any) => {
        seenBookingWheres.push(where);
        return bookings.filter((booking) => matchesWhere(booking, where, bookings));
      },
    },
    invoice: {
      findMany: async ({ where }: any) => {
        seenInvoiceWheres.push(where);
        return invoices;
      },
    },
    payment: {
      findMany: async ({ where }: any) => {
        seenPaymentWheres.push(where);
        return supplierPayments.filter((payment) => !where?.type || payment.type === where.type);
      },
    },
  } as any);

  return { service, seenInvoiceWheres, seenPaymentWheres, seenBookingWheres };
}

test('booking summary calculates totals profit margin top and low-margin bookings', async () => {
  const { service } = createService([
    booking('booking-1', 'BK-1', 'client-1', 'Client One', '2026-06-01', [
      { totalCost: 100, totalSell: 160, status: 'confirmed' },
      { totalCost: 30, totalSell: 40, status: 'cancelled' },
    ]),
    booking('booking-2', 'BK-2', 'client-2', 'Client Two', '2026-06-02', [
      { totalCost: 300, totalSell: 330, status: 'confirmed' },
    ]),
  ]);

  const summary = await service.getBookingSummary({}, { companyId: 'dmc-company' });

  assert.equal(summary.totalBookings, 2);
  assert.equal(summary.cancelledBookings, 0);
  assert.equal(summary.totalSell, 490);
  assert.equal(summary.totalCost, 400);
  assert.equal(summary.totalProfit, 90);
  assert.equal(summary.avgMargin, 18.37);
  assert.equal(summary.topBookings[0].bookingRef, 'BK-1');
  assert.equal(summary.lowMarginBookings[0].bookingRef, 'BK-2');
});

test('booking summary applies inclusive start and end date filtering', async () => {
  const { service, seenWheres } = createService([
    booking('booking-1', 'BK-1', 'client-1', 'Client One', '2026-06-01', [{ totalCost: 100, totalSell: 150 }]),
    booking('booking-2', 'BK-2', 'client-1', 'Client One', '2026-06-15', [{ totalCost: 100, totalSell: 200 }]),
    booking('booking-3', 'BK-3', 'client-1', 'Client One', '2026-07-01', [{ totalCost: 100, totalSell: 300 }]),
  ]);

  const summary = await service.getBookingSummary(
    { startDate: '2026-06-01', endDate: '2026-06-30' },
    { companyId: 'dmc-company' },
  );

  assert.equal(summary.totalBookings, 2);
  assert.equal(summary.totalSell, 350);
  assert.equal(summary.dateField, 'startDate');
  assert.ok(seenWheres[0].AND[0].startDate.gte instanceof Date);
  assert.ok(seenWheres[0].AND[0].startDate.lte instanceof Date);
});

test('booking summary counts latest amendments only and uses latest amendment totals', async () => {
  const { service, seenWheres } = createService([
    booking('booking-original', 'BK-1', 'client-1', 'Client One', '2026-06-01', [
      { totalCost: 100, totalSell: 150 },
    ]),
    booking('booking-amended', 'BK-1 / A1', 'client-1', 'Client One', '2026-06-01', [
      { totalCost: 120, totalSell: 220 },
    ], {
      amendedFromId: 'booking-original',
    }),
  ]);

  const summary = await service.getBookingSummary({}, { companyId: 'dmc-company' });

  assert.equal(summary.totalBookings, 1);
  assert.equal(summary.totalSell, 220);
  assert.equal(summary.totalCost, 120);
  assert.equal(summary.totalProfit, 100);
  assert.equal(summary.topBookings[0].id, 'booking-amended');
  assert.deepEqual(seenWheres[0].AND[1], { amendments: { none: {} } });
});

test('booking summary excludes cancelled bookings from financial totals and counts them separately', async () => {
  const { service } = createService([
    booking('booking-active', 'BK-1', 'client-1', 'Client One', '2026-06-01', [
      { totalCost: 100, totalSell: 180 },
    ]),
    booking('booking-cancelled', 'BK-2', 'client-1', 'Client One', '2026-06-02', [
      { totalCost: 500, totalSell: 700 },
    ], {
      status: 'cancelled',
    }),
  ]);

  const summary = await service.getBookingSummary({}, { companyId: 'dmc-company' });

  assert.equal(summary.totalBookings, 1);
  assert.equal(summary.cancelledBookings, 1);
  assert.equal(summary.totalSell, 180);
  assert.equal(summary.totalCost, 100);
  assert.equal(summary.totalProfit, 80);
  assert.equal(summary.topBookings.length, 1);
  assert.equal(summary.topBookings[0].id, 'booking-active');
});

test('booking summary requires authenticated company context without forcing client company filtering', async () => {
  const { service, seenWheres } = createService([
    booking('booking-1', 'BK-1', 'client-1', 'Client One', '2026-06-01', [{ totalCost: 100, totalSell: 150 }]),
    booking('booking-2', 'BK-2', 'client-2', 'Client Two', '2026-06-02', [{ totalCost: 120, totalSell: 200 }]),
  ]);

  await assert.rejects(() => service.getBookingSummary({}, undefined as any), /Company context is required/);

  const summary = await service.getBookingSummary({}, { companyId: 'dmc-company' });

  assert.equal(summary.totalBookings, 2);
  assert.deepEqual(seenWheres[0], { AND: [{}, { amendments: { none: {} } }] });
});

test('monthly trends groups latest non-cancelled bookings by start month', async () => {
  const { service } = createService([
    booking('booking-1', 'BK-1', 'client-1', 'Client One', '2026-06-01', [{ totalCost: 100, totalSell: 160 }]),
    booking('booking-2', 'BK-2', 'client-2', 'Client Two', '2026-06-20', [{ totalCost: 200, totalSell: 260 }]),
    booking('booking-3', 'BK-3', 'client-1', 'Client One', '2026-07-02', [{ totalCost: 50, totalSell: 100 }]),
  ]);

  const trends = await service.getMonthlyTrends({}, { companyId: 'dmc-company' });

  assert.deepEqual(
    trends.months.map((month) => month.month),
    ['2026-06', '2026-07'],
  );
  assert.equal(trends.months[0].totalBookings, 2);
  assert.equal(trends.months[0].totalSell, 420);
  assert.equal(trends.months[0].totalCost, 300);
  assert.equal(trends.months[0].totalProfit, 120);
  assert.equal(trends.months[0].avgMargin, 28.57);
  assert.equal(trends.months[1].totalBookings, 1);
  assert.equal(trends.months[1].totalProfit, 50);
});

test('monthly trends use latest amendments only and exclude cancelled bookings', async () => {
  const { service, seenWheres } = createService([
    booking('booking-original', 'BK-1', 'client-1', 'Client One', '2026-06-01', [
      { totalCost: 100, totalSell: 150 },
    ]),
    booking('booking-amended', 'BK-1 / A1', 'client-1', 'Client One', '2026-06-02', [
      { totalCost: 120, totalSell: 220 },
    ], {
      amendedFromId: 'booking-original',
    }),
    booking('booking-cancelled', 'BK-2', 'client-1', 'Client One', '2026-06-03', [
      { totalCost: 500, totalSell: 700 },
    ], {
      status: 'cancelled',
    }),
  ]);

  const trends = await service.getMonthlyTrends({}, { companyId: 'dmc-company' });

  assert.equal(trends.months.length, 1);
  assert.equal(trends.months[0].month, '2026-06');
  assert.equal(trends.months[0].totalBookings, 1);
  assert.equal(trends.months[0].totalSell, 220);
  assert.equal(trends.months[0].totalCost, 120);
  assert.deepEqual(seenWheres[0].AND[1], { amendments: { none: {} } });
});

test('monthly trends apply date filtering and do not filter by actor company', async () => {
  const { service, seenWheres } = createService([
    booking('booking-1', 'BK-1', 'client-1', 'Client One', '2026-05-31', [{ totalCost: 100, totalSell: 150 }]),
    booking('booking-2', 'BK-2', 'client-1', 'Client One', '2026-06-15', [{ totalCost: 100, totalSell: 200 }]),
    booking('booking-3', 'BK-3', 'client-2', 'Client Two', '2026-06-20', [{ totalCost: 120, totalSell: 220 }]),
    booking('booking-4', 'BK-4', 'client-1', 'Client One', '2026-07-01', [{ totalCost: 100, totalSell: 300 }]),
  ]);

  await assert.rejects(() => service.getMonthlyTrends({}, undefined as any), /Company context is required/);

  const trends = await service.getMonthlyTrends(
    { startDate: '2026-06-01', endDate: '2026-06-30' },
    { companyId: 'dmc-company' },
  );

  assert.equal(trends.months.length, 1);
  assert.equal(trends.months[0].month, '2026-06');
  assert.equal(trends.months[0].totalBookings, 2);
  assert.equal(trends.months[0].totalSell, 420);
  assert.ok(seenWheres[0].AND[0].startDate.gte instanceof Date);
  assert.ok(seenWheres[0].AND[0].startDate.lte instanceof Date);
  assert.equal(JSON.stringify(seenWheres[0]).includes('dmc-company'), false);
});

test('supplier performance groups active services by supplier and separates other suppliers', async () => {
  const { service } = createService([
    booking('booking-1', 'BK-1', 'client-1', 'Client One', '2026-06-01', [
      { totalCost: 100, totalSell: 160, supplierId: 'supplier-1', supplierName: 'Petra Hotels' },
      { totalCost: 50, totalSell: 90, supplierId: 'supplier-1', supplierName: 'Petra Hotels' },
      { totalCost: 120, totalSell: 150, supplierId: 'supplier-2', supplierName: 'Desert Transport' },
    ]),
  ]);

  const performance = await service.getSupplierPerformance({}, { companyId: 'dmc-company' });

  assert.equal(performance.suppliers.length, 2);
  assert.equal(performance.suppliers[0].supplierId, 'supplier-1');
  assert.equal(performance.suppliers[0].supplierName, 'Petra Hotels');
  assert.equal(performance.suppliers[0].serviceCount, 2);
  assert.equal(performance.suppliers[0].totalCost, 150);
  assert.equal(performance.suppliers[0].totalSell, 250);
  assert.equal(performance.suppliers[0].totalProfit, 100);
  assert.equal(performance.suppliers[0].avgMargin, 40);
  assert.equal(performance.suppliers[1].supplierId, 'supplier-2');
});

test('supplier performance uses latest amendments only and excludes cancelled bookings and services', async () => {
  const { service, seenWheres } = createService([
    booking('booking-original', 'BK-1', 'client-1', 'Client One', '2026-06-01', [
      { totalCost: 900, totalSell: 1000, supplierId: 'supplier-old', supplierName: 'Old Supplier' },
    ]),
    booking('booking-amended', 'BK-1 / A1', 'client-1', 'Client One', '2026-06-02', [
      { totalCost: 120, totalSell: 220, supplierId: 'supplier-1', supplierName: 'Petra Hotels' },
      { totalCost: 80, totalSell: 100, supplierId: 'supplier-2', supplierName: 'Cancelled Service', status: 'cancelled' },
    ], {
      amendedFromId: 'booking-original',
    }),
    booking('booking-cancelled', 'BK-2', 'client-1', 'Client One', '2026-06-03', [
      { totalCost: 500, totalSell: 700, supplierId: 'supplier-cancelled', supplierName: 'Cancelled Booking Supplier' },
    ], {
      status: 'cancelled',
    }),
  ]);

  const performance = await service.getSupplierPerformance({}, { companyId: 'dmc-company' });

  assert.equal(performance.suppliers.length, 1);
  assert.equal(performance.suppliers[0].supplierId, 'supplier-1');
  assert.equal(performance.suppliers[0].serviceCount, 1);
  assert.equal(performance.suppliers[0].totalCost, 120);
  assert.equal(performance.suppliers[0].totalSell, 220);
  assert.deepEqual(seenWheres[0].AND[1], { amendments: { none: {} } });
});

test('supplier performance requires auth without actor company filtering', async () => {
  const { service, seenWheres } = createService([
    booking('booking-1', 'BK-1', 'client-1', 'Client One', '2026-06-01', [
      { totalCost: 100, totalSell: 150, supplierId: 'supplier-1', supplierName: 'Petra Hotels' },
    ]),
    booking('booking-2', 'BK-2', 'client-2', 'Client Two', '2026-06-02', [
      { totalCost: 120, totalSell: 200, supplierId: 'supplier-2', supplierName: 'Wadi Rum Camp' },
    ]),
  ]);

  await assert.rejects(() => service.getSupplierPerformance({}, undefined as any), /Company context is required/);

  const performance = await service.getSupplierPerformance({}, { companyId: 'dmc-company' });

  assert.equal(performance.suppliers.length, 2);
  assert.deepEqual(seenWheres[0], { AND: [{}, { amendments: { none: {} } }] });
  assert.equal(JSON.stringify(seenWheres[0]).includes('dmc-company'), false);
});

test('finance summary calculates receivables from invoices and partial payments', async () => {
  const { service } = createFinanceService(
    [
      invoice('invoice-1', 'Q-1', 'Client One', 1000, '2026-01-10', [
        { type: 'CLIENT', amount: 400, status: 'PAID' },
      ]),
      invoice('invoice-2', 'Q-2', 'Client Two', 500, '2026-01-11', [
        { type: 'CLIENT', amount: 500, status: 'PAID' },
      ]),
    ],
    [],
  );

  const summary = await service.getFinanceSummary({ companyId: 'dmc-company' });

  assert.equal(summary.totalInvoiced, 1500);
  assert.equal(summary.totalPaid, 900);
  assert.equal(summary.outstandingReceivables, 600);
  assert.equal(summary.overdueReceivables, 600);
  assert.equal(summary.overdueInvoices.length, 1);
  assert.equal(summary.overdueInvoices[0].invoiceNumber, 'INV-BK-Q-1');
  assert.equal(summary.overdueInvoices[0].paidAmount, 400);
  assert.equal(summary.overdueInvoices[0].balanceDue, 600);
});

test('finance summary excludes paid and cancelled invoices from overdue and receivable totals correctly', async () => {
  const { service } = createFinanceService(
    [
      invoice('invoice-paid', 'Q-1', 'Client One', 1000, '2026-01-10', [
        { type: 'CLIENT', amount: 1000, status: 'PAID' },
      ]),
      invoice('invoice-cancelled', 'Q-2', 'Client Two', 800, '2026-01-10', [], { status: 'CANCELLED' }),
    ],
    [],
  );

  const summary = await service.getFinanceSummary({ companyId: 'dmc-company' });

  assert.equal(summary.totalInvoiced, 1000);
  assert.equal(summary.totalPaid, 1000);
  assert.equal(summary.outstandingReceivables, 0);
  assert.equal(summary.overdueReceivables, 0);
  assert.equal(summary.overdueInvoices.length, 0);
});

test('finance summary calculates supplier payable totals and unpaid rows', async () => {
  const { service } = createFinanceService(
    [],
    [
      supplierPayment('supplier-payable-1', 'BK-1', 300, 'PENDING', 'service:service-1', 'Supplier payable | supplier:Petra Hotel | Hotel'),
      supplierPayment('supplier-payable-2', 'BK-2', 125, 'PAID', 'service:service-2', 'Supplier payable | supplier:Desert Transport | Transfer'),
    ],
  );

  const summary = await service.getFinanceSummary({ companyId: 'dmc-company' });

  assert.equal(summary.supplierPayables, 425);
  assert.equal(summary.supplierPaid, 125);
  assert.equal(summary.outstandingSupplierPayables, 300);
  assert.equal(summary.netCashPosition, -125);
  assert.equal(summary.unpaidSupplierPayables.length, 1);
  assert.equal(summary.unpaidSupplierPayables[0].supplierName, 'Petra Hotel');
  assert.equal(summary.unpaidSupplierPayables[0].bookingRef, 'BK-1');
  assert.equal(summary.unpaidSupplierPayables[0].serviceName, 'Hotel');
});

test('finance summary requires auth without actor company filtering', async () => {
  const { service, seenInvoiceWheres, seenPaymentWheres } = createFinanceService(
    [invoice('invoice-1', 'Q-1', 'Client One', 100, '2026-01-10', [])],
    [supplierPayment('supplier-payable-1', 'BK-1', 50, 'PENDING', 'service:service-1', 'Supplier payable | supplier:Petra Hotel | Hotel')],
  );

  await assert.rejects(() => service.getFinanceSummary(undefined as any), /Company context is required/);

  await service.getFinanceSummary({ companyId: 'dmc-company' });

  assert.deepEqual(seenInvoiceWheres[0], {});
  assert.deepEqual(seenPaymentWheres[0], { type: 'SUPPLIER' });
  assert.equal(JSON.stringify(seenInvoiceWheres[0]).includes('dmc-company'), false);
  assert.equal(JSON.stringify(seenPaymentWheres[0]).includes('dmc-company'), false);
});

test('alerts include overdue invoice with days overdue and exclude paid and cancelled invoices', async () => {
  const { service } = createFinanceService(
    [
      invoice('invoice-overdue', 'Q-1', 'Client One', 1000, '2026-01-10', [
        { type: 'CLIENT', amount: 400, status: 'PAID' },
      ]),
      invoice('invoice-paid', 'Q-2', 'Client Two', 500, '2026-01-10', [
        { type: 'CLIENT', amount: 500, status: 'PAID' },
      ]),
      invoice('invoice-cancelled', 'Q-3', 'Client Three', 700, '2026-01-10', [], { status: 'CANCELLED' }),
    ],
    [],
  );

  const alerts = await service.getAlerts({ companyId: 'dmc-company' });

  assert.equal(alerts.overdueReceivables.length, 1);
  assert.equal(alerts.overdueReceivables[0].invoiceId, 'invoice-overdue');
  assert.equal(alerts.overdueReceivables[0].balanceDue, 600);
  assert.ok(alerts.overdueReceivables[0].daysOverdue > 0);
});

test('alerts include low-margin bookings and exclude healthy-margin bookings', async () => {
  const { service } = createFinanceService(
    [],
    [],
    [
      booking('booking-low', 'BK-LOW', 'client-1', 'Client One', '2026-06-01', [
        { totalCost: 900, totalSell: 1000 },
      ]),
      booking('booking-healthy', 'BK-OK', 'client-2', 'Client Two', '2026-06-02', [
        { totalCost: 600, totalSell: 1000 },
      ]),
    ],
  );

  const alerts = await service.getAlerts({ companyId: 'dmc-company' });

  assert.equal(alerts.lowMarginBookings.length, 1);
  assert.equal(alerts.lowMarginBookings[0].bookingId, 'booking-low');
  assert.equal(alerts.lowMarginBookings[0].marginPercent, 10);
});

test('alerts include high-cost services and exclude cancelled bookings and services', async () => {
  const { service } = createFinanceService(
    [],
    [],
    [
      booking('booking-risk', 'BK-RISK', 'client-1', 'Client One', '2026-06-01', [
        { id: 'service-risk', description: 'Risky service', totalCost: 950, totalSell: 1000, supplierName: 'Risk Supplier' },
        { id: 'service-cancelled', description: 'Cancelled service', totalCost: 2000, totalSell: 1000, status: 'cancelled', supplierName: 'Old Supplier' },
      ]),
      booking('booking-cancelled', 'BK-CAN', 'client-2', 'Client Two', '2026-06-02', [
        { id: 'service-booking-cancelled', description: 'Cancelled booking service', totalCost: 2000, totalSell: 1000, supplierName: 'Hidden Supplier' },
      ], {
        status: 'cancelled',
      }),
    ],
  );

  const alerts = await service.getAlerts({ companyId: 'dmc-company' });

  assert.equal(alerts.highCostServices.length, 1);
  assert.equal(alerts.highCostServices[0].serviceId, 'service-risk');
  assert.equal(alerts.highCostServices[0].supplierName, 'Risk Supplier');
});

test('alerts include only latest booking amendments', async () => {
  const { service, seenBookingWheres } = createFinanceService(
    [],
    [],
    [
      booking('booking-original', 'BK-1', 'client-1', 'Client One', '2026-06-01', [
        { id: 'service-old', totalCost: 900, totalSell: 1000 },
      ]),
      booking('booking-amended', 'BK-1 / A1', 'client-1', 'Client One', '2026-06-01', [
        { id: 'service-new', totalCost: 100, totalSell: 1000 },
      ], {
        amendedFromId: 'booking-original',
      }),
    ],
  );

  const alerts = await service.getAlerts({ companyId: 'dmc-company' });

  assert.equal(alerts.lowMarginBookings.length, 0);
  assert.equal(alerts.highCostServices.length, 0);
  assert.deepEqual(seenBookingWheres[0].AND[1], { amendments: { none: {} } });
});

test('alerts include unpaid supplier payables and require auth without actor company filtering', async () => {
  const { service, seenInvoiceWheres, seenPaymentWheres, seenBookingWheres } = createFinanceService(
    [],
    [supplierPayment('supplier-payable-1', 'BK-1', 300, 'PENDING', 'service:service-1', 'Supplier payable | supplier:Petra Hotel | Hotel')],
    [],
  );

  await assert.rejects(() => service.getAlerts(undefined as any), /Company context is required/);

  const alerts = await service.getAlerts({ companyId: 'dmc-company' });

  assert.equal(alerts.unpaidSupplierPayables.length, 1);
  assert.equal(alerts.unpaidSupplierPayables[0].supplierName, 'Petra Hotel');
  assert.equal(alerts.unpaidSupplierPayables[0].balanceDue, 300);
  assert.deepEqual(seenInvoiceWheres[0], {});
  assert.deepEqual(seenPaymentWheres[0], { type: 'SUPPLIER' });
  assert.deepEqual(seenBookingWheres[0], { AND: [{}, { amendments: { none: {} } }] });
  assert.equal(JSON.stringify(seenInvoiceWheres[0]).includes('dmc-company'), false);
  assert.equal(JSON.stringify(seenPaymentWheres[0]).includes('dmc-company'), false);
});

function booking(
  id: string,
  bookingRef: string,
  clientCompanyId: string,
  clientName: string,
  startDate: string,
  services: Array<{ id?: string; description?: string; serviceType?: string; totalCost: number; totalSell: number; status?: string; supplierId?: string | null; supplierName?: string | null }>,
  options: { status?: string; amendedFromId?: string | null } = {},
) {
  return {
    id,
    bookingRef,
    clientCompanyId,
    amendedFromId: options.amendedFromId ?? null,
    clientSnapshotJson: { name: clientName },
    startDate: new Date(`${startDate}T12:00:00.000Z`),
    status: options.status || 'confirmed',
    pricingSnapshotJson: { totalCost: 0, totalSell: 0 },
    services: services.map((service, index) => ({
      id: service.id || `service-${id}-${index + 1}`,
      description: service.description || null,
      serviceType: service.serviceType || 'SERVICE',
      ...service,
    })),
  };
}

function invoice(
  id: string,
  quoteNumber: string,
  clientCompanyName: string,
  totalAmount: number,
  dueDate: string,
  payments: Array<{ type: string; amount: number; status: string }>,
  options: { status?: string } = {},
) {
  return {
    id,
    totalAmount,
    currency: 'USD',
    status: options.status || 'ISSUED',
    dueDate: new Date(`${dueDate}T12:00:00.000Z`),
    quote: {
      quoteNumber,
      clientCompany: { name: clientCompanyName },
      booking: {
        id: `booking-${id}`,
        bookingRef: `BK-${quoteNumber}`,
        payments,
      },
    },
  };
}

function supplierPayment(
  id: string,
  bookingRef: string,
  amount: number,
  status: string,
  reference: string,
  notes: string,
) {
  return {
    id,
    bookingId: `booking-${bookingRef}`,
    type: 'SUPPLIER',
    amount,
    currency: 'USD',
    status,
    reference,
    notes,
    booking: {
      bookingRef,
      services: [
        {
          id: reference.replace(/^service:/, ''),
          description: notes.split('|').pop()?.trim(),
          serviceType: 'SERVICE',
          supplierName: notes.match(/supplier:([^|]+)/)?.[1]?.trim() || null,
          supplier: null,
        },
      ],
    },
  };
}

function matchesWhere(booking: any, where: any, bookings: any[]): boolean {
  if (!where) return true;
  if (Array.isArray(where.AND)) {
    return where.AND.every((condition: any) => matchesWhere(booking, condition, bookings));
  }

  if (where.startDate) {
    if (where.startDate.gte && booking.startDate < where.startDate.gte) return false;
    if (where.startDate.lte && booking.startDate > where.startDate.lte) return false;
  }

  if (where.amendments?.none) {
    const hasNewerAmendment = bookings.some((candidate) => candidate.amendedFromId === booking.id);
    if (hasNewerAmendment) return false;
  }

  return true;
}
