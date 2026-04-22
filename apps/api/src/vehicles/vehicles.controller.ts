import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';

type CreateVehicleBody = {
  supplierId: string;
  name: string;
  maxPax: number;
  luggageCapacity: number;
};

type UpdateVehicleBody = Partial<CreateVehicleBody>;

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Get()
  findAll() {
    return this.vehiclesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateVehicleBody) {
    return this.vehiclesService.create({
      supplierId: body.supplierId,
      name: body.name,
      maxPax: Number(body.maxPax),
      luggageCapacity: Number(body.luggageCapacity),
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateVehicleBody) {
    return this.vehiclesService.update(id, {
      supplierId: body.supplierId,
      name: body.name,
      maxPax: body.maxPax === undefined ? undefined : Number(body.maxPax),
      luggageCapacity: body.luggageCapacity === undefined ? undefined : Number(body.luggageCapacity),
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
