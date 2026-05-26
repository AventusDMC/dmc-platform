import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { HotelsService } from './hotels.service';

type CreateHotelBody = {
  name: string;
  city?: string;
  cityId?: string | null;
  category?: string;
  hotelCategoryId?: string | null;
  supplierId: string;
};

type UpdateHotelBody = Partial<CreateHotelBody>;

type UpsertHotelFactSheetBody = {
  shortDescription?: string | null;
  highlightsJson?: unknown;
  amenitiesJson?: unknown;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  imageGalleryJson?: unknown;
};

type CreateHotelRoomCategoryBody = {
  name: string;
  code?: string;
  description?: string;
  isActive?: boolean;
};

type UpdateHotelRoomCategoryBody = Partial<CreateHotelRoomCategoryBody>;

@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get()
  findAll() {
    return this.hotelsService.findAll();
  }

  // Hotel Master Room Categories freeze fix — lightweight summary route.
  // MUST stay before @Get(':id') so the literal path "room-categories-
  // summary" isn't interpreted as a UUID (same trap as PR #104's
  // /areas + PR #118's /room-types-summary).
  @Get('room-categories-summary')
  findRoomCategoriesSummary(@Query('hotelId') hotelId?: string) {
    return this.hotelsService.findRoomCategoriesSummary({ hotelId });
  }

  // Per-category detail loaded only when the operator expands a row.
  @Get('room-categories/:categoryId')
  findRoomCategoryDetail(@Param('categoryId') categoryId: string) {
    return this.hotelsService.findRoomCategoryDetail(categoryId);
  }

  // Spec-mandated per-hotel variant. Wraps the same service method.
  @Get(':id/room-categories-summary')
  findHotelRoomCategoriesSummary(@Param('id') hotelId: string) {
    return this.hotelsService.findRoomCategoriesSummary({ hotelId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hotelsService.findOne(id);
  }

  @Post()
  create(@Body() body: CreateHotelBody) {
    return this.hotelsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateHotelBody) {
    return this.hotelsService.update(id, body);
  }

  @Patch(':id/fact-sheet')
  upsertFactSheet(@Param('id') id: string, @Body() body: UpsertHotelFactSheetBody) {
    return this.hotelsService.upsertFactSheet(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.hotelsService.remove(id);
  }

  @Post(':id/room-categories')
  createRoomCategory(@Param('id') hotelId: string, @Body() body: CreateHotelRoomCategoryBody) {
    return this.hotelsService.createRoomCategory({
      hotelId,
      name: body.name,
      code: body.code,
      description: body.description,
      isActive: body.isActive,
    });
  }

  @Patch(':id/room-categories/:categoryId')
  updateRoomCategory(
    @Param('id') hotelId: string,
    @Param('categoryId') categoryId: string,
    @Body() body: UpdateHotelRoomCategoryBody,
  ) {
    return this.hotelsService.updateRoomCategory(hotelId, categoryId, body);
  }

  @Delete(':id/room-categories/:categoryId')
  removeRoomCategory(@Param('id') hotelId: string, @Param('categoryId') categoryId: string) {
    return this.hotelsService.removeRoomCategory(hotelId, categoryId);
  }
}
