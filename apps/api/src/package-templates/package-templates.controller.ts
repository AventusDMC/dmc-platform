import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { PackageTemplatesService } from './package-templates.service';

type PackageTemplateComponentType = 'EXCURSION_TEMPLATE' | 'ACTIVITY' | 'HOTEL' | 'TRANSPORT' | 'TICKET' | 'SERVICE';

type CreatePackageTemplateBody = {
  name: string;
  durationDays: number;
  targetMarket?: string | null;
  season?: string | null;
  active?: boolean;
  operationalNotes?: string | null;
};

type PackageTemplateComponentBody = {
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

@Controller('package-templates')
export class PackageTemplatesController {
  constructor(private readonly packageTemplatesService: PackageTemplatesService) {}

  @Get()
  findAll() {
    return this.packageTemplatesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.packageTemplatesService.findOne(id);
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: CreatePackageTemplateBody) {
    return this.packageTemplatesService.create(this.normalizeTemplateBody(body));
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: Partial<CreatePackageTemplateBody>) {
    return this.packageTemplatesService.update(id, this.normalizeTemplateBody(body));
  }

  @Post(':id/components')
  @Roles('admin', 'operations')
  addComponent(@Param('id') id: string, @Body() body: PackageTemplateComponentBody) {
    return this.packageTemplatesService.addComponent(id, this.normalizeComponentBody(body));
  }

  @Delete(':id/components/:componentId')
  @Roles('admin', 'operations')
  removeComponent(@Param('id') id: string, @Param('componentId') componentId: string) {
    return this.packageTemplatesService.removeComponent(id, componentId);
  }

  private normalizeTemplateBody<T extends Partial<CreatePackageTemplateBody>>(body: T): T {
    return {
      ...body,
      durationDays: body.durationDays === undefined || body.durationDays === null ? body.durationDays : Number(body.durationDays),
    };
  }

  private normalizeComponentBody<T extends Partial<PackageTemplateComponentBody>>(body: T): T {
    return {
      ...body,
      dayNumber: body.dayNumber === undefined || body.dayNumber === null ? body.dayNumber : Number(body.dayNumber),
      sortOrder: body.sortOrder === undefined || body.sortOrder === null ? body.sortOrder : Number(body.sortOrder),
    };
  }
}
