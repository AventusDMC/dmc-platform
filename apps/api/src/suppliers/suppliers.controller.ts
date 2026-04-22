import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { SuppliersService } from './suppliers.service';

type CreateSupplierBody = {
  name: string;
  type: 'hotel' | 'transport' | 'activity' | 'guide' | 'other';
  email?: string;
  phone?: string;
  notes?: string;
};

type UpdateSupplierBody = {
  name?: string;
  type?: 'hotel' | 'transport' | 'activity' | 'guide' | 'other';
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  findAll() {
    return this.suppliersService.findAll();
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: CreateSupplierBody) {
    return this.suppliersService.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: UpdateSupplierBody) {
    return this.suppliersService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin', 'operations')
  remove(@Param('id') id: string) {
    return this.suppliersService.remove(id);
  }
}
