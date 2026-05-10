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
  active?: boolean;
  operationalNotes?: string | null;
  supplierServiceId?: string | null;
  activityId?: string | null;
  routeId?: string | null;
  transportServiceTypeId?: string | null;
  suggestedDepartureCity?: string | null;
  suggestedArrivalCity?: string | null;
  durationMinutes?: number | null;
  requiredArrivalTime?: string | null;
  supplierConfirmationRequired?: boolean | null;
  voucherRequired?: boolean | null;
  pickupNotes?: string | null;
  operationalDependency?: string | null;
  estimatedDurationMinutes?: number | null;
};

type CreateExcursionTemplateInput = {
  name: string;
  code?: string | null;
  description?: string | null;
  defaultDepartureCity?: string | null;
  durationMinutes?: number | null;
  operationalNotes?: string | null;
  operatingDays?: string | null;
  recommendedDepartureTime?: string | null;
  estimatedReturnTime?: string | null;
  minimumPax?: number | null;
  maximumPax?: number | null;
  weatherSensitive?: boolean | null;
  childFriendly?: boolean | null;
  wheelchairAccessible?: boolean | null;
  seasonalRestrictions?: string | null;
  operationalWarnings?: string | null;
  active?: boolean;
  components?: ExcursionTemplateComponentInput[];
};

type UpdateExcursionTemplateInput = Partial<CreateExcursionTemplateInput>;

type ReorderExcursionTemplateComponentsInput = {
  componentIds: string[];
};

type AqabaActivityDefinition = {
  name: string;
  pricingBasis: 'PER_PERSON' | 'PER_GROUP';
  description: string;
  durationMinutes?: number | null;
  notes: string;
  variants: Array<{
    name: string;
    durationMinutes?: number | null;
    pricingBasis?: 'PER_PERSON' | 'PER_GROUP';
    costPrice?: number;
    sellPrice?: number;
    maxPaxPerUnit?: number | null;
    notes?: string | null;
  }>;
};

const COMPONENT_TYPES: ExcursionComponentType[] = ['TRANSPORT', 'TICKET', 'ACTIVITY', 'GUIDE', 'DINING'];
const PRICING_PENDING_NOTE =
  'Pricing pending from Sindbad Aqaba source catalog. Operational record created with 0 cost/sell until commercial values are confirmed.';

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
        operatingDays: normalizeOptionalString(data.operatingDays),
        recommendedDepartureTime: normalizeOptionalString(data.recommendedDepartureTime),
        estimatedReturnTime: normalizeOptionalString(data.estimatedReturnTime),
        minimumPax: this.normalizeOptionalPositiveInteger(data.minimumPax, 'minimumPax'),
        maximumPax: this.normalizeOptionalPositiveInteger(data.maximumPax, 'maximumPax'),
        weatherSensitive: this.normalizeOptionalBoolean(data.weatherSensitive),
        childFriendly: this.normalizeOptionalBoolean(data.childFriendly),
        wheelchairAccessible: this.normalizeOptionalBoolean(data.wheelchairAccessible),
        seasonalRestrictions: normalizeOptionalString(data.seasonalRestrictions),
        operationalWarnings: normalizeOptionalString(data.operationalWarnings),
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
          operatingDays: data.operatingDays === undefined ? undefined : normalizeOptionalString(data.operatingDays),
          recommendedDepartureTime:
            data.recommendedDepartureTime === undefined ? undefined : normalizeOptionalString(data.recommendedDepartureTime),
          estimatedReturnTime: data.estimatedReturnTime === undefined ? undefined : normalizeOptionalString(data.estimatedReturnTime),
          minimumPax: data.minimumPax === undefined ? undefined : this.normalizeOptionalPositiveInteger(data.minimumPax, 'minimumPax'),
          maximumPax: data.maximumPax === undefined ? undefined : this.normalizeOptionalPositiveInteger(data.maximumPax, 'maximumPax'),
          weatherSensitive: data.weatherSensitive === undefined ? undefined : this.normalizeOptionalBoolean(data.weatherSensitive),
          childFriendly: data.childFriendly === undefined ? undefined : this.normalizeOptionalBoolean(data.childFriendly),
          wheelchairAccessible:
            data.wheelchairAccessible === undefined ? undefined : this.normalizeOptionalBoolean(data.wheelchairAccessible),
          seasonalRestrictions:
            data.seasonalRestrictions === undefined ? undefined : normalizeOptionalString(data.seasonalRestrictions),
          operationalWarnings: data.operationalWarnings === undefined ? undefined : normalizeOptionalString(data.operationalWarnings),
          active: data.active === undefined ? undefined : Boolean(data.active),
          components: components === undefined ? undefined : { create: components },
        },
        include: this.templateInclude(),
      });
    });
  }

  async getSuggestedTransport(id: string, pax = 1) {
    const template = await this.findOne(id);
    const transportComponents = (template.components || []).filter(
      (component: any) => component.componentType === 'TRANSPORT' && component.active !== false,
    );
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

  async ensureWadiRumFullDayTemplate() {
    return this.ensureTemplate('WADI_RUM_FULL_DAY', () => this.buildWadiRumFullDayTemplateData());
  }

  async ensureSindbadAqabaCatalog() {
    const supplier = await this.ensureSindbadCompany();
    const activities: Record<string, any> = {};

    for (const definition of this.getSindbadAqabaActivityDefinitions()) {
      activities[definition.name] = await this.ensureAqabaActivity(supplier.id, definition);
    }

    const templates = await Promise.all([
      this.ensureTemplate('AQABA_SNORKELING_DAY', () => this.buildAqabaSnorkelingDayTemplateData(activities)),
      this.ensureTemplate('AQABA_SUNSET_CRUISE', () => this.buildAqabaSunsetCruiseTemplateData(activities)),
      this.ensureTemplate('AQABA_DISCOVER_SCUBA', () => this.buildAqabaDiscoverScubaTemplateData(activities)),
      this.ensureTemplate('AQABA_PRIVATE_BOAT_DAY', () => this.buildAqabaPrivateBoatTemplateData(activities)),
    ]);

    return {
      supplier,
      activities: Object.values(activities),
      templates,
      unresolvedPricing: Object.keys(activities).map((name) => ({ activity: name, reason: PRICING_PENDING_NOTE })),
    };
  }

  async addComponent(templateId: string, data: ExcursionTemplateComponentInput) {
    const template = await this.findOne(templateId);
    const component = (await this.normalizeComponents([
      {
        ...data,
        sortOrder: data.sortOrder ?? (template.components || []).filter((entry: any) => entry.active !== false).length,
      },
    ]))[0];
    this.validateAddedComponentHasLinkedRecord(component);

    await (this.prisma as any).excursionTemplateComponent.create({
      data: {
        ...component,
        templateId,
      },
    });

    return this.findOne(templateId);
  }

  async updateComponent(templateId: string, componentId: string, data: Partial<ExcursionTemplateComponentInput>) {
    await this.ensureComponentBelongsToTemplate(templateId, componentId);
    const updateData: Record<string, unknown> = {};

    if (data.label !== undefined) {
      updateData.label = requireTrimmedString(data.label, 'label');
    }
    if (data.isOptional !== undefined) {
      updateData.isOptional = Boolean(data.isOptional);
    }
    if (data.active !== undefined) {
      updateData.active = Boolean(data.active);
    }
    if (data.operationalNotes !== undefined) {
      updateData.operationalNotes = normalizeOptionalString(data.operationalNotes);
    }
    if (data.durationMinutes !== undefined) {
      updateData.durationMinutes = this.normalizeOptionalPositiveInteger(data.durationMinutes, 'durationMinutes');
    }
    if (data.requiredArrivalTime !== undefined) {
      updateData.requiredArrivalTime = normalizeOptionalString(data.requiredArrivalTime);
    }
    if (data.supplierConfirmationRequired !== undefined) {
      updateData.supplierConfirmationRequired = this.normalizeOptionalBoolean(data.supplierConfirmationRequired);
    }
    if (data.voucherRequired !== undefined) {
      updateData.voucherRequired = this.normalizeOptionalBoolean(data.voucherRequired);
    }
    if (data.pickupNotes !== undefined) {
      updateData.pickupNotes = normalizeOptionalString(data.pickupNotes);
    }
    if (data.operationalDependency !== undefined) {
      updateData.operationalDependency = normalizeOptionalString(data.operationalDependency);
    }
    if (data.estimatedDurationMinutes !== undefined) {
      updateData.estimatedDurationMinutes = this.normalizeOptionalPositiveInteger(
        data.estimatedDurationMinutes,
        'estimatedDurationMinutes',
      );
    }

    await (this.prisma as any).excursionTemplateComponent.update({
      where: { id: componentId },
      data: updateData,
    });

    return this.findOne(templateId);
  }

  async removeComponent(templateId: string, componentId: string) {
    await this.ensureComponentBelongsToTemplate(templateId, componentId);
    await (this.prisma as any).excursionTemplateComponent.update({
      where: { id: componentId },
      data: {
        active: false,
        operationalNotes: 'Soft removed from operational template. Historical row preserved.',
      },
    });

    return this.findOne(templateId);
  }

  async reorderComponents(templateId: string, data: ReorderExcursionTemplateComponentsInput) {
    await this.findOne(templateId);
    const componentIds = Array.isArray(data.componentIds) ? data.componentIds.map((id) => requireTrimmedString(id, 'componentIds[]')) : [];

    if (componentIds.length === 0 || new Set(componentIds).size !== componentIds.length) {
      throw new BadRequestException('componentIds must contain unique component ids');
    }

    const components = await (this.prisma as any).excursionTemplateComponent.findMany({
      where: { templateId, active: true },
      select: { id: true },
    });
    const activeIds = components.map((component: any) => component.id);
    const missing = activeIds.filter((id: string) => !componentIds.includes(id));
    const unknown = componentIds.filter((id) => !activeIds.includes(id));

    if (missing.length > 0 || unknown.length > 0) {
      throw new BadRequestException('componentIds must match the active template components');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of componentIds.entries()) {
        await (tx as any).excursionTemplateComponent.update({
          where: { id },
          data: { sortOrder: index },
        });
      }
    });

    return this.findOne(templateId);
  }

  async fillMissingOperationalMetadata(templateId: string) {
    const template = await this.findOne(templateId);
    const templateUpdate: Record<string, unknown> = {};

    if (this.isBlankValue(template.operationalWarnings)) {
      templateUpdate.operationalWarnings = 'Operational details to confirm before use.';
    }

    const componentUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];

    for (const component of template.components || []) {
      if (component.active === false) {
        continue;
      }

      const data = this.buildMissingComponentOperationalMetadata(template, component);
      if (Object.keys(data).length > 0) {
        componentUpdates.push({ id: component.id, data });
      }
    }

    if (Object.keys(templateUpdate).length === 0 && componentUpdates.length === 0) {
      return this.findOne(templateId);
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(templateUpdate).length > 0) {
        await (tx as any).excursionTemplate.update({
          where: { id: templateId },
          data: templateUpdate,
        });
      }

      for (const update of componentUpdates) {
        await (tx as any).excursionTemplateComponent.update({
          where: { id: update.id },
          data: update.data,
        });
      }
    });

    return this.findOne(templateId);
  }

  private buildMissingComponentOperationalMetadata(template: any, component: any) {
    const data: Record<string, unknown> = {};
    const componentType = component.componentType as ExcursionComponentType;

    if (component.estimatedDurationMinutes === null || component.estimatedDurationMinutes === undefined) {
      const duration = this.resolveComponentEstimatedDuration(component);
      if (duration !== null) {
        data.estimatedDurationMinutes = duration;
      }
    }

    if (this.isBlankValue(component.requiredArrivalTime)) {
      const arrivalTime = this.resolveComponentRequiredArrivalTime(template, componentType);
      if (arrivalTime) {
        data.requiredArrivalTime = arrivalTime;
      }
    }

    if (component.supplierConfirmationRequired === null || component.supplierConfirmationRequired === undefined) {
      const supplierConfirmationRequired = this.resolveComponentSupplierConfirmationRequired(componentType);
      if (supplierConfirmationRequired !== null) {
        data.supplierConfirmationRequired = supplierConfirmationRequired;
      }
    }

    if (component.voucherRequired === null || component.voucherRequired === undefined) {
      data.voucherRequired = true;
    }

    if (this.isBlankValue(component.pickupNotes)) {
      data.pickupNotes = this.resolveComponentPickupNotes(template, componentType);
    }

    if (this.isBlankValue(component.operationalDependency)) {
      data.operationalDependency = this.resolveComponentOperationalDependency(componentType);
    }

    return data;
  }

  private resolveComponentEstimatedDuration(component: any) {
    const duration =
      component.estimatedDurationMinutes ??
      component.durationMinutes ??
      component.route?.durationMinutes ??
      component.activity?.durationMinutes ??
      null;
    const normalized = Number(duration);
    return Number.isFinite(normalized) && normalized > 0 ? Math.floor(normalized) : null;
  }

  private resolveComponentRequiredArrivalTime(template: any, componentType: ExcursionComponentType) {
    if (componentType === 'TRANSPORT' && !this.isBlankValue(template.recommendedDepartureTime)) {
      return String(template.recommendedDepartureTime).trim();
    }

    return 'To confirm';
  }

  private resolveComponentSupplierConfirmationRequired(componentType: ExcursionComponentType) {
    if (componentType === 'TRANSPORT' || componentType === 'ACTIVITY' || componentType === 'GUIDE' || componentType === 'DINING') {
      return true;
    }

    return null;
  }

  private resolveComponentPickupNotes(template: any, componentType: ExcursionComponentType) {
    if (componentType === 'TRANSPORT') {
      return template.defaultDepartureCity
        ? `Pickup from ${template.defaultDepartureCity} to confirm.`
        : 'Pickup location to confirm.';
    }

    if (componentType === 'TICKET') {
      return 'Ticket handoff or entry process to confirm.';
    }

    if (componentType === 'DINING') {
      return 'Restaurant arrival or pickup details to confirm.';
    }

    return 'Meeting point or pickup details to confirm.';
  }

  private resolveComponentOperationalDependency(componentType: ExcursionComponentType) {
    if (componentType === 'TRANSPORT') {
      return 'Requires confirmed route, vehicle, supplier, pickup time, and pax count.';
    }

    if (componentType === 'TICKET') {
      return 'Requires confirmed visit date, pax count, and ticketing rules.';
    }

    if (componentType === 'DINING') {
      return 'Requires confirmed meal time, pax count, and supplier availability.';
    }

    return 'Requires confirmed supplier availability, guide assignment, visit time, and pax count.';
  }

  private isBlankValue(value: unknown) {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
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

  private async buildWadiRumFullDayTemplateData(): Promise<CreateExcursionTemplateInput> {
    const route =
      (await this.findRouteByText(['wadi rum'], ['amman'])) ||
      (await this.findRouteByText(['wadi rum'], ['aqaba'])) ||
      (await this.findRouteByText(['rum'], ['amman', 'aqaba']));
    const transportServiceType = await this.findTransportServiceTypeByText(['full', 'day']);
    const jeepTour = await this.findActivityByText(['wadi rum'], ['jeep tour']);
    const camelRide = await this.findActivityByText(['wadi rum'], ['camel ride']);
    const sunsetExperience = await this.findActivityByText(['wadi rum'], ['sunset']);
    const stargazing = await this.findActivityByText(['wadi rum'], ['stargazing']);
    const dining =
      (await this.findSupplierServiceByText(['wadi rum'], ['bedouin', 'lunch', 'dinner'])) ||
      (await this.findSupplierServiceByText(['bedouin'], ['lunch', 'dinner'])) ||
      (await this.findSupplierServiceByText(['lunch', 'dinner', 'meal'], ['wadi rum']));

    return {
      name: 'Wadi Rum Full Day',
      code: 'WADI_RUM_FULL_DAY',
      description:
        'Reusable operational excursion template for a full-day Wadi Rum program assembled from transport, Activity Master experiences, and optional dining.',
      defaultDepartureCity: 'Amman or Aqaba',
      durationMinutes: 720,
      operationalNotes:
        'Composite template only. Duration is normally 10-12 hours depending departure city and operating plan. Use existing Activity Master records; do not duplicate flat tours.',
      active: true,
      components: [
        {
          componentType: 'TRANSPORT',
          label: 'Transport to Wadi Rum',
          routeId: route?.id ?? null,
          transportServiceTypeId: transportServiceType?.id ?? null,
          suggestedDepartureCity: 'Amman or Aqaba',
          suggestedArrivalCity: 'Wadi Rum',
          durationMinutes: route?.durationMinutes ?? null,
          operationalNotes: route
            ? 'Use existing transport pricing logic for the selected departure city and pax.'
            : 'Placeholder component: link Amman/Aqaba to Wadi Rum route when available.',
        },
        {
          ...this.buildActivityComponent('Wadi Rum Jeep Tour', jeepTour),
          isOptional: false,
          operationalNotes: jeepTour
            ? `Linked to Activity Master: ${jeepTour.name}.`
            : 'Placeholder component: link Wadi Rum Jeep Tour Activity Master when available.',
        },
        {
          ...this.buildActivityComponent('Optional Camel Ride', camelRide),
          isOptional: true,
          operationalNotes: camelRide
            ? `Optional component linked to Activity Master: ${camelRide.name}.`
            : 'Optional placeholder component: link Wadi Rum Camel Ride Activity Master when available.',
        },
        {
          ...this.buildDiningComponent('Optional Bedouin lunch/dinner', dining),
          operationalNotes: dining
            ? 'Optional Bedouin lunch/dinner linked to existing dining/service catalog record.'
            : 'Optional placeholder dining component: Bedouin lunch or dinner in Wadi Rum.',
        },
        {
          ...this.buildActivityComponent('Optional Sunset Experience', sunsetExperience),
          isOptional: true,
          operationalNotes: sunsetExperience
            ? `Optional component linked to Activity Master: ${sunsetExperience.name}.`
            : 'Optional placeholder component: link Wadi Rum sunset Activity Master when available.',
        },
        {
          ...this.buildActivityComponent('Optional Stargazing', stargazing),
          isOptional: true,
          operationalNotes: stargazing
            ? `Optional component linked to Activity Master: ${stargazing.name}.`
            : 'Optional placeholder component: link Wadi Rum Stargazing Experience Activity Master when available.',
        },
      ],
    };
  }

  private async buildAqabaSnorkelingDayTemplateData(activities: Record<string, any>): Promise<CreateExcursionTemplateInput> {
    const route = await this.findRouteByText(['aqaba'], ['city', 'south beach', 'berenice']);
    const transportServiceType = await this.findTransportServiceTypeByText(['full', 'day']);
    const lunch = await this.findSupplierServiceByText(['lunch', 'meal', 'restaurant'], ['aqaba', 'sindbad', 'berenice']);

    return {
      name: 'Aqaba Snorkeling Day Operational Excursion',
      code: 'AQABA_SNORKELING_DAY',
      description: 'Composite Aqaba snorkeling day assembled from transport, Berenice access, snorkeling cruise, and optional lunch.',
      defaultDepartureCity: 'Aqaba',
      durationMinutes: 480,
      operationalNotes: 'Created from Sindbad Aqaba activities catalog as linked operational components; pricing remains on Activity Master variants.',
      active: true,
      components: [
        this.buildAqabaTransportComponent('Aqaba snorkeling day transport', route, transportServiceType),
        this.buildActivityComponent('Berenice Beach Club', activities['Berenice Beach Club']),
        this.buildActivityComponent('Snorkeling Cruise', activities['Snorkeling Cruise']),
        this.buildDiningComponent('Optional lunch', lunch),
      ],
    };
  }

  private async buildAqabaSunsetCruiseTemplateData(activities: Record<string, any>): Promise<CreateExcursionTemplateInput> {
    const route = await this.findRouteByText(['aqaba'], ['city', 'marina', 'port']);
    const transportServiceType = await this.findTransportServiceTypeByText(['full', 'day']);
    const dinner = await this.findSupplierServiceByText(['bbq', 'dinner', 'meal'], ['aqaba', 'sindbad']);

    return {
      name: 'Aqaba Sunset Cruise Operational Excursion',
      code: 'AQABA_SUNSET_CRUISE',
      description: 'Composite Aqaba sunset cruise assembled from transport, sunset cruise activity, and optional BBQ dinner.',
      defaultDepartureCity: 'Aqaba',
      durationMinutes: 240,
      operationalNotes: 'Created from Sindbad Aqaba activities catalog as linked operational components; BBQ can use activity variant or dining service if available.',
      active: true,
      components: [
        this.buildAqabaTransportComponent('Aqaba sunset cruise transport', route, transportServiceType),
        this.buildActivityComponent('Sunset Cruise', activities['Sunset Cruise']),
        this.buildDiningComponent('Optional BBQ dinner', dinner),
      ],
    };
  }

  private async buildAqabaDiscoverScubaTemplateData(activities: Record<string, any>): Promise<CreateExcursionTemplateInput> {
    const route = await this.findRouteByText(['aqaba'], ['city', 'south beach', 'dive']);
    const transportServiceType = await this.findTransportServiceTypeByText(['full', 'day']);
    const lunch = await this.findSupplierServiceByText(['lunch', 'meal', 'restaurant'], ['aqaba', 'sindbad']);

    return {
      name: 'Aqaba Discover Scuba Operational Excursion',
      code: 'AQABA_DISCOVER_SCUBA',
      description: 'Composite Aqaba scuba day assembled from transport, Discover Scuba Diving activity/instructor component, and optional lunch.',
      defaultDepartureCity: 'Aqaba',
      durationMinutes: 480,
      operationalNotes: 'Created from Sindbad Aqaba activities catalog as linked operational components.',
      active: true,
      components: [
        this.buildAqabaTransportComponent('Aqaba scuba day transport', route, transportServiceType),
        this.buildActivityComponent('Discover Scuba Diving', activities['Discover Scuba Diving']),
        {
          ...this.buildActivityComponent('Instructor / scuba activity', activities['Discover Scuba Diving']),
          operationalNotes: 'Instructor/activity component linked to Discover Scuba Diving Activity Master record.',
        },
        this.buildDiningComponent('Optional lunch', lunch),
      ],
    };
  }

  private async buildAqabaPrivateBoatTemplateData(activities: Record<string, any>): Promise<CreateExcursionTemplateInput> {
    const route = await this.findRouteByText(['aqaba'], ['city', 'marina', 'port']);
    const transportServiceType = await this.findTransportServiceTypeByText(['full', 'day']);
    const bbq = await this.findSupplierServiceByText(['bbq', 'meal', 'dinner'], ['aqaba', 'sindbad']);

    return {
      name: 'Aqaba Private Boat Day Operational Excursion',
      code: 'AQABA_PRIVATE_BOAT_DAY',
      description: 'Composite Aqaba private boat day assembled from transport, private boat rental, and optional snorkeling/BBQ components.',
      defaultDepartureCity: 'Aqaba',
      durationMinutes: 480,
      operationalNotes: 'Created from Sindbad Aqaba activities catalog as linked operational components.',
      active: true,
      components: [
        this.buildAqabaTransportComponent('Aqaba private boat transport', route, transportServiceType),
        this.buildActivityComponent('Private Boat Rental', activities['Private Boat Rental']),
        { ...this.buildActivityComponent('Optional snorkeling supplement', activities['Snorkeling Cruise']), isOptional: true },
        this.buildDiningComponent('Optional BBQ supplement', bbq),
      ],
    };
  }

  private buildAqabaTransportComponent(label: string, route: any, transportServiceType: any): ExcursionTemplateComponentInput {
    return {
      componentType: 'TRANSPORT',
      label,
      routeId: route?.id ?? null,
      transportServiceTypeId: transportServiceType?.id ?? null,
      suggestedDepartureCity: 'Aqaba',
      suggestedArrivalCity: 'Aqaba',
      durationMinutes: route?.durationMinutes ?? null,
      operationalNotes: route
        ? 'Use existing transport pricing logic for Aqaba operational movement.'
        : 'Placeholder component: link an Aqaba city/marina/beach route when available.',
    };
  }

  private buildActivityComponent(label: string, activity: any): ExcursionTemplateComponentInput {
    return {
      componentType: 'ACTIVITY',
      label,
      activityId: activity?.id ?? null,
      operationalNotes: activity ? `Linked to Activity Master: ${activity.name}.` : `Placeholder component: ${label} Activity Master record not found.`,
    };
  }

  private buildDiningComponent(label: string, dining: any): ExcursionTemplateComponentInput {
    return {
      componentType: 'DINING',
      label,
      supplierServiceId: dining?.id ?? null,
      isOptional: true,
      operationalNotes: dining ? 'Linked to existing dining/service catalog record.' : `Optional placeholder dining component: ${label}.`,
    };
  }

  private async ensureSindbadCompany() {
    const existing = await this.prisma.company.findFirst({
      where: { name: { equals: 'Sindbad', mode: 'insensitive' } as any },
    } as any);

    if (existing) {
      return existing;
    }

    return this.prisma.company.create({
      data: {
        name: 'Sindbad',
        type: 'supplier',
        country: 'Jordan',
        city: 'Aqaba',
      } as any,
    });
  }

  private async ensureAqabaActivity(supplierCompanyId: string, definition: AqabaActivityDefinition) {
    const existing = await (this.prisma as any).activity.findFirst({
      where: {
        name: { equals: definition.name, mode: 'insensitive' },
        supplierCompanyId,
      },
      include: {
        rateVariants: true,
      },
    });
    const payload = {
      name: definition.name,
      description: `${definition.description} ${definition.notes} ${PRICING_PENDING_NOTE}`,
      supplierCompanyId,
      pricingBasis: definition.pricingBasis,
      costPrice: 0,
      sellPrice: 0,
      durationMinutes: definition.durationMinutes ?? null,
      active: true,
    };

    if (!existing) {
      return (this.prisma as any).activity.create({
        data: {
          ...payload,
          rateVariants: {
            create: definition.variants.map((variant, index) => this.buildAqabaVariantData(definition, variant, index)),
          },
        },
        include: {
          rateVariants: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await this.syncAqabaActivityVariants(tx, existing.id, definition);
      return (tx as any).activity.update({
        where: { id: existing.id },
        data: payload,
        include: {
          rateVariants: {
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });
  }

  private buildAqabaVariantData(
    definition: AqabaActivityDefinition,
    variant: AqabaActivityDefinition['variants'][number],
    index: number,
  ) {
    return {
      name: variant.name,
      durationMinutes: variant.durationMinutes ?? null,
      pricingBasis: variant.pricingBasis || definition.pricingBasis,
      currency: 'JOD',
      costPrice: variant.costPrice ?? 0,
      sellPrice: variant.sellPrice ?? variant.costPrice ?? 0,
      maxPaxPerUnit: variant.maxPaxPerUnit ?? null,
      active: true,
      notes: [variant.notes, variant.costPrice === undefined ? PRICING_PENDING_NOTE : null].filter(Boolean).join(' '),
      sortOrder: index,
    };
  }

  private async syncAqabaActivityVariants(tx: any, activityId: string, definition: AqabaActivityDefinition) {
    const existingVariants = await tx.activityRateVariant.findMany({
      where: { activityId },
      select: { id: true, name: true },
    });
    const existingByName = new Map<string, { id: string; name: string }>(
      existingVariants.map((variant: any) => [String(variant.name).toLowerCase(), variant]),
    );
    const retainedIds = new Set<string>();

    for (const [index, variant] of definition.variants.entries()) {
      const existing = existingByName.get(variant.name.toLowerCase());
      const data = this.buildAqabaVariantData(definition, variant, index);
      if (existing) {
        retainedIds.add(existing.id);
        await tx.activityRateVariant.update({ where: { id: existing.id }, data });
      } else {
        await tx.activityRateVariant.create({ data: { ...data, activityId } });
      }
    }

    const removedIds = existingVariants.map((variant: any) => variant.id).filter((id: string) => !retainedIds.has(id));
    if (removedIds.length > 0) {
      await tx.activityRateVariant.updateMany({ where: { id: { in: removedIds } }, data: { active: false } });
    }
  }

  private getSindbadAqabaActivityDefinitions(): AqabaActivityDefinition[] {
    return [
      {
        name: 'Berenice Beach Club',
        pricingBasis: 'PER_PERSON',
        description: 'Aqaba beach club day-pass experience operated by Sindbad.',
        durationMinutes: 480,
        notes: 'City: Aqaba. Supplier: Sindbad.',
        variants: [
          {
            name: 'Day Pass Adult',
            costPrice: 15,
            sellPrice: 15,
            notes: 'Includes beach club access, transportation, towels.',
          },
          {
            name: 'Day Pass Child',
            costPrice: 10,
            sellPrice: 10,
            notes: 'Includes beach club access, transportation, towels.',
          },
          { name: '3 Day Pass' },
          { name: '4 Day Pass' },
          { name: '6 Day Pass' },
          { name: '8 Day Pass' },
        ],
      },
      {
        name: 'Aqaba Water Sports',
        pricingBasis: 'PER_PERSON',
        description: 'Aqaba water sports experiences operated by Sindbad.',
        notes: 'City: Aqaba. Supplier: Sindbad.',
        variants: [
          { name: 'Banana Boat', durationMinutes: 7, costPrice: 8, sellPrice: 8, notes: 'Minimum 3 persons.' },
          { name: 'Inner Tubes', durationMinutes: 7, costPrice: 9, sellPrice: 9, maxPaxPerUnit: 2, notes: 'Up to 2 persons.' },
          { name: 'Fly Fish', durationMinutes: 7, costPrice: 9, sellPrice: 9, maxPaxPerUnit: 3, notes: 'Up to 3 persons.' },
          { name: 'Water Ski', durationMinutes: 7, costPrice: 18, sellPrice: 18 },
          { name: 'Wakeboarding', durationMinutes: 7, costPrice: 18, sellPrice: 18 },
          { name: 'Knee Boarding', durationMinutes: 7, costPrice: 18, sellPrice: 18 },
          { name: 'Guest on boat during banana/tubes/ski', costPrice: 5, sellPrice: 5 },
        ],
      },
      {
        name: 'Jet Ski',
        pricingBasis: 'PER_PERSON',
        description: 'Aqaba jet ski experience operated by Sindbad.',
        notes: 'City: Aqaba. Supplier: Sindbad. Double rider variants represent shared ride options.',
        variants: [
          { name: '15 min', durationMinutes: 15, costPrice: 30, sellPrice: 30 },
          { name: '30 min', durationMinutes: 30, costPrice: 50, sellPrice: 50 },
          {
            name: '15 min double rider',
            durationMinutes: 15,
            pricingBasis: 'PER_GROUP',
            costPrice: 45,
            sellPrice: 45,
            maxPaxPerUnit: 2,
            notes: 'Price per 2 persons.',
          },
          {
            name: '30 min double rider',
            durationMinutes: 30,
            pricingBasis: 'PER_GROUP',
            costPrice: 75,
            sellPrice: 75,
            maxPaxPerUnit: 2,
            notes: 'Price per 2 persons.',
          },
        ],
      },
      {
        name: 'Parasailing',
        pricingBasis: 'PER_PERSON',
        description: 'Aqaba parasailing experience operated by Sindbad.',
        notes: 'City: Aqaba. Supplier: Sindbad.',
        variants: [
          { name: 'Single', durationMinutes: 15, costPrice: 40, sellPrice: 40, notes: '10-15 min.' },
          { name: 'Tandem', durationMinutes: 15, costPrice: 60, sellPrice: 60, notes: '10-15 min.' },
          { name: 'Triple', durationMinutes: 15, costPrice: 80, sellPrice: 80, notes: '10-15 min.' },
          { name: 'Guest on boat', costPrice: 10, sellPrice: 10 },
        ],
      },
      {
        name: 'Snorkeling Cruise',
        pricingBasis: 'PER_PERSON',
        description: 'Aqaba snorkeling and glass-bottom boat cruise experiences operated by Sindbad.',
        notes: 'City: Aqaba. Supplier: Sindbad. BBQ inclusion applies only to the 4 Hour Snorkeling Cruise BBQ variant.',
        variants: [
          { name: 'Discovery Glass Bottom Boat' },
          { name: '4 Hour Snorkeling Cruise BBQ', durationMinutes: 240, notes: 'Includes BBQ operationally where applicable.' },
          {
            name: 'Red Sea Experience Special Package Adult',
            durationMinutes: 240,
            costPrice: 30,
            sellPrice: 30,
            notes: 'Includes snorkeling kit, towel, open soft drinks and water, Sayadiyah on the beach.',
          },
          {
            name: 'Red Sea Experience Special Package Child',
            durationMinutes: 240,
            costPrice: 19,
            sellPrice: 19,
            notes: 'Includes snorkeling kit, towel, open soft drinks and water, Sayadiyah on the beach.',
          },
          { name: 'BBQ Lunch Supplement', costPrice: 10, sellPrice: 10, notes: 'Supplement for Red Sea Experience Special Package.' },
          { name: 'Snorkeling', costPrice: 30, sellPrice: 30 },
        ],
      },
      {
        name: 'Sunset Cruise',
        pricingBasis: 'PER_PERSON',
        description: 'Aqaba sunset cruise experiences operated by Sindbad.',
        notes: 'City: Aqaba. Supplier: Sindbad.',
        variants: [
          { name: 'Sunset Cruise' },
          { name: 'Sunset BBQ Cruise', notes: 'BBQ included operationally where applicable.' },
        ],
      },
      {
        name: 'Discover Scuba Diving',
        pricingBasis: 'PER_PERSON',
        description: 'Aqaba scuba diving and diving course experiences operated by Sindbad.',
        notes: 'City: Aqaba. Supplier: Sindbad. Instructor/dive inclusions should be confirmed against final catalog terms.',
        variants: [
          { name: 'Discover Scuba Diving', costPrice: 50, sellPrice: 50 },
          { name: 'DSD 1 Dive', costPrice: 50, sellPrice: 50 },
          { name: 'DSD 2 Dives', costPrice: 90, sellPrice: 90 },
          { name: 'Leisure Diving 2 Dives', costPrice: 60, sellPrice: 60, notes: 'Certified divers only.' },
          { name: 'Scuba Diver Course', costPrice: 200, sellPrice: 200 },
          { name: 'Open Water Course', costPrice: 300, sellPrice: 300 },
        ],
      },
      {
        name: 'Private Boat Rental',
        pricingBasis: 'PER_GROUP',
        description: 'Aqaba private boat rental options operated by Sindbad.',
        notes: 'City: Aqaba. Supplier: Sindbad.',
        variants: [
          {
            name: 'Sindbad Motor Boat',
            durationMinutes: 120,
            pricingBasis: 'PER_GROUP',
            costPrice: 200,
            sellPrice: 200,
            maxPaxPerUnit: 50,
            notes: 'Capacity 50. Extra sailing hour 80 JOD. Extra anchoring hour 30 JOD.',
          },
          {
            name: 'Discovery Glass Bottom Boat',
            durationMinutes: 120,
            pricingBasis: 'PER_GROUP',
            costPrice: 200,
            sellPrice: 200,
            maxPaxPerUnit: 45,
            notes: 'Capacity 45. Extra sailing hour 80 JOD. Extra anchoring hour 30 JOD.',
          },
          {
            name: 'Scuba Diving Boat',
            durationMinutes: 120,
            pricingBasis: 'PER_GROUP',
            costPrice: 200,
            sellPrice: 200,
            maxPaxPerUnit: 35,
            notes: 'Capacity 35. Extra sailing hour 80 JOD. Extra anchoring hour 30 JOD.',
          },
          {
            name: 'Al Azem Fishing Boat',
            durationMinutes: 120,
            pricingBasis: 'PER_GROUP',
            costPrice: 200,
            sellPrice: 200,
            maxPaxPerUnit: 7,
            notes: 'Capacity 7. Extra sailing hour 80 JOD. Extra anchoring hour 30 JOD.',
          },
          {
            name: 'Aladdin Sailing Ketch',
            durationMinutes: 120,
            pricingBasis: 'PER_GROUP',
            costPrice: 300,
            sellPrice: 300,
            maxPaxPerUnit: 90,
            notes: 'Capacity 70-90. Extra sailing hour 90 JOD. Extra anchoring hour 40 JOD.',
          },
          {
            name: 'Speed Boat up to 6 persons',
            durationMinutes: 15,
            pricingBasis: 'PER_GROUP',
            costPrice: 35,
            sellPrice: 35,
            maxPaxPerUnit: 6,
            notes: 'Boat charter.',
          },
          {
            name: 'Speed Boat up to 12 persons',
            durationMinutes: 15,
            pricingBasis: 'PER_GROUP',
            costPrice: 50,
            sellPrice: 50,
            maxPaxPerUnit: 12,
            notes: 'Boat charter.',
          },
        ],
      },
      {
        name: 'Aqaba Beach Kitchen Experience',
        pricingBasis: 'PER_PERSON',
        description: 'Aqaba beach kitchen cultural dining/activity experience operated by Sindbad.',
        notes:
          'City: Aqaba. Supplier: Sindbad. Includes fish/vegetable market visit, cooking experience, lunch, transportation from hotel to local market and Berenice Beach Club, day pass, soft drink and water.',
        variants: [
          {
            name: '4 guests and over',
            costPrice: 40,
            sellPrice: 40,
            notes:
              'Per person. Includes fish/vegetable market visit, cooking experience, lunch, transportation, Berenice day pass, soft drink and water.',
          },
          {
            name: '8 guests and over',
            costPrice: 35,
            sellPrice: 35,
            notes:
              'Per person. Includes fish/vegetable market visit, cooking experience, lunch, transportation, Berenice day pass, soft drink and water.',
          },
        ],
      },
    ];
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
          active: component.active === undefined ? true : Boolean(component.active),
          operationalNotes: normalizeOptionalString(component.operationalNotes),
          supplierServiceId: normalizeOptionalString(component.supplierServiceId),
          activityId: normalizeOptionalString(component.activityId),
          routeId: normalizeOptionalString(component.routeId),
          transportServiceTypeId: normalizeOptionalString(component.transportServiceTypeId),
          suggestedDepartureCity: normalizeOptionalString(component.suggestedDepartureCity),
          suggestedArrivalCity: normalizeOptionalString(component.suggestedArrivalCity),
          durationMinutes: this.normalizeOptionalPositiveInteger(component.durationMinutes, `components[${index}].durationMinutes`),
          requiredArrivalTime: normalizeOptionalString(component.requiredArrivalTime),
          supplierConfirmationRequired: this.normalizeOptionalBoolean(component.supplierConfirmationRequired),
          voucherRequired: this.normalizeOptionalBoolean(component.voucherRequired),
          pickupNotes: normalizeOptionalString(component.pickupNotes),
          operationalDependency: normalizeOptionalString(component.operationalDependency),
          estimatedDurationMinutes: this.normalizeOptionalPositiveInteger(
            component.estimatedDurationMinutes,
            `components[${index}].estimatedDurationMinutes`,
          ),
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
    if (component.activityId && componentType !== 'ACTIVITY' && componentType !== 'GUIDE') {
      throw new BadRequestException(`components[${index}].activityId is only allowed for ACTIVITY or GUIDE components`);
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

  private async ensureComponentBelongsToTemplate(templateId: string, componentId: string) {
    const component = await (this.prisma as any).excursionTemplateComponent.findFirst({
      where: { id: componentId, templateId },
      select: { id: true },
    });
    if (!component) {
      throw new BadRequestException('Excursion template component was not found');
    }
  }

  private validateAddedComponentHasLinkedRecord(component: ExcursionTemplateComponentInput) {
    if (component.componentType === 'TRANSPORT' && (!component.routeId || !component.transportServiceTypeId)) {
      throw new BadRequestException('TRANSPORT components must link an existing route and transport service type');
    }
    if ((component.componentType === 'ACTIVITY' || component.componentType === 'GUIDE') && !component.activityId) {
      throw new BadRequestException('ACTIVITY and GUIDE components must link an existing Activity Master record');
    }
    if ((component.componentType === 'TICKET' || component.componentType === 'DINING') && !component.supplierServiceId) {
      throw new BadRequestException('TICKET and DINING components must link an existing service catalog record');
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

  private normalizeOptionalBoolean(value: boolean | null | undefined | '') {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    return Boolean(value);
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
