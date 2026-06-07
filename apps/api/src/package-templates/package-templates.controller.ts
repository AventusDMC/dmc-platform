import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { PackageTemplatePricingService } from './package-template-pricing.service';
import { PackageTemplatesService } from './package-templates.service';

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

type CreatePackageTemplateBody = {
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

type MovePackageComponentBody = {
  dayNumber: number;
};

type CreateFromQuoteBody = {
  quoteId: string;
  name?: string | null;
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
  activityRateVariantId?: string | null;
  hotelContractId?: string | null;
  routeId?: string | null;
  touringRouteId?: string | null;
  transportServiceTypeId?: string | null;
  pricingMode?: string | null;
  supplierServiceId?: string | null;
  guideType?: string | null;
  guideDuration?: string | null;
  guideOvernight?: boolean | null;
  overnightCity?: string | null;
  minPax?: number | null;
  maxPax?: number | null;
  requiresOperatorConfirmation?: boolean | null;
};

type PackageTemplateDayBody = {
  title?: string | null;
  description?: string | null;
  active?: boolean;
};

type ReorderPackageDaysBody = {
  orderedDayIds: string[];
};

type InsertPackageDayBody = {
  afterDayNumber?: number | null;
};

type ReorderPackageDayComponentsBody = {
  orderedComponentIds: string[];
};

@Controller('package-templates')
export class PackageTemplatesController {
  constructor(
    private readonly packageTemplatesService: PackageTemplatesService,
    private readonly packageTemplatePricingService: PackageTemplatePricingService,
  ) {}

  @Get()
  findAll() {
    return this.packageTemplatesService.findAll();
  }

  @Get(':id/cost-estimate')
  costEstimate(@Param('id') id: string, @Query('pax') pax?: string) {
    return this.packageTemplatePricingService.estimate(id, {
      pax: pax === undefined ? undefined : Number(pax),
    });
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

  @Post('from-quote')
  @Roles('admin', 'operations')
  createFromQuote(@Body() body: CreateFromQuoteBody) {
    return this.packageTemplatesService.createFromQuote(body.quoteId, { name: body.name });
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: Partial<CreatePackageTemplateBody>) {
    return this.packageTemplatesService.update(id, this.normalizeTemplateBody(body));
  }

  @Post(':id/duplicate')
  @Roles('admin', 'operations')
  duplicate(@Param('id') id: string) {
    return this.packageTemplatesService.duplicate(id);
  }

  @Post(':id/components')
  @Roles('admin', 'operations')
  addComponent(@Param('id') id: string, @Body() body: PackageTemplateComponentBody) {
    return this.packageTemplatesService.addComponent(id, this.normalizeComponentBody(body));
  }

  @Patch(':id/days/reorder')
  @Roles('admin', 'operations')
  reorderDays(@Param('id') id: string, @Body() body: ReorderPackageDaysBody) {
    return this.packageTemplatesService.reorderDays(id, body);
  }

  @Post(':id/days/insert')
  @Roles('admin', 'operations')
  insertDay(@Param('id') id: string, @Body() body: InsertPackageDayBody) {
    return this.packageTemplatesService.insertDay(id, {
      afterDayNumber: body.afterDayNumber === undefined || body.afterDayNumber === null ? body.afterDayNumber : Number(body.afterDayNumber),
    });
  }

  @Post(':id/days/:dayId/duplicate')
  @Roles('admin', 'operations')
  duplicateDay(@Param('id') id: string, @Param('dayId') dayId: string) {
    return this.packageTemplatesService.duplicateDay(id, dayId);
  }

  @Patch(':id/days/:dayId/components/reorder')
  @Roles('admin', 'operations')
  reorderDayComponents(@Param('id') id: string, @Param('dayId') dayId: string, @Body() body: ReorderPackageDayComponentsBody) {
    return this.packageTemplatesService.reorderDayComponents(id, dayId, body);
  }

  @Delete(':id/days/:dayId')
  @Roles('admin', 'operations')
  removeDay(@Param('id') id: string, @Param('dayId') dayId: string) {
    return this.packageTemplatesService.removeDay(id, dayId);
  }

  @Patch(':id/days/:dayId')
  @Roles('admin', 'operations')
  updateDay(@Param('id') id: string, @Param('dayId') dayId: string, @Body() body: PackageTemplateDayBody) {
    return this.packageTemplatesService.updateDay(id, dayId, body);
  }

  @Patch(':id/components/:componentId/move')
  @Roles('admin', 'operations')
  moveComponent(@Param('id') id: string, @Param('componentId') componentId: string, @Body() body: MovePackageComponentBody) {
    return this.packageTemplatesService.moveComponent(id, componentId, {
      dayNumber: body.dayNumber === undefined || body.dayNumber === null ? body.dayNumber : Number(body.dayNumber),
    });
  }

  @Patch(':id/components/:componentId')
  @Roles('admin', 'operations')
  updateComponent(@Param('id') id: string, @Param('componentId') componentId: string, @Body() body: PackageTemplateComponentBody) {
    return this.packageTemplatesService.updateComponent(id, componentId, this.normalizeComponentBody(body));
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
