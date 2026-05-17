import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedActor } from '../auth/auth.types';
import { QuotesService } from '../quotes/quotes.service';
import { BookingsService } from '../bookings/bookings.service';
import { InvoicesService } from '../invoices/invoices.service';

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotesService: QuotesService,
    private readonly bookingsService?: BookingsService,
    private readonly invoicesService?: InvoicesService,
  ) {}

  async getMe(actor: AuthenticatedActor) {
    const company = actor.companyId
      ? await this.prisma.company.findUnique({
          where: { id: actor.companyId },
          select: { id: true, name: true },
        })
      : null;

    return {
      id: actor.id,
      email: actor.email,
      role: actor.role,
      firstName: actor.firstName,
      lastName: actor.lastName,
      name: actor.name,
      company,
      accountStatus: 'active',
      portalPermissions: {
        readOnly: true,
        amendmentRequests: true,
        destructiveEditing: false,
      },
    };
  }

  async getQuotes(actor: AuthenticatedActor) {
    const quotes = await this.prisma.quote.findMany({
      where: this.buildAssignedQuoteWhere(actor),
      include: {
        clientCompany: true,
        contact: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return quotes.map((quote: any) => this.mapAgentQuoteSummary(quote));
  }

  async getQuote(id: string, actor: AuthenticatedActor) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote || !this.canActorViewQuote(quote as any, actor)) {
      return null;
    }

    return this.mapAgentQuoteDetail(quote as any);
  }

  async getBookings(actor: AuthenticatedActor) {
    const bookings = await (this.prisma.booking as any).findMany({
      where: {
        quote: this.buildAssignedQuoteWhere(actor),
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return bookings.map((booking: any) => this.mapAgentBookingSummary(booking));
  }

  async getBooking(id: string, actor: AuthenticatedActor) {
    const booking = await (this.prisma.booking as any).findFirst({
      where: {
        id,
        quote: this.buildAssignedQuoteWhere(actor),
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
          },
        },
        passengers: {
          orderBy: [{ isLead: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
        },
        payments: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        vouchers: {
          select: {
            id: true,
            type: true,
            status: true,
            issuedAt: true,
          },
          orderBy: [{ createdAt: 'desc' }],
        },
        services: {
          orderBy: [{ serviceOrder: 'asc' }, { id: 'asc' }],
        },
        seriesDeparture: {
          include: {
            series: true,
          },
        },
      },
    });
    return booking ? this.mapAgentBookingDetail(booking) : null;
  }

  async getInvoices(actor: AuthenticatedActor) {
    const invoices = await (this.prisma as any).invoice.findMany({
      where: {
        quote: this.buildAssignedQuoteWhere(actor),
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
            bookings: {
              include: {
                payments: {
                  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                },
              },
              orderBy: [{ createdAt: 'desc' }],
              take: 1,
            },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
    });
    return invoices.map((invoice: any) => this.mapAgentInvoiceSummary(invoice));
  }

  async getDepartures(actor: AuthenticatedActor) {
    const departures = await (this.prisma as any).seriesDeparture.findMany({
      where: {
        series: {
          active: true,
        },
        booking: {
          quote: this.buildAssignedQuoteWhere(actor),
        },
      },
      include: {
        series: true,
        booking: {
          include: {
            passengers: {
              select: {
                hotelCategoryVariant: true,
                branchExtension: true,
              },
            },
          },
        },
      },
      orderBy: [{ departureDate: 'asc' }, { id: 'asc' }],
    });

    return departures.map((departure: any) => this.mapAgentDepartureSummary(departure));
  }

  async getInvoicePdf(id: string, actor: AuthenticatedActor) {
    if (!this.invoicesService) {
      throw new NotFoundException('Invoice documents are not available');
    }

    const invoice = await (this.prisma as any).invoice.findFirst({
      where: {
        id,
        quote: this.buildAssignedQuoteWhere(actor),
      },
      select: {
        id: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return this.invoicesService.generatePdf(id, actor);
  }

  async getBookingVoucherPdf(id: string, actor: AuthenticatedActor) {
    if (!this.bookingsService) {
      throw new NotFoundException('Booking documents are not available');
    }

    const booking = await this.getBookingRaw(id, actor);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return this.bookingsService.generateVoucherPdf(id, actor, booking);
  }

  async requestBookingAmendment(id: string, actor: AuthenticatedActor, input: { amendmentType?: string | null; notes?: string | null }) {
    const booking = await this.getBookingRaw(id, actor);
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const notes = String(input.notes || '').trim();
    if (!notes) {
      throw new BadRequestException('Amendment request notes are required');
    }

    return {
      ok: true,
      bookingId: booking.id,
      bookingRef: booking.bookingRef || booking.id,
      amendmentType: input.amendmentType || 'general_request',
      status: 'requested',
      destructiveEditing: false,
      message: 'Amendment request received for operations review.',
    };
  }

  async getProposals(actor: AuthenticatedActor) {
    const quotes = await this.prisma.quote.findMany({
      where: {
        ...this.buildAssignedQuoteWhere(actor),
        publicEnabled: true,
        publicToken: {
          not: null,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
    return quotes
      .filter((quote: any) => Boolean(quote.publicEnabled && quote.publicToken))
      .map((quote: any) => ({
        id: quote.id,
        title: quote.title,
        status: quote.status,
        quoteNumber: quote.quoteNumber ?? null,
        publicToken: quote.publicToken,
        publicUrl: `/proposal/${quote.publicToken}`,
        pdfUrl: `/api/public/proposals/${quote.publicToken}/pdf`,
        updatedAt: quote.updatedAt,
      }));
  }

  private mapAgentQuoteSummary(quote: any) {
    return {
      id: quote.id,
      quoteNumber: quote.quoteNumber ?? null,
      title: quote.title,
      description: quote.description ?? null,
      status: quote.status,
      quoteCurrency: quote.quoteCurrency ?? 'USD',
      adults: quote.adults ?? 0,
      children: quote.children ?? 0,
      nightCount: quote.nightCount ?? 0,
      totalSell: quote.totalSell ?? 0,
      pricePerPax: quote.pricePerPax ?? 0,
      travelStartDate: quote.travelStartDate ?? null,
      validUntil: quote.validUntil ?? null,
      publicEnabled: Boolean(quote.publicEnabled && quote.publicToken),
      publicUrl: quote.publicEnabled && quote.publicToken ? `/proposal/${quote.publicToken}` : null,
      company: this.getQuoteCompany(quote),
      contact: this.getQuoteContact(quote),
      createdAt: quote.createdAt,
      updatedAt: quote.updatedAt,
    };
  }

  private mapAgentQuoteDetail(quote: any) {
    const summary = this.mapAgentQuoteSummary(quote);
    const itineraries = Array.isArray(quote.itineraries) ? [...quote.itineraries] : [];
    const quoteItems = Array.isArray(quote.quoteItems) ? [...quote.quoteItems] : [];

    return {
      ...summary,
      itinerary: itineraries
        .sort((left, right) => (left.dayNumber ?? 0) - (right.dayNumber ?? 0))
        .map((day) => ({
          id: day.id,
          dayNumber: day.dayNumber,
          title: day.title,
          description: day.description ?? null,
          serviceDate: day.serviceDate ?? null,
          imageCount: Array.isArray(day.images) ? day.images.length : 0,
          services: quoteItems
            .filter((item: any) => item.itineraryId === day.id)
            .map((item: any) => ({
                id: item.id,
                title: item.service?.name || item.hotel?.name || item.pricingDescription || 'Included service',
                category: item.service?.category || item.service?.serviceType?.name || 'Service',
                serviceDate: item.serviceDate ?? null,
                startTime: item.startTime ?? null,
                pickupTime: item.pickupTime ?? null,
                pickupLocation: item.pickupLocation ?? null,
                meetingPoint: item.meetingPoint ?? null,
                quantity: item.quantity ?? null,
            }))
            ,
        })),
    };
  }

  private mapAgentBookingSummary(booking: any) {
    return {
      id: booking.id,
      bookingRef: booking.bookingRef || booking.id,
      status: booking.status,
      title: booking.snapshotJson?.title || booking.quote?.title || 'Booking',
      clientName:
        booking.clientSnapshotJson?.name ||
        booking.quote?.clientCompany?.name ||
        booking.snapshotJson?.company?.name ||
        'Client',
      adults: booking.adults ?? 0,
      children: booking.children ?? 0,
      roomCount: booking.roomCount ?? 0,
      nightCount: booking.nightCount ?? 0,
      travelStartDate: booking.snapshotJson?.travelStartDate || null,
      createdAt: booking.createdAt,
    };
  }

  private mapAgentBookingDetail(booking: any) {
    const summary = this.mapAgentBookingSummary(booking);
    const payments = Array.isArray(booking.payments) ? booking.payments : [];
    const clientPayments = payments.filter((payment: any) => payment.type === 'CLIENT');
    const paid = clientPayments
      .filter((payment: any) => payment.status === 'PAID')
      .reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
    const totalSell = Number(booking.finance?.totalSell || booking.pricingSnapshotJson?.totalSell || booking.snapshotJson?.totalSell || 0);
    const balance = Math.max(totalSell - paid, 0);

    return {
      ...summary,
      finance: {
        totalSell,
        depositsReceived: paid,
        remainingBalance: balance,
        paymentStatus: balance <= 0 ? 'paid' : paid > 0 ? 'partially_paid' : 'unpaid',
        paymentMethods: this.listPaymentMethods(),
        paymentReferences: clientPayments.map((payment: any) => ({
          id: payment.id,
          method: payment.method,
          reference: payment.reference || null,
          amount: Number(payment.amount || 0),
          status: payment.status,
        })),
      },
      passengers: Array.isArray(booking.passengers)
        ? booking.passengers.map((passenger: any) => ({
            id: passenger.id,
            fullName: passenger.fullName || [passenger.firstName, passenger.lastName].filter(Boolean).join(' ').trim(),
            firstName: passenger.firstName,
            lastName: passenger.lastName,
            isLead: Boolean(passenger.isLead),
            nationality: passenger.nationality || null,
            passportStatus: passenger.passportNumber ? 'on_file' : 'missing',
            hotelCategoryVariant: passenger.hotelCategoryVariant || null,
            branchExtension: passenger.branchExtension || null,
          }))
        : [],
      departure: booking.seriesDeparture ? this.mapAgentDepartureSummary(booking.seriesDeparture) : null,
      vouchers: Array.isArray(booking.vouchers)
        ? booking.vouchers.map((voucher: any) => ({
            id: voucher.id,
            type: voucher.type,
            status: voucher.status,
            issuedAt: voucher.issuedAt || null,
            pdfUrl: `/api/agent/bookings/${booking.id}/voucher/pdf`,
          }))
        : [],
      documents: {
        invoicePdfUrl: `/api/agent/invoices`,
        voucherPdfUrl: `/api/agent/bookings/${booking.id}/voucher/pdf`,
        itineraryPdfUrl: `/agent/bookings/${booking.id}`,
        receiptPdfUrl: `/api/agent/invoices`,
      },
      amendmentRequests: {
        enabled: true,
        endpoint: `/api/agent/bookings/${booking.id}/amendment-requests`,
      },
      services: Array.isArray(booking.services)
        ? booking.services.map((service: any) => ({
            id: service.id,
            description: service.description,
            serviceType: service.serviceType,
            serviceDate: service.serviceDate ?? null,
            startTime: service.startTime ?? null,
            pickupTime: service.pickupTime ?? null,
            pickupLocation: service.pickupLocation ?? null,
            meetingPoint: service.meetingPoint ?? null,
            supplierName: service.supplierName ?? null,
            status: service.status,
            confirmationStatus: service.confirmationStatus,
          }))
        : [],
    };
  }

  private mapAgentInvoiceSummary(invoice: any) {
    const booking = this.getInvoiceBooking(invoice);
    const payments = booking?.payments || [];
    const paidAmount = payments
      .filter((payment: any) => payment.type === 'CLIENT' && payment.status === 'PAID')
      .reduce((total: number, payment: any) => total + Number(payment.amount || 0), 0);
    const totalAmount = Number(invoice.totalAmount || 0);
    const balanceDue = Math.max(totalAmount - paidAmount, 0);
    return {
      id: invoice.id,
      invoiceNumber: `INV-${booking?.bookingRef || invoice.quote?.quoteNumber || invoice.id}`,
      totalAmount,
      depositsReceived: paidAmount,
      balanceDue,
      currency: invoice.currency,
      status: invoice.status,
      paymentStatus: balanceDue <= 0 ? 'paid' : paidAmount > 0 ? 'partially_paid' : 'unpaid',
      paymentMethods: this.listPaymentMethods(),
      paymentReferences: payments
        .filter((payment: any) => payment.type === 'CLIENT')
        .map((payment: any) => ({
          id: payment.id,
          method: payment.method,
          reference: payment.reference || null,
          amount: Number(payment.amount || 0),
          status: payment.status,
        })),
      dueDate: invoice.dueDate,
      pdfUrl: `/api/agent/invoices/${invoice.id}/pdf`,
      quote: {
        id: invoice.quote?.id,
        quoteNumber: invoice.quote?.quoteNumber ?? null,
        title: invoice.quote?.title || 'Quote',
        status: invoice.quote?.status ?? null,
        clientCompany: {
          name: invoice.quote?.clientCompany?.name || 'Client',
        },
        booking: booking
          ? {
              id: booking.id,
              status: booking.status,
            }
          : null,
      },
    };
  }

  private getQuoteCompany(quote: any) {
    const company = quote.company || quote.clientCompany || null;
    return company
      ? {
          id: company.id,
          name: company.name,
        }
      : null;
  }

  private getQuoteContact(quote: any) {
    const contact = quote.contact || null;

    if (!contact) {
      return null;
    }

    return {
      id: contact.id,
      name: [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.email || 'Traveler',
      email: contact.email ?? null,
    };
  }

  private canActorViewQuote(quote: any, actor: AuthenticatedActor) {
    const quoteCompanyId = quote.clientCompanyId || quote.company?.id || quote.clientCompany?.id || null;
    if (actor.companyId && quoteCompanyId !== actor.companyId) {
      return false;
    }

    return !quote.agentId || quote.agentId === actor.id;
  }

  private buildAssignedQuoteWhere(actor: AuthenticatedActor) {
    if (!actor.companyId) {
      return {
        agentId: actor.id,
      };
    }

    return {
      clientCompanyId: actor.companyId,
      OR: [
        { agentId: actor.id },
        { agentId: null },
      ],
    };
  }

  private getInvoiceBooking(invoice: any) {
    return invoice.quote?.booking || invoice.quote?.bookings?.[0] || null;
  }

  private async getBookingRaw(id: string, actor: AuthenticatedActor) {
    return (this.prisma.booking as any).findFirst({
      where: {
        id,
        quote: this.buildAssignedQuoteWhere(actor),
      },
      include: {
        quote: {
          include: {
            clientCompany: true,
          },
        },
        passengers: true,
        payments: true,
        vouchers: true,
        services: {
          orderBy: [{ serviceOrder: 'asc' }, { id: 'asc' }],
        },
        seriesDeparture: {
          include: {
            series: true,
          },
        },
      },
    });
  }

  private mapAgentDepartureSummary(departure: any) {
    const totalCapacity = Number(departure.totalCapacity || departure.sharedCoachCapacity || 0);
    const paxCount = Number(departure.paxCount || departure.booking?.passengers?.length || 0);
    const reservedSeats = Number(departure.reservedSeats || 0);
    const seatsSold = Math.max(paxCount, reservedSeats);
    const seatsRemaining = totalCapacity > 0 ? Math.max(totalCapacity - seatsSold, 0) : null;
    const stopSale = Boolean(departure.status === 'STOP_SALE' || (totalCapacity > 0 && seatsRemaining === 0));
    const passengers = departure.booking?.passengers || [];

    return {
      id: departure.id,
      seriesId: departure.seriesId,
      seriesCode: departure.series?.seriesCode || null,
      seriesName: departure.series?.seriesName || 'Series departure',
      departureCode: departure.departureCode || null,
      departureDate: departure.departureDate || null,
      status: departure.status,
      availability: {
        totalCapacity,
        seatsSold,
        seatsRemaining,
        stopSale,
      },
      hotelCategories: this.uniqueValues(passengers.map((passenger: any) => passenger.hotelCategoryVariant)),
      branchExtensions: this.uniqueValues(passengers.map((passenger: any) => passenger.branchExtension)),
    };
  }

  private listPaymentMethods() {
    return ['bank_transfer', 'cash', 'cliq', 'mb_way', 'credit_card', 'custom_manual'];
  }

  private uniqueValues(values: Array<string | null | undefined>) {
    return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
  }
}
