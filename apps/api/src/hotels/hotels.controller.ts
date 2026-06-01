import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { HotelsService } from './hotels.service';

type CreateHotelBody = {
  name: string;
  city?: string;
  cityId?: string | null;
  category?: string;
  hotelCategoryId?: string | null;
  supplierId: string;
  preferenceRank?: number | null;
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

  // Hotels Directory freeze fix — lightweight per-hotel summary used by
  // the /hotels page header + summary strip. Avoids the N+1 supplier
  // resolver loop in findAll(). MUST stay before @Get(':id').
  @Get('directory-summary')
  findDirectorySummary() {
    return this.hotelsService.findDirectorySummary();
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

  // Hotel Engine Phase 0 — read-only health audit. Returns counts of
  // hotels / contracts / rates / allotments / room categories AND a
  // `problems` block flagging records that are likely bad imports
  // (null/empty room category name, orphaned categories). MUST stay
  // before @Get(':id') so the literal path "admin" isn't read as UUID.
  @Get('admin/engine-health')
  getEngineHealth() {
    return this.hotelsService.getEngineHealth();
  }

  // Hotel Engine Phase 0 — destructive cleanup. POST body must
  // include `{ "confirm": "wipe-all-contracts" }`. Deletes every
  // hotel contract and cascades to rates / allotments / supplements /
  // policies / promotions via the schema's onDelete: Cascade rules.
  // Hotels and HotelRoomCategory rows are preserved.
  @Post('admin/wipe-contracts')
  wipeAllContracts(@Body() body: { confirm?: string }) {
    return this.hotelsService.wipeAllContracts(body?.confirm || '');
  }

  // Hotel Engine Phase 0 — destructive cleanup of malformed room
  // categories with null/empty name (the rows that crashed the
  // /hotels?tab=room-categories page client-side hydration). POST
  // body must include `{ "confirm": "wipe-invalid-room-categories" }`.
  @Post('admin/wipe-invalid-room-categories')
  wipeInvalidRoomCategories(@Body() body: { confirm?: string }) {
    return this.hotelsService.wipeInvalidRoomCategories(body?.confirm || '');
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
