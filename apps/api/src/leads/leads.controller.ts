import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Actor } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
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
  findAll(@Actor() actor: AuthenticatedActor) {
    return this.leadsService.findAll(actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.leadsService.findOne(id, actor);
  }

  @Post()
  create(@Body() body: CreateLeadBody, @Actor() actor: AuthenticatedActor) {
    return this.leadsService.create(body, actor);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateLeadBody, @Actor() actor: AuthenticatedActor) {
    return this.leadsService.update(id, body, actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.leadsService.remove(id, actor);
  }

  @Post(':id/convert')
  convert(@Param('id') id: string, @Body() body: ConvertLeadBody, @Actor() actor: AuthenticatedActor) {
    return this.leadsService.convert(id, body, actor);
  }
}
