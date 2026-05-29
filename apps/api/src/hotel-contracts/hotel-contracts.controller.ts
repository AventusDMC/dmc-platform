import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EXCEL_MIME, HotelContractExportService } from './hotel-contract-export.service';
import { HotelContractImportService } from './hotel-contract-import.service';
import { HotelContractsService } from './hotel-contracts.service';

type CreateHotelContractBody = {
  hotelId: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
};

type UpdateHotelContractBody = Partial<CreateHotelContractBody>;

type CreateHotelAllotmentBody = {
  roomCategoryId: string;
  dateFrom: string;
  dateTo: string;
  allotment: number;
  releaseDays?: number;
  stopSale?: boolean;
  notes?: string | null;
  isActive?: boolean;
};

type UpdateHotelAllotmentBody = Partial<CreateHotelAllotmentBody>;

@Controller('hotel-contracts')
export class HotelContractsController {
  constructor(
    private readonly hotelContractsService: HotelContractsService,
    private readonly hotelContractExportService: HotelContractExportService,
    private readonly hotelContractImportService: HotelContractImportService,
  ) {}

  @Get()
  findAll() {
    return this.hotelContractsService.findAll();
  }

  @Get(':id/allotments/evaluate')
  evaluateAllotment(
    @Param('id') id: string,
    @Query('roomCategoryId') roomCategoryId: string,
    @Query('stayDate') stayDate: string,
    @Query('bookingDate') bookingDate?: string,
  ) {
    return this.hotelContractsService.evaluateAllotment(
      id,
      roomCategoryId,
      new Date(stayDate),
      bookingDate ? new Date(bookingDate) : undefined,
    );
  }

  @Get(':id/allotments/daily-summary')
  getContractDailySummary(
    @Param('id') id: string,
    @Query('roomCategoryId') roomCategoryId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('bookingDate') bookingDate?: string,
  ) {
    return this.hotelContractsService.getContractDailySummary(id, {
      roomCategoryId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      bookingDate: bookingDate ? new Date(bookingDate) : undefined,
    });
  }

  @Get(':id/allotments/:allotmentId/daily-summary')
  getAllotmentDailySummary(
    @Param('id') id: string,
    @Param('allotmentId') allotmentId: string,
    @Query('bookingDate') bookingDate?: string,
  ) {
    return this.hotelContractsService.getAllotmentDailySummary(id, allotmentId, bookingDate ? new Date(bookingDate) : undefined);
  }

  // Lightweight aggregated Room Types view. MUST stay before @Get(':id')
  // — otherwise Nest matches "room-types-summary" as a UUID and the
  // service throws a Prisma 500 on the invalid ID lookup. Same trap as
  // the Operational Areas /areas endpoint fix in PR #104.
  @Get(':id/room-types-summary')
  findRoomTypesSummary(@Param('id') id: string) {
    return this.hotelContractsService.findRoomTypesSummary(id);
  }

  // Excel export — full round-trip workbook with every editable entity
  // on the contract (rates / supplements / cancellation / child policy
  // / meal plans). Same static-vs-:id ordering rule as above: this
  // route must stay declared BEFORE @Get(':id'). The import endpoint
  // that consumes this same shape will land in a follow-up PR.
  @Get(':id/export.xlsx')
  async exportContract(@Param('id') id: string): Promise<StreamableFile> {
    const { buffer, fileName } = await this.hotelContractExportService.exportContract(id);
    return new StreamableFile(buffer, {
      type: EXCEL_MIME,
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  // Excel import — PREVIEW (dry-run). Accepts an uploaded workbook
  // produced by the export above and reports what an import would change,
  // writing nothing. The apply phase lands in a follow-up.
  @Post(':id/import-preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  importPreview(@Param('id') id: string, @UploadedFile() file: any) {
    if (!file?.buffer) {
      throw new BadRequestException('An Excel (.xlsx) workbook file is required.');
    }
    return this.hotelContractImportService.preview(id, file.buffer);
  }

  // Unified audit trail across the contract's edited entities
  // (supplements / cancellation / child policy / meal plans / occupancy).
  // Same static-before-:id ordering rule as the routes above.
  @Get(':id/audit-log')
  findAuditLog(@Param('id') id: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hotelContractsService.getAuditLog(id, {
      limit: limit === undefined ? null : Number(limit),
      offset: offset === undefined ? null : Number(offset),
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('summary') summary?: string) {
    return summary === '1' || summary === 'true'
      ? this.hotelContractsService.findOneSummary(id)
      : this.hotelContractsService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateHotelContractBody) {
    return this.hotelContractsService.create({
      hotelId: body.hotelId,
      name: body.name,
      validFrom: new Date(body.validFrom),
      validTo: new Date(body.validTo),
      currency: body.currency,
    });
  }

  @Post(':id/allotments')
  createAllotment(@Param('id') id: string, @Body() body: CreateHotelAllotmentBody) {
    return this.hotelContractsService.createAllotment(id, {
      roomCategoryId: body.roomCategoryId,
      dateFrom: new Date(body.dateFrom),
      dateTo: new Date(body.dateTo),
      allotment: Number(body.allotment),
      releaseDays: Number(body.releaseDays ?? 0),
      stopSale: Boolean(body.stopSale),
      notes: body.notes,
      isActive: body.isActive ?? true,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateHotelContractBody) {
    return this.hotelContractsService.update(id, {
      hotelId: body.hotelId,
      name: body.name,
      validFrom: body.validFrom === undefined ? undefined : new Date(body.validFrom),
      validTo: body.validTo === undefined ? undefined : new Date(body.validTo),
      currency: body.currency,
    });
  }

  @Patch(':id/allotments/:allotmentId')
  updateAllotment(@Param('id') id: string, @Param('allotmentId') allotmentId: string, @Body() body: UpdateHotelAllotmentBody) {
    return this.hotelContractsService.updateAllotment(id, allotmentId, {
      roomCategoryId: body.roomCategoryId,
      dateFrom: body.dateFrom === undefined ? undefined : new Date(body.dateFrom),
      dateTo: body.dateTo === undefined ? undefined : new Date(body.dateTo),
      allotment: body.allotment === undefined ? undefined : Number(body.allotment),
      releaseDays: body.releaseDays === undefined ? undefined : Number(body.releaseDays),
      stopSale: body.stopSale,
      notes: body.notes,
      isActive: body.isActive,
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.hotelContractsService.remove(id);
  }

  @Delete(':id/allotments/:allotmentId')
  removeAllotment(@Param('id') id: string, @Param('allotmentId') allotmentId: string) {
    return this.hotelContractsService.removeAllotment(id, allotmentId);
  }
}
