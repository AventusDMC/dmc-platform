import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { LeadsService } from './leads.service';

type CreateLeadBody = {
  inquiry: string;
  source?: string;
  status?: string;
};

type UpdateLeadBody = {
  inquiry?: string;
  source?: string;
  status?: string;
};

type ConvertLeadBody = {
  companyName: string;
  contactName: string;
  email?: string;
};

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  findAll() {
    return this.leadsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateLeadBody) {
    return this.leadsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateLeadBody) {
    return this.leadsService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leadsService.remove(id);
  }

  @Post(':id/convert')
  convert(@Param('id') id: string, @Body() body: ConvertLeadBody) {
    return this.leadsService.convert(id, body);
  }
}
