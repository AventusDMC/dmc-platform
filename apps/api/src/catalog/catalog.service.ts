import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isCatalogV2Enabled } from './catalog-v2-flags';
import { buildCatalogV2Summary, type CatalogRole } from './catalog-v2-summary';

/**
 * Product Catalog V2 — Slice 1 read-only aggregator (backend-flag-gated,
 * fail-closed). Loads suppliers + their linked services/rates/transport contracts
 * and hotel contracts (READ ONLY), then delegates to the pure summary builder.
 * Writes NOTHING — no create/update/delete/upsert, no audit, no side effects,
 * no email/send. Pricing redaction is decided by the actor's role in the builder.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getV2Summary(role: CatalogRole | null) {
    // Fail-closed backend gate — checked FIRST, before any read.
    if (!isCatalogV2Enabled()) {
      throw new ForbiddenException('Product Catalog V2 is not enabled.');
    }

    const toIso = (value: any): string | null =>
      value instanceof Date ? value.toISOString() : value ? String(value) : null;

    const [
      suppliers,
      supplierServices,
      serviceRates,
      transportContracts,
      vehicleRates,
      hotelContracts,
      servicesCount,
      activities,
      guides,
      restaurants,
    ] = await Promise.all([
      (this.prisma.supplier as any).findMany({
        select: { id: true, name: true, type: true, email: true, phone: true, baseCity: true, transportDiscountPercent: true },
      }),
      (this.prisma.supplierService as any).findMany({
        select: {
          id: true,
          resolvedSupplierId: true,
          supplierId: true,
          name: true,
          category: true,
          currency: true,
          baseCost: true,
          serviceType: { select: { isActive: true } },
        },
      }),
      (this.prisma.serviceRate as any).findMany({
        select: { serviceId: true, resolvedSupplierId: true, supplierId: true, costCurrency: true, costBaseAmount: true },
      }),
      (this.prisma.transportContract as any).findMany({
        select: { supplierId: true, currency: true, validFrom: true, validTo: true, active: true },
      }),
      (this.prisma.vehicleRate as any).findMany({ select: { supplierId: true, currency: true } }),
      (this.prisma.hotelContract as any).findMany({
        select: { id: true, name: true, validFrom: true, validTo: true, currency: true, confidence: true, hotel: { select: { name: true } } },
      }),
      (this.prisma.supplierService as any).count(),
      (this.prisma.activity as any).findMany({ select: { active: true } }),
      (this.prisma.guide as any).findMany({ select: { active: true } }),
      (this.prisma.restaurant as any).findMany({ select: { active: true } }),
    ]);

    return buildCatalogV2Summary(
      {
        suppliers: (suppliers as any[]).map((s) => ({
          id: s.id,
          name: s.name,
          type: s.type ?? null,
          email: s.email ?? null,
          phone: s.phone ?? null,
          baseCity: s.baseCity ?? null,
          transportDiscountPercent: s.transportDiscountPercent ?? null,
        })),
        supplierServices: (supplierServices as any[]).map((sv) => ({
          id: sv.id,
          resolvedSupplierId: sv.resolvedSupplierId ?? null,
          supplierId: sv.supplierId ?? null,
          name: sv.name ?? null,
          category: sv.category ?? null,
          currency: sv.currency ?? null,
          baseCost: sv.baseCost ?? null,
          serviceTypeActive: sv.serviceType?.isActive ?? null,
        })),
        serviceRates: (serviceRates as any[]).map((r) => ({
          serviceId: r.serviceId,
          resolvedSupplierId: r.resolvedSupplierId ?? null,
          supplierId: r.supplierId ?? null,
          costCurrency: r.costCurrency ?? null,
          costBaseAmount: r.costBaseAmount ?? null,
        })),
        transportContracts: (transportContracts as any[]).map((c) => ({
          supplierId: c.supplierId,
          currency: c.currency ?? null,
          validFrom: toIso(c.validFrom),
          validTo: toIso(c.validTo),
          active: Boolean(c.active),
        })),
        vehicleRates: (vehicleRates as any[]).map((v) => ({ supplierId: v.supplierId ?? null, currency: v.currency ?? null })),
        hotelContracts: (hotelContracts as any[]).map((c) => ({
          id: c.id,
          name: c.name ?? null,
          hotelName: c.hotel?.name ?? null,
          validFrom: toIso(c.validFrom),
          validTo: toIso(c.validTo),
          currency: c.currency ?? null,
          confidence: c.confidence ?? null,
        })),
        catalogCounts: {
          services: servicesCount as number,
          activities: (activities as any[]).length,
          activitiesActive: (activities as any[]).filter((a) => a.active).length,
          guides: (guides as any[]).length,
          guidesActive: (guides as any[]).filter((g) => g.active).length,
          restaurants: (restaurants as any[]).length,
          restaurantsActive: (restaurants as any[]).filter((r) => r.active).length,
        },
      },
      role,
      new Date().toISOString(),
    );
  }
}
