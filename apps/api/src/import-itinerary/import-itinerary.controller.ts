import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ImportItineraryService } from './import-itinerary.service';
import { QuotesService } from '../quotes/quotes.service';

type ParseItineraryBody = {
  rawText?: string;
  sourceType?: 'text';
};

type ParsedItineraryItemType =
  | 'stay'
  | 'transfer'
  | 'activity'
  | 'meal'
  | 'other'
  | 'hotel'
  | 'transport'
  | 'flight'
  | 'guide';

type CreateQuoteDraftBody = {
  sourceType?: 'text';
  days?: Array<{
    dayNumber?: number;
    title?: string;
    summary?: string;
  }>;
  items?: Array<{
    dayNumber?: number;
    type?: ParsedItineraryItemType;
    title?: string;
    description?: string;
    notes?: string;
  }>;
  unresolved?: Array<{
    type?: ParsedItineraryItemType;
    title?: string;
    description?: string;
    notes?: string;
  }>;
};

@Controller('import-itinerary')
export class ImportItineraryController {
  constructor(
    private readonly importItineraryService: ImportItineraryService,
    private readonly quotesService: QuotesService,
  ) {}

  @Post('parse')
  async parse(@Body() body: ParseItineraryBody) {
    const rawText = body.rawText?.trim();

    if (!rawText) {
      throw new BadRequestException('rawText is required');
    }

    return this.importItineraryService.parse({
      rawText,
      sourceType: body.sourceType || 'text',
    });
  }

  @Post('create-quote-draft')
  async createQuoteDraft(@Body() body: CreateQuoteDraftBody) {
    if (!Array.isArray(body.days) || !Array.isArray(body.items)) {
      throw new BadRequestException('days and items are required');
    }

    return this.quotesService.createDraftFromImportedItinerary({
      sourceType: body.sourceType || 'text',
      days: body.days.map((day, index) => ({
        dayNumber: Number(day.dayNumber ?? index + 1),
        title: typeof day.title === 'string' ? day.title : '',
        summary: typeof day.summary === 'string' ? day.summary : '',
      })),
      items: body.items.map((item, index) => ({
        dayNumber: Number(item.dayNumber ?? 1),
        type: this.normalizeDraftItemType(item.type),
        title: typeof item.title === 'string' ? item.title : `Imported item ${index + 1}`,
        description: typeof item.description === 'string' ? item.description : '',
        notes: typeof item.notes === 'string' ? item.notes : '',
      })),
      unresolved: Array.isArray(body.unresolved)
        ? body.unresolved.map((item, index) => ({
            type: this.normalizeDraftItemType(item.type),
            title: typeof item.title === 'string' ? item.title : `Unresolved item ${index + 1}`,
            description: typeof item.description === 'string' ? item.description : '',
            notes: typeof item.notes === 'string' ? item.notes : '',
          }))
        : [],
    });
  }

  private normalizeDraftItemType(value: ParsedItineraryItemType | undefined) {
    if (value === 'stay') {
      return 'hotel' as const;
    }

    if (value === 'transfer') {
      return 'transport' as const;
    }

    if (value === 'activity' || value === 'meal' || value === 'other' || value === 'hotel' || value === 'transport') {
      return value;
    }

    if (value === 'flight' || value === 'guide') {
      return value;
    }

    return 'other' as const;
  }
}
