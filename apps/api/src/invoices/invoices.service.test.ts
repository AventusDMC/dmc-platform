import test = require('node:test');
import assert = require('node:assert/strict');
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { InvoicesService } from './invoices.service';

const actor = { companyId: 'dmc-company', id: 'user-1', auditLabel: 'Finance User' } as any;

function createService(options: {
  booking?: any;
  invoice?: any;
  payments?: any[];
} = {}) {
  const calls: Record<string, any[]> = {
    bookingFindFirst: [],
    invoiceCreate: [],
    invoiceFindFirst: [],
    paymentCreate: [],
    bookingUpdate: [],
    invoiceUpdate: [],
    auditCreate: [],
  };
  const payments = [...(options.payments || [])];
  const booking = options.booking || bookingRecord();
  let invoice = options.invoice || invoiceRecord({ booking, payments });

  const prisma = {
    $transaction: async (callback: any) => callback(prisma),
    booking: {
      findFirst: async (args: any) => {
        calls.bookingFindFirst.push(args);
        return booking;
      },
      update: async (args: any) => {
        calls.bookingUpdate.push(args);
        return { ...booking, ...args.data };
      },
    },
    invoice: {
      findMany: async (args: any) => {
        calls.invoiceFindFirst.push(args);
        return [invoiceRecord({ ...invoice, booking: { ...booking, payments } })];
      },
      create: async (args: any) => {
        calls.invoiceCreate.push(args);
        invoice = invoiceRecord({
          booking: { ...booking, payments },
          status: args.data.status,
          totalAmount: args.data.totalAmount,
          currency: args.data.currency,
          dueDate: args.data.dueDate,
        });
        return invoice;
      },
      findFirst: async (args: any) => {
        calls.invoiceFindFirst.push(args);
        return invoiceRecord({ ...invoice, booking: { ...booking, payments } });
      },
      update: async (args: any) => {
        calls.invoiceUpdate.push(args);
        invoice = { ...invoice, ...args.data };
        return invoice;
      },
    },
    payment: {
      create: async (args: any) => {
        calls.paymentCreate.push(args);
        const payment = {
          id: `payment-${payments.length + 1}`,
          createdAt: new Date('2026-06-01T12:00:00.000Z'),
          updatedAt: new Date('2026-06-01T12:00:00.000Z'),
          ...args.data,
        };
        payments.push(payment);
        return payment;
      },
      aggregate: async (args: any) => ({
        _sum: {
          amount: payments
            .filter((payment) => {
              if (args.where.bookingId && payment.bookingId !== args.where.bookingId) return false;
              if (args.where.type && payment.type !== args.where.type) return false;
              if (args.where.status && payment.status !== args.where.status) return false;
              return true;
            })
            .reduce((total, payment) => total + Number(payment.amount || 0), 0),
        },
      }),
    },
    invoiceAuditLog: {
      create: async (args: any) => {
        calls.auditCreate.push(args);
        return args.data;
      },
    },
  };

  return { service: new InvoicesService(prisma as any), calls, payments };
}

test('generates an invoice from a latest active booking using booking sell total', async () => {
  const { service, calls } = createService();

  const invoice = await service.generateForBooking('booking-1', { companyActor: actor });

  assert.equal(invoice.totalAmount, 500);
  assert.equal(invoice.currency, 'USD');
  assert.equal(invoice.balanceDue, 500);
  assert.equal(invoice.effectiveStatus, 'issued');
  assert.equal(calls.invoiceCreate[0].data.quoteId, 'quote-1');
  assert.equal(calls.invoiceCreate[0].data.totalAmount, 500);
});

test('generates supplier payable placeholders from active service cost without leaking cost on invoice response', async () => {
  const { service, calls } = createService();

  const invoice = await service.generateForBooking('booking-1', { companyActor: actor });

  const supplierPayments = calls.paymentCreate.filter((call) => call.data.type === 'SUPPLIER');
  assert.equal(supplierPayments.length, 2);
  assert.equal(supplierPayments[0].data.amount, 120);
  assert.equal(supplierPayments[0].data.reference, 'service:service-1');
  assert.equal(supplierPayments[1].data.amount, 80);
  assert.equal(JSON.stringify(invoice).includes('supplier payable'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(invoice, 'totalCost'), false);
});

test('recording invoice payment reduces balance and exposes partially paid status', async () => {
  const { service } = createService();

  const invoice = await service.createPayment('invoice-1', {
    amount: 200,
    currency: 'USD',
    method: 'bank',
    paymentDate: '2026-06-02',
    companyActor: actor,
  });

  assert.equal(invoice.paidAmount, 200);
  assert.equal(invoice.balanceDue, 300);
  assert.equal(invoice.effectiveStatus, 'partially_paid');
  assert.equal(invoice.status, 'ISSUED');
});

test('recording full invoice payment marks invoice paid', async () => {
  const { service } = createService();

  const invoice = await service.createPayment('invoice-1', {
    amount: 500,
    currency: 'USD',
    method: 'card',
    paymentDate: '2026-06-02',
    companyActor: actor,
  });

  assert.equal(invoice.paidAmount, 500);
  assert.equal(invoice.balanceDue, 0);
  assert.equal(invoice.effectiveStatus, 'paid');
  assert.equal(invoice.status, 'PAID');
});

test('cancelled bookings cannot generate invoices', async () => {
  const { service } = createService({
    booking: bookingRecord({ status: 'cancelled' }),
  });

  await assert.rejects(() => service.generateForBooking('booking-1', { companyActor: actor }), /Cancelled bookings cannot generate new invoices/);
});

test('old booking amendments cannot generate invoices', async () => {
  const { service } = createService({
    booking: bookingRecord({ amendments: [{ id: 'booking-amended' }] }),
  });

  await assert.rejects(() => service.generateForBooking('booking-1', { companyActor: actor }), /Only the latest booking amendment can generate invoices/);
});

test('invoice generation requires auth without actor company filtering', async () => {
  const { service, calls } = createService();

  await assert.rejects(() => service.generateForBooking('booking-1', {}), /Company context is required/);

  await service.generateForBooking('booking-1', { companyActor: actor });

  assert.deepEqual(calls.bookingFindFirst[0].where, { id: 'booking-1' });
  assert.equal(JSON.stringify(calls.bookingFindFirst[0].where).includes(actor.companyId), false);
});

test('invoice PDF is generated and excludes supplier cost profit margin and supplier payment data', async () => {
  const { service } = createService();

  const pdfBuffer = await service.generatePdf('invoice-1', actor);
  const pdfText = pdfBuffer.toString('latin1');

  assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
  assert.equal(pdfText.includes('supplier cost'), false);
  assert.equal(pdfText.includes('gross profit'), false);
  assert.equal(pdfText.includes('margin'), false);
  assert.equal(pdfText.includes('Supplier payable'), false);
});

test('invoice PDF includes premium client-ready layout sections', async () => {
  const { service } = createService();
  const serviceSource = readFileSync(resolve(__dirname, 'invoices.service.ts'), 'utf8');

  const pdfBuffer = await service.generatePdf('invoice-1', actor);

  assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
  assert.match(serviceSource, /Client Info/);
  assert.match(serviceSource, /Invoice Details/);
  assert.match(serviceSource, /Line Items/);
  assert.match(serviceSource, /Totals/);
  assert.match(serviceSource, /Payment Instructions/);
  assert.match(serviceSource, /Balance due/);
  assert.match(serviceSource, /Thank you for your business/);
});

test('send invoice uses client contact email and attaches invoice PDF', async () => {
  const { service, calls } = createService();
  const sentMessages: any[] = [];
  (service as any).createMailTransport = () => ({
    sendMail: async (message: any) => {
      sentMessages.push(message);
      return { messageId: 'message-1' };
    },
  });

  const result = await service.sendInvoice('invoice-1', { companyActor: actor });

  assert.equal(result.email, 'client@example.com');
  assert.equal(sentMessages[0].to, 'client@example.com');
  assert.equal(sentMessages[0].subject, 'Invoice INV-B-100');
  assert.equal(sentMessages[0].attachments[0].content.subarray(0, 4).toString(), '%PDF');
  assert.equal(calls.auditCreate.at(-1).data.action, 'invoice_sent');
});

test('send invoice supports override email', async () => {
  const { service } = createService();
  const sentMessages: any[] = [];
  (service as any).createMailTransport = () => ({
    sendMail: async (message: any) => {
      sentMessages.push(message);
      return { messageId: 'message-override' };
    },
  });

  const result = await service.sendInvoice('invoice-1', {
    email: 'override@example.com',
    companyActor: actor,
  });

  assert.equal(result.email, 'override@example.com');
  assert.equal(sentMessages[0].to, 'override@example.com');
});

test('send invoice fails cleanly without recipient', async () => {
  const booking = bookingRecord({
    quote: {
      ...bookingRecord().quote,
      contact: { firstName: 'Ala', lastName: 'Saleh', email: null },
    },
    contactSnapshotJson: {},
  });
  const { service } = createService({ booking });

  await assert.rejects(() => service.sendInvoice('invoice-1', { companyActor: actor }), /No recipient email is available/);
});

test('cancelled invoice cannot be sent by default', async () => {
  const { service } = createService({
    invoice: invoiceRecord({ status: 'CANCELLED' }),
  });

  await assert.rejects(() => service.sendInvoice('invoice-1', { companyActor: actor }), /Cancelled invoices cannot be sent by default/);
});

test('invoice PDF and send require auth without actor company filtering', async () => {
  const { service, calls } = createService();
  (service as any).createMailTransport = () => ({
    sendMail: async () => ({ messageId: 'message-1' }),
  });

  await assert.rejects(() => service.generatePdf('invoice-1', undefined as any), /Company context is required/);
  await assert.rejects(() => service.sendInvoice('invoice-1', { companyActor: undefined as any }), /Company context is required/);

  await service.generatePdf('invoice-1', actor);
  await service.sendInvoice('invoice-1', { companyActor: actor });

  assert.deepEqual(calls.invoiceFindFirst.at(-2).where, { id: 'invoice-1' });
  assert.deepEqual(calls.invoiceFindFirst.at(-1).where, { id: 'invoice-1' });
  assert.equal(JSON.stringify(calls.invoiceFindFirst.at(-1).where).includes(actor.companyId), false);
});

test('payment reminder sent for valid unpaid invoice with PDF attached', async () => {
  const { service, calls } = createService({
    invoice: invoiceRecord({ dueDate: new Date('2026-01-10T12:00:00.000Z') }),
  });
  const sentMessages: any[] = [];
  (service as any).createMailTransport = () => ({
    sendMail: async (message: any) => {
      sentMessages.push(message);
      return { messageId: 'reminder-1' };
    },
  });

  const result = await service.sendReminder('invoice-1', { companyActor: actor });

  assert.equal(result.email, 'client@example.com');
  assert.ok(result.daysOverdue > 0);
  assert.equal(sentMessages[0].to, 'client@example.com');
  assert.equal(sentMessages[0].subject, 'Payment Reminder: Invoice INV-B-100');
  assert.match(sentMessages[0].text, /Balance due|outstanding balance/i);
  assert.equal(sentMessages[0].attachments[0].content.subarray(0, 4).toString(), '%PDF');
  assert.equal(calls.auditCreate.at(-1).data.action, 'reminder_sent');
});

test('payment reminder supports override email', async () => {
  const { service } = createService();
  const sentMessages: any[] = [];
  (service as any).createMailTransport = () => ({
    sendMail: async (message: any) => {
      sentMessages.push(message);
      return { messageId: 'reminder-override' };
    },
  });

  const result = await service.sendReminder('invoice-1', {
    email: 'override@example.com',
    companyActor: actor,
  });

  assert.equal(result.email, 'override@example.com');
  assert.equal(sentMessages[0].to, 'override@example.com');
});

test('payment reminder blocks paid and cancelled invoices', async () => {
  const paidService = createService({
    invoice: invoiceRecord({ status: 'PAID' }),
    payments: [{ bookingId: 'booking-1', type: 'CLIENT', amount: 500, status: 'PAID' }],
  }).service;
  const cancelledService = createService({
    invoice: invoiceRecord({ status: 'CANCELLED' }),
  }).service;

  await assert.rejects(() => paidService.sendReminder('invoice-1', { companyActor: actor }), /Paid invoices cannot receive payment reminders/);
  await assert.rejects(() => cancelledService.sendReminder('invoice-1', { companyActor: actor }), /Cancelled invoices cannot receive payment reminders/);
});

test('payment reminder fails cleanly without recipient', async () => {
  const booking = bookingRecord({
    quote: {
      ...bookingRecord().quote,
      contact: { firstName: 'Ala', lastName: 'Saleh', email: null },
    },
    contactSnapshotJson: {},
  });
  const { service } = createService({ booking });

  await assert.rejects(() => service.sendReminder('invoice-1', { companyActor: actor }), /No recipient email is available/);
});

test('bulk overdue reminders send only overdue invoices', async () => {
  const { service } = createService({
    invoice: invoiceRecord({ dueDate: new Date('2026-01-10T12:00:00.000Z') }),
  });
  let sendCount = 0;
  (service as any).createMailTransport = () => ({
    sendMail: async () => {
      sendCount += 1;
      return { messageId: `bulk-${sendCount}` };
    },
  });

  const result = await service.sendOverdueReminders({ companyActor: actor });

  assert.equal(result.sentCount, 1);
  assert.equal(sendCount, 1);
});

test('payment reminders require auth without actor company filtering', async () => {
  const { service, calls } = createService();
  (service as any).createMailTransport = () => ({
    sendMail: async () => ({ messageId: 'reminder-1' }),
  });

  await assert.rejects(() => service.sendReminder('invoice-1', { companyActor: undefined as any }), /Company context is required/);
  await assert.rejects(() => service.sendOverdueReminders({ companyActor: undefined as any }), /Company context is required/);

  await service.sendReminder('invoice-1', { companyActor: actor });

  assert.deepEqual(calls.invoiceFindFirst.at(-1).where, { id: 'invoice-1' });
  assert.equal(JSON.stringify(calls.invoiceFindFirst.at(-1).where).includes(actor.companyId), false);
});

function bookingRecord(overrides: any = {}) {
  return {
    id: 'booking-1',
    quoteId: 'quote-1',
    bookingRef: 'B-100',
    clientCompanyId: 'client-1',
    status: 'confirmed',
    supplierPaymentStatus: 'unpaid',
    pricingSnapshotJson: { totalSell: 500, totalCost: 200, currency: 'USD' },
    snapshotJson: { totalSell: 500, totalCost: 200, currency: 'USD' },
    quote: {
      id: 'quote-1',
      quoteNumber: 'Q-100',
      title: 'Jordan Highlights',
      status: 'ACCEPTED',
      clientCompany: { name: 'Client Co' },
      contact: { firstName: 'Ala', lastName: 'Saleh', email: 'client@example.com' },
      invoice: null,
    },
    amendments: [],
    services: [
      {
        id: 'service-1',
        serviceType: 'HOTEL',
        description: 'Hotel',
        supplierId: 'supplier-1',
        supplierName: 'Petra Hotel',
        totalCost: 120,
        totalSell: 300,
        status: 'confirmed',
      },
      {
        id: 'service-2',
        serviceType: 'ACTIVITY',
        description: 'Tour',
        supplierId: 'supplier-2',
        supplierName: 'Petra Tours',
        totalCost: 80,
        totalSell: 200,
        status: 'confirmed',
      },
    ],
    payments: [],
    contactSnapshotJson: { email: 'snapshot@example.com' },
    startDate: new Date('2026-06-01T12:00:00.000Z'),
    endDate: new Date('2026-06-05T12:00:00.000Z'),
    ...overrides,
  };
}

function invoiceRecord(options: any = {}) {
  const booking = options.booking || bookingRecord();
  const payments = options.payments || booking.payments || [];

  return {
    id: options.id || 'invoice-1',
    quoteId: 'quote-1',
    totalAmount: options.totalAmount ?? 500,
    currency: options.currency || 'USD',
    status: options.status || 'ISSUED',
    dueDate: options.dueDate || new Date('2026-06-08T12:00:00.000Z'),
    quote: {
      ...booking.quote,
      booking: {
        ...booking,
        payments,
      },
    },
    auditLogs: [],
  };
}
