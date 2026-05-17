import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Actor, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor, DmcRole } from '../auth/auth.types';
import { UsersService } from './users.service';

type CreateUserBody = {
  name?: string;
  email?: string;
  role?: DmcRole;
  companyId?: string | null;
  password?: string | null;
  active?: boolean;
};

type UpdateUserBody = {
  name?: string;
  email?: string;
  role?: DmcRole;
  companyId?: string | null;
  active?: boolean;
};

@Controller('users')
@Roles('admin', 'super_admin', 'agent_admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Actor() actor: AuthenticatedActor) {
    return this.usersService.findAll(actor);
  }

  @Get('agents')
  findAgents(@Actor() actor: AuthenticatedActor) {
    return this.usersService.findAgents(actor);
  }

  @Post()
  create(@Body() body: CreateUserBody, @Actor() actor: AuthenticatedActor) {
    return this.usersService.create({
      name: String(body.name || '').trim(),
      email: String(body.email || '').trim(),
      role: (body.role || 'viewer') as DmcRole,
      companyId: body.companyId,
      password: body.password,
      active: body.active,
    }, actor);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUserBody, @Actor() actor: AuthenticatedActor) {
    return this.usersService.update(id, {
      name: body.name?.trim(),
      email: body.email?.trim(),
      role: body.role,
      companyId: body.companyId,
      active: body.active,
    }, actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.usersService.remove(id, actor);
  }
}
