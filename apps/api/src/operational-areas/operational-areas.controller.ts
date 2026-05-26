import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { OperationalAreaInput, OperationalAreasService, OPERATIONAL_AREA_TYPES } from './operational-areas.service';

type CreateBody = OperationalAreaInput;
type UpdateBody = Partial<OperationalAreaInput>;

@Controller('operational-areas')
export class OperationalAreasController {
  constructor(private readonly operationalAreasService: OperationalAreasService) {}

  @Get()
  findAll(
    @Query('onlyActive') onlyActive?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.operationalAreasService.findAll({
      onlyActive: onlyActive === 'true',
      type,
      search,
    });
  }

  // IMPORTANT: static-path GETs declared BEFORE @Get(':id'). Same lesson
  // we learned from /route-standards/areas hitting :id and 500ing on
  // Prisma UUID parse — anything single-segment under /operational-areas
  // needs to live up here, not below.
  @Get('types')
  listTypes() {
    return OPERATIONAL_AREA_TYPES;
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.operationalAreasService.findByCode(code);
  }

  /**
   * Live preview of the auto-generated code for a name + type. Used by
   * the admin form's debounced "as you type" preview. Pure read — no
   * writes. excludeId lets the edit form skip self-matches.
   */
  @Post('preview-code')
  @Roles('admin', 'operations')
  previewCode(@Body() body: { name: string; type?: string; excludeId?: string; manualCode?: string }) {
    return this.operationalAreasService.previewAreaCode(body);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.operationalAreasService.findOne(id);
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: CreateBody) {
    return this.operationalAreasService.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: UpdateBody) {
    return this.operationalAreasService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.operationalAreasService.remove(id);
  }
}
