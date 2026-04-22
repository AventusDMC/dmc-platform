import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ServicesService } from './services.service';

type CreateSupplierServiceBody = {
  supplierId: string;
  name: string;
  category?: string | null;
  serviceTypeId?: string | null;
  unitType: 'per_person' | 'per_room' | 'per_vehicle' | 'per_group' | 'per_night' | 'per_day';
  baseCost: number;
  currency: string;
};

type UpdateSupplierServiceBody = Partial<CreateSupplierServiceBody>;

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  findAll() {
    return this.servicesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: CreateSupplierServiceBody) {
    return this.servicesService.create({
      ...body,
      serviceTypeId: body.serviceTypeId || null,
      baseCost: Number(body.baseCost),
    });
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: UpdateSupplierServiceBody) {
    return this.servicesService.update(id, {
      ...body,
      serviceTypeId: body.serviceTypeId === undefined ? undefined : body.serviceTypeId || null,
      baseCost: body.baseCost === undefined ? undefined : Number(body.baseCost),
    });
  }

  @Delete(':id')
  @Roles('admin', 'operations')
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }
}
