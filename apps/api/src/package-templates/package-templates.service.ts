import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';

type PackageTemplateComponentType = 'EXCURSION_TEMPLATE' | 'ACTIVITY' | 'HOTEL' | 'TRANSPORT' | 'TICKET' | 'SERVICE';

type CreatePackageTemplateInput = {
  name: string;
  durationDays: number;
  targetMarket?: string | null;
  season?: string | null;
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
  transportServiceTypeId?: string | null;
  pricingMode?: string | null;
  supplierServiceId?: string | null;
};

type PackageTemplateDayInput = {
  title?: string | null;
  description?: string | null;
  active?: boolean;
};

const COMPONENT_TYPES: PackageTemplateComponentType[] = ['EXCURSION_TEMPLATE', 'ACTIVITY', 'HOTEL', 'TRANSPORT', 'TICKET', 'SERVICE'];

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

  async update(id: string, data: UpdatePackageTemplateInput) {
    await this.findOne(id);

    const template = await (this.prisma as any).packageTemplate.update({
      where: { id },
      data: this.buildTemplateData(data, true),
      include: this.packageInclude(),
    });

    if (data.durationDays !== undefined) {
      await this.ensurePackageDays(id, template.durationDays);
      return this.findOne(id);
    }

    return template;
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

  async removeComponent(packageTemplateId: string, componentId: string) {
    await this.findOne(packageTemplateId);
    const component = await (this.prisma as any).packageTemplateComponent.findFirst({
      where: { id: componentId, packageTemplateId },
    });

    throwIfNotFound(component, 'Package template component');

    await (this.prisma as any).packageTemplateComponent.delete({ where: { id: componentId } });

    return { id: componentId, deleted: true };
  }

  private buildTemplateData(data: UpdatePackageTemplateInput, partial: boolean) {
    return {
      name: data.name === undefined && partial ? undefined : requireTrimmedString(data.name || '', 'name'),
      durationDays:
        data.durationDays === undefined && partial ? undefined : this.normalizePositiveInteger(data.durationDays, 'durationDays'),
      targetMarket: data.targetMarket === undefined ? undefined : normalizeOptionalString(data.targetMarket),
      season: data.season === undefined ? undefined : normalizeOptionalString(data.season),
      active: data.active === undefined ? undefined : Boolean(data.active),
      operationalNotes: data.operationalNotes === undefined ? undefined : normalizeOptionalString(data.operationalNotes),
    };
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
      transportServiceTypeId: componentType === 'TRANSPORT' ? normalizeOptionalString(data.transportServiceTypeId) : null,
      pricingMode: componentType === 'TRANSPORT' ? normalizeOptionalString(data.pricingMode) : null,
      supplierServiceId: componentType === 'TICKET' || componentType === 'SERVICE' ? normalizeOptionalString(data.supplierServiceId) : null,
    };
  }

  private validateComponentReference(componentType: PackageTemplateComponentType, data: PackageTemplateComponentInput) {
    if (componentType === 'EXCURSION_TEMPLATE' && !normalizeOptionalString(data.excursionTemplateId)) {
      throw new BadRequestException('excursionTemplateId is required for excursion template components');
    }
    if (componentType === 'ACTIVITY' && !normalizeOptionalString(data.activityId)) {
      throw new BadRequestException('activityId is required for activity components');
    }
    if (componentType === 'HOTEL' && !normalizeOptionalString(data.hotelContractId)) {
      throw new BadRequestException('hotelContractId is required for hotel components');
    }
    if (componentType === 'TRANSPORT' && !normalizeOptionalString(data.routeId)) {
      throw new BadRequestException('routeId is required for transport components');
    }
    if (componentType === 'TICKET' && !normalizeOptionalString(data.supplierServiceId)) {
      throw new BadRequestException('supplierServiceId is required for ticket components');
    }
    if (componentType === 'SERVICE' && !normalizeOptionalString(data.supplierServiceId)) {
      throw new BadRequestException('supplierServiceId is required for service components');
    }
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
}
