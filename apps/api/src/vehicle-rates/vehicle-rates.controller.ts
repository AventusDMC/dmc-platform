import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
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
  notes?: string | null;
  active?: boolean;
  validFrom: string;
  validTo: string;
};

type UpdateVehicleRateBody = Partial<CreateVehicleRateBody>;
type SupplierRateCardQuery = {
  page?: string;
  limit?: string;
  supplierId?: string;
  routeId?: string;
  serviceCategory?: string;
  vehicleType?: string;
  pricingMode?: string;
  status?: string;
  search?: string;
};
type TransportImportRowAction = 'UPDATE_EXISTING' | 'SKIP_IMPORTED_ROW' | 'CREATE_NEW_VALIDITY_VERSION' | 'ARCHIVE_OLD_VERSION';

const TRANSPORT_IMPORT_ROW_ACTIONS = ['UPDATE_EXISTING', 'SKIP_IMPORTED_ROW', 'CREATE_NEW_VALIDITY_VERSION', 'ARCHIVE_OLD_VERSION'] as const;

@Controller('vehicle-rates')
export class VehicleRatesController {
  constructor(private readonly vehicleRatesService: VehicleRatesService) {}

  @Get()
  findAll() {
    return this.vehicleRatesService.findAll();
  }

  @Get('summary')
  getSummary() {
    return this.vehicleRatesService.getSummary();
  }

  @Get('cards')
  findCards(@Query() query: SupplierRateCardQuery) {
    return this.vehicleRatesService.findRateCards({
      page: query.page === undefined ? undefined : Number(query.page),
      limit: query.limit === undefined ? undefined : Number(query.limit),
      supplierId: query.supplierId,
      routeId: query.routeId,
      serviceCategory: query.serviceCategory,
      vehicleType: query.vehicleType,
      pricingMode: query.pricingMode,
      status: query.status,
      search: query.search,
    });
  }

  @Get('cards/:cardId')
  findCardDetail(@Param('cardId') cardId: string) {
    return this.vehicleRatesService.findRateCardDetail(cardId);
  }

  @Get('import-template')
  @Roles('admin', 'finance')
  async getImportTemplate(@Res({ passthrough: true }) response: any) {
    const buffer = await this.vehicleRatesService.getTransportContractImportTemplate();
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="transport-contract-import-template.xlsx"',
    });

    return new StreamableFile(buffer);
  }

  @Get('export')
  @Roles('admin', 'finance')
  async exportRateCard(@Query('rateCardId') rateCardId: string, @Res({ passthrough: true }) response: any) {
    const exported = await this.vehicleRatesService.exportTransportRateCard(rateCardId);
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${exported.fileName}"`,
    });

    return new StreamableFile(exported.buffer);
  }

  @Get('tariff-matrix/transfer/export')
  @Roles('admin', 'finance')
  async exportTransferRouteTariffMatrix(
    @Query('supplierId') supplierId: string | undefined,
    @Query('supplierName') supplierName: string | undefined,
    @Res({ passthrough: true }) response: any,
  ) {
    const exported = await this.vehicleRatesService.exportTransferRouteTariffMatrix({ supplierId, supplierName });
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${exported.fileName}"`,
    });

    return new StreamableFile(exported.buffer);
  }

  @Get('tariff-matrix/touring/export')
  @Roles('admin', 'finance')
  async exportTouringRouteTariffMatrix(
    @Query('supplierId') supplierId: string | undefined,
    @Query('supplierName') supplierName: string | undefined,
    @Res({ passthrough: true }) response: any,
  ) {
    const exported = await this.vehicleRatesService.exportTouringRouteTariffMatrix({ supplierId, supplierName });
    response.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${exported.fileName}"`,
    });

    return new StreamableFile(exported.buffer);
  }

  @Post('import-preview')
  @Roles('admin', 'finance')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  previewImport(
    @UploadedFile() file: any,
    @Body('contractMergeMode') contractMergeMode?: 'keep' | 'merge',
    @Body('contractNameOverride') contractNameOverride?: string,
    @Body('allowCreateSuppliers') allowCreateSuppliers?: string,
    @Body('rowActions') rowActions?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Transport contract Excel file is required');
    }

    return this.vehicleRatesService.previewTransportContractImport(file, {
      contractMergeMode,
      contractNameOverride,
      allowCreateSuppliers: allowCreateSuppliers === 'true',
      rowActions: this.parseImportRowActions(rowActions),
    });
  }

  @Post('import')
  @Roles('admin', 'finance')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  importContract(
    @UploadedFile() file: any,
    @Body('contractMergeMode') contractMergeMode?: 'keep' | 'merge',
    @Body('contractNameOverride') contractNameOverride?: string,
    @Body('allowCreateSuppliers') allowCreateSuppliers?: string,
    @Body('rowActions') rowActions?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Transport contract Excel file is required');
    }

    return this.vehicleRatesService.importTransportContract(file, {
      contractMergeMode,
      contractNameOverride,
      allowCreateSuppliers: allowCreateSuppliers === 'true',
      rowActions: this.parseImportRowActions(rowActions),
    });
  }

  private parseImportRowActions(value?: string): Record<number, TransportImportRowAction> | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('rowActions must be an object');
      }

      return Object.fromEntries(
        Object.entries(parsed)
          .map(([row, action]) => [Number(row), String(action)])
          .filter(([row, action]) => Number.isInteger(row) && TRANSPORT_IMPORT_ROW_ACTIONS.includes(String(action) as TransportImportRowAction)),
      ) as Record<number, TransportImportRowAction>;
    } catch {
      throw new BadRequestException('rowActions must be valid JSON keyed by workbook row number.');
    }
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
      notes: body.notes === undefined ? undefined : body.notes || null,
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

  @Post('auto-fill-addons')
  @Roles('admin', 'finance')
  autoFillAddOns(@Body('rateCardId') rateCardId: string) {
    return this.vehicleRatesService.autoFillTransportAddOns(rateCardId);
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
      notes: body.notes === undefined ? undefined : body.notes || null,
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
