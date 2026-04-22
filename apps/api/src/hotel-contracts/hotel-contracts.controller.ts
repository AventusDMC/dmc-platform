import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  constructor(private readonly hotelContractsService: HotelContractsService) {}

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hotelContractsService.findOne(id);
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
