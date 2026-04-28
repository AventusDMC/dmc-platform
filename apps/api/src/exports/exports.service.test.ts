import test = require('node:test');
import assert = require('node:assert/strict');
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

function createService({ invoices = [], payments = [] }: { invoices?: any[]; payments?: any[] }) {
  const seenInvoiceWheres: any[] = [];
  const seenPaymentWheres: any[] = [];
  const service = new ExportsService({
    invoice: {
      findMany: async ({ where }: any) => {
        seenInvoiceWheres.push(where);
        return invoices.filter((invoice) => matchesAndWhere(invoice, where));
      },
    },
    payment: {
      findMany: async ({ where }: any) => {
        seenPaymentWheres.push(where);
        return payments.filter((payment) => matchesAndWhere(payment, where));
      },
    },
  } as any);

  return { service, seenInvoiceWheres, seenPaymentWheres };
}

test('invoice CSV includes correct columns and derived totals', async () => {
  const { service } = createService({
    invoices: [
      invoice('invoice-1', 'ISSUED', '2026-05-10', 500, [
        { type: 'CLIENT', status: 'PAID', amount: 125 },
        { type: 'CLIENT', status: 'PENDING', amount: 50 },
      ]),
    ],
  });

  const exported = await service.exportInvoices({}, { companyId: 'dmc-company' });

  assert.equal(exported.fileName, 'invoices.csv');
  assert.match(exported.content, /invoiceNumber,issueDate,dueDate,clientCompanyName,bookingRef,currency,subtotal,taxAmount,totalAmount,paidAmount,balanceDue,status/);
  assert.match(exported.content, /INV-BK-1,2026-05-03,2026-05-10,Client One,BK-1,USD,500,0,500,125,375,issued/);
});

test('payments CSV includes client payment rows', async () => {
  const { service } = createService({
    payments: [
      clientPayment('payment-1', 'PAID', '2026-05-04', 200, {
        reference: 'WIRE-1',
        notes: 'Deposit',
      }),
    ],
  });

  const exported = await service.exportPayments({}, { companyId: 'dmc-company' });

  assert.match(exported.content, /paymentDate,invoiceNumber,clientCompanyName,amount,currency,method,reference,notes/);
  assert.match(exported.content, /2026-05-04,INV-BK-1,Client One,200,USD,bank,WIRE-1,Deposit/);
});

test('supplier payables CSV includes internal payable rows', async () => {
  const { service } = createService({
    payments: [
      supplierPayment('supplier-payment-1', 'PENDING', '2026-05-04', 300, {
        reference: 'service:service-1',
      }),
    ],
  });

  const exported = await service.exportSupplierPayables({}, { companyId: 'dmc-company' });

  assert.match(exported.content, /supplierName,bookingRef,serviceName,currency,amount,paidAmount,balanceDue,status,reference/);
  assert.match(exported.content, /Petra Hotel,BK-1,Hotel,USD,300,0,300,pending,service:service-1/);
});

test('CSV exports apply date filters', async () => {
  const { service, seenInvoiceWheres } = createService({
    invoices: [invoice('invoice-1', 'ISSUED', '2026-05-10', 500)],
  });

  await service.exportInvoices({ startDate: '2026-05-01', endDate: '2026-05-31' }, { companyId: 'dmc-company' });

  assert.ok(seenInvoiceWheres[0].AND[0].dueDate.gte instanceof Date);
  assert.ok(seenInvoiceWheres[0].AND[0].dueDate.lte instanceof Date);
});

test('invoice CSV excludes cancelled invoices by default unless requested', async () => {
  const { service } = createService({
    invoices: [
      invoice('invoice-1', 'ISSUED', '2026-05-10', 500),
      invoice('invoice-2', 'CANCELLED', '2026-05-11', 700),
    ],
  });

  const activeExport = await service.exportInvoices({}, { companyId: 'dmc-company' });
  const cancelledExport = await service.exportInvoices({ status: 'cancelled' }, { companyId: 'dmc-company' });

  assert.match(activeExport.content, /INV-BK-1/);
  assert.doesNotMatch(activeExport.content, /INV-BK-2/);
  assert.match(cancelledExport.content, /INV-BK-2/);
});

test('CSV exports require auth company context without actor company filtering', async () => {
  const { service, seenInvoiceWheres } = createService({
    invoices: [invoice('invoice-1', 'ISSUED', '2026-05-10', 500)],
  });

  await assert.rejects(() => service.exportInvoices({}, undefined), /Company context is required/);

  await service.exportInvoices({}, { companyId: 'actor-company' });
  assert.doesNotMatch(JSON.stringify(seenInvoiceWheres[0]), /actor-company|companyId/);
});

test('CSV controller sets content type and disposition headers', async () => {
  const controller = new ExportsController({
    exportInvoices: async () => ({
      fileName: 'invoices.csv',
      content: 'invoiceNumber\r\nINV-1\r\n',
    }),
  } as any);
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };

  await controller.exportInvoices(undefined, undefined, undefined, { companyId: 'dmc-company' } as any, response);

  assert.equal(headers['Content-Type'], 'text/csv; charset=utf-8');
  assert.equal(headers['Content-Disposition'], 'attachment; filename="invoices.csv"');
});

function invoice(id: string, status: string, dueDate: string, totalAmount: number, payments: any[] = []) {
  const suffix = id.replace(/\D/g, '') || '1';
  return {
    id,
    status,
    dueDate: new Date(`${dueDate}T00:00:00.000Z`),
    totalAmount,
    currency: 'USD',
    quote: {
      quoteNumber: `Q-${suffix}`,
      clientCompany: { name: `Client ${suffix === '1' ? 'One' : 'Two'}` },
      booking: {
        bookingRef: `BK-${suffix}`,
        payments,
      },
    },
  };
}

function clientPayment(id: string, status: string, createdAt: string, amount: number, overrides: any = {}) {
  return {
    id,
    type: 'CLIENT',
    status,
    amount,
    currency: 'USD',
    method: 'bank',
    reference: null,
    notes: null,
    paidAt: new Date(`${createdAt}T00:00:00.000Z`),
    createdAt: new Date(`${createdAt}T00:00:00.000Z`),
    booking: {
      quote: {
        invoice: invoice('invoice-1', 'ISSUED', '2026-05-10', 500),
        clientCompany: { name: 'Client One' },
      },
    },
    ...overrides,
  };
}

function supplierPayment(id: string, status: string, createdAt: string, amount: number, overrides: any = {}) {
  return {
    id,
    type: 'SUPPLIER',
    status,
    amount,
    currency: 'USD',
    method: 'bank',
    reference: null,
    notes: 'Supplier payable | supplier:Petra Hotel | Hotel',
    paidAt: null,
    createdAt: new Date(`${createdAt}T00:00:00.000Z`),
    bookingId: 'booking-1',
    booking: {
      bookingRef: 'BK-1',
      services: [
        {
          id: 'service-1',
          description: 'Hotel',
          serviceType: 'HOTEL',
          supplierName: 'Petra Hotel',
          supplier: { name: 'Petra Hotel' },
        },
      ],
    },
    ...overrides,
  };
}

function matchesAndWhere(record: any, where: any) {
  if (!where?.AND) {
    return true;
  }

  return where.AND.every((condition: any) => matchesCondition(record, condition));
}

function matchesCondition(record: any, condition: any) {
  if (!condition || Object.keys(condition).length === 0) {
    return true;
  }
  if (condition.type && record.type !== condition.type) {
    return false;
  }
  if (condition.status) {
    if (condition.status.not && record.status === condition.status.not) {
      return false;
    }
    if (typeof condition.status === 'string' && record.status !== condition.status) {
      return false;
    }
  }
  if (condition.dueDate) {
    return matchesDate(record.dueDate, condition.dueDate);
  }
  if (condition.createdAt) {
    return matchesDate(record.createdAt, condition.createdAt);
  }
  return true;
}

function matchesDate(value: Date, condition: any) {
  if (condition.gte && value < condition.gte) {
    return false;
  }
  if (condition.lte && value > condition.lte) {
    return false;
  }
  return true;
}
