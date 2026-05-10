import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type ExcursionComponentType = 'TRANSPORT' | 'TICKET' | 'ACTIVITY' | 'GUIDE' | 'DINING';

type ExcursionTemplateComponentInput = {
  id?: string | null;
  componentType: ExcursionComponentType;
  label: string;
  sortOrder?: number | null;
  isOptional?: boolean;
  operationalNotes?: string | null;
  supplierServiceId?: string | null;
  activityId?: string | null;
  routeId?: string | null;
  transportServiceTypeId?: string | null;
  suggestedDepartureCity?: string | null;
  suggestedArrivalCity?: string | null;
  durationMinutes?: number | null;
};

type CreateExcursionTemplateInput = {
  name: string;
  code?: string | null;
  description?: string | null;
  defaultDepartureCity?: string | null;
  durationMinutes?: number | null;
  operationalNotes?: string | null;
  active?: boolean;
  components?: ExcursionTemplateComponentInput[];
};

type UpdateExcursionTemplateInput = Partial<CreateExcursionTemplateInput>;

const COMPONENT_TYPES: ExcursionComponentType[] = ['TRANSPORT', 'TICKET', 'ACTIVITY', 'GUIDE', 'DINING'];

@Injectable()
export class ExcursionTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return (this.prisma as any).excursionTemplate.findMany({
      include: this.templateInclude(),
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const template = await (this.prisma as any).excursionTemplate.findUnique({
      where: { id },
      include: this.templateInclude(),
    });

    return throwIfNotFound(template, 'Excursion template');
  }

  async findByCode(code: string) {
    const template = await (this.prisma as any).excursionTemplate.findUnique({
      where: { code: requireTrimmedString(code, 'code') },
      include: this.templateInclude(),
    });

    return throwIfNotFound(template, 'Excursion template');
  }

  async create(data: CreateExcursionTemplateInput) {
    const components = await this.normalizeComponents(data.components || []);

    return (this.prisma as any).excursionTemplate.create({
      data: {
        name: requireTrimmedString(data.name, 'name'),
        code: normalizeOptionalString(data.code),
        description: normalizeOptionalString(data.description),
        defaultDepartureCity: normalizeOptionalString(data.defaultDepartureCity),
        durationMinutes: this.normalizeOptionalPositiveInteger(data.durationMinutes, 'durationMinutes'),
        operationalNotes: normalizeOptionalString(data.operationalNotes),
        active: data.active === undefined ? true : Boolean(data.active),
        components: {
          create: components,
        },
      },
      include: this.templateInclude(),
    });
  }

  async update(id: string, data: UpdateExcursionTemplateInput) {
    await this.findOne(id);
    const components = data.components === undefined ? undefined : await this.normalizeComponents(data.components);

    return this.prisma.$transaction(async (tx) => {
      if (components !== undefined) {
        await (tx as any).excursionTemplateComponent.deleteMany({ where: { templateId: id } });
      }

      return (tx as any).excursionTemplate.update({
        where: { id },
        data: {
          name: data.name === undefined ? undefined : requireTrimmedString(data.name, 'name'),
          code: data.code === undefined ? undefined : normalizeOptionalString(data.code),
          description: data.description === undefined ? undefined : normalizeOptionalString(data.description),
          defaultDepartureCity:
            data.defaultDepartureCity === undefined ? undefined : normalizeOptionalString(data.defaultDepartureCity),
          durationMinutes:
            data.durationMinutes === undefined ? undefined : this.normalizeOptionalPositiveInteger(data.durationMinutes, 'durationMinutes'),
          operationalNotes: data.operationalNotes === undefined ? undefined : normalizeOptionalString(data.operationalNotes),
          active: data.active === undefined ? undefined : Boolean(data.active),
          components: components === undefined ? undefined : { create: components },
        },
        include: this.templateInclude(),
      });
    });
  }

  async getSuggestedTransport(id: string, pax = 1) {
    const template = await this.findOne(id);
    const transportComponents = (template.components || []).filter((component: any) => component.componentType === 'TRANSPORT');
    const suggestions = [];

    for (const component of transportComponents) {
      if (!component.routeId || !component.transportServiceTypeId) {
        suggestions.push({
          componentId: component.id,
          label: component.label,
          routeId: component.routeId,
          transportServiceTypeId: component.transportServiceTypeId,
          candidates: [],
          reason: 'Transport route or service type is not linked yet',
        });
        continue;
      }

      const candidates = await this.prisma.transportPricingRule.findMany({
        where: {
          routeId: component.routeId,
          transportServiceTypeId: component.transportServiceTypeId,
          isActive: true,
          minPax: { lte: Math.max(1, pax) },
          maxPax: { gte: Math.max(1, pax) },
        },
        include: {
          route: true,
          supplier: true,
          transportServiceType: true,
          vehicle: true,
        },
        orderBy: [{ baseCost: 'asc' }, { vehicleId: 'asc' }],
        take: 10,
      });

      suggestions.push({
        componentId: component.id,
        label: component.label,
        routeId: component.routeId,
        transportServiceTypeId: component.transportServiceTypeId,
        candidates,
      });
    }

    return { templateId: template.id, pax: Math.max(1, pax), suggestions };
  }

  async ensurePetraFullDayTemplate() {
    return this.ensureTemplate('PETRA_FULL_DAY', () => this.buildPetraFullDayTemplateData());
  }

  async ensureJerashAmmanFullDayTemplate() {
    return this.ensureTemplate('JERASH_AMMAN_FULL_DAY', () => this.buildJerashAmmanFullDayTemplateData());
  }

  async ensureDeadSeaEscapeTemplate() {
    return this.ensureTemplate('DEAD_SEA_ESCAPE', () => this.buildDeadSeaEscapeTemplateData());
  }

  private async ensureTemplate(code: string, buildData: () => Promise<CreateExcursionTemplateInput>) {
    const existing = await (this.prisma as any).excursionTemplate.findUnique({ where: { code } });
    const data = await buildData();
    return existing ? this.update(existing.id, data) : this.create(data);
  }

  private async buildPetraFullDayTemplateData(): Promise<CreateExcursionTemplateInput> {
    const petraTicket = await this.findSupplierServiceByText(['petra'], ['ticket', 'entrance']);
    const guide = await this.findSupplierServiceByText(['guide'], ['petra', 'full']);
    const dining = await this.findSupplierServiceByText(['lunch', 'meal', 'restaurant'], ['petra']);
    const activity = await this.findActivityByText(['petra'], ['guided', 'experience']);
    const route = await this.findRouteByText(['amman'], ['petra']);
    const transportServiceType = await this.findTransportServiceTypeByText(['full', 'day']);

    return {
      name: 'Petra Full Day Operational Excursion',
      code: 'PETRA_FULL_DAY',
      description: 'Reusable operational excursion template for a full-day Petra visit assembled from transport, ticketing, guide/activity, and dining components.',
      defaultDepartureCity: 'Amman',
      durationMinutes: 720,
      operationalNotes:
        'Composite template only. Pricing and operations should resolve through linked transport, ticketing, guide/activity, and dining records.',
      active: true,
      components: [
        {
          componentType: 'TRANSPORT',
          label: 'Round-trip transport to Petra',
          routeId: route?.id ?? null,
          transportServiceTypeId: transportServiceType?.id ?? null,
          suggestedDepartureCity: 'Amman',
          suggestedArrivalCity: 'Petra',
          durationMinutes: route?.durationMinutes ?? null,
          operationalNotes: 'Use existing transport pricing logic for vehicle and pax selection.',
        },
        {
          componentType: 'TICKET',
          label: 'Petra entrance ticket',
          supplierServiceId: petraTicket?.id ?? null,
          operationalNotes: 'Use existing ticketing/Jordan Pass handling. Do not model as an activity.',
        },
        {
          componentType: activity ? 'ACTIVITY' : 'GUIDE',
          label: activity ? 'Petra guided experience' : 'Petra local guide',
          activityId: activity?.id ?? null,
          supplierServiceId: activity ? null : guide?.id ?? null,
          isOptional: false,
          operationalNotes: 'Guide/activity component for on-site interpretation.',
        },
        {
          componentType: 'DINING',
          label: 'Lunch in Petra area',
          supplierServiceId: dining?.id ?? null,
          isOptional: true,
          operationalNotes: 'Optional dining component; resolve through meal/dining service catalog when available.',
        },
      ],
    };
  }

  private async buildJerashAmmanFullDayTemplateData(): Promise<CreateExcursionTemplateInput> {
    const route = await this.findRouteByText(['amman'], ['jerash']);
    const transportServiceType = await this.findTransportServiceTypeByText(['full', 'day']);
    const jerashTicket = await this.findSupplierServiceByText(['jerash'], ['ticket', 'entrance']);
    const guide = await this.findSupplierServiceByText(['jerash', 'amman'], ['guide', 'interpretation']);
    const jerashActivity = await this.findActivityByText(['jerash', 'amman'], ['guide', 'guided', 'interpretation', 'city']);
    const ammanTicket = await this.findSupplierServiceByText(['citadel', 'roman theatre', 'roman theater'], ['amman', 'ticket', 'entrance']);
    const dining = await this.findSupplierServiceByText(['lunch', 'meal', 'restaurant'], ['amman', 'jerash']);

    return {
      name: 'Jerash & Amman Operational Excursion',
      code: 'JERASH_AMMAN_FULL_DAY',
      description:
        'Reusable operational excursion template for a full-day Jerash and Amman program assembled from transport, ticketing, guide/activity, and dining components.',
      defaultDepartureCity: 'Amman',
      durationMinutes: 480,
      operationalNotes:
        'Composite template only. Link Jerash and Amman ticketing, interpretation, dining, and transport records as operational catalogs mature.',
      active: true,
      components: [
        {
          componentType: 'TRANSPORT',
          label: 'Amman to Jerash and Amman city transport',
          routeId: route?.id ?? null,
          transportServiceTypeId: transportServiceType?.id ?? null,
          suggestedDepartureCity: 'Amman',
          suggestedArrivalCity: 'Jerash / Amman',
          durationMinutes: route?.durationMinutes ?? null,
          operationalNotes:
            'Suggested route is Amman to Jerash to Amman city return. Use existing transport pricing logic where a matching route exists.',
        },
        {
          componentType: 'TICKET',
          label: 'Jerash entrance ticket',
          supplierServiceId: jerashTicket?.id ?? null,
          operationalNotes: jerashTicket
            ? 'Linked to existing Jerash entrance ticket service.'
            : 'Placeholder component: link an existing Jerash entrance ticket when available.',
        },
        {
          componentType: jerashActivity ? 'ACTIVITY' : 'GUIDE',
          label: jerashActivity ? 'Jerash and Amman interpretation' : 'Jerash local guide / Amman city interpretation',
          activityId: jerashActivity?.id ?? null,
          supplierServiceId: jerashActivity ? null : guide?.id ?? null,
          operationalNotes: jerashActivity || guide
            ? 'Interpretation component linked to an existing catalog record.'
            : 'Placeholder component: link Jerash guide and Amman city interpretation when available.',
        },
        {
          componentType: 'TICKET',
          label: 'Amman Citadel / Roman Theatre ticket',
          supplierServiceId: ammanTicket?.id ?? null,
          operationalNotes: ammanTicket
            ? 'Linked to existing Amman Citadel / Roman Theatre ticket service.'
            : 'Placeholder component: link Amman Citadel or Roman Theatre ticketing if used operationally.',
        },
        {
          componentType: 'DINING',
          label: 'Lunch in Amman or Jerash area',
          supplierServiceId: dining?.id ?? null,
          isOptional: true,
          operationalNotes: dining
            ? 'Optional dining component linked to an existing meal service.'
            : 'Optional placeholder dining component for Amman/Jerash lunch.',
        },
      ],
    };
  }

  private async buildDeadSeaEscapeTemplateData(): Promise<CreateExcursionTemplateInput> {
    const route = await this.findRouteByText(['amman'], ['dead sea']);
    const transportServiceType = await this.findTransportServiceTypeByText(['full', 'day']);
    const dayAccessService = await this.findSupplierServiceByText(['dead sea'], ['beach', 'club', 'resort', 'day access']);
    const dayAccessActivity = await this.findActivityByText(['dead sea'], ['beach', 'club', 'resort', 'day access']);
    const spaActivity = await this.findActivityByText(['dead sea'], ['spa', 'mud']);
    const spaService = await this.findSupplierServiceByText(['dead sea'], ['spa', 'mud']);
    const dining = await this.findSupplierServiceByText(['lunch', 'meal', 'restaurant'], ['dead sea']);

    return {
      name: 'Dead Sea Escape Operational Excursion',
      code: 'DEAD_SEA_ESCAPE',
      description:
        'Reusable operational excursion template for a Dead Sea day program assembled from transport, day access/activity, optional spa, and dining components.',
      defaultDepartureCity: 'Amman',
      durationMinutes: 480,
      operationalNotes:
        'Composite template only. Use existing transport and activity/dining records; leave unresolved components as operational placeholders until catalog records exist.',
      active: true,
      components: [
        {
          componentType: 'TRANSPORT',
          label: 'Amman to Dead Sea return transport',
          routeId: route?.id ?? null,
          transportServiceTypeId: transportServiceType?.id ?? null,
          suggestedDepartureCity: 'Amman',
          suggestedArrivalCity: 'Dead Sea',
          durationMinutes: route?.durationMinutes ?? null,
          operationalNotes: 'Use existing transport pricing logic for Amman to Dead Sea return service.',
        },
        {
          componentType: dayAccessActivity ? 'ACTIVITY' : 'DINING',
          label: dayAccessActivity ? 'Dead Sea beach club / resort day access' : 'Dead Sea beach club / resort day access',
          activityId: dayAccessActivity?.id ?? null,
          supplierServiceId: dayAccessActivity ? null : dayAccessService?.id ?? null,
          operationalNotes: dayAccessActivity || dayAccessService
            ? 'Linked to an existing Dead Sea beach club or resort day access record.'
            : 'Placeholder component: link beach club or resort day access when available.',
        },
        {
          componentType: 'ACTIVITY',
          label: 'Spa or mud experience',
          activityId: spaActivity?.id ?? null,
          supplierServiceId: spaActivity ? null : spaService?.id ?? null,
          isOptional: true,
          operationalNotes: spaActivity || spaService
            ? 'Optional spa/mud component linked to an existing catalog record.'
            : 'Optional placeholder component for Dead Sea spa or mud experience.',
        },
        {
          componentType: 'DINING',
          label: 'Lunch at Dead Sea area',
          supplierServiceId: dining?.id ?? null,
          isOptional: true,
          operationalNotes: dining ? 'Optional dining component linked to an existing meal service.' : 'Optional placeholder dining component.',
        },
      ],
    };
  }

  private templateInclude() {
    return {
      components: {
        include: {
          activity: true,
          route: {
            include: {
              fromPlace: true,
              toPlace: true,
            },
          },
          supplierService: {
            include: {
              serviceType: true,
              entranceFee: true,
              ticketRateVariants: {
                orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
              },
            },
          },
          transportServiceType: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    };
  }

  private async normalizeComponents(components: ExcursionTemplateComponentInput[]) {
    return Promise.all(
      components.map(async (component, index) => {
        const componentType = this.normalizeComponentType(component.componentType, index);
        await this.validateComponentReferences(componentType, component, index);
        return {
          componentType,
          label: requireTrimmedString(component.label, `components[${index}].label`),
          sortOrder: component.sortOrder === undefined || component.sortOrder === null ? index : Math.floor(Number(component.sortOrder)),
          isOptional: component.isOptional === undefined ? false : Boolean(component.isOptional),
          operationalNotes: normalizeOptionalString(component.operationalNotes),
          supplierServiceId: normalizeOptionalString(component.supplierServiceId),
          activityId: normalizeOptionalString(component.activityId),
          routeId: normalizeOptionalString(component.routeId),
          transportServiceTypeId: normalizeOptionalString(component.transportServiceTypeId),
          suggestedDepartureCity: normalizeOptionalString(component.suggestedDepartureCity),
          suggestedArrivalCity: normalizeOptionalString(component.suggestedArrivalCity),
          durationMinutes: this.normalizeOptionalPositiveInteger(component.durationMinutes, `components[${index}].durationMinutes`),
        };
      }),
    );
  }

  private normalizeComponentType(value: string, index: number): ExcursionComponentType {
    const normalized = String(value || '').trim().toUpperCase() as ExcursionComponentType;
    if (!COMPONENT_TYPES.includes(normalized)) {
      throw new BadRequestException(`components[${index}].componentType must be TRANSPORT, TICKET, ACTIVITY, GUIDE, or DINING`);
    }
    return normalized;
  }

  private async validateComponentReferences(componentType: ExcursionComponentType, component: ExcursionTemplateComponentInput, index: number) {
    if (component.activityId && componentType !== 'ACTIVITY') {
      throw new BadRequestException(`components[${index}].activityId is only allowed for ACTIVITY components`);
    }
    if ((component.routeId || component.transportServiceTypeId) && componentType !== 'TRANSPORT') {
      throw new BadRequestException(`components[${index}] transport references are only allowed for TRANSPORT components`);
    }

    if (component.activityId) {
      await this.ensureActivityExists(component.activityId, index);
    }
    if (component.supplierServiceId) {
      await this.ensureSupplierServiceExists(component.supplierServiceId, index);
    }
    if (component.routeId) {
      await this.ensureRouteExists(component.routeId, index);
    }
    if (component.transportServiceTypeId) {
      await this.ensureTransportServiceTypeExists(component.transportServiceTypeId, index);
    }
  }

  private async ensureActivityExists(id: string, index: number) {
    const activity = await (this.prisma as any).activity.findUnique({ where: { id }, select: { id: true } });
    if (!activity) {
      throw new BadRequestException(`components[${index}].activityId was not found`);
    }
  }

  private async ensureSupplierServiceExists(id: string, index: number) {
    const service = await this.prisma.supplierService.findUnique({ where: { id }, select: { id: true } });
    if (!service) {
      throw new BadRequestException(`components[${index}].supplierServiceId was not found`);
    }
  }

  private async ensureRouteExists(id: string, index: number) {
    const route = await this.prisma.route.findUnique({ where: { id }, select: { id: true } });
    if (!route) {
      throw new BadRequestException(`components[${index}].routeId was not found`);
    }
  }

  private async ensureTransportServiceTypeExists(id: string, index: number) {
    const serviceType = await this.prisma.transportServiceType.findUnique({ where: { id }, select: { id: true } });
    if (!serviceType) {
      throw new BadRequestException(`components[${index}].transportServiceTypeId was not found`);
    }
  }

  private normalizeOptionalPositiveInteger(value: number | null | undefined, fieldLabel: string) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException(`${fieldLabel} must be zero or greater`);
    }
    return Math.floor(normalized);
  }

  private async findSupplierServiceByText(primaryTerms: string[], secondaryTerms: string[] = []) {
    const services = await this.prisma.supplierService.findMany({
      include: { serviceType: true, entranceFee: true },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return services.find((service) => this.matchesText(service, primaryTerms) && this.matchesText(service, secondaryTerms)) || null;
  }

  private async findActivityByText(primaryTerms: string[], secondaryTerms: string[] = []) {
    const activities = await (this.prisma as any).activity.findMany({ orderBy: [{ createdAt: 'desc' }], take: 200 });
    return activities.find((activity: any) => this.matchesText(activity, primaryTerms) && this.matchesText(activity, secondaryTerms)) || null;
  }

  private async findRouteByText(primaryTerms: string[], secondaryTerms: string[] = []) {
    const routes = await this.prisma.route.findMany({ orderBy: [{ createdAt: 'desc' }], take: 200 });
    return routes.find((route) => this.matchesText(route, primaryTerms) && this.matchesText(route, secondaryTerms)) || null;
  }

  private async findTransportServiceTypeByText(terms: string[]) {
    const types = await this.prisma.transportServiceType.findMany({ orderBy: [{ createdAt: 'desc' }] });
    return types.find((type) => this.matchesText(type, terms)) || types.find((type) => type.classification === 'FULL_DAY') || null;
  }

  private matchesText(record: Record<string, unknown>, terms: string[]) {
    if (terms.length === 0) {
      return true;
    }
    const text = this.collectText(record).toLowerCase();
    return terms.some((term) => text.includes(term.toLowerCase()));
  }

  private collectText(value: unknown, depth = 0, seen = new Set<unknown>()): string {
    if (typeof value === 'string') {
      return value;
    }
    if (!value || typeof value !== 'object' || depth > 2 || seen.has(value)) {
      return '';
    }
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => this.collectText(item, depth + 1, seen)).join(' ');
    }
    return Object.values(value)
      .map((item) => this.collectText(item, depth + 1, seen))
      .join(' ');
  }
}
