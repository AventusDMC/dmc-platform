import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/auth.decorators';
import { VehicleRatesService } from './vehicle-rates.service';

const { memoryStorage } = require('multer');

type CreateVehicleRateBody = {
  vehicleId: string;
  serviceTypeId: string;
  supplierId?: string | null;
  routeId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  minPax: number;
  maxPax: number;
  price: number;
  currency: string;
  active?: boolean;
  validFrom: string;
  validTo: string;
};

type UpdateVehicleRateBody = Partial<CreateVehicleRateBody>;

@Controller('vehicle-rates')
export class VehicleRatesController {
  constructor(private readonly vehicleRatesService: VehicleRatesService) {}

  @Get()
  findAll() {
    return this.vehicleRatesService.findAll();
  }

  @Get('import-template')
  @Roles('admin', 'finance')
  getImportTemplate(@Res({ passthrough: true }) response: any) {
    const buffer = this.vehicleRatesService.getTransportContractImportTemplate();
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="transport-contract-import-template.xlsx"',
    });

    return new StreamableFile(buffer);
  }

  @Post('import-preview')
  @Roles('admin', 'finance')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  previewImport(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Transport contract Excel file is required');
    }

    return this.vehicleRatesService.previewTransportContractImport(file);
  }

  @Post('import')
  @Roles('admin', 'finance')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  importContract(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('Transport contract Excel file is required');
    }

    return this.vehicleRatesService.importTransportContract(file);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehicleRatesService.findOne(id);
  }

  @Post()
  @Roles('admin', 'finance')
  create(@Body() body: CreateVehicleRateBody) {
    return this.vehicleRatesService.create({
      vehicleId: body.vehicleId,
      serviceTypeId: body.serviceTypeId,
      supplierId: body.supplierId === undefined ? undefined : body.supplierId || null,
      routeId: body.routeId,
      fromPlaceId: body.fromPlaceId,
      toPlaceId: body.toPlaceId,
      routeName: body.routeName,
      minPax: Number(body.minPax),
      maxPax: Number(body.maxPax),
      price: Number(body.price),
      currency: body.currency,
      active: body.active,
      validFrom: new Date(body.validFrom),
      validTo: new Date(body.validTo),
    });
  }

  @Post(':id/duplicate')
  @Roles('admin', 'finance')
  duplicate(@Param('id') id: string) {
    return this.vehicleRatesService.duplicate(id);
  }

  @Patch(':id')
  @Roles('admin', 'finance')
  update(
    @Param('id') id: string,
    @Body() body: UpdateVehicleRateBody,
  ) {
    return this.vehicleRatesService.update(id, {
      vehicleId: body.vehicleId,
      serviceTypeId: body.serviceTypeId,
      supplierId: body.supplierId === undefined ? undefined : body.supplierId || null,
      routeId: body.routeId,
      fromPlaceId: body.fromPlaceId,
      toPlaceId: body.toPlaceId,
      routeName: body.routeName,
      minPax: body.minPax === undefined ? undefined : Number(body.minPax),
      maxPax: body.maxPax === undefined ? undefined : Number(body.maxPax),
      price: body.price === undefined ? undefined : Number(body.price),
      currency: body.currency,
      active: body.active,
      validFrom: body.validFrom === undefined ? undefined : new Date(body.validFrom),
      validTo: body.validTo === undefined ? undefined : new Date(body.validTo),
    });
  }

  @Delete(':id')
  @Roles('admin', 'finance')
  remove(@Param('id') id: string) {
    return this.vehicleRatesService.remove(id);
  }
}
