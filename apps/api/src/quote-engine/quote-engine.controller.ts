import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { QuoteEngineService } from './quote-engine.service';

@Controller('quote-engine')
export class QuoteEngineController {
  constructor(private readonly quoteEngineService: QuoteEngineService) {}

  @Get('quotes')
  findQuotes() {
    return this.quoteEngineService.findQuotes();
  }

  @Post('quotes')
  @Roles('admin', 'operations')
  createQuote(@Body() body: unknown) {
    return this.quoteEngineService.createQuote(body);
  }

  @Get('quotes/:id')
  findQuote(@Param('id') id: string) {
    return this.quoteEngineService.findQuote(id);
  }

  @Patch('quotes/:id')
  @Roles('admin', 'operations')
  updateQuote(@Param('id') id: string, @Body() body: unknown) {
    return this.quoteEngineService.updateQuote(id, body);
  }

  @Delete('quotes/:id')
  @Roles('admin', 'operations')
  removeQuote(@Param('id') id: string) {
    return this.quoteEngineService.removeQuote(id);
  }

  @Post('quotes/:quoteId/segments')
  @Roles('admin', 'operations')
  createSegment(@Param('quoteId') quoteId: string, @Body() body: unknown) {
    return this.quoteEngineService.createSegment(quoteId, body);
  }

  @Patch('quotes/:quoteId/segments/reorder')
  @Roles('admin', 'operations')
  reorderSegments(@Param('quoteId') quoteId: string, @Body() body: { segmentIds?: string[] }) {
    return this.quoteEngineService.reorderSegments(quoteId, body.segmentIds || []);
  }

  @Patch('segments/:id')
  @Roles('admin', 'operations')
  updateSegment(@Param('id') id: string, @Body() body: unknown) {
    return this.quoteEngineService.updateSegment(id, body);
  }

  @Delete('segments/:id')
  @Roles('admin', 'operations')
  removeSegment(@Param('id') id: string) {
    return this.quoteEngineService.removeSegment(id);
  }

  @Post('quotes/:quoteId/connections')
  @Roles('admin', 'operations')
  createConnection(@Param('quoteId') quoteId: string, @Body() body: unknown) {
    return this.quoteEngineService.createConnection(quoteId, body);
  }

  @Patch('connections/:id')
  @Roles('admin', 'operations')
  updateConnection(@Param('id') id: string, @Body() body: unknown) {
    return this.quoteEngineService.updateConnection(id, body);
  }

  @Delete('connections/:id')
  @Roles('admin', 'operations')
  removeConnection(@Param('id') id: string) {
    return this.quoteEngineService.removeConnection(id);
  }

  @Post('segments/:segmentId/days')
  @Roles('admin', 'operations')
  createDay(@Param('segmentId') segmentId: string, @Body() body: unknown) {
    return this.quoteEngineService.createDay(segmentId, body);
  }

  @Patch('days/:id')
  @Roles('admin', 'operations')
  updateDay(@Param('id') id: string, @Body() body: unknown) {
    return this.quoteEngineService.updateDay(id, body);
  }

  @Delete('days/:id')
  @Roles('admin', 'operations')
  removeDay(@Param('id') id: string) {
    return this.quoteEngineService.removeDay(id);
  }

  @Post('days/:dayId/services')
  @Roles('admin', 'operations')
  createDayService(@Param('dayId') dayId: string, @Body() body: unknown) {
    return this.quoteEngineService.createDayService(dayId, body);
  }

  @Patch('day-services/:id')
  @Roles('admin', 'operations')
  updateDayService(@Param('id') id: string, @Body() body: unknown) {
    return this.quoteEngineService.updateDayService(id, body);
  }

  @Delete('day-services/:id')
  @Roles('admin', 'operations')
  removeDayService(@Param('id') id: string) {
    return this.quoteEngineService.removeDayService(id);
  }

  @Post('segments/:segmentId/hotel-option-sets')
  @Roles('admin', 'operations')
  createHotelOptionSet(@Param('segmentId') segmentId: string, @Body() body: unknown) {
    return this.quoteEngineService.createHotelOptionSet(segmentId, body);
  }

  @Patch('hotel-option-sets/:id')
  @Roles('admin', 'operations')
  updateHotelOptionSet(@Param('id') id: string, @Body() body: unknown) {
    return this.quoteEngineService.updateHotelOptionSet(id, body);
  }

  @Delete('hotel-option-sets/:id')
  @Roles('admin', 'operations')
  removeHotelOptionSet(@Param('id') id: string) {
    return this.quoteEngineService.removeHotelOptionSet(id);
  }

  @Post('hotel-option-sets/:optionSetId/options')
  @Roles('admin', 'operations')
  createHotelOption(@Param('optionSetId') optionSetId: string, @Body() body: unknown) {
    return this.quoteEngineService.createHotelOption(optionSetId, body);
  }

  @Patch('hotel-options/:id')
  @Roles('admin', 'operations')
  updateHotelOption(@Param('id') id: string, @Body() body: unknown) {
    return this.quoteEngineService.updateHotelOption(id, body);
  }

  @Delete('hotel-options/:id')
  @Roles('admin', 'operations')
  removeHotelOption(@Param('id') id: string) {
    return this.quoteEngineService.removeHotelOption(id);
  }

  @Post('segments/:segmentId/external-requests')
  @Roles('admin', 'operations')
  createExternalRequest(@Param('segmentId') segmentId: string, @Body() body: unknown) {
    return this.quoteEngineService.createExternalRequest(segmentId, body);
  }

  @Patch('external-requests/:id')
  @Roles('admin', 'operations')
  updateExternalRequest(@Param('id') id: string, @Body() body: unknown) {
    return this.quoteEngineService.updateExternalRequest(id, body);
  }

  @Delete('external-requests/:id')
  @Roles('admin', 'operations')
  removeExternalRequest(@Param('id') id: string) {
    return this.quoteEngineService.removeExternalRequest(id);
  }

  @Post('external-requests/:requestId/quotes')
  @Roles('admin', 'operations')
  createExternalQuote(@Param('requestId') requestId: string, @Body() body: unknown) {
    return this.quoteEngineService.createExternalQuote(requestId, body);
  }

  @Patch('external-quotes/:id')
  @Roles('admin', 'operations')
  updateExternalQuote(@Param('id') id: string, @Body() body: unknown) {
    return this.quoteEngineService.updateExternalQuote(id, body);
  }

  @Delete('external-quotes/:id')
  @Roles('admin', 'operations')
  removeExternalQuote(@Param('id') id: string) {
    return this.quoteEngineService.removeExternalQuote(id);
  }

  @Post('quotes/:quoteId/pricing-matrices')
  @Roles('admin', 'operations')
  upsertPricingMatrix(@Param('quoteId') quoteId: string, @Body() body: unknown) {
    return this.quoteEngineService.upsertPricingMatrix(quoteId, body);
  }

  @Delete('pricing-matrices/:id')
  @Roles('admin', 'operations')
  removePricingMatrix(@Param('id') id: string) {
    return this.quoteEngineService.removePricingMatrix(id);
  }
}
