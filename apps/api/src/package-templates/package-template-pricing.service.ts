import { Injectable } from '@nestjs/common';
import { throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type ComponentEstimate = {
  componentId: string;
  dayNumber: number;
  label: string;
  componentType: string;
  resolved: boolean;
  unitCost: number;
  currency: string | null;
  perPerson: boolean;
  estimatedCost: number;
  note: string;
};

const PER_PERSON_TOKENS = ['PER_PERSON', 'PER_PAX'];

@Injectable()
export class PackageTemplatePricingService {
  constructor(private readonly prisma: PrismaService) {}

  async estimate(packageTemplateId: string, options: { pax?: number } = {}) {
    const template = await (this.prisma as any).packageTemplate.findUnique({
      where: { id: packageTemplateId },
      include: {
        components: {
          where: { active: true },
          orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    });

    throwIfNotFound(template, 'Package template');

    const pax = this.normalizePax(options.pax);
    const components: ComponentEstimate[] = [];

    for (const component of template.components || []) {
      components.push(await this.estimateComponent(component, pax));
    }

    const totalsByCurrency: Record<string, number> = {};
    for (const component of components) {
      if (!component.resolved || !component.currency) {
        continue;
      }
      totalsByCurrency[component.currency] = (totalsByCurrency[component.currency] || 0) + component.estimatedCost;
    }

    const unresolved = components.filter((component) => !component.resolved);

    return {
      packageTemplateId: template.id,
      packageName: template.name,
      pax,
      currencies: Object.keys(totalsByCurrency).sort(),
      totalsByCurrency,
      unresolvedCount: unresolved.length,
      components,
      disclaimer:
        'Indicative only. Costs use the cheapest active rate per linked record at the supplied party size, are not date/occupancy/season specific, and are not converted between currencies.',
    };
  }

  private async estimateComponent(component: any, pax: number): Promise<ComponentEstimate> {
    try {
      switch (component.componentType) {
        case 'HOTEL':
          return this.finalize(component, pax, await this.estimateHotel(component));
        case 'ACTIVITY':
          return this.finalize(component, pax, await this.estimateActivity(component));
        case 'TRANSPORT':
          return this.finalize(component, pax, await this.estimateTransport(component, pax));
        case 'EXCURSION_TEMPLATE':
          return this.finalize(component, pax, await this.estimateExcursionTemplate(component, pax), true);
        case 'EXTERNAL_PACKAGE':
          return this.unresolved(component, 'External package — price supplied by the partner country.');
        default:
          return this.finalize(component, pax, await this.estimateSupplierService(component.supplierServiceId));
      }
    } catch {
      return this.unresolved(component, 'Could not resolve a rate for this component.');
    }
  }

  private async estimateHotel(component: any): Promise<RateResult | null> {
    if (!component.hotelContractId) {
      return null;
    }
    const rate = await (this.prisma as any).hotelRate.findFirst({
      where: { contractId: component.hotelContractId },
      orderBy: { cost: 'asc' },
    });
    if (!rate) {
      return null;
    }
    return {
      unitCost: rate.cost,
      currency: rate.currency,
      perPerson: rate.pricingBasis === 'PER_PERSON',
      note: `Cheapest ${rate.mealPlan}/${rate.occupancyType} night (${rate.seasonName}); per-night, single night assumed.`,
    };
  }

  private async estimateActivity(component: any): Promise<RateResult | null> {
    if (!component.activityId) {
      return null;
    }
    const variant = await (this.prisma as any).activityRateVariant.findFirst({
      where: { activityId: component.activityId, active: true },
      orderBy: { costPrice: 'asc' },
    });
    if (variant) {
      return {
        unitCost: variant.costPrice,
        currency: variant.currency,
        perPerson: this.isPerPerson(variant.pricingBasis),
        note: `Cheapest active rate variant (${variant.name}).`,
      };
    }
    const activity = await (this.prisma as any).activity.findUnique({ where: { id: component.activityId } });
    if (!activity || activity.costPrice == null) {
      return null;
    }
    return {
      unitCost: activity.costPrice,
      currency: activity.currency || 'USD',
      perPerson: this.isPerPerson(activity.pricingBasis),
      note: 'Activity base cost (no rate variant).',
    };
  }

  private async estimateTransport(component: any, pax: number): Promise<RateResult | null> {
    if (component.touringRouteId) {
      const pricing = await (this.prisma as any).touringRoutePricing.findFirst({
        where: { touringRouteId: component.touringRouteId, active: true },
        orderBy: { baseCost: 'asc' },
      });
      if (pricing) {
        return {
          unitCost: pricing.baseCost,
          currency: pricing.currency,
          perPerson: pricing.pricingBasis === 'PER_PERSON',
          note: 'Cheapest active touring-route rate.',
        };
      }
    }
    // The quote engine prices route transport from VehicleRate (TransportPricingService.findMatchingRate):
    // match by service type + party-size band, cheapest fitting vehicle.
    if (component.transportServiceTypeId) {
      const vehicleRate = await (this.prisma as any).vehicleRate.findFirst({
        where: {
          serviceTypeId: component.transportServiceTypeId,
          active: true,
          minPax: { lte: pax },
          maxPax: { gte: pax },
        },
        orderBy: [{ maxPax: 'asc' }, { price: 'asc' }],
      });
      if (vehicleRate) {
        return {
          unitCost: vehicleRate.price,
          currency: vehicleRate.currency,
          perPerson: false,
          note: 'Cheapest active vehicle rate for this service type at this party size (full vehicle).',
        };
      }
    }
    // Legacy route-rule fallback.
    if (component.routeId) {
      const rule = await (this.prisma as any).transportPricingRule.findFirst({
        where: {
          routeId: component.routeId,
          isActive: true,
          ...(component.transportServiceTypeId ? { transportServiceTypeId: component.transportServiceTypeId } : {}),
        },
        orderBy: { baseCost: 'asc' },
      });
      if (rule) {
        const unitCost = rule.baseCost * (1 - (rule.discountPercent || 0) / 100);
        return {
          unitCost,
          currency: rule.currency,
          perPerson: false,
          note: 'Cheapest active transport rate (per vehicle).',
        };
      }
    }
    return null;
  }

  private async estimateExcursionTemplate(component: any, pax: number): Promise<RateResult | null> {
    if (!component.excursionTemplateId) {
      return null;
    }
    const template = await (this.prisma as any).excursionTemplate.findUnique({
      where: { id: component.excursionTemplateId },
      include: { components: { where: { active: true, isOptional: false } } },
    });
    if (!template) {
      return null;
    }

    const subComponents = template.components || [];
    let total = 0;
    let currency: string | null = null;
    let resolvedAny = false;
    let mixedCurrency = false;

    for (const sub of subComponents) {
      const rate = await this.estimateExcursionSubComponent(sub, pax);
      if (!rate || rate.currency == null) {
        continue;
      }
      resolvedAny = true;
      if (currency == null) {
        currency = rate.currency;
      } else if (currency !== rate.currency) {
        mixedCurrency = true;
      }
      total += rate.perPerson ? rate.unitCost * pax : rate.unitCost;
    }

    if (!resolvedAny) {
      return null;
    }

    return {
      unitCost: total,
      currency,
      perPerson: false,
      preComputed: true,
      note: mixedCurrency
        ? 'Sum of required sub-components (mixed currencies — shown in the dominant currency).'
        : 'Sum of required sub-component costs at this party size.',
    };
  }

  private async estimateExcursionSubComponent(sub: any, pax: number): Promise<RateResult | null> {
    if (sub.componentType === 'ACTIVITY') {
      return this.estimateActivity(sub);
    }
    if (sub.componentType === 'TRANSPORT') {
      return this.estimateTransport(sub, pax);
    }
    return this.estimateSupplierService(sub.supplierServiceId);
  }

  private async estimateSupplierService(supplierServiceId: string | null): Promise<RateResult | null> {
    if (!supplierServiceId) {
      return null;
    }
    const service = await (this.prisma as any).supplierService.findUnique({
      where: { id: supplierServiceId },
      include: {
        entranceFee: true,
        ticketRateVariants: { where: { active: true }, orderBy: { costPrice: 'asc' }, take: 1 },
        serviceRates: { orderBy: { costBaseAmount: 'asc' }, take: 1 },
      },
    });
    if (!service) {
      return null;
    }

    if (service.entranceFee) {
      return {
        unitCost: service.entranceFee.foreignerFeeJod,
        currency: 'JOD',
        perPerson: true,
        note: 'Entrance fee (per person).',
      };
    }

    const ticket = service.ticketRateVariants?.[0];
    if (ticket) {
      return {
        unitCost: ticket.costPrice,
        currency: ticket.currency,
        perPerson: this.isPerPerson(ticket.pricingBasis),
        note: 'Cheapest active ticket rate.',
      };
    }

    const serviceRate = service.serviceRates?.[0];
    if (serviceRate) {
      return {
        unitCost: serviceRate.costBaseAmount,
        currency: serviceRate.costCurrency,
        perPerson: this.isPerPerson(serviceRate.pricingMode),
        note: 'Cheapest service rate.',
      };
    }

    if (service.baseCost != null) {
      return {
        unitCost: service.baseCost,
        currency: service.currency,
        perPerson: false,
        note: 'Supplier service base cost.',
      };
    }

    return null;
  }

  private finalize(component: any, pax: number, rate: RateResult | null, isComposite = false): ComponentEstimate {
    if (!rate || rate.currency == null) {
      return this.unresolved(component, isComposite ? 'No priced sub-components on the linked excursion.' : 'No rate is linked to this component yet.');
    }
    const estimatedCost = rate.preComputed ? rate.unitCost : rate.perPerson ? rate.unitCost * pax : rate.unitCost;
    return {
      componentId: component.id,
      dayNumber: component.dayNumber,
      label: component.label,
      componentType: component.componentType,
      resolved: true,
      unitCost: this.round(rate.unitCost),
      currency: rate.currency,
      perPerson: Boolean(rate.perPerson),
      estimatedCost: this.round(estimatedCost),
      note: rate.note,
    };
  }

  private unresolved(component: any, note: string): ComponentEstimate {
    return {
      componentId: component.id,
      dayNumber: component.dayNumber,
      label: component.label,
      componentType: component.componentType,
      resolved: false,
      unitCost: 0,
      currency: null,
      perPerson: false,
      estimatedCost: 0,
      note,
    };
  }

  private isPerPerson(basis: string | null | undefined) {
    return basis ? PER_PERSON_TOKENS.includes(String(basis).toUpperCase()) : false;
  }

  private normalizePax(value: number | undefined) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 1) {
      return 2;
    }
    return Math.min(Math.trunc(numeric), 999);
  }

  private round(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}

type RateResult = {
  unitCost: number;
  currency: string | null;
  perPerson: boolean;
  note: string;
  preComputed?: boolean;
};
