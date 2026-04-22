import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { TransportServiceTypesService } from './transport-service-types.service';

type CreateTransportServiceTypeBody = {
  name: string;
  code: string;
};

type UpdateTransportServiceTypeBody = Partial<CreateTransportServiceTypeBody>;

@Controller('transport-service-types')
export class TransportServiceTypesController {
  constructor(private readonly transportServiceTypesService: TransportServiceTypesService) {}

  @Get()
  findAll() {
    return this.transportServiceTypesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transportServiceTypesService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateTransportServiceTypeBody) {
    return this.transportServiceTypesService.create({
      name: body.name,
      code: body.code,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateTransportServiceTypeBody) {
    return this.transportServiceTypesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transportServiceTypesService.remove(id);
  }
}
