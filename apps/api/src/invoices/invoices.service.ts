import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import nodemailer = require('nodemailer');
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';

type InvoiceStatusValue = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
type QuoteStatusValue = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';

type AuditActor = {
  userId: string;
  label?: string | null;
} | null;

const INVOICE_STATUS_TRANSITIONS: Record<InvoiceStatusValue, InvoiceStatusValue[]> = {
  DRAFT: [],
  ISSUED: ['PAID', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

const ACTIVE_SERVICE_STATUS = 'cancelled';

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    return (this.prisma as any).invoice.findMany({
      where: {},
      include: {
        quote: {
          include: {
            clientCompany: true,
            contact: true,
            booking: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
    });
  }

  async findOne(id: string, actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    const invoice = await (this.prisma as any).invoice.findFirst({
      where: {
        id,
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
            contact: true,
            booking: {
              include: {
                payments: {
                  orderBy: [{ createdAt: 'desc' }],
                },
              },
            },
          },
        },
        auditLogs: {
          orderBy: [{ createdAt: 'desc' }],
        },
      },
    });

    return invoice ? this.enrichInvoice(invoice) : null;
  }

  async generateForBooking(
    bookingId: string,
    data: {
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    requireActorCompanyId(data.companyActor);
    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const booking = await (tx as any).booking.findFirst({
        where: {
          id: bookingId,
        },
        include: {
          quote: {
            include: {
              invoice: true,
            },
          },
          amendments: {
            select: {
              id: true,
            },
          },
          services: {
            select: {
              id: true,
              serviceType: true,
              description: true,
              supplierId: true,
              supplierName: true,
              totalCost: true,
              totalSell: true,
              status: true,
            },
          },
          payments: true,
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (booking.status === 'cancelled') {
        throw new BadRequestException('Cancelled bookings cannot generate new invoices');
      }

      if ((booking.amendments || []).length > 0) {
        throw new BadRequestException('Only the latest booking amendment can generate invoices');
      }

      const activeServices = (booking.services || []).filter((service: any) => service.status !== ACTIVE_SERVICE_STATUS);
      const totals = this.calculateBookingTotals(booking, activeServices);
      const dueDate = this.addDays(new Date(), 7);
      const invoice =
        booking.quote.invoice ||
        (await (tx as any).invoice.create({
          data: {
            quoteId: booking.quoteId,
            totalAmount: totals.totalSell,
            currency: totals.currency,
            status: 'ISSUED',
            dueDate,
          },
        }));

      await this.ensureSupplierPayables(tx, booking.id, activeServices, totals.currency, dueDate, booking.payments || []);

      await (tx as any).booking.update({
        where: { id: booking.id },
        data: {
          clientInvoiceStatus: 'invoiced',
          supplierPaymentStatus:
            activeServices.some((service: any) => Number(service.totalCost || 0) > 0) ? 'scheduled' : booking.supplierPaymentStatus,
        },
      });

      await (tx as any).invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          quoteId: booking.quoteId,
          action: booking.quote.invoice ? 'booking_invoice_reused' : 'booking_invoice_generated',
          oldValue: null,
          newValue: invoice.status,
          note: `Generated from booking ${booking.bookingRef || booking.id}`,
          actorUserId: this.normalizeActorUserId(data.actor),
          actor: this.normalizeActorLabel(data.actor),
        },
      });

      return invoice.id;
    });

    const invoice = await this.findOne(invoiceId, data.companyActor);

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async createPayment(
    id: string,
    data: {
      paymentDate?: string | Date | null;
      amount: number;
      currency?: string | null;
      method?: 'bank' | 'cash' | 'card' | null;
      reference?: string | null;
      notes?: string | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    requireActorCompanyId(data.companyActor);
    const amount = this.normalizeAmount(data.amount);

    const invoice = await (this.prisma as any).invoice.findFirst({
      where: {
        id,
      },
      include: {
        quote: {
          include: {
            booking: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const booking = invoice.quote.booking;

    if (!booking) {
      throw new BadRequestException('Invoice is not linked to a booking');
    }

    const paymentDate = this.normalizeDate(data.paymentDate, 'Payment date is invalid') ?? new Date();
    const currency = this.normalizeCurrency(data.currency || invoice.currency);
    const method = this.normalizeMethod(data.method);

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).payment.create({
        data: {
          bookingId: booking.id,
          type: 'CLIENT',
          amount,
          currency,
          status: 'PAID',
          method,
          reference: this.normalizeOptionalText(data.reference),
          dueDate: null,
          paidAt: paymentDate,
          notes: this.normalizeOptionalText(data.notes),
        },
      });

      const paid = await this.sumPaidClientPayments(tx, booking.id);
      const balanceDue = this.roundMoney(Math.max(Number(invoice.totalAmount || 0) - paid, 0));
      const nextStatus = balanceDue <= 0 ? 'PAID' : invoice.status === 'DRAFT' ? 'ISSUED' : invoice.status;

      await (tx as any).invoice.update({
        where: { id: invoice.id },
        data: {
          status: nextStatus,
        },
      });

      await (tx as any).booking.update({
        where: { id: booking.id },
        data: {
          clientInvoiceStatus: balanceDue <= 0 ? 'paid' : 'invoiced',
        },
      });

      await (tx as any).invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          quoteId: invoice.quoteId,
          action: 'invoice_payment_recorded',
          oldValue: invoice.status,
          newValue: balanceDue <= 0 ? 'PAID' : 'PARTIALLY_PAID',
          note: this.normalizeOptionalText(data.reference) || this.normalizeOptionalText(data.notes),
          actorUserId: this.normalizeActorUserId(data.actor),
          actor: this.normalizeActorLabel(data.actor),
        },
      });
    });

    const updated = await this.findOne(id, data.companyActor);

    if (!updated) {
      throw new NotFoundException('Invoice not found');
    }

    return updated;
  }

  async updateStatus(
    id: string,
    data: {
      status: InvoiceStatusValue;
      note?: string | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    requireActorCompanyId(data.companyActor);
    const invoice = await (this.prisma as any).invoice.findFirst({
      where: {
        id,
      },
      select: {
        id: true,
        quoteId: true,
        status: true,
      } as any,
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (data.status === invoice.status) {
      const existing = await this.findOne(id, data.companyActor);

      if (!existing) {
        throw new NotFoundException('Invoice not found');
      }

      return existing;
    }

    const currentStatus = invoice.status as InvoiceStatusValue;
    const allowedTransitions = INVOICE_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(data.status)) {
      throw new BadRequestException(`Invoice cannot move from ${currentStatus} to ${data.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).invoice.update({
        where: { id },
        data: {
          status: data.status,
        },
      });

      await (tx as any).invoiceAuditLog.create({
        data: {
          invoiceId: invoice.id,
          quoteId: invoice.quoteId,
          action: 'invoice_status_updated',
          oldValue: currentStatus,
          newValue: data.status,
          note: data.note?.trim() || null,
          actorUserId: this.normalizeActorUserId(data.actor),
          actor: this.normalizeActorLabel(data.actor),
        },
      });

      if (data.status === 'PAID') {
        await (tx as any).quote.update({
          where: { id: invoice.quoteId },
          data: {
            status: 'CONFIRMED' as QuoteStatusValue,
          },
        });
      }
    });

    const updated = await this.findOne(id, data.companyActor);

    if (!updated) {
      throw new NotFoundException('Invoice not found');
    }

    return updated;
  }

  markPaid(id: string, data: { note?: string | null; actor?: AuditActor; companyActor?: CompanyScopedActor }) {
    return this.updateStatus(id, {
      status: 'PAID',
      note: data.note,
      actor: data.actor,
      companyActor: data.companyActor,
    });
  }

  cancel(id: string, data: { note?: string | null; actor?: AuditActor; companyActor?: CompanyScopedActor }) {
    return this.updateStatus(id, {
      status: 'CANCELLED',
      note: data.note,
      actor: data.actor,
      companyActor: data.companyActor,
    });
  }

  async generatePdf(id: string, actor?: CompanyScopedActor) {
    const invoice = await this.getInvoiceDocument(id, actor);
    const brand = this.getInvoiceBrand(invoice);
    const logoBuffer = await this.loadInvoiceLogoBuffer(brand.logoUrl);

    return this.createPdf((doc) => {
      this.writePdfHeader(doc, invoice, brand, logoBuffer);
      this.writePdfSectionTitle(doc, 'Client Info');
      this.writePdfKeyValue(doc, 'Client company', invoice.quote?.clientCompany?.name || 'Client unavailable');
      this.writePdfKeyValue(doc, 'Client contact', this.formatContact(invoice.quote?.contact));
      this.writePdfKeyValue(doc, 'Booking reference', invoice.quote?.booking?.bookingRef || 'Booking unavailable');
      this.writePdfKeyValue(doc, 'Trip dates', this.formatTripDates(invoice.quote?.booking));
      doc.moveDown(0.6);

      this.writePdfSectionTitle(doc, 'Invoice Details');
      this.writePdfKeyValue(doc, 'Invoice number', invoice.invoiceNumber);
      this.writePdfKeyValue(doc, 'Issue date', this.formatDate(invoice.issueDate));
      this.writePdfKeyValue(doc, 'Due date', this.formatDate(invoice.dueDate));
      this.writePdfKeyValue(doc, 'Currency', invoice.currency);
      doc.moveDown(0.6);

      this.writePdfSectionTitle(doc, 'Line Items');
      const lineItems = this.getInvoiceLineItems(invoice);
      if (lineItems.length === 0) {
        this.writePdfBodyLine(doc, 'Travel package summary');
        this.writePdfKeyValue(doc, 'Booking summary', invoice.quote?.title || invoice.quote?.booking?.bookingRef || 'Travel services');
      } else {
        this.writePdfLineItemHeader(doc);
        for (const [index, item] of lineItems.entries()) {
          this.writePdfLineItem(doc, item.name, item.detail, item.amount, invoice.currency, index);
        }
      }

      doc.moveDown(0.6);
      this.writePdfSectionTitle(doc, 'Totals');
      this.writePdfMoneyRow(doc, 'Subtotal', invoice.subtotal, invoice.currency);
      this.writePdfMoneyRow(doc, 'Tax', invoice.taxAmount, invoice.currency);
      this.writePdfMoneyRow(doc, 'Total', invoice.totalAmount, invoice.currency);
      this.writePdfMoneyRow(doc, 'Paid amount', invoice.paidAmount, invoice.currency);
      this.writePdfMoneyRow(doc, 'Balance due', invoice.balanceDue, invoice.currency, true);

      this.writePdfFooterBox(doc, [
        `Please include invoice reference ${invoice.invoiceNumber} with your payment.`,
        `Payment instructions: bank transfer or approved settlement method unless otherwise agreed.`,
        `Current balance due: ${this.formatMoney(invoice.balanceDue, invoice.currency)}.`,
        `Thank you for choosing ${brand.name}. For questions, contact ${brand.email || brand.phone || brand.name}.`,
        'Terms: amounts are payable by the due date shown unless separate written terms apply.',
      ]);
    });
  }

  async sendInvoice(
    id: string,
    data: {
      email?: string | null;
      allowCancelled?: boolean | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const invoice = await this.getInvoiceDocument(id, data.companyActor);

    if (invoice.status === 'CANCELLED' && !data.allowCancelled) {
      throw new BadRequestException('Cancelled invoices cannot be sent by default');
    }

    const recipient = this.resolveRecipientEmail(invoice, data.email);
    if (!recipient) {
      throw new BadRequestException('No recipient email is available for this invoice');
    }

    const pdfBuffer = await this.generatePdf(id, data.companyActor);
    const transporter = this.createMailTransport();
    const fromAddress = process.env.INVOICE_EMAIL_FROM || process.env.BOOKING_DOCUMENTS_EMAIL_FROM || process.env.SMTP_FROM || 'noreply@localhost';
    const attachmentFileName = `${invoice.invoiceNumber.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice'}.pdf`;
    const info = await this.sendMailWithRetry(
      transporter,
      {
        from: fromAddress,
        to: recipient,
        subject: `Invoice ${invoice.invoiceNumber}`,
        text: `Dear client,\n\nPlease find attached invoice ${invoice.invoiceNumber} for booking ${invoice.bookingRef || invoice.bookingId || ''}.\n\nBalance due: ${this.formatMoney(invoice.balanceDue, invoice.currency)}.\n\nRegards,\nFinance team`,
        attachments: [
          {
            filename: attachmentFileName,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      },
      { invoiceId: id, action: 'send-invoice' },
    );

    await (this.prisma as any).invoiceAuditLog.create({
      data: {
        invoiceId: invoice.id,
        quoteId: invoice.quoteId,
        action: 'invoice_sent',
        oldValue: null,
        newValue: recipient,
        note: `Invoice PDF sent to ${recipient}`,
        actorUserId: this.normalizeActorUserId(data.actor),
        actor: this.normalizeActorLabel(data.actor),
      },
    });

    return {
      ok: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      email: recipient,
      messageId: info.messageId || null,
      preview: 'message' in info && Buffer.isBuffer((info as any).message) ? (info as any).message.toString('utf8') : null,
    };
  }

  async sendReminder(
    id: string,
    data: {
      email?: string | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const invoice = await this.getInvoiceDocument(id, data.companyActor);

    if (invoice.status === 'PAID' || invoice.balanceDue <= 0) {
      throw new BadRequestException('Paid invoices cannot receive payment reminders');
    }

    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('Cancelled invoices cannot receive payment reminders');
    }

    const recipient = this.resolveRecipientEmail(invoice, data.email);
    if (!recipient) {
      throw new BadRequestException('No recipient email is available for this invoice');
    }

    const daysOverdue = this.getDaysOverdue(invoice.dueDate);
    const pdfBuffer = await this.generatePdf(id, data.companyActor);
    const transporter = this.createMailTransport();
    const fromAddress = process.env.INVOICE_EMAIL_FROM || process.env.BOOKING_DOCUMENTS_EMAIL_FROM || process.env.SMTP_FROM || 'noreply@localhost';
    const attachmentFileName = `${invoice.invoiceNumber.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'invoice'}.pdf`;
    const overdueLine = daysOverdue > 0 ? `This invoice is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue.\n` : '';
    const info = await this.sendMailWithRetry(
      transporter,
      {
        from: fromAddress,
        to: recipient,
        subject: `Payment Reminder: Invoice ${invoice.invoiceNumber}`,
        text: `Dear client,\n\nThis is a polite reminder that invoice ${invoice.invoiceNumber} has an outstanding balance of ${this.formatMoney(invoice.balanceDue, invoice.currency)}.\n\nDue date: ${this.formatDate(invoice.dueDate)}.\n${overdueLine}\nPayment instructions: bank transfer or approved settlement method. Please include invoice reference ${invoice.invoiceNumber}.\n\nRegards,\nFinance team`,
        attachments: [
          {
            filename: attachmentFileName,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      },
      { invoiceId: id, action: 'send-payment-reminder' },
    );

    await (this.prisma as any).invoiceAuditLog.create({
      data: {
        invoiceId: invoice.id,
        quoteId: invoice.quoteId,
        action: 'reminder_sent',
        oldValue: null,
        newValue: recipient,
        note: `Payment reminder sent to ${recipient}`,
        actorUserId: this.normalizeActorUserId(data.actor),
        actor: this.normalizeActorLabel(data.actor),
      },
    });

    return {
      ok: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      email: recipient,
      daysOverdue,
      messageId: info.messageId || null,
      preview: 'message' in info && Buffer.isBuffer((info as any).message) ? (info as any).message.toString('utf8') : null,
    };
  }

  async sendOverdueReminders(data: { actor?: AuditActor; companyActor?: CompanyScopedActor }) {
    requireActorCompanyId(data.companyActor);
    const invoices = await (this.prisma as any).invoice.findMany({
      where: {},
      include: {
        quote: {
          include: {
            clientCompany: true,
            brandCompany: {
              include: {
                branding: true,
              },
            },
            contact: true,
            booking: {
              include: {
                payments: {
                  orderBy: [{ createdAt: 'desc' }],
                },
                services: {
                  select: {
                    id: true,
                    serviceType: true,
                    description: true,
                    serviceDate: true,
                    totalSell: true,
                    status: true,
                  },
                  orderBy: [{ serviceOrder: 'asc' }, { createdAt: 'asc' }],
                },
              },
            },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
    });
    const today = this.startOfToday();
    let sentCount = 0;
    const skipped: Array<{ invoiceId: string; reason: string }> = [];

    for (const rawInvoice of invoices) {
      const invoice = this.enrichInvoice(rawInvoice);
      const dueDate = new Date(invoice.dueDate);

      if (invoice.status === 'CANCELLED' || invoice.status === 'PAID' || invoice.balanceDue <= 0 || Number.isNaN(dueDate.getTime()) || dueDate >= today) {
        continue;
      }

      try {
        await this.sendReminder(invoice.id, data);
        sentCount += 1;
      } catch (error) {
        skipped.push({
          invoiceId: invoice.id,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      sentCount,
      skippedCount: skipped.length,
      skipped,
    };
  }

  private normalizeActorUserId(actor?: AuditActor) {
    const actorUserId = actor?.userId?.trim() || '';
    return actorUserId || null;
  }

  private normalizeActorLabel(actor?: AuditActor) {
    const label = actor?.label?.trim() || '';
    return label || null;
  }

  private enrichInvoice(invoice: any) {
    const booking = invoice.quote?.booking || null;
    const clientPayments = ((booking?.payments || []) as any[]).filter((payment) => payment.type === 'CLIENT');
    const paidAmount = this.roundMoney(
      clientPayments
        .filter((payment) => payment.status === 'PAID')
        .reduce((total, payment) => total + Number(payment.amount || 0), 0),
    );
    const totalAmount = this.roundMoney(Number(invoice.totalAmount || 0));
    const balanceDue = this.roundMoney(Math.max(totalAmount - paidAmount, 0));
    const effectiveStatus = invoice.status === 'CANCELLED' ? 'cancelled' : balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partially_paid' : String(invoice.status || 'DRAFT').toLowerCase();
    const issueDate = this.addDays(new Date(invoice.dueDate), -7);

    return {
      ...invoice,
      invoiceNumber: this.buildInvoiceNumber(invoice),
      bookingId: booking?.id || null,
      bookingRef: booking?.bookingRef || null,
      clientCompanyId: booking?.clientCompanyId || invoice.quote?.clientCompanyId || null,
      issueDate,
      subtotal: totalAmount,
      taxAmount: 0,
      paidAmount,
      balanceDue,
      effectiveStatus,
      payments: clientPayments.map((payment) => ({
        id: payment.id,
        bookingId: payment.bookingId,
        amount: this.roundMoney(Number(payment.amount || 0)),
        currency: payment.currency || invoice.currency,
        method: payment.method,
        reference: payment.reference,
        notes: payment.notes,
        paymentDate: payment.paidAt || payment.createdAt,
        status: payment.status,
      })),
    };
  }

  private buildInvoiceNumber(invoice: any) {
    const reference = invoice.quote?.booking?.bookingRef || invoice.quote?.quoteNumber || invoice.id;
    return `INV-${String(reference).replace(/^INV-/i, '')}`;
  }

  private calculateBookingTotals(booking: any, activeServices: any[]) {
    const pricingSnapshot = (booking.pricingSnapshotJson || {}) as { totalSell?: number | null; totalCost?: number | null; currency?: string | null };
    const snapshot = (booking.snapshotJson || {}) as { totalSell?: number | null; totalCost?: number | null; quoteCurrency?: string | null; currency?: string | null };
    const totalSellFromServices = activeServices.reduce((total, service) => total + Number(service.totalSell || 0), 0);
    const totalCostFromServices = activeServices.reduce((total, service) => total + Number(service.totalCost || 0), 0);

    return {
      totalSell: this.roundMoney(totalSellFromServices || Number(pricingSnapshot.totalSell ?? snapshot.totalSell ?? 0)),
      totalCost: this.roundMoney(totalCostFromServices || Number(pricingSnapshot.totalCost ?? snapshot.totalCost ?? 0)),
      currency: this.normalizeCurrency(pricingSnapshot.currency || snapshot.quoteCurrency || snapshot.currency || 'USD'),
    };
  }

  private async ensureSupplierPayables(
    tx: any,
    bookingId: string,
    activeServices: any[],
    currency: string,
    dueDate: Date,
    existingPayments: any[],
  ) {
    const existingReferences = new Set(
      (existingPayments || [])
        .filter((payment) => payment.type === 'SUPPLIER')
        .map((payment) => String(payment.reference || '')),
    );

    for (const service of activeServices) {
      const amount = this.roundMoney(Number(service.totalCost || 0));

      if (amount <= 0) {
        continue;
      }

      const reference = `service:${service.id}`;

      if (existingReferences.has(reference)) {
        continue;
      }

      await (tx as any).payment.create({
        data: {
          bookingId,
          type: 'SUPPLIER',
          amount,
          currency,
          status: 'PENDING',
          method: 'bank',
          reference,
          dueDate,
          paidAt: null,
          notes: [
            'Supplier payable',
            service.supplierName ? `supplier:${service.supplierName}` : null,
            service.supplierId ? `supplierId:${service.supplierId}` : null,
            service.description || service.serviceType || null,
          ]
            .filter(Boolean)
            .join(' | '),
        },
      });
    }
  }

  private async sumPaidClientPayments(tx: any, bookingId: string) {
    const result = await (tx as any).payment.aggregate({
      where: {
        bookingId,
        type: 'CLIENT',
        status: 'PAID',
      },
      _sum: {
        amount: true,
      },
    });

    return this.roundMoney(Number(result?._sum?.amount || 0));
  }

  private normalizeAmount(value: number) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    return this.roundMoney(amount);
  }

  private normalizeCurrency(value?: string | null) {
    const currency = String(value || 'USD').trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new BadRequestException('Currency must be a valid ISO code');
    }

    return currency;
  }

  private normalizeMethod(value?: 'bank' | 'cash' | 'card' | null) {
    const method = String(value || 'bank').trim().toLowerCase();

    if (!['bank', 'cash', 'card'].includes(method)) {
      throw new BadRequestException('Unsupported payment method');
    }

    return method;
  }

  private normalizeOptionalText(value?: string | null) {
    const text = String(value || '').trim();
    return text || null;
  }

  private normalizeDate(value: string | Date | null | undefined, message: string) {
    if (!value) {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(message);
    }

    return date;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private roundMoney(value: number) {
    return Number((Number(value || 0)).toFixed(2));
  }

  private async getInvoiceDocument(id: string, actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    const invoice = await (this.prisma as any).invoice.findFirst({
      where: {
        id,
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
            contact: true,
            booking: {
              include: {
                payments: {
                  orderBy: [{ createdAt: 'desc' }],
                },
                services: {
                  select: {
                    id: true,
                    serviceType: true,
                    description: true,
                    serviceDate: true,
                    totalSell: true,
                    status: true,
                  },
                  orderBy: [{ serviceOrder: 'asc' }, { createdAt: 'asc' }],
                },
              },
            },
          },
        },
        auditLogs: {
          orderBy: [{ createdAt: 'desc' }],
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.enrichInvoice(invoice);
  }

  private createPdf(write: (doc: PDFKit.PDFDocument) => void) {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      compress: false,
    });
    const buffers: Buffer[] = [];

    const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk) => buffers.push(chunk as Buffer));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
    });

    write(doc);
    doc.end();

    return pdfBufferPromise;
  }

  private writePdfHeader(doc: PDFKit.PDFDocument, invoice: any, brand: ReturnType<InvoicesService['getInvoiceBrand']>, logoBuffer: Buffer | null) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const top = doc.y;
    const logoSize = 44;

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, left, top, { fit: [logoSize, logoSize] });
      } catch {
        this.writePdfLogoFallback(doc, brand.name, left, top, logoSize);
      }
    } else {
      this.writePdfLogoFallback(doc, brand.name, left, top, logoSize);
    }

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(brand.name, left + 58, top + 2, { width: 230 });
    doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text([brand.email, brand.phone].filter(Boolean).join(' | ') || 'Travel services', left + 58, top + 20, {
      width: 260,
    });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f766e').text('INVOICE', right - 170, top + 2, { width: 170, align: 'right', characterSpacing: 1.4 });
    doc.font('Helvetica-Bold').fontSize(21).fillColor('#111111').text(invoice.invoiceNumber, right - 220, top + 22, { width: 220, align: 'right' });
    doc.moveTo(left, top + 62).lineTo(right, top + 62).lineWidth(1).strokeColor('#dbe4ea').stroke();
    doc.y = top + 80;
  }

  private writePdfSectionTitle(doc: PDFKit.PDFDocument, title: string) {
    this.ensurePdfSpace(doc, 42);
    doc.moveDown(0.35);
    const x = doc.page.margins.left;
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(title, x, doc.y);
    doc.moveTo(x, doc.y + 4).lineTo(doc.page.width - doc.page.margins.right, doc.y + 4).lineWidth(0.7).strokeColor('#e2e8f0').stroke();
    doc.moveDown(0.55);
  }

  private writePdfKeyValue(doc: PDFKit.PDFDocument, label: string, value: string) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(`${label}: `, { continued: true });
    doc.font('Helvetica').fontSize(9).fillColor('#111827').text(value || 'Not set');
  }

  private writePdfBodyLine(doc: PDFKit.PDFDocument, text: string) {
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text(text);
  }

  private writePdfLineItemHeader(doc: PDFKit.PDFDocument) {
    const x = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.roundedRect(x, doc.y, width, 24, 6).fill('#f1f5f9');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('DESCRIPTION', x + 12, doc.y + 8, { width: width - 130 });
    doc.text('AMOUNT', x + width - 112, doc.y, { width: 100, align: 'right' });
    doc.y += 30;
  }

  private writePdfLineItem(doc: PDFKit.PDFDocument, name: string, detail: string, amount: number, currency: string, index: number) {
    this.ensurePdfSpace(doc, 48);
    const x = doc.page.margins.left;
    const y = doc.y;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const fill = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    doc.rect(x, y - 4, width, 42).fill(fill);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(name, x + 12, y + 2, { width: width - 140 });
    if (detail) {
      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(detail, x + 12, doc.y + 3, { width: width - 140 });
    }
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(this.formatMoney(amount, currency), x + width - 112, y + 9, { width: 100, align: 'right' });
    doc.y = y + 44;
  }

  private writePdfMoneyRow(doc: PDFKit.PDFDocument, label: string, amount: number, currency: string, highlight = false) {
    this.ensurePdfSpace(doc, highlight ? 38 : 24);
    const x = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const y = doc.y;
    if (highlight) {
      doc.roundedRect(x, y, width, 34, 8).fill('#ecfdf5');
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#064e3b').text(label, x + 12, y + 10, { width: width - 160 });
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#064e3b').text(this.formatMoney(amount, currency), x + width - 148, y + 8, {
        width: 136,
        align: 'right',
      });
      doc.y = y + 42;
      return;
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#334155').text(label, x + 12, y, { width: width - 160 });
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text(this.formatMoney(amount, currency), x + width - 148, y, { width: 136, align: 'right' });
    doc.y = y + 18;
  }

  private writePdfFooterBox(doc: PDFKit.PDFDocument, lines: string[]) {
    doc.moveDown(1);
    const x = doc.page.margins.left;
    const y = doc.y;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const height = Math.max(104, 34 + lines.length * 13);
    doc.roundedRect(x, y, width, height, 8).fillAndStroke('#f8fafc', '#dbe4ea');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10).text('Payment Instructions', x + 14, y + 12, { width: width - 28 });
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(8).fillColor('#334155');
    for (const line of lines) {
      doc.text(line, x + 14, doc.y, { width: width - 28 });
    }
    doc.moveDown(0.35);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text('Thank you for your business.', x + 14, doc.y, { width: width - 28 });
    doc.y = y + height + 12;
  }

  private writePdfLogoFallback(doc: PDFKit.PDFDocument, brandName: string, x: number, y: number, size: number) {
    doc.roundedRect(x, y, size, size, 8).fill('#ecfdf5');
    const initials = brandName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'DMC';
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f766e').text(initials, x, y + 15, { width: size, align: 'center' });
  }

  private ensurePdfSpace(doc: PDFKit.PDFDocument, minimumHeight: number) {
    if (doc.y + minimumHeight <= doc.page.height - doc.page.margins.bottom) {
      return;
    }

    doc.addPage();
  }

  private getInvoiceLineItems(invoice: any) {
    const services = invoice.quote?.booking?.services || [];
    return services
      .filter((service: any) => service.status !== ACTIVE_SERVICE_STATUS)
      .map((service: any) => ({
        name: service.description || service.serviceType || 'Service',
        detail: service.serviceDate ? this.formatDate(service.serviceDate) : 'Booking service',
        amount: this.roundMoney(Number(service.totalSell || 0)),
      }))
      .filter((item: any) => item.amount > 0);
  }

  private resolveRecipientEmail(invoice: any, overrideEmail?: string | null) {
    const override = String(overrideEmail || '').trim();
    if (override) {
      return override;
    }

    return String(invoice.quote?.contact?.email || invoice.quote?.booking?.contactSnapshotJson?.email || '').trim() || null;
  }

  private formatContact(contact: any) {
    const name = [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim();
    return [name, contact?.email].filter(Boolean).join(' | ') || 'Contact unavailable';
  }

  private formatTripDates(booking: any) {
    if (!booking?.startDate && !booking?.endDate) {
      return 'Dates pending';
    }

    if (booking.startDate && booking.endDate) {
      return `${this.formatDate(booking.startDate)} - ${this.formatDate(booking.endDate)}`;
    }

    return this.formatDate(booking.startDate || booking.endDate);
  }

  private getInvoiceBrand(invoice: any) {
    const company = invoice.quote?.brandCompany || invoice.quote?.clientCompany || {};
    return {
      name: company.branding?.displayName || company.name || 'DMC Travel',
      email: company.branding?.email || null,
      phone: company.branding?.phone || null,
      logoUrl: company.branding?.logoUrl || company.logoUrl || null,
    };
  }

  private async loadInvoiceLogoBuffer(logoUrl?: string | null) {
    const normalizedUrl = String(logoUrl || '').trim();
    if (!normalizedUrl) {
      return null;
    }

    try {
      if (normalizedUrl.startsWith('/uploads/')) {
        return await readFile(resolve(process.cwd(), 'apps', 'api', `.${normalizedUrl}`));
      }

      const imageResponse = await fetch(normalizedUrl);
      const arrayBuffer = await imageResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  private formatDate(value: string | Date | null | undefined) {
    if (!value) {
      return 'Not set';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Not set';
    }

    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
  }

  private startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private getDaysOverdue(value: string | Date | null | undefined) {
    if (!value) {
      return 0;
    }

    const due = value instanceof Date ? new Date(value) : new Date(value);
    if (Number.isNaN(due.getTime())) {
      return 0;
    }

    due.setHours(0, 0, 0, 0);
    const diffMs = this.startOfToday().getTime() - due.getTime();
    return diffMs > 0 ? Math.floor(diffMs / 86_400_000) : 0;
  }

  private formatMoney(amount: number, currency: string) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.normalizeCurrency(currency),
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  }

  private createMailTransport() {
    if (process.env.SMTP_HOST) {
      const port = Number(process.env.SMTP_PORT || 587);
      const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
      });
    }

    return nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
  }

  private async sendMailWithRetry(
    transporter: any,
    mailOptions: Record<string, unknown>,
    context: Record<string, unknown>,
    retries = 1,
  ) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      try {
        return await transporter.sendMail(mailOptions);
      } catch (error) {
        lastError = error;
        console.error('Invoice email send failed', {
          ...context,
          attempt,
          maxAttempts: retries + 1,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw lastError;
  }
}
