import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedActor } from '../auth/auth.types';
import { QuotesService } from '../quotes/quotes.service';

@Injectable()
export class AgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotesService: QuotesService,
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

    if (!quote || (quote as any).agentId !== actor.id) {
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
        services: {
          orderBy: [{ serviceOrder: 'asc' }, { id: 'asc' }],
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
    return invoices.map((invoice: any) => this.mapAgentInvoiceSummary(invoice));
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

    return {
      ...summary,
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
    return {
      id: invoice.id,
      totalAmount: invoice.totalAmount,
      currency: invoice.currency,
      status: invoice.status,
      dueDate: invoice.dueDate,
      quote: {
        id: invoice.quote?.id,
        quoteNumber: invoice.quote?.quoteNumber ?? null,
        title: invoice.quote?.title || 'Quote',
        status: invoice.quote?.status ?? null,
        clientCompany: {
          name: invoice.quote?.clientCompany?.name || 'Client',
        },
        booking: invoice.quote?.booking
          ? {
              id: invoice.quote.booking.id,
              status: invoice.quote.booking.status,
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

  private buildAssignedQuoteWhere(actor: AuthenticatedActor) {
    return {
      clientCompanyId: actor.companyId ?? undefined,
      agentId: actor.id,
    };
  }
}
