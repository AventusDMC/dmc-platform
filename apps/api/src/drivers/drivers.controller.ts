import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { DriversService } from './drivers.service';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  // Operations grid dropdown calls /drivers?supplierId=<id>&active=true
  // to scope the picker to drivers of the supplier already assigned on the
  // service. Both query params optional.
  @Get()
  findAll(@Query('supplierId') supplierId?: string, @Query('active') active?: string) {
    const filter: { supplierId?: string | null; active?: boolean } = {};
    if (supplierId) filter.supplierId = supplierId;
    if (active === 'true') filter.active = true;
    if (active === 'false') filter.active = false;
    return this.driversService.findAll(filter);
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: any) {
    return this.driversService.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: any) {
    return this.driversService.update(id, body);
  }
}
