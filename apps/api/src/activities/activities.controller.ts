import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ActivitiesService } from './activities.service';

type ActivityPricingBasis = 'PER_PERSON' | 'PER_GROUP';
type ActivityGuideRequirement =
  | 'LOCAL_GUIDE_REQUIRED'
  | 'OFFICIAL_ACCOMPANYING_GUIDE_ALLOWED'
  | 'BOTH_ACCEPTED'
  | 'LOCAL_GUIDE_PLUS_ACCOMPANYING_GUIDE';

type ActivityRateVariantBody = {
  id?: string;
  name: string;
  supplierCompanyId?: string | null;
  durationMinutes?: number | null;
  durationHours?: number | null;
  currency?: string | null;
  costPrice: number;
  sellPrice: number;
  pricingBasis: ActivityPricingBasis;
  minPax?: number | null;
  maxPax?: number | null;
  maxPaxPerUnit?: number | null;
  capacityPricing?: boolean | null;
  active?: boolean;
  notes?: string | null;
  difficulty?: string | null;
  guideRequired?: boolean | null;
  guideRequirement?: ActivityGuideRequirement | null;
  sicPossible?: boolean | null;
  fitnessLevel?: string | null;
  familyFriendly?: boolean | null;
  seasonalRisk?: string | null;
  terrainType?: string | null;
  recommendedPaxRange?: string | null;
  meetingPoint?: string | null;
  startPoint?: string | null;
  endPoint?: string | null;
  operationalNotes?: string | null;
  suitability?: string | null;
  fitnessNotes?: string | null;
  waterNotes?: string | null;
  seasonalNotes?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
};

type CreateActivityBody = {
  name: string;
  description?: string | null;
  supplierCompanyId: string;
  pricingBasis: ActivityPricingBasis;
  costPrice: number;
  sellPrice: number;
  durationMinutes?: number | null;
  durationHours?: number | null;
  active?: boolean;
  code?: string | null;
  category?: string | null;
  city?: string | null;
  region?: string | null;
  difficulty?: string | null;
  guideRequired?: boolean | null;
  sicPossible?: boolean | null;
  fitnessLevel?: string | null;
  familyFriendly?: boolean | null;
  seasonalRisk?: string | null;
  terrainType?: string | null;
  recommendedPaxRange?: string | null;
  startPoint?: string | null;
  endPoint?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  operationalNotes?: string | null;
  categoryTags?: string[] | null;
  reviewNotes?: string | null;
  moodCategory?: string | null;
  experienceType?: string | null;
  operationalIntensity?: string | null;
  religiousSignificance?: boolean | null;
  premiumExperienceFlag?: boolean | null;
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
      durationHours: body.durationHours === undefined || body.durationHours === null ? body.durationHours : Number(body.durationHours),
      rateVariants: this.normalizeRateVariants(body.rateVariants),
    });
  }

  @Post(':id/duplicate')
  @Roles('admin', 'operations')
  duplicate(@Param('id') id: string) {
    return this.activitiesService.duplicate(id);
  }

  @Post('petra-hiking/ensure')
  @Roles('admin', 'operations')
  ensurePetraHikingExperiences() {
    return this.activitiesService.ensurePetraHikingExperiences();
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
      durationHours: body.durationHours === undefined || body.durationHours === null ? body.durationHours : Number(body.durationHours),
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
      durationHours:
        variant.durationHours === undefined || variant.durationHours === null ? variant.durationHours : Number(variant.durationHours),
      costPrice: Number(variant.costPrice),
      sellPrice: Number(variant.sellPrice),
      minPax: variant.minPax === undefined || variant.minPax === null ? variant.minPax : Number(variant.minPax),
      maxPax: variant.maxPax === undefined || variant.maxPax === null ? variant.maxPax : Number(variant.maxPax),
      maxPaxPerUnit:
        variant.maxPaxPerUnit === undefined || variant.maxPaxPerUnit === null
          ? variant.maxPaxPerUnit
          : Number(variant.maxPaxPerUnit),
    }));
  }
}
