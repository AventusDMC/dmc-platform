import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TouringRoutesService } from './touring-routes.service';

type TouringRouteBody = {
  code?: string | null;
  name: string;
  startCity: string;
  durationDays?: number | null;
  routeDescription?: string | null;
  mainDestinations?: string[] | null;
  includedKm?: number | null;
  includedHours?: number | null;
  active?: boolean;
  stops?: Array<{
    order?: number | null;
    city: string;
    location?: string | null;
    notes?: string | null;
  }>;
  pricings?: Array<{
    supplierId?: string | null;
    vehicleId?: string | null;
    transportServiceTypeId?: string | null;
    pricingBasis?: 'PER_VEHICLE' | 'PER_DAY' | null;
    minPax?: number | null;
    maxPax?: number | null;
    currency?: string | null;
    baseCost: number;
    costPerDay?: number | null;
    includedKm?: number | null;
    includedHours?: number | null;
    extraKmRate?: number | null;
    extraHourRate?: number | null;
    validFrom?: string | null;
    validTo?: string | null;
    active?: boolean;
    notes?: string | null;
  }>;
};

@Controller('touring-routes')
export class TouringRoutesController {
  constructor(private readonly touringRoutesService: TouringRoutesService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('active') active?: string, @Query('limit') limit?: string) {
    return this.touringRoutesService.findAll({
      search,
      active: active === undefined ? undefined : active !== 'false',
      limit: limit === undefined ? undefined : Number(limit),
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.touringRoutesService.findOne(id);
  }

  @Post()
  create(@Body() body: TouringRouteBody) {
    return this.touringRoutesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<TouringRouteBody>) {
    return this.touringRoutesService.update(id, body);
  }
}
