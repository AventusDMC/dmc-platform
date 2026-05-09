import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ActivitiesService } from './activities.service';

type ActivityPricingBasis = 'PER_PERSON' | 'PER_GROUP';

type ActivityRateVariantBody = {
  id?: string;
  name: string;
  durationMinutes?: number | null;
  costPrice: number;
  sellPrice: number;
  pricingBasis: ActivityPricingBasis;
  maxPaxPerUnit?: number | null;
  active?: boolean;
  notes?: string | null;
};

type CreateActivityBody = {
  name: string;
  description?: string | null;
  supplierCompanyId: string;
  pricingBasis: ActivityPricingBasis;
  costPrice: number;
  sellPrice: number;
  durationMinutes?: number | null;
  active?: boolean;
  rateVariants?: ActivityRateVariantBody[];
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
      rateVariants: this.normalizeRateVariants(body.rateVariants),
    });
  }

  @Post(':id/duplicate')
  @Roles('admin', 'operations')
  duplicate(@Param('id') id: string) {
    return this.activitiesService.duplicate(id);
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
      rateVariants: body.rateVariants === undefined ? undefined : this.normalizeRateVariants(body.rateVariants),
    });
  }

  private normalizeRateVariants(variants: ActivityRateVariantBody[] | undefined) {
    if (!Array.isArray(variants)) {
      return variants;
    }

    return variants.map((variant) => ({
      ...variant,
      durationMinutes:
        variant.durationMinutes === undefined || variant.durationMinutes === null
          ? variant.durationMinutes
          : Number(variant.durationMinutes),
      costPrice: Number(variant.costPrice),
      sellPrice: Number(variant.sellPrice),
      maxPaxPerUnit:
        variant.maxPaxPerUnit === undefined || variant.maxPaxPerUnit === null
          ? variant.maxPaxPerUnit
          : Number(variant.maxPaxPerUnit),
    }));
  }
}
