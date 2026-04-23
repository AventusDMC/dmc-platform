import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Actor } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { ContactsService } from './contacts.service';

type CreateContactBody = {
  companyId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
};

type UpdateContactBody = {
  companyId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  title?: string;
};

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  findAll(@Actor() actor: AuthenticatedActor) {
    return this.contactsService.findAll(actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.contactsService.findOne(id, actor);
  }

  @Post()
  create(@Body() body: CreateContactBody, @Actor() actor: AuthenticatedActor) {
    return this.contactsService.create(body, actor);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateContactBody, @Actor() actor: AuthenticatedActor) {
    return this.contactsService.update(id, body, actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.contactsService.remove(id, actor);
  }
}
