import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type PackageTemplateComponentType =
  | 'EXCURSION_TEMPLATE'
  | 'ACTIVITY'
  | 'HOTEL'
  | 'TRANSPORT'
  | 'DINING'
  | 'MEAL'
  | 'TICKET'
  | 'ENTRANCE'
  | 'GUIDE'
  | 'SERVICE'
  | 'OTHER'
  | 'EXTERNAL_PACKAGE';

type CreatePackageTemplateInput = {
  name: string;
  durationDays: number;
  code?: string | null;
  targetMarket?: string | null;
  season?: string | null;
  summary?: string | null;
  destination?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  hotelCategoryNotes?: string | null;
  guideRules?: string | null;
  categoryTags?: unknown;
  active?: boolean;
  operationalNotes?: string | null;
};

type UpdatePackageTemplateInput = Partial<CreatePackageTemplateInput>;

type PackageTemplateComponentInput = {
  componentType: PackageTemplateComponentType;
  dayNumber: number;
  label: string;
  sortOrder?: number | null;
  isOptional?: boolean;
  active?: boolean;
  operationalNotes?: string | null;
  excursionTemplateId?: string | null;
  activityId?: string | null;
  hotelContractId?: string | null;
  routeId?: string | null;
  touringRouteId?: string | null;
  transportServiceTypeId?: string | null;
  pricingMode?: string | null;
  supplierServiceId?: string | null;
};

type PackageTemplateDayInput = {
  title?: string | null;
  description?: string | null;
  active?: boolean;
};

type ReorderDaysInput = {
  orderedDayIds: string[];
};

type InsertDayInput = {
  afterDayNumber?: number | null;
};

type ReorderComponentsInput = {
  orderedComponentIds: string[];
};

const COMPONENT_TYPES: PackageTemplateComponentType[] = [
  'EXCURSION_TEMPLATE',
  'ACTIVITY',
  'HOTEL',
  'TRANSPORT',
  'DINING',
  'MEAL',
  'TICKET',
  'ENTRANCE',
  'GUIDE',
  'SERVICE',
  'OTHER',
  'EXTERNAL_PACKAGE',
];

@Injectable()
export class PackageTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return (this.prisma as any).packageTemplate.findMany({
      include: this.packageInclude(),
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const template = await (this.prisma as any).packageTemplate.findUnique({
      where: { id },
      include: this.packageInclude(),
    });

    return throwIfNotFound(template, 'Package template');
  }

  create(data: CreatePackageTemplateInput) {
    const durationDays = this.normalizePositiveInteger(data.durationDays, 'durationDays');
    const templateData = {
      ...this.buildTemplateData(data, false),
      durationDays,
    };

    return (this.prisma as any).packageTemplate.create({
      data: {
        ...templateData,
        days: {
          create: this.buildDefaultDays(durationDays),
        },
      },
      include: this.packageInclude(),
    });
  }

  async createFromQuote(quoteId: string, overrides: { name?: string | null } = {}) {
    if (!String(quoteId || '').trim()) {
      throw new BadRequestException('quoteId is required');
    }

    const quote = await (this.prisma as any).quote.findUnique({
      where: { id: quoteId },
      include: {
        itineraryDays: {
          where: { isActive: true },
          orderBy: [{ dayNumber: 'asc' }],
          include: {
            dayItems: {
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }],
              include: {
                quoteService: {
                  include: {
                    activity: true,
                    contract: { include: { hotel: true } },
                    service: { include: { serviceType: true, entranceFee: true } },
                    touringRoute: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    throwIfNotFound(quote, 'Quote');

    const activeDays = quote.itineraryDays || [];
    if (activeDays.length === 0) {
      throw new BadRequestException('This quote has no active itinerary days to convert into a template.');
    }

    const durationDays = Math.max(...activeDays.map((day: any) => day.dayNumber), activeDays.length, 1);
    const dayByNumber = new Map<number, any>(activeDays.map((day: any) => [day.dayNumber, day]));
    const name = requireTrimmedString(overrides.name || `${quote.title} (template)`, 'name');

    const created = await (this.prisma as any).$transaction(async (tx: any) => {
      const template = await tx.packageTemplate.create({
        data: {
          name,
          durationDays,
          summary: normalizeOptionalString(quote.description),
          inclusions: normalizeOptionalString(quote.inclusionsText),
          exclusions: normalizeOptionalString(quote.exclusionsText),
          active: false,
        },
      });

      for (let dayNumber = 1; dayNumber <= durationDays; dayNumber += 1) {
        const sourceDay = dayByNumber.get(dayNumber);
        const day = await tx.packageTemplateDay.create({
          data: {
            packageTemplateId: template.id,
            dayNumber,
            title: sourceDay?.title || `Day ${dayNumber}`,
            description: normalizeOptionalString(sourceDay?.notes),
            active: true,
          },
        });

        const dayItems = sourceDay?.dayItems || [];
        let sortOrder = 0;
        for (const dayItem of dayItems) {
          const mapped = this.mapQuoteItemToComponent(dayItem.quoteService);
          if (!mapped) {
            continue;
          }
          await tx.packageTemplateComponent.create({
            data: {
              packageTemplateId: template.id,
              packageTemplateDayId: day.id,
              dayNumber,
              sortOrder: sortOrder++,
              isOptional: false,
              active: true,
              operationalNotes: normalizeOptionalString(dayItem.notes),
              ...mapped,
            },
          });
        }
      }

      return template;
    });

    return this.findOne(created.id);
  }

  private mapQuoteItemToComponent(item: any) {
    if (!item) {
      return null;
    }

    const base = {
      label: '',
      componentType: 'OTHER' as PackageTemplateComponentType,
      excursionTemplateId: null as string | null,
      activityId: null as string | null,
      hotelContractId: null as string | null,
      routeId: null as string | null,
      touringRouteId: null as string | null,
      transportServiceTypeId: null as string | null,
      pricingMode: null as string | null,
      supplierServiceId: null as string | null,
    };

    if (item.excursionTemplateId) {
      return { ...base, componentType: 'EXCURSION_TEMPLATE', excursionTemplateId: item.excursionTemplateId, label: item.pricingDescription || 'Excursion' };
    }
    if (item.activityId) {
      return { ...base, componentType: 'ACTIVITY', activityId: item.activityId, label: item.activity?.name || item.pricingDescription || 'Activity' };
    }
    if (item.contractId) {
      const hotelLabel = [item.contract?.hotel?.name, item.contract?.name].filter(Boolean).join(' - ');
      return { ...base, componentType: 'HOTEL', hotelContractId: item.contractId, label: hotelLabel || item.pricingDescription || 'Hotel' };
    }
    if (item.touringRouteId) {
      return {
        ...base,
        componentType: 'TRANSPORT',
        touringRouteId: item.touringRouteId,
        transportServiceTypeId: item.transportServiceTypeId || null,
        label: item.touringRoute?.name || item.pricingDescription || 'Transport',
      };
    }
    if (item.routeId) {
      return {
        ...base,
        componentType: 'TRANSPORT',
        routeId: item.routeId,
        transportServiceTypeId: item.transportServiceTypeId || null,
        label: item.pricingDescription || 'Transport',
      };
    }
    if (item.serviceId) {
      const componentType = this.classifyServiceComponentType(item);
      return { ...base, componentType, supplierServiceId: item.serviceId, label: item.service?.name || item.pricingDescription || 'Service' };
    }
    if (item.externalPackageName) {
      return { ...base, componentType: 'EXTERNAL_PACKAGE', label: item.externalPackageName };
    }

    return { ...base, label: item.pricingDescription || 'Service' };
  }

  private classifyServiceComponentType(item: any): PackageTemplateComponentType {
    if (item.entranceFeeId || item.service?.entranceFee) {
      return 'ENTRANCE';
    }
    if (item.ticketRateVariantId) {
      return 'TICKET';
    }
    const typeText = `${item.service?.serviceType?.code || ''} ${item.service?.serviceType?.name || ''} ${item.service?.category || ''}`.toUpperCase();
    if (typeText.includes('GUIDE')) {
      return 'GUIDE';
    }
    if (typeText.includes('MEAL')) {
      return 'MEAL';
    }
    if (typeText.includes('DINING') || typeText.includes('RESTAURANT') || typeText.includes('LUNCH') || typeText.includes('DINNER')) {
      return 'DINING';
    }
    if (typeText.includes('TICKET') || typeText.includes('ENTRANCE')) {
      return 'TICKET';
    }
    return 'SERVICE';
  }

  async update(id: string, data: UpdatePackageTemplateInput) {
    await this.findOne(id);

    const template = await (this.prisma as any).packageTemplate.update({
      where: { id },
      data: this.buildTemplateData(data, true),
      include: this.packageInclude(),
    });

    if (data.durationDays !== undefined) {
      await this.syncPackageDays(id, template.durationDays);
      return this.findOne(id);
    }

    return template;
  }

  async duplicate(id: string) {
    const sourceTemplate = await this.findOne(id);

    const duplicate = await (this.prisma as any).$transaction(async (tx: any) => {
      const copiedTemplate = await tx.packageTemplate.create({
        data: {
          // `code` is intentionally not copied — it is unique per template.
          name: `${sourceTemplate.name} Copy`,
          durationDays: sourceTemplate.durationDays,
          targetMarket: sourceTemplate.targetMarket,
          season: sourceTemplate.season,
          summary: sourceTemplate.summary,
          destination: sourceTemplate.destination,
          inclusions: sourceTemplate.inclusions,
          exclusions: sourceTemplate.exclusions,
          hotelCategoryNotes: sourceTemplate.hotelCategoryNotes,
          guideRules: sourceTemplate.guideRules,
          ...(sourceTemplate.categoryTags == null ? {} : { categoryTags: sourceTemplate.categoryTags }),
          active: false,
          operationalNotes: sourceTemplate.operationalNotes,
        },
      });

      const dayIdBySourceDayId = new Map<string, string>();
      const orderedDays = [...(sourceTemplate.days || [])].sort((first: any, second: any) => first.dayNumber - second.dayNumber);

      for (const day of orderedDays) {
        const copiedDay = await tx.packageTemplateDay.create({
          data: {
            packageTemplateId: copiedTemplate.id,
            dayNumber: day.dayNumber,
            title: day.title,
            description: day.description,
            active: day.active,
          },
        });
        dayIdBySourceDayId.set(day.id, copiedDay.id);
      }

      const orderedComponents = [...(sourceTemplate.components || [])].sort(
        (first: any, second: any) => first.dayNumber - second.dayNumber || first.sortOrder - second.sortOrder,
      );

      if (orderedComponents.length > 0) {
        await tx.packageTemplateComponent.createMany({
          data: orderedComponents.map((component: any) => ({
            packageTemplateId: copiedTemplate.id,
            packageTemplateDayId: component.packageTemplateDayId ? dayIdBySourceDayId.get(component.packageTemplateDayId) || null : null,
            componentType: component.componentType,
            dayNumber: component.dayNumber,
            label: component.label,
            sortOrder: component.sortOrder,
            isOptional: component.isOptional,
            active: component.active,
            operationalNotes: component.operationalNotes,
            excursionTemplateId: component.excursionTemplateId,
            activityId: component.activityId,
            hotelContractId: component.hotelContractId,
            routeId: component.routeId,
            touringRouteId: component.touringRouteId,
            transportServiceTypeId: component.transportServiceTypeId,
            pricingMode: component.pricingMode,
            supplierServiceId: component.supplierServiceId,
          })),
        });
      }

      return copiedTemplate;
    });

    return this.findOne(duplicate.id);
  }

  async updateDay(packageTemplateId: string, dayId: string, data: PackageTemplateDayInput) {
    await this.findOne(packageTemplateId);
    const day = await (this.prisma as any).packageTemplateDay.findFirst({
      where: { id: dayId, packageTemplateId },
    });

    throwIfNotFound(day, 'Package template day');

    return (this.prisma as any).packageTemplateDay.update({
      where: { id: dayId },
      data: {
        title: data.title === undefined ? undefined : requireTrimmedString(data.title || '', 'title'),
        description: data.description === undefined ? undefined : normalizeOptionalString(data.description),
        active: data.active === undefined ? undefined : Boolean(data.active),
      },
      include: {
        components: {
          include: this.componentInclude(),
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        },
      },
    });
  }

  async reorderDays(packageTemplateId: string, data: ReorderDaysInput) {
    const template = await this.findOne(packageTemplateId);
    const days = [...(template.days || [])].sort((first, second) => first.dayNumber - second.dayNumber);
    const orderedDayIds = Array.isArray(data.orderedDayIds) ? data.orderedDayIds : [];

    if (orderedDayIds.length !== days.length || new Set(orderedDayIds).size !== days.length) {
      throw new BadRequestException('orderedDayIds must include every package day exactly once');
    }

    const dayById = new Map(days.map((day) => [day.id, day]));
    if (orderedDayIds.some((dayId) => !dayById.has(dayId))) {
      throw new BadRequestException('orderedDayIds contains a day that does not belong to this package template');
    }

    await (this.prisma as any).$transaction(async (tx: any) => {
      for (let index = 0; index < orderedDayIds.length; index += 1) {
        await tx.packageTemplateDay.update({
          where: { id: orderedDayIds[index] },
          data: { dayNumber: 10000 + index + 1 },
        });
      }

      for (let index = 0; index < orderedDayIds.length; index += 1) {
        const dayNumber = index + 1;
        const dayId = orderedDayIds[index];
        await tx.packageTemplateDay.update({
          where: { id: dayId },
          data: { dayNumber },
        });
        await tx.packageTemplateComponent.updateMany({
          where: { packageTemplateId, packageTemplateDayId: dayId },
          data: { dayNumber },
        });
      }
    });

    return this.findOne(packageTemplateId);
  }

  async insertDay(packageTemplateId: string, data: InsertDayInput) {
    const template = await this.findOne(packageTemplateId);
    const afterDayNumber = data.afterDayNumber === undefined || data.afterDayNumber === null ? template.durationDays : Number(data.afterDayNumber);
    const insertDayNumber = Math.min(Math.max(Math.trunc(afterDayNumber) + 1, 1), template.durationDays + 1);

    await (this.prisma as any).$transaction(async (tx: any) => {
      await this.shiftDaysForInsert(tx, packageTemplateId, insertDayNumber);
      await tx.packageTemplateDay.create({
        data: {
          packageTemplateId,
          dayNumber: insertDayNumber,
          title: `Day ${insertDayNumber}`,
          active: true,
        },
      });
      await tx.packageTemplate.update({
        where: { id: packageTemplateId },
        data: { durationDays: template.durationDays + 1 },
      });
    });

    return this.findOne(packageTemplateId);
  }

  async duplicateDay(packageTemplateId: string, dayId: string) {
    const template = await this.findOne(packageTemplateId);
    const sourceDay = template.days?.find((day: any) => day.id === dayId);
    throwIfNotFound(sourceDay, 'Package template day');
    const insertDayNumber = sourceDay.dayNumber + 1;

    await (this.prisma as any).$transaction(async (tx: any) => {
      await this.shiftDaysForInsert(tx, packageTemplateId, insertDayNumber);
      const duplicatedDay = await tx.packageTemplateDay.create({
        data: {
          packageTemplateId,
          dayNumber: insertDayNumber,
          title: `${sourceDay.title} copy`,
          description: sourceDay.description,
          active: sourceDay.active,
        },
      });

      const components = sourceDay.components || [];
      if (components.length > 0) {
        await tx.packageTemplateComponent.createMany({
          data: components.map((component: any) => ({
            packageTemplateId,
            packageTemplateDayId: duplicatedDay.id,
            componentType: component.componentType,
            dayNumber: insertDayNumber,
            label: component.label,
            sortOrder: component.sortOrder,
            isOptional: component.isOptional,
            active: component.active,
            operationalNotes: component.operationalNotes,
            excursionTemplateId: component.excursionTemplateId,
            activityId: component.activityId,
            hotelContractId: component.hotelContractId,
            routeId: component.routeId,
            touringRouteId: component.touringRouteId,
            transportServiceTypeId: component.transportServiceTypeId,
            pricingMode: component.pricingMode,
            supplierServiceId: component.supplierServiceId,
          })),
        });
      }

      await tx.packageTemplate.update({
        where: { id: packageTemplateId },
        data: { durationDays: template.durationDays + 1 },
      });
    });

    return this.findOne(packageTemplateId);
  }

  async removeDay(packageTemplateId: string, dayId: string) {
    const template = await this.findOne(packageTemplateId);
    const day = template.days?.find((item: any) => item.id === dayId);
    throwIfNotFound(day, 'Package template day');

    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.packageTemplateComponent.deleteMany({
        where: {
          packageTemplateId,
          OR: [{ packageTemplateDayId: dayId }, { packageTemplateDayId: null, dayNumber: day.dayNumber }],
        },
      });

      await tx.packageTemplateDay.delete({
        where: { id: dayId },
      });

      const remainingDays = await tx.packageTemplateDay.findMany({
        where: { packageTemplateId },
        orderBy: [{ dayNumber: 'asc' }],
      });

      for (let index = 0; index < remainingDays.length; index += 1) {
        await tx.packageTemplateDay.update({
          where: { id: remainingDays[index].id },
          data: { dayNumber: 10000 + index + 1 },
        });
      }

      for (let index = 0; index < remainingDays.length; index += 1) {
        const dayNumber = index + 1;
        const remainingDayId = remainingDays[index].id;
        await tx.packageTemplateDay.update({
          where: { id: remainingDayId },
          data: { dayNumber },
        });
        await tx.packageTemplateComponent.updateMany({
          where: {
            packageTemplateId,
            packageTemplateDayId: remainingDayId,
          },
          data: { dayNumber },
        });
      }

      await tx.packageTemplate.update({
        where: { id: packageTemplateId },
        data: { durationDays: remainingDays.length },
      });
    });

    return this.findOne(packageTemplateId);
  }

  async reorderDayComponents(packageTemplateId: string, dayId: string, data: ReorderComponentsInput) {
    const template = await this.findOne(packageTemplateId);
    const day = template.days?.find((item: any) => item.id === dayId);
    throwIfNotFound(day, 'Package template day');
    const components = day.components || [];
    const orderedComponentIds = Array.isArray(data.orderedComponentIds) ? data.orderedComponentIds : [];

    if (orderedComponentIds.length !== components.length || new Set(orderedComponentIds).size !== components.length) {
      throw new BadRequestException('orderedComponentIds must include every component in the package day exactly once');
    }

    const componentById = new Map(components.map((component: any) => [component.id, component]));
    if (orderedComponentIds.some((componentId) => !componentById.has(componentId))) {
      throw new BadRequestException('orderedComponentIds contains a component that does not belong to this package day');
    }

    await (this.prisma as any).$transaction(async (tx: any) => {
      for (let index = 0; index < orderedComponentIds.length; index += 1) {
        const componentId = orderedComponentIds[index];
        await tx.packageTemplateComponent.update({
          where: { id: componentId },
          data: { sortOrder: index },
        });
      }
    });

    return this.findOne(packageTemplateId);
  }

  async addComponent(packageTemplateId: string, data: PackageTemplateComponentInput) {
    const template = await this.findOne(packageTemplateId);
    const dayNumber = this.normalizePositiveInteger(data.dayNumber, 'dayNumber');

    if (dayNumber > template.durationDays) {
      throw new BadRequestException(`dayNumber must be between 1 and ${template.durationDays}`);
    }

    const packageDay = await this.ensurePackageDay(packageTemplateId, dayNumber);
    const componentData = this.buildComponentData(packageTemplateId, packageDay.id, data, dayNumber);

    return (this.prisma as any).packageTemplateComponent.create({
      data: componentData,
      include: this.componentInclude(),
    });
  }

  async updateComponent(packageTemplateId: string, componentId: string, data: PackageTemplateComponentInput) {
    await this.findOne(packageTemplateId);
    const existing = await (this.prisma as any).packageTemplateComponent.findFirst({
      where: { id: componentId, packageTemplateId },
    });

    throwIfNotFound(existing, 'Package template component');

    // Editing keeps the component on its current day; day placement is managed by reorder/move.
    const componentData = this.buildComponentData(packageTemplateId, existing.packageTemplateDayId, data, existing.dayNumber);

    return (this.prisma as any).packageTemplateComponent.update({
      where: { id: componentId },
      data: componentData,
      include: this.componentInclude(),
    });
  }

  async removeComponent(packageTemplateId: string, componentId: string) {
    await this.findOne(packageTemplateId);
    const component = await (this.prisma as any).packageTemplateComponent.findFirst({
      where: { id: componentId, packageTemplateId },
    });

    throwIfNotFound(component, 'Package template component');

    await (this.prisma as any).packageTemplateComponent.delete({ where: { id: componentId } });

    return { id: componentId, deleted: true };
  }

  async moveComponent(packageTemplateId: string, componentId: string, data: { dayNumber: number }) {
    const template = await this.findOne(packageTemplateId);
    const targetDayNumber = this.normalizePositiveInteger(data.dayNumber, 'dayNumber');

    if (targetDayNumber > template.durationDays) {
      throw new BadRequestException(`dayNumber must be between 1 and ${template.durationDays}`);
    }

    const component = await (this.prisma as any).packageTemplateComponent.findFirst({
      where: { id: componentId, packageTemplateId },
    });
    throwIfNotFound(component, 'Package template component');

    if (component.dayNumber === targetDayNumber) {
      return this.findOne(packageTemplateId);
    }

    const targetDay = await this.ensurePackageDay(packageTemplateId, targetDayNumber);
    const lastInTargetDay = await (this.prisma as any).packageTemplateComponent.findFirst({
      where: { packageTemplateId, packageTemplateDayId: targetDay.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextSortOrder = lastInTargetDay ? (lastInTargetDay.sortOrder ?? 0) + 1 : 0;

    await (this.prisma as any).packageTemplateComponent.update({
      where: { id: componentId },
      data: {
        packageTemplateDayId: targetDay.id,
        dayNumber: targetDayNumber,
        sortOrder: nextSortOrder,
      },
    });

    return this.findOne(packageTemplateId);
  }

  private buildTemplateData(data: UpdatePackageTemplateInput, partial: boolean) {
    return {
      name: data.name === undefined && partial ? undefined : requireTrimmedString(data.name || '', 'name'),
      durationDays:
        data.durationDays === undefined && partial ? undefined : this.normalizePositiveInteger(data.durationDays, 'durationDays'),
      code: data.code === undefined ? undefined : normalizeOptionalString(data.code),
      targetMarket: data.targetMarket === undefined ? undefined : normalizeOptionalString(data.targetMarket),
      season: data.season === undefined ? undefined : normalizeOptionalString(data.season),
      summary: data.summary === undefined ? undefined : normalizeOptionalString(data.summary),
      destination: data.destination === undefined ? undefined : normalizeOptionalString(data.destination),
      inclusions: data.inclusions === undefined ? undefined : normalizeOptionalString(data.inclusions),
      exclusions: data.exclusions === undefined ? undefined : normalizeOptionalString(data.exclusions),
      hotelCategoryNotes: data.hotelCategoryNotes === undefined ? undefined : normalizeOptionalString(data.hotelCategoryNotes),
      guideRules: data.guideRules === undefined ? undefined : normalizeOptionalString(data.guideRules),
      categoryTags: this.normalizeCategoryTags(data.categoryTags),
      active: data.active === undefined ? undefined : Boolean(data.active),
      operationalNotes: data.operationalNotes === undefined ? undefined : normalizeOptionalString(data.operationalNotes),
    };
  }

  private normalizeCategoryTags(value: unknown) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (Array.isArray(value)) {
      const tags = value.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0);
      return tags.length > 0 ? tags : null;
    }
    if (typeof value === 'string') {
      const tags = value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      return tags.length > 0 ? tags : null;
    }
    return value as any;
  }

  private buildComponentData(packageTemplateId: string, packageTemplateDayId: string, data: PackageTemplateComponentInput, dayNumber: number) {
    const componentType = this.normalizeComponentType(data.componentType);
    this.validateComponentReference(componentType, data);

    return {
      packageTemplateId,
      packageTemplateDayId,
      componentType,
      dayNumber,
      label: requireTrimmedString(data.label, 'label'),
      sortOrder: data.sortOrder === undefined || data.sortOrder === null ? 0 : this.normalizeNonNegativeInteger(data.sortOrder, 'sortOrder'),
      isOptional: Boolean(data.isOptional),
      active: data.active === undefined ? true : Boolean(data.active),
      operationalNotes: normalizeOptionalString(data.operationalNotes),
      excursionTemplateId: componentType === 'EXCURSION_TEMPLATE' ? normalizeOptionalString(data.excursionTemplateId) : null,
      activityId: componentType === 'ACTIVITY' ? normalizeOptionalString(data.activityId) : null,
      hotelContractId: componentType === 'HOTEL' ? normalizeOptionalString(data.hotelContractId) : null,
      routeId: componentType === 'TRANSPORT' ? normalizeOptionalString(data.routeId) : null,
      touringRouteId: componentType === 'TRANSPORT' ? normalizeOptionalString(data.touringRouteId) : null,
      transportServiceTypeId: componentType === 'TRANSPORT' ? normalizeOptionalString(data.transportServiceTypeId) : null,
      pricingMode: componentType === 'TRANSPORT' ? normalizeOptionalString(data.pricingMode) : null,
      supplierServiceId: this.componentTypeSupportsSupplierService(componentType) ? normalizeOptionalString(data.supplierServiceId) : null,
    };
  }

  private validateComponentReference(componentType: PackageTemplateComponentType, data: PackageTemplateComponentInput) {
    if (componentType === 'EXCURSION_TEMPLATE' && !normalizeOptionalString(data.excursionTemplateId)) {
      throw new BadRequestException('excursionTemplateId is required for excursion template components');
    }
    if (componentType === 'ACTIVITY' && !normalizeOptionalString(data.activityId)) {
      throw new BadRequestException('activityId is required for activity components');
    }
    if (componentType === 'TRANSPORT' && normalizeOptionalString(data.routeId) && normalizeOptionalString(data.touringRouteId)) {
      throw new BadRequestException('Transport components cannot link both routeId and touringRouteId');
    }
  }

  private componentTypeSupportsSupplierService(componentType: PackageTemplateComponentType) {
    return ['TRANSPORT', 'DINING', 'MEAL', 'TICKET', 'ENTRANCE', 'GUIDE', 'SERVICE', 'OTHER'].includes(componentType);
  }

  private normalizeComponentType(value: string) {
    if (!COMPONENT_TYPES.includes(value as PackageTemplateComponentType)) {
      throw new BadRequestException('Unsupported package template component type');
    }

    return value as PackageTemplateComponentType;
  }

  private normalizePositiveInteger(value: number | null | undefined, field: string) {
    const numeric = Number(value);

    if (!Number.isInteger(numeric) || numeric < 1) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }

    return numeric;
  }

  private normalizeNonNegativeInteger(value: number | null | undefined, field: string) {
    const numeric = Number(value);

    if (!Number.isInteger(numeric) || numeric < 0) {
      throw new BadRequestException(`${field} must be zero or greater`);
    }

    return numeric;
  }

  private packageInclude() {
    return {
      days: {
        include: {
          components: {
            include: this.componentInclude(),
            orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
          },
        },
        orderBy: [{ dayNumber: 'asc' }],
      },
      components: {
        include: this.componentInclude(),
        orderBy: [{ dayNumber: 'asc' }, { sortOrder: 'asc' }],
      },
    };
  }

  private componentInclude() {
    return {
      excursionTemplate: true,
      activity: true,
      hotelContract: {
        include: {
          hotel: true,
        },
      },
      route: true,
      touringRoute: true,
      transportServiceType: true,
      supplierService: {
        include: {
          entranceFee: true,
        },
      },
    };
  }

  private buildDefaultDays(durationDays: number) {
    return Array.from({ length: durationDays }, (_, index) => ({
      dayNumber: index + 1,
      title: `Day ${index + 1}`,
      active: true,
    }));
  }

  private async syncPackageDays(packageTemplateId: string, durationDays: number) {
    await this.ensurePackageDays(packageTemplateId, durationDays);
    await this.pruneDaysBeyond(packageTemplateId, durationDays);
  }

  private async pruneDaysBeyond(packageTemplateId: string, durationDays: number) {
    const staleDays = await (this.prisma as any).packageTemplateDay.findMany({
      where: { packageTemplateId, dayNumber: { gt: durationDays } },
      select: { id: true, dayNumber: true },
    });

    if (staleDays.length === 0) {
      return;
    }

    const staleDayIds = staleDays.map((day: any) => day.id);
    const staleDayNumbers = staleDays.map((day: any) => day.dayNumber);

    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.packageTemplateComponent.deleteMany({
        where: {
          packageTemplateId,
          OR: [
            { packageTemplateDayId: { in: staleDayIds } },
            { packageTemplateDayId: null, dayNumber: { in: staleDayNumbers } },
          ],
        },
      });
      await tx.packageTemplateDay.deleteMany({
        where: { id: { in: staleDayIds } },
      });
    });
  }

  private async ensurePackageDays(packageTemplateId: string, durationDays: number) {
    for (const day of this.buildDefaultDays(durationDays)) {
      await (this.prisma as any).packageTemplateDay.upsert({
        where: {
          packageTemplateId_dayNumber: {
            packageTemplateId,
            dayNumber: day.dayNumber,
          },
        },
        update: {},
        create: {
          packageTemplateId,
          ...day,
        },
      });
    }
  }

  private async ensurePackageDay(packageTemplateId: string, dayNumber: number) {
    return (this.prisma as any).packageTemplateDay.upsert({
      where: {
        packageTemplateId_dayNumber: {
          packageTemplateId,
          dayNumber,
        },
      },
      update: {},
      create: {
        packageTemplateId,
        dayNumber,
        title: `Day ${dayNumber}`,
        active: true,
      },
    });
  }

  private async shiftDaysForInsert(tx: any, packageTemplateId: string, insertDayNumber: number) {
    const daysToShift = await tx.packageTemplateDay.findMany({
      where: {
        packageTemplateId,
        dayNumber: {
          gte: insertDayNumber,
        },
      },
      orderBy: [{ dayNumber: 'desc' }],
    });

    for (const day of daysToShift) {
      await tx.packageTemplateDay.update({
        where: { id: day.id },
        data: { dayNumber: day.dayNumber + 10000 },
      });
    }

    for (const day of daysToShift) {
      await tx.packageTemplateDay.update({
        where: { id: day.id },
        data: { dayNumber: day.dayNumber + 1 },
      });
      await tx.packageTemplateComponent.updateMany({
        where: { packageTemplateId, packageTemplateDayId: day.id },
        data: { dayNumber: day.dayNumber + 1 },
      });
    }
  }
}
