import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
import { buildTailorMadeJordanDraft, deriveExperienceSuggestions, deriveGuideSuggestions, deriveOvernightStays, deriveTransportSuggestions, enrichExperienceMatches, matchHotelCandidatesForStay, type ActivityMasterRecord, type HotelMasterRecord, type ServiceMasterRecord, type TailorMadeDraft, type TailorMadeDraftInput } from '../quotes/tailor-made-draft';
import { normalizeOptionalString, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { HOTEL_DEFAULT_MARKUP, EXPERIENCE_DEFAULT_MARKUP, GUIDE_DEFAULT_MARKUP, GUIDE_LOCAL_FULL_DAY_COST } from '../common/pricing-constants';
import { HotelPricingResolver } from '../hotel-pricing/hotel-pricing.resolver';
import { PrismaService } from '../prisma/prisma.service';
import { deriveDayCountry } from '../quotes/quote-day-country';
import {
  CreateQuoteItineraryDayDto,
  CreateQuoteItineraryDayItemDto,
  QuoteItineraryAuditActor,
  QuoteItineraryDayPoiInputDto,
  SetQuoteItineraryDayPoisDto,
  UpdateQuoteItineraryDayDto,
  UpdateQuoteItineraryDayItemDto,
} from './quote-itinerary.dto';

@Injectable()
export class QuoteItineraryService {
  constructor(private readonly prisma: PrismaService) {}

  private get dayModel() {
    return (this.prisma as any).quoteItineraryDay;
  }

  private get dayItemModel() {
    return (this.prisma as any).quoteItineraryDayItem;
  }

  private get dayPoiModel() {
    return (this.prisma as any).quoteItineraryDayPoi;
  }

  // Shared include for a day's ordered POI assignments (+ live POI content).
  private get dayPoiInclude() {
    return {
      poiAssignments: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          pointOfInterest: {
            include: {
              city: true,
              translations: true,
            },
          },
        },
      },
    } as const;
  }

  private get auditLogModel() {
    return (this.prisma as any).quoteItineraryAuditLog;
  }

  async findByQuoteId(quoteId: string, actor: CompanyScopedActor) {
    await this.ensureQuoteExists(quoteId, actor);

    const days = await this.dayModel.findMany({
      where: { quoteId },
      include: {
        ...this.dayPoiInclude,
        dayItems: {
          where: {
            isActive: true,
          },
          include: {
            quoteService: {
              include: {
                service: {
                  include: {
                    serviceType: true,
                  },
                },
                hotel: { include: { cityRecord: true } },
                contract: true,
                roomCategory: true,
                option: true,
                appliedVehicleRate: {
                  include: {
                    vehicle: true,
                    serviceType: true,
                  },
                },
                touringRoute: true,
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }, { createdAt: 'asc' }],
    });

    return {
      quoteId,
      days: (days || []).map((day: any) => this.serializeDay(day)),
    };
  }

  async createDay(quoteId: string, data: CreateQuoteItineraryDayDto, actor?: QuoteItineraryAuditActor) {
    await this.ensureQuoteExists(quoteId);
    const normalized = this.normalizeDayInput(data);
    const requiredActor = this.requireActor(actor);

    const createdDay = await this.prisma.$transaction(async (tx) => {
      const txDayModel = (tx as any).quoteItineraryDay;
      const existingDays = await txDayModel.findMany({
        where: { quoteId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      if (existingDays.some((day: any) => day.dayNumber === normalized.dayNumber)) {
        throw new BadRequestException(`Day ${normalized.dayNumber} already exists for this quote`);
      }

      const created = await txDayModel.create({
        data: {
          quoteId,
          dayNumber: normalized.dayNumber,
          title: normalized.title,
          notes: normalized.notes,
          isActive: normalized.isActive,
          sortOrder: existingDays.length,
        },
      });

      await this.resequenceDays(tx, quoteId, this.insertIdAtPosition(existingDays.map((day: any) => day.id), created.id, normalized.sortOrder));
      await this.writeAuditLog(tx, {
        quoteId,
        dayId: created.id,
        action: 'DAY_CREATED',
        oldValue: null,
        newValue: this.formatDaySummary(created),
        actor: requiredActor,
      });

      return created;
    });

    return this.findDayOrThrow(createdDay.id);
  }

  // Phase R.1b — Tailor-made draft PREVIEW. Pure read: validates the quote
  // exists, then returns the generated day-by-day draft. Writes nothing.
  async previewTailorMadeDraft(
    quoteId: string,
    input: TailorMadeDraftInput,
    actor?: CompanyScopedActor,
  ): Promise<TailorMadeDraft> {
    await this.ensureQuoteExists(quoteId, actor);
    return buildTailorMadeJordanDraft(input || {});
  }

  // Phase R.1b — Tailor-made draft APPLY. Persists the generated draft as
  // editable QuoteItineraryDay rows ONLY (no QuoteItems, no pricing). Safety:
  //  - If the quote already has itinerary days, returns 409 Conflict unless
  //    replaceExisting:true is provided (never silently clobbers manual days).
  //  - replaceExisting:true replaces ONLY the itinerary-day rows (their
  //    day↔item links + POI assignments cascade away); saved QuoteItems and
  //    their pricing are untouched.
  async applyTailorMadeDraft(
    quoteId: string,
    input: TailorMadeDraftInput,
    options: { replaceExisting?: boolean } | undefined,
    actor: QuoteItineraryAuditActor,
    companyActor?: CompanyScopedActor,
  ) {
    await this.ensureQuoteExists(quoteId, companyActor);
    const requiredActor = this.requireActor(actor);
    const replaceExisting = options?.replaceExisting === true;
    const draft = buildTailorMadeJordanDraft(input || {});

    await this.prisma.$transaction(async (tx) => {
      const txDayModel = (tx as any).quoteItineraryDay;
      const existing = await txDayModel.findMany({
        where: { quoteId },
        orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }, { createdAt: 'asc' }],
      });
      const activeExisting = existing.filter((day: any) => day.isActive);

      if (activeExisting.length > 0 && !replaceExisting) {
        throw new ConflictException(
          `This quote already has ${activeExisting.length} itinerary day(s). Pass replaceExisting: true to replace the itinerary-day structure. Saved services, items and pricing are not affected.`,
        );
      }

      if (replaceExisting && existing.length > 0) {
        for (const day of existing) {
          await this.writeAuditLog(tx, {
            quoteId,
            dayId: day.id,
            action: 'DAY_REPLACED_BY_TAILOR_MADE_DRAFT',
            oldValue: this.formatDaySummary(day),
            newValue: null,
            actor: requiredActor,
          });
        }
        // Deletes day shells (+ cascades their day-item links and POI
        // assignments). Does NOT touch QuoteItem rows or their pricing.
        await txDayModel.deleteMany({ where: { quoteId } });
      }

      for (const day of draft.days) {
        const created = await txDayModel.create({
          data: {
            quoteId,
            dayNumber: day.dayNumber,
            title: day.title,
            notes: day.narrative,
            country: 'Jordan',
            isActive: true,
            sortOrder: day.dayNumber - 1,
          },
        });
        await this.writeAuditLog(tx, {
          quoteId,
          dayId: created.id,
          action: 'DAY_CREATED_FROM_TAILOR_MADE_DRAFT',
          oldValue: null,
          newValue: this.formatDaySummary(created),
          actor: requiredActor,
        });
      }
    });

    const saved = await this.findByQuoteId(quoteId, companyActor as CompanyScopedActor);
    return { draft, ...saved };
  }

  // Phase R.2 — read-only hotel-stay SUGGESTIONS. Reads the quote's active
  // itinerary days, derives the overnight city per day, and groups consecutive
  // same-city nights into suggested stays. Writes nothing, creates no
  // QuoteItems, and calls no hotel/pricing logic. Candidate hotels are
  // intentionally empty in R.2 (grouping-only; contract-backed candidates are a
  // later, separately-reviewed step).
  async suggestTailorMadeHotels(
    quoteId: string,
    options: { hotelCategory?: string | null; currency?: string | null } | undefined,
    actor?: CompanyScopedActor,
  ) {
    await this.ensureQuoteExists(quoteId, actor);
    const days = await this.dayModel.findMany({
      where: { quoteId, isActive: true },
      // R.6A-1 — include `id` so each stay can expose its first itinerary day id
      // (the hotel apply attaches its QuoteItem there). Grouping itself is unchanged.
      select: { id: true, dayNumber: true, title: true, notes: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }],
    });

    const hotelCategory = normalizeOptionalString(options?.hotelCategory) || '4-star';
    const currency = (normalizeOptionalString(options?.currency) || 'USD').toUpperCase();
    const stays = deriveOvernightStays(days || [], hotelCategory);

    // Phase R.2b — enrich each stay with read-only candidate hotels from the
    // hotel master. ONE read query; active contracts filtered by date; we read
    // only id + confidence (never the contract name). No pricing, no writes.
    if (stays.length > 0) {
      const today = new Date();
      const hotels = await (this.prisma as any).hotel.findMany({
        select: {
          id: true,
          name: true,
          city: true,
          category: true,
          preferenceRank: true,
          contracts: {
            where: { validFrom: { lte: today }, validTo: { gte: today } },
            select: { id: true, confidence: true },
          },
        },
      });
      const normalized: HotelMasterRecord[] = (hotels || []).map((h: any) => ({
        id: h.id,
        name: h.name,
        city: h.city,
        category: h.category ?? null,
        preferenceRank: h.preferenceRank ?? null,
        activeContracts: (h.contracts || []).map((c: any) => ({ id: c.id, verified: c.confidence === 'VERIFIED' })),
      }));
      for (const stay of stays) {
        stay.candidateHotels = matchHotelCandidatesForStay(stay.city, normalized, { limit: 5 });
      }
    }

    return {
      quoteId,
      hotelCategory,
      currency,
      stays,
      totalNights: stays.reduce((n, s) => n + s.nights, 0),
      // Read-only grouping only — no hotels were looked up, applied, or priced.
      message:
        stays.length === 0
          ? 'No active itinerary days found. Generate and apply a tailor-made draft first.'
          : 'Suggested hotel stays grouped by overnight city. Read-only — no hotels applied and no pricing.',
    };
  }

  // Phase R.3 — read-only TRANSPORT suggestions. Reads the quote's active
  // itinerary days and classifies the transport need per day (arrival/departure
  // transfer, touring/full-day, or none). Descriptive only: no route/contract/
  // rate lookup, no QuoteItems, no pricing, no writes.
  async suggestTailorMadeTransport(quoteId: string, actor?: CompanyScopedActor) {
    await this.ensureQuoteExists(quoteId, actor);
    const days = await this.dayModel.findMany({
      where: { quoteId, isActive: true },
      // R.6B-1 — include `id` so each suggestion can expose its itinerary day id
      // (an applied transport item attaches there). Classification is unchanged.
      select: { id: true, dayNumber: true, title: true, notes: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }],
    });

    const suggestions = deriveTransportSuggestions(days || []);
    const withTransport = suggestions.filter((s) => s.suggestedTransportType !== 'NONE');

    return {
      quoteId,
      suggestions,
      transportDayCount: withTransport.length,
      message:
        suggestions.length === 0
          ? 'No active itinerary days found. Generate and apply a tailor-made draft first.'
          : 'Suggested transport per day. Read-only planning hints — no transport applied and no pricing.',
    };
  }

  // Phase R.4 — read-only ENTRANCE / TICKET / ACTIVITY suggestions. Reads the
  // quote's active itinerary days, recognizes known sightseeing places, and
  // proposes the entrance/ticket/activity each day probably needs. A best-effort
  // master lookup attaches matched record ids + names where confidently found.
  // No QuoteItems, no pricing, no writes; the master read is defensive (a
  // failure degrades to descriptive-only suggestions, never an error).
  async suggestTailorMadeExperiences(quoteId: string, actor?: CompanyScopedActor) {
    await this.ensureQuoteExists(quoteId, actor);
    const days = await this.dayModel.findMany({
      where: { quoteId, isActive: true },
      // R.6C-0 — include `id` so each suggestion exposes its itinerary day id (a
      // future apply attaches there). Classification/matching unchanged.
      select: { id: true, dayNumber: true, title: true, notes: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }],
    });

    let suggestions = deriveExperienceSuggestions(days || []);

    // R.6C-0 — best-effort COST maps for a read-only price ESTIMATE (gross unit
    // cost × standard markup). Keyed by the matched record id. Populated from the
    // same master read used for matching; left empty if the read fails.
    const activityCostById = new Map<string, { cost: number | null; currency: string; variants: Map<string, { cost: number; currency: string }> }>();
    const serviceCostById = new Map<string, { cost: number | null; currency: string; jordanPassEligible: boolean }>();

    if (suggestions.length > 0) {
      try {
        const [services, activities] = await Promise.all([
          (this.prisma as any).supplierService.findMany({
            select: {
              id: true,
              name: true,
              entranceFee: { select: { siteName: true, foreignerFeeJod: true, includedInJordanPass: true } },
              ticketRateVariants: { select: { id: true, costPrice: true, currency: true }, where: { active: true } },
            },
            take: 500,
          }),
          (this.prisma as any).activity.findMany({
            where: { active: true },
            select: {
              id: true,
              name: true,
              city: true,
              costPrice: true,
              rateVariants: { select: { id: true, name: true, costPrice: true, currency: true }, where: { active: true } },
            },
            take: 500,
          }),
        ]);
        const serviceMasters: ServiceMasterRecord[] = (services || []).map((s: any) => ({
          serviceId: s.id,
          name: s.name,
          siteName: s.entranceFee?.siteName ?? null,
        }));
        const activityMasters: ActivityMasterRecord[] = (activities || []).map((a: any) => ({
          id: a.id,
          name: a.name,
          city: a.city ?? null,
          rateVariants: (a.rateVariants || []).map((v: any) => ({ id: v.id, name: v.name })),
        }));
        // Build the cost maps alongside the match masters (no pricing engine; just
        // surfacing the catalog cost for an estimate — createItem stays authoritative).
        for (const s of services || []) {
          const firstTicket = (s.ticketRateVariants || [])[0];
          const cost = firstTicket ? Number(firstTicket.costPrice) : s.entranceFee ? Number(s.entranceFee.foreignerFeeJod) : null;
          serviceCostById.set(s.id, {
            cost: cost == null || Number.isNaN(cost) ? null : cost,
            currency: firstTicket?.currency || 'JOD',
            jordanPassEligible: Boolean(s.entranceFee?.includedInJordanPass),
          });
        }
        for (const a of activities || []) {
          const variants = new Map<string, { cost: number; currency: string }>();
          for (const v of a.rateVariants || []) variants.set(v.id, { cost: Number(v.costPrice), currency: v.currency || 'USD' });
          const firstVariant = (a.rateVariants || [])[0];
          activityCostById.set(a.id, {
            cost: firstVariant ? Number(firstVariant.costPrice) : a.costPrice != null ? Number(a.costPrice) : null,
            currency: firstVariant?.currency || 'USD',
            variants,
          });
        }
        suggestions = enrichExperienceMatches(suggestions, { services: serviceMasters, activities: activityMasters });
      } catch {
        // Best-effort only: keep descriptive suggestions if the master read fails.
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Strip the internal lookup hints from the response payload (admin sees the
    // displayName + optional matched record name, never the raw match terms), and
    // attach READ-ONLY readiness + a gross price estimate (R.6C-0).
    const cleaned = suggestions.map(({ matchTerms, variantTerms, matchKind, specificTerms, ...rest }) => {
      const isActivity = Boolean(rest.matchedActivityId);
      const isService = Boolean(rest.matchedServiceId);
      let estimatedCost: number | null = null;
      let currency: string | null = null;
      let jordanPassEligible = false;

      if (isActivity) {
        const a = activityCostById.get(rest.matchedActivityId as string);
        if (a) {
          const v = rest.matchedActivityRateVariantId ? a.variants.get(rest.matchedActivityRateVariantId) : null;
          estimatedCost = v ? v.cost : a.cost;
          currency = v ? v.currency : a.currency;
        }
      } else if (isService) {
        const s = serviceCostById.get(rest.matchedServiceId as string);
        if (s) {
          estimatedCost = s.cost;
          currency = s.currency;
          jordanPassEligible = s.jordanPassEligible;
        }
      }

      // Readiness: NO_MATCH (no record) → NEEDS_VARIANT (activity matched but no
      // specific rate variant; createItem auto-selects one on apply) → MATCHED.
      const readiness: 'MATCHED' | 'NO_MATCH' | 'NEEDS_VARIANT' = !isActivity && !isService
        ? 'NO_MATCH'
        : isActivity && !rest.matchedActivityRateVariantId
          ? 'NEEDS_VARIANT'
          : 'MATCHED';

      const hasEstimate = estimatedCost != null && !Number.isNaN(estimatedCost);
      return {
        ...rest,
        readiness,
        // Gross unit estimate only — NOT the final price. createItem applies pax,
        // pricing basis, supplier rules and Jordan Pass coverage on apply.
        estimatedCost: hasEstimate ? round2(estimatedCost as number) : null,
        estimatedSell: hasEstimate ? round2((estimatedCost as number) * (1 + EXPERIENCE_DEFAULT_MARKUP / 100)) : null,
        currency: hasEstimate ? currency : null,
        markupPercent: EXPERIENCE_DEFAULT_MARKUP,
        jordanPassEligible,
      };
    });
    const byDay = cleaned.reduce<Record<number, typeof cleaned>>((acc, s) => {
      (acc[s.dayNumber] ||= []).push(s);
      return acc;
    }, {});

    return {
      quoteId,
      suggestions: cleaned,
      byDay,
      matchedCount: cleaned.filter((s) => s.matchedServiceId || s.matchedActivityId).length,
      message:
        cleaned.length === 0
          ? 'No entrance/activity suggestions for the current itinerary days. Generate and apply a tailor-made draft first.'
          : 'Suggested entrances & activities by day. Read-only — estimated prices only (Jordan Pass and final pricing are applied later); nothing has been applied.',
    };
  }

  // Phase R.5 — read-only GUIDE suggestions. Reads the quote's active itinerary
  // days and proposes a local guide for the major guided sites (Jerash, Petra).
  // Descriptive only: no QuoteItems, no pricing, no writes, no guide master/rate
  // lookup. An escort guide is offered as a program-level planning note only.
  async suggestTailorMadeGuides(quoteId: string, actor?: CompanyScopedActor) {
    await this.ensureQuoteExists(quoteId, actor);
    const days = await this.dayModel.findMany({
      where: { quoteId, isActive: true },
      // R.6D-0 — include `id` so each guide suggestion can expose its itinerary
      // day id (the apply target in R.6D-1).
      select: { id: true, dayNumber: true, title: true, notes: true, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }],
    });

    // R.6D-0 — enrich each suggestion with readiness + a read-only price estimate.
    // LOCAL guides → MATCHED, priced at the standard local/full-day guide rate
    // (GUIDE_LOCAL_FULL_DAY_COST) × GUIDE_DEFAULT_MARKUP; NONE days carry no
    // estimate. Escort stays a program-level planning note (escortNote), never a
    // per-day apply target. No QuoteItems, no pricing writes, no raw guide metadata.
    const suggestions = deriveGuideSuggestions(days || []).map((s) => {
      if (s.guideTypeSuggestion === 'LOCAL') {
        const estimatedCost = GUIDE_LOCAL_FULL_DAY_COST;
        return {
          ...s,
          readiness: 'MATCHED' as const,
          guideType: 'local' as const,
          guideDuration: 'full_day' as const,
          estimatedCost,
          estimatedSell: Math.round(estimatedCost * (1 + GUIDE_DEFAULT_MARKUP / 100) * 100) / 100,
          currency: 'USD',
          markupPercent: GUIDE_DEFAULT_MARKUP,
        };
      }
      return {
        ...s,
        readiness: 'NONE' as const,
        guideType: null,
        guideDuration: null,
        estimatedCost: null,
        estimatedSell: null,
        currency: null,
        markupPercent: null,
      };
    });
    const guided = suggestions.filter((s) => s.guideTypeSuggestion !== 'NONE');

    return {
      quoteId,
      suggestions,
      guidedDayCount: guided.length,
      // Program-level planning note only — never applied or priced here.
      escortNote:
        suggestions.length === 0
          ? null
          : 'An escort/tour leader for the full program can be added as a planning option (not applied, not priced).',
      message:
        suggestions.length === 0
          ? 'No active itinerary days found. Generate and apply a tailor-made draft first.'
          : 'Suggested guides by day. Read-only planning hints — no guides applied and no pricing.',
    };
  }

  // Phase R.6A-0 — READ-ONLY hotel-stay configure + price preview. For a chosen
  // hotel candidate + contract on a stay, returns the available room categories /
  // meal plans / occupancy types from the contracted rates, sensible defaults
  // (nights from the stay, rooms/pax from the quote, markup = HOTEL_DEFAULT_MARKUP),
  // and an ESTIMATED cost/sell using the same pure HotelPricingResolver that
  // createItem uses. It creates NO QuoteItem, runs NO pricing write, and changes
  // NO quote totals. Returns canApply:false (apply lands in R.6A-1).
  async previewTailorMadeHotelStay(
    quoteId: string,
    input: {
      hotelId?: string;
      contractId?: string;
      stay?: { city?: string; startDay?: number; endDay?: number; nights?: number; firstItineraryDayId?: string };
      roomCategoryId?: string;
      occupancyType?: string;
      mealPlan?: string;
      roomCount?: number;
      paxCount?: number;
      serviceDate?: string;
    },
    actor?: CompanyScopedActor,
  ) {
    await this.ensureQuoteExists(quoteId, actor);
    const hotelId = normalizeOptionalString(input?.hotelId);
    const contractId = normalizeOptionalString(input?.contractId);
    if (!hotelId || !contractId) {
      throw new BadRequestException('hotelId and contractId are required to preview a hotel stay.');
    }

    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: { adults: true, children: true, roomCount: true, travelStartDate: true },
    });
    const hotel = await (this.prisma as any).hotel.findUnique({ where: { id: hotelId }, select: { name: true, city: true } });

    const stay = input?.stay || {};
    const nights = Number(stay.nights)
      || (Number.isInteger(stay.endDay) && Number.isInteger(stay.startDay) ? (stay.endDay as number) - (stay.startDay as number) + 1 : 0)
      || 1;
    const roomCount = Number(input?.roomCount) || quote?.roomCount || 1;
    const paxCount = Number(input?.paxCount) || ((quote?.adults || 0) + (quote?.children || 0)) || 2;

    // Resolve the stay's service date (explicit → quote start + day offset).
    let serviceDate: Date | null = input?.serviceDate ? new Date(input.serviceDate) : null;
    if ((!serviceDate || Number.isNaN(serviceDate.getTime())) && quote?.travelStartDate) {
      const offset = Number.isInteger(stay.startDay) && (stay.startDay as number) > 0 ? (stay.startDay as number) - 1 : 0;
      const base = new Date(quote.travelStartDate);
      base.setDate(base.getDate() + offset);
      serviceDate = base;
    }
    if (serviceDate && Number.isNaN(serviceDate.getTime())) {
      serviceDate = null;
    }

    // Read contracted rates for this hotel+contract (date-season filtered when
    // known; fall back to all seasons so options still surface). Read-only.
    const seasonWhere = serviceDate ? { seasonFrom: { lte: serviceDate }, seasonTo: { gte: serviceDate } } : {};
    let rates = await (this.prisma as any).hotelRate.findMany({
      where: { hotelId, contractId, roomCategory: { isActive: true }, ...seasonWhere },
      include: { roomCategory: true },
      orderBy: [{ createdAt: 'desc' }],
    });
    if ((!rates || rates.length === 0) && serviceDate) {
      rates = await (this.prisma as any).hotelRate.findMany({
        where: { hotelId, contractId, roomCategory: { isActive: true } },
        include: { roomCategory: true },
        orderBy: [{ createdAt: 'desc' }],
      });
    }
    rates = rates || [];

    const roomMap = new Map<string, string>();
    const mealSet = new Set<string>();
    const occSet = new Set<string>();
    for (const r of rates) {
      if (r.roomCategoryId) roomMap.set(r.roomCategoryId, r.roomCategory?.name || r.roomCategoryId);
      if (r.mealPlan) mealSet.add(r.mealPlan);
      if (r.occupancyType) occSet.add(r.occupancyType);
    }
    const availableRoomCategories = [...roomMap.entries()].map(([id, name]) => ({ id, name }));
    const availableMealPlans = [...mealSet];
    const availableOccupancyTypes = [...occSet];

    const defaults = {
      roomCount,
      paxCount,
      occupancyType: availableOccupancyTypes.includes('DBL') ? 'DBL' : availableOccupancyTypes[0] || null,
      mealPlan: availableMealPlans.length === 1 ? availableMealPlans[0] : null,
      markupPercent: HOTEL_DEFAULT_MARKUP,
    };

    const base = {
      hotelName: hotel?.name || null,
      hotelId,
      contractId,
      city: normalizeOptionalString(stay.city) || hotel?.city || null,
      nights,
      startDay: stay.startDay ?? null,
      endDay: stay.endDay ?? null,
      serviceDate: serviceDate ? serviceDate.toISOString().slice(0, 10) : null,
      availableRoomCategories,
      availableMealPlans,
      availableOccupancyTypes,
      defaults,
      pricePreview: null as null | Record<string, unknown>,
      canApply: false,
    };

    if (rates.length === 0) {
      return { ...base, rateStatus: 'NO_RATES', message: 'No active contracted rates were found for this hotel and contract. Apply will be unavailable until a rate exists.' };
    }

    const selRoom = normalizeOptionalString(input?.roomCategoryId) || (availableRoomCategories.length === 1 ? availableRoomCategories[0].id : null);
    const selOcc = normalizeOptionalString(input?.occupancyType) || defaults.occupancyType;
    const selMeal = normalizeOptionalString(input?.mealPlan) || defaults.mealPlan;

    if (!selRoom || !selOcc || !selMeal) {
      return { ...base, rateStatus: 'NEEDS_SELECTION', message: 'Select a room category, occupancy, and meal plan to preview a price.' };
    }

    const rate = rates.find((r: any) => r.roomCategoryId === selRoom && r.occupancyType === selOcc && r.mealPlan === selMeal) || null;
    if (!rate) {
      return { ...base, rateStatus: 'NO_MATCHING_RATE', message: 'No contracted rate matches the selected room category, occupancy, and meal plan. Choose a different combination.' };
    }

    // Estimate via the SAME pure resolver createItem uses (cost side only — no
    // optional supplements in this preview), then apply the standard hotel markup.
    const pricing = new HotelPricingResolver().resolve({
      pax: paxCount,
      rooms: roomCount,
      nights,
      adults: quote?.adults ?? null,
      children: quote?.children ?? null,
      selectedMealPlan: selMeal,
      baseMealPlan: rate.mealPlan,
      selectedRoomCategoryId: rate.roomCategoryId,
      rates: [
        {
          id: rate.id,
          label: `${rate.roomCategory?.name || ''} ${rate.occupancyType} ${rate.mealPlan}`.trim(),
          amount: rate.cost,
          basis: rate.pricingBasis,
          mealPlan: rate.mealPlan,
          roomCategoryId: rate.roomCategoryId,
          occupancyType: rate.occupancyType,
          isSelected: true,
        },
      ],
      markupPercent: HOTEL_DEFAULT_MARKUP,
    });

    return {
      ...base,
      pricePreview: {
        totalCost: pricing.totalCost,
        totalSell: pricing.totalSell,
        currency: rate.currency || null,
        markupPercent: HOTEL_DEFAULT_MARKUP,
        roomCategoryId: selRoom,
        occupancyType: selOcc,
        mealPlan: selMeal,
        // Phase R.6A-1 — the matched rate's season name. The canonical hotel apply
        // path (createItem hotel branch) REQUIRES a season, so the apply payload
        // must echo this back. Read-only here; no write, no pricing saved.
        seasonName: rate.seasonName || null,
        rateStatus: 'OK',
        notes: 'Estimated from the contracted rate (excludes optional supplements). Final price is calculated when the hotel is applied.',
      },
      rateStatus: 'OK',
      message: 'Price preview is an estimate. No hotel has been applied and no pricing has been saved.',
    };
  }

  async updateDay(dayId: string, data: UpdateQuoteItineraryDayDto, actor?: QuoteItineraryAuditActor) {
    const existing = await this.findDayOrThrow(dayId);
    const requiredActor = this.requireActor(actor);
    const normalized = this.normalizeDayUpdateInput(data, existing);

    const updatedDay = await this.prisma.$transaction(async (tx) => {
      const txDayModel = (tx as any).quoteItineraryDay;
      const siblings = await txDayModel.findMany({
        where: { quoteId: existing.quoteId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      if (siblings.some((day: any) => day.id !== dayId && day.dayNumber === normalized.dayNumber)) {
        throw new BadRequestException(`Day ${normalized.dayNumber} already exists for this quote`);
      }

      const updated = await txDayModel.update({
        where: { id: dayId },
        data: {
          dayNumber: normalized.dayNumber,
          title: normalized.title,
          notes: normalized.notes,
          country: normalized.country,
          isActive: normalized.isActive,
        },
      });

      const siblingIds = siblings.filter((day: any) => day.id !== dayId).map((day: any) => day.id);
      await this.resequenceDays(tx, existing.quoteId, this.insertIdAtPosition(siblingIds, dayId, normalized.sortOrder));
      await this.writeAuditLog(tx, {
        quoteId: existing.quoteId,
        dayId,
        action: 'DAY_UPDATED',
        oldValue: this.formatDaySummary(existing),
        newValue: this.formatDaySummary(updated),
        actor: requiredActor,
      });

      return updated;
    });

    return this.findDayOrThrow(updatedDay.id);
  }

  async removeDay(dayId: string, actor?: QuoteItineraryAuditActor) {
    const existing = await this.findDayOrThrow(dayId);
    const requiredActor = this.requireActor(actor);

    await this.prisma.$transaction(async (tx) => {
      const txDayModel = (tx as any).quoteItineraryDay;
      const siblings = await txDayModel.findMany({
        where: { quoteId: existing.quoteId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      await txDayModel.delete({
        where: { id: dayId },
      });

      await this.resequenceDays(
        tx,
        existing.quoteId,
        siblings.filter((day: any) => day.id !== dayId).map((day: any) => day.id),
      );
      await this.writeAuditLog(tx, {
        quoteId: existing.quoteId,
        // The day no longer exists, so the audit row must NOT reference its id
        // (QuoteItineraryAuditLog.dayId is a FK; pointing it at a deleted day
        // violates the constraint → 500). Keep dayId null; the deleted day's
        // identity is preserved in oldValue + recorded here for traceability.
        dayId: null,
        action: 'DAY_DELETED',
        oldValue: `[day ${dayId}] ${this.formatDaySummary(existing) ?? ''}`.trim(),
        newValue: null,
        actor: requiredActor,
      });
    });

    return { id: dayId };
  }

  async createDayItem(dayId: string, data: CreateQuoteItineraryDayItemDto, actor?: QuoteItineraryAuditActor) {
    const day = await this.findDayOrThrow(dayId);
    const normalized = this.normalizeDayItemInput(data);
    const requiredActor = this.requireActor(actor);
    const quoteService = await this.findQuoteServiceOrThrow(normalized.quoteServiceId);
    this.assertQuoteServiceBelongsToQuote(quoteService, day.quoteId);

    const createdItem = await this.prisma.$transaction(async (tx) => {
      const txDayItemModel = (tx as any).quoteItineraryDayItem;
      const existingItems = await txDayItemModel.findMany({
        where: { dayId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      const duplicateAssignment = await txDayItemModel.findFirst({
        where: {
          dayId,
          quoteServiceId: normalized.quoteServiceId,
        },
      });

      if (duplicateAssignment) {
        throw new BadRequestException('This quote service is already assigned to the selected itinerary day');
      }

      const created = await txDayItemModel.create({
        data: {
          dayId,
          quoteServiceId: normalized.quoteServiceId,
          notes: normalized.notes,
          isActive: normalized.isActive,
          sortOrder: existingItems.length,
        },
      });

      await this.resequenceDayItems(
        tx,
        dayId,
        this.insertIdAtPosition(existingItems.map((item: any) => item.id), created.id, normalized.sortOrder),
      );
      await this.writeAuditLog(tx, {
        quoteId: day.quoteId,
        dayId,
        itemId: created.id,
        action: 'ITEM_ADDED',
        oldValue: null,
        newValue: this.formatDayItemSummary({
          id: created.id,
          notes: created.notes,
          isActive: created.isActive,
          sortOrder: created.sortOrder,
          quoteService,
        }),
        actor: requiredActor,
      });

      return created;
    });

    return this.findDayItemOrThrow(dayId, createdItem.id);
  }

  async updateDayItem(dayId: string, itemId: string, data: UpdateQuoteItineraryDayItemDto, actor?: QuoteItineraryAuditActor) {
    const existing = await this.findDayItemOrThrow(dayId, itemId);
    const day = existing.day;
    const requiredActor = this.requireActor(actor);
    const normalized = this.normalizeDayItemUpdateInput(data, existing);
    const quoteService =
      normalized.quoteServiceId === existing.quoteServiceId
        ? existing.quoteService
        : await this.findQuoteServiceOrThrow(normalized.quoteServiceId);
    this.assertQuoteServiceBelongsToQuote(quoteService, day.quoteId);

    const updatedItem = await this.prisma.$transaction(async (tx) => {
      const txDayItemModel = (tx as any).quoteItineraryDayItem;
      const siblings = await txDayItemModel.findMany({
        where: { dayId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      const duplicateAssignment = await txDayItemModel.findFirst({
        where: {
          dayId,
          quoteServiceId: normalized.quoteServiceId,
          id: { not: itemId },
        },
      });

      if (duplicateAssignment) {
        throw new BadRequestException('This quote service is already assigned to the selected itinerary day');
      }

      const updated = await txDayItemModel.update({
        where: { id: itemId },
        data: {
          quoteServiceId: normalized.quoteServiceId,
          notes: normalized.notes,
          isActive: normalized.isActive,
        },
      });

      const siblingIds = siblings.filter((item: any) => item.id !== itemId).map((item: any) => item.id);
      await this.resequenceDayItems(tx, dayId, this.insertIdAtPosition(siblingIds, itemId, normalized.sortOrder));
      await this.writeAuditLog(tx, {
        quoteId: day.quoteId,
        dayId,
        itemId,
        action: 'ITEM_UPDATED',
        oldValue: this.formatDayItemSummary(existing),
        newValue: this.formatDayItemSummary({
          id: itemId,
          notes: updated.notes,
          isActive: updated.isActive,
          sortOrder: updated.sortOrder,
          quoteService,
        }),
        actor: requiredActor,
      });

      return updated;
    });

    return this.findDayItemOrThrow(dayId, updatedItem.id);
  }

  async removeDayItem(dayId: string, itemId: string, actor?: QuoteItineraryAuditActor) {
    const existing = await this.findDayItemOrThrow(dayId, itemId);
    const requiredActor = this.requireActor(actor);

    await this.prisma.$transaction(async (tx) => {
      const txDayItemModel = (tx as any).quoteItineraryDayItem;
      const siblings = await txDayItemModel.findMany({
        where: { dayId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });

      await txDayItemModel.delete({
        where: { id: itemId },
      });

      await this.resequenceDayItems(
        tx,
        dayId,
        siblings.filter((item: any) => item.id !== itemId).map((item: any) => item.id),
      );
      await this.writeAuditLog(tx, {
        quoteId: existing.day.quoteId,
        dayId,
        itemId,
        action: 'ITEM_REMOVED',
        oldValue: this.formatDayItemSummary(existing),
        newValue: null,
        actor: requiredActor,
      });
    });

    return { id: itemId };
  }

  // ---- Phase 3B.1: ordered day POI assignments ----------------------------

  async listDayPois(dayId: string) {
    const day = await this.findDayOrThrow(dayId);
    return {
      dayId,
      poiAssignments: (day.poiAssignments || []).map((assignment: any) => this.serializeDayPoi(assignment)),
    };
  }

  // Replace-all of a day's ordered POI assignments. Snapshots fallbackTitle/
  // fallbackCity from each linked POI at assignment time (an explicit value in
  // the input wins). Existing quotes with no assignments are unaffected, and
  // sending an empty list clears the day. Proposal rendering does not read these.
  async setDayPois(dayId: string, data: SetQuoteItineraryDayPoisDto, actor?: QuoteItineraryAuditActor) {
    const day = await this.findDayOrThrow(dayId);
    const requiredActor = this.requireActor(actor);
    const normalized = this.normalizeDayPoiInput(data);

    // Resolve POI snapshots up front (outside the transaction).
    const poiIds = Array.from(new Set(normalized.map((entry) => entry.poiId).filter((id): id is string => Boolean(id))));
    const pois = poiIds.length
      ? await (this.prisma as any).pointOfInterest.findMany({
          where: { id: { in: poiIds } },
          include: { city: true, translations: true },
        })
      : [];
    const poiById = new Map<string, any>(pois.map((poi: any) => [poi.id, poi]));

    for (const entry of normalized) {
      if (entry.poiId && !poiById.has(entry.poiId)) {
        throw new BadRequestException(`Point of interest ${entry.poiId} was not found`);
      }
    }

    const rows = normalized.map((entry, index) => {
      const poi = entry.poiId ? poiById.get(entry.poiId) : null;
      const snapshotTitle = poi ? this.resolvePoiDisplayTitle(poi) : null;
      const snapshotCity = poi?.city?.name ?? null;
      return {
        dayId,
        poiId: entry.poiId,
        sourceTouringRouteStopId: entry.sourceTouringRouteStopId,
        // Explicit input wins; else snapshot from the POI at assignment time.
        fallbackTitle: entry.fallbackTitle ?? snapshotTitle,
        fallbackCity: entry.fallbackCity ?? snapshotCity,
        sortOrder: index,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      const txDayPoiModel = (tx as any).quoteItineraryDayPoi;
      // Replace-all: delete first so the @@unique([dayId, sortOrder]) never clashes.
      await txDayPoiModel.deleteMany({ where: { dayId } });
      for (const row of rows) {
        await txDayPoiModel.create({ data: row });
      }
      await this.writeAuditLog(tx, {
        quoteId: day.quoteId,
        dayId,
        action: 'DAY_POIS_UPDATED',
        oldValue: this.formatDayPoiSummary(day.poiAssignments || []),
        newValue: this.formatDayPoiSummary(rows),
        actor: requiredActor,
      });
    });

    return this.listDayPois(dayId);
  }

  private normalizeDayPoiInput(data: SetQuoteItineraryDayPoisDto): QuoteItineraryDayPoiInputDto[] {
    const assignments = Array.isArray(data?.assignments) ? data.assignments : [];
    return assignments.map((entry) => {
      const poiId = normalizeOptionalString(entry?.poiId);
      const sourceTouringRouteStopId = normalizeOptionalString(entry?.sourceTouringRouteStopId);
      const fallbackTitle = normalizeOptionalString(entry?.fallbackTitle);
      const fallbackCity = normalizeOptionalString(entry?.fallbackCity);
      if (!poiId && !fallbackTitle) {
        throw new BadRequestException('Each day POI assignment needs a poiId or a fallbackTitle');
      }
      return {
        poiId: poiId ?? null,
        sourceTouringRouteStopId: sourceTouringRouteStopId ?? null,
        fallbackTitle: fallbackTitle ?? null,
        fallbackCity: fallbackCity ?? null,
      };
    });
  }

  private resolvePoiDisplayTitle(poi: any): string {
    const translations = Array.isArray(poi?.translations) ? poi.translations : [];
    const english = translations.find((t: any) => t?.locale === 'en');
    const englishTitle = typeof english?.title === 'string' ? english.title.trim() : '';
    if (englishTitle) {
      return englishTitle;
    }
    return typeof poi?.name === 'string' ? poi.name : '';
  }

  private formatDayPoiSummary(assignments: any[]): string | null {
    if (!assignments?.length) {
      return 'none';
    }
    return assignments
      .map((a, index) => `${index + 1}. ${a.fallbackTitle || a.poiId || 'unlabeled'}`)
      .join(' | ');
  }

  private async ensureQuoteExists(quoteId: string, actor?: CompanyScopedActor) {
    if (actor) {
      requireActorCompanyId(actor);
    }

    const quote = actor
      ? await this.prisma.quote.findFirst({
          where: {
            id: quoteId,
          },
          select: { id: true },
        })
      : await this.prisma.quote.findUnique({
          where: { id: quoteId },
          select: { id: true },
        });

    return throwIfNotFound(quote, 'Quote');
  }

  private async findDayOrThrow(dayId: string) {
    const day = await this.dayModel.findUnique({
      where: { id: dayId },
      include: {
        ...this.dayPoiInclude,
        dayItems: {
          where: {
            isActive: true,
          },
          include: {
            quoteService: {
              include: {
                service: {
                  include: {
                    serviceType: true,
                  },
                },
                hotel: { include: { cityRecord: true } },
                contract: true,
                roomCategory: true,
                option: true,
                appliedVehicleRate: {
                  include: {
                    vehicle: true,
                    serviceType: true,
                  },
                },
                touringRoute: true,
              },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    return throwIfNotFound(day, 'Quote itinerary day');
  }

  private async findDayItemOrThrow(dayId: string, itemId: string) {
    const item = await this.dayItemModel.findFirst({
      where: {
        id: itemId,
        dayId,
      },
      include: {
        day: true,
        quoteService: {
          include: {
            service: {
              include: {
                serviceType: true,
              },
            },
            hotel: true,
            contract: true,
            roomCategory: true,
            option: true,
            appliedVehicleRate: {
              include: {
                vehicle: true,
                serviceType: true,
              },
            },
            touringRoute: true,
          },
        },
      },
    });

    return throwIfNotFound(item, 'Quote itinerary day item');
  }

  private async findQuoteServiceOrThrow(quoteServiceId: string) {
    const quoteService = await this.prisma.quoteItem.findUnique({
      where: { id: quoteServiceId },
      include: {
        service: {
          include: {
            serviceType: true,
          },
        },
        hotel: true,
        contract: true,
        roomCategory: true,
        option: true,
        appliedVehicleRate: {
          include: {
            vehicle: true,
            serviceType: true,
          },
        },
        touringRoute: true,
      },
    });

    return throwIfNotFound(quoteService, 'Quote service');
  }

  private assertQuoteServiceBelongsToQuote(quoteService: any, quoteId: string) {
    if (quoteService.quoteId !== quoteId) {
      throw new BadRequestException('Quote service does not belong to the selected quote');
    }
  }

  private normalizeDayInput(data: CreateQuoteItineraryDayDto) {
    const dayNumber = Number(data.dayNumber);
    const sortOrder = data.sortOrder === undefined ? undefined : Number(data.sortOrder);

    if (!Number.isInteger(dayNumber) || dayNumber < 1) {
      throw new BadRequestException('dayNumber must be a positive whole number');
    }

    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
      throw new BadRequestException('sortOrder must be zero or greater');
    }

    return {
      dayNumber,
      title: requireTrimmedString(data.title, 'title'),
      notes: normalizeOptionalString(data.notes),
      sortOrder,
      isActive: data.isActive ?? true,
    };
  }

  private normalizeDayUpdateInput(data: UpdateQuoteItineraryDayDto, existing: any) {
    const nextDayNumber = data.dayNumber === undefined ? existing.dayNumber : Number(data.dayNumber);
    const nextSortOrder = data.sortOrder === undefined ? existing.sortOrder : Number(data.sortOrder);

    if (!Number.isInteger(nextDayNumber) || nextDayNumber < 1) {
      throw new BadRequestException('dayNumber must be a positive whole number');
    }

    if (!Number.isInteger(nextSortOrder) || nextSortOrder < 0) {
      throw new BadRequestException('sortOrder must be zero or greater');
    }

    return {
      dayNumber: nextDayNumber,
      title: data.title === undefined ? existing.title : requireTrimmedString(data.title, 'title'),
      notes: data.notes === undefined ? existing.notes : normalizeOptionalString(data.notes),
      country: data.country === undefined ? existing.country : normalizeOptionalString(data.country),
      sortOrder: nextSortOrder,
      isActive: data.isActive ?? existing.isActive,
    };
  }

  private normalizeDayItemInput(data: CreateQuoteItineraryDayItemDto) {
    const sortOrder = data.sortOrder === undefined ? undefined : Number(data.sortOrder);

    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
      throw new BadRequestException('sortOrder must be zero or greater');
    }

    return {
      quoteServiceId: requireTrimmedString(data.quoteServiceId, 'quoteServiceId'),
      sortOrder,
      notes: normalizeOptionalString(data.notes),
      isActive: data.isActive ?? true,
    };
  }

  private normalizeDayItemUpdateInput(data: UpdateQuoteItineraryDayItemDto, existing: any) {
    const nextSortOrder = data.sortOrder === undefined ? existing.sortOrder : Number(data.sortOrder);

    if (!Number.isInteger(nextSortOrder) || nextSortOrder < 0) {
      throw new BadRequestException('sortOrder must be zero or greater');
    }

    return {
      quoteServiceId:
        data.quoteServiceId === undefined ? existing.quoteServiceId : requireTrimmedString(data.quoteServiceId, 'quoteServiceId'),
      sortOrder: nextSortOrder,
      notes: data.notes === undefined ? existing.notes : normalizeOptionalString(data.notes),
      isActive: data.isActive ?? existing.isActive,
    };
  }

  private insertIdAtPosition(ids: string[], id: string, requestedPosition?: number) {
    const nextIds = [...ids];
    const nextIndex = requestedPosition === undefined ? nextIds.length : Math.max(0, Math.min(requestedPosition, nextIds.length));
    nextIds.splice(nextIndex, 0, id);
    return nextIds;
  }

  private async resequenceDays(tx: any, quoteId: string, orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, index) =>
        (tx as any).quoteItineraryDay.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    const remainingDays = await (tx as any).quoteItineraryDay.findMany({
      where: { quoteId },
      select: { id: true },
    });

    const remainingIds = new Set(orderedIds);
    const unsortedIds = remainingDays
      .map((day: any) => day.id)
      .filter((id: string) => !remainingIds.has(id));

    await Promise.all(
      unsortedIds.map((id: string, offset: number) =>
        (tx as any).quoteItineraryDay.update({
          where: { id },
          data: { sortOrder: orderedIds.length + offset },
        }),
      ),
    );
  }

  private async resequenceDayItems(tx: any, dayId: string, orderedIds: string[]) {
    await Promise.all(
      orderedIds.map((id, index) =>
        (tx as any).quoteItineraryDayItem.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    const remainingItems = await (tx as any).quoteItineraryDayItem.findMany({
      where: { dayId },
      select: { id: true },
    });

    const remainingIds = new Set(orderedIds);
    const unsortedIds = remainingItems
      .map((item: any) => item.id)
      .filter((id: string) => !remainingIds.has(id));

    await Promise.all(
      unsortedIds.map((id: string, offset: number) =>
        (tx as any).quoteItineraryDayItem.update({
          where: { id },
          data: { sortOrder: orderedIds.length + offset },
        }),
      ),
    );
  }

  private requireActor(actor?: QuoteItineraryAuditActor) {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated actor is required for audited writes');
    }

    return actor;
  }

  private async writeAuditLog(
    prismaClient: any,
    data: {
      quoteId: string;
      dayId?: string | null;
      itemId?: string | null;
      action: string;
      oldValue: string | null;
      newValue: string | null;
      actor: NonNullable<QuoteItineraryAuditActor>;
    },
  ) {
    await prismaClient.quoteItineraryAuditLog.create({
      data: {
        quoteId: data.quoteId,
        dayId: data.dayId ?? null,
        itemId: data.itemId ?? null,
        action: data.action,
        oldValue: data.oldValue,
        newValue: data.newValue,
        actorUserId: data.actor.id,
        actor: data.actor.auditLabel || null,
      },
    });
  }

  private serializeDay(day: any) {
    return {
      id: day.id,
      quoteId: day.quoteId,
      dayNumber: day.dayNumber,
      title: day.title,
      notes: day.notes,
      // Destination country for the builder grouping: a stored manual override
      // wins, otherwise derive from the day's services (location metadata only,
      // never pricing). NULL/empty leaves it to "To be confirmed".
      country:
        (typeof day.country === 'string' && day.country.trim()) ||
        deriveDayCountry({
          items: (day.dayItems || []).map((item: any) => ({
            hotelCountry: item.quoteService?.hotel?.cityRecord?.country ?? null,
            externalPackageCountry: item.quoteService?.externalPackageCountry ?? null,
          })),
        }),
      sortOrder: day.sortOrder,
      isActive: day.isActive,
      createdAt: day.createdAt,
      updatedAt: day.updatedAt,
      dayItems: (day.dayItems || []).map((item: any) => this.serializeDayItem(item)),
      poiAssignments: (day.poiAssignments || []).map((assignment: any) => this.serializeDayPoi(assignment)),
    };
  }

  private serializeDayPoi(assignment: any) {
    const poi = assignment.pointOfInterest || null;
    return {
      id: assignment.id,
      dayId: assignment.dayId,
      poiId: assignment.poiId,
      sourceTouringRouteStopId: assignment.sourceTouringRouteStopId,
      // Snapshot captured at assignment time — survives POI/stop deletion.
      fallbackTitle: assignment.fallbackTitle,
      fallbackCity: assignment.fallbackCity,
      sortOrder: assignment.sortOrder,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      // Live POI summary (null if the POI was deleted → SetNull). Display title
      // prefers the English translation, then the internal name.
      pointOfInterest: poi
        ? {
            id: poi.id,
            code: poi.code,
            name: poi.name,
            isActive: poi.isActive,
            displayTitle: this.resolvePoiDisplayTitle(poi),
            city: poi.city ? { id: poi.city.id, name: poi.city.name, country: poi.city.country ?? null } : null,
          }
        : null,
    };
  }

  private serializeDayItem(item: any) {
    return {
      id: item.id,
      dayId: item.dayId,
      quoteServiceId: item.quoteServiceId,
      sortOrder: item.sortOrder,
      notes: item.notes,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      quoteService: this.serializeQuoteServiceSummary(item.quoteService),
    };
  }

  private serializeQuoteServiceSummary(quoteService: any) {
    if (!quoteService) {
      return null;
    }

    return {
      id: quoteService.id,
      quoteId: quoteService.quoteId,
      optionId: quoteService.optionId,
      serviceDate: quoteService.serviceDate,
      startTime: quoteService.startTime,
      pickupTime: quoteService.pickupTime,
      pickupLocation: quoteService.pickupLocation,
      meetingPoint: quoteService.meetingPoint,
      quantity: quoteService.quantity,
      paxCount: quoteService.paxCount,
      participantCount: quoteService.participantCount,
      adultCount: quoteService.adultCount,
      childCount: quoteService.childCount,
      roomCount: quoteService.roomCount,
      nightCount: quoteService.nightCount,
      dayCount: quoteService.dayCount,
      pricingDescription: quoteService.pricingDescription,
      overrideReason: quoteService.overrideReason ?? null,
      reconfirmationRequired: quoteService.reconfirmationRequired,
      reconfirmationDueAt: quoteService.reconfirmationDueAt,
      // R.6C-1 — experience apply identifiers (scalars on QuoteService) so the
      // tailor-made panel can build a per-(day, record) conflict guard that
      // survives reload. Read-only; no pricing/schema impact.
      activityId: quoteService.activityId ?? null,
      activityRateVariantId: quoteService.activityRateVariantId ?? null,
      ticketRateVariantId: quoteService.ticketRateVariantId ?? null,
      service: quoteService.service
        ? {
            id: quoteService.service.id,
            name: quoteService.service.name,
            category: quoteService.service.category,
            serviceType: quoteService.service.serviceType
              ? {
                  id: quoteService.service.serviceType.id,
                  name: quoteService.service.serviceType.name,
                  code: quoteService.service.serviceType.code,
                }
              : null,
          }
        : null,
      hotel: quoteService.hotel
        ? {
            id: quoteService.hotel.id,
            name: quoteService.hotel.name,
            city: quoteService.hotel.city,
          }
        : null,
      contract: quoteService.contract
        ? {
            id: quoteService.contract.id,
            name: quoteService.contract.name,
            validFrom: quoteService.contract.validFrom,
            validTo: quoteService.contract.validTo,
            currency: quoteService.contract.currency,
          }
        : null,
      roomCategory: quoteService.roomCategory
        ? {
            id: quoteService.roomCategory.id,
            name: quoteService.roomCategory.name,
            code: quoteService.roomCategory.code,
          }
        : null,
      touringRoute: quoteService.touringRoute
        ? {
            id: quoteService.touringRoute.id,
            name: quoteService.touringRoute.name,
            startCity: quoteService.touringRoute.startCity,
          }
        : null,
      appliedVehicleRate: quoteService.appliedVehicleRate
        ? {
            id: quoteService.appliedVehicleRate.id,
            routeName: quoteService.appliedVehicleRate.routeName,
            vehicle: quoteService.appliedVehicleRate.vehicle
              ? {
                  id: quoteService.appliedVehicleRate.vehicle.id,
                  name: quoteService.appliedVehicleRate.vehicle.name,
                }
              : null,
            serviceType: quoteService.appliedVehicleRate.serviceType
              ? {
                  id: quoteService.appliedVehicleRate.serviceType.id,
                  name: quoteService.appliedVehicleRate.serviceType.name,
                  code: quoteService.appliedVehicleRate.serviceType.code,
                }
              : null,
          }
        : null,
    };
  }

  private formatDaySummary(day: { dayNumber: number; title: string; isActive?: boolean; sortOrder?: number } | null) {
    if (!day) {
      return null;
    }

    return `Day ${day.dayNumber} | ${day.title} | ${day.isActive === false ? 'Inactive' : 'Active'} | sort ${day.sortOrder ?? 0}`;
  }

  private formatDayItemSummary(item: { id?: string; notes?: string | null; isActive?: boolean; sortOrder?: number; quoteService?: any } | null) {
    if (!item?.quoteService) {
      return null;
    }

    const serviceName = item.quoteService.service?.name || 'Quote service';
    const serviceDate = item.quoteService.serviceDate ? new Date(item.quoteService.serviceDate).toISOString().slice(0, 10) : 'no-date';
    return `${serviceName} | ${serviceDate} | ${item.isActive === false ? 'Inactive' : 'Active'} | sort ${item.sortOrder ?? 0}${item.notes ? ` | ${item.notes}` : ''}`;
  }
}
