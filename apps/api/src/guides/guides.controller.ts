import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { GuidesService } from './guides.service';

@Controller('guides')
export class GuidesController {
  constructor(private readonly guidesService: GuidesService) {}

  @Get()
  findAll() {
    return this.guidesService.findAll();
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: any) {
    return this.guidesService.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: any) {
    return this.guidesService.update(id, body);
  }

  @Get(':id/availability')
  availability(@Param('id') id: string) {
    return this.guidesService.availability(id);
  }

  @Post(':id/blocked-dates')
  @Roles('admin', 'operations')
  blockDate(@Param('id') id: string, @Body() body: any) {
    return this.guidesService.blockDate(id, body);
  }
}
