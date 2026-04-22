import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { TransportPricingService } from './transport-pricing.service';

type CalculateTransportPricingBody = {
  serviceTypeId: string;
  routeId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  paxCount: number;
  travelDate?: string;
};

type UpsertTransportPricingRuleBody = {
  routeId: string;
  transportServiceTypeId: string;
  vehicleId: string;
  pricingMode: 'per_vehicle' | 'capacity_unit';
  minPax: number;
  maxPax: number;
  unitCapacity?: number | null;
  baseCost: number;
  discountPercent?: number;
  currency: string;
  isActive?: boolean;
};

@Controller('transport-pricing')
export class TransportPricingController {
  constructor(private readonly transportPricingService: TransportPricingService) {}

  @Get('rules')
  findAllRules() {
    return this.transportPricingService.findAllRules();
  }

  @Post('rules')
  @Roles('admin', 'finance')
  createRule(@Body() body: UpsertTransportPricingRuleBody) {
    return this.transportPricingService.createRule({
      routeId: body.routeId,
      transportServiceTypeId: body.transportServiceTypeId,
      vehicleId: body.vehicleId,
      pricingMode: body.pricingMode,
      minPax: Number(body.minPax),
      maxPax: Number(body.maxPax),
      unitCapacity: body.unitCapacity === undefined ? undefined : body.unitCapacity === null ? null : Number(body.unitCapacity),
      baseCost: Number(body.baseCost),
      discountPercent: body.discountPercent === undefined ? undefined : Number(body.discountPercent),
      currency: body.currency,
      isActive: body.isActive,
    });
  }

  @Patch('rules/:id')
  @Roles('admin', 'finance')
  updateRule(
    @Param('id') id: string,
    @Body() body: UpsertTransportPricingRuleBody,
  ) {
    return this.transportPricingService.updateRule(id, {
      routeId: body.routeId,
      transportServiceTypeId: body.transportServiceTypeId,
      vehicleId: body.vehicleId,
      pricingMode: body.pricingMode,
      minPax: Number(body.minPax),
      maxPax: Number(body.maxPax),
      unitCapacity: body.unitCapacity === undefined ? undefined : body.unitCapacity === null ? null : Number(body.unitCapacity),
      baseCost: Number(body.baseCost),
      discountPercent: body.discountPercent === undefined ? undefined : Number(body.discountPercent),
      currency: body.currency,
      isActive: body.isActive,
    });
  }

  @Delete('rules/:id')
  @Roles('admin', 'finance')
  deleteRule(@Param('id') id: string) {
    return this.transportPricingService.deleteRule(id);
  }

  @Post('calculate')
  calculate(@Body() body: CalculateTransportPricingBody) {
    return this.transportPricingService.calculate({
      serviceTypeId: body.serviceTypeId,
      routeId: body.routeId,
      fromPlaceId: body.fromPlaceId,
      toPlaceId: body.toPlaceId,
      routeName: body.routeName,
      paxCount: Number(body.paxCount),
      travelDate: body.travelDate ? new Date(body.travelDate) : undefined,
    });
  }
}
