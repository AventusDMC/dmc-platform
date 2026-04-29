import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
import { PrismaService } from '../prisma/prisma.service';
import { calculateProfitSummary } from '../finance/profit';

type BookingSummaryInput = {
  startDate?: string;
  endDate?: string;
};

type BookingSummaryBooking = {
  id: string;
  bookingRef: string;
  clientCompanyId: string | null;
  clientName: string;
  startDate: Date | null;
  status: string | null;
  totalSell: number;
  totalCost: number;
  totalProfit: number;
  marginPercent: number;
};

type ReportBookingRecord = {
  id: string;
  bookingRef: string;
  clientCompanyId: string | null;
  clientSnapshotJson: { name?: string | null } | null;
  startDate: Date | null;
  status: string | null;
  pricingSnapshotJson: { totalCost?: number | null; totalSell?: number | null } | null;
  services: ReportBookingServiceRecord[];
};

type ReportBookingServiceRecord = {
  id?: string | null;
  description?: string | null;
  serviceType?: string | null;
  totalCost: number | null;
  totalSell: number | null;
  status?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  supplier?: { id: string; name: string | null } | null;
};

type FinanceInvoiceRecord = {
  id: string;
  totalAmount: number | null;
  currency: string | null;
  status: string | null;
  dueDate: Date | null;
  quote?: {
    quoteNumber?: string | null;
    clientCompany?: { name?: string | null } | null;
    booking?: {
      id: string;
      bookingRef?: string | null;
      payments?: Array<{
        type: string | null;
        amount: number | null;
        status: string | null;
      }>;
    } | null;
    bookings?: Array<{
      id: string;
      bookingRef?: string | null;
      payments?: Array<{
        type: string | null;
        amount: number | null;
        status: string | null;
      }>;
    }>;
  } | null;
};

type FinanceSupplierPaymentRecord = {
  id: string;
  bookingId: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  reference: string | null;
  notes: string | null;
  booking?: {
    bookingRef?: string | null;
    services?: Array<{
      id: string;
      description?: string | null;
      serviceType?: string | null;
      supplierName?: string | null;
      supplier?: { name?: string | null } | null;
    }>;
  } | null;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBookingSummary(input: BookingSummaryInput, actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);

    const bookings = await this.findLatestBookings(input);

    const cancelledBookings = bookings.filter((booking) => this.isCancelled(booking.status)).length;
    const bookingRows = bookings
      .filter((booking) => !this.isCancelled(booking.status))
      .map((booking) => this.mapBookingSummaryRow(booking));
    const totalSell = this.roundMoney(bookingRows.reduce((total, booking) => total + booking.totalSell, 0));
    const totalCost = this.roundMoney(bookingRows.reduce((total, booking) => total + booking.totalCost, 0));
    const profit = calculateProfitSummary({ totalCost, totalSell });

    return {
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      dateField: 'startDate',
      totalBookings: bookingRows.length,
      cancelledBookings,
      totalSell: profit.totalSell,
      totalCost: profit.totalCost,
      totalProfit: profit.grossProfit,
      avgMargin: profit.marginPercent,
      topBookings: [...bookingRows]
        .sort((left, right) => right.totalProfit - left.totalProfit || right.totalSell - left.totalSell)
        .slice(0, 5),
      lowMarginBookings: [...bookingRows]
        .filter((booking) => booking.totalSell > 0)
        .sort((left, right) => left.marginPercent - right.marginPercent || left.totalProfit - right.totalProfit)
        .slice(0, 5),
    };
  }

  async getMonthlyTrends(input: BookingSummaryInput, actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);

    const bookings = await this.findLatestBookings(input);
    const rowsByMonth = new Map<
      string,
      {
        month: string;
        totalBookings: number;
        totalSell: number;
        totalCost: number;
      }
    >();

    for (const booking of bookings) {
      if (this.isCancelled(booking.status) || !booking.startDate) {
        continue;
      }

      const month = this.formatMonth(booking.startDate);
      const row = rowsByMonth.get(month) || {
        month,
        totalBookings: 0,
        totalSell: 0,
        totalCost: 0,
      };
      const bookingTotals = this.calculateBookingTotals(booking);

      row.totalBookings += 1;
      row.totalSell += bookingTotals.totalSell;
      row.totalCost += bookingTotals.totalCost;
      rowsByMonth.set(month, row);
    }

    return {
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      dateField: 'startDate',
      months: [...rowsByMonth.values()]
        .sort((left, right) => left.month.localeCompare(right.month))
        .map((row) => {
          const profit = calculateProfitSummary({
            totalCost: this.roundMoney(row.totalCost),
            totalSell: this.roundMoney(row.totalSell),
          });

          return {
            month: row.month,
            totalBookings: row.totalBookings,
            totalSell: profit.totalSell,
            totalCost: profit.totalCost,
            totalProfit: profit.grossProfit,
            avgMargin: profit.marginPercent,
          };
        }),
    };
  }

  async getSupplierPerformance(input: BookingSummaryInput, actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);

    const bookings = await this.findLatestBookings(input);
    const rowsBySupplier = new Map<
      string,
      {
        supplierId: string | null;
        supplierName: string;
        serviceCount: number;
        totalCost: number;
        totalSell: number;
      }
    >();

    for (const booking of bookings) {
      if (this.isCancelled(booking.status)) {
        continue;
      }

      for (const service of booking.services || []) {
        if (this.isCancelled(service.status)) {
          continue;
        }

        const supplierId = service.supplierId || service.supplier?.id || null;
        const supplierName = service.supplier?.name || service.supplierName || supplierId || 'Unassigned supplier';
        const key = supplierId || `name:${supplierName.toLowerCase()}`;
        const row = rowsBySupplier.get(key) || {
          supplierId,
          supplierName,
          serviceCount: 0,
          totalCost: 0,
          totalSell: 0,
        };

        row.serviceCount += 1;
        row.totalCost += Number(service.totalCost || 0);
        row.totalSell += Number(service.totalSell || 0);
        rowsBySupplier.set(key, row);
      }
    }

    return {
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      dateField: 'startDate',
      suppliers: [...rowsBySupplier.values()]
        .map((row) => {
          const profit = calculateProfitSummary({
            totalCost: this.roundMoney(row.totalCost),
            totalSell: this.roundMoney(row.totalSell),
          });

          return {
            supplierId: row.supplierId,
            supplierName: row.supplierName,
            serviceCount: row.serviceCount,
            totalCost: profit.totalCost,
            totalSell: profit.totalSell,
            totalProfit: profit.grossProfit,
            avgMargin: profit.marginPercent,
          };
        })
        .sort((left, right) => right.totalCost - left.totalCost || left.supplierName.localeCompare(right.supplierName)),
    };
  }

  async getSupplierPayables(actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);

    const services = (await (this.prisma.bookingService as any).findMany({
      select: {
        supplierId: true,
        supplierName: true,
        totalCost: true,
        supplier: {
          select: {
            name: true,
          },
        },
      },
    })) as Array<{
      supplierId: string | null;
      supplierName: string | null;
      totalCost: number | null;
      supplier: { name: string | null } | null;
    }>;

    const rowsBySupplier = new Map<string, { supplierId: string | null; supplierName: string; totalCost: number }>();

    for (const service of services) {
      const supplierId = service.supplierId || null;
      const supplierName = service.supplier?.name || service.supplierName || supplierId || 'Unassigned supplier';
      const key = supplierId || 'unassigned';
      const row = rowsBySupplier.get(key) || { supplierId, supplierName, totalCost: 0 };

      row.totalCost += Number(service.totalCost || 0);
      rowsBySupplier.set(key, row);
    }

    return [...rowsBySupplier.values()]
      .map((row) => ({
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        totalCost: this.roundMoney(row.totalCost),
      }))
      .sort((left, right) => right.totalCost - left.totalCost || left.supplierName.localeCompare(right.supplierName));
  }

  async getFinanceSummary(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);

    const [invoices, supplierPayments] = await Promise.all([
      (this.prisma.invoice as any).findMany({
        where: {
          quote: {
            clientCompanyId: companyId,
          },
        },
        include: {
          quote: {
            include: {
              clientCompany: true,
              bookings: {
                include: {
                  payments: true,
                },
                orderBy: [{ createdAt: 'desc' }],
                take: 1,
              },
            },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
      }) as Promise<FinanceInvoiceRecord[]>,
      (this.prisma.payment as any).findMany({
        where: {
          type: 'SUPPLIER',
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
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      }) as Promise<FinanceSupplierPaymentRecord[]>,
    ]);

    const today = this.startOfToday();
    const activeInvoices = invoices.filter((invoice) => !this.isCancelled(invoice.status));
    const receivableRows = activeInvoices.map((invoice) => this.mapFinanceInvoice(invoice));
    const supplierRows = supplierPayments.map((payment) => this.mapSupplierPayable(payment));

    const totalInvoiced = this.roundMoney(receivableRows.reduce((total, invoice) => total + invoice.totalAmount, 0));
    const totalPaid = this.roundMoney(receivableRows.reduce((total, invoice) => total + invoice.paidAmount, 0));
    const outstandingReceivables = this.roundMoney(receivableRows.reduce((total, invoice) => total + invoice.balanceDue, 0));
    const overdueInvoices = receivableRows.filter((invoice) => invoice.dueDateObject && invoice.dueDateObject < today && invoice.balanceDue > 0);
    const overdueReceivables = this.roundMoney(overdueInvoices.reduce((total, invoice) => total + invoice.balanceDue, 0));
    const supplierPayables = this.roundMoney(supplierRows.reduce((total, payment) => total + payment.amount, 0));
    const supplierPaid = this.roundMoney(supplierRows.reduce((total, payment) => total + payment.paidAmount, 0));
    const outstandingSupplierPayables = this.roundMoney(supplierRows.reduce((total, payment) => total + payment.balanceDue, 0));

    return {
      totalInvoiced,
      totalPaid,
      outstandingReceivables,
      overdueReceivables,
      supplierPayables,
      supplierPaid,
      outstandingSupplierPayables,
      netCashPosition: this.roundMoney(totalPaid - supplierPaid),
      overdueInvoices: overdueInvoices.map(({ dueDateObject: _dueDateObject, ...invoice }) => invoice),
      unpaidSupplierPayables: supplierRows
        .filter((payment) => payment.balanceDue > 0)
        .map(({ status: _status, ...payment }) => payment),
    };
  }

  async getAlerts(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);

    const [invoices, supplierPayments, bookings] = await Promise.all([
      (this.prisma.invoice as any).findMany({
        where: {
          quote: {
            clientCompanyId: companyId,
          },
        },
        include: {
          quote: {
            include: {
              clientCompany: true,
              bookings: {
                include: {
                  payments: true,
                },
                orderBy: [{ createdAt: 'desc' }],
                take: 1,
              },
            },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
      }) as Promise<FinanceInvoiceRecord[]>,
      (this.prisma.payment as any).findMany({
        where: {
          type: 'SUPPLIER',
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
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      }) as Promise<FinanceSupplierPaymentRecord[]>,
      this.findLatestBookings({}),
    ]);

    const today = this.startOfToday();
    const overdueReceivables = invoices
      .filter((invoice) => !this.isCancelled(invoice.status))
      .map((invoice) => this.mapFinanceInvoice(invoice))
      .filter((invoice) => invoice.dueDateObject && invoice.dueDateObject < today && invoice.balanceDue > 0)
      .map(({ dueDateObject, ...invoice }) => ({
        ...invoice,
        daysOverdue: this.getDaysOverdue(dueDateObject),
      }));

    const activeBookings = bookings.filter((booking) => !this.isCancelled(booking.status));
    const lowMarginBookings = activeBookings
      .map((booking) => this.mapBookingSummaryRow(booking))
      .filter((booking) => booking.totalSell > 0 && booking.marginPercent < 15)
      .map((booking) => ({
        bookingId: booking.id,
        bookingRef: booking.bookingRef,
        clientCompanyName: booking.clientName,
        totalSell: booking.totalSell,
        totalCost: booking.totalCost,
        totalProfit: booking.totalProfit,
        marginPercent: booking.marginPercent,
      }));

    const highCostServices = activeBookings.flatMap((booking) => {
      return (booking.services || [])
        .filter((service) => !this.isCancelled(service.status))
        .map((service) => {
          const supplierCost = this.roundMoney(Number(service.totalCost || 0));
          const sellPrice = this.roundMoney(Number(service.totalSell || 0));
          const marginPercent = sellPrice > 0 ? Number((((sellPrice - supplierCost) / sellPrice) * 100).toFixed(2)) : 0;

          return {
            bookingId: booking.id,
            bookingRef: booking.bookingRef || booking.id,
            serviceId: service.id || null,
            serviceName: service.description || service.serviceType || 'Service',
            supplierName: service.supplier?.name || service.supplierName || 'Unassigned supplier',
            supplierCost,
            sellPrice,
            marginPercent,
          };
        })
        .filter((service) => service.marginPercent < 10 || service.supplierCost > service.sellPrice);
    });

    const unpaidSupplierPayables = supplierPayments
      .map((payment) => this.mapSupplierPayable(payment))
      .filter((payment) => payment.balanceDue > 0)
      .map((payment) => ({
        supplierName: payment.supplierName,
        bookingRef: payment.bookingRef,
        serviceName: payment.serviceName,
        balanceDue: payment.balanceDue,
      }));

    return {
      overdueReceivables,
      lowMarginBookings,
      highCostServices,
      unpaidSupplierPayables,
    };
  }

  private async findLatestBookings(input: BookingSummaryInput): Promise<ReportBookingRecord[]> {
    const dateWhere = this.buildDateWhere(input);

    return (await (this.prisma.booking as any).findMany({
      where: {
        AND: [dateWhere, { amendments: { none: {} } }],
      },
      select: {
        id: true,
        bookingRef: true,
        clientCompanyId: true,
        clientSnapshotJson: true,
        startDate: true,
        status: true,
        pricingSnapshotJson: true,
        services: {
          select: {
            id: true,
            description: true,
            serviceType: true,
            totalCost: true,
            totalSell: true,
            status: true,
            supplierId: true,
            supplierName: true,
            supplier: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    } as any)) as ReportBookingRecord[];
  }

  private buildDateWhere(input: BookingSummaryInput): Prisma.BookingWhereInput {
    const startDate = this.normalizeDate(input.startDate, 'startDate');
    const endDate = this.normalizeDate(input.endDate, 'endDate');

    if (startDate && endDate && startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    if (!startDate && !endDate) {
      return {};
    }

    return {
      startDate: {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: this.endOfUtcDay(endDate) } : {}),
      },
    };
  }

  private mapBookingSummaryRow(booking: {
    id: string;
    bookingRef: string;
    clientCompanyId: string | null;
    clientSnapshotJson: { name?: string | null } | null;
    startDate: Date | null;
    status: string | null;
    pricingSnapshotJson: { totalCost?: number | null; totalSell?: number | null } | null;
    services: Array<{ totalCost: number | null; totalSell: number | null; status?: string | null }>;
  }): BookingSummaryBooking {
    const { totalCost, totalSell } = this.calculateBookingTotals(booking);
    const profit = calculateProfitSummary({ totalCost, totalSell });

    return {
      id: booking.id,
      bookingRef: booking.bookingRef || booking.id,
      clientCompanyId: booking.clientCompanyId,
      clientName: booking.clientSnapshotJson?.name || 'Client unavailable',
      startDate: booking.startDate,
      status: booking.status,
      totalSell: profit.totalSell,
      totalCost: profit.totalCost,
      totalProfit: profit.grossProfit,
      marginPercent: profit.marginPercent,
    };
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

  private isCancelled(status: string | null | undefined) {
    return String(status || '').toLowerCase() === 'cancelled';
  }

  private calculateBookingTotals(booking: {
    pricingSnapshotJson: { totalCost?: number | null; totalSell?: number | null } | null;
    services: Array<{ totalCost: number | null; totalSell: number | null; status?: string | null }>;
  }) {
    const activeServices = (booking.services || []).filter((service) => !this.isCancelled(service.status));
    const serviceTotalCost = activeServices.reduce((total, service) => total + Number(service.totalCost || 0), 0);
    const serviceTotalSell = activeServices.reduce((total, service) => total + Number(service.totalSell || 0), 0);

    return {
      totalCost: serviceTotalCost || Number(booking.pricingSnapshotJson?.totalCost || 0),
      totalSell: serviceTotalSell || Number(booking.pricingSnapshotJson?.totalSell || 0),
    };
  }

  private mapFinanceInvoice(invoice: FinanceInvoiceRecord) {
    const booking = invoice.quote?.booking || invoice.quote?.bookings?.[0] || null;
    const clientPayments = (booking?.payments || []).filter((payment) => String(payment.type || '').toUpperCase() === 'CLIENT');
    const paidAmount = this.roundMoney(
      clientPayments
        .filter((payment) => String(payment.status || '').toUpperCase() === 'PAID')
        .reduce((total, payment) => total + Number(payment.amount || 0), 0),
    );
    const totalAmount = this.roundMoney(Number(invoice.totalAmount || 0));
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
    const reference = booking?.bookingRef || invoice.quote?.quoteNumber || invoice.id;

    return {
      invoiceId: invoice.id,
      invoiceNumber: `INV-${String(reference).replace(/^INV-/i, '')}`,
      clientCompanyName: invoice.quote?.clientCompany?.name || 'Client unavailable',
      dueDate: dueDate ? dueDate.toISOString() : null,
      dueDateObject: dueDate,
      totalAmount,
      paidAmount,
      balanceDue: this.roundMoney(Math.max(totalAmount - paidAmount, 0)),
    };
  }

  private mapSupplierPayable(payment: FinanceSupplierPaymentRecord) {
    const serviceId = this.parseServiceReference(payment.reference);
    const service = serviceId ? payment.booking?.services?.find((candidate) => candidate.id === serviceId) : null;
    const amount = this.roundMoney(Number(payment.amount || 0));
    const isPaid = String(payment.status || '').toUpperCase() === 'PAID';
    const paidAmount = isPaid ? amount : 0;

    return {
      supplierName: service?.supplier?.name || service?.supplierName || this.parseSupplierName(payment.notes) || 'Unassigned supplier',
      bookingRef: payment.booking?.bookingRef || payment.bookingId,
      serviceName: service?.description || service?.serviceType || this.parseServiceName(payment.notes) || payment.reference || 'Supplier payable',
      amount,
      paidAmount,
      balanceDue: this.roundMoney(Math.max(amount - paidAmount, 0)),
      status: payment.status || 'PENDING',
    };
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

  private startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private getDaysOverdue(dueDate: Date | null) {
    if (!dueDate) {
      return 0;
    }

    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffMs = this.startOfToday().getTime() - due.getTime();
    return diffMs > 0 ? Math.floor(diffMs / 86_400_000) : 0;
  }

  private formatMonth(date: Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private roundMoney(value: number) {
    return Number(Number(value || 0).toFixed(2));
  }
}
