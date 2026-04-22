import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { VehicleRatesService } from './vehicle-rates.service';

type CreateVehicleRateBody = {
  vehicleId: string;
  serviceTypeId: string;
  routeId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  minPax: number;
  maxPax: number;
  price: number;
  currency: string;
  validFrom: string;
  validTo: string;
};

type UpdateVehicleRateBody = Partial<CreateVehicleRateBody>;

@Controller('vehicle-rates')
export class VehicleRatesController {
  constructor(private readonly vehicleRatesService: VehicleRatesService) {}

  @Get()
  findAll() {
    return this.vehicleRatesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehicleRatesService.findOne(id);
  }

  @Post()
  @Roles('admin', 'finance')
  create(@Body() body: CreateVehicleRateBody) {
    return this.vehicleRatesService.create({
      vehicleId: body.vehicleId,
      serviceTypeId: body.serviceTypeId,
      routeId: body.routeId,
      fromPlaceId: body.fromPlaceId,
      toPlaceId: body.toPlaceId,
      routeName: body.routeName,
      minPax: Number(body.minPax),
      maxPax: Number(body.maxPax),
      price: Number(body.price),
      currency: body.currency,
      validFrom: new Date(body.validFrom),
      validTo: new Date(body.validTo),
    });
  }

  @Post(':id/duplicate')
  @Roles('admin', 'finance')
  duplicate(@Param('id') id: string) {
    return this.vehicleRatesService.duplicate(id);
  }

  @Patch(':id')
  @Roles('admin', 'finance')
  update(
    @Param('id') id: string,
    @Body() body: UpdateVehicleRateBody,
  ) {
    return this.vehicleRatesService.update(id, {
      vehicleId: body.vehicleId,
      serviceTypeId: body.serviceTypeId,
      routeId: body.routeId,
      fromPlaceId: body.fromPlaceId,
      toPlaceId: body.toPlaceId,
      routeName: body.routeName,
      minPax: body.minPax === undefined ? undefined : Number(body.minPax),
      maxPax: body.maxPax === undefined ? undefined : Number(body.maxPax),
      price: body.price === undefined ? undefined : Number(body.price),
      currency: body.currency,
      validFrom: body.validFrom === undefined ? undefined : new Date(body.validFrom),
      validTo: body.validTo === undefined ? undefined : new Date(body.validTo),
    });
  }

  @Delete(':id')
  @Roles('admin', 'finance')
  remove(@Param('id') id: string) {
    return this.vehicleRatesService.remove(id);
  }
}
