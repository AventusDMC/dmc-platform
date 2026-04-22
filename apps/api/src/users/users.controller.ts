import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { DmcRole } from '../auth/auth.types';
import { UsersService } from './users.service';

type CreateUserBody = {
  name?: string;
  email?: string;
  role?: DmcRole;
};

type UpdateUserBody = {
  name?: string;
  email?: string;
  role?: DmcRole;
};

@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(@Body() body: CreateUserBody) {
    return this.usersService.create({
      name: String(body.name || '').trim(),
      email: String(body.email || '').trim(),
      role: (body.role || 'sales') as DmcRole,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateUserBody) {
    return this.usersService.update(id, {
      name: body.name?.trim(),
      email: body.email?.trim(),
      role: body.role,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
