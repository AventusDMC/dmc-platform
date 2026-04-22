import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ServiceTypesService } from './service-types.service';

type CreateServiceTypeBody = {
  name: string;
  code?: string | null;
  isActive?: boolean;
};

type UpdateServiceTypeBody = Partial<CreateServiceTypeBody>;

@Controller('service-types')
export class ServiceTypesController {
  constructor(private readonly serviceTypesService: ServiceTypesService) {}

  @Get()
  findAll(@Query('search') search?: string, @Query('active') active?: string) {
    return this.serviceTypesService.findAll({
      search,
      active: active === undefined ? undefined : active !== 'false',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serviceTypesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateServiceTypeBody) {
    return this.serviceTypesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateServiceTypeBody) {
    return this.serviceTypesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.serviceTypesService.remove(id);
  }
}
