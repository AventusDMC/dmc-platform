import { BadRequestException, Injectable } from '@nestjs/common';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
import { blockDelete, normalizeOptionalString, throwIfNotFound } from '../common/crud.helpers';
import { calculateProfitSummary } from '../finance/profit';
import { PrismaService } from '../prisma/prisma.service';

type CreateCompanyInput = {
  name: string;
  type?: string;
  website?: string;
  logoUrl?: string;
  primaryColor?: string;
  country?: string;
  city?: string;
};

type UpdateCompanyInput = {
  name?: string;
  type?: string;
  website?: string;
  logoUrl?: string;
  primaryColor?: string;
  country?: string;
  city?: string;
};

type UpdateBrandingInput = {
  displayName?: string | null;
  logoUrl?: string | null;
  headerTitle?: string | null;
  headerSubtitle?: string | null;
  footerText?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    return this.prisma.company.findMany({
      include: {
        branding: true,
        _count: {
          select: {
            contacts: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    const company = await this.prisma.company.findFirst({
      where: {
        id,
      },
      include: {
        branding: true,
        _count: {
          select: {
            contacts: true,
            leads: true,
            clientQuotes: true,
            brandQuotes: true,
            users: true,
          },
        },
      },
    });

    return throwIfNotFound(company, 'Company');
  }

  async getPerformance(id: string, actor?: CompanyScopedActor) {
    await this.findOne(id, actor);

    const [quotes, bookings] = await Promise.all([
      (this.prisma.quote as any).findMany({
        where: {
          clientCompanyId: id,
          revisions: { none: {} },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          sentAt: true,
          acceptedAt: true,
        },
        orderBy: [{ createdAt: 'desc' }],
      } as any),
      (this.prisma.booking as any).findMany({
        where: {
          clientCompanyId: id,
          amendments: { none: {} },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          startDate: true,
          pricingSnapshotJson: true,
          services: {
            select: {
              totalCost: true,
              totalSell: true,
              status: true,
            },
          },
        },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      } as any),
    ]);

    const latestQuotes = quotes as Array<{
      id: string;
      status: string | null;
      createdAt: Date | null;
      sentAt?: Date | null;
      acceptedAt?: Date | null;
    }>;
    const latestBookings = bookings as Array<{
      id: string;
      status: string | null;
      createdAt: Date | null;
      startDate: Date | null;
      pricingSnapshotJson: { totalCost?: number | null; totalSell?: number | null } | null;
      services: Array<{ totalCost: number | null; totalSell: number | null; status?: string | null }>;
    }>;

    const cancelledBookings = latestBookings.filter((booking) => this.isCancelled(booking.status)).length;
    const activeBookings = latestBookings.filter((booking) => !this.isCancelled(booking.status));
    const totals = activeBookings.reduce(
      (summary, booking) => {
        const bookingTotals = this.calculateBookingTotals(booking);
        summary.totalCost += bookingTotals.totalCost;
        summary.totalSell += bookingTotals.totalSell;
        return summary;
      },
      { totalCost: 0, totalSell: 0 },
    );
    const profit = calculateProfitSummary({
      totalCost: this.roundMoney(totals.totalCost),
      totalSell: this.roundMoney(totals.totalSell),
    });
    const totalQuotes = latestQuotes.length;
    const activeQuotes = latestQuotes.filter((quote) => !this.isCancelled(quote.status));

    return {
      companyId: id,
      totalQuotes,
      sentQuotes: latestQuotes.filter((quote) => String(quote.status || '').toUpperCase() === 'SENT').length,
      confirmedQuotes: latestQuotes.filter((quote) => this.isConfirmedQuote(quote.status)).length,
      cancelledQuotes: latestQuotes.filter((quote) => this.isCancelled(quote.status)).length,
      totalBookings: activeBookings.length,
      cancelledBookings,
      totalRevenue: profit.totalSell,
      totalCost: profit.totalCost,
      totalProfit: profit.grossProfit,
      avgMargin: profit.marginPercent,
      conversionRate: activeQuotes.length > 0 ? this.roundPercent((activeBookings.length / activeQuotes.length) * 100) : 0,
      lastQuoteDate: this.maxDate(latestQuotes.map((quote) => quote.createdAt))?.toISOString() || null,
      lastBookingDate: this.maxDate(activeBookings.map((booking) => booking.startDate || booking.createdAt))?.toISOString() || null,
    };
  }

  async create(data: CreateCompanyInput, actor?: CompanyScopedActor) {
    requireActorCompanyId(actor);
    const name = data.name?.trim();

    if (!name) {
      throw new BadRequestException('Company name is required');
    }

    return this.prisma.company.create({
      data: {
        name,
        type: normalizeOptionalString(data.type),
        website: normalizeOptionalString(data.website),
        logoUrl: normalizeOptionalString(data.logoUrl),
        primaryColor: this.normalizeCompanyColor(data.primaryColor),
        country: normalizeOptionalString(data.country),
        city: normalizeOptionalString(data.city),
      },
      include: {
        branding: true,
        _count: {
          select: {
            contacts: true,
          },
        },
      },
    });
  }

  async update(id: string, data: UpdateCompanyInput, actor?: CompanyScopedActor) {
    const company = await this.findOne(id, actor);

    return this.prisma.company.update({
      where: { id: company.id },
      data: {
        name: data.name === undefined ? undefined : data.name.trim(),
        type: normalizeOptionalString(data.type),
        website: normalizeOptionalString(data.website),
        logoUrl: normalizeOptionalString(data.logoUrl),
        primaryColor: this.normalizeCompanyColor(data.primaryColor),
        country: normalizeOptionalString(data.country),
        city: normalizeOptionalString(data.city),
      },
      include: {
        branding: true,
      },
    });
  }

  async getBranding(companyId: string, actor?: CompanyScopedActor) {
    const company = await this.findOne(companyId, actor);
    return this.buildBrandingResponse(company);
  }

  async updateBranding(companyId: string, data: UpdateBrandingInput, actor?: CompanyScopedActor) {
    const company = await this.findOne(companyId, actor);

    const branding = await this.prisma.companyBranding.upsert({
      where: { companyId: company.id },
      create: {
        companyId: company.id,
        displayName: normalizeOptionalString(data.displayName ?? undefined),
        logoUrl: normalizeOptionalString(data.logoUrl ?? undefined),
        headerTitle: normalizeOptionalString(data.headerTitle ?? undefined),
        headerSubtitle: normalizeOptionalString(data.headerSubtitle ?? undefined),
        footerText: normalizeOptionalString(data.footerText ?? undefined),
        website: normalizeOptionalString(data.website ?? undefined),
        email: normalizeOptionalString(data.email ?? undefined),
        phone: normalizeOptionalString(data.phone ?? undefined),
        primaryColor: this.normalizeCompanyColor(data.primaryColor),
        secondaryColor: this.normalizeCompanyColor(data.secondaryColor),
      },
      update: {
        displayName: data.displayName === undefined ? undefined : normalizeOptionalString(data.displayName ?? undefined),
        logoUrl: data.logoUrl === undefined ? undefined : normalizeOptionalString(data.logoUrl ?? undefined),
        headerTitle: data.headerTitle === undefined ? undefined : normalizeOptionalString(data.headerTitle ?? undefined),
        headerSubtitle:
          data.headerSubtitle === undefined ? undefined : normalizeOptionalString(data.headerSubtitle ?? undefined),
        footerText: data.footerText === undefined ? undefined : normalizeOptionalString(data.footerText ?? undefined),
        website: data.website === undefined ? undefined : normalizeOptionalString(data.website ?? undefined),
        email: data.email === undefined ? undefined : normalizeOptionalString(data.email ?? undefined),
        phone: data.phone === undefined ? undefined : normalizeOptionalString(data.phone ?? undefined),
        primaryColor: data.primaryColor === undefined ? undefined : this.normalizeCompanyColor(data.primaryColor),
        secondaryColor: data.secondaryColor === undefined ? undefined : this.normalizeCompanyColor(data.secondaryColor),
      },
    });

    const updatedCompany = await this.prisma.company.findUnique({
      where: { id: company.id },
      include: {
        branding: true,
      },
    });

    return this.buildBrandingResponse(throwIfNotFound(updatedCompany, 'Company'), branding);
  }

  async updateBrandingLogo(companyId: string, logoUrl: string, actor?: CompanyScopedActor) {
    return this.updateBranding(companyId, {
      logoUrl,
    }, actor);
  }

  async remove(id: string, actor?: CompanyScopedActor) {
    const company = await this.findOne(id, actor);

    blockDelete('company', 'users', company._count.users);
    blockDelete('company', 'contacts', company._count.contacts);
    blockDelete('company', 'leads', company._count.leads);
    blockDelete('company', 'quotes', company._count.clientQuotes + company._count.brandQuotes);

    return this.prisma.company.delete({
      where: { id: company.id },
    });
  }

  private buildBrandingResponse(
    company: {
      id: string;
      name: string;
      website: string | null;
      logoUrl: string | null;
      primaryColor: string | null;
      branding?: {
        displayName: string | null;
        logoUrl: string | null;
        headerTitle: string | null;
        headerSubtitle: string | null;
        footerText: string | null;
        website: string | null;
        email: string | null;
        phone: string | null;
        primaryColor: string | null;
        secondaryColor: string | null;
      } | null;
    },
    brandingOverride?: {
      displayName: string | null;
      logoUrl: string | null;
      headerTitle: string | null;
      headerSubtitle: string | null;
      footerText: string | null;
      website: string | null;
      email: string | null;
      phone: string | null;
      primaryColor: string | null;
      secondaryColor: string | null;
    } | null,
  ) {
    const branding = brandingOverride ?? company.branding ?? null;

    return {
      companyId: company.id,
      hasCustomBranding: Boolean(branding),
      branding: {
        displayName: branding?.displayName ?? company.name,
        logoUrl: branding?.logoUrl ?? company.logoUrl ?? null,
        headerTitle: branding?.headerTitle ?? 'Bespoke Travel Proposal',
        headerSubtitle: branding?.headerSubtitle ?? null,
        footerText: branding?.footerText ?? null,
        website: branding?.website ?? company.website ?? null,
        email: branding?.email ?? null,
        phone: branding?.phone ?? null,
        primaryColor: branding?.primaryColor ?? this.normalizeCompanyColor(company.primaryColor) ?? '#0F766E',
        secondaryColor:
          branding?.secondaryColor ?? this.normalizeCompanyColor(company.primaryColor) ?? '#0F766E',
      },
    };
  }

  private normalizeCompanyColor(value?: string | null) {
    const normalized = normalizeOptionalString(value ?? undefined)?.replace(/^([^#])/, '#$1').toUpperCase() || null;
    if (!normalized) {
      return null;
    }

    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
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

  private isCancelled(status: string | null | undefined) {
    return String(status || '').toLowerCase() === 'cancelled';
  }

  private isConfirmedQuote(status: string | null | undefined) {
    const normalized = String(status || '').toUpperCase();
    return normalized === 'ACCEPTED' || normalized === 'CONFIRMED';
  }

  private maxDate(values: Array<Date | null | undefined>) {
    const dates = values.filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
    if (dates.length === 0) {
      return null;
    }

    return new Date(Math.max(...dates.map((date) => date.getTime())));
  }

  private roundMoney(value: number) {
    return Number(Number(value || 0).toFixed(2));
  }

  private roundPercent(value: number) {
    return Number(Number.isFinite(value) ? value.toFixed(2) : 0);
  }
}
