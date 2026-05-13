import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ExcursionTemplatesService } from './excursion-templates.service';

type ExcursionComponentType = 'TRANSPORT' | 'TICKET' | 'ACTIVITY' | 'GUIDE' | 'DINING';

type ExcursionTemplateComponentBody = {
  componentType: ExcursionComponentType;
  label: string;
  sortOrder?: number | null;
  isOptional?: boolean;
  active?: boolean;
  operationalNotes?: string | null;
  supplierServiceId?: string | null;
  activityId?: string | null;
  routeId?: string | null;
  touringRouteId?: string | null;
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

type CreateExcursionTemplateBody = {
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
  components?: ExcursionTemplateComponentBody[];
};

type UpdateExcursionTemplateBody = Partial<CreateExcursionTemplateBody>;

type ReorderComponentsBody = {
  componentIds: string[];
};

@Controller('excursion-templates')
export class ExcursionTemplatesController {
  constructor(private readonly excursionTemplatesService: ExcursionTemplatesService) {}

  @Get()
  findAll() {
    return this.excursionTemplatesService.findAll();
  }

  @Get('code/:code')
  findByCode(@Param('code') code: string) {
    return this.excursionTemplatesService.findByCode(code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.excursionTemplatesService.findOne(id);
  }

  @Get(':id/suggested-transport')
  getSuggestedTransport(@Param('id') id: string, @Query('pax') pax?: string) {
    return this.excursionTemplatesService.getSuggestedTransport(id, pax === undefined ? 1 : Number(pax));
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: CreateExcursionTemplateBody) {
    return this.excursionTemplatesService.create(this.normalizeBody(body));
  }

  @Post('petra-full-day/ensure')
  @Roles('admin', 'operations')
  ensurePetraFullDayTemplate() {
    return this.excursionTemplatesService.ensurePetraFullDayTemplate();
  }

  @Post('jerash-amman-full-day/ensure')
  @Roles('admin', 'operations')
  ensureJerashAmmanFullDayTemplate() {
    return this.excursionTemplatesService.ensureJerashAmmanFullDayTemplate();
  }

  @Post('dead-sea-escape/ensure')
  @Roles('admin', 'operations')
  ensureDeadSeaEscapeTemplate() {
    return this.excursionTemplatesService.ensureDeadSeaEscapeTemplate();
  }

  @Post('wadi-rum-full-day/ensure')
  @Roles('admin', 'operations')
  ensureWadiRumFullDayTemplate() {
    return this.excursionTemplatesService.ensureWadiRumFullDayTemplate();
  }

  @Post('aqaba-sindbad/ensure')
  @Roles('admin', 'operations')
  ensureSindbadAqabaCatalog() {
    return this.excursionTemplatesService.ensureSindbadAqabaCatalog();
  }

  @Post(':id/fill-missing-metadata')
  @Roles('admin', 'operations')
  fillMissingOperationalMetadata(@Param('id') id: string) {
    return this.excursionTemplatesService.fillMissingOperationalMetadata(id);
  }

  @Post(':id/components')
  @Roles('admin', 'operations')
  addComponent(@Param('id') id: string, @Body() body: ExcursionTemplateComponentBody) {
    return this.excursionTemplatesService.addComponent(id, this.normalizeComponentBody(body));
  }

  @Patch(':id/components/reorder')
  @Roles('admin', 'operations')
  reorderComponents(@Param('id') id: string, @Body() body: ReorderComponentsBody) {
    return this.excursionTemplatesService.reorderComponents(id, body);
  }

  @Patch(':id/components/:componentId')
  @Roles('admin', 'operations')
  updateComponent(@Param('id') id: string, @Param('componentId') componentId: string, @Body() body: Partial<ExcursionTemplateComponentBody>) {
    return this.excursionTemplatesService.updateComponent(id, componentId, this.normalizeComponentBody(body));
  }

  @Delete(':id/components/:componentId')
  @Roles('admin', 'operations')
  removeComponent(@Param('id') id: string, @Param('componentId') componentId: string) {
    return this.excursionTemplatesService.removeComponent(id, componentId);
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: UpdateExcursionTemplateBody) {
    return this.excursionTemplatesService.update(id, this.normalizeBody(body));
  }

  private normalizeBody<T extends UpdateExcursionTemplateBody>(body: T): T {
    return {
      ...body,
      durationMinutes:
        body.durationMinutes === undefined || body.durationMinutes === null ? body.durationMinutes : Number(body.durationMinutes),
      minimumPax: body.minimumPax === undefined || body.minimumPax === null ? body.minimumPax : Number(body.minimumPax),
      maximumPax: body.maximumPax === undefined || body.maximumPax === null ? body.maximumPax : Number(body.maximumPax),
      components: Array.isArray(body.components)
        ? body.components.map((component) => ({
            ...component,
            sortOrder: component.sortOrder === undefined || component.sortOrder === null ? component.sortOrder : Number(component.sortOrder),
            durationMinutes:
              component.durationMinutes === undefined || component.durationMinutes === null
                ? component.durationMinutes
                : Number(component.durationMinutes),
            estimatedDurationMinutes:
              component.estimatedDurationMinutes === undefined || component.estimatedDurationMinutes === null
                ? component.estimatedDurationMinutes
                : Number(component.estimatedDurationMinutes),
          }))
        : body.components,
    };
  }

  private normalizeComponentBody<T extends Partial<ExcursionTemplateComponentBody>>(component: T): T {
    return {
      ...component,
      sortOrder: component.sortOrder === undefined || component.sortOrder === null ? component.sortOrder : Number(component.sortOrder),
      durationMinutes:
        component.durationMinutes === undefined || component.durationMinutes === null
          ? component.durationMinutes
          : Number(component.durationMinutes),
      estimatedDurationMinutes:
        component.estimatedDurationMinutes === undefined || component.estimatedDurationMinutes === null
          ? component.estimatedDurationMinutes
          : Number(component.estimatedDurationMinutes),
    };
  }
}
