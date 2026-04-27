import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ActivitiesService } from './activities.service';

type ActivityPricingBasis = 'PER_PERSON' | 'PER_GROUP';

type CreateActivityBody = {
  name: string;
  description?: string | null;
  supplierCompanyId: string;
  pricingBasis: ActivityPricingBasis;
  costPrice: number;
  sellPrice: number;
  durationMinutes?: number | null;
  active?: boolean;
};

type UpdateActivityBody = Partial<CreateActivityBody>;

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: CreateActivityBody) {
    return this.activitiesService.create({
      ...body,
      costPrice: Number(body.costPrice),
      sellPrice: Number(body.sellPrice),
      durationMinutes:
        body.durationMinutes === undefined || body.durationMinutes === null ? body.durationMinutes : Number(body.durationMinutes),
    });
  }

  @Get()
  findAll() {
    return this.activitiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.activitiesService.findOne(id);
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: UpdateActivityBody) {
    return this.activitiesService.update(id, {
      ...body,
      costPrice: body.costPrice === undefined ? undefined : Number(body.costPrice),
      sellPrice: body.sellPrice === undefined ? undefined : Number(body.sellPrice),
      durationMinutes:
        body.durationMinutes === undefined || body.durationMinutes === null ? body.durationMinutes : Number(body.durationMinutes),
    });
  }
}
