import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ExcursionTemplatesService } from './excursion-templates.service';

type ExcursionComponentType = 'TRANSPORT' | 'TICKET' | 'ACTIVITY' | 'GUIDE' | 'DINING';

type ExcursionTemplateComponentBody = {
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

type CreateExcursionTemplateBody = {
  name: string;
  code?: string | null;
  description?: string | null;
  defaultDepartureCity?: string | null;
  durationMinutes?: number | null;
  operationalNotes?: string | null;
  active?: boolean;
  components?: ExcursionTemplateComponentBody[];
};

type UpdateExcursionTemplateBody = Partial<CreateExcursionTemplateBody>;

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
      components: Array.isArray(body.components)
        ? body.components.map((component) => ({
            ...component,
            sortOrder: component.sortOrder === undefined || component.sortOrder === null ? component.sortOrder : Number(component.sortOrder),
            durationMinutes:
              component.durationMinutes === undefined || component.durationMinutes === null
                ? component.durationMinutes
                : Number(component.durationMinutes),
          }))
        : body.components,
    };
  }
}
