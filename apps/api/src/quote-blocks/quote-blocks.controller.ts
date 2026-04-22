import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { QuoteBlocksService } from './quote-blocks.service';

type QuoteBlockBody = {
  name: string;
  type: 'ITINERARY_DAY' | 'SERVICE_BLOCK';
  title: string;
  description?: string | null;
  defaultServiceId?: string | null;
  defaultServiceTypeId?: string | null;
  defaultCategory?: string | null;
  defaultCost?: number | null;
  defaultSell?: number | null;
};

@Controller('quote-blocks')
export class QuoteBlocksController {
  constructor(private readonly quoteBlocksService: QuoteBlocksService) {}

  @Get()
  findAll(@Query('type') type?: string) {
    return this.quoteBlocksService.findAll(type);
  }

  @Post()
  create(@Body() body: QuoteBlockBody) {
    return this.quoteBlocksService.create({
      name: body.name,
      type: body.type,
      title: body.title,
      description: body.description === undefined ? undefined : body.description || null,
      defaultServiceId: body.defaultServiceId === undefined ? undefined : body.defaultServiceId || null,
      defaultServiceTypeId: body.defaultServiceTypeId === undefined ? undefined : body.defaultServiceTypeId || null,
      defaultCategory: body.defaultCategory === undefined ? undefined : body.defaultCategory || null,
      defaultCost: body.defaultCost === undefined ? undefined : body.defaultCost === null ? null : Number(body.defaultCost),
      defaultSell: body.defaultSell === undefined ? undefined : body.defaultSell === null ? null : Number(body.defaultSell),
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<QuoteBlockBody>) {
    return this.quoteBlocksService.update(id, {
      name: body.name,
      type: body.type,
      title: body.title,
      description: body.description === undefined ? undefined : body.description || null,
      defaultServiceId: body.defaultServiceId === undefined ? undefined : body.defaultServiceId || null,
      defaultServiceTypeId: body.defaultServiceTypeId === undefined ? undefined : body.defaultServiceTypeId || null,
      defaultCategory: body.defaultCategory === undefined ? undefined : body.defaultCategory || null,
      defaultCost: body.defaultCost === undefined ? undefined : body.defaultCost === null ? null : Number(body.defaultCost),
      defaultSell: body.defaultSell === undefined ? undefined : body.defaultSell === null ? null : Number(body.defaultSell),
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.quoteBlocksService.remove(id);
  }
}
