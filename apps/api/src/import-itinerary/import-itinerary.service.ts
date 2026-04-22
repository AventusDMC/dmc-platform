import { Injectable } from '@nestjs/common';

type ParseItineraryInput = {
  rawText: string;
  sourceType: 'text';
};

type ParsedItineraryConfidence = 'high' | 'medium' | 'low';
type ParsedItineraryItemType = 'stay' | 'transfer' | 'activity' | 'meal' | 'other';

type ParsedItineraryDay = {
  dayNumber: number;
  title: string;
  summary?: string;
  destination?: string;
};

type ParsedItineraryItem = {
  id: string;
  dayNumber?: number;
  type: ParsedItineraryItemType;
  title: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  confidence: ParsedItineraryConfidence;
  needsReview: boolean;
  sourceText?: string;
};

type ParsedItineraryUnresolved = {
  id: string;
  text: string;
  suggestedType?: ParsedItineraryItemType;
  confidence: ParsedItineraryConfidence;
  reason?: string;
};

type ParsedItineraryResult = {
  sourceType: 'text';
  tripTitle: string;
  destinations: string[];
  days: ParsedItineraryDay[];
  items: ParsedItineraryItem[];
  unresolved: ParsedItineraryUnresolved[];
  parseWarnings: string[];
  sourceText: string;
};

type ParsedItineraryAiResponse = {
  tripTitle?: unknown;
  destinations?: unknown;
  days?: Array<{
    dayNumber?: unknown;
    title?: unknown;
    summary?: unknown;
    destination?: unknown;
  }>;
  items?: Array<{
    id?: unknown;
    dayNumber?: unknown;
    type?: unknown;
    title?: unknown;
    description?: unknown;
    location?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    confidence?: unknown;
    needsReview?: unknown;
    sourceText?: unknown;
  }>;
  unresolved?: Array<{
    id?: unknown;
    text?: unknown;
    suggestedType?: unknown;
    confidence?: unknown;
    reason?: unknown;
  }>;
  parseWarnings?: unknown;
};

type NormalizedDayDraft = {
  originalDayNumber: number;
  title: string;
  summary?: string;
  destination?: string;
};

type NormalizedItemDraft = {
  id: string;
  originalDayNumber?: number;
  type: ParsedItineraryItemType;
  title: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  confidence: ParsedItineraryConfidence;
  needsReview: boolean;
  sourceText?: string;
};

const AI_MODEL = process.env.OPENAI_ITINERARY_MODEL || 'gpt-4.1-mini';
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const ITEM_TYPES: ParsedItineraryItemType[] = ['stay', 'transfer', 'activity', 'meal', 'other'];
const DESTINATION_STOP_WORDS = new Set([
  'arrival',
  'departure',
  'check',
  'breakfast',
  'lunch',
  'dinner',
  'transfer',
  'drive',
  'tour',
  'visit',
  'overnight',
  'hotel',
  'day',
  'free',
  'time',
  'meal',
  'activity',
  'guide',
]);

@Injectable()
export class ImportItineraryService {
  async parse(input: ParseItineraryInput): Promise<ParsedItineraryResult> {
    const aiParsed = await this.parseWithAi(input.rawText);

    if (aiParsed) {
      return this.normalizeAiResult(aiParsed, input);
    }

    return this.buildFallbackResult(input);
  }

  private async parseWithAi(rawText: string): Promise<ParsedItineraryAiResponse | null> {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return null;
    }

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_MODEL,
          temperature: 0.1,
          text: {
            format: {
              type: 'json_object',
            },
          },
          input: [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text:
                    'Extract travel itinerary text into valid JSON only. Return top-level keys: tripTitle, destinations, days, items, unresolved, parseWarnings. ' +
                    'days must be an array of objects with: dayNumber, title, summary, destination. ' +
                    'items must be an array of objects with: id, dayNumber, type, title, description, location, startTime, endTime, confidence, needsReview, sourceText. ' +
                    'Supported item types: stay, transfer, activity, meal, other. ' +
                    'unresolved must be an array of objects with: id, text, suggestedType, confidence, reason. ' +
                    'Use high, medium, or low confidence only. Use null or empty arrays when unknown. Keep output compact and operationally useful.',
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: rawText,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI ERROR:', errorText);
        return null;
      }

      const data = (await response.json()) as {
        output?: Array<{
          content?: Array<{
            text?: string | null;
          }>;
        }>;
      };
      const content = data.output?.[0]?.content?.[0]?.text;

      if (!content) {
        return null;
      }

      return JSON.parse(content) as ParsedItineraryAiResponse;
    } catch {
      return null;
    }
  }

  private normalizeAiResult(parsed: ParsedItineraryAiResponse, input: ParseItineraryInput): ParsedItineraryResult {
    const normalizedDays = (parsed.days || []).map((day, index) => ({
      originalDayNumber: this.normalizeDayNumber(day.dayNumber, index + 1),
      title: this.toTrimmedString(day.title) || `Day ${index + 1}`,
      summary: this.emptyToUndefined(day.summary),
      destination: this.normalizeDestination(this.toTrimmedString(day.destination)),
    }));
    const normalizedItems = (parsed.items || []).map((item, index) => {
      const title = this.toTrimmedString(item.title) || this.buildFallbackTitle(this.toTrimmedString(item.sourceText) || this.toTrimmedString(item.description)) || `Item ${index + 1}`;
      const description = this.emptyToUndefined(item.description);
      const sourceText = this.emptyToUndefined(item.sourceText) || description || title;
      const confidence = this.normalizeConfidence(item.confidence, sourceText ? 'medium' : 'low');
      const location = this.emptyToUndefined(item.location);
      const inferredLocation = location || this.inferDestinationFromTexts([title, description || '', sourceText || '']);

      return {
        id: this.toTrimmedString(item.id) || `item-${index + 1}`,
        originalDayNumber: this.hasDayNumber(item.dayNumber) ? this.normalizeDayNumber(item.dayNumber, 1) : undefined,
        type: this.normalizeItemType(item.type),
        title,
        description,
        location: inferredLocation,
        startTime: this.emptyToUndefined(item.startTime),
        endTime: this.emptyToUndefined(item.endTime),
        confidence,
        needsReview: this.normalizeNeedsReview(item.needsReview, confidence, !this.hasDayNumber(item.dayNumber)),
        sourceText,
      } satisfies NormalizedItemDraft;
    });
    const normalizedUnresolved = (parsed.unresolved || [])
      .map((item, index) => ({
        id: this.toTrimmedString(item.id) || `unresolved-${index + 1}`,
        text: this.toTrimmedString(item.text),
        suggestedType: this.emptyToUndefined(item.suggestedType)
          ? this.normalizeItemType(item.suggestedType)
          : undefined,
        confidence: this.normalizeConfidence(item.confidence, 'low'),
        reason: this.emptyToUndefined(item.reason),
      }))
      .filter((item) => item.text);
    const parseWarnings = this.normalizeStringArray(parsed.parseWarnings);

    return this.finalizeResult({
      input,
      tripTitle: this.toTrimmedString(parsed.tripTitle),
      explicitDestinations: this.normalizeStringArray(parsed.destinations),
      days: normalizedDays,
      items: normalizedItems,
      unresolved: normalizedUnresolved,
      parseWarnings,
    });
  }

  private buildFallbackResult(input: ParseItineraryInput): ParsedItineraryResult {
    const lines = input.rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const days: NormalizedDayDraft[] = [];
    const items: NormalizedItemDraft[] = [];
    const unresolved: ParsedItineraryUnresolved[] = [];
    const parseWarnings = ['AI parsing unavailable; used fallback parsing.'];
    let titleCandidate = '';
    let currentDayNumber = 1;
    let currentDay: NormalizedDayDraft | null = null;

    for (const line of lines) {
      const dayMatch = line.match(/^day\s*(\d+)\s*[:\-\u2013]?\s*(.*)$/i);

      if (dayMatch) {
        currentDayNumber = Number(dayMatch[1]) || currentDayNumber + 1;
        currentDay = {
          originalDayNumber: currentDayNumber,
          title: dayMatch[2]?.trim() || `Day ${currentDayNumber}`,
          summary: undefined,
          destination: this.inferDestinationFromTexts([dayMatch[2] || '']),
        };
        days.push(currentDay);
        continue;
      }

      if (!currentDay && !titleCandidate && !this.looksOperational(line)) {
        titleCandidate = line;
        continue;
      }

      if (!currentDay) {
        currentDay = {
          originalDayNumber: currentDayNumber,
          title: `Day ${currentDayNumber}`,
          summary: undefined,
          destination: undefined,
        };
        days.push(currentDay);
      }

      if (!currentDay.summary) {
        currentDay.summary = line;
        currentDay.destination = currentDay.destination || this.inferDestinationFromTexts([currentDay.title, line]);
        continue;
      }

      const itemType = this.guessItemType(line);
      const confidence = itemType === 'other' ? 'low' : itemType === 'meal' ? 'medium' : 'high';
      const draftItem: NormalizedItemDraft = {
        id: `item-${items.length + 1}`,
        originalDayNumber: currentDay.originalDayNumber,
        type: itemType,
        title: this.buildFallbackTitle(line) || `Item ${items.length + 1}`,
        description: line,
        location: this.inferDestinationFromTexts([line]),
        startTime: this.emptyToUndefined(this.extractTime(line)),
        endTime: undefined,
        confidence,
        needsReview: itemType === 'other',
        sourceText: line,
      };

      if (!draftItem.title && !draftItem.description && !draftItem.sourceText) {
        unresolved.push({
          id: `unresolved-${unresolved.length + 1}`,
          text: line,
          confidence: 'low',
          reason: 'Could not classify text during fallback parsing.',
        });
      } else {
        items.push(draftItem);
      }
    }

    return this.finalizeResult({
      input,
      tripTitle: titleCandidate,
      explicitDestinations: [],
      days,
      items,
      unresolved,
      parseWarnings,
    });
  }

  private finalizeResult(params: {
    input: ParseItineraryInput;
    tripTitle: string;
    explicitDestinations: string[];
    days: NormalizedDayDraft[];
    items: NormalizedItemDraft[];
    unresolved: ParsedItineraryUnresolved[];
    parseWarnings: string[];
  }): ParsedItineraryResult {
    const allKnownDayNumbers = Array.from(
      new Set([
        ...params.days.map((day) => day.originalDayNumber),
        ...params.items
          .map((item) => item.originalDayNumber)
          .filter((dayNumber): dayNumber is number => typeof dayNumber === 'number'),
      ]),
    )
      .filter((dayNumber) => Number.isFinite(dayNumber) && dayNumber > 0)
      .sort((left, right) => left - right);
    const normalizedDayNumbers = allKnownDayNumbers.length > 0 ? allKnownDayNumbers : [1];
    const normalizedDayNumberMap = new Map(normalizedDayNumbers.map((dayNumber, index) => [dayNumber, index + 1]));

    const days =
      params.days.length > 0
        ? params.days
            .slice()
            .sort((left, right) => left.originalDayNumber - right.originalDayNumber)
            .map((day, index) => ({
              dayNumber: normalizedDayNumberMap.get(day.originalDayNumber) || index + 1,
              title: day.title || `Day ${index + 1}`,
              summary: day.summary,
              destination: day.destination,
            }))
        : normalizedDayNumbers.map((dayNumber, index) => ({
            dayNumber: normalizedDayNumberMap.get(dayNumber) || index + 1,
            title: `Day ${index + 1}`,
            summary: undefined,
            destination: undefined,
          }));

    const items = params.items
      .map((item) => ({
        id: item.id,
        dayNumber:
          typeof item.originalDayNumber === 'number'
            ? normalizedDayNumberMap.get(item.originalDayNumber) || normalizedDayNumberMap.get(normalizedDayNumbers[0])
            : undefined,
        type: item.type,
        title: item.title,
        description: item.description,
        location: item.location,
        startTime: item.startTime,
        endTime: item.endTime,
        confidence: item.confidence,
        needsReview: item.needsReview,
        sourceText: item.sourceText,
      }))
      .filter((item) => item.title || item.description || item.sourceText)
      .sort((left, right) => {
        const leftDay = left.dayNumber || 9999;
        const rightDay = right.dayNumber || 9999;

        if (leftDay !== rightDay) {
          return leftDay - rightDay;
        }

        return left.id.localeCompare(right.id);
      });

    const groupedItemsByDay = new Map<number, ParsedItineraryItem[]>();
    for (const item of items) {
      if (typeof item.dayNumber !== 'number') {
        continue;
      }

      const current = groupedItemsByDay.get(item.dayNumber) || [];
      current.push(item);
      groupedItemsByDay.set(item.dayNumber, current);
    }

    const daysWithDestinations = days.map((day) => ({
      ...day,
      destination:
        day.destination ||
        this.inferDestinationFromTexts([
          day.title,
          day.summary || '',
          ...(groupedItemsByDay.get(day.dayNumber) || []).flatMap((item) => [item.location || '', item.title, item.description || '', item.sourceText || '']),
        ]),
    }));

    const destinations = Array.from(
      new Set(
        [
          ...params.explicitDestinations.map((destination) => this.normalizeDestination(destination)),
          ...daysWithDestinations.map((day) => day.destination),
          ...items.map((item) => this.normalizeDestination(item.location)),
        ].filter((value): value is string => Boolean(value)),
      ),
    );

    const parseWarnings = [...params.parseWarnings];
    if (params.unresolved.length > 0) {
      parseWarnings.push(`${params.unresolved.length} unresolved text segment(s) need review.`);
    }
    if (destinations.length === 0) {
      parseWarnings.push('No destinations were confidently inferred from the source text.');
    }

    return {
      sourceType: params.input.sourceType,
      tripTitle:
        params.tripTitle ||
        this.buildTripTitle(daysWithDestinations, destinations, params.input.rawText),
      destinations,
      days: daysWithDestinations,
      items,
      unresolved: params.unresolved,
      parseWarnings: Array.from(new Set(parseWarnings.filter(Boolean))),
      sourceText: params.input.rawText,
    };
  }

  private normalizeDayNumber(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private hasDayNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  }

  private normalizeItemType(value: unknown): ParsedItineraryItemType {
    const normalized = this.toTrimmedString(value).toLowerCase();

    if (!normalized) {
      return 'other';
    }

    if (normalized === 'hotel' || normalized === 'accommodation' || normalized === 'stay' || normalized === 'room') {
      return 'stay';
    }

    if (normalized === 'transport' || normalized === 'transfer' || normalized === 'vehicle' || normalized === 'drive') {
      return 'transfer';
    }

    if (normalized === 'activity' || normalized === 'tour' || normalized === 'excursion' || normalized === 'guide') {
      return 'activity';
    }

    if (normalized === 'meal' || normalized === 'breakfast' || normalized === 'lunch' || normalized === 'dinner') {
      return 'meal';
    }

    return ITEM_TYPES.includes(normalized as ParsedItineraryItemType) ? (normalized as ParsedItineraryItemType) : 'other';
  }

  private normalizeConfidence(value: unknown, fallback: ParsedItineraryConfidence): ParsedItineraryConfidence {
    const normalized = this.toTrimmedString(value).toLowerCase();
    return normalized === 'high' || normalized === 'medium' || normalized === 'low' ? normalized : fallback;
  }

  private normalizeNeedsReview(value: unknown, confidence: ParsedItineraryConfidence, missingDayNumber: boolean) {
    if (typeof value === 'boolean') {
      return value || confidence === 'low' || missingDayNumber;
    }

    return confidence !== 'high' || missingDayNumber;
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => this.toTrimmedString(entry))
      .filter(Boolean);
  }

  private normalizeDestination(value: string | null | undefined) {
    const normalized = this.toTrimmedString(value).replace(/^[,\-:;\s]+|[,\-:;\s]+$/g, '');
    return normalized || undefined;
  }

  private emptyToUndefined(value: unknown) {
    const normalized = this.toTrimmedString(value);
    return normalized || undefined;
  }

  private toTrimmedString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private guessItemType(line: string): ParsedItineraryItemType {
    const normalized = line.toLowerCase();

    if (normalized.includes('hotel') || normalized.includes('check in') || normalized.includes('check-in') || normalized.includes('overnight')) {
      return 'stay';
    }

    if (
      normalized.includes('transfer') ||
      normalized.includes('drive') ||
      normalized.includes('pickup') ||
      normalized.includes('drop off') ||
      normalized.includes('drop-off') ||
      normalized.includes('transport')
    ) {
      return 'transfer';
    }

    if (normalized.includes('lunch') || normalized.includes('dinner') || normalized.includes('breakfast')) {
      return 'meal';
    }

    if (
      normalized.includes('visit') ||
      normalized.includes('tour') ||
      normalized.includes('sightseeing') ||
      normalized.includes('excursion') ||
      normalized.includes('guide')
    ) {
      return 'activity';
    }

    return 'other';
  }

  private buildFallbackTitle(line: string) {
    const cleaned = line.replace(/^[-*]\s*/, '').trim();
    if (!cleaned) {
      return '';
    }

    return cleaned.length > 72 ? `${cleaned.slice(0, 69).trimEnd()}...` : cleaned;
  }

  private extractTime(line: string) {
    const match = line.match(/\b(\d{1,2}:\d{2}\s?(?:am|pm)?|\d{1,2}\s?(?:am|pm))\b/i);
    return match?.[0] || '';
  }

  private buildTripTitle(days: ParsedItineraryDay[], destinations: string[], rawText: string) {
    const firstLine = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    if (firstLine && !/^day\s*\d+/i.test(firstLine) && !this.looksOperational(firstLine)) {
      return firstLine;
    }

    if (destinations.length > 0) {
      return destinations.length === 1 ? `${destinations[0]} itinerary` : `${destinations.slice(0, 2).join(' / ')} itinerary`;
    }

    if (days[0]?.title) {
      return days[0].title;
    }

    return 'Imported itinerary';
  }

  private looksOperational(line: string) {
    const normalized = line.toLowerCase();
    return (
      /^day\s*\d+/i.test(line) ||
      normalized.includes('transfer') ||
      normalized.includes('hotel') ||
      normalized.includes('visit') ||
      normalized.includes('tour') ||
      normalized.includes('breakfast') ||
      normalized.includes('lunch') ||
      normalized.includes('dinner') ||
      normalized.includes('pickup') ||
      normalized.includes('check in') ||
      normalized.includes('check-in')
    );
  }

  private inferDestinationFromTexts(texts: string[]) {
    for (const text of texts) {
      const normalized = this.findDestinationCandidates(text);

      if (normalized.length > 0) {
        return normalized[0];
      }
    }

    return undefined;
  }

  private findDestinationCandidates(text: string) {
    const trimmed = this.toTrimmedString(text);

    if (!trimmed) {
      return [];
    }

    const candidates: string[] = [];
    const pattern =
      /\b(?:arrival in|arrival at|overnight in|overnight at|stay in|stay at|visit|visit to|tour of|tour to|drive to|transfer to|transfer from|in|to|at)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\b/g;

    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(trimmed)) !== null) {
      const candidate = this.normalizeDestination(match[1]);
      if (candidate) {
        candidates.push(candidate);
      }
    }

    const titleCandidate = trimmed
      .replace(/^day\s*\d+\s*[:\-\u2013]?\s*/i, '')
      .replace(/[|,].*$/, '')
      .trim();

    if (titleCandidate && titleCandidate.split(/\s+/).length <= 4) {
      const words = titleCandidate.split(/\s+/);
      const meaningfulWords = words.filter((word) => !DESTINATION_STOP_WORDS.has(word.toLowerCase()));
      const looksLikePlace = meaningfulWords.length > 0 && meaningfulWords.every((word) => /^[A-Z][A-Za-z'-]*$/.test(word));

      if (looksLikePlace) {
        candidates.push(titleCandidate);
      }
    }

    return Array.from(new Set(candidates.map((candidate) => candidate.trim()))).filter(Boolean);
  }
}
