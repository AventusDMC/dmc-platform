import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
import { PrismaService } from '../prisma/prisma.service';

type ExportInput = {
  startDate?: string;
  endDate?: string;
  status?: string;
};

type CsvExport = {
  fileName: string;
  content: string;
};

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportInvoices(input: ExportInput, actor?: CompanyScopedActor): Promise<CsvExport> {
    requireActorCompanyId(actor);

    const dateWhere = this.buildDateWhere(input, 'dueDate');
    const statusWhere = this.buildInvoiceStatusWhere(input.status);
    const invoices = await (this.prisma.invoice as any).findMany({
      where: {
        AND: [dateWhere, statusWhere],
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
            booking: {
              include: {
                payments: true,
              },
            },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });

    return {
      fileName: 'invoices.csv',
      content: this.toCsv(
        [
          'invoiceNumber',
          'issueDate',
          'dueDate',
          'clientCompanyName',
          'bookingRef',
          'currency',
          'subtotal',
          'taxAmount',
          'totalAmount',
          'paidAmount',
          'balanceDue',
          'status',
        ],
        invoices.map((invoice: any) => {
          const paidAmount = this.sumPaidClientPayments(invoice.quote?.booking?.payments || []);
          const totalAmount = this.roundMoney(Number(invoice.totalAmount || 0));

          return [
            this.buildInvoiceNumber(invoice),
            this.formatDate(this.addDays(new Date(invoice.dueDate), -7)),
            this.formatDate(invoice.dueDate),
            invoice.quote?.clientCompany?.name || '',
            invoice.quote?.booking?.bookingRef || '',
            invoice.currency || '',
            totalAmount,
            0,
            totalAmount,
            paidAmount,
            this.roundMoney(Math.max(totalAmount - paidAmount, 0)),
            this.formatStatus(invoice.status),
          ];
        }),
      ),
    };
  }

  async exportPayments(input: ExportInput, actor?: CompanyScopedActor): Promise<CsvExport> {
    requireActorCompanyId(actor);

    const dateWhere = this.buildDateWhere(input, 'createdAt');
    const statusWhere = this.buildPaymentStatusWhere(input.status);
    const payments = await (this.prisma.payment as any).findMany({
      where: {
        AND: [
          { type: 'CLIENT' },
          dateWhere,
          statusWhere,
        ],
      },
      include: {
        booking: {
          include: {
            quote: {
              include: {
                invoice: true,
                clientCompany: true,
              },
            },
          },
        },
      },
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      fileName: 'payments.csv',
      content: this.toCsv(
        ['paymentDate', 'invoiceNumber', 'clientCompanyName', 'amount', 'currency', 'method', 'reference', 'notes'],
        payments.map((payment: any) => [
          this.formatDate(payment.paidAt || payment.createdAt),
          payment.booking?.quote?.invoice ? this.buildInvoiceNumber(payment.booking.quote.invoice) : '',
          payment.booking?.quote?.clientCompany?.name || '',
          this.roundMoney(Number(payment.amount || 0)),
          payment.currency || '',
          payment.method || '',
          payment.reference || '',
          payment.notes || '',
        ]),
      ),
    };
  }

  async exportSupplierPayables(input: ExportInput, actor?: CompanyScopedActor): Promise<CsvExport> {
    requireActorCompanyId(actor);

    const dateWhere = this.buildDateWhere(input, 'createdAt');
    const statusWhere = this.buildPaymentStatusWhere(input.status);
    const payments = await (this.prisma.payment as any).findMany({
      where: {
        AND: [
          { type: 'SUPPLIER' },
          dateWhere,
          statusWhere,
        ],
      },
      include: {
        booking: {
          include: {
            services: {
              include: {
                supplier: true,
              },
            },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      fileName: 'supplier-payables.csv',
      content: this.toCsv(
        ['supplierName', 'bookingRef', 'serviceName', 'currency', 'amount', 'paidAmount', 'balanceDue', 'status', 'reference'],
        payments.map((payment: any) => {
          const service = this.findServiceForPayment(payment);
          const amount = this.roundMoney(Number(payment.amount || 0));
          const paidAmount = String(payment.status || '').toUpperCase() === 'PAID' ? amount : 0;

          return [
            service?.supplier?.name || service?.supplierName || this.parseSupplierName(payment.notes) || '',
            payment.booking?.bookingRef || payment.bookingId || '',
            service?.description || service?.serviceType || this.parseServiceName(payment.notes) || '',
            payment.currency || '',
            amount,
            paidAmount,
            this.roundMoney(Math.max(amount - paidAmount, 0)),
            this.formatStatus(payment.status),
            payment.reference || '',
          ];
        }),
      ),
    };
  }

  private buildDateWhere(input: ExportInput, field: 'createdAt' | 'dueDate'): Prisma.InvoiceWhereInput | Prisma.PaymentWhereInput {
    const startDate = this.normalizeDate(input.startDate, 'startDate');
    const endDate = this.normalizeDate(input.endDate, 'endDate');

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    if (!startDate && !endDate) {
      return {};
    }

    return {
      [field]: {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: this.endOfUtcDay(endDate) } : {}),
      },
    } as any;
  }

  private buildInvoiceStatusWhere(status?: string): Prisma.InvoiceWhereInput {
    if (status) {
      return { status: status.trim().toUpperCase() as any };
    }

    return { status: { not: 'CANCELLED' } as any };
  }

  private buildPaymentStatusWhere(status?: string): Prisma.PaymentWhereInput {
    if (!status) {
      return {};
    }

    return { status: status.trim().toUpperCase() as any };
  }

  private normalizeDate(value: string | undefined, label: string) {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} is invalid`);
    }

    return date;
  }

  private endOfUtcDay(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  }

  private toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
    return [headers, ...rows].map((row) => row.map((value) => this.escapeCsv(value)).join(',')).join('\r\n') + '\r\n';
  }

  private escapeCsv(value: string | number | null | undefined) {
    const text = value === null || value === undefined ? '' : String(value);
    if (!/[",\r\n]/.test(text)) {
      return text;
    }

    return `"${text.replace(/"/g, '""')}"`;
  }

  private buildInvoiceNumber(invoice: any) {
    const reference = invoice.quote?.booking?.bookingRef || invoice.quote?.quoteNumber || invoice.id;
    return `INV-${String(reference).replace(/^INV-/i, '')}`;
  }

  private sumPaidClientPayments(payments: any[]) {
    return this.roundMoney(
      payments
        .filter((payment) => payment.type === 'CLIENT' && payment.status === 'PAID')
        .reduce((total, payment) => total + Number(payment.amount || 0), 0),
    );
  }

  private findServiceForPayment(payment: any) {
    const serviceId = this.parseServiceReference(payment.reference);
    return serviceId ? payment.booking?.services?.find((service: any) => service.id === serviceId) : null;
  }

  private parseServiceReference(reference: string | null | undefined) {
    const match = String(reference || '').match(/^service:(.+)$/);
    return match?.[1] || null;
  }

  private parseSupplierName(notes: string | null | undefined) {
    const match = String(notes || '').match(/(?:^|\|)\s*supplier:([^|]+)/i);
    return match?.[1]?.trim() || null;
  }

  private parseServiceName(notes: string | null | undefined) {
    const parts = String(notes || '')
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.find((part) => !/^supplier(?:Id)?:/i.test(part) && part !== 'Supplier payable') || null;
  }

  private addDays(date: Date, days: number) {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  }

  private formatDate(value: Date | string | null | undefined) {
    if (!value) {
      return '';
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

  private formatStatus(value: string | null | undefined) {
    return String(value || '').toLowerCase();
  }

  private roundMoney(value: number) {
    return Number(Number(value || 0).toFixed(2));
  }
}
