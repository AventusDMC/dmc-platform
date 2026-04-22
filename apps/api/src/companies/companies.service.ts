import { Injectable } from '@nestjs/common';
import { blockDelete, normalizeOptionalString, throwIfNotFound } from '../common/crud.helpers';
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

  findAll() {
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

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
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

  create(data: CreateCompanyInput) {
    return this.prisma.company.create({
      data: {
        name: data.name.trim(),
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

  async update(id: string, data: UpdateCompanyInput) {
    await this.findOne(id);

    return this.prisma.company.update({
      where: { id },
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

  async getBranding(companyId: string) {
    const company = await this.findOne(companyId);
    return this.buildBrandingResponse(company);
  }

  async updateBranding(companyId: string, data: UpdateBrandingInput) {
    await this.findOne(companyId);

    const branding = await this.prisma.companyBranding.upsert({
      where: { companyId },
      create: {
        companyId,
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

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        branding: true,
      },
    });

    return this.buildBrandingResponse(throwIfNotFound(company, 'Company'), branding);
  }

  async updateBrandingLogo(companyId: string, logoUrl: string) {
    return this.updateBranding(companyId, {
      logoUrl,
    });
  }

  async remove(id: string) {
    const company = await this.findOne(id);

    blockDelete('company', 'users', company._count.users);
    blockDelete('company', 'contacts', company._count.contacts);
    blockDelete('company', 'leads', company._count.leads);
    blockDelete('company', 'quotes', company._count.clientQuotes + company._count.brandQuotes);

    return this.prisma.company.delete({
      where: { id },
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
}
