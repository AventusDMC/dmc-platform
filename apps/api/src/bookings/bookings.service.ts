import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  BookingAuditEntityType,
  BookingRoomOccupancy,
  BookingServiceLifecycleStatus,
  BookingServiceStatus,
  BookingStatus,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import PDFDocument = require('pdfkit');
import nodemailer = require('nodemailer');
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
import { buildFinanceBadge } from './booking-finance-badge';
import { buildOperationsBadge } from './booking-operations-badge';
import { buildRoomingBadge } from './booking-rooming-badge';

type BookingPdfQuoteItem = {
  id?: string;
  itineraryId?: string | null;
  quantity?: number | null;
  pricingDescription?: string | null;
  service?: {
    name?: string | null;
    category?: string | null;
  } | null;
  appliedVehicleRate?: {
    routeName?: string | null;
    vehicle?: {
      name?: string | null;
    } | null;
    serviceType?: {
      name?: string | null;
    } | null;
  } | null;
  hotel?: {
    name?: string | null;
  } | null;
  contract?: {
    name?: string | null;
  } | null;
  seasonName?: string | null;
  roomCategory?: {
    name?: string | null;
  } | null;
  occupancyType?: string | null;
  mealPlan?: string | null;
};

type BookingPdfSnapshot = {
  bookingType?: string | null;
  title?: string | null;
  roomCount?: number;
  nightCount?: number;
  itineraries?: Array<{
    id?: string;
    dayNumber?: number | null;
    title?: string | null;
    description?: string | null;
  }>;
  quoteItems?: BookingPdfQuoteItem[];
};

type BookingPdfContact = {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type BookingPdfCompany = {
  name?: string | null;
  logoUrl?: string | null;
};

type BookingDocumentType = 'voucher' | 'supplier-confirmation';
type ClientInvoiceStatusValue = 'unbilled' | 'invoiced' | 'paid';
type SupplierPaymentStatusValue = 'unpaid' | 'scheduled' | 'paid';
type PaymentTypeValue = 'CLIENT' | 'SUPPLIER';
type PaymentStatusValue = 'PENDING' | 'PAID';
type PaymentMethodValue = 'bank' | 'cash' | 'card';
type DerivedPaymentRecord = {
  id: string;
  bookingId: string;
  type: PaymentTypeValue;
  amount: number;
  currency: string;
  status: PaymentStatusValue;
  method: PaymentMethodValue;
  reference: string;
  dueDate: string | Date | null;
  paidAt: string | Date | null;
  overdue: boolean;
  overdueDays: number | null;
  notes?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};
type BookingInvoiceMode = 'PACKAGE' | 'ITEMIZED';
type AuditActor =
  | {
      userId?: string | null;
      label?: string | null;
    }
  | null
  | undefined;
type BookingMutationClient = Prisma.TransactionClient | PrismaService;
type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};
const CLIENT_INVOICE_STATUSES = ['unbilled', 'invoiced', 'paid'] as const;
const SUPPLIER_PAYMENT_STATUSES = ['unpaid', 'scheduled', 'paid'] as const;
const PAYMENT_TYPES = ['CLIENT', 'SUPPLIER'] as const;
const PAYMENT_STATUSES = ['PENDING', 'PAID'] as const;
const PAYMENT_METHODS = ['bank', 'cash', 'card'] as const;

@Injectable()
export class BookingsService implements OnModuleInit, OnModuleDestroy {
  private reminderAutomationTimer: NodeJS.Timeout | null = null;
  private isProcessingReminderAutomation = false;
  private readonly analyticsCache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit() {
    if (String(process.env.BOOKING_PAYMENT_REMINDER_AUTOMATION_DISABLED || '').toLowerCase() === 'true') {
      return;
    }

    const intervalMs = Math.max(300_000, Number(process.env.BOOKING_PAYMENT_REMINDER_INTERVAL_MS || 3_600_000));
    this.reminderAutomationTimer = setInterval(() => {
      void this.processAutomatedPaymentReminders();
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.reminderAutomationTimer) {
      clearInterval(this.reminderAutomationTimer);
      this.reminderAutomationTimer = null;
    }
  }

  findAll(actor?: CompanyScopedActor) {
    const bookingWhere = this.buildBookingCompanyWhere(actor);
    return (this.prisma.booking as any)
      .findMany({
        where: bookingWhere,
        include: {
          passengers: {
            select: {
              id: true,
              roomingAssignments: {
                select: {
                  bookingRoomingEntryId: true,
                },
              },
            },
          },
        roomingEntries: {
          select: {
            id: true,
            occupancy: true,
              assignments: {
                select: {
                  bookingPassenger: {
                    select: {
                      id: true,
                    },
                  },
                },
            },
          },
        },
        payments: {
          select: {
            id: true,
            bookingId: true,
            type: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            reference: true,
            dueDate: true,
            paidAt: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        auditLogs: {
          orderBy: {
            createdAt: 'desc',
            },
            take: 8,
          },
          services: {
            include: {
              auditLogs: {
                orderBy: {
                  createdAt: 'desc',
                },
                take: 8,
              },
            },
            orderBy: [
              { serviceOrder: 'asc' },
              { id: 'asc' },
            ],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
      .then((bookings: any[]) => bookings.map((booking) => this.attachFinanceSummary(booking)));
  }

  findOne(id: string, actor?: CompanyScopedActor): Promise<any> {
    return (this.prisma.booking as any).findFirst({
      where: {
        id,
        ...this.buildBookingCompanyWhere(actor),
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
            brandCompany: true,
            contact: true,
          },
        },
        acceptedVersion: true,
        auditLogs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 12,
        },
        passengers: {
          orderBy: [
            { isLead: 'desc' },
            { createdAt: 'asc' },
          ],
          include: {
            roomingAssignments: {
              select: {
                bookingRoomingEntryId: true,
              },
            },
          },
        },
        roomingEntries: {
          orderBy: [
            { sortOrder: 'asc' },
            { createdAt: 'asc' },
          ],
          include: {
            assignments: {
              include: {
                bookingPassenger: true,
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        },
        payments: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        services: {
          include: {
            auditLogs: {
              orderBy: {
                createdAt: 'desc',
              },
              take: 6,
            },
          },
          orderBy: [
            { serviceOrder: 'asc' },
            { id: 'asc' },
          ],
        },
      },
    }).then((booking: any) => {
      if (!booking) {
        return null;
      }

      const payments: DerivedPaymentRecord[] = this.sortPaymentRecords(
        (booking.payments || []).map((payment: any) => this.mapPaymentRecord(payment)),
      );

      return {
        ...booking,
        payments,
        invoiceDelivery: this.getBookingInvoiceDelivery(booking.auditLogs || []),
        paymentReminderDelivery: this.getBookingPaymentReminderDelivery(booking.auditLogs || []),
        paymentProofSubmission: this.getBookingPaymentProofSubmission(booking.auditLogs || []),
        paymentReminderAutomation: this.getBookingPaymentReminderAutomation({
          auditLogs: booking.auditLogs || [],
          payments,
          finance: this.buildBookingFinanceSummary(booking),
        }),
        finance: this.buildBookingFinanceSummary(booking),
        operations: this.buildBookingOperationsSummary(booking.services),
        rooming: this.buildBookingRoomingSummary({
          expectedRoomCount: booking.roomCount,
          passengers: booking.passengers,
          roomingEntries: booking.roomingEntries,
        }),
        quote: {
          ...booking.quote,
          company: booking.quote.clientCompany,
          clientCompany: booking.quote.clientCompany,
          brandCompany: booking.quote.brandCompany ?? booking.quote.clientCompany,
        },
        sourceQuoteId: booking.quoteId,
      };
      });
  }

  findPortalBooking(id: string, token?: string) {
    if (!token?.trim()) {
      return Promise.resolve(null);
    }

    return this.prisma.booking
      .findFirst({
        where: {
          id,
          accessToken: token.trim(),
        },
        select: {
          id: true,
          bookingRef: true,
          adults: true,
          children: true,
          roomCount: true,
          nightCount: true,
          snapshotJson: true,
          contactSnapshotJson: true,
          services: {
            orderBy: [{ serviceOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              description: true,
              confirmationStatus: true,
              confirmationNumber: true,
            },
          },
        },
      })
      .then((booking) => booking || null);
  }

  findSupplierPortalBooking(id: string, token?: string) {
    if (!token?.trim()) {
      return Promise.resolve(null);
    }

    return this.prisma.booking
      .findFirst({
        where: {
          id,
          accessToken: token.trim(),
        },
        select: {
          id: true,
          bookingRef: true,
          adults: true,
          children: true,
          services: {
            where: {
              OR: [{ supplierId: { not: null } }, { supplierName: { not: null } }],
            },
            orderBy: [{ supplierName: 'asc' }, { serviceOrder: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              description: true,
              serviceType: true,
              serviceDate: true,
              startTime: true,
              pickupTime: true,
              pickupLocation: true,
              meetingPoint: true,
              participantCount: true,
              adultCount: true,
              childCount: true,
              supplierReference: true,
              supplierId: true,
              supplierName: true,
              confirmationStatus: true,
              confirmationNumber: true,
              confirmationNotes: true,
              notes: true,
            },
          },
        },
      })
      .then((booking) => {
        if (!booking) {
          return null;
        }

        const supplierGroups = booking.services
          .reduce<
            Array<{
              key: string;
              supplierId: string | null;
              supplierName: string;
              services: typeof booking.services;
            }>
          >((groups, service) => {
            const key = service.supplierId || service.supplierName || service.id;
            const existingGroup = groups.find((group) => group.key === key);

            if (existingGroup) {
              existingGroup.services.push(service);
              return groups;
            }

            groups.push({
              key,
              supplierId: service.supplierId,
              supplierName: service.supplierName || 'Unnamed supplier',
              services: [service],
            });

            return groups;
          }, [])
          .sort((a, b) => a.supplierName.localeCompare(b.supplierName));

        return {
          id: booking.id,
          bookingRef: booking.bookingRef,
          adults: booking.adults,
          children: booking.children,
          supplierGroups,
        };
      });
  }

  async findInvoicePortalByToken(
    token: string,
    input?: {
      trackView?: boolean;
      userAgent?: string | null;
    },
  ) {
    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      return null;
    }

    const booking = await (this.prisma.booking as any).findUnique({
      where: {
        accessToken: normalizedToken,
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
            contact: true,
          },
        },
        auditLogs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
        },
        payments: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        services: {
          select: {
            status: true,
            totalCost: true,
            totalSell: true,
          },
        },
      },
    });

    if (!booking) {
      return null;
    }

    const payments = this.listPersistedBookingPayments(booking);
    const finance = this.buildBookingFinanceSummary({
      pricingSnapshotJson: booking.pricingSnapshotJson,
      snapshotJson: booking.snapshotJson,
      services: booking.services,
      payments,
    });
    const invoiceNumber = this.buildBookingInvoiceNumber(booking.bookingRef || booking.id);
    const clientSnapshot = (booking.clientSnapshotJson || {}) as {
      name?: string | null;
    };
    const contactSnapshot = (booking.contactSnapshotJson || {}) as {
      firstName?: string | null;
      lastName?: string | null;
    };
    const bookingReference = booking.bookingRef || booking.id;
    const supportEmail =
      this.normalizeOptionalText(process.env.INVOICE_SUPPORT_EMAIL) ||
      this.normalizeOptionalText(process.env.BOOKING_DOCUMENTS_EMAIL_FROM) ||
      this.normalizeOptionalText(process.env.SMTP_FROM) ||
      null;
    const paymentInstructions = [
      `Please remit payment by bank transfer or approved settlement method using invoice reference ${invoiceNumber}.`,
      `Reference booking ${bookingReference} on all payment correspondence.`,
      `Current outstanding balance: ${this.formatMoney(finance.clientOutstanding)}.`,
    ];
    const latestAcknowledgedAt = this.getLatestBookingAuditTimestamp(
      booking.auditLogs || [],
      'booking_invoice_client_acknowledged',
    );
    const paymentProofSubmission = this.getBookingPaymentProofSubmission(booking.auditLogs || []);

    let viewedAt = this.getLatestBookingAuditTimestamp(booking.auditLogs || [], 'booking_invoice_portal_viewed');

    if (input?.trackView !== false) {
      const auditLog = await this.prisma.bookingAuditLog.create({
        data: {
          bookingId: booking.id,
          entityType: BookingAuditEntityType.booking,
          entityId: booking.id,
          action: 'booking_invoice_portal_viewed',
          newValue: invoiceNumber,
          note: this.normalizeOptionalText(input?.userAgent),
          actor: 'Client Portal',
        },
      });
      viewedAt = auditLog.createdAt;
    }

    return {
      bookingId: booking.id,
      token: normalizedToken,
      invoiceNumber,
      bookingReference,
      clientName:
        this.normalizeOptionalText(clientSnapshot.name) ||
        this.normalizeOptionalText(booking.quote?.clientCompany?.name) ||
        this.formatFullName(booking.quote?.contact || contactSnapshot),
      total: finance.effectiveTotalSell,
      paid: finance.clientPaidTotal,
      outstanding: finance.clientOutstanding,
      overdue: finance.hasOverdueClientPayments,
      overdueAmount: finance.overdueClientAmount,
      invoiceRecipientEmail: this.resolveInvoiceRecipientEmail(booking),
      paymentInstructions,
      supportEmail,
      viewedAt,
      acknowledgedAt: latestAcknowledgedAt,
      paymentProofSubmission,
    };
  }

  async acknowledgeInvoicePortal(
    token: string,
    input?: {
      userAgent?: string | null;
    },
  ) {
    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      throw new NotFoundException('Invoice not found');
    }

    const booking = await (this.prisma.booking as any).findUnique({
      where: {
        accessToken: normalizedToken,
      },
      include: {
        auditLogs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Invoice not found');
    }

    const invoiceNumber = this.buildBookingInvoiceNumber(booking.bookingRef || booking.id);
    const previousAcknowledgedAt = this.getLatestBookingAuditTimestamp(
      booking.auditLogs || [],
      'booking_invoice_client_acknowledged',
    );
    const auditLog = await this.prisma.bookingAuditLog.create({
      data: {
        bookingId: booking.id,
        entityType: BookingAuditEntityType.booking,
        entityId: booking.id,
        action: 'booking_invoice_client_acknowledged',
        oldValue: previousAcknowledgedAt ? this.formatDate(previousAcknowledgedAt) : null,
        newValue: invoiceNumber,
        note: this.normalizeOptionalText(input?.userAgent),
        actor: 'Client Portal',
      },
    });

    return {
      ok: true,
      bookingId: booking.id,
      acknowledgedAt: auditLog.createdAt,
    };
  }

  async generateInvoicePdfByToken(token: string) {
    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      throw new NotFoundException('Invoice not found');
    }

    const booking = await (this.prisma.booking as any).findUnique({
      where: {
        accessToken: normalizedToken,
      },
      select: {
        id: true,
        bookingRef: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Invoice not found');
    }

    return {
      bookingId: booking.id,
      bookingRef: booking.bookingRef || booking.id,
      pdfBuffer: await this.generateInvoicePdf(booking.id, 'PACKAGE'),
    };
  }

  async submitInvoicePaymentProof(
    token: string,
    input: {
      reference?: string | null;
      amount?: number | null;
      receiptUrl?: string | null;
      userAgent?: string | null;
    },
  ) {
    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      throw new NotFoundException('Invoice not found');
    }

    if (!input.reference && !input.receiptUrl) {
      throw new BadRequestException('Provide a payment reference or receipt file');
    }

    const booking = await (this.prisma.booking as any).findUnique({
      where: {
        accessToken: normalizedToken,
      },
      include: {
        auditLogs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Invoice not found');
    }

    const invoiceNumber = this.buildBookingInvoiceNumber(booking.bookingRef || booking.id);
    const previousProof = this.getBookingPaymentProofSubmission(booking.auditLogs || []);
    const note = JSON.stringify({
      reference: this.normalizeOptionalText(input.reference) || null,
      amount: input.amount === undefined || input.amount === null ? null : this.roundMoney(input.amount),
      receiptUrl: this.normalizeOptionalText(input.receiptUrl) || null,
      userAgent: this.normalizeOptionalText(input.userAgent) || null,
    });
    const auditLog = await this.prisma.bookingAuditLog.create({
      data: {
        bookingId: booking.id,
        entityType: BookingAuditEntityType.booking,
        entityId: booking.id,
        action: 'booking_payment_proof_submitted',
        oldValue: previousProof?.reference || null,
        newValue: invoiceNumber,
        note,
        actor: 'Client Portal',
      },
    });
    const paymentProofSubmission = this.getBookingPaymentProofSubmission([auditLog, ...(booking.auditLogs || [])]);
    this.invalidateAnalyticsCaches();

    return {
      ok: true,
      bookingId: booking.id,
      submittedAt: auditLog.createdAt,
      paymentProofSubmission,
    };
  }

  async regeneratePortalAccessToken(id: string, actor?: CompanyScopedActor) {
    const booking = await (this.prisma.booking as any).findFirst({
      where: {
        id,
        ...this.buildBookingCompanyWhere(actor),
      },
      select: {
        id: true,
        accessToken: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return this.prisma.booking.update({
      where: { id },
      data: {
        accessToken: this.generateBookingAccessToken(),
      },
      select: {
        id: true,
        accessToken: true,
      },
    });
  }

  async updateBookingStatus(
    id: string,
    data: {
      status: BookingStatus | 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
      note: string;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const note = this.normalizeManualOverrideNote(data.note, 'Booking status update note is required');
    const actor = data.actor;

    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id,
          ...this.buildBookingCompanyWhere(data.companyActor),
        },
        select: {
          id: true,
          status: true,
          services: {
            select: {
              id: true,
              description: true,
              serviceType: true,
              serviceDate: true,
              status: true,
              confirmationStatus: true,
              supplierId: true,
              supplierName: true,
              totalCost: true,
              totalSell: true,
            },
          },
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      this.assertAllowedBookingStatusTransition(booking.status, data.status);
      this.assertBookingStatusReadiness(booking, data.status);

      const updatedBooking = await tx.booking.update({
        where: { id },
        data: {
          status: data.status,
          statusNote: note,
        },
      });

      await this.createAuditLog(tx, {
        bookingId: booking.id,
        entityType: BookingAuditEntityType.booking,
        entityId: booking.id,
        action: 'booking_status_updated',
        oldValue: booking.status,
        newValue: data.status,
        note,
        actor,
      });

      await this.auditService.log({
        actor: data.companyActor
          ? {
              id: data.actor?.userId ?? null,
              companyId: data.companyActor.companyId,
            }
          : null,
        action: 'booking.updated',
        entity: 'booking',
        entityId: booking.id,
        metadata: {
          field: 'status',
          from: booking.status,
          to: data.status,
        },
      });

      return updatedBooking;
    });
  }

  async updateBookingFinance(
    id: string,
    data: {
      clientInvoiceStatus?: ClientInvoiceStatusValue;
      supplierPaymentStatus?: SupplierPaymentStatusValue;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id,
        ...this.buildBookingCompanyWhere(data.companyActor),
      },
      select: {
        id: true,
        bookingRef: true,
        pricingSnapshotJson: true,
        snapshotJson: true,
        payments: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        services: {
          select: {
            status: true,
            totalCost: true,
            totalSell: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const finance = this.buildBookingFinanceSummary(booking);
    const nextClientInvoiceStatus =
      data.clientInvoiceStatus === undefined
        ? finance.clientInvoiceStatus
        : this.normalizeClientInvoiceStatus(data.clientInvoiceStatus);
    const nextSupplierPaymentStatus =
      data.supplierPaymentStatus === undefined
        ? finance.supplierPaymentStatus
        : this.normalizeSupplierPaymentStatus(data.supplierPaymentStatus);

    if (
      nextClientInvoiceStatus === finance.clientInvoiceStatus &&
      nextSupplierPaymentStatus === finance.supplierPaymentStatus
    ) {
      return this.findOne(id, data.companyActor);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.applyFinanceStatusShortcut(tx, {
        booking,
        finance,
        nextClientInvoiceStatus,
        nextSupplierPaymentStatus,
      });

      await this.createAuditLog(tx, {
        bookingId: id,
        entityType: BookingAuditEntityType.booking,
        entityId: id,
        action: 'booking_finance_status_updated',
        oldValue: this.formatBookingFinanceStatusSummary(finance.clientInvoiceStatus, finance.supplierPaymentStatus),
        newValue: this.formatBookingFinanceStatusSummary(nextClientInvoiceStatus, nextSupplierPaymentStatus),
        actor: data.actor,
      });
    });

    await this.auditService.log({
      actor: data.companyActor
        ? {
            id: data.actor?.userId ?? null,
            companyId: data.companyActor.companyId,
          }
        : null,
      action: 'booking.updated',
      entity: 'booking',
      entityId: id,
      metadata: {
        field: 'finance',
        clientInvoiceStatus: nextClientInvoiceStatus,
        supplierPaymentStatus: nextSupplierPaymentStatus,
      },
    });

    return this.findOne(id, data.companyActor);
  }

  async listPayments(bookingId: string, actor?: CompanyScopedActor) {
    await this.assertBookingExists(bookingId, actor);

    return ((this.prisma as any).payment as any)
      .findMany({
        where: {
          bookingId,
          ...this.buildPaymentCompanyWhere(actor),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
      .then((payments: any[]) => this.sortPaymentRecords(payments.map((payment) => this.mapPaymentRecord(payment))));
  }

  async getFinanceDashboard(actor?: CompanyScopedActor) {
    return this.withAnalyticsCache(this.buildCompanyScopedCacheKey('finance-dashboard', actor), 45_000, async () => {
      const period = this.getFinanceDashboardPeriodWindow();
      const sparklineSeries = this.buildFinanceSparklineSeriesWindow();
      const monthlySeries = this.buildFinanceMonthlySeriesWindow();
      const bookingWhere = this.buildBookingCompanyWhere(actor);
      const paymentWhere = this.buildPaymentCompanyWhere(actor);
      const bookingServiceWhere = this.buildBookingServiceCompanyWhere(actor);
      const [bookings, payments, serviceSums] = await Promise.all([
        (this.prisma.booking as any).findMany({
          where: bookingWhere,
          select: {
            id: true,
            bookingRef: true,
            createdAt: true,
            snapshotJson: true,
            clientSnapshotJson: true,
            pricingSnapshotJson: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        }),
        (this.prisma as any).payment.findMany({
          where: paymentWhere,
          select: {
            id: true,
            bookingId: true,
            type: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            reference: true,
            dueDate: true,
            paidAt: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
        (this.prisma as any).bookingService.groupBy({
          by: ['bookingId'],
          where: {
            ...bookingServiceWhere,
            status: {
              not: BookingServiceLifecycleStatus.cancelled,
            },
          },
          _sum: {
            totalCost: true,
            totalSell: true,
          },
        }),
      ]);

      const paymentsByBookingId = new Map<string, any[]>();
      for (const payment of payments) {
        const entries = paymentsByBookingId.get(payment.bookingId) || [];
        entries.push(payment);
        paymentsByBookingId.set(payment.bookingId, entries);
      }

      const serviceSummaryByBookingId = new Map<
        string,
        {
          status: BookingServiceLifecycleStatus;
          totalCost: number;
          totalSell: number;
        }
      >(
        serviceSums.map((entry: { bookingId: string; _sum: { totalCost: number | null; totalSell: number | null } }) => [
          entry.bookingId,
          {
            status: BookingServiceLifecycleStatus.confirmed,
            totalCost: Number(entry._sum.totalCost || 0),
            totalSell: Number(entry._sum.totalSell || 0),
          },
        ]),
      );

      const aggregate = bookings.reduce(
      (
        summary: {
          totalRevenue: number;
          totalCollected: number;
          totalOutstanding: number;
          totalOverdue: number;
          supplierPayable: number;
          totalCost: number;
          overdueClientCount: number;
          overdueClientAmount: number;
          overdueSupplierCount: number;
          overdueSupplierAmount: number;
          currentPeriod: {
            revenue: number;
            collected: number;
            outstanding: number;
            overdue: number;
            supplierPayable: number;
            profit: number;
          };
          previousPeriod: {
            revenue: number;
            collected: number;
            outstanding: number;
            overdue: number;
            supplierPayable: number;
            profit: number;
          };
          sparklineSeries: {
            revenue: number[];
            collected: number[];
            outstanding: number[];
            overdue: number[];
          };
          sparklineDates: Date[];
          monthlySeries: Array<{
            label: string;
            start: Date;
            end: Date;
            revenue: number;
            collected: number;
          }>;
          recentPayments: Array<{
            id: string;
            bookingId: string;
            bookingRef: string;
            bookingTitle: string;
            clientName: string;
            type: PaymentTypeValue;
            amount: number;
            currency: string;
            status: PaymentStatusValue;
            dueDate: string | Date | null;
            paidAt: string | Date | null;
            overdue: boolean;
            overdueDays: number | null;
            createdAt: string | Date | null;
          }>;
        },
        booking: any,
      ) => {
        const paymentRecords: DerivedPaymentRecord[] = this.sortPaymentRecords(
          ((paymentsByBookingId.get(booking.id) || []) as any[]).map((payment: any) => this.mapPaymentRecord(payment)),
        );
        const serviceSummary = serviceSummaryByBookingId.get(booking.id);
        const groupedServices: Array<{
          status: BookingServiceLifecycleStatus;
          totalCost: number;
          totalSell: number;
        }> = serviceSummary ? [serviceSummary] : [];
        const metrics = this.computeBookingFinanceMetrics({
          pricingSnapshotJson: booking.pricingSnapshotJson,
          snapshotJson: booking.snapshotJson,
          services: groupedServices,
          payments: paymentRecords,
        });
        const title = this.getBookingDashboardTitle(booking.snapshotJson);
        const clientName = this.getBookingDashboardClientName(booking.clientSnapshotJson, booking.snapshotJson);

        summary.totalRevenue += metrics.effectiveTotalSell;
        summary.totalCollected += metrics.clientPaidTotal;
        summary.totalOutstanding += metrics.clientOutstanding;
        summary.totalOverdue += metrics.overdueClientAmount + metrics.overdueSupplierAmount;
        summary.supplierPayable += metrics.supplierOutstanding;
        summary.totalCost += metrics.effectiveTotalCost;
        summary.overdueClientCount += metrics.overdueClientPayments.length;
        summary.overdueClientAmount += metrics.overdueClientAmount;
        summary.overdueSupplierCount += metrics.overdueSupplierPayments.length;
        summary.overdueSupplierAmount += metrics.overdueSupplierAmount;

        if (this.isDateInRange(booking.createdAt, period.currentStart, period.currentEnd)) {
          summary.currentPeriod.revenue += metrics.effectiveTotalSell;
          summary.currentPeriod.outstanding += metrics.clientOutstanding;
          summary.currentPeriod.supplierPayable += metrics.supplierOutstanding;
          summary.currentPeriod.profit += metrics.effectiveTotalSell - metrics.effectiveTotalCost;
        } else if (this.isDateInRange(booking.createdAt, period.previousStart, period.previousEnd)) {
          summary.previousPeriod.revenue += metrics.effectiveTotalSell;
          summary.previousPeriod.outstanding += metrics.clientOutstanding;
          summary.previousPeriod.supplierPayable += metrics.supplierOutstanding;
          summary.previousPeriod.profit += metrics.effectiveTotalSell - metrics.effectiveTotalCost;
        }

        const sparklineBookingIndex = this.findFinanceSeriesIndex(booking.createdAt, summary.sparklineDates);
        if (sparklineBookingIndex >= 0) {
          summary.sparklineSeries.revenue[sparklineBookingIndex] += metrics.effectiveTotalSell;
          summary.sparklineSeries.outstanding[sparklineBookingIndex] += metrics.clientOutstanding;
        }

        const monthlyBookingIndex = this.findFinanceMonthlySeriesIndex(booking.createdAt, summary.monthlySeries);
        if (monthlyBookingIndex >= 0) {
          summary.monthlySeries[monthlyBookingIndex].revenue += metrics.effectiveTotalSell;
        }

        paymentRecords.forEach((payment) => {
          if (payment.status === 'PAID' && this.isDateInRange(payment.paidAt, period.currentStart, period.currentEnd)) {
            summary.currentPeriod.collected += payment.type === 'CLIENT' ? payment.amount : 0;
          } else if (payment.status === 'PAID' && this.isDateInRange(payment.paidAt, period.previousStart, period.previousEnd)) {
            summary.previousPeriod.collected += payment.type === 'CLIENT' ? payment.amount : 0;
          }

          if (payment.overdue && this.isDateInRange(payment.dueDate, period.currentStart, period.currentEnd)) {
            summary.currentPeriod.overdue += payment.amount;
          } else if (payment.overdue && this.isDateInRange(payment.dueDate, period.previousStart, period.previousEnd)) {
            summary.previousPeriod.overdue += payment.amount;
          }

          const sparklineCollectedIndex = this.findFinanceSeriesIndex(payment.paidAt, summary.sparklineDates);
          if (payment.status === 'PAID' && payment.type === 'CLIENT' && sparklineCollectedIndex >= 0) {
            summary.sparklineSeries.collected[sparklineCollectedIndex] += payment.amount;
          }

          const sparklineOverdueIndex = this.findFinanceSeriesIndex(payment.dueDate, summary.sparklineDates);
          if (payment.overdue && sparklineOverdueIndex >= 0) {
            summary.sparklineSeries.overdue[sparklineOverdueIndex] += payment.amount;
          }

          const monthlyCollectedIndex = this.findFinanceMonthlySeriesIndex(payment.paidAt, summary.monthlySeries);
          if (payment.status === 'PAID' && payment.type === 'CLIENT' && monthlyCollectedIndex >= 0) {
            summary.monthlySeries[monthlyCollectedIndex].collected += payment.amount;
          }
        });

        summary.recentPayments.push(
          ...paymentRecords.map((payment) => ({
            id: payment.id,
            bookingId: booking.id,
            bookingRef: booking.bookingRef || booking.id,
            bookingTitle: title,
            clientName,
            type: payment.type,
            amount: payment.amount,
            currency: payment.currency,
            status: payment.status,
            dueDate: payment.dueDate,
            paidAt: payment.paidAt,
            overdue: payment.overdue,
            overdueDays: payment.overdueDays,
            createdAt: payment.createdAt ?? null,
          })),
        );

        return summary;
        },
        {
        totalRevenue: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        totalOverdue: 0,
        supplierPayable: 0,
        totalCost: 0,
        overdueClientCount: 0,
        overdueClientAmount: 0,
        overdueSupplierCount: 0,
        overdueSupplierAmount: 0,
        currentPeriod: {
          revenue: 0,
          collected: 0,
          outstanding: 0,
          overdue: 0,
          supplierPayable: 0,
          profit: 0,
        },
        previousPeriod: {
          revenue: 0,
          collected: 0,
          outstanding: 0,
          overdue: 0,
          supplierPayable: 0,
          profit: 0,
        },
        sparklineSeries: {
          revenue: sparklineSeries.map(() => 0),
          collected: sparklineSeries.map(() => 0),
          outstanding: sparklineSeries.map(() => 0),
          overdue: sparklineSeries.map(() => 0),
        },
        sparklineDates: sparklineSeries,
        monthlySeries: monthlySeries.map((point) => ({
          ...point,
          revenue: 0,
          collected: 0,
        })),
        recentPayments: [] as Array<{
          id: string;
          bookingId: string;
          bookingRef: string;
          bookingTitle: string;
          clientName: string;
          type: PaymentTypeValue;
          amount: number;
          currency: string;
          status: PaymentStatusValue;
          dueDate: string | Date | null;
          paidAt: string | Date | null;
          overdue: boolean;
          overdueDays: number | null;
          createdAt: string | Date | null;
        }>,
        },
      );

      const totalRevenue = this.roundMoney(aggregate.totalRevenue);
      const totalCollected = this.roundMoney(aggregate.totalCollected);
      const totalOutstanding = this.roundMoney(aggregate.totalOutstanding);
      const totalOverdue = this.roundMoney(aggregate.totalOverdue);
      const supplierPayable = this.roundMoney(aggregate.supplierPayable);
      const profit = this.roundMoney(totalRevenue - aggregate.totalCost);
      const margin = totalRevenue > 0 ? Number(((profit / totalRevenue) * 100).toFixed(2)) : 0;
      const currentMargin =
        aggregate.currentPeriod.revenue > 0
          ? Number(((aggregate.currentPeriod.profit / aggregate.currentPeriod.revenue) * 100).toFixed(2))
          : 0;
      const previousMargin =
        aggregate.previousPeriod.revenue > 0
          ? Number(((aggregate.previousPeriod.profit / aggregate.previousPeriod.revenue) * 100).toFixed(2))
          : 0;

      const recentPayments = [...aggregate.recentPayments]
        .sort((left, right) => {
          if (left.overdue !== right.overdue) {
            return left.overdue ? -1 : 1;
          }

          const leftActivity = left.paidAt ? new Date(left.paidAt).getTime() : left.createdAt ? new Date(left.createdAt).getTime() : 0;
          const rightActivity = right.paidAt ? new Date(right.paidAt).getTime() : right.createdAt ? new Date(right.createdAt).getTime() : 0;
          return rightActivity - leftActivity;
        })
        .slice(0, 8);

      return {
        totalRevenue,
        totalCollected,
        totalOutstanding,
        totalOverdue,
        supplierPayable,
        profit,
        margin,
        trends: {
          revenue: this.buildFinanceDashboardTrend(aggregate.currentPeriod.revenue, aggregate.previousPeriod.revenue),
          collected: this.buildFinanceDashboardTrend(aggregate.currentPeriod.collected, aggregate.previousPeriod.collected),
          outstanding: this.buildFinanceDashboardTrend(aggregate.currentPeriod.outstanding, aggregate.previousPeriod.outstanding),
          overdue: this.buildFinanceDashboardTrend(aggregate.currentPeriod.overdue, aggregate.previousPeriod.overdue),
          supplierPayable: this.buildFinanceDashboardTrend(
            aggregate.currentPeriod.supplierPayable,
            aggregate.previousPeriod.supplierPayable,
          ),
          profit: this.buildFinanceDashboardTrend(aggregate.currentPeriod.profit, aggregate.previousPeriod.profit),
          margin: this.buildFinanceDashboardTrend(currentMargin, previousMargin, 'pp'),
        },
        trendLabel: `vs last ${period.lengthDays} days`,
        sparklineSeries: {
          revenue: aggregate.sparklineSeries.revenue.map((value: number) => this.roundMoney(value)),
          collected: aggregate.sparklineSeries.collected.map((value: number) => this.roundMoney(value)),
          outstanding: aggregate.sparklineSeries.outstanding.map((value: number) => this.roundMoney(value)),
          overdue: aggregate.sparklineSeries.overdue.map((value: number) => this.roundMoney(value)),
        },
        monthlySeries: aggregate.monthlySeries.map((point: { label: string; revenue: number; collected: number }) => ({
          label: point.label,
          revenue: this.roundMoney(point.revenue),
          collected: this.roundMoney(point.collected),
        })),
        overdueBreakdown: {
          client: {
            count: aggregate.overdueClientCount,
            amount: this.roundMoney(aggregate.overdueClientAmount),
          },
          supplier: {
            count: aggregate.overdueSupplierCount,
            amount: this.roundMoney(aggregate.overdueSupplierAmount),
          },
        },
        recentPayments,
      };
    });
  }

  async getPaymentProofReconciliationQueue(actor?: CompanyScopedActor) {
    return this.withAnalyticsCache(this.buildCompanyScopedCacheKey('reconciliation-queue', actor), 30_000, async () => {
      const now = new Date();
      const pendingPayments = await (this.prisma as any).payment.findMany({
        where: {
          ...this.buildPaymentCompanyWhere(actor),
          type: 'CLIENT',
          status: 'PENDING',
        },
        select: {
          id: true,
          bookingId: true,
          amount: true,
          currency: true,
          status: true,
          method: true,
          reference: true,
          dueDate: true,
          paidAt: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          booking: {
            select: {
              id: true,
              bookingRef: true,
              snapshotJson: true,
              clientSnapshotJson: true,
              contactSnapshotJson: true,
              pricingSnapshotJson: true,
              quote: {
                select: {
                  clientCompany: {
                    select: {
                      name: true,
                    },
                  },
                  contact: {
                    select: {
                      firstName: true,
                      lastName: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });

      const bookingIds = Array.from(new Set(pendingPayments.map((payment: any) => payment.bookingId)));
      if (bookingIds.length === 0) {
        return [];
      }

      const [otherPayments, serviceSums, auditLogs] = await Promise.all([
        (this.prisma as any).payment.findMany({
          where: {
            ...this.buildPaymentCompanyWhere(actor),
            bookingId: { in: bookingIds },
            NOT: {
              id: {
                in: pendingPayments.map((payment: any) => payment.id),
              },
            },
          },
          select: {
            id: true,
            bookingId: true,
            type: true,
            amount: true,
            currency: true,
            status: true,
            method: true,
            reference: true,
            dueDate: true,
            paidAt: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        (this.prisma as any).bookingService.groupBy({
          by: ['bookingId'],
          where: {
            ...this.buildBookingServiceCompanyWhere(actor),
            bookingId: { in: bookingIds },
            status: {
              not: BookingServiceLifecycleStatus.cancelled,
            },
          },
          _sum: {
            totalCost: true,
            totalSell: true,
          },
        }),
        (this.prisma as any).bookingAuditLog.findMany({
          where: {
            ...this.buildBookingAuditLogCompanyWhere(actor),
            bookingId: { in: bookingIds },
            action: {
              in: ['booking_payment_proof_submitted', 'booking_invoice_sent', 'booking_payment_reminder_sent'],
            },
          },
          select: {
            bookingId: true,
            action: true,
            newValue: true,
            note: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: 'desc' }],
        }),
      ]);

      const paymentsByBookingId = new Map<string, DerivedPaymentRecord[]>();
      for (const payment of [...pendingPayments, ...otherPayments]) {
        const entries = paymentsByBookingId.get(payment.bookingId) || [];
        entries.push(this.mapPaymentRecord(payment));
        paymentsByBookingId.set(payment.bookingId, entries);
      }

      const serviceSummaryByBookingId = new Map<
        string,
        {
          status: BookingServiceLifecycleStatus;
          totalCost: number;
          totalSell: number;
        }
      >(
        serviceSums.map((entry: { bookingId: string; _sum: { totalCost: number | null; totalSell: number | null } }) => [
          entry.bookingId,
          {
            status: BookingServiceLifecycleStatus.confirmed,
            totalCost: Number(entry._sum.totalCost || 0),
            totalSell: Number(entry._sum.totalSell || 0),
          },
        ]),
      );

      const auditLogsByBookingId = new Map<string, Array<{ action: string; newValue?: string | null; note?: string | null; createdAt: Date }>>();
      for (const log of auditLogs) {
        const entries = auditLogsByBookingId.get(log.bookingId) || [];
        entries.push(log);
        auditLogsByBookingId.set(log.bookingId, entries);
      }

      const bookingQueue = pendingPayments
        .map((pendingPayment: any) => {
          const booking = pendingPayment.booking;
          const bookingAuditLogs = auditLogsByBookingId.get(booking.id) || [];
          const payments = this.sortPaymentRecords(paymentsByBookingId.get(booking.id) || []);
          const paymentProofSubmission = this.getBookingPaymentProofSubmission(bookingAuditLogs);
          if (!paymentProofSubmission) {
            return null;
          }

          const groupedServices: Array<{
            status: BookingServiceLifecycleStatus;
            totalCost: number;
            totalSell: number;
          }> = serviceSummaryByBookingId.get(booking.id) ? [serviceSummaryByBookingId.get(booking.id)!] : [];
          const finance = this.buildBookingFinanceSummary({
            pricingSnapshotJson: booking.pricingSnapshotJson,
            snapshotJson: booking.snapshotJson,
            services: groupedServices,
            payments,
          });

          if (finance.clientOutstanding <= 0) {
            return null;
          }

          const clientSnapshot = (booking.clientSnapshotJson || {}) as {
            name?: string | null;
          };
          const contactSnapshot = (booking.contactSnapshotJson || {}) as {
            firstName?: string | null;
            lastName?: string | null;
          };
          const matchPct =
            paymentProofSubmission.amount && finance.clientOutstanding > 0
              ? Number(((paymentProofSubmission.amount / finance.clientOutstanding) * 100).toFixed(1))
              : null;
          const confidence = this.getPaymentProofMatchConfidence({
            matchPct,
            hasReceipt: Boolean(paymentProofSubmission.receiptUrl),
          });
          const readyToConfirm = confidence === 'high';
          const reminderAutomation = this.getBookingPaymentReminderAutomation({
            auditLogs: bookingAuditLogs,
            payments,
            finance,
          });

          return {
            bookingId: booking.id,
            bookingReference: booking.bookingRef || booking.id,
            clientName:
              this.normalizeOptionalText(clientSnapshot.name) ||
              this.normalizeOptionalText(booking.quote?.clientCompany?.name) ||
              this.formatFullName(booking.quote?.contact || contactSnapshot),
            outstandingAmount: finance.clientOutstanding,
            overdue: finance.hasOverdueClientPayments,
            overdueAmount: finance.overdueClientAmount,
            paymentId: pendingPayment.id,
            paymentAmount: pendingPayment.amount,
            submittedProofReference: paymentProofSubmission.reference,
            submittedProofAmount: paymentProofSubmission.amount,
            receiptUrl: paymentProofSubmission.receiptUrl,
            submittedAt: paymentProofSubmission.submittedAt,
            matchPct,
            confidence,
            readyToConfirm,
            reminderStage: reminderAutomation.stage,
            reminderCooldownActive: Boolean(
              !readyToConfirm &&
                reminderAutomation.nextReminderDueAt &&
                new Date(reminderAutomation.nextReminderDueAt).getTime() > now.getTime(),
            ),
            nextReminderDueAt: reminderAutomation.nextReminderDueAt,
            invoiceDelivery: this.getBookingInvoiceDelivery(bookingAuditLogs),
            paymentReminderDelivery: this.getBookingPaymentReminderDelivery(bookingAuditLogs),
          };
        })
        .filter(Boolean);

      return bookingQueue.sort((left: any, right: any) => {
        const leftTime = left?.submittedAt ? new Date(left.submittedAt).getTime() : 0;
        const rightTime = right?.submittedAt ? new Date(right.submittedAt).getTime() : 0;
        return rightTime - leftTime;
      });
    });
  }

  async getPaymentProofReconciliationSummary(actor?: CompanyScopedActor) {
    return this.withAnalyticsCache(this.buildCompanyScopedCacheKey('reconciliation-summary', actor), 60_000, async () => {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const [confirmedPayments, reminderLogs] = await Promise.all([
      (this.prisma as any).payment.findMany({
        where: {
          ...this.buildPaymentCompanyWhere(actor),
          type: 'CLIENT',
          status: 'PAID',
          paidAt: {
            gte: startOfDay,
            lte: now,
          },
        },
        select: {
          bookingId: true,
          amount: true,
          paidAt: true,
        },
      }),
      (this.prisma as any).bookingAuditLog.findMany({
        where: {
          ...this.buildBookingAuditLogCompanyWhere(actor),
          action: 'booking_payment_reminder_sent',
          createdAt: {
            gte: startOfDay,
            lte: now,
          },
        },
        select: {
          bookingId: true,
          createdAt: true,
        },
      }),
    ]);

      const confirmationBookingIds = Array.from(
      new Set(confirmedPayments.map((payment: { bookingId: string | null }) => payment.bookingId).filter(Boolean)),
      ) as string[];

      const proofLogsByBooking = new Map<string, Array<{ createdAt: Date }>>();
      if (confirmationBookingIds.length > 0) {
      const proofLogs = await (this.prisma as any).bookingAuditLog.findMany({
        where: {
          ...this.buildBookingAuditLogCompanyWhere(actor),
          bookingId: {
            in: confirmationBookingIds,
          },
          action: 'booking_payment_proof_submitted',
        },
        select: {
          bookingId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

        for (const log of proofLogs) {
        const entries = proofLogsByBooking.get(log.bookingId) || [];
        entries.push({ createdAt: log.createdAt });
        proofLogsByBooking.set(log.bookingId, entries);
      }
      }

      const processingTimes = confirmedPayments
      .map((payment: { bookingId: string; paidAt: Date }) => {
        const proofLogs = proofLogsByBooking.get(payment.bookingId) || [];
        const latestRelevantProof = proofLogs.find((log) => log.createdAt.getTime() <= new Date(payment.paidAt).getTime());

        if (!latestRelevantProof) {
          return null;
        }

        return Math.max(
          0,
          Math.round((new Date(payment.paidAt).getTime() - latestRelevantProof.createdAt.getTime()) / 60000),
        );
      })
        .filter((value: number | null): value is number => value !== null);

      return {
        confirmedCount: confirmedPayments.length,
        confirmedAmount: this.roundMoney(
          confirmedPayments.reduce((sum: number, payment: { amount: number }) => sum + Number(payment.amount || 0), 0),
        ),
        remindersSent: reminderLogs.length,
        avgProcessingTime:
          processingTimes.length > 0
            ? Math.round(processingTimes.reduce((sum: number, value: number) => sum + value, 0) / processingTimes.length)
            : null,
      };
    });
  }

  async getPaymentProofReconciliationPerformance(actor?: CompanyScopedActor) {
    return this.withAnalyticsCache(this.buildCompanyScopedCacheKey('reconciliation-performance', actor), 60_000, async () => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const series30Start = new Date(startOfToday);
    series30Start.setDate(series30Start.getDate() - 29);
    const series7Start = new Date(startOfToday);
    series7Start.setDate(series7Start.getDate() - 6);

    const [confirmedPayments, reminderLogs] = await Promise.all([
      (this.prisma as any).payment.findMany({
        where: {
          ...this.buildPaymentCompanyWhere(actor),
          type: 'CLIENT',
          status: 'PAID',
          paidAt: {
            gte: series30Start,
            lte: now,
          },
        },
        select: {
          bookingId: true,
          amount: true,
          paidAt: true,
        },
      }),
      (this.prisma as any).bookingAuditLog.findMany({
        where: {
          ...this.buildBookingAuditLogCompanyWhere(actor),
          action: 'booking_payment_reminder_sent',
          createdAt: {
            gte: series30Start,
            lte: now,
          },
        },
        select: {
          bookingId: true,
          createdAt: true,
        },
      }),
    ]);

    const confirmationBookingIds = Array.from(
      new Set(confirmedPayments.map((payment: { bookingId: string | null }) => payment.bookingId).filter(Boolean)),
    ) as string[];

    const proofLogsByBooking = new Map<string, Array<{ createdAt: Date }>>();
    if (confirmationBookingIds.length > 0) {
      const proofLogs = await (this.prisma as any).bookingAuditLog.findMany({
        where: {
          ...this.buildBookingAuditLogCompanyWhere(actor),
          bookingId: {
            in: confirmationBookingIds,
          },
          action: 'booking_payment_proof_submitted',
        },
        select: {
          bookingId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      for (const log of proofLogs) {
        const entries = proofLogsByBooking.get(log.bookingId) || [];
        entries.push({ createdAt: log.createdAt });
        proofLogsByBooking.set(log.bookingId, entries);
      }
    }

    const processingSamples = confirmedPayments
      .map((payment: { bookingId: string; paidAt: Date; amount: number }) => {
        const proofLogs = proofLogsByBooking.get(payment.bookingId) || [];
        const latestRelevantProof = proofLogs.find((log) => log.createdAt.getTime() <= new Date(payment.paidAt).getTime());

        if (!latestRelevantProof) {
          return null;
        }

        return {
          bookingId: payment.bookingId,
          paidAt: payment.paidAt,
          amount: payment.amount,
          minutes: Math.max(
            0,
            Math.round((new Date(payment.paidAt).getTime() - latestRelevantProof.createdAt.getTime()) / 60000),
          ),
        };
      })
      .filter(
        (
          value: { bookingId: string; paidAt: Date; amount: number; minutes: number } | null,
        ): value is { bookingId: string; paidAt: Date; amount: number; minutes: number } => value !== null,
      );

    const buildWindowSummary = (startDate: Date, endDate?: Date) => {
      const windowConfirmed = confirmedPayments.filter(
        (payment: { paidAt: Date }) =>
          new Date(payment.paidAt).getTime() >= startDate.getTime() &&
          (endDate ? new Date(payment.paidAt).getTime() < endDate.getTime() : true),
      );
      const windowReminders = reminderLogs.filter(
        (log: { createdAt: Date }) =>
          new Date(log.createdAt).getTime() >= startDate.getTime() &&
          (endDate ? new Date(log.createdAt).getTime() < endDate.getTime() : true),
      );
      const windowProcessing = processingSamples.filter(
        (sample: { paidAt: Date; minutes: number }) =>
          new Date(sample.paidAt).getTime() >= startDate.getTime() &&
          (endDate ? new Date(sample.paidAt).getTime() < endDate.getTime() : true),
      );

      return {
        confirmedCount: windowConfirmed.length,
        confirmedAmount: this.roundMoney(
          windowConfirmed.reduce((sum: number, payment: { amount: number }) => sum + Number(payment.amount || 0), 0),
        ),
        remindersSent: windowReminders.length,
        avgProcessingTime:
          windowProcessing.length > 0
            ? Math.round(
                windowProcessing.reduce((sum: number, sample: { minutes: number }) => sum + sample.minutes, 0) /
                  windowProcessing.length,
              )
            : null,
      };
    };

    const previousWeekStart = new Date(series7Start);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    const previousMonthStart = new Date(series30Start);
    previousMonthStart.setDate(previousMonthStart.getDate() - 30);

    const buildSeries = (days: number, startDate: Date) => {
      const points = Array.from({ length: days }, (_, index) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);
        const key = date.toISOString().slice(0, 10);

        return {
          key,
          label: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date),
          confirmedCount: 0,
          confirmedAmount: 0,
          remindersSent: 0,
          processingSamples: [] as number[],
        };
      });

      const pointByKey = new Map(points.map((point) => [point.key, point]));

      for (const payment of confirmedPayments) {
        const key = new Date(payment.paidAt).toISOString().slice(0, 10);
        const point = pointByKey.get(key);
        if (point) {
          point.confirmedCount += 1;
          point.confirmedAmount += Number(payment.amount || 0);
        }
      }

      for (const reminder of reminderLogs) {
        const key = new Date(reminder.createdAt).toISOString().slice(0, 10);
        const point = pointByKey.get(key);
        if (point) {
          point.remindersSent += 1;
        }
      }

      for (const sample of processingSamples) {
        const key = new Date(sample.paidAt).toISOString().slice(0, 10);
        const point = pointByKey.get(key);
        if (point) {
          point.processingSamples.push(sample.minutes);
        }
      }

      return points.map((point) => ({
        label: point.label,
        confirmedCount: point.confirmedCount,
        confirmedAmount: this.roundMoney(point.confirmedAmount),
        remindersSent: point.remindersSent,
        avgProcessingTime:
          point.processingSamples.length > 0
            ? Math.round(point.processingSamples.reduce((sum: number, value: number) => sum + value, 0) / point.processingSamples.length)
            : null,
      }));
    };

    const weekly = buildWindowSummary(series7Start);
    const previousWeekly = buildWindowSummary(previousWeekStart, series7Start);
    const monthly = buildWindowSummary(series30Start);
    const previousMonthly = buildWindowSummary(previousMonthStart, series30Start);
    const weeklyProcessingTrend =
      weekly.avgProcessingTime !== null && previousWeekly.avgProcessingTime !== null
        ? this.buildFinanceDashboardTrend(previousWeekly.avgProcessingTime, weekly.avgProcessingTime)
        : this.buildFinanceDashboardTrend(0, 0);
    const monthlyProcessingTrend =
      monthly.avgProcessingTime !== null && previousMonthly.avgProcessingTime !== null
        ? this.buildFinanceDashboardTrend(previousMonthly.avgProcessingTime, monthly.avgProcessingTime)
        : this.buildFinanceDashboardTrend(0, 0);
    const trends = {
      weekly: {
        confirmedAmount: this.buildFinanceDashboardTrend(weekly.confirmedAmount, previousWeekly.confirmedAmount),
        avgProcessingTime: weeklyProcessingTrend,
        remindersSent: this.buildFinanceDashboardTrend(weekly.remindersSent, previousWeekly.remindersSent),
      },
      monthly: {
        confirmedAmount: this.buildFinanceDashboardTrend(monthly.confirmedAmount, previousMonthly.confirmedAmount),
        avgProcessingTime: monthlyProcessingTrend,
        remindersSent: this.buildFinanceDashboardTrend(monthly.remindersSent, previousMonthly.remindersSent),
      },
    };

    const insights = [
      {
        importance: trends.weekly.confirmedAmount.changePercent,
        direction: trends.weekly.confirmedAmount.direction,
        text:
          trends.weekly.confirmedAmount.direction === 'up'
            ? `Performance improved by ${trends.weekly.confirmedAmount.changePercent.toFixed(1)}% this week.`
            : trends.weekly.confirmedAmount.direction === 'down'
              ? `Performance declined by ${trends.weekly.confirmedAmount.changePercent.toFixed(1)}% this week.`
              : 'Performance is flat week over week.',
      },
      {
        importance: Math.abs(trends.weekly.avgProcessingTime.changePercent),
        direction:
          weekly.avgProcessingTime !== null &&
          previousWeekly.avgProcessingTime !== null &&
          weekly.avgProcessingTime < previousWeekly.avgProcessingTime
            ? 'up'
            : weekly.avgProcessingTime !== null &&
                previousWeekly.avgProcessingTime !== null &&
                weekly.avgProcessingTime > previousWeekly.avgProcessingTime
              ? 'down'
              : 'flat',
        text:
          weekly.avgProcessingTime !== null &&
          previousWeekly.avgProcessingTime !== null &&
          weekly.avgProcessingTime < previousWeekly.avgProcessingTime
            ? 'Processing time decreased this week.'
            : weekly.avgProcessingTime !== null &&
                previousWeekly.avgProcessingTime !== null &&
                weekly.avgProcessingTime > previousWeekly.avgProcessingTime
              ? 'Processing time increased this week.'
              : 'Processing speed is stable.',
      },
      {
        importance: trends.monthly.remindersSent.changePercent,
        direction: trends.monthly.remindersSent.direction,
        text:
          trends.monthly.remindersSent.direction === 'up'
            ? 'Reminders are increasing month over month.'
            : trends.monthly.remindersSent.direction === 'down'
              ? 'Reminders are decreasing month over month.'
              : 'Reminder volume is holding steady.',
      },
    ]
      .sort((left, right) => right.importance - left.importance)
      .slice(0, 2)
      .map(({ direction, text }) => ({ direction, text }));

    return {
      weekly,
      previousWeekly,
      monthly,
      previousMonthly,
      trends,
      insights,
      series7: buildSeries(7, series7Start),
      series30: buildSeries(30, series30Start),
    };
    });
  }

  async confirmPaymentProofBatch(
    data?: {
      paymentIds?: string[];
      paidAt?: string | Date | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const paymentIds = Array.from(
      new Set(
        (data?.paymentIds || [])
          .map((value) => this.normalizeOptionalText(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (paymentIds.length === 0) {
      throw new BadRequestException('Select at least one payment to confirm.');
    }

    const payments = await (this.prisma as any).payment.findMany({
      where: {
        id: {
          in: paymentIds,
        },
        type: 'CLIENT',
        ...this.buildPaymentCompanyWhere(data?.companyActor),
      },
      select: {
        id: true,
        bookingId: true,
        amount: true,
        currency: true,
        status: true,
      },
    });

    if (payments.length !== paymentIds.length) {
      throw new NotFoundException('One or more payments could not be found.');
    }

    const paymentsById = new Map(payments.map((payment: any) => [payment.id, payment]));
    const orderedPayments = paymentIds.map((paymentId) => paymentsById.get(paymentId)).filter(Boolean) as Array<{
      id: string;
      bookingId: string;
      amount: number;
      currency: string;
      status: PaymentStatusValue;
    }>;

    const confirmedItems: Array<{
      bookingId: string;
      paymentId: string;
      amount: number;
      currency: string;
      status: PaymentStatusValue;
      alreadyPaid: boolean;
      clientNotified: boolean;
    }> = [];

    for (const payment of orderedPayments) {
      const alreadyPaid = payment.status === 'PAID';
      const confirmedPayment = await this.markPaymentPaid(payment.bookingId, payment.id, {
        paidAt: data?.paidAt,
        actor: data?.actor,
        companyActor: data?.companyActor,
      });

      confirmedItems.push({
        bookingId: payment.bookingId,
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: confirmedPayment.status,
        alreadyPaid,
        clientNotified: Boolean((confirmedPayment as { clientNotified?: boolean }).clientNotified),
      });
    }

    return {
      confirmedCount: confirmedItems.length,
      clientNotifiedCount: confirmedItems.filter((item) => item.clientNotified).length,
      totalConfirmedAmount: this.roundMoney(
        confirmedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      ),
      currency: confirmedItems[0]?.currency || 'USD',
      items: confirmedItems,
    };
  }

  async sendPaymentProofReminderBatch(
    data?: {
      bookingIds?: string[];
      paymentIds?: string[];
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const normalizedBookingIds = (data?.bookingIds || [])
      .map((value) => this.normalizeOptionalText(value))
      .filter((value): value is string => Boolean(value));
    const normalizedPaymentIds = (data?.paymentIds || [])
      .map((value) => this.normalizeOptionalText(value))
      .filter((value): value is string => Boolean(value));

    const bookingIds = new Set(normalizedBookingIds);

    if (normalizedPaymentIds.length > 0) {
      const payments = await (this.prisma as any).payment.findMany({
        where: {
          id: {
            in: normalizedPaymentIds,
          },
          type: 'CLIENT',
          ...this.buildPaymentCompanyWhere(data?.companyActor),
        },
        select: {
          id: true,
          bookingId: true,
        },
      });

      for (const payment of payments) {
        bookingIds.add(payment.bookingId);
      }
    }

    const targetBookingIds = Array.from(bookingIds);

    if (targetBookingIds.length === 0) {
      throw new BadRequestException('Select at least one booking to remind.');
    }

    const now = new Date();
    let totalNotified = 0;
    let skippedCooldownCount = 0;

    for (const bookingId of targetBookingIds) {
      const booking = await this.findOne(bookingId, data?.companyActor);

      if (!booking) {
        continue;
      }

      const automation = this.getBookingPaymentReminderAutomation({
        auditLogs: booking.auditLogs || [],
        payments: booking.payments || [],
        finance: booking.finance,
      });

      if (
        automation.nextReminderDueAt &&
        new Date(automation.nextReminderDueAt).getTime() > now.getTime()
      ) {
        skippedCooldownCount += 1;
        continue;
      }

      await this.sendPaymentReminder(bookingId, {
        actor: data?.actor,
        stage: automation.stage,
      });
      totalNotified += 1;
    }

    return {
      count: targetBookingIds.length,
      totalNotified,
      skippedCooldownCount,
    };
  }

  async createPayment(
    bookingId: string,
    data: {
      type: PaymentTypeValue;
      amount: number;
      currency?: string | null;
      status?: PaymentStatusValue;
      method?: PaymentMethodValue | null;
      reference?: string | null;
      dueDate?: string | Date | null;
      paidAt?: string | Date | null;
      notes?: string | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    await this.assertBookingExists(bookingId, data.companyActor);
    const type = this.normalizePaymentType(data.type);
    const amount = this.normalizePaymentAmount(data.amount);
    const currency = this.normalizePaymentCurrency(data.currency);
    const status = this.normalizePaymentStatus(data.status);
    const method = this.normalizePaymentMethod(data.method);
    const reference = this.normalizeOptionalText(data.reference);
    const notes = this.normalizeOptionalText(data.notes);
    const dueDate = this.normalizePaymentDate(data.dueDate, 'Payment due date is invalid');
    const paidAt =
      status === 'PAID'
        ? this.normalizePaymentDate(data.paidAt, 'Payment paid date is invalid') ?? new Date()
        : null;

    const payment = await this.prisma.$transaction(async (tx) => {
      const createdPayment = await (tx as any).payment.create({
        data: {
          bookingId,
          type,
          amount,
          currency,
          status,
          method,
          reference,
          dueDate,
          paidAt,
          notes,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: bookingId,
        action: 'booking_payment_created',
        newValue: `${type} ${this.formatMoney(amount, currency)} ${status}`,
        note: reference || notes || null,
        actor: data.actor,
      });

      return createdPayment;
    });

    return this.mapPaymentRecord(payment);
  }

  async updatePayment(
    bookingId: string,
    paymentId: string,
    data: {
      amount?: number;
      currency?: string | null;
      status?: PaymentStatusValue;
      method?: PaymentMethodValue | null;
      reference?: string | null;
      dueDate?: string | Date | null;
      paidAt?: string | Date | null;
      notes?: string | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const payment = await (this.prisma as any).payment.findFirst({
      where: {
        id: paymentId,
        bookingId,
        ...this.buildPaymentCompanyWhere(data.companyActor),
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    const nextAmount = data.amount === undefined ? payment.amount : this.normalizePaymentAmount(data.amount);
    const nextCurrency = data.currency === undefined ? payment.currency : this.normalizePaymentCurrency(data.currency);
    const nextStatus = data.status === undefined ? payment.status : this.normalizePaymentStatus(data.status);
    const nextMethod = data.method === undefined ? payment.method : this.normalizePaymentMethod(data.method);
    const nextReference = data.reference === undefined ? payment.reference : this.normalizeOptionalText(data.reference);
    const nextDueDate =
      data.dueDate === undefined ? payment.dueDate : this.normalizePaymentDate(data.dueDate, 'Payment due date is invalid');
    const nextNotes = data.notes === undefined ? payment.notes : this.normalizeOptionalText(data.notes);
    const nextPaidAt =
      data.paidAt === undefined
        ? nextStatus === 'PAID'
          ? payment.paidAt ?? new Date()
          : null
        : nextStatus === 'PAID'
          ? this.normalizePaymentDate(data.paidAt, 'Payment paid date is invalid') ?? new Date()
          : null;

    if (
      nextAmount === payment.amount &&
      nextCurrency === payment.currency &&
      nextStatus === payment.status &&
      nextMethod === payment.method &&
      nextReference === payment.reference &&
      this.areDatesEqual(nextDueDate, payment.dueDate) &&
      this.areDatesEqual(nextPaidAt, payment.paidAt) &&
      nextNotes === payment.notes
    ) {
      return this.mapPaymentRecord(payment);
    }

    const updatedPayment = await this.prisma.$transaction(async (tx) => {
      const result = await (tx as any).payment.update({
        where: { id: payment.id },
        data: {
          amount: nextAmount,
          currency: nextCurrency,
          status: nextStatus,
          method: nextMethod,
          reference: nextReference,
          dueDate: nextDueDate,
          paidAt: nextPaidAt,
          notes: nextNotes,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: bookingId,
        action: 'booking_payment_updated',
        oldValue: `${payment.type} ${this.formatMoney(payment.amount, payment.currency)} ${payment.status}`,
        newValue: `${payment.type} ${this.formatMoney(nextAmount, nextCurrency)} ${nextStatus}`,
        note: nextReference || nextNotes || null,
        actor: data.actor,
      });

      return result;
    });

    this.invalidateAnalyticsCaches();
    return this.mapPaymentRecord(updatedPayment);
  }

  async markPaymentPaid(
    bookingId: string,
    paymentId: string,
    data?: {
      paidAt?: string | Date | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const payment = await (this.prisma as any).payment.findFirst({
      where: {
        id: paymentId,
        bookingId,
        ...this.buildPaymentCompanyWhere(data?.companyActor),
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === 'PAID') {
      return {
        ...this.mapPaymentRecord(payment),
        clientNotified: false,
        clientNotificationSentAt: null,
        clientNotificationSentTo: null,
      };
    }

    const paidAt = this.normalizePaymentDate(data?.paidAt, 'Payment paid date is invalid') ?? new Date();
    const updatedPayment = await this.prisma.$transaction(async (tx) => {
      const result = await (tx as any).payment.update({
        where: { id: payment.id },
        data: {
          status: 'PAID',
          paidAt,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: bookingId,
        action: 'booking_payment_marked_paid',
        oldValue: payment.status,
        newValue: 'PAID',
        note: payment.reference || null,
        actor: data?.actor,
      });

      return result;
    });

    const mappedPayment = this.mapPaymentRecord(updatedPayment);
    const notification =
      payment.type === 'CLIENT'
        ? await this.sendPaymentConfirmationEmail({
            bookingId,
            paymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            actor: data?.actor,
          })
        : {
            sent: false,
            sentAt: null,
            sentTo: null,
          };

    await this.auditService.log({
      actor: data?.companyActor ? { id: data.actor?.userId ?? null, companyId: data.companyActor.companyId } : null,
      action: 'payment.confirmed',
      entity: 'payment',
      entityId: payment.id,
      metadata: {
        bookingId,
        amount: mappedPayment.amount,
        currency: mappedPayment.currency,
        clientNotified: notification.sent,
      },
    });

    this.invalidateAnalyticsCaches();
    return {
      ...mappedPayment,
      clientNotified: notification.sent,
      clientNotificationSentAt: notification.sentAt,
      clientNotificationSentTo: notification.sentTo,
    };
  }

  async createPassenger(
    bookingId: string,
    data: {
      firstName: string;
      lastName: string;
      title?: string | null;
      notes?: string | null;
      isLead?: boolean;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const firstName = this.normalizeRequiredText(data.firstName, 'Passenger first name is required');
    const lastName = this.normalizeRequiredText(data.lastName, 'Passenger last name is required');
    const title = this.normalizeOptionalText(data.title);
    const notes = this.normalizeOptionalText(data.notes);
    const shouldSetLead = Boolean(data.isLead);

    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id: bookingId,
          ...this.buildBookingCompanyWhere(data.companyActor),
        },
        select: { id: true },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      if (shouldSetLead) {
        await tx.bookingPassenger.updateMany({
          where: { bookingId },
          data: { isLead: false },
        });
      }

      const passenger = await tx.bookingPassenger.create({
        data: {
          bookingId,
          firstName,
          lastName,
          title,
          notes,
          isLead: shouldSetLead,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: passenger.id,
        action: 'booking_passenger_created',
        newValue: this.formatPassengerAuditValue(passenger),
        actor: data.actor,
      });

      return passenger;
    });
  }

  async updatePassenger(
    bookingId: string,
    passengerId: string,
    data: {
      firstName?: string;
      lastName?: string;
      title?: string | null;
      notes?: string | null;
      isLead?: boolean;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const passenger = await tx.bookingPassenger.findFirst({
        where: {
          id: passengerId,
          bookingId,
          booking: {
            quote: {
              clientCompanyId: requireActorCompanyId(data.companyActor),
            },
          },
        },
        select: {
          id: true,
          bookingId: true,
          firstName: true,
          lastName: true,
          title: true,
          notes: true,
          isLead: true,
        },
      });

      if (!passenger) {
        throw new NotFoundException('Booking passenger not found');
      }

      const nextFirstName =
        data.firstName === undefined
          ? passenger.firstName
          : this.normalizeRequiredText(data.firstName, 'Passenger first name is required');
      const nextLastName =
        data.lastName === undefined
          ? passenger.lastName
          : this.normalizeRequiredText(data.lastName, 'Passenger last name is required');
      const nextTitle = data.title === undefined ? passenger.title : this.normalizeOptionalText(data.title);
      const nextNotes = data.notes === undefined ? passenger.notes : this.normalizeOptionalText(data.notes);
      const nextIsLead = data.isLead === undefined ? passenger.isLead : Boolean(data.isLead);

      if (nextIsLead) {
        await tx.bookingPassenger.updateMany({
          where: {
            bookingId,
            NOT: { id: passengerId },
          },
          data: { isLead: false },
        });
      }

      const updatedPassenger = await tx.bookingPassenger.update({
        where: { id: passengerId },
        data: {
          firstName: nextFirstName,
          lastName: nextLastName,
          title: nextTitle,
          notes: nextNotes,
          isLead: nextIsLead,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: passengerId,
        action: 'booking_passenger_updated',
        oldValue: this.formatPassengerAuditValue(passenger),
        newValue: this.formatPassengerAuditValue(updatedPassenger),
        actor: data.actor,
      });

      return updatedPassenger;
    });
  }

  async deletePassenger(bookingId: string, passengerId: string, actor?: AuditActor, companyActor?: CompanyScopedActor) {
    return this.prisma.$transaction(async (tx) => {
      const passenger = await tx.bookingPassenger.findFirst({
        where: {
          id: passengerId,
          bookingId,
          booking: {
            quote: {
              clientCompanyId: requireActorCompanyId(companyActor),
            },
          },
        },
        select: {
          id: true,
          bookingId: true,
          firstName: true,
          lastName: true,
          title: true,
          isLead: true,
          roomingAssignments: {
            select: {
              bookingRoomingEntryId: true,
            },
          },
        },
      });

      if (!passenger) {
        throw new NotFoundException('Booking passenger not found');
      }

      if (passenger.roomingAssignments.length > 0) {
        throw new BadRequestException('Unassign the passenger from rooming before deleting the passenger record.');
      }

      await tx.bookingPassenger.delete({
        where: { id: passengerId },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: passengerId,
        action: 'booking_passenger_deleted',
        oldValue: this.formatPassengerAuditValue(passenger),
        actor,
      });

      return { id: passengerId };
    });
  }

  async setLeadPassenger(bookingId: string, passengerId: string, actor?: AuditActor, companyActor?: CompanyScopedActor) {
    return this.prisma.$transaction(async (tx) => {
      const passenger = await tx.bookingPassenger.findFirst({
        where: {
          id: passengerId,
          bookingId,
          booking: {
            quote: {
              clientCompanyId: requireActorCompanyId(companyActor),
            },
          },
        },
        select: {
          id: true,
          bookingId: true,
          firstName: true,
          lastName: true,
          title: true,
          isLead: true,
        },
      });

      if (!passenger) {
        throw new NotFoundException('Booking passenger not found');
      }

      if (passenger.isLead) {
        return passenger;
      }

      await tx.bookingPassenger.updateMany({
        where: { bookingId },
        data: { isLead: false },
      });

      const updatedPassenger = await tx.bookingPassenger.update({
        where: { id: passengerId },
        data: { isLead: true },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: passengerId,
        action: 'booking_passenger_lead_set',
        oldValue: this.formatPassengerAuditValue(passenger),
        newValue: this.formatPassengerAuditValue(updatedPassenger),
        actor,
      });

      return updatedPassenger;
    });
  }

  async createRoomingEntry(
    bookingId: string,
    data: {
      roomType?: string | null;
      occupancy?: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown';
      notes?: string | null;
      sortOrder?: number;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id: bookingId,
          ...this.buildBookingCompanyWhere(data.companyActor),
        },
        select: {
          id: true,
          roomingEntries: {
            select: { sortOrder: true },
            orderBy: { sortOrder: 'desc' },
            take: 1,
          },
        },
      });

      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const roomType = this.normalizeOptionalText(data.roomType);
      const occupancy = this.normalizeRoomOccupancy(data.occupancy);
      const notes = this.normalizeOptionalText(data.notes);
      const sortOrder =
        data.sortOrder === undefined
          ? Number(booking.roomingEntries[0]?.sortOrder ?? booking.roomingEntries.length) + 1
          : this.normalizeSortOrder(data.sortOrder);

      const roomingEntry = await tx.bookingRoomingEntry.create({
        data: {
          bookingId,
          roomType,
          occupancy,
          notes,
          sortOrder,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: roomingEntry.id,
        action: 'booking_rooming_entry_created',
        newValue: this.formatRoomingEntryAuditValue(roomingEntry),
        actor: data.actor,
      });

      return roomingEntry;
    });
  }

  async updateRoomingEntry(
    bookingId: string,
    roomingEntryId: string,
    data: {
      roomType?: string | null;
      occupancy?: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown';
      notes?: string | null;
      sortOrder?: number;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const roomingEntry = await tx.bookingRoomingEntry.findFirst({
        where: {
          id: roomingEntryId,
          bookingId,
          booking: {
            quote: {
              clientCompanyId: requireActorCompanyId(data.companyActor),
            },
          },
        },
        select: {
          id: true,
          bookingId: true,
          roomType: true,
          occupancy: true,
          notes: true,
          sortOrder: true,
        },
      });

      if (!roomingEntry) {
        throw new NotFoundException('Booking rooming entry not found');
      }

      const nextRoomType = data.roomType === undefined ? roomingEntry.roomType : this.normalizeOptionalText(data.roomType);
      const nextOccupancy = data.occupancy === undefined ? roomingEntry.occupancy : this.normalizeRoomOccupancy(data.occupancy);
      const nextNotes = data.notes === undefined ? roomingEntry.notes : this.normalizeOptionalText(data.notes);
      const nextSortOrder =
        data.sortOrder === undefined ? roomingEntry.sortOrder : this.normalizeSortOrder(data.sortOrder);

      const currentAssignmentCount = await tx.bookingRoomingAssignment.count({
        where: {
          bookingRoomingEntryId: roomingEntryId,
        },
      });
      const nextCapacity = this.getRoomOccupancyCapacity(nextOccupancy);

      if (nextCapacity !== null && currentAssignmentCount > nextCapacity) {
        throw new BadRequestException('Room occupancy cannot be reduced below the number of assigned passengers.');
      }

      const updatedRoomingEntry = await tx.bookingRoomingEntry.update({
        where: { id: roomingEntryId },
        data: {
          roomType: nextRoomType,
          occupancy: nextOccupancy,
          notes: nextNotes,
          sortOrder: nextSortOrder,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: roomingEntryId,
        action: 'booking_rooming_entry_updated',
        oldValue: this.formatRoomingEntryAuditValue(roomingEntry),
        newValue: this.formatRoomingEntryAuditValue(updatedRoomingEntry),
        actor: data.actor,
      });

      return updatedRoomingEntry;
    });
  }

  async deleteRoomingEntry(
    bookingId: string,
    roomingEntryId: string,
    actor?: AuditActor,
    companyActor?: CompanyScopedActor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const roomingEntry = await tx.bookingRoomingEntry.findFirst({
        where: {
          id: roomingEntryId,
          bookingId,
          booking: {
            quote: {
              clientCompanyId: requireActorCompanyId(companyActor),
            },
          },
        },
        select: {
          id: true,
          bookingId: true,
          roomType: true,
          occupancy: true,
          notes: true,
          sortOrder: true,
          assignments: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!roomingEntry) {
        throw new NotFoundException('Booking rooming entry not found');
      }

      if (roomingEntry.assignments.length > 0) {
        throw new BadRequestException('Unassign passengers from the room before deleting the rooming entry.');
      }

      await tx.bookingRoomingEntry.delete({
        where: { id: roomingEntryId },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: roomingEntryId,
        action: 'booking_rooming_entry_deleted',
        oldValue: this.formatRoomingEntryAuditValue(roomingEntry),
        actor,
      });

      return { id: roomingEntryId };
    });
  }

  async assignPassengerToRoom(
    bookingId: string,
    roomingEntryId: string,
    passengerId: string,
    actor?: AuditActor,
    companyActor?: CompanyScopedActor,
  ) {
    const normalizedPassengerId = this.normalizeRequiredText(passengerId, 'Passenger is required for room assignment');
    const companyId = requireActorCompanyId(companyActor);

    return this.prisma.$transaction(async (tx) => {
      const [roomingEntry, passenger] = await Promise.all([
        tx.bookingRoomingEntry.findFirst({
          where: {
            id: roomingEntryId,
            bookingId,
            booking: {
              quote: {
                clientCompanyId: companyId,
              },
            },
          },
          select: {
            id: true,
            bookingId: true,
            roomType: true,
            occupancy: true,
            sortOrder: true,
            assignments: {
              select: {
                bookingPassengerId: true,
              },
            },
          },
        }),
        tx.bookingPassenger.findFirst({
          where: {
            id: normalizedPassengerId,
            bookingId,
            booking: {
              quote: {
                clientCompanyId: companyId,
              },
            },
          },
          select: {
            id: true,
            bookingId: true,
            firstName: true,
            lastName: true,
            title: true,
            roomingAssignments: {
              select: {
                bookingRoomingEntryId: true,
              },
            },
          },
        }),
      ]);

      if (!roomingEntry) {
        throw new NotFoundException('Booking rooming entry not found');
      }

      if (!passenger) {
        throw new NotFoundException('Booking passenger not found');
      }

      if (roomingEntry.assignments.some((assignment) => assignment.bookingPassengerId === normalizedPassengerId)) {
        throw new BadRequestException('Passenger is already assigned to this room.');
      }

      if (passenger.roomingAssignments.length > 0) {
        throw new BadRequestException('Passenger is already assigned to another room. Unassign them first.');
      }

      const capacity = this.getRoomOccupancyCapacity(roomingEntry.occupancy);
      if (capacity !== null && roomingEntry.assignments.length >= capacity) {
        throw new BadRequestException(`This room is already at its ${this.formatRoomOccupancy(roomingEntry.occupancy).toLowerCase()} occupancy limit.`);
      }

      await tx.bookingRoomingAssignment.create({
        data: {
          bookingRoomingEntryId: roomingEntryId,
          bookingPassengerId: normalizedPassengerId,
        },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: roomingEntryId,
        action: 'booking_rooming_assignment_created',
        oldValue: this.formatRoomingEntryAuditValue(roomingEntry),
        newValue: `${this.formatPassengerAuditValue(passenger)} assigned to ${this.formatRoomingEntryAuditValue(roomingEntry)}`,
        actor,
      });

      return { bookingRoomingEntryId: roomingEntryId, bookingPassengerId: normalizedPassengerId };
    });
  }

  async unassignPassengerFromRoom(
    bookingId: string,
    roomingEntryId: string,
    passengerId: string,
    actor?: AuditActor,
    companyActor?: CompanyScopedActor,
  ) {
    const normalizedPassengerId = this.normalizeRequiredText(passengerId, 'Passenger is required for room assignment removal');
    const companyId = requireActorCompanyId(companyActor);

    return this.prisma.$transaction(async (tx) => {
      const [roomingEntry, passenger, assignment] = await Promise.all([
        tx.bookingRoomingEntry.findFirst({
          where: {
            id: roomingEntryId,
            bookingId,
            booking: {
              quote: {
                clientCompanyId: companyId,
              },
            },
          },
          select: {
            id: true,
            bookingId: true,
            roomType: true,
            occupancy: true,
            sortOrder: true,
          },
        }),
        tx.bookingPassenger.findFirst({
          where: {
            id: normalizedPassengerId,
            bookingId,
            booking: {
              quote: {
                clientCompanyId: companyId,
              },
            },
          },
          select: {
            id: true,
            bookingId: true,
            firstName: true,
            lastName: true,
            title: true,
          },
        }),
        tx.bookingRoomingAssignment.findUnique({
          where: {
            bookingRoomingEntryId_bookingPassengerId: {
              bookingRoomingEntryId: roomingEntryId,
              bookingPassengerId: normalizedPassengerId,
            },
          },
          select: {
            id: true,
          },
        }),
      ]);

      if (!roomingEntry) {
        throw new NotFoundException('Booking rooming entry not found');
      }

      if (!passenger) {
        throw new NotFoundException('Booking passenger not found');
      }

      if (!assignment) {
        throw new NotFoundException('Passenger is not assigned to this room');
      }

      await tx.bookingRoomingAssignment.delete({
        where: { id: assignment.id },
      });

      await this.createAuditLog(tx, {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: roomingEntryId,
        action: 'booking_rooming_assignment_deleted',
        oldValue: `${this.formatPassengerAuditValue(passenger)} assigned to ${this.formatRoomingEntryAuditValue(roomingEntry)}`,
        newValue: this.formatRoomingEntryAuditValue(roomingEntry),
        actor,
      });

      return { bookingRoomingEntryId: roomingEntryId, bookingPassengerId: normalizedPassengerId };
    });
  }

  assignSupplier(
    bookingServiceId: string,
    data: { supplierId?: string | null; supplierName?: string | null; actor?: AuditActor; companyActor?: CompanyScopedActor },
  ) {
    const actor = data.actor;

    return this.prisma.bookingService
      .findFirst({
        where: {
          id: bookingServiceId,
          booking: {
            quote: {
              clientCompanyId: requireActorCompanyId(data.companyActor),
            },
          },
        },
        select: {
          id: true,
          bookingId: true,
          serviceType: true,
          serviceDate: true,
          status: true,
          totalCost: true,
          totalSell: true,
          confirmationStatus: true,
          supplierId: true,
          supplierName: true,
        },
      })
      .then(async (bookingService) => {
        if (!bookingService) {
          throw new NotFoundException('Booking service not found');
        }

        if (!data.supplierId) {
          const nextSupplierName = data.supplierName ?? null;
          const nextStatus = this.resolveBookingServiceLifecycleStatus({
            currentStatus: bookingService.status,
            serviceType: bookingService.serviceType,
            serviceDate: bookingService.serviceDate,
            supplierId: null,
            supplierName: nextSupplierName,
            totalCost: bookingService.totalCost,
            totalSell: bookingService.totalSell,
            confirmationStatus: bookingService.confirmationStatus,
          });

          return this.prisma.$transaction(async (tx) => {
            const updatedBookingService = await tx.bookingService.update({
              where: { id: bookingServiceId },
              data: {
                supplierId: null,
                supplierName: nextSupplierName,
                status: nextStatus,
              },
            });

            await this.createAuditLog(tx, {
              bookingId: bookingService.bookingId,
              bookingServiceId: bookingService.id,
              entityType: BookingAuditEntityType.booking_service,
              entityId: bookingService.id,
              action: 'service_supplier_assigned',
              oldValue: this.formatSupplierAuditValue(bookingService.supplierId, bookingService.supplierName),
              newValue: this.formatSupplierAuditValue(null, nextSupplierName),
              actor,
            });

            await this.createServiceLifecycleAuditIfChanged(tx, {
              bookingId: bookingService.bookingId,
              bookingServiceId: bookingService.id,
              oldStatus: bookingService.status,
              newStatus: nextStatus,
              action: 'service_status_recalculated',
              actor,
            });

            return updatedBookingService;
          });
        }

        return this.prisma.supplier
          .findUnique({
            where: { id: data.supplierId },
            select: {
              id: true,
              name: true,
            },
          })
          .then((supplier) => {
            if (!supplier) {
              throw new NotFoundException('Supplier not found');
            }

            const nextStatus = this.resolveBookingServiceLifecycleStatus({
              currentStatus: bookingService.status,
              serviceType: bookingService.serviceType,
              serviceDate: bookingService.serviceDate,
              supplierId: supplier.id,
              supplierName: supplier.name,
              totalCost: bookingService.totalCost,
              totalSell: bookingService.totalSell,
              confirmationStatus: bookingService.confirmationStatus,
            });

            return this.prisma.$transaction(async (tx) => {
              const updatedBookingService = await tx.bookingService.update({
                where: { id: bookingServiceId },
                data: {
                  supplierId: supplier.id,
                  supplierName: supplier.name,
                  status: nextStatus,
                },
              });

              await this.createAuditLog(tx, {
                bookingId: bookingService.bookingId,
                bookingServiceId: bookingService.id,
                entityType: BookingAuditEntityType.booking_service,
                entityId: bookingService.id,
                action: 'service_supplier_assigned',
                oldValue: this.formatSupplierAuditValue(bookingService.supplierId, bookingService.supplierName),
                newValue: this.formatSupplierAuditValue(supplier.id, supplier.name),
                actor,
              });

              await this.createServiceLifecycleAuditIfChanged(tx, {
                bookingId: bookingService.bookingId,
                bookingServiceId: bookingService.id,
                oldStatus: bookingService.status,
                newStatus: nextStatus,
                action: 'service_status_recalculated',
                actor,
              });

              return updatedBookingService;
            });
          });
      });
  }

  updateConfirmation(
    bookingServiceId: string,
    data: {
      confirmationStatus: 'pending' | 'requested' | 'confirmed';
      confirmationNumber?: string | null;
      supplierReference?: string | null;
      notes?: string | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const actor = data.actor;

    return this.prisma.bookingService
      .findFirst({
        where: {
          id: bookingServiceId,
          booking: {
            quote: {
              clientCompanyId: requireActorCompanyId(data.companyActor),
            },
          },
        },
        select: {
          id: true,
          bookingId: true,
          serviceType: true,
          serviceDate: true,
          startTime: true,
          pickupTime: true,
          pickupLocation: true,
          meetingPoint: true,
          participantCount: true,
          adultCount: true,
          childCount: true,
          supplierReference: true,
          status: true,
          totalCost: true,
          totalSell: true,
          supplierId: true,
          supplierName: true,
          confirmationRequestedAt: true,
          confirmationStatus: true,
          confirmationNumber: true,
          confirmationNotes: true,
          supplier: {
            select: {
              email: true,
            },
          },
        },
      })
      .then(async (bookingService) => {
        if (!bookingService) {
          throw new NotFoundException('Booking service not found');
        }

        const supplierReference =
          data.supplierReference === undefined
            ? data.confirmationNumber === undefined
              ? undefined
              : data.confirmationNumber
            : data.supplierReference;

        this.assertConfirmationWorkflowRequirements({
          serviceType: bookingService.serviceType,
          confirmationStatus: data.confirmationStatus,
          supplierReference: supplierReference ?? bookingService.supplierReference ?? bookingService.confirmationNumber,
          note: data.notes ?? bookingService.confirmationNotes ?? null,
          serviceDate: bookingService.serviceDate,
          startTime: bookingService.startTime,
          pickupTime: bookingService.pickupTime,
          pickupLocation: bookingService.pickupLocation,
          meetingPoint: bookingService.meetingPoint,
          participantCount: bookingService.participantCount,
          adultCount: bookingService.adultCount,
          childCount: bookingService.childCount,
          status: bookingService.status,
          supplierId: bookingService.supplierId,
          supplierName: bookingService.supplierName,
          totalCost: bookingService.totalCost,
          totalSell: bookingService.totalSell,
          currentConfirmationStatus: bookingService.confirmationStatus,
        });

        const nextStatus = this.resolveBookingServiceLifecycleStatus({
          currentStatus: bookingService.status,
          serviceType: bookingService.serviceType,
          serviceDate: bookingService.serviceDate,
          supplierId: bookingService.supplierId,
          supplierName: bookingService.supplierName,
          totalCost: bookingService.totalCost,
          totalSell: bookingService.totalSell,
          confirmationStatus: data.confirmationStatus,
        });

        const updatedBookingService = await this.prisma.$transaction(async (tx) => {
          const updatedService = await tx.bookingService.update({
            where: { id: bookingServiceId },
            data: {
              confirmationStatus: data.confirmationStatus,
              confirmationNumber: supplierReference ?? data.confirmationNumber ?? null,
              supplierReference: supplierReference ?? null,
              confirmationNotes: data.notes ?? null,
              confirmationRequestedAt:
                data.confirmationStatus === BookingServiceStatus.pending
                  ? null
                  : bookingService.confirmationRequestedAt ?? new Date(),
              confirmationConfirmedAt:
                data.confirmationStatus === BookingServiceStatus.confirmed ? new Date() : null,
              status: nextStatus,
            },
          });

          await this.createAuditLog(tx, {
            bookingId: bookingService.bookingId,
            bookingServiceId: bookingService.id,
            entityType: BookingAuditEntityType.booking_service,
            entityId: bookingService.id,
            action: 'service_confirmation_updated',
            oldValue: bookingService.confirmationStatus,
            newValue: data.confirmationStatus,
            note: data.notes ?? null,
            actor,
          });

          await this.createServiceLifecycleAuditIfChanged(tx, {
            bookingId: bookingService.bookingId,
            bookingServiceId: bookingService.id,
            oldStatus: bookingService.status,
            newStatus: nextStatus,
            action: 'service_status_recalculated',
            note: data.notes ?? null,
            actor,
          });

          return updatedService;
        });

        const shouldAutoSendSupplierConfirmation =
          bookingService.confirmationStatus !== 'requested' &&
          data.confirmationStatus === 'requested' &&
          Boolean(bookingService.supplier?.email);

        if (shouldAutoSendSupplierConfirmation) {
          try {
            await this.sendDocumentEmail({
              email: bookingService.supplier!.email!,
              bookingId: bookingService.bookingId,
              documentType: 'supplier-confirmation',
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to send supplier confirmation email';

            console.error('Supplier confirmation auto-email failed', {
              bookingServiceId,
              bookingId: bookingService.bookingId,
              supplierEmail: bookingService.supplier!.email!,
              message,
            });

            return {
              ...updatedBookingService,
              warning: `Confirmation updated, but supplier confirmation email failed: ${message}`,
            };
          }
        }

        return updatedBookingService;
      });
  }

  async supplierConfirm(
    bookingServiceId: string,
    data: {
      token?: string;
      confirmationNumber?: string | null;
      supplierReference?: string | null;
      notes?: string | null;
    },
    actor?: AuditActor,
  ) {
    const normalizedToken = data.token?.trim();

    if (!normalizedToken) {
      throw new BadRequestException('Access token is required');
    }

    const bookingService = await this.prisma.bookingService.findFirst({
      where: {
        id: bookingServiceId,
        booking: {
          accessToken: normalizedToken,
        },
      },
      select: {
        id: true,
      },
    });

    if (!bookingService) {
      throw new NotFoundException('Booking service not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const currentService = await tx.bookingService.findUnique({
        where: { id: bookingServiceId },
        select: {
          id: true,
          bookingId: true,
          serviceType: true,
          serviceDate: true,
          startTime: true,
          pickupTime: true,
          pickupLocation: true,
          meetingPoint: true,
          participantCount: true,
          adultCount: true,
          childCount: true,
          supplierReference: true,
          status: true,
          confirmationStatus: true,
          confirmationNumber: true,
          confirmationNotes: true,
          supplierId: true,
          supplierName: true,
          totalCost: true,
          totalSell: true,
        },
      });

      if (!currentService) {
        throw new NotFoundException('Booking service not found');
      }

      const supplierReference =
        data.supplierReference === undefined
          ? data.confirmationNumber === undefined
            ? currentService.supplierReference ?? currentService.confirmationNumber
            : data.confirmationNumber
          : data.supplierReference;

      this.assertConfirmationWorkflowRequirements({
        serviceType: currentService.serviceType,
        confirmationStatus: BookingServiceStatus.confirmed,
        supplierReference,
        note: data.notes ?? currentService.confirmationNotes ?? null,
        serviceDate: currentService.serviceDate,
        startTime: currentService.startTime,
        pickupTime: currentService.pickupTime,
        pickupLocation: currentService.pickupLocation,
        meetingPoint: currentService.meetingPoint,
        participantCount: currentService.participantCount,
        adultCount: currentService.adultCount,
        childCount: currentService.childCount,
        status: currentService.status,
        supplierId: currentService.supplierId,
        supplierName: currentService.supplierName,
        totalCost: currentService.totalCost,
        totalSell: currentService.totalSell,
        currentConfirmationStatus: currentService.confirmationStatus,
      });

      const updatedService = await tx.bookingService.update({
        where: {
          id: bookingServiceId,
        },
        data: {
          confirmationStatus: BookingServiceStatus.confirmed,
          confirmationNumber: supplierReference ?? null,
          supplierReference: supplierReference ?? null,
          confirmationNotes: data.notes ?? currentService.confirmationNotes ?? null,
          confirmationRequestedAt: new Date(),
          confirmationConfirmedAt: new Date(),
          status: BookingServiceLifecycleStatus.confirmed,
        },
      });

      await this.createAuditLog(tx, {
        bookingId: currentService.bookingId,
        bookingServiceId: currentService.id,
        entityType: BookingAuditEntityType.booking_service,
        entityId: currentService.id,
        action: 'service_supplier_confirmed',
        oldValue: currentService.confirmationStatus,
        newValue: BookingServiceStatus.confirmed,
        actor,
      });

      await this.createServiceLifecycleAuditIfChanged(tx, {
        bookingId: currentService.bookingId,
        bookingServiceId: currentService.id,
        oldStatus: currentService.status,
        newStatus: BookingServiceLifecycleStatus.confirmed,
        action: 'service_status_recalculated',
        actor,
      });

      return updatedService;
    });
  }

  async updateOperationalDetails(
    bookingServiceId: string,
    data: {
      serviceDate?: string | null;
      startTime?: string | null;
      pickupTime?: string | null;
      pickupLocation?: string | null;
      meetingPoint?: string | null;
      participantCount?: number | null;
      adultCount?: number | null;
      childCount?: number | null;
      supplierReference?: string | null;
      reconfirmationRequired?: boolean;
      reconfirmationDueAt?: string | null;
      note?: string | null;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const actor = data.actor;
    const bookingService = await this.prisma.bookingService.findFirst({
      where: {
        id: bookingServiceId,
        booking: {
          quote: {
            clientCompanyId: requireActorCompanyId(data.companyActor),
          },
        },
      },
      select: {
        id: true,
        bookingId: true,
        serviceType: true,
        serviceDate: true,
        startTime: true,
        pickupTime: true,
        pickupLocation: true,
        meetingPoint: true,
        participantCount: true,
        adultCount: true,
        childCount: true,
        supplierReference: true,
        reconfirmationRequired: true,
        reconfirmationDueAt: true,
        status: true,
        totalCost: true,
        totalSell: true,
        supplierId: true,
        supplierName: true,
        confirmationStatus: true,
      },
    });

    if (!bookingService) {
      throw new NotFoundException('Booking service not found');
    }

    const counts = this.normalizeActivityOperationalCounts({
      participantCount: data.participantCount,
      adultCount: data.adultCount,
      childCount: data.childCount,
      currentParticipantCount: bookingService.participantCount,
      currentAdultCount: bookingService.adultCount,
      currentChildCount: bookingService.childCount,
    });
    const serviceDate = data.serviceDate === undefined ? bookingService.serviceDate : this.normalizeDateTimeInput(data.serviceDate);
    const startTime = data.startTime === undefined ? bookingService.startTime : this.normalizeTimeInput(data.startTime, 'Start time');
    const pickupTime = data.pickupTime === undefined ? bookingService.pickupTime : this.normalizeTimeInput(data.pickupTime, 'Pickup time');
    const pickupLocation =
      data.pickupLocation === undefined ? bookingService.pickupLocation : this.normalizeOptionalText(data.pickupLocation);
    const meetingPoint =
      data.meetingPoint === undefined ? bookingService.meetingPoint : this.normalizeOptionalText(data.meetingPoint);
    const supplierReference =
      data.supplierReference === undefined ? bookingService.supplierReference : this.normalizeOptionalText(data.supplierReference);
    const reconfirmationRequired =
      data.reconfirmationRequired === undefined ? bookingService.reconfirmationRequired : Boolean(data.reconfirmationRequired);
    const reconfirmationDueAt = reconfirmationRequired
      ? data.reconfirmationDueAt === undefined
        ? bookingService.reconfirmationDueAt
        : this.normalizeDateTimeInput(data.reconfirmationDueAt)
      : null;
    const note = this.normalizeOptionalText(data.note);
    const nextStatus = this.resolveBookingServiceLifecycleStatus({
      currentStatus: bookingService.status,
      serviceType: bookingService.serviceType,
      serviceDate,
      supplierId: bookingService.supplierId,
      supplierName: bookingService.supplierName,
      totalCost: bookingService.totalCost,
      totalSell: bookingService.totalSell,
      confirmationStatus: bookingService.confirmationStatus,
    });

    return this.prisma.$transaction(async (tx) => {
      const updatedService = await tx.bookingService.update({
        where: { id: bookingServiceId },
        data: {
          serviceDate,
          startTime,
          pickupTime,
          pickupLocation,
          meetingPoint,
          participantCount: counts.participantCount,
          adultCount: counts.adultCount,
          childCount: counts.childCount,
          supplierReference,
          confirmationNumber: supplierReference ?? null,
          reconfirmationRequired,
          reconfirmationDueAt,
          status: nextStatus,
        },
      });

      await this.createAuditLog(tx, {
        bookingId: bookingService.bookingId,
        bookingServiceId: bookingService.id,
        entityType: BookingAuditEntityType.booking_service,
        entityId: bookingService.id,
        action: 'service_operational_details_updated',
        oldValue: this.buildOperationalAuditSummary(bookingService),
        newValue: this.buildOperationalAuditSummary({
          ...bookingService,
          serviceDate,
          startTime,
          pickupTime,
          pickupLocation,
          meetingPoint,
          participantCount: counts.participantCount,
          adultCount: counts.adultCount,
          childCount: counts.childCount,
          supplierReference,
          reconfirmationRequired,
          reconfirmationDueAt,
        }),
        note,
        actor,
      });

      await this.createServiceLifecycleAuditIfChanged(tx, {
        bookingId: bookingService.bookingId,
        bookingServiceId: bookingService.id,
        oldStatus: bookingService.status,
        newStatus: nextStatus,
        action: 'service_status_recalculated',
        note,
        actor,
      });

      return updatedService;
    });
  }

  async updateManualServiceStatus(
    bookingServiceId: string,
    data: {
      action: 'cancel' | 'reopen' | 'mark_ready';
      note: string;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const note = this.normalizeManualOverrideNote(data.note, 'Manual service action note is required');
    const actor = data.actor;
    const bookingService = await this.prisma.bookingService.findFirst({
      where: {
        id: bookingServiceId,
        booking: {
          quote: {
            clientCompanyId: requireActorCompanyId(data.companyActor),
          },
        },
      },
      select: {
        id: true,
        bookingId: true,
        serviceType: true,
        serviceDate: true,
        startTime: true,
        pickupTime: true,
        pickupLocation: true,
        meetingPoint: true,
        participantCount: true,
        adultCount: true,
        childCount: true,
        status: true,
        totalCost: true,
        totalSell: true,
        supplierId: true,
        supplierName: true,
        confirmationStatus: true,
      },
    });

    if (!bookingService) {
      throw new NotFoundException('Booking service not found');
    }

    return this.applyManualServiceAction(this.prisma, bookingService, data.action, note, actor);
  }

  async bulkUpdateServiceStatuses(data: {
    serviceIds: string[];
    action: 'cancel' | 'reopen' | 'mark_ready' | 'request_confirmation';
    note: string;
    actor?: AuditActor;
    companyActor?: CompanyScopedActor;
  }) {
    const serviceIds = Array.from(new Set(data.serviceIds.map((serviceId) => serviceId.trim()).filter(Boolean)));
    const note = this.normalizeManualOverrideNote(data.note, 'Bulk action note is required');
    const actor = data.actor;

    if (serviceIds.length === 0) {
      throw new BadRequestException('Select at least one booking service');
    }

    const bookingServices = await this.prisma.bookingService.findMany({
      where: {
        id: {
          in: serviceIds,
        },
        booking: {
          quote: {
            clientCompanyId: requireActorCompanyId(data.companyActor),
          },
        },
      },
      select: {
        id: true,
        bookingId: true,
        serviceType: true,
        serviceDate: true,
        status: true,
        totalCost: true,
        totalSell: true,
        supplierId: true,
        supplierName: true,
        confirmationStatus: true,
        confirmationRequestedAt: true,
        supplier: {
          select: {
            email: true,
          },
        },
      },
    });

    if (bookingServices.length !== serviceIds.length) {
      throw new NotFoundException('One or more booking services were not found');
    }

    const orderedServices = serviceIds.map((serviceId) => {
      const bookingService = bookingServices.find((service) => service.id === serviceId);

      if (!bookingService) {
        throw new NotFoundException('One or more booking services were not found');
      }

      return bookingService;
    });

    const emailTasks: Array<{ bookingId: string; bookingServiceId: string; email: string }> = [];
    const skipped: Array<{ serviceId: string; reason: string }> = [];
    let updatedCount = 0;

    for (const bookingService of orderedServices) {
      try {
        await this.prisma.$transaction(async (tx) => {
          if (data.action === 'request_confirmation') {
            await this.applyBulkRequestConfirmation(tx, bookingService, note, actor);

            if (bookingService.confirmationStatus !== BookingServiceStatus.requested && bookingService.supplier?.email) {
              emailTasks.push({
                bookingId: bookingService.bookingId,
                bookingServiceId: bookingService.id,
                email: bookingService.supplier.email,
              });
            }

            return;
          }

          await this.applyManualServiceAction(tx, bookingService, data.action, note, actor);
        });
        updatedCount += 1;
      } catch (error) {
        const reason =
          error instanceof BadRequestException
            ? this.extractBadRequestMessage(error)
            : error instanceof Error
              ? error.message
              : 'Service could not be processed';
        skipped.push({
          serviceId: bookingService.id,
          reason,
        });

        await this.createAuditLog(this.prisma, {
          bookingId: bookingService.bookingId,
          bookingServiceId: bookingService.id,
          entityType: BookingAuditEntityType.booking_service,
          entityId: bookingService.id,
          action: 'service_bulk_action_skipped',
          oldValue: bookingService.status,
          newValue: data.action,
          note: reason,
          actor,
        });
      }
    }

    const warnings: string[] = [];

    for (const task of emailTasks) {
      try {
        await this.sendDocumentEmail({
          email: task.email,
          bookingId: task.bookingId,
          documentType: 'supplier-confirmation',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send supplier confirmation email';

        console.error('Bulk supplier confirmation auto-email failed', {
          bookingServiceId: task.bookingServiceId,
          bookingId: task.bookingId,
          supplierEmail: task.email,
          message,
        });

        warnings.push(`${task.bookingServiceId}: ${message}`);
      }
    }

    return {
      updatedCount,
      skippedCount: skipped.length,
      skipped,
      warning:
        warnings.length > 0
          ? `Bulk action completed, but ${warnings.length} supplier confirmation email${warnings.length === 1 ? '' : 's'} failed.`
          : undefined,
    };
  }

  private async applyManualServiceAction(
    prismaClient: BookingMutationClient,
    bookingService: {
      id: string;
      bookingId: string;
      serviceType: string;
      serviceDate: Date | null;
      startTime?: string | null;
      pickupTime?: string | null;
      pickupLocation?: string | null;
      meetingPoint?: string | null;
      participantCount?: number | null;
      adultCount?: number | null;
      childCount?: number | null;
      status: BookingServiceLifecycleStatus;
      totalCost: number;
      totalSell: number;
      supplierId: string | null;
      supplierName: string | null;
      confirmationStatus: BookingServiceStatus;
    },
    action: 'cancel' | 'reopen' | 'mark_ready',
    note: string,
    actor?: AuditActor,
  ) {
    let nextStatus: BookingServiceLifecycleStatus;

    if (action === 'cancel') {
      nextStatus = BookingServiceLifecycleStatus.cancelled;
    } else if (action === 'mark_ready') {
      if (bookingService.status === BookingServiceLifecycleStatus.cancelled) {
        throw new BadRequestException('Reopen the cancelled service before marking it ready');
      }

      if (bookingService.confirmationStatus === BookingServiceStatus.confirmed) {
        throw new BadRequestException('Confirmed services cannot be moved back to ready manually');
      }

      this.assertCanMarkReady(bookingService);
      nextStatus = BookingServiceLifecycleStatus.ready;
    } else {
      nextStatus = this.resolveBookingServiceLifecycleStatus({
        currentStatus: undefined,
        serviceType: bookingService.serviceType,
        serviceDate: bookingService.serviceDate,
        supplierId: bookingService.supplierId,
        supplierName: bookingService.supplierName,
        totalCost: bookingService.totalCost,
        totalSell: bookingService.totalSell,
        confirmationStatus: bookingService.confirmationStatus,
      });
    }

    const updatedService = await prismaClient.bookingService.update({
      where: { id: bookingService.id },
      data: {
        status: nextStatus,
        statusNote: note,
      },
    });

    await this.createAuditLog(prismaClient, {
      bookingId: bookingService.bookingId,
      bookingServiceId: bookingService.id,
      entityType: BookingAuditEntityType.booking_service,
      entityId: bookingService.id,
      action: `service_${action}`,
      oldValue: bookingService.status,
      newValue: nextStatus,
      note,
      actor,
    });

    return updatedService;
  }

  private async applyBulkRequestConfirmation(
    prismaClient: BookingMutationClient,
    bookingService: {
      id: string;
      bookingId: string;
      serviceType: string;
      serviceDate: Date | null;
      status: BookingServiceLifecycleStatus;
      totalCost: number;
      totalSell: number;
      supplierId: string | null;
      supplierName: string | null;
      confirmationStatus: BookingServiceStatus;
      confirmationRequestedAt: Date | null;
    },
    note: string,
    actor?: AuditActor,
  ) {
    this.assertCanRequestConfirmation(bookingService);

    const nextStatus = this.resolveBookingServiceLifecycleStatus({
      currentStatus: bookingService.status,
      serviceType: bookingService.serviceType,
      serviceDate: bookingService.serviceDate,
      supplierId: bookingService.supplierId,
      supplierName: bookingService.supplierName,
      totalCost: bookingService.totalCost,
      totalSell: bookingService.totalSell,
      confirmationStatus: BookingServiceStatus.requested,
    });

    const updatedService = await prismaClient.bookingService.update({
      where: { id: bookingService.id },
      data: {
        confirmationStatus: BookingServiceStatus.requested,
        confirmationNotes: note,
        confirmationRequestedAt: new Date(),
        confirmationConfirmedAt: null,
        status: nextStatus,
      },
    });

    await this.createAuditLog(prismaClient, {
      bookingId: bookingService.bookingId,
      bookingServiceId: bookingService.id,
      entityType: BookingAuditEntityType.booking_service,
      entityId: bookingService.id,
      action: 'service_request_confirmation',
      oldValue: bookingService.confirmationStatus,
      newValue: BookingServiceStatus.requested,
      note,
      actor,
    });

    await this.createServiceLifecycleAuditIfChanged(prismaClient, {
      bookingId: bookingService.bookingId,
      bookingServiceId: bookingService.id,
      oldStatus: bookingService.status,
      newStatus: nextStatus,
      action: 'service_status_recalculated',
      note,
      actor,
    });

    return updatedService;
  }

  private async createServiceLifecycleAuditIfChanged(
    prismaClient: BookingMutationClient,
    values: {
      bookingId: string;
      bookingServiceId: string;
      oldStatus: BookingServiceLifecycleStatus;
      newStatus: BookingServiceLifecycleStatus;
      action: string;
      note?: string | null;
      actor?: AuditActor;
    },
  ) {
    if (values.oldStatus === values.newStatus) {
      return;
    }

    await this.createAuditLog(prismaClient, {
      bookingId: values.bookingId,
      bookingServiceId: values.bookingServiceId,
      entityType: BookingAuditEntityType.booking_service,
      entityId: values.bookingServiceId,
      action: values.action,
      oldValue: values.oldStatus,
      newValue: values.newStatus,
      note: values.note,
      actor: values.actor,
    });
  }

  private async createAuditLog(
    prismaClient: BookingMutationClient,
    values: {
      bookingId: string;
      bookingServiceId?: string | null;
      entityType: BookingAuditEntityType;
      entityId: string;
      action: string;
      oldValue?: string | null;
      newValue?: string | null;
      note?: string | null;
      actor?: AuditActor;
    },
  ) {
    await prismaClient.bookingAuditLog.create({
      data: {
        bookingId: values.bookingId,
        bookingServiceId: values.bookingServiceId ?? null,
        entityType: values.entityType,
        entityId: values.entityId,
        action: values.action,
        oldValue: values.oldValue ?? null,
        newValue: values.newValue ?? null,
        note: values.note?.trim() || null,
        actorUserId: this.normalizeActorUserId(values.actor),
        actor: this.normalizeActorLabel(values.actor),
      },
    });
  }

  private formatSupplierAuditValue(supplierId?: string | null, supplierName?: string | null) {
    if (supplierName?.trim()) {
      return supplierId ? `${supplierName.trim()} (${supplierId})` : supplierName.trim();
    }

    if (supplierId?.trim()) {
      return supplierId.trim();
    }

    return 'unassigned';
  }

  private resolveBookingServiceLifecycleStatus(values: {
    currentStatus?: BookingServiceLifecycleStatus;
    serviceType?: string | null;
    serviceDate?: Date | string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    totalCost?: number | null;
    totalSell?: number | null;
    confirmationStatus: BookingServiceStatus;
  }) {
    if (values.currentStatus === BookingServiceLifecycleStatus.cancelled) {
      return BookingServiceLifecycleStatus.cancelled;
    }

    if (values.confirmationStatus === BookingServiceStatus.confirmed) {
      return BookingServiceLifecycleStatus.confirmed;
    }

    if (values.confirmationStatus === BookingServiceStatus.requested) {
      return BookingServiceLifecycleStatus.in_progress;
    }

    const hasSupplier = Boolean(values.supplierId || values.supplierName?.trim());
    const hasPricing = Number(values.totalCost || 0) > 0 && Number(values.totalSell || 0) > 0;
    const hasDate = !this.isActivityService(values.serviceType) || Boolean(values.serviceDate);

    if (hasSupplier && hasPricing && hasDate) {
      return BookingServiceLifecycleStatus.ready;
    }

    return BookingServiceLifecycleStatus.pending;
  }

  private getAllowedBookingStatusTransitions(currentStatus: BookingStatus) {
    if (currentStatus === BookingStatus.draft) {
      return [BookingStatus.confirmed, BookingStatus.cancelled];
    }

    if (currentStatus === BookingStatus.confirmed) {
      return [BookingStatus.in_progress, BookingStatus.cancelled];
    }

    if (currentStatus === BookingStatus.in_progress) {
      return [BookingStatus.completed, BookingStatus.cancelled];
    }

    return [] as BookingStatus[];
  }

  private assertAllowedBookingStatusTransition(currentStatus: BookingStatus, nextStatus: BookingStatus) {
    if (currentStatus === nextStatus) {
      throw new BadRequestException(`Booking is already ${currentStatus.replace('_', ' ')}`);
    }

    const allowedTransitions = this.getAllowedBookingStatusTransitions(currentStatus);

    if (!allowedTransitions.includes(nextStatus)) {
      const formattedCurrent = currentStatus.replace('_', ' ');
      const allowedLabel =
        allowedTransitions.length > 0
          ? allowedTransitions.map((status) => status.replace('_', ' ')).join(', ')
          : 'no further transitions';
      throw new BadRequestException(
        `Invalid booking status transition from ${formattedCurrent}. Allowed next statuses: ${allowedLabel}.`,
      );
    }
  }

  private assertBookingStatusReadiness(
    booking: {
      status: BookingStatus;
      services: Array<{
        id: string;
        description: string;
        serviceType: string;
        serviceDate: Date | null;
        status: BookingServiceLifecycleStatus;
        confirmationStatus: BookingServiceStatus;
        supplierId: string | null;
        supplierName: string | null;
        totalCost: number;
        totalSell: number;
      }>;
    },
    nextStatus: BookingStatus,
  ) {
    if (nextStatus === BookingStatus.in_progress) {
      const notReadyServices = booking.services.filter((service) => !this.isServiceOperationallyReady(service));

      if (notReadyServices.length > 0) {
        throw new BadRequestException(
          `Cannot move booking to in progress until all required services are operationally ready. Remaining blockers: ${this.formatBookingServiceBlockers(notReadyServices)}.`,
        );
      }
    }

    if (nextStatus === BookingStatus.completed) {
      const incompleteServices = booking.services.filter((service) => !this.isServiceComplete(service));

      if (incompleteServices.length > 0) {
        throw new BadRequestException(
          `Cannot complete booking until all active services are completed or supplier-confirmed. Remaining blockers: ${this.formatBookingServiceBlockers(incompleteServices)}.`,
        );
      }
    }
  }

  private assertCanRequestConfirmation(values: {
    serviceType: string;
    serviceDate: Date | null;
    startTime?: string | null;
    pickupTime?: string | null;
    pickupLocation?: string | null;
    meetingPoint?: string | null;
    participantCount?: number | null;
    adultCount?: number | null;
    childCount?: number | null;
    status: BookingServiceLifecycleStatus;
    supplierId: string | null;
    supplierName: string | null;
    totalCost: number;
    totalSell: number;
    confirmationStatus: BookingServiceStatus;
  }) {
    if (values.status === BookingServiceLifecycleStatus.cancelled) {
      throw new BadRequestException('Cancelled services cannot be sent for confirmation.');
    }

    if (values.confirmationStatus === BookingServiceStatus.confirmed) {
      throw new BadRequestException('Confirmed services do not need another confirmation request.');
    }

    if (!values.supplierId && !values.supplierName?.trim()) {
      throw new BadRequestException('Assign a supplier before requesting confirmation.');
    }

    if (Number(values.totalCost || 0) <= 0 || Number(values.totalSell || 0) <= 0) {
      throw new BadRequestException('Pricing must be set before requesting confirmation.');
    }

    if (this.isActivityService(values.serviceType)) {
      const missing = this.getMissingActivityConfirmationData(values);

      if (missing.length > 0) {
        throw new BadRequestException(`Activity services need ${missing.join(', ')} before requesting confirmation.`);
      }
    }
  }

  private isServiceOperationallyReady(values: {
    serviceType: string;
    serviceDate: Date | null;
    status: BookingServiceLifecycleStatus;
    supplierId: string | null;
    supplierName: string | null;
    totalCost: number;
    totalSell: number;
  }) {
    if (values.status === BookingServiceLifecycleStatus.cancelled) {
      return true;
    }

    const hasSupplier = Boolean(values.supplierId || values.supplierName?.trim());
    const hasPricing = Number(values.totalCost || 0) > 0 && Number(values.totalSell || 0) > 0;
    const hasDate = !this.isActivityService(values.serviceType) || Boolean(values.serviceDate);
    const statusReady =
      values.status === BookingServiceLifecycleStatus.ready ||
      values.status === BookingServiceLifecycleStatus.in_progress ||
      values.status === BookingServiceLifecycleStatus.confirmed;

    return hasSupplier && hasPricing && hasDate && statusReady;
  }

  private isServiceComplete(values: {
    status: BookingServiceLifecycleStatus;
    confirmationStatus: BookingServiceStatus;
  }) {
    if (values.status === BookingServiceLifecycleStatus.cancelled) {
      return true;
    }

    return (
      values.status === BookingServiceLifecycleStatus.confirmed &&
      values.confirmationStatus === BookingServiceStatus.confirmed
    );
  }

  private formatBookingServiceBlockers(
    services: Array<{
      description: string;
      serviceType?: string | null;
      serviceDate?: Date | null;
      status: BookingServiceLifecycleStatus;
      supplierId?: string | null;
      supplierName?: string | null;
      totalCost?: number;
      totalSell?: number;
      confirmationStatus?: BookingServiceStatus;
    }>,
  ) {
    return services
      .slice(0, 3)
      .map((service) => {
        const reasons: string[] = [];
        if (!service.supplierId && !service.supplierName?.trim()) {
          reasons.push('supplier missing');
        }
        if (Number(service.totalCost || 0) <= 0 || Number(service.totalSell || 0) <= 0) {
          reasons.push('pricing missing');
        }
        if (this.isActivityService(service.serviceType) && !service.serviceDate) {
          reasons.push('date missing');
        }
        if (
          service.status !== BookingServiceLifecycleStatus.ready &&
          service.status !== BookingServiceLifecycleStatus.in_progress &&
          service.status !== BookingServiceLifecycleStatus.confirmed &&
          service.status !== BookingServiceLifecycleStatus.cancelled
        ) {
          reasons.push(`status ${service.status.replace('_', ' ')}`);
        }
        if (
          service.confirmationStatus !== undefined &&
          service.confirmationStatus !== BookingServiceStatus.confirmed &&
          service.status === BookingServiceLifecycleStatus.in_progress
        ) {
          reasons.push(`confirmation ${service.confirmationStatus}`);
        }

        return `${service.description} (${reasons.join(', ') || 'not ready'})`;
      })
      .join('; ');
  }

  private assertCanMarkReady(values: {
    serviceType: string;
    serviceDate: Date | null;
    supplierId: string | null;
    supplierName: string | null;
    totalCost: number;
    totalSell: number;
  }) {
    if (!values.supplierId && !values.supplierName?.trim()) {
      throw new BadRequestException('Assign a supplier before marking the service ready.');
    }

    if (Number(values.totalCost || 0) <= 0 || Number(values.totalSell || 0) <= 0) {
      throw new BadRequestException('Pricing must be set before marking the service ready.');
    }

    if (this.isActivityService(values.serviceType) && !values.serviceDate) {
      throw new BadRequestException('Activity services need a service date before they can be marked ready.');
    }
  }

  private assertConfirmationWorkflowRequirements(values: {
    serviceType: string;
    confirmationStatus: 'pending' | 'requested' | 'confirmed';
    supplierReference?: string | null;
    note?: string | null;
    serviceDate: Date | null;
    startTime?: string | null;
    pickupTime?: string | null;
    pickupLocation?: string | null;
    meetingPoint?: string | null;
    participantCount?: number | null;
    adultCount?: number | null;
    childCount?: number | null;
    status: BookingServiceLifecycleStatus;
    supplierId: string | null;
    supplierName: string | null;
    totalCost: number;
    totalSell: number;
    currentConfirmationStatus: BookingServiceStatus;
  }) {
    if (values.confirmationStatus === BookingServiceStatus.requested) {
      this.assertCanRequestConfirmation({
        serviceType: values.serviceType,
        serviceDate: values.serviceDate,
        startTime: values.startTime,
        pickupTime: values.pickupTime,
        pickupLocation: values.pickupLocation,
        meetingPoint: values.meetingPoint,
        participantCount: values.participantCount,
        adultCount: values.adultCount,
        childCount: values.childCount,
        status: values.status,
        supplierId: values.supplierId,
        supplierName: values.supplierName,
        totalCost: values.totalCost,
        totalSell: values.totalSell,
        confirmationStatus: values.currentConfirmationStatus,
      });
    }

    if (
      values.confirmationStatus === BookingServiceStatus.confirmed &&
      this.isActivityService(values.serviceType) &&
      !values.supplierReference?.trim() &&
      !values.note?.trim()
    ) {
      throw new BadRequestException('Activity services need a supplier reference or confirmation note before they can be confirmed.');
    }
  }

  private isActivityService(serviceType?: string | null) {
    const normalized = serviceType?.trim().toLowerCase() || '';

    return (
      normalized.includes('activity') ||
      normalized.includes('tour') ||
      normalized.includes('excursion') ||
      normalized.includes('experience') ||
      normalized.includes('sightseeing')
    );
  }

  private getMissingActivityConfirmationData(values: {
    serviceDate: Date | null;
    startTime?: string | null;
    pickupTime?: string | null;
    pickupLocation?: string | null;
    meetingPoint?: string | null;
    participantCount?: number | null;
    adultCount?: number | null;
    childCount?: number | null;
  }) {
    const missing: string[] = [];

    if (!values.serviceDate) {
      missing.push('service date');
    }

    if (Number(values.participantCount || 0) <= 0 && Number(values.adultCount || 0) + Number(values.childCount || 0) <= 0) {
      missing.push('participant counts');
    }

    if (!values.startTime?.trim() && !values.pickupTime?.trim()) {
      missing.push('start or pickup time');
    }

    if (!values.pickupLocation?.trim() && !values.meetingPoint?.trim()) {
      missing.push('pickup location or meeting point');
    }

    return missing;
  }

  private normalizeTimeInput(value: string | null | undefined, fieldLabel: string) {
    const normalized = this.normalizeOptionalText(value);

    if (!normalized) {
      return null;
    }

    if (!/^\d{2}:\d{2}$/.test(normalized)) {
      throw new BadRequestException(`${fieldLabel} must use HH:MM format.`);
    }

    return normalized;
  }

  private normalizeOptionalText(value: string | null | undefined) {
    const normalized = value?.trim() || '';
    return normalized ? normalized.slice(0, 250) : null;
  }

  private normalizeDateTimeInput(value: string | Date | null | undefined) {
    if (!value) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date value.');
    }

    return parsed;
  }

  private normalizeActivityOperationalCounts(values: {
    participantCount?: number | null;
    adultCount?: number | null;
    childCount?: number | null;
    currentParticipantCount?: number | null;
    currentAdultCount?: number | null;
    currentChildCount?: number | null;
  }) {
    const adultCount = this.normalizeCountValue(values.adultCount, values.currentAdultCount);
    const childCount = this.normalizeCountValue(values.childCount, values.currentChildCount);
    let participantCount = this.normalizeCountValue(values.participantCount, values.currentParticipantCount);
    const computedCount = adultCount + childCount;

    if (computedCount > 0) {
      participantCount = computedCount;
    }

    return {
      participantCount,
      adultCount,
      childCount,
    };
  }

  private normalizeCountValue(value: number | null | undefined, fallback: number | null | undefined) {
    if (value === undefined) {
      return Math.max(0, Number(fallback ?? 0));
    }

    if (value === null) {
      return 0;
    }

    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException('Participant counts must be zero or greater.');
    }

    return Math.floor(normalized);
  }

  private buildOperationalAuditSummary(values: {
    serviceDate?: Date | null;
    startTime?: string | null;
    pickupTime?: string | null;
    pickupLocation?: string | null;
    meetingPoint?: string | null;
    participantCount?: number | null;
    adultCount?: number | null;
    childCount?: number | null;
    supplierReference?: string | null;
    reconfirmationRequired?: boolean;
    reconfirmationDueAt?: Date | null;
  }) {
    return [
      values.serviceDate ? `date=${values.serviceDate.toISOString()}` : 'date=-',
      values.startTime ? `start=${values.startTime}` : 'start=-',
      values.pickupTime ? `pickup=${values.pickupTime}` : 'pickup=-',
      values.pickupLocation ? `pickup_location=${values.pickupLocation}` : 'pickup_location=-',
      values.meetingPoint ? `meeting_point=${values.meetingPoint}` : 'meeting_point=-',
      `pax=${Math.max(0, Number(values.participantCount ?? 0))}`,
      `adults=${Math.max(0, Number(values.adultCount ?? 0))}`,
      `children=${Math.max(0, Number(values.childCount ?? 0))}`,
      values.supplierReference ? `supplier_ref=${values.supplierReference}` : 'supplier_ref=-',
      values.reconfirmationRequired ? 'reconfirm=yes' : 'reconfirm=no',
      values.reconfirmationDueAt ? `reconfirm_due=${values.reconfirmationDueAt.toISOString()}` : 'reconfirm_due=-',
    ].join(' | ');
  }

  private extractBadRequestMessage(error: BadRequestException) {
    const response = error.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message?: string | string[] }).message;
      if (Array.isArray(message)) {
        return message.join(', ');
      }
      if (typeof message === 'string') {
        return message;
      }
    }

    return error.message;
  }

  private normalizeManualOverrideNote(value: string | null | undefined, errorMessage: string) {
    const note = value?.trim() || '';

    if (note.length < 3) {
      throw new BadRequestException(errorMessage);
    }

    return note;
  }

  private normalizeActorLabel(value: AuditActor) {
    const actor = value?.label?.trim() || '';
    return actor ? actor.slice(0, 120) : null;
  }

  private normalizeActorUserId(value: AuditActor) {
    const actorUserId = value?.userId?.trim() || '';
    return actorUserId || null;
  }

  private normalizeClientInvoiceStatus(value: ClientInvoiceStatusValue | string) {
    const normalized = String(value || '').trim().toLowerCase() as ClientInvoiceStatusValue;

    if (!CLIENT_INVOICE_STATUSES.includes(normalized)) {
      throw new BadRequestException('Unsupported client invoice status');
    }

    return normalized;
  }

  private normalizeSupplierPaymentStatus(value: SupplierPaymentStatusValue | string) {
    const normalized = String(value || '').trim().toLowerCase() as SupplierPaymentStatusValue;

    if (!SUPPLIER_PAYMENT_STATUSES.includes(normalized)) {
      throw new BadRequestException('Unsupported supplier payment status');
    }

    return normalized;
  }

  private normalizeRequiredText(value: string | null | undefined, errorMessage: string) {
    const normalized = value?.trim() || '';

    if (!normalized) {
      throw new BadRequestException(errorMessage);
    }

    return normalized;
  }

  private normalizeSortOrder(value: number | string | null | undefined) {
    const numericValue = Number(value);

    if (!Number.isInteger(numericValue) || numericValue < 0) {
      throw new BadRequestException('Room sort order must be a zero-or-positive whole number.');
    }

    return numericValue;
  }

  private normalizeRoomOccupancy(
    value?: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown' | null,
  ) {
    const normalized = String(value || 'unknown').trim().toLowerCase() as BookingRoomOccupancy;
    const allowedValues = Object.values(BookingRoomOccupancy) as BookingRoomOccupancy[];

    if (!allowedValues.includes(normalized)) {
      throw new BadRequestException('Unsupported room occupancy value');
    }

    return normalized;
  }

  private getRoomOccupancyCapacity(value: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown') {
    if (value === BookingRoomOccupancy.single) {
      return 1;
    }

    if (value === BookingRoomOccupancy.double) {
      return 2;
    }

    if (value === BookingRoomOccupancy.triple) {
      return 3;
    }

    if (value === BookingRoomOccupancy.quad) {
      return 4;
    }

    return null;
  }

  private formatRoomOccupancy(value: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown') {
    if (value === BookingRoomOccupancy.unknown) {
      return 'Unknown';
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private formatPassengerAuditValue(values: {
    title?: string | null;
    firstName: string;
    lastName: string;
    isLead?: boolean;
  }) {
    const name = [values.title, values.firstName, values.lastName].filter(Boolean).join(' ').trim();
    return values.isLead ? `${name} (lead)` : name;
  }

  private formatRoomingEntryAuditValue(values: {
    roomType?: string | null;
    occupancy: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown';
    sortOrder: number;
  }) {
    const roomLabel = values.roomType?.trim() || `Room ${values.sortOrder}`;
    return `${roomLabel} | ${this.formatRoomOccupancy(values.occupancy)}`;
  }

  private attachFinanceSummary<
    T extends {
      pricingSnapshotJson: Prisma.JsonValue;
      snapshotJson: Prisma.JsonValue;
      roomCount: number;
      passengers: Array<{
        id: string;
        roomingAssignments: Array<{
          bookingRoomingEntryId: string;
        }>;
      }>;
      roomingEntries: Array<{
        id: string;
        occupancy: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown';
        assignments: Array<{
          bookingPassenger: {
            id: string;
          };
        }>;
      }>;
      services: Array<{
        confirmationStatus: 'pending' | 'requested' | 'confirmed';
        serviceType: string | null;
        serviceDate: string | Date | null;
        startTime: string | null;
        pickupTime: string | null;
        pickupLocation: string | null;
        meetingPoint: string | null;
        reconfirmationRequired: boolean;
        reconfirmationDueAt: string | Date | null;
        status: BookingServiceLifecycleStatus;
        totalCost: number;
        totalSell: number;
      }>;
      payments: Array<{
        type: PaymentTypeValue;
        amount: number;
        status: PaymentStatusValue;
        dueDate?: string | Date | null;
      }>;
    },
  >(booking: T) {
    return {
      ...booking,
      finance: this.buildBookingFinanceSummary(booking),
      operations: this.buildBookingOperationsSummary(booking.services),
      rooming: this.buildBookingRoomingSummary({
        expectedRoomCount: booking.roomCount,
        passengers: booking.passengers,
        roomingEntries: booking.roomingEntries,
      }),
    };
  }

  private computeBookingFinanceMetrics(values: {
    pricingSnapshotJson: Prisma.JsonValue;
    snapshotJson: Prisma.JsonValue;
    services: Array<{
      status: BookingServiceLifecycleStatus;
      totalCost: number;
      totalSell: number;
    }>;
    payments: Array<{
      type: PaymentTypeValue;
      amount: number;
      status: PaymentStatusValue;
      dueDate?: string | Date | null;
    }>;
  }) {
    const pricingSnapshot = (values.pricingSnapshotJson || {}) as {
      totalCost?: number | null;
      totalSell?: number | null;
    };
    const snapshot = (values.snapshotJson || {}) as {
      totalCost?: number | null;
      totalSell?: number | null;
      quoteItems?: Array<{
        totalCost?: number | null;
      }>;
    };
    const activeServices = values.services.filter((service) => service.status !== BookingServiceLifecycleStatus.cancelled);
    const quotedTotalCost = this.roundMoney(
      Number(pricingSnapshot.totalCost ?? snapshot.totalCost ?? this.sumSnapshotQuoteItemCosts(snapshot.quoteItems)),
    );
    const quotedTotalSell = this.roundMoney(Number(pricingSnapshot.totalSell ?? snapshot.totalSell ?? 0));
    const realizedTotalCost = this.roundMoney(
      activeServices.reduce((sum, service) => sum + Number(service.totalCost || 0), 0),
    );
    const realizedTotalSell = this.roundMoney(
      activeServices.reduce((sum, service) => sum + Number(service.totalSell || 0), 0),
    );
    const quotedMargin = this.roundMoney(quotedTotalSell - quotedTotalCost);
    const realizedMargin = this.roundMoney(realizedTotalSell - realizedTotalCost);
    const quotedMarginPercent = quotedTotalSell > 0 ? Number(((quotedMargin / quotedTotalSell) * 100).toFixed(2)) : 0;
    const realizedMarginPercent = realizedTotalSell > 0 ? Number(((realizedMargin / realizedTotalSell) * 100).toFixed(2)) : 0;
    const hasNegativeMargin = realizedTotalSell > 0 && realizedMargin < 0;
    const hasLowMargin = realizedTotalSell > 0 && (realizedMargin < 0 || realizedMarginPercent < 10);
    const hasLowMarginWarning = realizedTotalSell > 0 && realizedMargin >= 0 && realizedMarginPercent < 10;
    const effectiveTotalSell = this.roundMoney(realizedTotalSell || quotedTotalSell || 0);
    const effectiveTotalCost = this.roundMoney(realizedTotalCost || quotedTotalCost || 0);
    const clientPayments = values.payments.filter((payment) => payment.type === 'CLIENT');
    const supplierPayments = values.payments.filter((payment) => payment.type === 'SUPPLIER');
    const overdueClientPayments = clientPayments.filter((payment) => this.isPaymentOverdue(payment));
    const overdueSupplierPayments = supplierPayments.filter((payment) => this.isPaymentOverdue(payment));
    const clientPaidTotal = this.roundMoney(
      clientPayments
        .filter((payment) => payment.status === 'PAID')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    );
    const supplierPaidTotal = this.roundMoney(
      supplierPayments
        .filter((payment) => payment.status === 'PAID')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    );
    const clientOutstanding = this.roundMoney(Math.max(effectiveTotalSell - clientPaidTotal, 0));
    const supplierOutstanding = this.roundMoney(Math.max(effectiveTotalCost - supplierPaidTotal, 0));
    const overdueClientAmount = this.roundMoney(
      overdueClientPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    );
    const overdueSupplierAmount = this.roundMoney(
      overdueSupplierPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    );
    const clientInvoiceStatus: ClientInvoiceStatusValue =
      effectiveTotalSell <= 0
        ? 'unbilled'
        : clientPaidTotal >= effectiveTotalSell
          ? 'paid'
          : clientPayments.length > 0
            ? 'invoiced'
            : 'unbilled';
    const supplierPaymentStatus: SupplierPaymentStatusValue =
      effectiveTotalCost <= 0
        ? 'unpaid'
        : supplierPaidTotal >= effectiveTotalCost
          ? 'paid'
          : supplierPayments.length > 0
            ? 'scheduled'
            : 'unpaid';
    const hasUnpaidClientBalance = effectiveTotalSell > clientPaidTotal;
    const hasUnpaidSupplierObligation = effectiveTotalCost > supplierPaidTotal;
    const hasOverdueClientPayments = overdueClientPayments.length > 0;
    const hasOverdueSupplierPayments = overdueSupplierPayments.length > 0;

    return {
      quotedTotalSell,
      quotedTotalCost,
      quotedMargin,
      quotedMarginPercent,
      realizedTotalSell,
      realizedTotalCost,
      realizedMargin,
      realizedMarginPercent,
      effectiveTotalSell,
      effectiveTotalCost,
      clientPaidTotal,
      supplierPaidTotal,
      clientOutstanding,
      supplierOutstanding,
      overdueClientAmount,
      overdueSupplierAmount,
      overdueClientPayments,
      overdueSupplierPayments,
      clientInvoiceStatus,
      supplierPaymentStatus,
      hasLowMargin,
      hasUnpaidClientBalance,
      hasUnpaidSupplierObligation,
      overdueClientPaymentsCount: overdueClientPayments.length,
      overdueSupplierPaymentsCount: overdueSupplierPayments.length,
      hasOverdueClientPayments,
      hasOverdueSupplierPayments,
      badge: buildFinanceBadge({
        hasUnpaidClientBalance,
        hasUnpaidSupplierObligation,
        hasNegativeMargin,
        hasLowMargin: hasLowMarginWarning,
        hasOverdueClientPayments,
        hasOverdueSupplierPayments,
      }),
    };
  }

  private buildBookingFinanceSummary(values: {
    pricingSnapshotJson: Prisma.JsonValue;
    snapshotJson: Prisma.JsonValue;
    services: Array<{
      status: BookingServiceLifecycleStatus;
      totalCost: number;
      totalSell: number;
    }>;
    payments: Array<{
      type: PaymentTypeValue;
      amount: number;
      status: PaymentStatusValue;
      dueDate?: string | Date | null;
    }>;
  }) {
    return this.computeBookingFinanceMetrics(values);
  }

  private buildBookingOperationsSummary(
    services: Array<{
      confirmationStatus: 'pending' | 'requested' | 'confirmed';
      serviceType: string | null;
      serviceDate: string | Date | null;
      startTime: string | null;
      pickupTime: string | null;
      pickupLocation: string | null;
      meetingPoint: string | null;
      reconfirmationRequired: boolean;
      reconfirmationDueAt: string | Date | null;
      status: BookingServiceLifecycleStatus;
    }>,
  ) {
    return {
      badge: buildOperationsBadge(
        services.map((service) => ({
          confirmationStatus: service.confirmationStatus,
          serviceType: service.serviceType,
          serviceDate: service.serviceDate,
          startTime: service.startTime,
          pickupTime: service.pickupTime,
          pickupLocation: service.pickupLocation,
          meetingPoint: service.meetingPoint,
          reconfirmationRequired: service.reconfirmationRequired,
          reconfirmationDueAt: service.reconfirmationDueAt,
          status: service.status,
        })),
      ),
    };
  }

  private buildBookingRoomingSummary(values: {
    expectedRoomCount: number;
    passengers: Array<{
      id: string;
      roomingAssignments: Array<{
        bookingRoomingEntryId: string;
      }>;
    }>;
    roomingEntries: Array<{
      id: string;
      occupancy: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown';
      assignments: Array<{
        bookingPassenger: {
          id: string;
        };
      }>;
    }>;
  }) {
    return {
      badge: buildRoomingBadge({
        expectedRoomCount: values.expectedRoomCount,
        passengers: values.passengers.map((passenger) => ({
          id: passenger.id,
          roomingAssignments: passenger.roomingAssignments.map((assignment) => ({
            bookingRoomingEntryId: assignment.bookingRoomingEntryId,
          })),
        })),
        roomingEntries: values.roomingEntries.map((entry) => ({
          id: entry.id,
          occupancy: entry.occupancy,
          assignments: entry.assignments.map((assignment) => ({
            bookingPassenger: {
              id: assignment.bookingPassenger.id,
            },
          })),
        })),
      }),
    };
  }

  private sumSnapshotQuoteItemCosts(
    items:
      | Array<{
          totalCost?: number | null;
        }>
      | undefined,
  ) {
    return this.roundMoney((items || []).reduce((sum, item) => sum + Number(item?.totalCost || 0), 0));
  }

  private roundMoney(value: number) {
    return Number(Number(value || 0).toFixed(2));
  }

  private getFinanceDashboardPeriodWindow(lengthDays = 30) {
    const currentEnd = new Date();
    const currentStart = new Date(currentEnd);
    currentStart.setHours(0, 0, 0, 0);
    currentStart.setDate(currentStart.getDate() - (lengthDays - 1));

    const previousEnd = new Date(currentStart);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - lengthDays);

    return {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
      lengthDays,
    };
  }

  private buildFinanceSparklineSeriesWindow(lengthDays = 30) {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const points: Date[] = [];

    for (let index = lengthDays - 1; index >= 0; index -= 1) {
      const point = new Date(end);
      point.setDate(end.getDate() - index);
      points.push(point);
    }

    return points;
  }

  private buildFinanceMonthlySeriesWindow(monthCount = 6) {
    const now = new Date();
    return Array.from({ length: monthCount }, (_, index) => {
      const offset = monthCount - index - 1;
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
      const label = new Intl.DateTimeFormat('en-US', {
        month: 'short',
      }).format(start);

      return {
        label,
        start,
        end,
      };
    });
  }

  private isDateInRange(value: string | Date | null | undefined, start: Date, endExclusive: Date) {
    if (!value) {
      return false;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return false;
    }

    return date.getTime() >= start.getTime() && date.getTime() < endExclusive.getTime();
  }

  private findFinanceSeriesIndex(value: string | Date | null | undefined, seriesDates: Date[]) {
    if (!value) {
      return -1;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return -1;
    }

    date.setHours(0, 0, 0, 0);
    return seriesDates.findIndex((point) => point.getTime() === date.getTime());
  }

  private findFinanceMonthlySeriesIndex(
    value: string | Date | null | undefined,
    series: Array<{ start: Date; end: Date }>,
  ) {
    if (!value) {
      return -1;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return -1;
    }

    return series.findIndex((point) => date.getTime() >= point.start.getTime() && date.getTime() < point.end.getTime());
  }

  private buildFinanceDashboardTrend(current: number, previous: number, unit: 'percent' | 'pp' = 'percent') {
    const roundedCurrent = this.roundMoney(current);
    const roundedPrevious = this.roundMoney(previous);
    const delta = this.roundMoney(roundedCurrent - roundedPrevious);
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
    const changePercent =
      roundedPrevious === 0
        ? roundedCurrent === 0
          ? 0
          : 100
        : Number(((Math.abs(delta) / Math.abs(roundedPrevious)) * 100).toFixed(1));

    return {
      direction,
      delta,
      changePercent,
      unit,
    };
  }

  private getBookingDashboardTitle(snapshotJson: Prisma.JsonValue) {
    const snapshot = (snapshotJson || {}) as {
      title?: string | null;
    };

    return snapshot.title?.trim() || 'Booking';
  }

  private getBookingDashboardClientName(clientSnapshotJson: Prisma.JsonValue, snapshotJson: Prisma.JsonValue) {
    const clientSnapshot = (clientSnapshotJson || {}) as {
      name?: string | null;
    };
    const snapshot = (snapshotJson || {}) as {
      company?: {
        name?: string | null;
      } | null;
    };

    return clientSnapshot.name?.trim() || snapshot.company?.name?.trim() || 'Client pending';
  }

  private getBookingInvoiceDelivery(
    auditLogs: Array<{ action: string; newValue?: string | null; createdAt: string | Date }>,
  ) {
    const latestDelivery = auditLogs.find((entry) => entry.action === 'booking_invoice_sent');

    return {
      sentAt: latestDelivery?.createdAt ?? null,
      sentTo: latestDelivery?.newValue?.trim() || null,
    };
  }

  private getLatestBookingAuditTimestamp(
    auditLogs: Array<{ action: string; createdAt: string | Date }>,
    action: string,
  ) {
    const latestEntry = auditLogs.find((entry) => entry.action === action);
    return latestEntry?.createdAt ?? null;
  }

  private getBookingPaymentReminderDelivery(
    auditLogs: Array<{ action: string; newValue?: string | null; createdAt: string | Date }>,
  ) {
    const latestDelivery = auditLogs.find((entry) => entry.action === 'booking_payment_reminder_sent');

    return {
      sentAt: latestDelivery?.createdAt ?? null,
      sentTo: latestDelivery?.newValue?.trim() || null,
    };
  }

  private getBookingPaymentProofSubmission(
    auditLogs: Array<{ action: string; note?: string | null; createdAt: string | Date }>,
  ) {
    const latestProof = auditLogs.find((entry) => entry.action === 'booking_payment_proof_submitted');
    if (!latestProof) {
      return null;
    }

    const metadata = this.parseBookingPaymentProofMetadata(latestProof.note);
    return {
      reference: metadata.reference,
      amount: metadata.amount,
      receiptUrl: metadata.receiptUrl,
      submittedAt: latestProof.createdAt,
    };
  }

  private getPaymentProofMatchConfidence(values: { matchPct: number | null; hasReceipt: boolean }) {
    if (values.matchPct !== null && values.matchPct >= 95 && values.matchPct <= 105 && values.hasReceipt) {
      return 'high' as const;
    }

    if (
      (values.matchPct !== null && values.matchPct >= 90 && values.matchPct <= 110) ||
      (values.matchPct !== null && values.matchPct >= 95 && values.matchPct <= 105) ||
      values.hasReceipt
    ) {
      return 'medium' as const;
    }

    return 'low' as const;
  }

  private parseBookingPaymentProofMetadata(note: string | null | undefined) {
    if (!note?.trim()) {
      return {
        reference: null,
        amount: null,
        receiptUrl: null,
      };
    }

    try {
      const parsed = JSON.parse(note) as {
        reference?: string | null;
        amount?: number | null;
        receiptUrl?: string | null;
      };

      return {
        reference: this.normalizeOptionalText(parsed.reference) || null,
        amount:
          typeof parsed.amount === 'number' && Number.isFinite(parsed.amount)
            ? this.roundMoney(parsed.amount)
            : null,
        receiptUrl: this.normalizeOptionalText(parsed.receiptUrl) || null,
      };
    } catch {
      return {
        reference: null,
        amount: null,
        receiptUrl: null,
      };
    }
  }

  private getBookingPaymentReminderAutomation(values: {
    auditLogs: Array<{ action: string; newValue?: string | null; createdAt: string | Date }>;
    payments: DerivedPaymentRecord[];
    finance: {
      hasUnpaidClientBalance: boolean;
      hasOverdueClientPayments: boolean;
    };
  }) {
    const reminderLogs = values.auditLogs.filter((entry) => entry.action === 'booking_payment_reminder_sent');
    const latestReminder = reminderLogs[0] || null;
    const maxOverdueDays = values.payments
      .filter((payment) => payment.type === 'CLIENT' && payment.overdue)
      .reduce((max, payment) => Math.max(max, payment.overdueDays || 0), 0);
    const stage = this.getPaymentReminderStage(maxOverdueDays);
    const cooldownMs = 48 * 60 * 60 * 1000;
    const lastReminderAt = latestReminder?.createdAt ?? null;
    const nextReminderDueAt =
      values.finance.hasUnpaidClientBalance && values.finance.hasOverdueClientPayments
        ? lastReminderAt
          ? new Date(new Date(lastReminderAt).getTime() + cooldownMs)
          : new Date()
        : null;

    return {
      reminderCount: reminderLogs.length,
      lastReminderAt,
      nextReminderDueAt,
      autoActive: values.finance.hasUnpaidClientBalance,
      stage,
    };
  }

  private getPaymentReminderStage(overdueDays: number) {
    if (overdueDays >= 7) {
      return 'urgent' as const;
    }

    if (overdueDays >= 4) {
      return 'firm' as const;
    }

    return 'gentle' as const;
  }

  private getCachedValue<T>(key: string) {
    const entry = this.analyticsCache.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.analyticsCache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  private setCachedValue<T>(key: string, value: T, ttlMs: number) {
    this.analyticsCache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });

    return value;
  }

  private async withAnalyticsCache<T>(key: string, ttlMs: number, factory: () => Promise<T>) {
    const cachedValue = this.getCachedValue<T>(key);
    if (cachedValue !== null) {
      return cachedValue;
    }

    const value = await factory();
    return this.setCachedValue(key, value, ttlMs);
  }

  private invalidateAnalyticsCaches() {
    this.analyticsCache.clear();
  }

  private resolveInvoiceRecipientEmail(
    booking: {
      quote?: {
        contact?: {
          email?: string | null;
        } | null;
      } | null;
      contactSnapshotJson?: Prisma.JsonValue;
    },
    overrideEmail?: string | null,
  ) {
    const contactSnapshot = (booking.contactSnapshotJson || {}) as {
      email?: string | null;
    };

    return (
      this.normalizeOptionalText(overrideEmail) ||
      this.normalizeOptionalText(booking.quote?.contact?.email) ||
      this.normalizeOptionalText(contactSnapshot.email) ||
      null
    );
  }

  private formatBookingFinanceStatusSummary(
    clientInvoiceStatus: ClientInvoiceStatusValue,
    supplierPaymentStatus: SupplierPaymentStatusValue,
  ) {
    return `client ${clientInvoiceStatus}; supplier ${supplierPaymentStatus}`;
  }

  async generateVoucherPdf(id: string) {
    const booking = await this.findOne(id);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const snapshot = (booking.snapshotJson || {}) as BookingPdfSnapshot;
    const contactSnapshot = (booking.contactSnapshotJson || {}) as BookingPdfContact;
    const clientSnapshot = (booking.clientSnapshotJson || {}) as BookingPdfCompany;
    const totalPax = Number(booking.adults || 0) + Number(booking.children || 0);
    const sortedDays = [...(snapshot.itineraries || [])].sort((a, b) => (a.dayNumber || 0) - (b.dayNumber || 0));
    const leadPassenger =
      booking.passengers?.find((passenger: any) => passenger.isLead) ||
      booking.passengers?.[0] ||
      null;
    const passengerCount = booking.passengers?.length || 0;
    const roomingCount = booking.roomingEntries?.length || 0;

    return this.createPdf((doc) => {
      this.writeDocumentTitle(doc, 'Booking Voucher', booking.bookingRef || 'Booking');
      this.writeMetaLine(
        doc,
        [
          snapshot.title || null,
          this.formatBookingType((booking.bookingType || snapshot.bookingType || 'FIT') as string),
          `${totalPax} pax`,
          `${snapshot.roomCount || booking.roomCount || 0} rooms`,
          this.formatNightCountLabel(snapshot.nightCount || booking.nightCount || 0),
        ].filter(Boolean).join(' | '),
      );

      this.writeSectionTitle(doc, 'Guest And Trip Summary');
      this.writeKeyValue(
        doc,
        'Lead guest',
        leadPassenger ? this.formatFullName(leadPassenger) : this.formatFullName(contactSnapshot),
      );
      this.writeKeyValue(doc, 'Client', clientSnapshot.name || 'Client');
      this.writeKeyValue(doc, 'Booking type', this.formatBookingType((booking.bookingType || snapshot.bookingType || 'FIT') as string));
      this.writeKeyValue(doc, 'Guests', `${totalPax} pax`);
      this.writeKeyValue(doc, 'Rooms', String(snapshot.roomCount || booking.roomCount || 0));
      this.writeKeyValue(doc, 'Duration', this.formatNightCountLabel(snapshot.nightCount || booking.nightCount || 0));
      if (passengerCount > 0) {
        this.writeKeyValue(doc, 'Passenger list', `${passengerCount} passenger${passengerCount === 1 ? '' : 's'}`);
      }
      if (roomingCount > 0) {
        this.writeKeyValue(doc, 'Rooming entries', `${roomingCount} room${roomingCount === 1 ? '' : 's'}`);
      }

      this.writeSectionTitle(doc, 'Booking Services');
      if ((booking.services || []).length === 0) {
        this.writeBodyLine(doc, 'No booking services available for this voucher.');
      } else {
        for (const service of booking.services || []) {
          this.writeListItem(doc, service.description || 'Service', [
            `Supplier: ${service.supplierName || 'To be advised'}`,
            `Confirmation: ${this.formatConfirmationStatus(service.confirmationStatus)}${service.confirmationNumber ? ` (${service.confirmationNumber})` : ''}`,
          ]);
        }
      }

      this.writeSectionTitle(doc, 'Itinerary By Day');
      if (sortedDays.length === 0) {
        this.writeBodyLine(doc, 'Detailed itinerary will be provided separately.');
        return;
      }

      for (const day of sortedDays) {
        this.ensurePageSpace(doc, 90);
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(`Day ${day.dayNumber || '-'} | ${day.title || 'Itinerary Day'}`);
        if (day.description) {
          this.writeBodyLine(doc, day.description);
        }

        const dayItems = (snapshot.quoteItems || []).filter((item) => item.itineraryId === day.id);
        if (dayItems.length === 0) {
          this.writeBodyLine(doc, 'No services assigned to this day.');
          continue;
        }

        for (const item of dayItems) {
          this.writeListItem(doc, item.service?.name?.trim() || 'Service', [
            [item.service?.category, this.getVoucherItemSummary(item)].filter(Boolean).join(' | '),
          ]);
        }
      }
    });
  }

  async generateSupplierConfirmationPdf(id: string) {
    const booking = await this.findOne(id);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const snapshot = (booking.snapshotJson || {}) as BookingPdfSnapshot;
    const totalPax = Number(booking.adults || 0) + Number(booking.children || 0);
    const quoteItemMap = new Map((snapshot.quoteItems || []).filter((item): item is BookingPdfQuoteItem & { id: string } => Boolean(item.id)).map((item) => [item.id, item]));
    const itineraryMap = new Map(
      (snapshot.itineraries || [])
        .filter((day): day is { id: string; dayNumber: number; title?: string | null; description?: string | null } => Boolean(day.id) && Number.isFinite(day.dayNumber))
        .map((day) => [day.id, day]),
    );
    const supplierGroups = (booking.services || [])
      .filter((service: any) => service.supplierId || service.supplierName)
      .reduce((groups: Array<{ key: string; supplierName: string; services: any[] }>, service: any) => {
        const key = service.supplierId || service.supplierName || service.id;
        const existing = groups.find((group: any) => group.key === key);

        if (existing) {
          existing.services.push(service);
          return groups;
        }

        groups.push({
          key,
          supplierName: service.supplierName || 'Unnamed supplier',
          services: [service],
        });

        return groups;
      }, [])
      .sort((a: any, b: any) => a.supplierName.localeCompare(b.supplierName));

    return this.createPdf((doc) => {
      this.writeDocumentTitle(doc, 'Supplier Confirmation Sheet', booking.bookingRef || 'Booking');
      this.writeMetaLine(doc, `${totalPax} pax | ${supplierGroups.length} supplier groups`);
      this.writeBodyLine(
        doc,
        'Please review the services below, confirm availability, and advise any pending items or operational remarks directly against each service.',
      );

      if (supplierGroups.length === 0) {
        this.writeSectionTitle(doc, 'Supplier');
        this.writeBodyLine(doc, 'No supplier-assigned services available for this confirmation sheet.');
        return;
      }

      for (const group of supplierGroups) {
        this.writeSectionTitle(doc, group.supplierName);

        for (const service of group.services) {
          const quoteItem = service.sourceQuoteItemId ? quoteItemMap.get(service.sourceQuoteItemId) : null;
          const day = quoteItem?.itineraryId ? itineraryMap.get(quoteItem.itineraryId) : null;
          const context = day ? `Day ${day.dayNumber} | ${day.title || 'Itinerary Day'}` : 'Outside itinerary';
          const detail = this.getSupplierServiceDetail(service.description || 'Service', quoteItem);
          const notes = [service.notes, service.confirmationNotes].filter(Boolean).join(' | ') || '-';
          const status = this.formatConfirmationStatus(service.confirmationStatus);
          const statusText = service.confirmationStatus === 'confirmed' ? status : `${status} - action required`;

          this.writeListItem(doc, detail.title, [
            detail.detail || null,
            `Booking Ref: ${booking.bookingRef || '-'}`,
            `Service Day / Context: ${context}`,
            `Pax: ${totalPax}`,
            `Notes: ${notes}`,
            `Confirmation Status: ${statusText}`,
          ]);
        }
      }
      });
  }

  async generateInvoicePdf(id: string, mode: BookingInvoiceMode = 'ITEMIZED') {
    const booking = await this.findOne(id);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const snapshot = (booking.snapshotJson || {}) as BookingPdfSnapshot;
    const clientSnapshot = (booking.clientSnapshotJson || {}) as BookingPdfCompany;
    const brandSnapshot = (booking.brandSnapshotJson || {}) as BookingPdfCompany;
    const contactSnapshot = (booking.contactSnapshotJson || {}) as BookingPdfContact;
    const companyName = brandSnapshot.name || clientSnapshot.name || booking.quote?.company?.name || 'Company';
    const invoiceNumber = this.buildBookingInvoiceNumber(booking.bookingRef || booking.id);
    const invoiceDate = new Date();
    const payments = this.listPersistedBookingPayments(booking);
    const clientPayments = payments.filter((payment) => payment.type === 'CLIENT');
    const clientPaid = this.roundMoney(
      clientPayments.filter((payment) => payment.status === 'PAID').reduce((sum, payment) => sum + payment.amount, 0),
    );
    const totalSell = this.roundMoney(booking.finance.realizedTotalSell || booking.finance.quotedTotalSell || 0);
    const outstanding = this.roundMoney(Math.max(totalSell - clientPaid, 0));
    const packageName = this.formatClientFacingPackageTitle(
      snapshot.title || booking.quote?.title || booking.bookingRef || 'Travel package',
    );
    const packageDuration = this.formatPackageDuration(snapshot.nightCount || booking.nightCount || 0);
    const packageDescription = this.buildPackageInvoiceDescription({
      title: packageName,
      bookingType: booking.bookingType,
      nightCount: snapshot.nightCount || booking.nightCount,
      travelStartDate: (snapshot as { travelStartDate?: string | null }).travelStartDate || null,
    });
    const lineItems =
      mode === 'ITEMIZED'
        ? (booking.services || [])
            .filter((service: any) => service.status !== BookingServiceLifecycleStatus.cancelled)
            .map((service: any) => ({
              name: service.description || service.serviceType || 'Service',
              date: service.serviceDate ? this.formatDate(service.serviceDate) : 'Date pending',
              price: this.roundMoney(Number(service.totalSell || 0)),
              description: null,
            }))
        : [];
    const logoBuffer = await this.fetchImageBuffer(brandSnapshot.logoUrl || booking.quote?.brandCompany?.logoUrl || null);

    return this.createPdf((doc) => {

      this.writeInvoiceHeader(doc, {
        companyName,
        logoBuffer,
        invoiceNumber,
        invoiceDate,
        bookingRef: booking.bookingRef || booking.id,
        mode,
      });

      this.writeSectionTitle(doc, 'Bill To');
      this.writeKeyValue(doc, 'Client', clientSnapshot.name || booking.quote?.company?.name || 'Client');
      this.writeKeyValue(doc, 'Contact', this.formatFullName(contactSnapshot));
      this.writeKeyValue(doc, 'Booking reference', booking.bookingRef || booking.id);
      doc.moveDown(0.6);

      if (mode === 'PACKAGE') {
        this.writePackageInvoiceBlock(doc, {
          name: packageName,
          duration: packageDuration,
          description: packageDescription,
          total: totalSell,
        });
      } else if (lineItems.length === 0) {
        this.writeSectionTitle(doc, 'Services');
        this.writeBodyLine(doc, 'No booking services are currently available to invoice.');
      } else {
        this.writeSectionTitle(doc, 'Services');
        this.writeInvoiceTable(doc, lineItems);
      }

      this.writeSectionTitle(doc, 'Summary');
      this.writeInvoiceSummaryBlock(doc, {
        total: totalSell,
        paid: clientPaid,
        outstanding,
        payments: clientPayments.map((payment) => ({
          amount: payment.amount,
          status: payment.status,
          date: this.formatDate(payment.status === 'PAID' ? payment.paidAt : payment.dueDate),
        })),
      });

      this.writeInvoiceFooterBox(doc, [
        `Please remit payment by bank transfer or approved settlement method using invoice reference ${invoiceNumber}.`,
        `Reference booking ${booking.bookingRef || booking.id} on all payment correspondence.`,
        `Current outstanding balance: ${this.formatMoney(outstanding)}.`,
      ]);
    });
  }

  async sendDocumentEmail(input: {
    email: string;
    bookingId: string;
    documentType: BookingDocumentType;
  }) {
    const email = input.email.trim();

    if (!email) {
      throw new BadRequestException('Email address is required');
    }

    const booking = await this.findOne(input.bookingId);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const documentLabel =
      input.documentType === 'supplier-confirmation' ? 'Supplier Confirmation Sheet' : 'Booking Voucher';
    const attachmentBaseName =
      input.documentType === 'supplier-confirmation'
        ? `${booking.bookingRef || 'booking'}-supplier-confirmation`
        : `${booking.bookingRef || 'booking'}-voucher`;
    const attachmentFileName = `${attachmentBaseName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'booking-document'}.pdf`;
    const pdfBuffer =
      input.documentType === 'supplier-confirmation'
        ? await this.generateSupplierConfirmationPdf(input.bookingId)
        : await this.generateVoucherPdf(input.bookingId);

    const transporter = this.createMailTransport();
    const fromAddress = process.env.BOOKING_DOCUMENTS_EMAIL_FROM || process.env.SMTP_FROM || 'noreply@localhost';
    const info = await this.sendMailWithRetry(
      transporter,
      {
        from: fromAddress,
        to: email,
        subject: `${documentLabel} - ${booking.bookingRef || 'Booking'}`,
        text: `Please find attached the ${documentLabel.toLowerCase()} for booking reference ${booking.bookingRef || input.bookingId}.`,
        attachments: [
          {
            filename: attachmentFileName,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      },
      { bookingId: input.bookingId, action: 'send-document-email' },
    );

    this.invalidateAnalyticsCaches();
    return {
      ok: true,
      email,
      bookingId: input.bookingId,
      documentType: input.documentType,
      messageId: info.messageId || null,
      preview: 'message' in info && Buffer.isBuffer(info.message) ? info.message.toString('utf8') : null,
    };
  }

  async sendInvoice(
    bookingId: string,
    input: {
      email?: string | null;
      mode?: BookingInvoiceMode;
      actor?: AuditActor;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const booking = await (this.prisma.booking as any).findFirst({
      where: {
        id: bookingId,
        ...this.buildBookingCompanyWhere(input.companyActor),
      },
      include: {
        quote: {
          include: {
            contact: true,
          },
        },
        auditLogs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 12,
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const email = this.resolveInvoiceRecipientEmail(booking, input.email);
    if (!email) {
      throw new BadRequestException('No recipient email is available for this booking invoice');
    }

    const normalizedMode: BookingInvoiceMode = input.mode === 'ITEMIZED' ? 'ITEMIZED' : 'PACKAGE';
    const pdfBuffer = await this.generateInvoicePdf(bookingId, normalizedMode);
    const attachmentFileName = `${`${booking.bookingRef || 'booking'}-invoice`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'booking-invoice'}.pdf`;
    const transporter = this.createMailTransport();
    const fromAddress = process.env.BOOKING_DOCUMENTS_EMAIL_FROM || process.env.SMTP_FROM || 'noreply@localhost';
    const info = await this.sendMailWithRetry(
      transporter,
      {
        from: fromAddress,
        to: email,
        subject: `Booking Invoice - ${booking.bookingRef || 'Booking'}`,
        text: `Please find attached the booking invoice for booking reference ${booking.bookingRef || bookingId}.`,
        attachments: [
          {
            filename: attachmentFileName,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      },
      { bookingId, action: 'send-invoice' },
    );

    const previousDelivery = this.getBookingInvoiceDelivery(booking.auditLogs || []);
    const auditLog = await this.prisma.bookingAuditLog.create({
      data: {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: bookingId,
        action: 'booking_invoice_sent',
        oldValue: previousDelivery.sentTo,
        newValue: email,
        note: info.messageId ? `${normalizedMode} | ${info.messageId}` : normalizedMode,
        actorUserId: this.normalizeActorUserId(input.actor),
        actor: this.normalizeActorLabel(input.actor),
      },
    });

    await this.auditService.log({
      actor: input.companyActor ? { id: input.actor?.userId ?? null, companyId: input.companyActor.companyId } : null,
      action: 'invoice.sent',
      entity: 'booking',
      entityId: bookingId,
      metadata: {
        sentTo: email,
        mode: normalizedMode,
        messageId: info.messageId || null,
      },
    });

    this.invalidateAnalyticsCaches();
    return {
      ok: true,
      bookingId,
      sentAt: auditLog.createdAt,
      sentTo: email,
      mode: normalizedMode,
      messageId: info.messageId || null,
      preview: 'message' in info && Buffer.isBuffer(info.message) ? info.message.toString('utf8') : null,
    };
  }

  async sendPaymentReminder(
    bookingId: string,
    input: {
      email?: string | null;
      actor?: AuditActor;
      stage?: 'gentle' | 'firm' | 'urgent';
      automated?: boolean;
      companyActor?: CompanyScopedActor;
    },
  ) {
    const booking = await this.findOne(bookingId, input.companyActor);

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const email = this.resolveInvoiceRecipientEmail(booking, input.email);
    if (!email) {
      throw new BadRequestException('No recipient email is available for this booking payment reminder');
    }

    const outstandingAmount = this.roundMoney(
      Math.max(Number(booking.finance.realizedTotalSell || booking.finance.quotedTotalSell || 0) -
        booking.payments
          .filter((payment: DerivedPaymentRecord) => payment.type === 'CLIENT' && payment.status === 'PAID')
          .reduce((sum: number, payment: DerivedPaymentRecord) => sum + payment.amount, 0), 0),
    );

    if (outstandingAmount <= 0) {
      throw new BadRequestException('This booking does not have an outstanding client balance');
    }

    const overdueAmount = this.roundMoney(
      booking.payments
        .filter((payment: DerivedPaymentRecord) => payment.type === 'CLIENT' && payment.overdue)
        .reduce((sum: number, payment: DerivedPaymentRecord) => sum + payment.amount, 0),
    );
    const maxOverdueDays = booking.payments
      .filter((payment: DerivedPaymentRecord) => payment.type === 'CLIENT' && payment.overdue)
      .reduce((max: number, payment: DerivedPaymentRecord) => Math.max(max, payment.overdueDays || 0), 0);
    const reminderStage = input.stage || this.getPaymentReminderStage(maxOverdueDays);
    const invoiceReference =
      booking.finance.clientInvoiceStatus !== 'unbilled'
        ? this.buildBookingInvoiceNumber(booking.bookingRef || booking.id)
        : null;

    const transporter = this.createMailTransport();
    const fromAddress = process.env.BOOKING_DOCUMENTS_EMAIL_FROM || process.env.SMTP_FROM || 'noreply@localhost';
    const subjectPrefix =
      reminderStage === 'urgent'
        ? 'Urgent Payment Reminder'
        : reminderStage === 'firm'
          ? 'Payment Reminder'
          : 'Friendly Payment Reminder';
    const subject = `${subjectPrefix} - ${booking.bookingRef || 'Booking'}`;
    const lines = [
      `Hello,`,
      ``,
      reminderStage === 'urgent'
        ? `This is an urgent reminder regarding booking reference ${booking.bookingRef || booking.id}.`
        : reminderStage === 'firm'
          ? `This is a reminder regarding booking reference ${booking.bookingRef || booking.id}.`
          : `This is a friendly reminder regarding booking reference ${booking.bookingRef || booking.id}.`,
      `Outstanding amount: ${this.formatMoney(outstandingAmount)}.`,
      overdueAmount > 0 ? `Overdue amount: ${this.formatMoney(overdueAmount)}.` : null,
      invoiceReference ? `Invoice reference: ${invoiceReference}.` : null,
      reminderStage === 'urgent'
        ? `Please arrange payment as soon as possible, or reply immediately if you need a copy of the invoice or payment details.`
        : reminderStage === 'firm'
          ? `Please arrange payment promptly, or reply if you need a copy of the invoice or payment details.`
          : `Please arrange payment at your earliest convenience, or reply if you need a copy of the invoice or payment details.`,
      ``,
      `Thank you.`,
    ].filter(Boolean) as string[];
    const info = await this.sendMailWithRetry(
      transporter,
      {
        from: fromAddress,
        to: email,
        subject,
        text: lines.join('\n'),
      },
      { bookingId, action: 'send-payment-reminder' },
    );

    const previousDelivery = this.getBookingPaymentReminderDelivery(booking.auditLogs || []);
    const auditLog = await this.prisma.bookingAuditLog.create({
      data: {
        bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: bookingId,
        action: 'booking_payment_reminder_sent',
        oldValue: previousDelivery.sentTo,
        newValue: email,
        note: [
          `stage=${reminderStage}`,
          input.automated ? 'automated=true' : 'automated=false',
          `outstanding=${this.formatMoney(outstandingAmount)}`,
          overdueAmount > 0 ? `overdue=${this.formatMoney(overdueAmount)}` : null,
          invoiceReference ? `invoice=${invoiceReference}` : null,
          info.messageId ? `messageId=${info.messageId}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
        actorUserId: this.normalizeActorUserId(input.actor),
        actor: this.normalizeActorLabel(input.actor),
      },
    });
    const reminderAutomation = this.getBookingPaymentReminderAutomation({
      auditLogs: [auditLog, ...(booking.auditLogs || [])],
      payments: booking.payments,
      finance: booking.finance,
    });

    this.invalidateAnalyticsCaches();
    return {
      ok: true,
      bookingId,
      sentAt: auditLog.createdAt,
      sentTo: email,
      reminderStage,
      reminderCount: reminderAutomation.reminderCount,
      lastReminderAt: reminderAutomation.lastReminderAt,
      nextReminderDueAt: reminderAutomation.nextReminderDueAt,
      outstandingAmount,
      overdueAmount,
      invoiceReference,
      messageId: info.messageId || null,
      preview: 'message' in info && Buffer.isBuffer(info.message) ? info.message.toString('utf8') : null,
    };
  }

  private async sendPaymentConfirmationEmail(values: {
    bookingId: string;
    paymentId: string;
    amount: number;
    currency: string;
    actor?: AuditActor;
  }) {
    const booking = await (this.prisma.booking as any).findUnique({
      where: { id: values.bookingId },
      include: {
        quote: {
          include: {
            contact: true,
          },
        },
        auditLogs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 12,
        },
      },
    });

    if (!booking) {
      return {
        sent: false,
        sentAt: null,
        sentTo: null,
      };
    }

    const email = this.resolveInvoiceRecipientEmail(booking);
    if (!email) {
      return {
        sent: false,
        sentAt: null,
        sentTo: null,
      };
    }

    const invoiceReference = this.getBookingInvoiceDelivery(booking.auditLogs || []).sentAt
      ? this.buildBookingInvoiceNumber(booking.bookingRef || booking.id)
      : null;
    const transporter = this.createMailTransport();
    const fromAddress = process.env.BOOKING_DOCUMENTS_EMAIL_FROM || process.env.SMTP_FROM || 'noreply@localhost';
    const subject = `Payment Confirmed - ${booking.bookingRef || 'Booking'}`;
    const lines = [
      'Hello,',
      '',
      `We have confirmed receipt of your payment for booking reference ${booking.bookingRef || booking.id}.`,
      `Amount confirmed: ${this.formatMoney(values.amount, values.currency)}.`,
      invoiceReference ? `Invoice reference: ${invoiceReference}.` : null,
      '',
      'Thank you for your payment.',
    ].filter(Boolean) as string[];

    const info = await this.sendMailWithRetry(
      transporter,
      {
        from: fromAddress,
        to: email,
        subject,
        text: lines.join('\n'),
      },
      { bookingId: values.bookingId, action: 'send-payment-confirmation' },
    );

    const auditLog = await this.prisma.bookingAuditLog.create({
      data: {
        bookingId: values.bookingId,
        entityType: BookingAuditEntityType.booking,
        entityId: values.bookingId,
        action: 'booking_payment_confirmation_sent',
        oldValue: null,
        newValue: email,
        note: [
          `paymentId=${values.paymentId}`,
          `amount=${this.formatMoney(values.amount, values.currency)}`,
          invoiceReference ? `invoice=${invoiceReference}` : null,
          info.messageId ? `messageId=${info.messageId}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
        actorUserId: this.normalizeActorUserId(values.actor),
        actor: this.normalizeActorLabel(values.actor),
      },
    });

    return {
      sent: true,
      sentAt: auditLog.createdAt,
      sentTo: email,
    };
  }

  private async processAutomatedPaymentReminders() {
    if (this.isProcessingReminderAutomation) {
      return;
    }

    this.isProcessingReminderAutomation = true;

    try {
      const companyIds = await this.listCompanyIdsForSystemJobs();

      for (const companyId of companyIds) {
        await this.processAutomatedPaymentRemindersForCompany(companyId);
      }
    } finally {
      this.isProcessingReminderAutomation = false;
    }
  }

  private async processAutomatedPaymentRemindersForCompany(companyId: string) {
    const actor = { companyId };
    const bookings = await (this.prisma.booking as any).findMany({
      where: this.buildBookingCompanyWhere(actor),
      include: {
        quote: {
          include: {
            contact: true,
          },
        },
        auditLogs: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 20,
        },
        payments: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        services: true,
        passengers: {
          select: {
            id: true,
            roomingAssignments: {
              select: {
                bookingRoomingEntryId: true,
              },
            },
          },
        },
        roomingEntries: {
          select: {
            id: true,
            occupancy: true,
            assignments: {
              select: {
                bookingPassenger: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const now = new Date();

    for (const booking of bookings) {
      const payments: DerivedPaymentRecord[] = this.sortPaymentRecords(
        (booking.payments || []).map((payment: any) => this.mapPaymentRecord(payment)),
      );
      const finance = this.buildBookingFinanceSummary({
        pricingSnapshotJson: booking.pricingSnapshotJson,
        snapshotJson: booking.snapshotJson,
        services: booking.services,
        payments,
      });
      const automation = this.getBookingPaymentReminderAutomation({
        auditLogs: booking.auditLogs || [],
        payments,
        finance,
      });

      if (!finance.hasUnpaidClientBalance || !finance.hasOverdueClientPayments || !automation.autoActive) {
        continue;
      }

      if (!automation.nextReminderDueAt || new Date(automation.nextReminderDueAt).getTime() > now.getTime()) {
        continue;
      }

      try {
        await this.sendPaymentReminder(booking.id, {
          actor: { label: 'Automation' },
          stage: automation.stage,
          automated: true,
          companyActor: actor,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Automated reminder failed';
        console.error('Automated payment reminder failed', {
          companyId,
          bookingId: booking.id,
          bookingRef: booking.bookingRef,
          message,
        });
      }
    }
  }

  private async listCompanyIdsForSystemJobs() {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return companies.map((company) => company.id);
  }

  private createPdf(write: (doc: PDFKit.PDFDocument) => void) {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
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

  private writeDocumentTitle(doc: PDFKit.PDFDocument, eyebrow: string, title: string) {
    doc.font('Helvetica').fontSize(10).fillColor('#0f766e').text(eyebrow.toUpperCase());
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#111111').text(title);
    doc.moveDown(0.5);
  }

  private writeMetaLine(doc: PDFKit.PDFDocument, text: string) {
    if (!text.trim()) {
      return;
    }

    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(text);
    doc.moveDown(0.9);
  }

  private writeSectionTitle(doc: PDFKit.PDFDocument, title: string) {
    this.ensurePageSpace(doc, 60);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text(title.replace(/\s*\n+\s*/g, ' ').trim(), {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineBreak: false,
    });
    doc.moveDown(0.45);
  }

  private writeKeyValue(doc: PDFKit.PDFDocument, label: string, value: string) {
    this.ensurePageSpace(doc, 24);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(`${label}: `, {
      continued: true,
    });
    doc.font('Helvetica').text(value || '-');
  }

  private writeBodyLine(doc: PDFKit.PDFDocument, text: string) {
    this.ensurePageSpace(doc, 30);
    doc.font('Helvetica').fontSize(10).fillColor('#333333').text(text);
    doc.moveDown(0.45);
  }

  private writeInvoiceHeader(
    doc: PDFKit.PDFDocument,
    values: {
      companyName: string;
      logoBuffer: Buffer | null;
      invoiceNumber: string;
      invoiceDate: Date;
      bookingRef: string;
      mode: BookingInvoiceMode;
    },
  ) {
    const topY = doc.y;
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const rightColumnX = doc.page.margins.left + pageWidth - 176;
    const leftColumnX = doc.page.margins.left;
    const leftColumnWidth = pageWidth - 210;
    let companyNameY = topY;

    if (values.logoBuffer) {
      try {
        doc.image(values.logoBuffer, leftColumnX, topY, {
          fit: [118, 46],
        });
        companyNameY = topY + 54;
      } catch {
        companyNameY = topY;
      }
    }

    doc.y = companyNameY;
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#111111').text(values.companyName, leftColumnX, doc.y, {
      width: leftColumnWidth,
    });
    doc.moveDown(0.5);
    const invoiceTitleY = doc.y;
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f766e').text('BOOKING INVOICE', leftColumnX, doc.y, {
      width: leftColumnWidth,
      align: 'left',
      lineBreak: false,
    });

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text(`Invoice #: ${values.invoiceNumber}`, rightColumnX, topY + 8, {
      width: 180,
      align: 'right',
    });
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(
      `Date: ${this.formatDate(values.invoiceDate)}`,
      rightColumnX,
      topY + 32,
      {
        width: 180,
        align: 'right',
      },
    );
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(`Booking Ref: ${values.bookingRef}`, rightColumnX, topY + 62, {
      width: 180,
      align: 'right',
    });
    if (values.mode !== 'PACKAGE') {
      doc.font('Helvetica').fontSize(10).fillColor('#0f766e').text('Itemized invoice', rightColumnX, topY + 78, {
        width: 180,
        align: 'right',
      });
    }

    const dividerY = Math.max(invoiceTitleY + 18, topY + (values.mode !== 'PACKAGE' ? 104 : 90));
    doc
      .moveTo(doc.page.margins.left, dividerY)
      .lineTo(doc.page.width - doc.page.margins.right, dividerY)
      .strokeColor('#d8d0c6')
      .lineWidth(1)
      .stroke();
    doc.y = dividerY + 14;
  }

  private writePackageInvoiceBlock(
    doc: PDFKit.PDFDocument,
    values: {
      name: string;
      duration: string;
      description: string | null;
      total: number;
    },
  ) {
    this.ensurePageSpace(doc, 172);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text('Package');
    doc.moveDown(0.45);
    const startX = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startY = doc.y;

    doc.roundedRect(startX, startY, width, 112, 16).fillAndStroke('#fbf8f3', '#ddd3c7');
    doc.font('Helvetica-Bold').fontSize(19).fillColor('#111111').text(values.name, startX + 18, startY + 24, {
      width: width - 180,
    });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#6b6258').text('Trip length', startX + 18, startY + 66);
    doc.font('Helvetica').fontSize(11).fillColor('#1f2937').text(values.duration, startX + 18, startY + 80, {
      width: width - 210,
    });

    if (values.description) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#6b6258').text('Inclusions', startX + 150, startY + 66);
      doc.font('Helvetica').fontSize(11).fillColor('#1f2937').text(values.description, startX + 150, startY + 80, {
        width: width - 330,
      });
    }

    doc.roundedRect(startX + width - 148, startY + 18, 130, 76, 14).fillAndStroke('#f1fbf8', '#c6e4dc');
    doc.font('Helvetica').fontSize(10).fillColor('#0f766e').text('Package Total', startX + width - 132, startY + 34, {
      width: 98,
      align: 'right',
    });
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111').text(
      this.formatMoney(values.total),
      startX + width - 136,
      startY + 52,
      {
        width: 104,
        align: 'right',
      },
    );

    doc.y = startY + 126;
  }

  private writeListItem(doc: PDFKit.PDFDocument, title: string, lines: Array<string | null>) {
    this.ensurePageSpace(doc, 70);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(title);

    for (const line of lines.filter(Boolean)) {
      doc.font('Helvetica').fontSize(10).fillColor('#333333').text(String(line), {
        indent: 14,
      });
    }

    doc.moveDown(0.6);
  }

  private writeInvoiceTable(
    doc: PDFKit.PDFDocument,
    rows: Array<{
      name: string;
      date: string;
      price: number;
      description?: string | null;
    }>,
  ) {
    const startX = doc.page.margins.left;
    const serviceWidth = 305;
    const dateX = startX + serviceWidth + 10;
    const dateWidth = 95;
    const priceX = dateX + dateWidth + 10;
    const priceWidth = 70;
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    this.ensurePageSpace(doc, 44);
    doc.roundedRect(startX, doc.y - 2, tableWidth, 24, 8).fillAndStroke('#f3eee7', '#dfd6cb');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111');
    doc.text('Service', startX + 10, doc.y + 5, { width: serviceWidth - 10 });
    doc.text('Date', dateX, doc.y + 5, { width: dateWidth });
    doc.text('Price', priceX, doc.y + 5, { width: priceWidth, align: 'right' });
    doc.y += 28;
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + tableWidth, doc.y)
      .strokeColor('#d6cec5')
      .lineWidth(1)
      .stroke();
    doc.moveDown(0.35);

    rows.forEach((row, index) => {
      this.ensurePageSpace(doc, 68);
      const rowY = doc.y;
      if (index % 2 === 0) {
        doc.roundedRect(startX, rowY - 4, tableWidth, 42, 8).fill('#fcfaf7');
      }
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#1a1a1a').text(row.name, startX + 10, rowY, { width: serviceWidth - 10 });
      let serviceBottomY = doc.y;
      if (row.description) {
        doc.font('Helvetica').fontSize(9.5).fillColor('#666666').text(row.description, startX + 10, serviceBottomY + 2, {
          width: serviceWidth - 10,
        });
        serviceBottomY = doc.y;
      }
      doc.font('Helvetica').fontSize(10).fillColor('#555555').text(row.date, dateX, rowY, { width: dateWidth });
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111111').text(this.formatMoney(row.price), priceX, rowY, {
        width: priceWidth,
        align: 'right',
      });
      doc.y = Math.max(serviceBottomY, rowY + 18);
      doc.moveDown(0.4);
      doc
        .moveTo(startX, doc.y)
        .lineTo(startX + tableWidth, doc.y)
        .strokeColor('#efe7de')
        .lineWidth(1)
        .stroke();
      doc.moveDown(0.4);
    });
  }

  private writeInvoiceSummaryBlock(
    doc: PDFKit.PDFDocument,
    values: {
      total: number;
      paid: number;
      outstanding: number;
      payments: Array<{
        amount: number;
        status: 'PENDING' | 'PAID';
        date: string;
      }>;
    },
  ) {
    this.ensurePageSpace(doc, 190);
    const startX = doc.page.width - doc.page.margins.right - 220;
    const blockWidth = 220;
    const blockY = doc.y;

    doc.roundedRect(startX, blockY, blockWidth, 102, 12).fillAndStroke('#f8f4ee', '#ddd3c7');
    let y = blockY + 14;
    [
      ['Total', this.formatMoney(values.total)],
      ['Paid', this.formatMoney(values.paid)],
      ['Outstanding', this.formatMoney(values.outstanding)],
    ].forEach(([label, amount], index) => {
      const emphasis = index === 2;
      if (emphasis) {
        doc.roundedRect(startX + 10, y - 6, blockWidth - 20, 28, 10).fill('#fff1ef');
      }
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#6b6258').text(label, startX + 14, y, { width: 90 });
      doc
        .font(emphasis ? 'Helvetica-Bold' : 'Helvetica-Bold')
        .fontSize(emphasis ? 15 : 11)
        .fillColor(emphasis ? '#b42318' : '#111111')
        .text(amount, startX + 90, y - 1, { width: 116, align: 'right' });
      y += 26;
    });
    doc.y = blockY + 118;

    if (values.payments.length > 0) {
      this.ensurePageSpace(doc, 108);
      const paymentsX = doc.page.margins.left;
      const paymentsWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const tableY = doc.y + 8;
      const amountWidth = 138;
      const statusWidth = 92;
      const dateWidth = 108;
      const amountX = paymentsX + 14;
      const statusX = amountX + amountWidth + 18;
      const dateX = paymentsX + paymentsWidth - dateWidth - 14;

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#6b6258').text('Payments', paymentsX, tableY - 4);
      doc.roundedRect(paymentsX, tableY + 16, paymentsWidth, 24, 8).fillAndStroke('#f3eee7', '#dfd6cb');
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111');
      doc.text('Amount', amountX, tableY + 23, { width: amountWidth, align: 'right' });
      doc.text('Status', statusX, tableY + 23, { width: statusWidth, align: 'center' });
      doc.text('Date', dateX, tableY + 23, { width: dateWidth, align: 'right' });

      let rowY = tableY + 48;
      values.payments.forEach((payment, index) => {
        this.ensurePageSpace(doc, 38);
        if (index % 2 === 0) {
          doc.roundedRect(paymentsX, rowY - 5, paymentsWidth, 26, 8).fill('#fcfaf7');
        }
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#111111').text(
          this.formatMoney(payment.amount),
          amountX,
          rowY,
          {
            width: amountWidth,
            align: 'right',
          },
        );
        doc.font('Helvetica-Bold').fontSize(10).fillColor(payment.status === 'PAID' ? '#0f766e' : '#b45309').text(
          payment.status === 'PAID' ? 'Paid' : 'Pending',
          statusX,
          rowY,
          {
            width: statusWidth,
            align: 'center',
          },
        );
        doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(payment.date, dateX, rowY, {
          width: dateWidth,
          align: 'right',
        });
        rowY += 30;
      });
      doc.y = rowY + 6;
    }
  }

  private writeInvoiceFooterBox(doc: PDFKit.PDFDocument, lines: string[]) {
    this.ensurePageSpace(doc, 136);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111111').text('Payment Instructions', {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineBreak: false,
    });
    doc.moveDown(0.45);
    const startX = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startY = doc.y;
    const lineHeight = 16;
    const boxHeight = Math.max(72, 20 + lines.length * lineHeight + 12);

    doc.roundedRect(startX, startY, width, boxHeight, 12).fillAndStroke('#f4f8f7', '#cfe3df');
    let textY = startY + 16;
    lines.forEach((line) => {
      doc.font('Helvetica').fontSize(10).fillColor('#334155').text(line, startX + 14, textY, {
        width: width - 28,
        lineGap: 2,
      });
      textY = doc.y + 4;
    });
    doc.y = startY + boxHeight + 8;
  }

  private ensurePageSpace(doc: PDFKit.PDFDocument, minimumHeight: number) {
    if (doc.y + minimumHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  }

  private formatFullName(contact: { firstName?: string | null; lastName?: string | null } | null | undefined) {
    return [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim() || 'Lead guest';
  }

  private buildBookingInvoiceNumber(bookingRef: string) {
    const clean = String(bookingRef || 'booking')
      .replace(/^INV[\s\-_]*/i, '')
      .replace(/[\u2010-\u2015]/g, '-')
      .replace(/[\u0000-\u001F\u007F-\u009F\u00A0\uFEFF\uFFFE\uFFFF\uFFFD]/g, '-')
      .replace(/[^\x20-\x7E]/g, '-')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `INV-${clean || 'BOOKING'}`;
  }

  private buildPackageInvoiceDescription(values: {
    title: string;
    bookingType: string;
    nightCount: number;
    travelStartDate: string | null;
  }) {
    return [
      values.travelStartDate ? `Starting ${this.formatDate(values.travelStartDate)}` : null,
      values.nightCount > 0 ? `${values.nightCount + 1} day itinerary` : 'Custom itinerary',
      `${this.formatBookingType(values.bookingType)} travel package`,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  private formatPackageDuration(nightCount: number) {
    if (nightCount <= 0) {
      return 'Custom itinerary';
    }

    const dayCount = nightCount + 1;
    return `${nightCount} night${nightCount === 1 ? '' : 's'} / ${dayCount} day${dayCount === 1 ? '' : 's'}`;
  }

  private formatClientFacingPackageTitle(value: string) {
    const clean = String(value || '')
      .replace(/^demo\s+/i, '')
      .replace(/^quote\s*[:\-]\s*/i, '')
      .replace(/^booking\s*[:\-]\s*/i, '')
      .replace(/\s*-\s*accepted booking$/i, '')
      .replace(/\s*-\s*booking$/i, '')
      .replace(/\s*-\s*confirmed$/i, '')
      .replace(/\bfit\b/gi, '')
      .replace(/\bseries\b/gi, '')
      .replace(/\bgroup\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!clean || /^[A-Z0-9\-\/]+$/i.test(clean)) {
      return 'Travel package';
    }

    return clean;
  }

  private listPersistedBookingPayments(booking: {
    id: string;
    bookingRef: string;
    payments: Array<{
      id: string;
      bookingId: string;
      type: PaymentTypeValue;
      amount: number;
      currency: string;
      status: PaymentStatusValue;
      method: PaymentMethodValue;
      reference: string | null;
      dueDate: string | Date | null;
      paidAt: string | Date | null;
      notes: string | null;
      createdAt: string | Date;
      updatedAt: string | Date;
    }>;
  }): DerivedPaymentRecord[] {
    return this.sortPaymentRecords(booking.payments.map((payment) => this.mapPaymentRecord(payment)));
  }

  private mapPaymentRecord(payment: {
    id: string;
    bookingId: string;
    type: PaymentTypeValue;
    amount: number;
    currency: string;
    status: PaymentStatusValue;
    method: PaymentMethodValue;
    reference: string | null;
    dueDate: string | Date | null;
    paidAt: string | Date | null;
    notes?: string | null;
    createdAt?: string | Date;
    updatedAt?: string | Date;
  }): DerivedPaymentRecord {
    const overdue = this.isPaymentOverdue(payment);
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      type: payment.type,
      amount: this.roundMoney(Number(payment.amount || 0)),
      currency: payment.currency || 'USD',
      status: payment.status,
      method: payment.method,
      reference: payment.reference || '',
      dueDate: payment.dueDate,
      paidAt: payment.paidAt,
      overdue,
      overdueDays: overdue ? this.getPaymentOverdueDays(payment.dueDate) : null,
      notes: payment.notes ?? null,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private getTodayStart() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  private isPaymentOverdue(payment: {
    dueDate?: string | Date | null;
    status: PaymentStatusValue;
  }) {
    if (payment.status !== 'PENDING' || !payment.dueDate) {
      return false;
    }

    const dueDate = new Date(payment.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      return false;
    }

    dueDate.setHours(0, 0, 0, 0);
    return dueDate.getTime() < this.getTodayStart().getTime();
  }

  private getPaymentOverdueDays(dueDate: string | Date | null | undefined) {
    if (!dueDate) {
      return null;
    }

    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
      return null;
    }

    due.setHours(0, 0, 0, 0);
    const diffMs = this.getTodayStart().getTime() - due.getTime();
    return diffMs > 0 ? Math.floor(diffMs / 86_400_000) : null;
  }

  private sortPaymentRecords<T extends { overdue: boolean; dueDate?: string | Date | null; createdAt?: string | Date }>(payments: T[]) {
    return [...payments].sort((left, right) => {
      if (left.overdue !== right.overdue) {
        return left.overdue ? -1 : 1;
      }

      const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
      if (leftDue !== rightDue) {
        return leftDue - rightDue;
      }

      const leftCreated = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightCreated = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightCreated - leftCreated;
    });
  }

  private buildCompanyScopedCacheKey(baseKey: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return `${baseKey}:${companyId}`;
  }

  private buildBookingCompanyWhere(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return {
      quote: {
        clientCompanyId: companyId,
      },
    };
  }

  private buildPaymentCompanyWhere(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return {
      booking: {
        quote: {
          clientCompanyId: companyId,
        },
      },
    };
  }

  private buildBookingServiceCompanyWhere(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return {
      booking: {
        quote: {
          clientCompanyId: companyId,
        },
      },
    };
  }

  private buildBookingAuditLogCompanyWhere(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return {
      booking: {
        quote: {
          clientCompanyId: companyId,
        },
      },
    };
  }

  private async assertBookingExists(bookingId: string, actor?: CompanyScopedActor) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        ...this.buildBookingCompanyWhere(actor),
      },
      select: { id: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
  }

  private normalizePaymentType(value: PaymentTypeValue) {
    const normalized = String(value || '').trim().toUpperCase() as PaymentTypeValue;

    if (!PAYMENT_TYPES.includes(normalized)) {
      throw new BadRequestException('Unsupported payment type');
    }

    return normalized;
  }

  private normalizePaymentStatus(value?: PaymentStatusValue) {
    const normalized = String(value || 'PENDING').trim().toUpperCase() as PaymentStatusValue;

    if (!PAYMENT_STATUSES.includes(normalized)) {
      throw new BadRequestException('Unsupported payment status');
    }

    return normalized;
  }

  private normalizePaymentMethod(value?: PaymentMethodValue | null) {
    const normalized = String(value || 'bank').trim().toLowerCase() as PaymentMethodValue;

    if (!PAYMENT_METHODS.includes(normalized)) {
      throw new BadRequestException('Unsupported payment method');
    }

    return normalized;
  }

  private normalizePaymentAmount(value: number | string) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    return this.roundMoney(numericValue);
  }

  private normalizePaymentCurrency(value?: string | null) {
    const normalized = String(value || 'USD').trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(normalized)) {
      throw new BadRequestException('Payment currency must be a 3-letter ISO code');
    }

    return normalized;
  }

  private normalizePaymentDate(value: string | Date | null | undefined, errorMessage: string) {
    if (value === undefined) {
      return undefined;
    }

    if (value === null || value === '') {
      return null;
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(errorMessage);
    }

    return date;
  }

  private areDatesEqual(left: string | Date | null | undefined, right: string | Date | null | undefined) {
    if (!left && !right) {
      return true;
    }

    if (!left || !right) {
      return false;
    }

    return new Date(left).getTime() === new Date(right).getTime();
  }

  private sumPaidPayments(
    payments: Array<{
      type: PaymentTypeValue;
      status: PaymentStatusValue;
      amount: number;
    }>,
    type: PaymentTypeValue,
  ) {
    return this.roundMoney(
      payments
        .filter((payment) => payment.type === type && payment.status === 'PAID')
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    );
  }

  private async applyFinanceStatusShortcut(
    prismaClient: BookingMutationClient,
    values: {
      booking: {
        id: string;
        bookingRef: string;
        payments: Array<{
          id: string;
          type: PaymentTypeValue;
          status: PaymentStatusValue;
          amount: number;
          currency: string;
        }>;
      };
      finance: {
        realizedTotalSell: number;
        quotedTotalSell: number;
        realizedTotalCost: number;
        quotedTotalCost: number;
        clientInvoiceStatus: ClientInvoiceStatusValue;
        supplierPaymentStatus: SupplierPaymentStatusValue;
      };
      nextClientInvoiceStatus: ClientInvoiceStatusValue;
      nextSupplierPaymentStatus: SupplierPaymentStatusValue;
    },
  ) {
    const clientTotal = this.roundMoney(values.finance.realizedTotalSell || values.finance.quotedTotalSell || 0);
    const supplierTotal = this.roundMoney(values.finance.realizedTotalCost || values.finance.quotedTotalCost || 0);
    const clientPaid = this.sumPaidPayments(values.booking.payments, 'CLIENT');
    const supplierPaid = this.sumPaidPayments(values.booking.payments, 'SUPPLIER');

    if (values.nextClientInvoiceStatus === 'paid' && clientTotal > clientPaid) {
      await (prismaClient as any).payment.create({
        data: {
          bookingId: values.booking.id,
          type: 'CLIENT',
          amount: this.roundMoney(clientTotal - clientPaid),
          currency: 'USD',
          status: 'PAID',
          method: 'bank',
          reference: `Finance shortcut settlement for ${values.booking.bookingRef || values.booking.id}`,
          paidAt: new Date(),
        },
      });
    } else if (
      values.nextClientInvoiceStatus === 'invoiced' &&
      values.finance.clientInvoiceStatus === 'unbilled' &&
      clientTotal > clientPaid
    ) {
      await (prismaClient as any).payment.create({
        data: {
          bookingId: values.booking.id,
          type: 'CLIENT',
          amount: this.roundMoney(clientTotal - clientPaid),
          currency: 'USD',
          status: 'PENDING',
          method: 'bank',
          reference: `Finance shortcut invoice ${this.buildBookingInvoiceNumber(values.booking.bookingRef || values.booking.id)}`,
        },
      });
    }

    if (values.nextSupplierPaymentStatus === 'paid' && supplierTotal > supplierPaid) {
      await (prismaClient as any).payment.create({
        data: {
          bookingId: values.booking.id,
          type: 'SUPPLIER',
          amount: this.roundMoney(supplierTotal - supplierPaid),
          currency: 'USD',
          status: 'PAID',
          method: 'bank',
          reference: `Finance shortcut supplier settlement for ${values.booking.bookingRef || values.booking.id}`,
          paidAt: new Date(),
        },
      });
    } else if (
      values.nextSupplierPaymentStatus === 'scheduled' &&
      values.finance.supplierPaymentStatus === 'unpaid' &&
      supplierTotal > supplierPaid
    ) {
      await (prismaClient as any).payment.create({
        data: {
          bookingId: values.booking.id,
          type: 'SUPPLIER',
          amount: this.roundMoney(supplierTotal - supplierPaid),
          currency: 'USD',
          status: 'PENDING',
          method: 'bank',
          reference: `Finance shortcut supplier payment for ${values.booking.bookingRef || values.booking.id}`,
        },
      });
    }
  }

  private formatNightCountLabel(value: number) {
    return `${value} night${value === 1 ? '' : 's'}`;
  }

  private formatMoney(value: number, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  }

  private formatDate(value: string | Date | null | undefined) {
    if (!value) {
      return 'Not set';
    }

    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
    }).format(new Date(value));
  }

  private async fetchImageBuffer(url: string | null | undefined) {
    const clean = String(url || '').trim();
    if (!clean) {
      return null;
    }

    try {
      const response = await fetch(clean);
      if (!response.ok) {
        return null;
      }

      const bytes = await response.arrayBuffer();
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  }

  private formatBookingType(value: string) {
    return String(value || 'FIT').trim().toUpperCase();
  }

  private formatConfirmationStatus(status: 'pending' | 'requested' | 'confirmed') {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private getVoucherItemSummary(item: BookingPdfQuoteItem) {
    if (
      item.hotel?.name &&
      item.contract?.name &&
      item.seasonName &&
      item.roomCategory?.name &&
      item.occupancyType &&
      item.mealPlan
    ) {
      return `${item.hotel.name} | ${item.contract.name} | ${item.seasonName} | ${item.roomCategory.name} | ${item.occupancyType} / ${item.mealPlan}`;
    }

    if (item.appliedVehicleRate) {
      return [item.appliedVehicleRate.routeName, item.appliedVehicleRate.vehicle?.name, item.appliedVehicleRate.serviceType?.name]
        .filter(Boolean)
        .join(' | ');
    }

    return item.pricingDescription || `Qty ${item.quantity || 1}`;
  }

  private getSupplierServiceDetail(title: string, quoteItem: BookingPdfQuoteItem | null | undefined) {
    const clean = (value: string) =>
      value
        .replace(/\bDescription:\s*/gi, '')
        .replace(/\bNotes:\s*/gi, '')
        .replace(/\s*\|\s*/g, ' | ')
        .replace(/\s+/g, ' ')
        .trim();
    const seen = new Set<string>();
    const detailParts = [
      quoteItem?.appliedVehicleRate
        ? [quoteItem.appliedVehicleRate.routeName, quoteItem.appliedVehicleRate.vehicle?.name, quoteItem.appliedVehicleRate.serviceType?.name]
            .filter(Boolean)
            .join(' | ')
        : null,
      quoteItem?.pricingDescription || null,
    ].filter((part): part is string => {
      const normalized = clean(part || '');
      if (!normalized) {
        return false;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return {
      title: clean(title) || 'Service',
      detail: detailParts.join(' | '),
    };
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
        const details =
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : {
                message: String(error),
              };

        console.error('Booking email send failed', {
          ...context,
          attempt,
          maxAttempts: retries + 1,
          details,
        });

        if (attempt <= retries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }

    throw lastError;
  }

  private generateBookingAccessToken() {
    return randomBytes(24).toString('hex');
  }
}
