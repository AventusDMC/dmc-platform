import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BookingOperationServiceStatus,
  BookingOperationServiceType,
  BookingServiceLifecycleStatus,
  BookingServiceStatus,
  BookingDayStatus,
  HotelMealPlan,
  HotelOccupancyType,
  Prisma,
  QuoteOptionPricingMode,
  QuoteStatus,
  ServiceUnitType,
  TransportPricingMode,
} from '@prisma/client';
import PDFDocument = require('pdfkit');
import { randomBytes } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { AuditService } from '../audit/audit.service';
import { blockDelete, requireSupportedCurrency } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { requireActorCompanyId, type CompanyScopedActor } from '../auth/company-scope';
import { PromotionsService } from '../promotions/promotions.service';
import { TransportPricingService } from '../transport-pricing/transport-pricing.service';
import { normalizeRouteName } from '../routes/route-normalization';
import { buildProposalPricingViewModel } from './proposal-pricing';
import { ProposalV2Document, ProposalV2Renderer, ProposalV2ServiceGroup, ProposalV2ServiceItem } from './proposal-v2.renderer';
import { QuotePricingService } from './quote-pricing.service';
import { calculateMultiCurrencyQuoteItemPricing } from './multi-currency-pricing';


const GUIDE_RATES = {
  local: {
    half_day: 80,
    full_day: 120,
  },
  escort: {
    half_day: 140,
    full_day: 200,
  },
} as const;

const GUIDE_OVERNIGHT_SUPPLEMENT = 50;

type QuotePricingType = 'simple' | 'group';
type QuotePricingMode = 'SLAB' | 'FIXED';
type QuoteFocType = 'none' | 'ratio' | 'fixed';
type QuoteFocRoomType = 'single' | 'double';
type QuoteTypeValue = 'FIT' | 'GROUP';
type QuoteBookingType = 'FIT' | 'GROUP' | 'SERIES';
type JordanPassTypeValue = 'NONE' | 'WANDERER' | 'EXPLORER' | 'EXPERT';
const JORDAN_PASS_TYPES: JordanPassTypeValue[] = ['NONE', 'WANDERER', 'EXPLORER', 'EXPERT'];

type QuotePricingSlabInput = {
  id?: string;
  minPax: number;
  maxPax: number | null;
  price: number;
  focPax?: number | null;
  notes?: string | null;
};

type QuotePricingSlabRecord = QuotePricingSlabInput & {
  actualPax: number;
  focPax: number;
  payingPax: number;
  totalCost: number;
  totalSell: number;
  pricePerPayingPax: number;
  pricePerActualPax: number | null;
};

type CreateQuoteInput = {
  clientCompanyId: string;
  brandCompanyId?: string | null;
  contactId: string;
  agentId?: string | null;
  quoteType?: QuoteTypeValue;
  jordanPassType?: JordanPassTypeValue;
  bookingType?: QuoteBookingType;
  title: string;
  description?: string;
  inclusionsText?: string | null;
  exclusionsText?: string | null;
  termsNotesText?: string | null;
  pricingMode?: QuotePricingMode;
  pricingType?: QuotePricingType;
  fixedPricePerPerson?: number | null;
  pricingSlabs?: QuotePricingSlabInput[];
  focType?: QuoteFocType;
  focRatio?: number | null;
  focCount?: number | null;
  focRoomType?: QuoteFocRoomType | null;
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  singleSupplement?: number | null;
  travelStartDate?: Date | null;
  validUntil?: Date | null;
  quoteCurrency?: string;
};

type UpdateQuoteInput = Partial<CreateQuoteInput> & {
  status?: QuoteStatus;
};

type UpdateQuoteStatusInput = {
  status: QuoteStatus;
  acceptedVersionId?: string | null;
};

type QuoteInvoiceSummary = {
  id: string;
  quoteId: string;
  totalAmount: number;
  currency: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID';
  dueDate: Date;
};

type CreateQuoteItemInput = {
  quoteId: string;
  optionId?: string;
  serviceId: string;
  itineraryId?: string;
  serviceDate?: Date | null;
  startTime?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  meetingPoint?: string | null;
  participantCount?: number | null;
  adultCount?: number | null;
  childCount?: number | null;
  reconfirmationRequired?: boolean;
  reconfirmationDueAt?: Date | null;
  hotelId?: string;
  contractId?: string;
  seasonId?: string;
  seasonName?: string;
  roomCategoryId?: string;
  occupancyType?: HotelOccupancyType;
  mealPlan?: HotelMealPlan;
  guideType?: string;
  guideDuration?: string;
  overnight?: boolean;
  customServiceName?: string | null;
  unitCost?: number | null;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | 'PER_GROUP' | null;
  country?: string | null;
  supplierName?: string | null;
  startDay?: number | null;
  endDay?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  netCost?: number | null;
  includes?: string | null;
  excludes?: string | null;
  internalNotes?: string | null;
  clientDescription?: string | null;
  quantity: number;
  paxCount?: number;
  roomCount?: number;
  nightCount?: number;
  dayCount?: number;
  overrideCost?: number | null;
  overrideReason?: string | null;
  useOverride?: boolean;
  markupAmount?: number | null;
  sellPrice?: number | null;
  currency?: string | null;
  markupPercent: number;
  transportServiceTypeId?: string;
  routeId?: string;
  normalizedKey?: string;
  routeName?: string;
};

type UpdateQuoteItemInput = Partial<CreateQuoteItemInput>;

type GenerateQuoteScenariosInput = {
  quoteId: string;
  paxCounts: number[];
};

type CreateQuoteOptionInput = {
  quoteId: string;
  name?: string;
  notes?: string;
  hotelCategoryId?: string | null;
  pricingMode?: QuoteOptionPricingMode;
  packageMarginPercent?: number | null;
};

type UpdateQuoteOptionInput = {
  name?: string;
  notes?: string;
  hotelCategoryId?: string | null;
  pricingMode?: QuoteOptionPricingMode;
  packageMarginPercent?: number | null;
};

type CreateQuoteVersionInput = {
  quoteId: string;
  label?: string;
};

type ImportedItineraryItemType = 'hotel' | 'transport' | 'activity' | 'meal' | 'flight' | 'guide' | 'other' | 'external_package';

type CreateQuoteDraftFromImportedItineraryInput = {
  sourceType: 'text';
  days: Array<{
    dayNumber: number;
    title: string;
    summary: string;
  }>;
  items: Array<{
    dayNumber: number;
    type: ImportedItineraryItemType;
    title: string;
    description: string;
    notes: string;
    serviceType?: string;
    country?: string;
    supplierName?: string;
    startDay?: number;
    endDay?: number;
    startDate?: string;
    endDate?: string;
    pricingBasis?: 'PER_PERSON' | 'PER_GROUP' | string;
    netCost?: number;
    currency?: string;
    includes?: string;
    excludes?: string;
    internalNotes?: string;
    clientDescription?: string;
  }>;
  unresolved: Array<{
    type: ImportedItineraryItemType;
    title: string;
    description: string;
    notes: string;
  }>;
};

type ImportedDraftItem = CreateQuoteDraftFromImportedItineraryInput['items'][number];

type ServiceMatchCategoryKey = 'hotel' | 'transport' | 'activity' | 'meal' | 'guide' | 'other';

type ServiceMatchCandidate = {
  id: string;
  supplierId: string;
  name: string;
  category: string;
  serviceType: {
    name: string;
    code: string | null;
  } | null;
};

type ScoredServiceMatch = {
  serviceId: string;
  name: string;
  category: string;
  score: number;
  primaryOverlap: number;
  titleOverlap: number;
  primaryCoverage: number;
  titleCoverage: number;
  serviceNameCoverage: number;
  titlePhraseMatch: boolean;
  categoryKeywordSignal: boolean;
  locationOverlap: number;
  sharedTokenCount: number;
  hasActivityAndLocationSignal: boolean;
  strongCombinedOverlapSignal: boolean;
};

const IMPORTED_SERVICE_SUPPLIER_ID = 'import-itinerary-system';
const MIN_TRIP_SUMMARY_LENGTH = 20;
const QUOTE_TYPES = ['FIT', 'GROUP'] as const;
const BOOKING_TYPES = ['FIT', 'GROUP', 'SERIES'] as const;
const INVALID_TRIP_SUMMARY_PATTERNS = [
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /\bdummy text\b/i,
  /\bsample text\b/i,
  /\bcoming soon\b/i,
  /\bto be advised\b/i,
  /\b(?:tbd|tba|tbc|n\/a)\b/i,
  /^day\s+\d+/im,
  /\bimported itinerary\b/i,
];

const MATCH_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'onto',
  'than',
  'this',
  'that',
  'your',
  'their',
  'our',
  'day',
  'night',
  'service',
  'services',
  'included',
  'include',
  'arrival',
  'departure',
  'private',
  'shared',
  'visit',
  'touring',
]);

const MATCH_CATEGORY_KEYWORDS: Record<ServiceMatchCategoryKey, string[]> = {
  hotel: ['hotel', 'camp', 'resort', 'accommodation'],
  transport: ['transfer', 'transport', 'vehicle', 'flight', 'pickup', 'dropoff'],
  activity: ['tour', 'jeep', 'safari', 'hike', 'trek', 'cruise', 'excursion', 'visit', 'experience'],
  meal: ['meal', 'lunch', 'dinner', 'breakfast', 'restaurant', 'food'],
  guide: ['guide', 'guided', 'escort'],
  other: [],
};

@Injectable()
export class QuotesService {
  private static readonly QUOTE_NUMBER_RETRY_LIMIT = 5;
  private static readonly PUBLIC_REVISION_REQUESTED = 'REVISION_REQUESTED' as QuoteStatus;
  private static readonly CONFIRMED = 'CONFIRMED' as QuoteStatus;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly transportPricingService: TransportPricingService,
    private readonly promotionsService: PromotionsService,
    private readonly quotePricingService: QuotePricingService,
  ) {}

  findAll(actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return this.prisma.quote.findMany({
      where: {
        clientCompanyId: companyId,
      },
      include: {
        clientCompany: {
          include: {
            branding: true,
          },
        },
        brandCompany: {
          include: {
            branding: true,
          },
        },
        contact: true,
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        invoice: true,
        pricingSlabs: {
          orderBy: [
            { minPax: 'asc' },
            { maxPax: 'asc' },
            { createdAt: 'asc' },
          ],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    }).then((quotes) => quotes.map((quote) => this.attachResolvedQuoteFields(quote)));
  }

  findOne(id: string, actor?: CompanyScopedActor) {
    return this.loadQuoteState(id, this.prisma, actor).then((quote: any) => (quote ? this.attachResolvedQuoteFields(quote) : null));
  }

  private generatePublicQuoteToken() {
    return randomBytes(24).toString('hex');
  }

  private buildPublicProposalUrl(token: string) {
    const appUrl = (process.env.ADMIN_WEB_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');

    if (!appUrl) {
      return `/proposal/${token}`;
    }

    return `${appUrl}/proposal/${token}`;
  }

  async enablePublicLink(id: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const quoteModel = (this.prisma as any).quote;
    const existing = await quoteModel.findFirst({
      where: {
        id,
        clientCompanyId: companyId,
      },
      select: {
        id: true,
        publicToken: true,
        publicEnabled: true,
      },
    });

    if (!existing) {
      return null;
    }

    if (existing.publicEnabled && existing.publicToken) {
      return {
        publicToken: existing.publicToken,
        publicEnabled: true,
        publicUrl: this.buildPublicProposalUrl(existing.publicToken),
      };
    }

    const publicToken = this.generatePublicQuoteToken();
    const updated = await quoteModel.update({
      where: { id },
      data: {
        publicToken,
        publicEnabled: true,
      },
      select: {
        publicToken: true,
        publicEnabled: true,
      },
    });

    return {
      ...updated,
      publicUrl: updated.publicToken ? this.buildPublicProposalUrl(updated.publicToken) : null,
    };
  }

  async disablePublicLink(id: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const quoteModel = (this.prisma as any).quote;
    const existing = await quoteModel.findFirst({
      where: {
        id,
        clientCompanyId: companyId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return null;
    }

    return quoteModel.update({
      where: { id },
      data: {
        publicEnabled: false,
        publicToken: null,
      },
      select: {
        publicToken: true,
        publicEnabled: true,
      },
    });
  }

  async regeneratePublicLink(id: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const quoteModel = (this.prisma as any).quote;
    const existing = await quoteModel.findFirst({
      where: {
        id,
        clientCompanyId: companyId,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return null;
    }

    return quoteModel.update({
      where: { id },
      data: {
        publicToken: this.generatePublicQuoteToken(),
        publicEnabled: true,
      },
      select: {
        publicToken: true,
        publicEnabled: true,
      },
    }).then((result: { publicToken: string | null; publicEnabled: boolean }) => ({
      ...result,
      publicUrl: result.publicToken ? this.buildPublicProposalUrl(result.publicToken) : null,
    }));
  }

  async findPublicProposalQuote(token: string) {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      return null;
    }

    const quoteRef = await (this.prisma as any).quote.findFirst({
      where: {
        publicToken: normalizedToken,
        publicEnabled: true,
      },
      select: {
        id: true,
      },
    });

    if (!quoteRef) {
      return null;
    }

    return this.loadQuoteState(quoteRef.id);
  }

  async findPublicView(token: string) {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      return null;
    }

    const quoteModel = (this.prisma as any).quote;
    const quoteRef = await quoteModel.findFirst({
      where: {
        publicToken: normalizedToken,
        publicEnabled: true,
      },
      select: {
        id: true,
      },
    });

    if (!quoteRef) {
      return null;
    }

    const [quoteState, itineraryDays] = await Promise.all([
      this.loadQuoteState(quoteRef.id),
      (this.prisma as any).quoteItineraryDay.findMany({
        where: {
          quoteId: quoteRef.id,
          isActive: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { dayNumber: 'asc' }, { createdAt: 'asc' }],
        include: {
          dayItems: {
            where: {
              isActive: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            include: {
              quoteService: {
                include: {
                  service: {
                    include: {
                      serviceType: true,
                    },
                  },
                  hotel: true,
                  roomCategory: true,
                  appliedVehicleRate: {
                    include: {
                      vehicle: true,
                      serviceType: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    if (!quoteState) {
      return null;
    }

    const quote = this.attachResolvedQuoteFields(quoteState);

    return {
      quote: {
        title: quote.title,
        description: quote.description,
        quoteCurrency: (quote as any).quoteCurrency ?? 'USD',
        status: quote.status,
        adults: quote.adults,
        children: quote.children,
        nightCount: quote.nightCount,
        totalSell: quote.totalSell,
        pricePerPax: quote.pricePerPax,
        currentPricing: quote.currentPricing
          ? {
              label: quote.currentPricing.label,
              value: quote.currentPricing.value,
            }
          : null,
        priceComputation: quote.priceComputation
          ? {
              display: {
                summaryLabel: quote.priceComputation.display.summaryLabel,
                summaryValue: quote.priceComputation.display.summaryValue ?? null,
              },
            }
          : null,
        invoice: this.mapInvoiceSummary(quote.invoice),
      },
      itinerary: {
        days: itineraryDays.map((day: any) => ({
          dayNumber: day.dayNumber,
          title: day.title,
          notes: day.notes,
          sortOrder: day.sortOrder,
          isActive: day.isActive,
          dayItems: day.dayItems.map((item: any) => ({
            sortOrder: item.sortOrder,
            notes: item.notes,
            isActive: item.isActive,
                quoteService: item.quoteService
              ? {
                  serviceDate: item.quoteService.serviceDate,
                  startTime: item.quoteService.startTime,
                  pickupTime: item.quoteService.pickupTime,
                  pickupLocation: item.quoteService.pickupLocation,
                  meetingPoint: item.quoteService.meetingPoint,
                  paxCount: item.quoteService.paxCount,
                  participantCount: item.quoteService.participantCount,
                  adultCount: item.quoteService.adultCount,
                  childCount: item.quoteService.childCount,
                  pricingDescription: item.quoteService.pricingDescription,
                  currency: item.quoteService.currency,
                  quoteCurrency: (item.quoteService as any).quoteCurrency ?? item.quoteService.currency,
                  totalSell: item.quoteService.totalSell,
                  salesTaxPercent: (item.quoteService as any).salesTaxPercent ?? 0,
                  salesTaxIncluded: Boolean((item.quoteService as any).salesTaxIncluded),
                  serviceChargePercent: (item.quoteService as any).serviceChargePercent ?? 0,
                  serviceChargeIncluded: Boolean((item.quoteService as any).serviceChargeIncluded),
                  tourismFeeAmount: (item.quoteService as any).tourismFeeAmount ?? null,
                  tourismFeeMode: (item.quoteService as any).tourismFeeMode ?? null,
                  service: item.quoteService.service
                    ? {
                        name: item.quoteService.service.name,
                        category: item.quoteService.service.category,
                        serviceType: item.quoteService.service.serviceType
                          ? {
                              name: item.quoteService.service.serviceType.name,
                              code: item.quoteService.service.serviceType.code,
                            }
                          : null,
                      }
                    : null,
                  hotel: item.quoteService.hotel
                    ? {
                        name: item.quoteService.hotel.name,
                        city: item.quoteService.hotel.city,
                      }
                    : null,
                  roomCategory: item.quoteService.roomCategory
                    ? {
                        name: item.quoteService.roomCategory.name,
                        code: item.quoteService.roomCategory.code,
                      }
                    : null,
                  appliedVehicleRate: item.quoteService.appliedVehicleRate
                    ? {
                        routeName: item.quoteService.appliedVehicleRate.routeName,
                        vehicle: item.quoteService.appliedVehicleRate.vehicle
                          ? {
                              name: item.quoteService.appliedVehicleRate.vehicle.name,
                            }
                          : null,
                        serviceType: item.quoteService.appliedVehicleRate.serviceType
                          ? {
                              name: item.quoteService.appliedVehicleRate.serviceType.name,
                              code: item.quoteService.appliedVehicleRate.serviceType.code,
                            }
                          : null,
                      }
                    : null,
                }
              : null,
          })),
        })),
      },
    };
  }

  async acceptPublicQuote(token: string) {
    return this.prisma.$transaction(async (tx) => {
      const quoteModel = (tx as any).quote;
      const quote = await quoteModel.findFirst({
        where: {
          publicToken: token.trim(),
          publicEnabled: true,
        },
        select: {
          id: true,
          status: true,
          acceptedVersionId: true,
        },
      });

      if (!quote) {
        return null;
      }

      if (
        quote.status === QuoteStatus.ACCEPTED ||
        quote.status === QuotesService.CONFIRMED ||
        quote.status === QuotesService.PUBLIC_REVISION_REQUESTED
      ) {
        throw new BadRequestException('Quote interaction already completed');
      }

      const acceptedVersion = await this.resolveAcceptedQuoteVersion({
        quoteId: quote.id,
        acceptedVersionId: quote.acceptedVersionId ?? null,
        prismaClient: tx,
      });

      const lifecycleTimestamps = this.buildQuoteStatusTimestamps({
        currentStatus: quote.status,
        nextStatus: QuoteStatus.ACCEPTED,
        currentSentAt: null,
        currentAcceptedAt: null,
      });

      const updatedQuote = await quoteModel.update({
        where: { id: quote.id },
        data: {
          status: QuoteStatus.ACCEPTED,
          acceptedVersionId: acceptedVersion.id,
          acceptedAt: lifecycleTimestamps.acceptedAt,
        },
        select: {
          id: true,
          status: true,
        },
      });

      const invoice = await this.ensureInvoiceForAcceptedQuote(quote.id, tx);

      return {
        status: updatedQuote.status,
        invoice: this.mapInvoiceSummary(invoice),
      };
    });
  }

  async requestPublicQuoteChanges(token: string, message: string) {
    const normalizedMessage = message.trim();

    if (!normalizedMessage) {
      throw new BadRequestException('Change request message is required');
    }

    const quoteModel = (this.prisma as any).quote;
    const quote = await quoteModel.findFirst({
      where: {
        publicToken: token.trim(),
        publicEnabled: true,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!quote) {
      return null;
    }

    if (
      quote.status === QuoteStatus.ACCEPTED ||
      quote.status === QuotesService.CONFIRMED ||
      quote.status === QuotesService.PUBLIC_REVISION_REQUESTED
    ) {
      throw new BadRequestException('Quote interaction already completed');
    }

    return quoteModel.update({
      where: { id: quote.id },
      data: {
        status: QuotesService.PUBLIC_REVISION_REQUESTED,
        clientChangeRequestMessage: normalizedMessage,
      },
      select: {
        status: true,
      },
    });
  }

  async create(data: CreateQuoteInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);

    if (data.clientCompanyId !== companyId) {
      throw new BadRequestException('Quote company does not match the current company');
    }

    if (data.brandCompanyId && data.brandCompanyId !== companyId) {
      throw new BadRequestException('Branding company does not match the current company');
    }

    const normalizedAgentId = data.agentId === undefined ? undefined : data.agentId?.trim() || null;
    const [clientCompany, brandCompany, contact, agent] = await Promise.all([
      this.prisma.company.findFirst({
        where: { id: companyId },
      }),
      data.brandCompanyId
        ? this.prisma.company.findFirst({
            where: { id: companyId },
          })
        : Promise.resolve(null),
      this.prisma.contact.findFirst({
        where: {
          id: data.contactId,
          companyId,
        },
      }),
      normalizedAgentId
        ? this.prisma.user.findFirst({
            where: {
              id: normalizedAgentId,
              companyId,
              role: {
                name: 'agent',
              },
            },
            select: {
              id: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!clientCompany) {
      throw new BadRequestException('Company not found');
    }

    if (!contact) {
      throw new BadRequestException('Contact not found');
    }

    if (contact.companyId !== data.clientCompanyId) {
      throw new BadRequestException('Contact does not belong to the selected company');
    }

    if (data.brandCompanyId && !brandCompany) {
      throw new BadRequestException('Branding company not found');
    }

    if (normalizedAgentId && !agent) {
      throw new BadRequestException('Assigned agent must be an agent user in the current company');
    }

    const pricingType = this.normalizeQuotePricingType(data.pricingType);
    const pricingMode = this.normalizeQuotePricingMode(data.pricingMode, pricingType);
    const normalizedSlabs = data.pricingSlabs?.length ? this.normalizePricingSlabInputs(data.pricingSlabs) : [];
    const fixedPricePerPerson = this.normalizeFixedPricePerPerson(data.fixedPricePerPerson);

    if (pricingMode === 'SLAB') {
      this.quotePricingService.assertValidPricingConfig({
        mode: 'group',
        pricingSlabs: normalizedSlabs,
      });
    }

    if (pricingMode === 'FIXED' && normalizedSlabs.length > 0) {
      throw new BadRequestException('Pricing slabs can only be saved when pricingMode is SLAB');
    }

    for (let attempt = 0; attempt < QuotesService.QUOTE_NUMBER_RETRY_LIMIT; attempt += 1) {
      try {
        const createdQuoteId = await this.prisma.$transaction(async (tx) => {
          const quoteNumber = await this.generateNextQuoteNumber(tx);

          const createdQuote = await tx.quote.create({
            data: {
              quoteNumber,
              clientCompanyId: data.clientCompanyId,
              brandCompanyId: data.brandCompanyId ?? null,
              contactId: data.contactId,
              agentId: normalizedAgentId ?? null,
              quoteType: this.normalizeQuoteType(data.quoteType),
              jordanPassType: this.normalizeJordanPassType(data.jordanPassType),
              bookingType: this.normalizeBookingType(data.bookingType),
              title: data.title,
              description: data.description || null,
              quoteCurrency: this.validateInputCurrencyCode(data.quoteCurrency, 'quoteCurrency'),
              inclusionsText: this.normalizeSupportText(data.inclusionsText),
              exclusionsText: this.normalizeSupportText(data.exclusionsText),
              termsNotesText: this.normalizeSupportText(data.termsNotesText),
              pricingType: pricingMode === 'SLAB' ? 'group' : 'simple',
              pricingMode,
              ...this.normalizeQuoteFocConfig({
                focType: data.focType,
                focRatio: data.focRatio,
                focCount: data.focCount,
                focRoomType: data.focRoomType,
              }),
              adults: data.adults,
              children: data.children,
              roomCount: data.roomCount,
              nightCount: data.nightCount,
              singleSupplement: data.singleSupplement ?? null,
              travelStartDate: this.normalizeQuoteLifecycleDate(data.travelStartDate),
              validUntil: this.normalizeQuoteLifecycleDate(data.validUntil),
              totalPrice: 0,
              totalCost: 0,
              totalSell: 0,
              pricePerPax: 0,
              fixedPricePerPerson,
              pricingSlabs: normalizedSlabs.length
                ? {
                    create: normalizedSlabs,
                  }
                : undefined,
            } as any,
            include: {
              clientCompany: {
                include: {
                  branding: true,
                },
              },
              brandCompany: {
                include: {
                  branding: true,
                },
              },
              contact: true,
              pricingSlabs: {
                orderBy: [
                  { minPax: 'asc' },
                  { maxPax: 'asc' },
                  { createdAt: 'asc' },
                ],
              },
            },
          });

          return createdQuote.id;
        });

        await this.recalculateQuoteTotals(createdQuoteId);

        return this.loadQuoteState(createdQuoteId, this.prisma, actor);
      } catch (error) {
        if (this.isQuoteNumberConflict(error) && attempt < QuotesService.QUOTE_NUMBER_RETRY_LIMIT - 1) {
          continue;
        }

        throw error;
      }
    }

    throw new BadRequestException('Could not generate a unique quote number');
  }

  async createDraftFromImportedItinerary(data: CreateQuoteDraftFromImportedItineraryInput) {
    const normalizedDays = this.normalizeImportedItineraryDays(data.days, data.items);
    const normalizedItems = data.items.map((item, index) => this.normalizeImportedDraftItem(item, index, normalizedDays[0]?.dayNumber || 1));
    const normalizedUnresolvedItems = (data.unresolved || []).map((item, index) => ({
      type: this.normalizeImportedItemType(item.type),
      title: item.title?.trim() || `Unresolved item ${index + 1}`,
      description: item.description?.trim() || '',
      notes: item.notes?.trim() || '',
    }));

    return this.prisma.$transaction(async (tx) => {
      const { companyId, contactId } = await this.getOrCreateImportedQuoteDefaults(tx);
      const importedServices = await this.getOrCreateImportedServices(
        Array.from(new Set(normalizedItems.map((item) => item.type))),
        tx,
      );
      const serviceCandidates = await tx.supplierService.findMany({
        where: {
          supplierId: {
            not: IMPORTED_SERVICE_SUPPLIER_ID,
          },
        },
        select: {
          id: true,
          supplierId: true,
          name: true,
          category: true,
          serviceType: {
            select: {
              name: true,
              code: true,
            },
          },
        },
      });
      const quoteNumber = await this.generateNextQuoteNumber(tx);
      const quote = await tx.quote.create({
        data: {
          quoteNumber,
          clientCompanyId: companyId,
          brandCompanyId: companyId,
          contactId,
          bookingType: 'FIT',
          title: this.buildImportedQuoteTitle(normalizedDays),
          description: this.buildImportedQuoteDescription(normalizedDays),
          pricingType: 'simple',
          pricingMode: 'FIXED',
          focType: 'none',
          focRatio: null,
          focCount: null,
          focRoomType: null,
          adults: 1,
          children: 0,
          roomCount: 1,
          nightCount: Math.max(1, normalizedDays.length),
          singleSupplement: null,
          status: QuoteStatus.DRAFT,
          totalPrice: 0,
          totalCost: 0,
          totalSell: 0,
          pricePerPax: 0,
          fixedPricePerPerson: 0,
          quoteCurrency: 'USD',
        } as any,
        select: {
          id: true,
        },
      });
      const itineraries = await Promise.all(
        normalizedDays.map((day) =>
          tx.itinerary.create({
            data: {
              quoteId: quote.id,
              dayNumber: day.dayNumber,
              title: day.title,
              description: day.summary || null,
            },
            select: {
              id: true,
              dayNumber: true,
            },
          }),
        ),
      );
      const itineraryIdsByDayNumber = new Map(itineraries.map((itinerary) => [itinerary.dayNumber, itinerary.id]));
      const quoteItineraryDays = await Promise.all(
        normalizedDays.map((day, index) =>
          (tx as any).quoteItineraryDay.create({
            data: {
              quoteId: quote.id,
              dayNumber: day.dayNumber,
              title: day.title,
              notes: day.summary || null,
              sortOrder: index,
              isActive: true,
            },
            select: {
              id: true,
              dayNumber: true,
            },
          }),
        ),
      );
      const quoteItineraryDayIdsByDayNumber = new Map(
        quoteItineraryDays.map((day: { id: string; dayNumber: number }) => [day.dayNumber, day.id]),
      );

      const createdQuoteItemIdsByDayNumber = new Map<number, string[]>();

      if (normalizedItems.length > 0) {
        for (const item of normalizedItems) {
          const matchedServiceId = this.matchImportedItemToSupplierService(item, serviceCandidates);
          const externalPackageData = this.buildImportedExternalPackageQuoteItemData(item, quote.id, (quote as any).quoteCurrency || 'USD');
          const createdItem = await tx.quoteItem.create({
            data: {
              quoteId: quote.id,
              serviceId: matchedServiceId ?? importedServices.get(item.type)!,
              itineraryId: itineraryIdsByDayNumber.get(item.dayNumber) || null,
              quantity: 1,
              paxCount: null,
              roomCount: null,
              nightCount: null,
              dayCount: 1,
              baseCost: 0,
              finalCost: 0,
              costBaseAmount: 0,
              costCurrency: 'USD',
              quoteCurrency: 'USD',
              salesTaxPercent: 0,
              salesTaxIncluded: false,
              serviceChargePercent: 0,
              serviceChargeIncluded: false,
              tourismFeeAmount: null,
              tourismFeeCurrency: null,
              tourismFeeMode: null,
              fxRate: null,
              fxFromCurrency: null,
              fxToCurrency: null,
              fxRateDate: null,
              overrideCost: null,
              overrideReason: null,
              useOverride: false,
              currency: 'USD',
              pricingDescription: this.buildImportedItemPricingDescription(item),
              markupPercent: 0,
              totalCost: 0,
              totalSell: 0,
              ...externalPackageData,
            } as any,
            select: {
              id: true,
            },
          });

          const currentIds = createdQuoteItemIdsByDayNumber.get(item.dayNumber) || [];
          currentIds.push(createdItem.id);
          createdQuoteItemIdsByDayNumber.set(item.dayNumber, currentIds);
        }
      }

      if (normalizedUnresolvedItems.length > 0) {
        for (const item of normalizedUnresolvedItems) {
          await tx.quoteItem.create({
            data: {
              quoteId: quote.id,
              serviceId: importedServices.get(item.type)!,
              itineraryId: null,
              quantity: 1,
              paxCount: null,
              roomCount: null,
              nightCount: null,
              dayCount: 1,
              baseCost: 0,
              finalCost: 0,
              costBaseAmount: 0,
              costCurrency: 'USD',
              quoteCurrency: 'USD',
              salesTaxPercent: 0,
              salesTaxIncluded: false,
              serviceChargePercent: 0,
              serviceChargeIncluded: false,
              tourismFeeAmount: null,
              tourismFeeCurrency: null,
              tourismFeeMode: null,
              fxRate: null,
              fxFromCurrency: null,
              fxToCurrency: null,
              fxRateDate: null,
              overrideCost: null,
              overrideReason: null,
              useOverride: false,
              currency: 'USD',
              pricingDescription: this.buildImportedItemPricingDescription(item),
              markupPercent: 0,
              totalCost: 0,
              totalSell: 0,
            } as any,
          });
        }
      }

      const quoteItineraryDayItems = Array.from(createdQuoteItemIdsByDayNumber.entries()).flatMap(([dayNumber, quoteServiceIds]) => {
        const dayId = quoteItineraryDayIdsByDayNumber.get(dayNumber);

        if (!dayId) {
          return [];
        }

        return quoteServiceIds.map((quoteServiceId, index) => ({
          dayId,
          quoteServiceId,
          sortOrder: index,
          notes: null,
          isActive: true,
        }));
      });

      if (quoteItineraryDayItems.length > 0) {
        await (tx as any).quoteItineraryDayItem.createMany({
          data: quoteItineraryDayItems,
        });
      }

      return { id: quote.id };
    });
  }

  async update(id: string, data: UpdateQuoteInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const quote = await this.prisma.quote.findFirst({
      where: {
        id,
        clientCompanyId: companyId,
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    const clientCompanyId = data.clientCompanyId ?? quote.clientCompanyId;
    const brandCompanyId = data.brandCompanyId === undefined ? quote.brandCompanyId : data.brandCompanyId;
    const isBrandCompanyUpdate = data.brandCompanyId !== undefined;
    const contactId = data.contactId ?? quote.contactId;
    const isAgentUpdate = data.agentId !== undefined;
    const agentId = isAgentUpdate ? data.agentId?.trim() || null : (quote as any).agentId ?? null;
    const quoteCurrency = this.validateInputCurrencyCode(
      data.quoteCurrency ?? (quote as any).quoteCurrency ?? 'USD',
      'quoteCurrency',
    );

    if (clientCompanyId !== companyId) {
      throw new BadRequestException('Quote company does not match the current company');
    }

    if (isBrandCompanyUpdate && brandCompanyId && brandCompanyId !== companyId) {
      throw new BadRequestException('Branding company does not match the current company');
    }

    const storedPricingType = this.normalizeQuotePricingType(quote.pricingType);
    const pricingType =
      data.pricingType === undefined ? storedPricingType : this.normalizeQuotePricingType(data.pricingType);
    const pricingMode = this.normalizeQuotePricingMode(data.pricingMode ?? quote.pricingMode, pricingType);
    const fixedPricePerPerson =
      data.fixedPricePerPerson === undefined
        ? this.normalizeFixedPricePerPerson(quote.fixedPricePerPerson)
        : this.normalizeFixedPricePerPerson(data.fixedPricePerPerson);
    let nextAcceptedVersionId = quote.acceptedVersionId;

    if (data.status === QuoteStatus.ACCEPTED) {
      if (!quote.acceptedVersionId) {
        throw new BadRequestException('Use the quote status workflow to mark a quote as ACCEPTED after selecting an accepted version');
      }

      nextAcceptedVersionId = (
        await this.resolveAcceptedQuoteVersion({
          quoteId: id,
          acceptedVersionId: quote.acceptedVersionId,
        })
      ).id;
    }
    const lifecycleTimestamps =
      data.status === undefined
        ? null
        : this.buildQuoteStatusTimestamps({
            currentStatus: quote.status,
            nextStatus: data.status,
            currentSentAt: quote.sentAt,
            currentAcceptedAt: quote.acceptedAt,
          });
    const focConfig = this.normalizeQuoteFocConfig({
      focType: data.focType === undefined ? this.normalizeQuoteFocType(quote.focType) : data.focType,
      focRatio: data.focRatio === undefined ? quote.focRatio : data.focRatio,
      focCount: data.focCount === undefined ? quote.focCount : data.focCount,
      focRoomType: data.focRoomType === undefined ? this.normalizeQuoteFocRoomType(quote.focRoomType) : data.focRoomType,
    });
    const [clientCompany, brandCompany, contact, agent] = await Promise.all([
      this.prisma.company.findFirst({
        where: { id: companyId },
      }),
      isBrandCompanyUpdate && brandCompanyId
        ? this.prisma.company.findFirst({
            where: { id: companyId },
          })
        : Promise.resolve(null),
      this.prisma.contact.findFirst({
        where: {
          id: contactId,
          companyId,
        },
      }),
      agentId
        ? this.prisma.user.findFirst({
            where: {
              id: agentId,
              companyId,
              role: {
                name: 'agent',
              },
            },
            select: {
              id: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!clientCompany) {
      throw new BadRequestException('Company not found');
    }

    if (!contact) {
      throw new BadRequestException('Contact not found');
    }

    if (contact.companyId !== clientCompanyId) {
      throw new BadRequestException('Contact does not belong to the selected company');
    }

    if (isBrandCompanyUpdate && brandCompanyId && !brandCompany) {
      throw new BadRequestException('Branding company not found');
    }

    if (agentId && !agent) {
      throw new BadRequestException('Assigned agent must be an agent user in the current company');
    }

    if (data.pricingSlabs !== undefined && pricingMode === 'FIXED' && data.pricingSlabs.length > 0) {
      throw new BadRequestException('Pricing slabs can only be saved when pricingMode is SLAB');
    }

    const normalizedSlabs =
      pricingMode === 'FIXED'
        ? []
        : data.pricingSlabs === undefined
          ? undefined
          : this.normalizePricingSlabInputs(data.pricingSlabs);

    if (pricingMode === 'SLAB' && normalizedSlabs !== undefined) {
      this.quotePricingService.assertValidPricingConfig({
        mode: 'group',
        pricingSlabs: normalizedSlabs,
      });
    }

      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.quote.update({
        where: { id },
        data: {
          clientCompanyId,
          brandCompanyId,
          contactId,
          agentId,
          quoteType: data.quoteType === undefined ? undefined : this.normalizeQuoteType(data.quoteType),
          jordanPassType: data.jordanPassType === undefined ? undefined : this.normalizeJordanPassType(data.jordanPassType),
          bookingType: data.bookingType === undefined ? undefined : this.normalizeBookingType(data.bookingType),
          title: data.title === undefined ? undefined : data.title.trim(),
          description: data.description === undefined ? undefined : data.description || null,
          quoteCurrency,
          inclusionsText: data.inclusionsText === undefined ? undefined : this.normalizeSupportText(data.inclusionsText),
          exclusionsText: data.exclusionsText === undefined ? undefined : this.normalizeSupportText(data.exclusionsText),
          termsNotesText: data.termsNotesText === undefined ? undefined : this.normalizeSupportText(data.termsNotesText),
          pricingType: pricingMode === 'SLAB' ? 'group' : 'simple',
          pricingMode,
          fixedPricePerPerson,
          ...focConfig,
          adults: data.adults,
          children: data.children,
          roomCount: data.roomCount,
          nightCount: data.nightCount,
          singleSupplement: data.singleSupplement === undefined ? undefined : data.singleSupplement,
          travelStartDate:
            data.travelStartDate === undefined ? undefined : this.normalizeQuoteLifecycleDate(data.travelStartDate),
          validUntil: data.validUntil === undefined ? undefined : this.normalizeQuoteLifecycleDate(data.validUntil),
          status: data.status,
          acceptedVersionId: data.status === QuoteStatus.ACCEPTED ? nextAcceptedVersionId : undefined,
          sentAt: lifecycleTimestamps?.sentAt,
          acceptedAt: lifecycleTimestamps?.acceptedAt,
        } as any,
      });

      if (normalizedSlabs !== undefined) {
        await this.replaceQuotePricingSlabs(tx, id, normalizedSlabs);
      }

      return id;
    });

    await this.recalculateQuoteTotals(updated);

    return this.loadQuoteState(updated, this.prisma, actor);
  }

  findPricingSlabs(quoteId: string) {
    return this.prisma.quotePricingSlab.findMany({
      where: { quoteId },
      orderBy: [
        { minPax: 'asc' },
        { maxPax: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  private comparePricingSlabRanges(
    left: { minPax: number; maxPax: number | null },
    right: { minPax: number; maxPax: number | null },
  ) {
    return (
      left.minPax - right.minPax ||
      (left.maxPax ?? Number.MAX_SAFE_INTEGER) - (right.maxPax ?? Number.MAX_SAFE_INTEGER)
    );
  }

  async createPricingSlab(quoteId: string, data: QuotePricingSlabInput, actor?: CompanyScopedActor) {
    const quote = await this.assertQuoteMutationAccess(quoteId, actor, {
      select: {
        id: true,
        pricingType: true,
        pricingMode: true,
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    if (this.normalizeQuotePricingMode(quote.pricingMode, this.normalizeQuotePricingType(quote.pricingType)) !== 'SLAB') {
      throw new BadRequestException('Pricing slabs are only available for group pricing quotes');
    }

    const normalized = this.normalizePricingSlabInput(data);
    const existingSlabs = await this.findPricingSlabs(quote.id);
    this.quotePricingService.assertValidPricingConfig({
      mode: 'group',
      pricingSlabs: [...existingSlabs, normalized].sort((left, right) => this.comparePricingSlabRanges(left, right)),
    });

    const createdSlab = await this.prisma.quotePricingSlab.create({
      data: {
        quoteId: quote.id,
        ...normalized,
      },
    });

    await this.recalculateQuoteTotals(quote.id);

    return this.prisma.quotePricingSlab.findUnique({
      where: { id: createdSlab.id },
    });
  }

  async updatePricingSlab(quoteId: string, slabId: string, data: Partial<QuotePricingSlabInput>, actor?: CompanyScopedActor) {
    const quote = await this.assertQuoteMutationAccess(quoteId, actor);
    const slab = await this.prisma.quotePricingSlab.findFirst({
      where: {
        id: slabId,
        quoteId: quote.id,
      },
    });

    if (!slab) {
      throw new BadRequestException('Quote pricing slab not found');
    }

    const normalized = this.normalizePricingSlabInput({
      minPax: data.minPax === undefined ? slab.minPax : data.minPax,
      maxPax: data.maxPax === undefined ? slab.maxPax : data.maxPax,
      price: data.price === undefined ? slab.price : data.price,
      focPax: data.focPax === undefined ? slab.focPax : data.focPax,
      notes: data.notes === undefined ? slab.notes : data.notes,
    });

    const existingSlabs = await this.findPricingSlabs(quote.id);
    this.quotePricingService.assertValidPricingConfig({
      mode: 'group',
      pricingSlabs:
      existingSlabs
        .map((existing) => (existing.id === slabId ? { ...existing, ...normalized } : existing))
        .sort((left, right) => this.comparePricingSlabRanges(left, right)),
    });

    const updatedSlab = await this.prisma.quotePricingSlab.update({
      where: { id: slabId },
      data: normalized,
    });

    await this.recalculateQuoteTotals(quote.id);

    return this.prisma.quotePricingSlab.findUnique({
      where: { id: updatedSlab.id },
    });
  }

  async removePricingSlab(quoteId: string, slabId: string, actor?: CompanyScopedActor) {
    const quote = await this.assertQuoteMutationAccess(quoteId, actor);
    const slab = await this.prisma.quotePricingSlab.findFirst({
      where: {
        id: slabId,
        quoteId: quote.id,
      },
      select: {
        id: true,
        quoteId: true,
      },
    });

    if (!slab) {
      throw new BadRequestException('Quote pricing slab not found');
    }

    const deletedSlab = await this.prisma.quotePricingSlab.delete({
      where: { id: slabId },
    });

    await this.recalculateQuoteTotals(quote.id);

    return deletedSlab;
  }

  async updateStatus(id: string, data: UpdateQuoteStatusInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const quote = await this.prisma.quote.findFirst({
      where: {
        id,
        clientCompanyId: companyId,
      },
      select: {
        id: true,
        status: true,
        acceptedVersionId: true,
        sentAt: true,
        acceptedAt: true,
        pricingType: true,
        pricingMode: true,
        pricingSlabs: {
          orderBy: [{ minPax: 'asc' }, { maxPax: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            minPax: true,
            maxPax: true,
            price: true,
          },
        },
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    let acceptedVersionId = quote.acceptedVersionId ?? null;

    if (data.status === QuoteStatus.ACCEPTED) {
      if (this.normalizeQuotePricingMode(quote.pricingMode, this.normalizeQuotePricingType(quote.pricingType)) === 'SLAB') {
        this.quotePricingService.assertValidPricingConfig({
          mode: 'group',
          pricingSlabs: quote.pricingSlabs,
        });
      }

      acceptedVersionId = (
        await this.resolveAcceptedQuoteVersion({
          quoteId: id,
          acceptedVersionId: data.acceptedVersionId ?? null,
        })
      ).id;
    } else if (data.status === QuotesService.CONFIRMED) {
      acceptedVersionId = (
        await this.resolveAcceptedQuoteVersion({
          quoteId: id,
          acceptedVersionId: quote.acceptedVersionId ?? null,
        })
      ).id;
    } else {
      acceptedVersionId = null;
    }

    if (data.status === QuoteStatus.READY || data.status === QuoteStatus.SENT) {
      const workflowQuote = await this.loadQuoteState(id, this.prisma, actor);

      if (!workflowQuote) {
        throw new BadRequestException('Quote not found');
      }

      this.assertQuoteWorkflowStateIsComplete(workflowQuote);
    }

    const lifecycleTimestamps = this.buildQuoteStatusTimestamps({
      currentStatus: quote.status,
      nextStatus: data.status,
      currentSentAt: quote.sentAt,
      currentAcceptedAt: quote.acceptedAt,
    });

    return this.prisma.quote.update({
      where: { id },
      data: {
        status: data.status,
        acceptedVersionId,
        sentAt: lifecycleTimestamps.sentAt,
        acceptedAt: lifecycleTimestamps.acceptedAt,
      },
      include: {
        clientCompany: {
          include: {
            branding: true,
          },
        },
        brandCompany: {
          include: {
            branding: true,
          },
        },
        contact: true,
      },
    }).then((quote) => this.attachResolvedQuoteFields(quote));
  }

  async createInvoice(id: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const quote = await this.prisma.quote.findFirst({
      where: {
        id,
        clientCompanyId: companyId,
      },
      select: {
        id: true,
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    const invoice = await this.ensureInvoiceForAcceptedQuote(id, this.prisma, actor);
    return this.mapInvoiceSummary(invoice);
  }

  async repairAcceptedQuoteVersionLinks(companyId?: string) {
    const companyIds = companyId ? [companyId] : await this.listCompanyIdsForMaintenanceJobs();
    const repaired: Array<{ quoteId: string; acceptedVersionId: string; companyId: string }> = [];
    const failed: Array<{ quoteId: string; reason: string; companyId: string }> = [];
    let scanned = 0;

    for (const targetCompanyId of companyIds) {
      const result = await this.repairAcceptedQuoteVersionLinksForCompany(targetCompanyId);
      scanned += result.scanned;
      repaired.push(...result.repaired);
      failed.push(...result.failed);
    }

    return {
      scanned,
      repaired,
      failed,
    };
  }

  private async repairAcceptedQuoteVersionLinksForCompany(companyId: string) {
    const brokenQuotes = await this.prisma.quote.findMany({
      where: {
        clientCompanyId: companyId,
        status: {
          in: [QuoteStatus.ACCEPTED, QuotesService.CONFIRMED],
        },
        acceptedVersionId: null,
      },
      select: {
        id: true,
        status: true,
        title: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const repaired: Array<{ quoteId: string; acceptedVersionId: string; companyId: string }> = [];
    const failed: Array<{ quoteId: string; reason: string; companyId: string }> = [];

    for (const quote of brokenQuotes) {
      try {
        const version = await this.resolveAcceptedQuoteVersion({
          quoteId: quote.id,
        });

        await this.prisma.quote.update({
          where: { id: quote.id },
          data: {
            acceptedVersionId: version.id,
          },
        });

        repaired.push({
          quoteId: quote.id,
          acceptedVersionId: version.id,
          companyId,
        });
      } catch (error) {
        failed.push({
          quoteId: quote.id,
          reason: error instanceof Error ? error.message : 'Could not resolve accepted version',
          companyId,
        });
      }
    }

    return {
      scanned: brokenQuotes.length,
      repaired,
      failed,
    };
  }

  async convertToBooking(id: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: {
          id,
          clientCompanyId: companyId,
        },
        select: {
          id: true,
          status: true,
          acceptedVersionId: true,
          booking: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!quote) {
        throw new BadRequestException('Quote not found');
      }

      if (quote.status !== QuoteStatus.ACCEPTED && quote.status !== QuotesService.CONFIRMED) {
        throw new BadRequestException('Only accepted or confirmed quotes can be converted to bookings');
      }

      if (!quote.acceptedVersionId) {
        throw new BadRequestException('Accepted quote is missing acceptedVersionId');
      }

      if (quote.booking) {
        throw new BadRequestException('A booking already exists for this quote');
      }

      const acceptedVersion = await tx.quoteVersion.findFirst({
        where: {
          id: quote.acceptedVersionId,
          quoteId: quote.id,
        },
        select: {
          id: true,
          quoteId: true,
          snapshotJson: true,
          booking: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!acceptedVersion || acceptedVersion.quoteId !== id) {
        throw new BadRequestException('Accepted quote version not found');
      }

      if (acceptedVersion.booking) {
        throw new BadRequestException('A booking already exists for the accepted version');
      }

      const bookingSnapshot = this.buildBookingSnapshotFromAcceptedVersion(acceptedVersion.snapshotJson);
      const bookingServices = await this.buildBookingServicesFromAcceptedVersion(acceptedVersion.snapshotJson, tx);
      const bookingDays = this.buildBookingDaysFromAcceptedVersion(acceptedVersion.snapshotJson);
      const bookingRef = await this.generateNextBookingRef(tx);
      const startDate = this.parseDateLike(bookingSnapshot.travelStartDate);
      const endDate = startDate
        ? new Date(startDate.getTime() + Math.max(0, bookingSnapshot.nightCount) * 24 * 60 * 60 * 1000)
        : null;

      const createdBooking = await tx.booking.create({
        data: {
          bookingRef,
          accessToken: this.generateBookingAccessToken(),
          quoteId: quote.id,
          clientCompanyId: companyId,
          acceptedVersionId: acceptedVersion.id,
          bookingType: bookingSnapshot.bookingType,
          snapshotJson: bookingSnapshot.snapshotJson,
          clientSnapshotJson: bookingSnapshot.clientSnapshotJson,
          brandSnapshotJson: bookingSnapshot.brandSnapshotJson ?? Prisma.JsonNull,
          contactSnapshotJson: bookingSnapshot.contactSnapshotJson,
          itinerarySnapshotJson: bookingSnapshot.itinerarySnapshotJson,
          pricingSnapshotJson: bookingSnapshot.pricingSnapshotJson,
          adults: bookingSnapshot.adults,
          children: bookingSnapshot.children,
          pax: bookingSnapshot.adults + bookingSnapshot.children,
          roomCount: bookingSnapshot.roomCount,
          nightCount: bookingSnapshot.nightCount,
          startDate,
          endDate,
          days: bookingDays.length > 0 ? { create: bookingDays } : undefined,
          services: bookingServices.length > 0 ? { create: bookingServices } : undefined,
        },
        include: {
          quote: {
            include: {
              clientCompany: {
                include: {
                  branding: true,
                },
              },
              brandCompany: {
                include: {
                  branding: true,
                },
              },
              contact: true,
            },
          },
          acceptedVersion: true,
        },
      });

      const leadPassengerId = await this.createBookingPassengerFoundation(tx, createdBooking.id, bookingSnapshot.contactSnapshotJson);
      await this.createBookingRoomingFoundation(tx, createdBooking.id, bookingSnapshot.roomCount, leadPassengerId);

      return createdBooking;
    }, {
      maxWait: 30000,
      timeout: 30000,
    }).then(async (createdBooking) => {
      await this.auditService.log({
        actor: actor ? { id: (actor as { id?: string }).id ?? null, companyId } : null,
        action: 'booking.created',
        entity: 'booking',
        entityId: createdBooking.id,
        metadata: {
          quoteId: id,
          bookingRef: createdBooking.bookingRef || null,
        },
      });

      return createdBooking;
    });
  }

  findItems(quoteId: string) {
    return this.prisma.quoteItem.findMany({
      where: {
        quoteId,
        optionId: null,
      },
      include: {
        service: {
          include: {
            serviceType: true,
          },
        },
        itinerary: true,
        hotel: true,
        contract: true,
        roomCategory: true,
        appliedVehicleRate: {
          include: {
            vehicle: true,
            serviceType: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    } as any);
  }

  async findSuggestedServices(quoteId: string, itemId: string) {
    const item = await this.prisma.quoteItem.findFirst({
      where: {
        id: itemId,
        quoteId,
        optionId: null,
      },
      include: {
        service: {
          include: {
            serviceType: true,
          },
        },
      },
    });

    if (!item) {
      throw new BadRequestException('Quote item not found');
    }

    const importedItem = this.getImportedDraftItemFromQuoteItem(item);

    if (!importedItem) {
      return [];
    }

    const suggestions = await this.getSuggestedServiceMatches(importedItem);

    return suggestions.slice(0, 3).map((suggestion) => ({
      serviceId: suggestion.serviceId,
      name: suggestion.name,
      category: suggestion.category,
      score: suggestion.score,
    }));
  }

  async createItem(data: CreateQuoteItemInput, actor?: CompanyScopedActor) {
    const quote = await this.assertQuoteMutationAccess(data.quoteId, actor);
    const optionId = data.optionId ? (await this.ensureOptionBelongsToQuote(quote.id, data.optionId, actor)).id : undefined;
    const values = await this.resolveQuoteItemValues({
      ...data,
      quoteId: quote.id,
      optionId,
    });

    const item = await this.prisma.quoteItem.create({
      data: values.data,
      include: values.include,
    } as any);

    if (values.quoteItineraryDayId) {
      const lastDayItem = await this.prisma.quoteItineraryDayItem.findFirst({
        where: { dayId: values.quoteItineraryDayId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });

      await this.prisma.quoteItineraryDayItem.create({
        data: {
          dayId: values.quoteItineraryDayId,
          quoteServiceId: item.id,
          sortOrder: (lastDayItem?.sortOrder ?? -1) + 1,
          isActive: true,
        },
      });
    }

    await this.recalculateQuoteTotals(quote.id);

    return {
      ...item,
      promotionExplanation: values.promotionExplanation,
    };
  }

  async updateItem(itemId: string, data: UpdateQuoteItemInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const existingItem = await this.prisma.quoteItem.findFirst({
      where: {
        id: itemId,
        quote: {
          clientCompanyId: companyId,
        },
      },
    });

    if (!existingItem) {
      throw new BadRequestException('Quote item not found');
    }

    const quoteId = data.quoteId ?? existingItem.quoteId;
    const quote = await this.assertQuoteMutationAccess(quoteId, actor);
    const optionId =
      data.optionId === undefined
        ? existingItem.optionId || undefined
        : data.optionId
          ? (await this.ensureOptionBelongsToQuote(quote.id, data.optionId, actor)).id
          : undefined;
    const values = await this.resolveQuoteItemValues({
      quoteId: quote.id,
      optionId,
      serviceId: data.serviceId ?? existingItem.serviceId,
      itineraryId: data.itineraryId === undefined ? existingItem.itineraryId || undefined : data.itineraryId,
      serviceDate:
        data.serviceDate === undefined ? (existingItem as { serviceDate?: Date | null }).serviceDate ?? undefined : data.serviceDate,
      startTime: data.startTime === undefined ? (existingItem as { startTime?: string | null }).startTime ?? undefined : data.startTime,
      pickupTime:
        data.pickupTime === undefined ? (existingItem as { pickupTime?: string | null }).pickupTime ?? undefined : data.pickupTime,
      pickupLocation:
        data.pickupLocation === undefined
          ? (existingItem as { pickupLocation?: string | null }).pickupLocation ?? undefined
          : data.pickupLocation,
      meetingPoint:
        data.meetingPoint === undefined
          ? (existingItem as { meetingPoint?: string | null }).meetingPoint ?? undefined
          : data.meetingPoint,
      participantCount:
        data.participantCount === undefined
          ? (existingItem as { participantCount?: number | null }).participantCount ?? undefined
          : data.participantCount,
      adultCount:
        data.adultCount === undefined ? (existingItem as { adultCount?: number | null }).adultCount ?? undefined : data.adultCount,
      childCount:
        data.childCount === undefined ? (existingItem as { childCount?: number | null }).childCount ?? undefined : data.childCount,
      reconfirmationRequired:
        data.reconfirmationRequired === undefined
          ? (existingItem as { reconfirmationRequired?: boolean | null }).reconfirmationRequired ?? undefined
          : data.reconfirmationRequired,
      reconfirmationDueAt:
        data.reconfirmationDueAt === undefined
          ? (existingItem as { reconfirmationDueAt?: Date | null }).reconfirmationDueAt ?? undefined
          : data.reconfirmationDueAt,
      hotelId: data.hotelId === undefined ? existingItem.hotelId || undefined : data.hotelId,
      contractId: data.contractId === undefined ? existingItem.contractId || undefined : data.contractId,
      seasonId: data.seasonId === undefined ? (existingItem as { seasonId?: string | null }).seasonId || undefined : data.seasonId,
      seasonName: data.seasonName === undefined ? existingItem.seasonName || undefined : data.seasonName,
      roomCategoryId:
        data.roomCategoryId === undefined ? existingItem.roomCategoryId || undefined : data.roomCategoryId,
      occupancyType:
        data.occupancyType === undefined ? existingItem.occupancyType || undefined : data.occupancyType,
      mealPlan: data.mealPlan === undefined ? existingItem.mealPlan || undefined : data.mealPlan,
      guideType: data.guideType,
      guideDuration: data.guideDuration,
      overnight: data.overnight,
      quantity: data.quantity ?? existingItem.quantity,
      paxCount: data.paxCount === undefined ? existingItem.paxCount || undefined : data.paxCount,
      roomCount: data.roomCount === undefined ? existingItem.roomCount || undefined : data.roomCount,
      nightCount: data.nightCount === undefined ? existingItem.nightCount || undefined : data.nightCount,
      dayCount: data.dayCount === undefined ? existingItem.dayCount || undefined : data.dayCount,
      overrideCost: data.overrideCost === undefined ? existingItem.overrideCost : data.overrideCost,
      overrideReason:
        data.overrideReason === undefined
          ? (existingItem as { overrideReason?: string | null }).overrideReason ?? undefined
          : data.overrideReason,
      useOverride: data.useOverride === undefined ? existingItem.useOverride : data.useOverride,
      markupAmount:
        data.markupAmount === undefined
          ? (existingItem as { markupAmount?: number | null }).markupAmount ?? undefined
          : data.markupAmount,
      sellPrice:
        data.sellPrice === undefined
          ? (existingItem as { sellPrice?: number | null }).sellPrice ?? undefined
          : data.sellPrice,
      currency: data.currency === undefined ? existingItem.currency : data.currency,
      markupPercent: data.markupPercent ?? existingItem.markupPercent,
      transportServiceTypeId: data.transportServiceTypeId,
      routeId: data.routeId,
      routeName: data.routeName,
    });

    const item = await this.prisma.quoteItem.update({
      where: { id: itemId },
      data: values.data,
      include: values.include,
    } as any);

    if (existingItem.quoteId !== quote.id) {
      await this.recalculateQuoteTotals(existingItem.quoteId);
    }

    await this.recalculateQuoteTotals(quote.id);

    return {
      ...item,
      promotionExplanation: values.promotionExplanation,
    };
  }

  async assignServiceToItem(quoteId: string, itemId: string, serviceId: string, actor?: CompanyScopedActor) {
    const quote = await this.assertQuoteMutationAccess(quoteId, actor);
    const [item, service] = await Promise.all([
      this.prisma.quoteItem.findFirst({
        where: {
          id: itemId,
          quoteId: quote.id,
          optionId: null,
        },
        include: {
          service: {
            include: {
              serviceType: true,
            },
          },
        },
      }),
      this.prisma.supplierService.findUnique({
        where: { id: serviceId },
        include: {
          serviceType: true,
        },
      }),
    ]);

    if (!item) {
      throw new BadRequestException('Quote item not found');
    }

    if (!service || service.supplierId === IMPORTED_SERVICE_SUPPLIER_ID) {
      throw new BadRequestException('Service not found');
    }

    const updatedItem = await this.prisma.quoteItem.update({
      where: { id: itemId },
      data: {
        serviceId: service.id,
      },
      include: {
        service: {
          include: {
            serviceType: true,
          },
        },
        itinerary: true,
        hotel: true,
        contract: true,
        roomCategory: true,
        appliedVehicleRate: {
          include: {
            vehicle: true,
            serviceType: true,
          },
        },
      },
    } as any);

    await this.recalculateQuoteTotals(quote.id);

    return updatedItem;
  }

  async removeItem(itemId: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const item = await this.prisma.quoteItem.findFirst({
      where: {
        id: itemId,
        quote: {
          clientCompanyId: companyId,
        },
      },
    });

    if (!item) {
      throw new BadRequestException('Quote item not found');
    }

    await this.prisma.quoteItem.delete({
      where: { id: itemId },
    });

    await this.recalculateQuoteTotals(item.quoteId);

    return { id: itemId };
  }

  async remove(id: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const quote = await this.prisma.quote.findFirst({
      where: {
        id,
        clientCompanyId: companyId,
      },
      include: {
        _count: {
          select: {
            quoteItems: true,
            quoteOptions: true,
            itineraries: true,
            scenarios: true,
            versions: true,
          },
        },
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    blockDelete('quote', 'quote items', quote._count.quoteItems);
    blockDelete('quote', 'quote options', quote._count.quoteOptions);
    blockDelete('quote', 'itineraries', quote._count.itineraries);
    blockDelete('quote', 'pricing scenarios', quote._count.scenarios);
    blockDelete('quote', 'saved versions', quote._count.versions);

    return this.prisma.quote.delete({
      where: { id: quote.id },
    });
  }

  async createVersion(data: CreateQuoteVersionInput, actor?: CompanyScopedActor) {
    return this.prisma.$transaction(async (tx) => {
      const quote = await this.loadQuoteState(data.quoteId, tx, actor);

      if (!quote) {
        throw new BadRequestException('Quote not found');
      }

      const latestVersion = await tx.quoteVersion.findFirst({
        where: {
          quoteId: data.quoteId,
        },
        orderBy: {
          versionNumber: 'desc',
        },
        select: {
          versionNumber: true,
        },
      });

      return tx.quoteVersion.create({
        data: {
          quoteId: data.quoteId,
          versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
          label: data.label?.trim() || null,
          snapshotJson: JSON.parse(JSON.stringify(quote)),
        },
      });
    }, {
      maxWait: 30000,
      timeout: 30000,
    });
  }

  findVersions(quoteId: string) {
    return this.prisma.quoteVersion.findMany({
      where: {
        quoteId,
      },
      select: {
        id: true,
        quoteId: true,
        versionNumber: true,
        label: true,
        createdAt: true,
      },
      orderBy: {
        versionNumber: 'desc',
      },
    });
  }

  findVersion(quoteId: string, versionId: string) {
    return this.prisma.quoteVersion.findFirst({
      where: {
        id: versionId,
        quoteId,
      },
    });
  }

  private async resolveQuoteItemValues(data: CreateQuoteItemInput) {
    const [quote, service, legacyItinerary, quoteItineraryDay, option] = await Promise.all([
      this.prisma.quote.findUnique({
        where: { id: data.quoteId },
      }),
      this.prisma.supplierService.findUnique({
        where: { id: data.serviceId },
        include: {
          serviceType: true,
          entranceFee: true,
        },
      }),
      data.itineraryId
        ? this.prisma.itinerary.findUnique({
            where: { id: data.itineraryId },
          })
        : Promise.resolve(null),
      data.itineraryId
        ? this.prisma.quoteItineraryDay.findUnique({
            where: { id: data.itineraryId },
          })
        : Promise.resolve(null),
      data.optionId
        ? this.prisma.quoteOption.findUnique({
            where: { id: data.optionId },
          })
        : Promise.resolve(null),
    ]);

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    if (!service) {
      throw new BadRequestException('Service not found');
    }

    if (data.itineraryId && !legacyItinerary && !quoteItineraryDay) {
      throw new BadRequestException('Itinerary not found');
    }

    if (legacyItinerary && legacyItinerary.quoteId !== data.quoteId) {
      throw new BadRequestException('Itinerary does not belong to the selected quote');
    }

    if (quoteItineraryDay && quoteItineraryDay.quoteId !== data.quoteId) {
      throw new BadRequestException('Itinerary does not belong to the selected quote');
    }

    if (data.optionId && !option) {
      throw new BadRequestException('Quote option not found');
    }

    if (option && option.quoteId !== data.quoteId) {
      throw new BadRequestException('Quote option does not belong to the selected quote');
    }

    const quantity = Math.max(1, data.quantity || 1);
    const paxCount = Math.max(1, data.paxCount ?? quote.adults + quote.children);
    const roomCount = Math.max(1, data.roomCount ?? quote.roomCount);
    const nightCount = Math.max(1, data.nightCount ?? quote.nightCount);
    const dayCount = Math.max(1, data.dayCount ?? 1);
    const serviceDate = this.normalizeQuoteItemOperationalDate(data.serviceDate);
    const startTime = this.normalizeQuoteItemOperationalText(data.startTime);
    const pickupTime = this.normalizeQuoteItemOperationalText(data.pickupTime);
    const pickupLocation = this.normalizeQuoteItemOperationalText(data.pickupLocation);
    const meetingPoint = this.normalizeQuoteItemOperationalText(data.meetingPoint);
    const reconfirmationDueAt = this.normalizeQuoteItemOperationalDate(data.reconfirmationDueAt);
    const reconfirmationRequired = Boolean(data.reconfirmationRequired);
    let baseCost = service.baseCost;
    let currency = service.currency || '';
    let supplierCostBaseAmount = (service as any).costBaseAmount ?? service.baseCost;
    let supplierCostCurrency = (service as any).costCurrency ?? (service.currency || 'USD');
    let salesTaxPercent = Number((service as any).salesTaxPercent ?? 0);
    let salesTaxIncluded = Boolean((service as any).salesTaxIncluded);
    let serviceChargePercent = Number((service as any).serviceChargePercent ?? 0);
    let serviceChargeIncluded = Boolean((service as any).serviceChargeIncluded);
    let tourismFeeAmount = (service as any).tourismFeeAmount ?? null;
    let tourismFeeCurrency = (service as any).tourismFeeCurrency ?? null;
    let tourismFeeMode = (service as any).tourismFeeMode ?? null;
    let pricingDescription: string | null = null;
    let appliedVehicleRateId: string | null = null;
    let routeId: string | null = null;
    let transportServiceTypeId: string | null = null;
    let vehicleId: string | null = null;
    let transportPricingMode: TransportPricingMode | null = null;
    let unitCount: number | null = null;
    let entranceFeeId: string | null = null;
    let jordanPassCovered = false;
    let jordanPassSavingsJod = 0;
    let hotelId: string | null = null;
    let contractId: string | null = null;
    let seasonId: string | null = null;
    let seasonName: string | null = null;
    let roomCategoryId: string | null = null;
    let occupancyType: HotelOccupancyType | null = null;
    let mealPlan: HotelMealPlan | null = null;
    let hotelRatePricingBasis: 'PER_PERSON' | 'PER_ROOM' | string | null = null;
    let participantCount: number | null = null;
    let adultCount: number | null = null;
    let childCount: number | null = null;
    let externalPackageData: Record<string, unknown> = {};

    if (this.isHotelService(service)) {
      const season = data.seasonId
        ? await this.prisma.season.findUnique({
            where: { id: data.seasonId },
            select: {
              id: true,
              name: true,
            },
          })
        : null;

      if (data.seasonId && !season) {
        throw new BadRequestException('Season not found');
      }

      const requestedSeasonName = data.seasonName?.trim() || season?.name.trim();

      if (!data.hotelId || !data.contractId || !requestedSeasonName || !data.roomCategoryId || !data.occupancyType || !data.mealPlan) {
        throw new BadRequestException(
          'Hotel items require hotel, contract, season, room category, occupancy, and meal plan',
        );
      }

      const hotelRate = await this.prisma.hotelRate.findFirst({
        where: {
          contractId: data.contractId,
          ...(serviceDate
            ? {
                seasonFrom: { lte: serviceDate },
                seasonTo: { gte: serviceDate },
              }
            : { seasonName: requestedSeasonName }),
          roomCategoryId: data.roomCategoryId,
          occupancyType: data.occupancyType,
          mealPlan: data.mealPlan,
          hotelId: data.hotelId,
          contract: {
            hotelId: data.hotelId,
          },
        },
        include: {
          contract: {
            include: {
              hotel: true,
            },
          },
          roomCategory: true,
        },
      });

      if (!hotelRate) {
        throw new BadRequestException('Matching hotel rate not found');
      }

      if (!hotelRate.roomCategory.isActive) {
        throw new BadRequestException('Selected hotel room category is inactive');
      }

      baseCost = hotelRate.cost;
      currency = hotelRate.currency;
      supplierCostBaseAmount = (hotelRate as any).costBaseAmount ?? hotelRate.cost;
      supplierCostCurrency = (hotelRate as any).costCurrency ?? hotelRate.currency;
      salesTaxPercent = Number((hotelRate as any).salesTaxPercent ?? 0);
      salesTaxIncluded = Boolean((hotelRate as any).salesTaxIncluded);
      serviceChargePercent = Number((hotelRate as any).serviceChargePercent ?? 0);
      serviceChargeIncluded = Boolean((hotelRate as any).serviceChargeIncluded);
      tourismFeeAmount = (hotelRate as any).tourismFeeAmount ?? null;
      tourismFeeCurrency = (hotelRate as any).tourismFeeCurrency ?? null;
      tourismFeeMode = (hotelRate as any).tourismFeeMode ?? null;
      hotelRatePricingBasis = (hotelRate as any).pricingBasis ?? null;
      pricingDescription = `${hotelRate.contract.name} | ${hotelRate.seasonName} | ${hotelRate.roomCategory.name} | ${hotelRate.occupancyType} | ${hotelRate.mealPlan}`;
      hotelId = data.hotelId;
      contractId = hotelRate.contract.id;
      seasonId = season?.id || data.seasonId || null;
      seasonName = hotelRate.seasonName;
      roomCategoryId = hotelRate.roomCategoryId;
      occupancyType = hotelRate.occupancyType;
      mealPlan = hotelRate.mealPlan;
    }

    if (this.isTransportService(service)) {
      if (!data.transportServiceTypeId) {
        throw new BadRequestException('Transport service type is required');
      }

      const routeNormalizedKey = data.normalizedKey || (data.routeName ? normalizeRouteName(data.routeName) : undefined);

      if (!data.routeId && !routeNormalizedKey) {
        throw new BadRequestException('Transport route is required');
      }

      try {
        const resolvedPricing = await this.transportPricingService.resolvePricingRule({
          routeId: data.routeId,
          normalizedKey: routeNormalizedKey,
          transportServiceTypeId: data.transportServiceTypeId,
          pax: paxCount,
        });

        baseCost = resolvedPricing.discountedBaseCost;
        currency = resolvedPricing.rule.currency;
        routeId = resolvedPricing.rule.routeId;
        transportServiceTypeId = resolvedPricing.rule.transportServiceTypeId;
        vehicleId = resolvedPricing.rule.vehicleId;
        transportPricingMode = resolvedPricing.rule.pricingMode;
        unitCount = resolvedPricing.unitCount;
        pricingDescription = [
          resolvedPricing.rule.transportServiceType.name,
          resolvedPricing.rule.route.name,
          resolvedPricing.rule.vehicle.name,
          resolvedPricing.rule.pricingMode === 'capacity_unit'
            ? `Capacity unit x ${resolvedPricing.unitCount}`
            : 'Per vehicle',
        ].join(' | ');
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }

        const vehicleRate = await this.transportPricingService.findMatchingRate({
          serviceTypeId: data.transportServiceTypeId,
          routeId: data.routeId,
          normalizedKey: routeNormalizedKey,
          paxCount,
        });

        baseCost = vehicleRate.price;
        currency = vehicleRate.currency;
        pricingDescription = `${vehicleRate.serviceType.name} | ${vehicleRate.routeName} | ${vehicleRate.vehicle.name}`;
        appliedVehicleRateId = vehicleRate.id;
      }
    }

    if (this.isGuideService(service)) {
      const guideType = data.guideType?.trim().toLowerCase();
      const guideDuration = data.guideDuration?.trim().toLowerCase();
      const overnight = Boolean(data.overnight);

      if (!guideType || !guideDuration) {
        throw new BadRequestException('Guide items require guide type and duration');
      }

      if (!this.isGuideType(guideType) || !this.isGuideDuration(guideDuration)) {
        throw new BadRequestException('Invalid guide pricing selection');
      }

      baseCost = GUIDE_RATES[guideType][guideDuration] + (overnight ? GUIDE_OVERNIGHT_SUPPLEMENT : 0);
      currency = service.currency;
      pricingDescription = `Guide | ${this.formatGuideType(guideType)} | ${this.formatGuideDuration(guideDuration)} | Overnight: ${overnight ? 'Yes' : 'No'}`;
    }

    if (this.isActivityService(service)) {
      adultCount =
        data.adultCount === undefined
          ? quote.adults
          : data.adultCount === null
            ? null
            : Math.max(0, Math.floor(data.adultCount));
      childCount =
        data.childCount === undefined
          ? quote.children
          : data.childCount === null
            ? null
            : Math.max(0, Math.floor(data.childCount));
      const derivedParticipantCount =
        adultCount !== null || childCount !== null ? Math.max(0, (adultCount ?? 0) + (childCount ?? 0)) : null;
      participantCount =
        data.participantCount === undefined
          ? derivedParticipantCount ?? Math.max(1, quote.adults + quote.children)
          : data.participantCount === null
            ? derivedParticipantCount
            : Math.max(0, Math.floor(data.participantCount));

      const entranceFee = (service as any).entranceFee as
        | { id: string; siteName: string; foreignerFeeJod: number; includedInJordanPass: boolean }
        | null
        | undefined;

      if (entranceFee) {
        const coverage = await this.resolveJordanPassEntranceCoverage({
          quoteId: quote.id,
          optionId: data.optionId || null,
          jordanPassType: (quote as any).jordanPassType || 'NONE',
          entranceFee,
        });

        entranceFeeId = entranceFee.id;
        jordanPassCovered = coverage.covered;
        jordanPassSavingsJod = coverage.covered ? entranceFee.foreignerFeeJod : 0;
        baseCost = coverage.covered ? 0 : entranceFee.foreignerFeeJod;
        currency = 'JOD';
        supplierCostBaseAmount = baseCost;
        supplierCostCurrency = 'JOD';
        pricingDescription = coverage.covered
          ? `${entranceFee.siteName} | Covered by Jordan Pass`
          : `${entranceFee.siteName} | Entrance fee`;
      }
    }

    if (this.isMealService(service)) {
      const mealName = this.normalizeQuoteItemOperationalText(data.customServiceName);
      const mealUnitCost = data.unitCost === undefined || data.unitCost === null ? service.baseCost : Number(data.unitCost);

      if (!mealName) {
        throw new BadRequestException('Meal items require a name');
      }

      if (!Number.isFinite(mealUnitCost) || mealUnitCost < 0) {
        throw new BadRequestException('Meal cost must be zero or greater');
      }

      baseCost = mealUnitCost;
      currency = data.currency?.trim().toUpperCase() || service.currency;
      supplierCostBaseAmount = mealUnitCost;
      supplierCostCurrency = currency;
      pricingDescription = `${mealName} | Meal | PER_PERSON | ${paxCount} pax`;
    }

    if (this.isExternalPackageService(service)) {
      const country = this.normalizeQuoteItemOperationalText(data.country);
      const supplierName = this.normalizeQuoteItemOperationalText(data.supplierName);
      const clientDescription = this.normalizeQuoteItemOperationalText(data.clientDescription);
      const includes = this.normalizeQuoteItemOperationalText(data.includes);
      const excludes = this.normalizeQuoteItemOperationalText(data.excludes);
      const internalNotes = this.normalizeQuoteItemOperationalText(data.internalNotes);
      const pricingBasis = this.normalizeExternalPackagePricingBasis(data.pricingBasis);
      if (data.netCost === undefined || data.netCost === null || String(data.netCost).trim() === '') {
        throw new BadRequestException('External package netCost is required');
      }
      if (!data.currency?.trim()) {
        throw new BadRequestException('External package currency is required');
      }
      const netCost = this.normalizeExternalPackageNetCost(data.netCost);
      const startDay = this.normalizeOptionalPositiveInteger(data.startDay, 'startDay');
      const endDay = this.normalizeOptionalPositiveInteger(data.endDay, 'endDay');
      const startDate = this.normalizeQuoteItemOperationalDate(data.startDate ?? data.serviceDate);
      const endDate = this.normalizeQuoteItemOperationalDate(data.endDate ?? null);

      if (!country) {
        throw new BadRequestException('External package country is required');
      }
      if (!clientDescription) {
        throw new BadRequestException('External package client description is required');
      }
      if (startDay !== null && endDay !== null && endDay < startDay) {
        throw new BadRequestException('External package endDay cannot be before startDay');
      }
      if (startDate && endDate && endDate < startDate) {
        throw new BadRequestException('External package endDate cannot be before startDate');
      }

      baseCost = netCost;
      currency = data.currency.trim().toUpperCase();
      supplierCostBaseAmount = netCost;
      supplierCostCurrency = currency;
      pricingDescription = `${country} external package | ${pricingBasis === 'PER_PERSON' ? 'per person' : 'per group'}`;
      externalPackageData = {
        externalPackageCountry: country,
        externalSupplierName: supplierName,
        externalStartDay: startDay,
        externalEndDay: endDay,
        externalStartDate: startDate,
        externalEndDate: endDate,
        externalPricingBasis: pricingBasis,
        externalNetCost: netCost,
        externalIncludes: includes,
        externalExcludes: excludes,
        externalInternalNotes: internalNotes,
        externalClientDescription: clientDescription,
      };
    }

    if (data.currency !== undefined) {
      supplierCostCurrency = data.currency?.trim().toUpperCase() || supplierCostCurrency;
    }

    const overrideCost = this.normalizeOptionalNonNegativeNumber(data.overrideCost, 'Override cost');
    const useOverride = Boolean(data.useOverride);
    const overrideReason = useOverride ? this.normalizeQuoteItemOperationalText(data.overrideReason) : null;

    if (useOverride && overrideCost === null) {
      throw new BadRequestException('Override cost is required when override is enabled');
    }

    const markupPercent = this.normalizeOptionalNonNegativeNumber(data.markupPercent, 'Markup percent') ?? 0;
    const markupAmount = this.normalizeOptionalNonNegativeNumber(data.markupAmount, 'Markup amount');
    const sellPriceOverride = this.normalizeOptionalNonNegativeNumber(data.sellPrice, 'Sell price');

    const transportQuantity = transportPricingMode === 'capacity_unit' && unitCount ? unitCount : quantity;

    const quoteCurrency = this.normalizeCurrencyCode((quote as any).quoteCurrency ?? 'USD');
    const basePricing = this.calculateCentralizedQuoteItemPricing({
      service,
      quantity: transportQuantity,
      paxCount,
      roomCount,
      nightCount,
      dayCount,
      unitCost: baseCost,
      markupPercent,
      quoteCurrency,
      supplierPricing: {
        costBaseAmount: supplierCostBaseAmount,
        costCurrency: supplierCostCurrency,
        salesTaxPercent,
        salesTaxIncluded,
        serviceChargePercent,
        serviceChargeIncluded,
        tourismFeeAmount,
        tourismFeeCurrency: tourismFeeCurrency ?? supplierCostCurrency,
        tourismFeeMode,
      },
      transportPricingMode,
      hotelRatePricingBasis,
      externalPackagePricingBasis: typeof externalPackageData.externalPricingBasis === 'string' ? externalPackageData.externalPricingBasis : null,
      unitCount,
    });
    const manualOverrideApplied = useOverride && overrideCost !== null;
    const finalCost = manualOverrideApplied ? Number(overrideCost.toFixed(2)) : basePricing.totalCost;
    const pricing = this.applyQuoteItemSellingLayer({
      pricing: manualOverrideApplied ? { ...basePricing, totalCost: finalCost } : basePricing,
      cost: finalCost,
      markupPercent,
      markupAmount,
      sellPriceOverride,
    });
    const promotionTravelDate = serviceDate ?? quote.travelStartDate;
    const promotionResult =
      this.isHotelService(service) && contractId && roomCategoryId && promotionTravelDate
        ? await this.promotionsService.evaluate({
            hotelContractId: contractId,
            roomCategoryId,
            boardBasis: mealPlan ?? undefined,
            travelDate: promotionTravelDate,
            bookingDate: quote.createdAt,
            stayNights: nightCount,
            baseCost: pricing.totalCost,
            baseSell: pricing.totalSell,
            currency: quoteCurrency,
          })
        : null;

    return {
      data: {
        quoteId: data.quoteId,
        optionId: data.optionId || null,
        serviceId: data.serviceId,
        itineraryId: legacyItinerary?.id || null,
        serviceDate,
        startTime,
        pickupTime,
        pickupLocation,
        meetingPoint,
        participantCount,
        adultCount,
        childCount,
        reconfirmationRequired,
        reconfirmationDueAt,
        hotelId,
        contractId,
        seasonName,
        roomCategoryId,
        occupancyType,
        mealPlan,
        quantity: transportQuantity,
        paxCount,
        roomCount,
        nightCount,
        dayCount,
        baseCost: basePricing.totalCost,
        finalCost: pricing.totalCost,
        markupAmount,
        sellPrice: sellPriceOverride,
        costBaseAmount: supplierCostBaseAmount,
        costCurrency: supplierCostCurrency,
        quoteCurrency,
        salesTaxPercent,
        salesTaxIncluded,
        serviceChargePercent,
        serviceChargeIncluded,
        tourismFeeAmount,
        tourismFeeCurrency,
        tourismFeeMode,
        fxRate: pricing.fxRate,
        fxFromCurrency: pricing.fxFromCurrency,
        fxToCurrency: pricing.fxToCurrency,
        fxRateDate: pricing.fxRateDate,
        overrideCost,
        overrideReason,
        useOverride,
        ...externalPackageData,
        currency: quoteCurrency,
        pricingDescription,
        appliedVehicleRateId,
        entranceFeeId,
        jordanPassCovered,
        jordanPassSavingsJod,
        markupPercent,
        totalCost: pricing.totalCost,
        totalSell: promotionResult?.adjustedPricing.adjustedSell ?? pricing.totalSell,
      },
      quoteItineraryDayId: quoteItineraryDay?.id ?? null,
      promotionExplanation: promotionResult?.explanation ?? null,
      include: {
        service: {
          include: {
            serviceType: true,
          },
        },
        itinerary: true,
        hotel: true,
        contract: true,
        roomCategory: true,
        appliedVehicleRate: {
          include: {
            vehicle: true,
            serviceType: true,
          },
        },
      },
    };
  }

  private normalizeImportedItineraryDays(
    days: CreateQuoteDraftFromImportedItineraryInput['days'],
    items: CreateQuoteDraftFromImportedItineraryInput['items'],
  ) {
    const dayMap = new Map<number, { dayNumber: number; title: string; summary: string }>();

    for (const [index, day] of days.entries()) {
      const dayNumber = this.normalizeImportedDayNumber(day.dayNumber, index + 1);
      dayMap.set(dayNumber, {
        dayNumber,
        title: day.title?.trim() || `Day ${dayNumber}`,
        summary: day.summary?.trim() || '',
      });
    }

    for (const item of items) {
      const dayNumber = this.normalizeImportedDayNumber(item.dayNumber, 1);

      if (!dayMap.has(dayNumber)) {
        dayMap.set(dayNumber, {
          dayNumber,
          title: `Day ${dayNumber}`,
          summary: '',
        });
      }
    }

    if (dayMap.size === 0) {
      dayMap.set(1, {
        dayNumber: 1,
        title: 'Day 1',
        summary: '',
      });
    }

    return Array.from(dayMap.values()).sort((left, right) => left.dayNumber - right.dayNumber);
  }

  private normalizeImportedDayNumber(value: number, fallback: number) {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? Math.floor(normalized) : fallback;
  }

  private normalizeImportedDraftItem(item: CreateQuoteDraftFromImportedItineraryInput['items'][number], index: number, fallbackDayNumber: number) {
    const type = this.normalizeImportedItemType(item.type);
    const normalized = {
      dayNumber: this.normalizeImportedDayNumber(item.dayNumber, fallbackDayNumber),
      type,
      title: item.title?.trim() || `Imported item ${index + 1}`,
      description: item.description?.trim() || '',
      notes: item.notes?.trim() || '',
      serviceType: item.serviceType?.trim() || undefined,
      country: item.country?.trim() || undefined,
      supplierName: item.supplierName?.trim() || undefined,
      startDay: this.normalizeImportedOptionalPositiveInteger(item.startDay),
      endDay: this.normalizeImportedOptionalPositiveInteger(item.endDay),
      startDate: item.startDate?.trim() || undefined,
      endDate: item.endDate?.trim() || undefined,
      pricingBasis: item.pricingBasis?.trim() || undefined,
      netCost: item.netCost,
      currency: item.currency?.trim().toUpperCase() || undefined,
      includes: item.includes?.trim() || undefined,
      excludes: item.excludes?.trim() || undefined,
      internalNotes: item.internalNotes?.trim() || undefined,
      clientDescription: item.clientDescription?.trim() || undefined,
    };

    if (type === 'external_package') {
      this.validateImportedExternalPackageDraftItem(normalized, index + 1);
    }

    return normalized;
  }

  private normalizeImportedOptionalPositiveInteger(value: number | undefined) {
    if (value === undefined || value === null) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  }

  private validateImportedExternalPackageDraftItem(
    item: {
      country?: string;
      pricingBasis?: string;
      netCost?: number;
      currency?: string;
      clientDescription?: string;
      startDay?: number;
      endDay?: number;
      startDate?: string;
      endDate?: string;
    },
    rowNumber: number,
  ) {
    const field = (name: string, message: string) => `row ${rowNumber} ${name}: ${message}`;
    if (!item.country) {
      throw new BadRequestException(field('country', 'required'));
    }
    if (!item.pricingBasis || !this.tryNormalizeExternalPackagePricingBasis(item.pricingBasis)) {
      throw new BadRequestException(field('pricingBasis', 'must be PER_PERSON or PER_GROUP'));
    }
    if (item.netCost === undefined || item.netCost === null || !Number.isFinite(Number(item.netCost)) || Number(item.netCost) < 0) {
      throw new BadRequestException(field('netCost', 'must be zero or greater'));
    }
    if (!item.currency) {
      throw new BadRequestException(field('currency', 'required'));
    }
    requireSupportedCurrency(item.currency, field('currency', 'invalid currency'));
    if (!item.clientDescription) {
      throw new BadRequestException(field('clientDescription', 'required'));
    }
    if (item.startDay !== undefined && item.endDay !== undefined && item.endDay < item.startDay) {
      throw new BadRequestException(field('endDay', 'cannot be before startDay'));
    }
    const startDate = this.parseDateLike(item.startDate);
    const endDate = this.parseDateLike(item.endDate);
    if (item.startDate && !startDate) {
      throw new BadRequestException(field('startDate', 'invalid date'));
    }
    if (item.endDate && !endDate) {
      throw new BadRequestException(field('endDate', 'invalid date'));
    }
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException(field('endDate', 'cannot be before startDate'));
    }
  }

  private normalizeImportedItemType(value: string): ImportedItineraryItemType {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    switch (normalized) {
      case 'hotel':
      case 'transport':
      case 'activity':
      case 'meal':
      case 'flight':
      case 'guide':
        return normalized;
      case 'external_package':
      case 'partner_package':
        return 'external_package';
      default:
        return 'other';
    }
  }

  private buildImportedQuoteTitle(days: Array<{ dayNumber: number; title: string }>) {
    const destination = this.extractProposalDestination(days[0]?.title || '');
    return destination ? `${destination} Experience` : 'Travel Experience';
  }

  private buildImportedQuoteDescription(days: Array<{ dayNumber: number; title: string; summary: string }>) {
    const destination = this.summarizeDestinations(
      days.map((day) => day.title).filter((title): title is string => Boolean(title?.trim())),
    );
    const dayCount = Math.max(days.length, 1);
    const highlights = days
      .map((day) => day.summary?.trim())
      .filter((summary): summary is string => Boolean(summary))
      .slice(0, 2)
      .join(' ');

    const baseDescription = destination
      ? `A thoughtfully paced ${dayCount}-day journey through ${destination}, combining curated experiences and well-coordinated logistics.`
      : `A thoughtfully paced ${dayCount}-day journey with curated experiences and well-coordinated logistics.`;

    return highlights ? `${baseDescription} ${highlights}` : baseDescription;
  }

  private buildImportedItemPricingDescription(item: {
    title: string;
    description: string;
    notes: string;
    type: ImportedItineraryItemType;
  }) {
    const parts = [item.title];

    if (item.description) {
      parts.push(`Description: ${item.description}`);
    }

    if (item.notes) {
      parts.push(`Notes: ${item.notes}`);
    }

    return parts.join(' | ') || `Imported ${item.type}`;
  }

  private buildImportedExternalPackageQuoteItemData(
    item: ImportedDraftItem,
    quoteId: string,
    quoteCurrency: string,
  ) {
    if (item.type !== 'external_package') {
      return null;
    }

    const pricingBasis = this.tryNormalizeExternalPackagePricingBasis(item.pricingBasis)!;
    const netCost = Number(item.netCost);
    const costCurrency = requireSupportedCurrency(item.currency || '', 'row currency');
    const normalizedQuoteCurrency = requireSupportedCurrency(quoteCurrency || 'USD', 'quoteCurrency');
    const startDate = this.parseDateLike(item.startDate);
    const endDate = this.parseDateLike(item.endDate);
    const paxCount = 1;
    const basePricing = this.calculateCentralizedQuoteItemPricing({
      service: {
        category: 'external_package',
        unitType: pricingBasis === 'PER_PERSON' ? ServiceUnitType.per_person : ServiceUnitType.per_group,
        serviceType: { name: 'External Package', code: 'EXTERNAL_PACKAGE' },
      },
      quantity: 1,
      paxCount,
      roomCount: 1,
      nightCount: 1,
      dayCount: 1,
      unitCost: netCost,
      markupPercent: 0,
      quoteCurrency: normalizedQuoteCurrency,
      supplierPricing: {
        costBaseAmount: netCost,
        costCurrency,
      },
      externalPackagePricingBasis: pricingBasis,
    });
    const pricing = this.applyQuoteItemSellingLayer({
      pricing: basePricing,
      cost: basePricing.totalCost,
      markupPercent: 0,
      markupAmount: null,
      sellPriceOverride: null,
    });

    return {
      quoteId,
      serviceDate: startDate,
      paxCount,
      roomCount: 1,
      nightCount: 1,
      dayCount: 1,
      baseCost: basePricing.totalCost,
      finalCost: pricing.totalCost,
      costBaseAmount: netCost,
      costCurrency,
      quoteCurrency: normalizedQuoteCurrency,
      fxRate: pricing.fxRate,
      fxFromCurrency: pricing.fxFromCurrency,
      fxToCurrency: pricing.fxToCurrency,
      fxRateDate: pricing.fxRateDate,
      currency: normalizedQuoteCurrency,
      pricingDescription: `${item.country} external package | ${pricingBasis === 'PER_PERSON' ? 'per person' : 'per group'}`,
      totalCost: pricing.totalCost,
      totalSell: pricing.totalSell,
      externalPackageCountry: item.country,
      externalSupplierName: item.supplierName || null,
      externalStartDay: item.startDay ?? item.dayNumber,
      externalEndDay: item.endDay ?? item.startDay ?? item.dayNumber,
      externalStartDate: startDate,
      externalEndDate: endDate,
      externalPricingBasis: pricingBasis,
      externalNetCost: netCost,
      externalIncludes: item.includes || null,
      externalExcludes: item.excludes || null,
      externalInternalNotes: item.internalNotes || null,
      externalClientDescription: item.clientDescription,
    };
  }

  private async getOrCreateImportedQuoteDefaults(prismaClient: Prisma.TransactionClient | PrismaService) {
    const companyName = 'Imported Itineraries';
    const contactFirstName = 'Imported';
    const contactLastName = 'Drafts';
    let company = await prismaClient.company.findFirst({
      where: {
        name: companyName,
      },
      select: {
        id: true,
      },
    });

    if (!company) {
      company = await prismaClient.company.create({
        data: {
          name: companyName,
          type: 'internal',
        },
        select: {
          id: true,
        },
      });
    }

    let contact = await prismaClient.contact.findFirst({
      where: {
        companyId: company.id,
        firstName: contactFirstName,
        lastName: contactLastName,
      },
      select: {
        id: true,
      },
    });

    if (!contact) {
      contact = await prismaClient.contact.create({
        data: {
          companyId: company.id,
          firstName: contactFirstName,
          lastName: contactLastName,
          email: 'imported-itineraries@local.invalid',
          title: 'System placeholder',
        },
        select: {
          id: true,
        },
      });
    }

    return {
      companyId: company.id,
      contactId: contact.id,
    };
  }

  private async getOrCreateImportedServices(
    itemTypes: ImportedItineraryItemType[],
    prismaClient: Prisma.TransactionClient | PrismaService,
  ) {
    const services = new Map<ImportedItineraryItemType, string>();

    for (const itemType of itemTypes) {
      const serviceName = `Imported ${itemType.charAt(0).toUpperCase()}${itemType.slice(1)}`;
      let service = await prismaClient.supplierService.findFirst({
        where: {
          supplierId: 'import-itinerary-system',
          name: serviceName,
          category: itemType,
        },
        select: {
          id: true,
        },
      });

      if (!service) {
        service = await prismaClient.supplierService.create({
          data: {
            supplierId: 'import-itinerary-system',
            name: serviceName,
            category: itemType,
            unitType: ServiceUnitType.per_group,
            baseCost: 0,
            currency: 'USD',
          },
          select: {
            id: true,
          },
        });
      }

      services.set(itemType, service.id);
    }

    return services;
  }

  private matchImportedItemToSupplierService(item: ImportedDraftItem, services: ServiceMatchCandidate[]) {
    const scored = this.scoreImportedItemToSupplierServices(item, services);

    if (scored.length === 0) {
      return null;
    }

    const best = scored[0];
    const runnerUp = scored[1];
    const clearlyAhead = !runnerUp || best.score - runnerUp.score >= 12;
    const isHighConfidenceMatch =
      best.score >= 70 &&
      (best.score >= 120 || best.strongCombinedOverlapSignal || best.sharedTokenCount >= 3);
    const allowHighConfidenceOverride = isHighConfidenceMatch && best.score >= 120;
    const matchedServiceId =
      allowHighConfidenceOverride || (isHighConfidenceMatch && clearlyAhead)
        ? best.serviceId
        : null;

    console.log('MATCH DECISION:', {
      score: best.score,
      clearlyAhead,
      isHighConfidenceMatch,
      matchedServiceId,
    });

    console.log('MATCH RESULT:', {
      itemTitle: item.title,
      itemDescription: item.description,
      bestCandidateServiceName: best.name,
      bestCandidateScore: best.score,
      matchedServiceId,
    });

    if (!matchedServiceId) {
      return null;
    }

    return matchedServiceId;
  }

  private scoreImportedItemToSupplierServices(item: ImportedDraftItem, services: ServiceMatchCandidate[]) {
    const preferredCategories = this.getImportedItemPreferredCategories(item.type);

    if (preferredCategories.length === 0) {
      return [];
    }

    const titleText = this.normalizeMatchText(item.title);
    const titleTokens = this.tokenizeMatchText(item.title);
    const descriptionTokens = this.tokenizeMatchText(item.description);

    if (!titleText || (titleTokens.length === 0 && descriptionTokens.length === 0)) {
      return [];
    }

    const detailsTokens = this.tokenizeMatchText([item.description, item.notes].filter(Boolean).join(' '));
    const combinedTokens = this.mergeMatchTokens(titleTokens, descriptionTokens);
    const useCombinedTokens = titleTokens.length <= 2 && descriptionTokens.length > 0;
    const primaryTokens = useCombinedTokens ? combinedTokens : titleTokens;
    return services
      .map((service) => {
        const serviceCategoryKey = this.getServiceMatchCategoryKey(service);

        if (!preferredCategories.includes(serviceCategoryKey)) {
          return null;
        }

        const serviceNameText = this.normalizeMatchText(service.name);
        const serviceNameTokens = this.tokenizeMatchText(service.name);
        const serviceTokens = this.tokenizeMatchText(
          [service.name, service.category, service.serviceType?.name, service.serviceType?.code].filter(Boolean).join(' '),
        );
        const overlapTokens = this.getSharedTokens(primaryTokens, serviceNameTokens);
        const titleOverlapTokens = this.getSharedTokens(titleTokens, serviceNameTokens);
        const descriptionOverlapTokens = this.getSharedTokens(descriptionTokens, serviceNameTokens);
        const sharedActivityTokens = this.getCategoryKeywordMatches(overlapTokens, 'activity');
        const sharedLocationTokens = overlapTokens.filter((token) => !MATCH_CATEGORY_KEYWORDS.activity.includes(token));
        const hasActivityAndLocationSignal = sharedActivityTokens.length > 0 && sharedLocationTokens.length > 0;
        const strongCombinedOverlapSignal = useCombinedTokens && overlapTokens.length >= 3 && hasActivityAndLocationSignal;
        const titleOverlap = titleOverlapTokens.length;
        const descriptionOverlap = descriptionOverlapTokens.length;
        const primaryOverlap = overlapTokens.length;
        const primaryCoverage = primaryTokens.length > 0 ? primaryOverlap / primaryTokens.length : 0;
        const titleCoverage = titleTokens.length > 0 ? titleOverlap / titleTokens.length : 0;
        const descriptionCoverage = descriptionTokens.length > 0 ? descriptionOverlap / descriptionTokens.length : 0;
        const serviceNameCoverage = serviceNameTokens.length > 0 ? primaryOverlap / serviceNameTokens.length : 0;
        const tokenSetCoverage =
          primaryTokens.length > 0 || serviceNameTokens.length > 0
            ? (primaryCoverage + serviceNameCoverage) / 2
            : 0;
        const detailOverlap = this.countTokenOverlap(detailsTokens, serviceTokens);
        const detailCoverage = detailsTokens.length > 0 ? detailOverlap / detailsTokens.length : 0;
        const titlePhraseMatch =
          (titleText.length >= 6 && serviceNameText.includes(titleText)) ||
          (serviceNameText.length >= 6 && titleText.includes(serviceNameText));
        const codeText = this.normalizeMatchText(service.serviceType?.code || '');
        const categoryKeywordSignal = this.hasCategoryKeywordAndDescriptorOverlap(overlapTokens, serviceCategoryKey);
        const locationOverlap = this.countLocationTokenOverlap(descriptionTokens, serviceNameTokens);
        let score = 20;

        if (titlePhraseMatch) {
          score += 24;
        }

        score += Math.min(36, primaryOverlap * 12);
        score += Math.min(20, Math.round(primaryCoverage * 20));
        score += Math.min(18, Math.round(serviceNameCoverage * 18));
        score += Math.min(12, Math.round(tokenSetCoverage * 12));
        score += Math.min(10, detailOverlap * 3);
        score += Math.min(8, Math.round(detailCoverage * 8));

        if (useCombinedTokens) {
          score += Math.min(20, descriptionOverlap * 6);
          score += Math.min(16, Math.round(descriptionCoverage * 16));
        }

        if (primaryOverlap >= 3) {
          score += 14;
        }

        if (primaryCoverage >= 0.6 && serviceNameCoverage >= 0.5) {
          score += 12;
        }

        if (locationOverlap > 0) {
          score += Math.min(12, locationOverlap * 4);
        }

        if (strongCombinedOverlapSignal) {
          score += 28;
        } else if (useCombinedTokens && overlapTokens.length >= 3) {
          score += 16;
        }

        if (categoryKeywordSignal) {
          score += 10;
        }

        if (codeText && primaryTokens.includes(codeText)) {
          score += 12;
        }

        return {
          serviceId: service.id,
          name: service.name,
          category: service.category,
          score,
          primaryOverlap,
          titleOverlap,
          primaryCoverage,
          titleCoverage,
          serviceNameCoverage,
          titlePhraseMatch,
          categoryKeywordSignal,
          locationOverlap,
          sharedTokenCount: overlapTokens.length,
          hasActivityAndLocationSignal,
          strongCombinedOverlapSignal,
        } satisfies ScoredServiceMatch;
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((left, right) => right.score - left.score);
  }

  private async getSuggestedServiceMatches(item: ImportedDraftItem) {
    const serviceCandidates = await this.prisma.supplierService.findMany({
      where: {
        supplierId: {
          not: IMPORTED_SERVICE_SUPPLIER_ID,
        },
      },
      select: {
        id: true,
        supplierId: true,
        name: true,
        category: true,
        serviceType: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });

    return this.scoreImportedItemToSupplierServices(item, serviceCandidates);
  }

  private getImportedDraftItemFromQuoteItem(item: {
    pricingDescription: string | null;
    service: {
      supplierId: string;
      category: string;
      name: string;
    };
  }): ImportedDraftItem | null {
    if (item.service.supplierId !== IMPORTED_SERVICE_SUPPLIER_ID) {
      return null;
    }

    const parts = (item.pricingDescription || '')
      .split(' | ')
      .map((part) => part.trim())
      .filter(Boolean);
    const descriptionPrefix = 'Description: ';
    const notesPrefix = 'Notes: ';
    const title = parts[0] || item.service.name;
    let description = '';
    let notes = '';

    for (const part of parts.slice(1)) {
      if (part.startsWith(descriptionPrefix)) {
        description = part.slice(descriptionPrefix.length).trim();
        continue;
      }

      if (part.startsWith(notesPrefix)) {
        notes = part.slice(notesPrefix.length).trim();
      }
    }

    return {
      dayNumber: 1,
      type: this.normalizeImportedItemType(item.service.category),
      title,
      description,
      notes,
    };
  }

  private getImportedItemPreferredCategories(itemType: ImportedItineraryItemType): ServiceMatchCategoryKey[] {
    switch (itemType) {
      case 'hotel':
        return ['hotel'];
      case 'transport':
      case 'flight':
        return ['transport'];
      case 'activity':
        return ['activity'];
      case 'meal':
        return ['meal'];
      case 'guide':
        return ['guide'];
      default:
        return [];
    }
  }

  private getServiceMatchCategoryKey(service: {
    category: string;
    serviceType?: { name: string; code: string | null } | null;
  }): ServiceMatchCategoryKey {
    const normalized = this.getNormalizedServiceCategory(service);

    if (normalized.includes('hotel') || normalized.includes('accommodation')) {
      return 'hotel';
    }

    if (
      normalized.includes('transport') ||
      normalized.includes('transfer') ||
      normalized.includes('vehicle') ||
      normalized.includes('flight')
    ) {
      return 'transport';
    }

    if (normalized.includes('guide')) {
      return 'guide';
    }

    if (
      normalized.includes('activity') ||
      normalized.includes('tour') ||
      normalized.includes('excursion') ||
      normalized.includes('sightseeing') ||
      normalized.includes('entrance') ||
      normalized.includes('ticket')
    ) {
      return 'activity';
    }

    if (
      normalized.includes('meal') ||
      normalized.includes('restaurant') ||
      normalized.includes('lunch') ||
      normalized.includes('dinner') ||
      normalized.includes('breakfast') ||
      normalized.includes('food')
    ) {
      return 'meal';
    }

    return 'other';
  }

  private normalizeMatchText(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenizeMatchText(value: string) {
    return this.normalizeMatchText(value)
      .split(' ')
      .filter((token) => token.length >= 3 && !MATCH_STOP_WORDS.has(token));
  }

  private countTokenOverlap(sourceTokens: string[], targetTokens: string[]) {
    if (sourceTokens.length === 0 || targetTokens.length === 0) {
      return 0;
    }

    const targetTokenSet = new Set(targetTokens);

    return sourceTokens.reduce((count, token) => count + (targetTokenSet.has(token) ? 1 : 0), 0);
  }

  private getSharedTokens(sourceTokens: string[], targetTokens: string[]) {
    if (sourceTokens.length === 0 || targetTokens.length === 0) {
      return [];
    }

    const sourceTokenSet = new Set(sourceTokens);
    const targetTokenSet = new Set(targetTokens);

    return Array.from(sourceTokenSet).filter((token) => targetTokenSet.has(token));
  }

  private mergeMatchTokens(...tokenGroups: string[][]) {
    return Array.from(new Set(tokenGroups.flat()));
  }

  private getCategoryKeywordMatches(tokens: string[], category: ServiceMatchCategoryKey) {
    const categoryKeywords = new Set(MATCH_CATEGORY_KEYWORDS[category]);

    return tokens.filter((token) => categoryKeywords.has(token));
  }

  private hasCategoryKeywordAndDescriptorOverlap(tokens: string[], category: ServiceMatchCategoryKey) {
    if (tokens.length < 2) {
      return false;
    }

    const categoryKeywordMatches = this.getCategoryKeywordMatches(tokens, category);
    const categoryKeywords = new Set(MATCH_CATEGORY_KEYWORDS[category]);
    const hasCategoryKeyword = categoryKeywordMatches.length > 0;
    const hasDescriptorKeyword = tokens.some((token) => !categoryKeywords.has(token));

    return hasCategoryKeyword && hasDescriptorKeyword;
  }

  private countLocationTokenOverlap(sourceTokens: string[], targetTokens: string[]) {
    const locationTokens = this.getSharedTokens(sourceTokens, targetTokens).filter((token) => !MATCH_CATEGORY_KEYWORDS.activity.includes(token));

    return locationTokens.length;
  }

  async findOptions(quoteId: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: {
        adults: true,
        children: true,
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    const options = await this.prisma.quoteOption.findMany({
      where: { quoteId },
      orderBy: {
        createdAt: 'asc',
      },
      include: {
        hotelCategory: true,
        quoteItems: true,
      },
    });

    return options.map((option) => ({
      id: option.id,
      quoteId: option.quoteId,
      name: option.name,
      notes: option.notes,
      hotelCategoryId: option.hotelCategoryId,
      hotelCategory: option.hotelCategory,
      pricingMode: option.pricingMode,
      packageMarginPercent: option.packageMarginPercent,
      createdAt: option.createdAt,
      updatedAt: option.updatedAt,
      ...this.calculateOptionTotals(option, quote.adults + quote.children),
    }));
  }

  createOption(data: CreateQuoteOptionInput, actor?: CompanyScopedActor) {
    return this.assertQuoteMutationAccess(data.quoteId, actor).then(() =>
      this.resolveQuoteOptionName(data.name, data.hotelCategoryId).then(({ hotelCategoryId, name }) =>
      this.prisma.quoteOption.create({
        data: {
          quoteId: data.quoteId,
          name,
          notes: data.notes || null,
          hotelCategoryId,
          pricingMode: data.pricingMode ?? QuoteOptionPricingMode.itemized,
          packageMarginPercent:
            (data.pricingMode ?? QuoteOptionPricingMode.itemized) === QuoteOptionPricingMode.package
              ? this.normalizePackageMarginPercent(data.packageMarginPercent)
              : null,
        },
        include: {
          hotelCategory: true,
        },
      }),
    ).then((option) => ({
      ...option,
      ...this.calculateOptionTotals(
        {
          ...option,
          quoteItems: [],
        },
        0,
      ),
    })));
  }

  async updateOption(optionId: string, data: UpdateQuoteOptionInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const option = await this.prisma.quoteOption.findFirst({
      where: {
        id: optionId,
        quote: {
          clientCompanyId: companyId,
        },
      },
      include: {
        hotelCategory: true,
      },
    });

    if (!option) {
      throw new BadRequestException('Quote option not found');
    }

    const resolvedName = await this.resolveQuoteOptionName(
      data.name === undefined ? undefined : data.name,
      data.hotelCategoryId === undefined ? option.hotelCategoryId : data.hotelCategoryId,
      option.name,
    );

    return this.prisma.quoteOption.update({
      where: { id: optionId },
      data: {
        name: resolvedName.name,
        notes: data.notes === undefined ? undefined : data.notes || null,
        hotelCategoryId: resolvedName.hotelCategoryId,
        pricingMode: data.pricingMode,
        packageMarginPercent:
          data.pricingMode === undefined
            ? data.packageMarginPercent === undefined
              ? undefined
              : option.pricingMode === QuoteOptionPricingMode.package
                ? this.normalizePackageMarginPercent(data.packageMarginPercent)
                : null
            : data.pricingMode === QuoteOptionPricingMode.package
              ? data.packageMarginPercent === undefined
                ? undefined
                : this.normalizePackageMarginPercent(data.packageMarginPercent)
              : null,
      },
      include: {
        hotelCategory: true,
      },
    }).then(async (updatedOption) => {
      const quote = await this.prisma.quote.findUnique({
        where: { id: updatedOption.quoteId },
        select: {
          adults: true,
          children: true,
        },
      });

      const items = await this.prisma.quoteItem.findMany({
        where: {
          optionId,
        },
      });

      return {
        ...updatedOption,
        ...this.calculateOptionTotals(
          {
            ...updatedOption,
            quoteItems: items,
          },
          (quote?.adults || 0) + (quote?.children || 0),
        ),
      };
    });
  }

  async removeOption(quoteId: string, optionId: string, actor?: CompanyScopedActor) {
    await this.ensureOptionBelongsToQuote(quoteId, optionId, actor);

    await this.prisma.quoteOption.delete({
      where: { id: optionId },
    });

    return { id: optionId };
  }

  async findOptionItems(quoteId: string, optionId: string) {
    await this.ensureOptionBelongsToQuote(quoteId, optionId);

    return this.prisma.quoteItem.findMany({
      where: {
        quoteId,
        optionId,
      },
      include: {
        service: {
          include: {
            serviceType: true,
          },
        },
        itinerary: true,
        hotel: true,
        contract: true,
        appliedVehicleRate: {
          include: {
            vehicle: true,
            serviceType: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    } as any);
  }

  async createOptionItem(optionId: string, data: Omit<CreateQuoteItemInput, 'optionId'>, actor?: CompanyScopedActor) {
    await this.ensureOptionBelongsToQuote(data.quoteId, optionId, actor);

    return this.createItem({
      ...data,
      optionId,
    }, actor);
  }

  async updateOptionItem(optionId: string, itemId: string, data: UpdateQuoteItemInput, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const item = await this.prisma.quoteItem.findFirst({
      where: {
        id: itemId,
        optionId,
        quote: {
          clientCompanyId: companyId,
        },
      },
    });

    if (!item) {
      throw new BadRequestException('Quote item not found');
    }

    return this.updateItem(itemId, {
      ...data,
      optionId,
      quoteId: item.quoteId,
    }, actor);
  }

  async removeOptionItem(optionId: string, itemId: string, actor?: CompanyScopedActor) {
    const companyId = requireActorCompanyId(actor);
    const item = await this.prisma.quoteItem.findFirst({
      where: {
        id: itemId,
        optionId,
        quote: {
          clientCompanyId: companyId,
        },
      },
    });

    if (!item) {
      throw new BadRequestException('Quote item not found');
    }

    return this.removeItem(itemId, actor);
  }

  async generateScenarios(data: GenerateQuoteScenariosInput) {
    const paxCounts = Array.from(new Set(data.paxCounts.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0)))
      .sort((a, b) => a - b);

    if (paxCounts.length === 0) {
      throw new BadRequestException('paxCounts must contain at least one positive integer');
    }

    const quote = await this.prisma.quote.findUnique({
      where: { id: data.quoteId },
      include: {
        pricingSlabs: {
          orderBy: [{ minPax: 'asc' }, { maxPax: 'asc' }, { createdAt: 'asc' }],
        },
        quoteItems: {
          where: {
            optionId: null,
          },
          include: {
            service: {
              include: {
                serviceType: true,
              },
            },
            appliedVehicleRate: {
              include: {
                serviceType: true,
              },
            },
          },
        },
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    if (this.normalizeQuotePricingMode(quote.pricingMode, this.normalizeQuotePricingType(quote.pricingType)) !== 'SLAB') {
      throw new BadRequestException('Group pricing scenarios are only available for slab pricing quotes');
    }

    const scenariosData: Array<{
      quoteId: string;
      paxCount: number;
      totalCost: number;
      totalSell: number;
      pricePerPax: number;
    }> = [];

    for (const paxCount of paxCounts) {
      const roundedTotalCost = await this.calculateQuoteItemsTotalCostForPax(quote.quoteItems, quote, paxCount);
      const matchedSlab =
        quote.pricingSlabs.find((slab) => paxCount >= slab.minPax && (slab.maxPax === null || paxCount <= slab.maxPax)) || null;
      const derivedFocPax = matchedSlab
        ? Math.min(
            paxCount,
            matchedSlab.focPax ??
              this.resolveQuoteFoc({
                adults: paxCount,
                children: 0,
                focType: quote.focType,
                focRatio: quote.focRatio,
                focCount: quote.focCount,
                focRoomType: quote.focRoomType,
              }).resolvedFocCount,
          )
        : 0;
      const payingPax = Math.max(paxCount - derivedFocPax, 0);
      const roundedTotalSell = matchedSlab ? Number((matchedSlab.price * payingPax).toFixed(2)) : 0;

      scenariosData.push({
        quoteId: data.quoteId,
        paxCount,
        totalCost: roundedTotalCost,
        totalSell: roundedTotalSell,
        pricePerPax: matchedSlab ? Number(matchedSlab.price.toFixed(2)) : 0,
      });
    }

    await this.prisma.quoteScenario.deleteMany({
      where: { quoteId: data.quoteId },
    });

    await this.prisma.quoteScenario.createMany({
      data: scenariosData,
    });

    return this.prisma.quoteScenario.findMany({
      where: { quoteId: data.quoteId },
      orderBy: {
        paxCount: 'asc',
      },
    });
  }

  async generatePdf(quoteId: string) {
    const quote = await this.findOne(quoteId);

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    const doc = new PDFDocument({
      margin: 56,
      margins: {
        top: 76,
        bottom: 68,
        left: 56,
        right: 56,
      },
      size: 'A4',
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

    const pdfBufferPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    console.info('[quote-pdf] generatePdf', {
      quoteId,
      renderer: 'proposal-v2',
      quoteReference: quote.quoteNumber ?? null,
    });
    const proposal = this.buildProposalV2Document(quote);
    const renderer = new ProposalV2Renderer(doc, proposal, {
      loadImageBuffer: (logoUrl) => this.loadPdfImageBuffer(logoUrl),
    });
    await renderer.render();

    doc.end();

    return pdfBufferPromise;
  }

  private getPricingUnits(
    unitType: 'per_person' | 'per_room' | 'per_vehicle' | 'per_group' | 'per_night' | 'per_day',
    values: {
      quantity: number;
      paxCount: number;
      roomCount: number;
      nightCount: number;
      dayCount: number;
    },
  ) {
    switch (unitType) {
      case 'per_person':
        return values.quantity * Math.max(1, values.paxCount);
      case 'per_room':
        return values.quantity * Math.max(1, values.roomCount);
      case 'per_night':
        return values.quantity * Math.max(1, values.nightCount);
      case 'per_day':
        return values.quantity * Math.max(1, values.dayCount);
      case 'per_vehicle':
      case 'per_group':
      default:
        return values.quantity;
    }
  }

  private calculateItemPricing(values: {
    unitType: 'per_person' | 'per_room' | 'per_vehicle' | 'per_group' | 'per_night' | 'per_day';
    quantity: number;
    paxCount: number;
    roomCount: number;
    nightCount: number;
    dayCount: number;
    unitCost: number;
    markupPercent: number;
  }) {
    const pricingUnits = this.getPricingUnits(values.unitType, {
      quantity: values.quantity,
      paxCount: values.paxCount,
      roomCount: values.roomCount,
      nightCount: values.nightCount,
      dayCount: values.dayCount,
    });
    const totalCost = Number((values.unitCost * pricingUnits).toFixed(2));
    const totalSell = Number((totalCost * (1 + values.markupPercent / 100)).toFixed(2));

    return {
      totalCost,
      totalSell,
    };
  }

  private calculateHotelItemPricing(values: {
    quantity: number;
    roomCount: number;
    nightCount: number;
    unitCost: number;
    markupPercent: number;
  }) {
    const roomNights =
      Math.max(1, values.quantity) * Math.max(1, values.roomCount) * Math.max(1, values.nightCount);
    const totalCost = Number((values.unitCost * roomNights).toFixed(2));
    const totalSell = Number((totalCost * (1 + values.markupPercent / 100)).toFixed(2));

    return {
      totalCost,
      totalSell,
    };
  }

  private calculateTransportItemPricing(values: { totalCost: number; markupPercent: number }) {
    const totalCost = Number(values.totalCost.toFixed(2));
    const totalSell = Number((totalCost * (1 + values.markupPercent / 100)).toFixed(2));

    return {
      totalCost,
      totalSell,
    };
  }

  private buildLegacyQuoteItemPricing(values: {
    service: {
      category: string;
      unitType: ServiceUnitType;
      serviceType?: { name: string; code: string | null } | null;
    };
    quantity: number;
    paxCount: number;
    roomCount: number;
    nightCount: number;
    dayCount: number;
    unitCost: number;
    markupPercent: number;
    transportPricingMode?: TransportPricingMode | null;
    hotelRatePricingBasis?: 'PER_PERSON' | 'PER_ROOM' | string | null;
    externalPackagePricingBasis?: 'PER_PERSON' | 'PER_GROUP' | string | null;
    unitCount?: number | null;
  }) {
    if (this.isHotelService(values.service)) {
      return this.calculateHotelItemPricing({
        quantity: values.quantity,
        roomCount: values.roomCount,
        nightCount: values.nightCount,
        unitCost: values.unitCost,
        markupPercent: values.markupPercent,
      });
    }

    if (this.isTransportService(values.service) && values.transportPricingMode) {
      return this.calculateTransportItemPricing({
        totalCost:
          values.transportPricingMode === 'capacity_unit' && values.unitCount
            ? values.unitCount * values.unitCost
            : values.unitCost,
        markupPercent: values.markupPercent,
      });
    }

    if (this.isExternalPackageService(values.service)) {
      return this.calculateItemPricing({
        unitType: values.externalPackagePricingBasis === 'PER_PERSON' ? ServiceUnitType.per_person : ServiceUnitType.per_group,
        quantity: 1,
        paxCount: values.paxCount,
        roomCount: values.roomCount,
        nightCount: values.nightCount,
        dayCount: values.dayCount,
        unitCost: values.unitCost,
        markupPercent: values.markupPercent,
      });
    }

    return this.calculateItemPricing({
      unitType: values.service.unitType,
      quantity: values.quantity,
      paxCount: values.paxCount,
      roomCount: values.roomCount,
      nightCount: values.nightCount,
      dayCount: values.dayCount,
      unitCost: values.unitCost,
      markupPercent: values.markupPercent,
    });
  }

  private calculateCentralizedQuoteItemPricing(values: {
    service: {
      category: string;
      unitType: ServiceUnitType;
      serviceType?: { name: string; code: string | null } | null;
    };
    quantity: number;
    paxCount: number;
    roomCount: number;
    nightCount: number;
    dayCount: number;
    unitCost: number;
    markupPercent: number;
    quoteCurrency: string;
    supplierPricing: {
      costBaseAmount?: number | null;
      costCurrency?: string | null;
      salesTaxPercent?: number | null;
      salesTaxIncluded?: boolean | null;
      serviceChargePercent?: number | null;
      serviceChargeIncluded?: boolean | null;
      tourismFeeAmount?: number | null;
      tourismFeeCurrency?: string | null;
      tourismFeeMode?: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
    };
    transportPricingMode?: TransportPricingMode | null;
    hotelRatePricingBasis?: 'PER_PERSON' | 'PER_ROOM' | string | null;
    externalPackagePricingBasis?: 'PER_PERSON' | 'PER_GROUP' | string | null;
    unitCount?: number | null;
    legacyCurrency?: string | null;
  }) {
    const pricingUnits = this.isHotelService(values.service)
      ? values.hotelRatePricingBasis === 'PER_PERSON'
        ? Math.max(1, values.paxCount) * Math.max(1, values.nightCount)
        : Math.max(1, values.quantity) * Math.max(1, values.roomCount) * Math.max(1, values.nightCount)
      : this.isExternalPackageService(values.service)
        ? values.externalPackagePricingBasis === 'PER_PERSON'
          ? Math.max(1, values.paxCount)
          : 1
      : this.isTransportService(values.service) &&
          values.transportPricingMode === 'capacity_unit' &&
          values.unitCount
        ? values.unitCount
        : this.getPricingUnits(values.service.unitType, {
            quantity: values.quantity,
            paxCount: values.paxCount,
            roomCount: values.roomCount,
            nightCount: values.nightCount,
            dayCount: values.dayCount,
          });
    const legacyPricing = this.buildLegacyQuoteItemPricing({
      service: values.service,
      quantity: values.quantity,
      paxCount: values.paxCount,
      roomCount: values.roomCount,
      nightCount: values.nightCount,
      dayCount: values.dayCount,
      unitCost: values.unitCost,
      markupPercent: values.markupPercent,
      transportPricingMode: values.transportPricingMode,
      unitCount: values.unitCount,
      externalPackagePricingBasis: values.externalPackagePricingBasis,
    });

    return calculateMultiCurrencyQuoteItemPricing({
      supplierPricing: {
        costBaseAmount: values.supplierPricing.costBaseAmount ?? values.unitCost,
        costCurrency: values.supplierPricing.costCurrency ?? values.legacyCurrency ?? values.quoteCurrency,
        salesTaxPercent: values.supplierPricing.salesTaxPercent ?? 0,
        salesTaxIncluded: values.supplierPricing.salesTaxIncluded ?? false,
        serviceChargePercent: values.supplierPricing.serviceChargePercent ?? 0,
        serviceChargeIncluded: values.supplierPricing.serviceChargeIncluded ?? false,
        tourismFeeAmount: values.supplierPricing.tourismFeeAmount ?? 0,
        tourismFeeCurrency:
          values.supplierPricing.tourismFeeCurrency ??
          values.supplierPricing.costCurrency ??
          values.legacyCurrency ??
          values.quoteCurrency,
        tourismFeeMode: values.supplierPricing.tourismFeeMode ?? null,
      },
      pricingUnits: {
        pricingUnits,
        roomCount: values.roomCount,
        nightCount: values.nightCount,
        paxCount: values.paxCount,
      },
      quoteCurrency: values.quoteCurrency,
      markupPercent: values.markupPercent,
      legacyPricing: {
        ...legacyPricing,
        currency: values.legacyCurrency ?? values.supplierPricing.costCurrency ?? values.quoteCurrency,
      },
    });
  }

  private applyQuoteItemSellingLayer(values: {
    pricing: ReturnType<typeof calculateMultiCurrencyQuoteItemPricing>;
    cost: number;
    markupPercent: number;
    markupAmount: number | null;
    sellPriceOverride: number | null;
  }) {
    const cost = Number(values.cost.toFixed(2));
    const totalSell =
      values.sellPriceOverride !== null
        ? values.sellPriceOverride
        : values.markupAmount !== null
          ? Number((cost + values.markupAmount).toFixed(2))
          : Number((cost * (1 + Math.max(0, values.markupPercent) / 100)).toFixed(2));

    return {
      ...values.pricing,
      totalCost: cost,
      totalSell: Number(totalSell.toFixed(2)),
    };
  }

  private normalizeOptionalNonNegativeNumber(value: number | null | undefined, fieldName: string) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException(`${fieldName} must be zero or greater`);
    }

    return Number(normalized.toFixed(2));
  }

  private getFinalItemCost(baseCost: number, overrideCost: number | null, useOverride: boolean) {
    if (useOverride && overrideCost !== null) {
      return overrideCost;
    }

    return baseCost;
  }

  private calculateTotalsFromItems(
    items: Array<{
      totalCost: number;
      totalSell: number;
    }>,
    totalPax: number,
  ) {
    const totalCost = Number(items.reduce((sum, item) => sum + item.totalCost, 0).toFixed(2));
    const totalSell = Number(items.reduce((sum, item) => sum + item.totalSell, 0).toFixed(2));
    const pricePerPax = totalPax > 0 ? Number((totalSell / totalPax).toFixed(2)) : 0;

    return {
      totalCost,
      totalSell,
      pricePerPax,
    };
  }

  private calculateOptionTotals(
    option: {
      pricingMode: QuoteOptionPricingMode;
      packageMarginPercent: number | null;
      quoteItems: Array<{
        totalCost: number;
        totalSell: number;
      }>;
    },
    totalPax: number,
  ) {
    const totalCost = Number(option.quoteItems.reduce((sum, item) => sum + item.totalCost, 0).toFixed(2));
    const totalSell =
      option.pricingMode === QuoteOptionPricingMode.package && option.packageMarginPercent !== null
        ? Number((totalCost * (1 + option.packageMarginPercent / 100)).toFixed(2))
        : Number(option.quoteItems.reduce((sum, item) => sum + item.totalSell, 0).toFixed(2));
    const totalPrice = totalSell;
    const profit = Number((totalSell - totalCost).toFixed(2));
    const pricePerPax = totalPax > 0 ? Number((totalSell / totalPax).toFixed(2)) : 0;

    return {
      totalCost,
      totalPrice,
      totalSell,
      profit,
      pricePerPax,
    };
  }

  private normalizePackageMarginPercent(value: number | null | undefined) {
    if (value === undefined || value === null || Number.isNaN(Number(value))) {
      return null;
    }

    return Number(Number(value).toFixed(2));
  }

  private isHotelService(service: { category: string; serviceType?: { name: string; code: string | null } | null }) {
    const normalizedCategory = this.getNormalizedServiceCategory(service);

    return normalizedCategory === 'hotel' || normalizedCategory === 'accommodation';
  }

  private isTransportService(service: { category: string; serviceType?: { name: string; code: string | null } | null }) {
    const normalizedCategory = this.getNormalizedServiceCategory(service);

    return (
      normalizedCategory.includes('transport') ||
      normalizedCategory.includes('transfer') ||
      normalizedCategory.includes('vehicle')
    );
  }

  private isGuideService(service: { category: string; serviceType?: { name: string; code: string | null } | null }) {
    return this.getNormalizedServiceCategory(service).includes('guide');
  }

  private isActivityService(service: { category: string; serviceType?: { name: string; code: string | null } | null }) {
    const normalizedCategory = this.getNormalizedServiceCategory(service);

    return (
      normalizedCategory.includes('activity') ||
      normalizedCategory.includes('tour') ||
      normalizedCategory.includes('excursion') ||
      normalizedCategory.includes('experience') ||
      normalizedCategory.includes('sightseeing') ||
      normalizedCategory.includes('entrance') ||
      normalizedCategory.includes('ticket')
    );
  }

  private isMealService(service: { category: string; serviceType?: { name: string; code: string | null } | null }) {
    const normalizedCategory = this.getNormalizedServiceCategory(service);

    return (
      normalizedCategory === 'meal' ||
      normalizedCategory === 'dining' ||
      normalizedCategory.includes('meal') ||
      normalizedCategory.includes('dinner') ||
      normalizedCategory.includes('lunch') ||
      normalizedCategory.includes('breakfast') ||
      normalizedCategory.includes('food')
    );
  }

  private isExternalPackageService(service: { category: string; serviceType?: { name: string; code: string | null } | null }) {
    const normalizedCategory = this.getNormalizedServiceCategory(service).replace(/[\s-]+/g, '_');

    return normalizedCategory === 'external_package' || normalizedCategory.includes('external_package') || normalizedCategory.includes('partner_package');
  }

  private getNormalizedServiceCategory(service: {
    category: string;
    serviceType?: { name: string; code: string | null } | null;
  }) {
    return (service.serviceType?.code || service.serviceType?.name || service.category).trim().toLowerCase();
  }

  private normalizeExternalPackagePricingBasis(value: CreateQuoteItemInput['pricingBasis']) {
    const normalizedBasis = this.tryNormalizeExternalPackagePricingBasis(value);
    if (normalizedBasis) {
      return normalizedBasis;
    }

    throw new BadRequestException('External package pricingBasis must be PER_PERSON or PER_GROUP');
  }

  private tryNormalizeExternalPackagePricingBasis(value: CreateQuoteItemInput['pricingBasis'] | string | undefined) {
    const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

    if (normalized === 'PER_PERSON' || normalized === 'PERSON') {
      return 'PER_PERSON' as const;
    }

    if (normalized === 'PER_GROUP' || normalized === 'GROUP') {
      return 'PER_GROUP' as const;
    }

    return null;
  }

  private normalizeExternalPackageNetCost(value: number | null | undefined) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException('External package netCost must be zero or greater');
    }
    return Number(normalized.toFixed(2));
  }

  private normalizeOptionalPositiveInteger(value: number | null | undefined, fieldName: string) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = Math.floor(Number(value));
    if (!Number.isFinite(normalized) || normalized < 1) {
      throw new BadRequestException(`${fieldName} must be one or greater`);
    }
    return normalized;
  }

  private normalizeQuoteItemOperationalText(value: string | null | undefined) {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();

    return normalized || null;
  }

  private normalizeQuoteItemOperationalDate(value: Date | null | undefined) {
    if (value === undefined || value === null) {
      return null;
    }

    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('Invalid operational date');
    }

    return value;
  }

  private parseDateLike(value: Date | string | null | undefined) {
    if (!value) {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private resolveQuoteItemServiceDateValue(values: {
    explicitServiceDate?: Date | string | null;
    itineraryId?: string | null;
    travelStartDate?: Date | string | null;
    itineraryContextById: Map<string, { dayNumber: number }>;
  }) {
    const explicitDate = this.parseDateLike(values.explicitServiceDate);

    if (explicitDate) {
      return explicitDate;
    }

    const travelStartDate = this.parseDateLike(values.travelStartDate);
    const itineraryDayNumber = values.itineraryId ? values.itineraryContextById.get(values.itineraryId)?.dayNumber ?? null : null;

    if (!travelStartDate || !itineraryDayNumber || itineraryDayNumber < 1) {
      return null;
    }

    const resolvedDate = new Date(travelStartDate);
    resolvedDate.setUTCDate(resolvedDate.getUTCDate() + (itineraryDayNumber - 1));

    return resolvedDate;
  }

  private async resolveQuoteOptionName(
    rawName: string | undefined,
    hotelCategoryId: string | null | undefined,
    fallbackName?: string,
  ) {
    let hotelCategory:
      | {
          id: string;
          name: string;
        }
      | null
      | undefined;

    if (hotelCategoryId) {
      hotelCategory = await this.prisma.hotelCategory.findUnique({
        where: { id: hotelCategoryId },
        select: {
          id: true,
          name: true,
        },
      });

      if (!hotelCategory) {
        throw new BadRequestException('Hotel category not found');
      }
    }

    const normalizedName = rawName === undefined ? undefined : rawName.trim() || null;
    const name = normalizedName ?? hotelCategory?.name ?? fallbackName;

    if (!name) {
      throw new BadRequestException('name or hotelCategoryId is required');
    }

    return {
      hotelCategoryId: hotelCategory?.id ?? null,
      name,
    };
  }

  private isGuideType(value: string): value is keyof typeof GUIDE_RATES {
    return value === 'local' || value === 'escort';
  }

  private isGuideDuration(value: string): value is keyof (typeof GUIDE_RATES)['local'] {
    return value === 'half_day' || value === 'full_day';
  }

  private formatGuideType(value: keyof typeof GUIDE_RATES) {
    return value === 'local' ? 'Local' : 'Escort';
  }

  private formatGuideDuration(value: keyof (typeof GUIDE_RATES)['local']) {
    return value === 'half_day' ? 'Half day' : 'Full day';
  }

  private async ensureOptionBelongsToQuote(quoteId: string, optionId: string, actor?: CompanyScopedActor) {
    const quote = await this.assertQuoteMutationAccess(quoteId, actor);
    const option = await this.prisma.quoteOption.findFirst({
      where: {
        id: optionId,
        quoteId: quote.id,
      },
    });

    if (!option) {
      throw new BadRequestException('Quote option not found');
    }

    return option;
  }

  private async assertQuoteMutationAccess(
    quoteId: string,
    actor?: CompanyScopedActor,
    args?: { select?: Record<string, boolean | object>; include?: Record<string, unknown> },
  ) {
    const companyId = requireActorCompanyId(actor);
    const quote = await this.prisma.quote.findFirst({
      where: {
        id: quoteId,
        clientCompanyId: companyId,
      },
      ...(args || { select: { id: true } }),
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    return quote;
  }

  private async listCompanyIdsForMaintenanceJobs() {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return companies.map((company) => company.id);
  }

  private async recalculateQuoteTotals(quoteId: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        adults: true,
        children: true,
        roomCount: true,
        nightCount: true,
        focType: true,
        focRatio: true,
        focCount: true,
        focRoomType: true,
        pricingType: true,
        pricingMode: true,
        quoteCurrency: true,
        jordanPassType: true,
        pricingSlabs: {
          orderBy: [{ minPax: 'asc' }, { maxPax: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            minPax: true,
            maxPax: true,
            price: true,
          },
        },
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    await this.syncJordanPassEntranceFees(quote);

    const items = await this.prisma.quoteItem.findMany({
      where: {
        quoteId,
        optionId: null,
      },
      include: {
        service: {
          include: {
            serviceType: true,
            entranceFee: true,
          },
        },
        entranceFee: true,
        appliedVehicleRate: {
          include: {
            serviceType: true,
          },
        },
      },
    });

    const itemTotals = this.calculateTotalsFromItems(
      items,
      quote.adults + quote.children,
    );
    const passTotals = await this.calculateJordanPassTotals(quote);
    const totalCost = Number((itemTotals.totalCost + passTotals.totalCost).toFixed(2));
    const totalSell = Number((itemTotals.totalSell + passTotals.totalSell).toFixed(2));
    const pricePerPax = quote.adults + quote.children > 0 ? Number((totalSell / (quote.adults + quote.children)).toFixed(2)) : 0;

    const updatedQuote = await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        totalCost,
        totalSell,
        totalPrice: totalSell,
        pricePerPax,
      },
    });

    if (this.normalizeQuotePricingMode(quote.pricingMode, this.normalizeQuotePricingType(quote.pricingType)) === 'SLAB') {
      await this.syncQuotePricingSlabDerivedValues(quote, items);
    }

    return updatedQuote;
  }

  private async syncQuotePricingSlabDerivedValues(
    quote: {
      id: string;
      adults: number;
      children: number;
      roomCount: number;
      nightCount: number;
      focType: string;
      focRatio: number | null;
      focCount: number | null;
      focRoomType: string | null;
      pricingSlabs: Array<{ id: string; minPax: number; maxPax: number | null; price: number; focPax?: number | null; notes?: string | null }>;
    },
    items: Array<{
      quantity: number;
      roomCount: number | null;
      nightCount: number | null;
      dayCount: number | null;
      paxCount?: number | null;
      baseCost: number;
      totalCost?: number | null;
      totalSell?: number | null;
      currency?: string | null;
      quoteCurrency?: string | null;
      costBaseAmount?: number | null;
      costCurrency?: string | null;
      salesTaxPercent?: number | null;
      salesTaxIncluded?: boolean | null;
      serviceChargePercent?: number | null;
      serviceChargeIncluded?: boolean | null;
      tourismFeeAmount?: number | null;
      tourismFeeCurrency?: string | null;
      tourismFeeMode?: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
      overrideCost: number | null;
      useOverride: boolean;
      markupPercent: number;
      service: {
        category: string;
        unitType: ServiceUnitType;
        serviceType?: { name: string; code: string | null } | null;
      };
      appliedVehicleRate?: {
        routeId: string | null;
        routeName: string;
        serviceType: { id: string; name: string; code: string | null };
      } | null;
    }>,
  ) {
    if (quote.pricingSlabs.length === 0) {
      return;
    }

    for (const slab of quote.pricingSlabs) {
      const derived = await this.buildQuotePricingSlabRecord(quote, slab, items);
      await this.prisma.quotePricingSlab.update({
        where: { id: slab.id },
        data: derived,
      });
    }
  }

  private async buildQuotePricingSlabRecord(
    quote: {
      adults: number;
      children: number;
      roomCount: number;
      nightCount: number;
      focType: string;
      focRatio: number | null;
      focCount: number | null;
      focRoomType: string | null;
    },
    slab: QuotePricingSlabInput,
    items: Array<{
      quantity: number;
      roomCount: number | null;
      nightCount: number | null;
      dayCount: number | null;
      paxCount?: number | null;
      baseCost: number;
      totalCost?: number | null;
      totalSell?: number | null;
      currency?: string | null;
      quoteCurrency?: string | null;
      costBaseAmount?: number | null;
      costCurrency?: string | null;
      salesTaxPercent?: number | null;
      salesTaxIncluded?: boolean | null;
      serviceChargePercent?: number | null;
      serviceChargeIncluded?: boolean | null;
      tourismFeeAmount?: number | null;
      tourismFeeCurrency?: string | null;
      tourismFeeMode?: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
      overrideCost: number | null;
      useOverride: boolean;
      markupPercent: number;
      service: {
        category: string;
        unitType: ServiceUnitType;
        serviceType?: { name: string; code: string | null } | null;
      };
      appliedVehicleRate?: {
        routeId: string | null;
        routeName: string;
        serviceType: { id: string; name: string; code: string | null };
      } | null;
    }>,
  ): Promise<Omit<QuotePricingSlabRecord, 'id' | 'minPax' | 'maxPax' | 'price'>> {
    const actualPax = Math.max(1, slab.minPax);
    const resolvedFoc = this.resolveQuoteFoc({
      adults: actualPax,
      children: 0,
      focType: quote.focType,
      focRatio: quote.focRatio,
      focCount: quote.focCount,
      focRoomType: quote.focRoomType,
    });
    const focPax = Math.min(actualPax, slab.focPax ?? resolvedFoc.resolvedFocCount);
    const payingPax = Math.max(actualPax - focPax, 0);
    const totalCost = await this.calculateQuoteItemsTotalCostForPax(items, quote, actualPax);
    const pricePerPayingPax = Number(slab.price.toFixed(2));
    const totalSell = Number((pricePerPayingPax * payingPax).toFixed(2));
    const pricePerActualPax = actualPax > 0 ? Number((totalSell / actualPax).toFixed(2)) : null;

    return {
      actualPax,
      focPax,
      payingPax,
      totalCost,
      totalSell,
      pricePerPayingPax,
      pricePerActualPax,
    };
  }

  private async resolveJordanPassEntranceCoverage(values: {
    quoteId: string;
    optionId: string | null;
    jordanPassType: string;
    entranceFee: { id: string; siteName: string; includedInJordanPass: boolean };
  }) {
    const passType = this.normalizeJordanPassType(values.jordanPassType);

    if (passType === 'NONE' || !values.entranceFee.includedInJordanPass) {
      return { covered: false };
    }

    if (!this.isPetraEntranceSite(values.entranceFee.siteName)) {
      return { covered: true };
    }

    const product = await this.prisma.jordanPassProduct.findUnique({
      where: { code: passType },
      select: { petraDayCount: true },
    });
    const coveredPetraVisits = await this.prisma.quoteItem.count({
      where: {
        quoteId: values.quoteId,
        optionId: values.optionId,
        jordanPassCovered: true,
        entranceFee: {
          siteName: { contains: 'Petra', mode: 'insensitive' },
        },
      },
    });

    return { covered: coveredPetraVisits < (product?.petraDayCount ?? 0) };
  }

  private async syncJordanPassEntranceFees(quote: {
    id: string;
    adults: number;
    children: number;
    roomCount: number;
    nightCount: number;
    quoteCurrency: string;
    jordanPassType: string;
  }) {
    const items = await this.prisma.quoteItem.findMany({
      where: {
        quoteId: quote.id,
        entranceFeeId: { not: null },
      },
      include: {
        entranceFee: true,
        service: {
          include: {
            serviceType: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    const petraCoverageByOption = new Map<string, number>();
    const passType = this.normalizeJordanPassType(quote.jordanPassType);
    const passProduct =
      passType === 'NONE'
        ? null
        : await this.prisma.jordanPassProduct.findUnique({
            where: { code: passType },
            select: { petraDayCount: true },
          });

    for (const item of items) {
      if (!item.entranceFee) {
        continue;
      }

      let covered = passType !== 'NONE' && item.entranceFee.includedInJordanPass;

      if (covered && this.isPetraEntranceSite(item.entranceFee.siteName)) {
        const key = item.optionId || 'base';
        const used = petraCoverageByOption.get(key) || 0;
        covered = used < (passProduct?.petraDayCount ?? 0);
        if (covered) {
          petraCoverageByOption.set(key, used + 1);
        }
      }

      const unitCost = covered ? 0 : item.entranceFee.foreignerFeeJod;
      const pricing = this.calculateCentralizedQuoteItemPricing({
        service: item.service,
        quantity: item.quantity,
        paxCount: item.paxCount ?? quote.adults + quote.children,
        roomCount: item.roomCount ?? quote.roomCount,
        nightCount: item.nightCount ?? quote.nightCount,
        dayCount: item.dayCount ?? 1,
        unitCost,
        markupPercent: item.markupPercent,
        quoteCurrency: this.normalizeCurrencyCode(quote.quoteCurrency),
        supplierPricing: {
          costBaseAmount: unitCost,
          costCurrency: 'JOD',
          salesTaxPercent: item.salesTaxPercent ?? 0,
          salesTaxIncluded: item.salesTaxIncluded ?? false,
          serviceChargePercent: item.serviceChargePercent ?? 0,
          serviceChargeIncluded: item.serviceChargeIncluded ?? false,
          tourismFeeAmount: item.tourismFeeAmount ?? 0,
          tourismFeeCurrency: item.tourismFeeCurrency ?? 'JOD',
          tourismFeeMode: item.tourismFeeMode ?? null,
        },
        legacyCurrency: 'JOD',
      });

      await this.prisma.quoteItem.update({
        where: { id: item.id },
        data: {
          jordanPassCovered: covered,
          jordanPassSavingsJod: covered ? item.entranceFee.foreignerFeeJod : 0,
          pricingDescription: covered
            ? `${item.entranceFee.siteName} | Covered by Jordan Pass`
            : `${item.entranceFee.siteName} | Entrance fee`,
          baseCost: pricing.totalCost,
          costBaseAmount: unitCost,
          costCurrency: 'JOD',
          currency: pricing.quoteCurrency,
          quoteCurrency: pricing.quoteCurrency,
          fxRate: pricing.fxRate,
          fxFromCurrency: pricing.fxFromCurrency,
          fxToCurrency: pricing.fxToCurrency,
          fxRateDate: pricing.fxRateDate,
          finalCost: pricing.totalCost,
          totalCost: pricing.totalCost,
          totalSell: pricing.totalSell,
        },
      });
    }
  }

  private async calculateJordanPassTotals(quote: {
    adults: number;
    children: number;
    quoteCurrency: string;
    jordanPassType: string;
  }) {
    const passType = this.normalizeJordanPassType(quote.jordanPassType);

    if (passType === 'NONE') {
      return { totalCost: 0, totalSell: 0 };
    }

    const product = await this.prisma.jordanPassProduct.findUnique({
      where: { code: passType },
      select: { priceJod: true },
    });

    if (!product) {
      return { totalCost: 0, totalSell: 0 };
    }

    const pax = Math.max(1, quote.adults + quote.children);
    const pricing = calculateMultiCurrencyQuoteItemPricing({
      supplierPricing: {
        costBaseAmount: product.priceJod,
        costCurrency: 'JOD',
        salesTaxPercent: 0,
        salesTaxIncluded: false,
        serviceChargePercent: 0,
        serviceChargeIncluded: false,
        tourismFeeAmount: 0,
        tourismFeeCurrency: 'JOD',
        tourismFeeMode: null,
      },
      pricingUnits: {
        pricingUnits: pax,
        roomCount: 1,
        nightCount: 1,
        paxCount: pax,
      },
      quoteCurrency: this.normalizeCurrencyCode(quote.quoteCurrency),
      markupPercent: 0,
      legacyPricing: {
        totalCost: product.priceJod * pax,
        totalSell: product.priceJod * pax,
        currency: 'JOD',
      },
    });

    return { totalCost: pricing.totalCost, totalSell: pricing.totalSell };
  }

  private isPetraEntranceSite(siteName: string) {
    return /\bpetra\b/i.test(siteName);
  }

  private async calculateQuoteItemsTotalCostForPax(
    items: Array<{
      quantity: number;
      roomCount: number | null;
      nightCount: number | null;
      dayCount: number | null;
      paxCount?: number | null;
      baseCost: number;
      totalCost?: number | null;
      totalSell?: number | null;
      currency?: string | null;
      quoteCurrency?: string | null;
      costBaseAmount?: number | null;
      costCurrency?: string | null;
      salesTaxPercent?: number | null;
      salesTaxIncluded?: boolean | null;
      serviceChargePercent?: number | null;
      serviceChargeIncluded?: boolean | null;
      tourismFeeAmount?: number | null;
      tourismFeeCurrency?: string | null;
      tourismFeeMode?: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
      overrideCost: number | null;
      useOverride: boolean;
      markupPercent: number;
      service: {
        category: string;
        unitType: ServiceUnitType;
        serviceType?: { name: string; code: string | null } | null;
      };
      appliedVehicleRate?: {
        routeId: string | null;
        routeName: string;
        serviceType: { id: string; name: string; code: string | null };
      } | null;
    }>,
    quote: {
      roomCount: number;
      nightCount: number;
    },
    paxCount: number,
  ) {
    let totalCost = 0;

    for (const item of items) {
      let baseCost = item.baseCost;

      if (item.appliedVehicleRate) {
        const rate = await this.transportPricingService.findMatchingRate({
          serviceTypeId: item.appliedVehicleRate.serviceType.id,
          routeId: item.appliedVehicleRate.routeId || undefined,
          routeName: item.appliedVehicleRate.routeName,
          paxCount,
        });

        baseCost = rate.price;
      }

      const effectiveUnitCost = this.getFinalItemCost(baseCost, item.overrideCost, item.useOverride);
      const pricing = this.calculateCentralizedQuoteItemPricing({
        service: item.service,
        quantity: item.quantity,
        paxCount: item.paxCount ?? paxCount,
        roomCount: item.roomCount ?? quote.roomCount,
        nightCount: item.nightCount ?? quote.nightCount,
        dayCount: item.dayCount ?? 1,
        unitCost: effectiveUnitCost,
        markupPercent: item.markupPercent,
        quoteCurrency: this.normalizeCurrencyCode(item.quoteCurrency ?? item.currency ?? 'USD'),
        supplierPricing: {
          costBaseAmount: item.costBaseAmount ?? effectiveUnitCost,
          costCurrency: item.costCurrency ?? item.currency ?? 'USD',
          salesTaxPercent: item.salesTaxPercent ?? 0,
          salesTaxIncluded: item.salesTaxIncluded ?? false,
          serviceChargePercent: item.serviceChargePercent ?? 0,
          serviceChargeIncluded: item.serviceChargeIncluded ?? false,
          tourismFeeAmount: item.tourismFeeAmount ?? 0,
          tourismFeeCurrency: item.tourismFeeCurrency ?? item.costCurrency ?? item.currency ?? 'USD',
          tourismFeeMode: item.tourismFeeMode ?? null,
        },
        legacyCurrency: item.currency ?? 'USD',
      });

      totalCost += pricing.totalCost;
    }

    return Number(totalCost.toFixed(2));
  }

  private normalizeQuotePricingType(value: string | undefined | null): QuotePricingType {
    return value === 'group' ? 'group' : 'simple';
  }

  private normalizeQuoteType(value: string | undefined | null): QuoteTypeValue {
    const normalized = String(value || 'FIT').trim().toUpperCase() as QuoteTypeValue;

    if (!QUOTE_TYPES.includes(normalized)) {
      throw new BadRequestException('quoteType must be FIT or GROUP');
    }

    return normalized;
  }

  private normalizeJordanPassType(value: string | undefined | null): JordanPassTypeValue {
    const normalized = String(value || 'NONE').trim().toUpperCase() as JordanPassTypeValue;

    if (!JORDAN_PASS_TYPES.includes(normalized)) {
      throw new BadRequestException('jordanPassType must be NONE, WANDERER, EXPLORER, or EXPERT');
    }

    return normalized;
  }

  private normalizeBookingType(value: string | undefined | null): QuoteBookingType {
    const normalized = String(value || 'FIT').trim().toUpperCase() as QuoteBookingType;

    if (!BOOKING_TYPES.includes(normalized)) {
      throw new BadRequestException('Unsupported booking type');
    }

    return normalized;
  }

  private normalizeQuoteLifecycleDate(value: Date | null | undefined) {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new BadRequestException('validUntil must be a valid date');
    }

    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999));
  }

  private buildQuoteStatusTimestamps(values: {
    currentStatus: QuoteStatus;
    nextStatus: QuoteStatus;
    currentSentAt: Date | null;
    currentAcceptedAt: Date | null;
  }) {
    const now = new Date();

    return {
      sentAt:
        values.nextStatus === QuoteStatus.SENT && values.currentStatus !== QuoteStatus.SENT
          ? now
          : values.currentSentAt,
      acceptedAt:
        values.nextStatus === QuoteStatus.ACCEPTED && values.currentStatus !== QuoteStatus.ACCEPTED
          ? now
          : values.currentAcceptedAt,
    };
  }

  private async resolveAcceptedQuoteVersion(values: {
    quoteId: string;
    acceptedVersionId?: string | null;
    prismaClient?: Prisma.TransactionClient | PrismaService;
  }) {
    const prismaClient = values.prismaClient ?? this.prisma;
    const quoteVersionModel = (prismaClient as any).quoteVersion;
    const preferredVersionId = values.acceptedVersionId?.trim() || null;

    if (preferredVersionId) {
      const preferredVersion = await quoteVersionModel.findUnique({
        where: {
          id: preferredVersionId,
        },
        select: {
          id: true,
          quoteId: true,
          snapshotJson: true,
        },
      });

      if (!preferredVersion) {
        throw new BadRequestException('Quote version not found');
      }

      if (preferredVersion.quoteId !== values.quoteId) {
        throw new BadRequestException('Quote version does not belong to the selected quote');
      }

      this.assertQuoteWorkflowStateIsComplete(preferredVersion.snapshotJson);
      return preferredVersion as { id: string; quoteId: string; snapshotJson: unknown };
    }

    const versions = await quoteVersionModel.findMany({
      where: {
        quoteId: values.quoteId,
      },
      orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        quoteId: true,
        snapshotJson: true,
      },
    });

    if (versions.length === 0) {
      throw new BadRequestException('Accepted quotes require at least one saved quote version');
    }

    for (const version of versions as Array<{ id: string; quoteId: string; snapshotJson: unknown }>) {
      try {
        this.assertQuoteWorkflowStateIsComplete(version.snapshotJson);
        return version;
      } catch {
        continue;
      }
    }

    throw new BadRequestException(
      'Accepted quotes require a saved quote version with complete pricing and workflow details',
    );
  }

  private buildBookingSnapshotFromAcceptedVersion(snapshotJson: unknown) {
    const snapshot = (snapshotJson || {}) as {
      bookingType?: string | null;
      company?: unknown;
      clientCompany?: unknown;
      brandCompany?: unknown;
      contact?: unknown;
      itineraries?: unknown[];
      pricingSlabs?: unknown[];
      scenarios?: unknown[];
      totalCost?: number | null;
      totalSell?: number | null;
      pricePerPax?: number | null;
      fixedPricePerPerson?: number | null;
      pricingMode?: string | null;
      pricingType?: string | null;
      validUntil?: string | null;
      adults?: number | null;
      children?: number | null;
      roomCount?: number | null;
      nightCount?: number | null;
      travelStartDate?: string | Date | null;
    };
    const clientSnapshotJson = (snapshot.clientCompany ?? snapshot.company ?? {}) as Prisma.JsonObject;
    const brandSnapshotJson = ((snapshot.brandCompany ?? snapshot.clientCompany ?? snapshot.company ?? null) || null) as
      | Prisma.JsonObject
      | null;
    const contactSnapshotJson = (snapshot.contact ?? {}) as Prisma.JsonObject;

    return {
      snapshotJson: snapshot as Prisma.JsonObject,
      clientSnapshotJson,
      brandSnapshotJson,
      contactSnapshotJson,
      itinerarySnapshotJson: (snapshot.itineraries ?? []) as Prisma.JsonArray,
      pricingSnapshotJson: {
        pricingMode: snapshot.pricingMode ?? null,
        pricingType: snapshot.pricingType ?? null,
        bookingType: snapshot.bookingType ?? 'FIT',
        totalCost: snapshot.totalCost ?? null,
        totalSell: snapshot.totalSell ?? null,
        pricePerPax: snapshot.pricePerPax ?? null,
        fixedPricePerPerson: snapshot.fixedPricePerPerson ?? null,
        validUntil: snapshot.validUntil ?? null,
        pricingSlabs: snapshot.pricingSlabs ?? [],
        scenarios: snapshot.scenarios ?? [],
      } as Prisma.JsonObject,
      adults: Math.max(0, Number(snapshot.adults ?? 0)),
      children: Math.max(0, Number(snapshot.children ?? 0)),
      roomCount: Math.max(0, Number(snapshot.roomCount ?? 0)),
      nightCount: Math.max(0, Number(snapshot.nightCount ?? 0)),
      travelStartDate: snapshot.travelStartDate ?? null,
      bookingType: this.normalizeBookingType(snapshot.bookingType),
    };
  }

  private async createBookingPassengerFoundation(
    prismaClient: Prisma.TransactionClient,
    bookingId: string,
    contactSnapshotJson: Prisma.JsonObject,
  ) {
    const contactSnapshot = (contactSnapshotJson || {}) as {
      firstName?: string | null;
      lastName?: string | null;
      title?: string | null;
    };
    const firstName = contactSnapshot.firstName?.trim() || '';
    const lastName = contactSnapshot.lastName?.trim() || '';

    if (!firstName && !lastName) {
      return null;
    }

    const leadPassenger = await prismaClient.bookingPassenger.create({
      data: {
        bookingId,
        fullName: [firstName, lastName].filter(Boolean).join(' ').trim() || null,
        firstName: firstName || 'Lead',
        lastName: lastName || 'Passenger',
        title: contactSnapshot.title?.trim() || null,
        isLead: true,
      },
      select: {
        id: true,
      },
    });

    return leadPassenger.id;
  }

  private async createBookingRoomingFoundation(
    prismaClient: Prisma.TransactionClient,
    bookingId: string,
    roomCount: number,
    leadPassengerId: string | null,
  ) {
    const normalizedRoomCount = Math.max(0, Number(roomCount || 0));

    if (normalizedRoomCount === 0) {
      return;
    }

    const roomingEntries = await Promise.all(
      Array.from({ length: normalizedRoomCount }, (_, index) =>
        prismaClient.bookingRoomingEntry.create({
          data: {
            bookingId,
            sortOrder: index + 1,
            occupancy: 'unknown',
          },
          select: {
            id: true,
          },
        }),
      ),
    );

    if (leadPassengerId && roomingEntries[0]) {
      await prismaClient.bookingRoomingAssignment.create({
        data: {
          bookingRoomingEntryId: roomingEntries[0].id,
          bookingPassengerId: leadPassengerId,
        },
      });
    }
  }

  private async buildBookingServicesFromAcceptedVersion(
    snapshotJson: unknown,
    prismaClient: Pick<Prisma.TransactionClient | PrismaService, 'supplier'> = this.prisma,
  ) {
    const snapshot = (snapshotJson || {}) as {
      adults?: number | null;
      children?: number | null;
      travelStartDate?: string | null;
      itineraries?: Array<{
        id?: string;
        dayNumber?: number | null;
        serviceDate?: string | null;
      }>;
      quoteItems?: Array<{
        id?: string;
        optionId?: string | null;
        itineraryId?: string | null;
        quantity?: number | null;
        serviceDate?: string | null;
        startTime?: string | null;
        pickupTime?: string | null;
        pickupLocation?: string | null;
        location?: string | null;
        meetingPoint?: string | null;
        participantCount?: number | null;
        adultCount?: number | null;
        childCount?: number | null;
        reconfirmationRequired?: boolean | null;
        reconfirmationDueAt?: string | null;
        pricingDescription?: string | null;
        totalCost?: number | null;
        totalSell?: number | null;
        service?: {
          name?: string | null;
          category?: string | null;
          supplierId?: string | null;
        } | null;
        hotel?: {
          supplierId?: string | null;
        } | null;
        appliedVehicleRate?: {
          vehicle?: {
            supplierId?: string | null;
          } | null;
        } | null;
      }>;
    };

    const itineraryContextById = new Map(
      (snapshot.itineraries ?? [])
        .filter(
          (
            day,
          ): day is {
            id: string;
            dayNumber: number;
            serviceDate?: string | null;
          } => Boolean(day.id) && Number.isFinite(day.dayNumber),
        )
        .map((day) => [
          day.id,
          {
            dayNumber: day.dayNumber,
            serviceDate: day.serviceDate || null,
          },
        ]),
    );

    const orderedItems = (snapshot.quoteItems ?? []).map((item, index) => ({ item, index }));
    const adultCount = Math.max(0, Number(snapshot.adults ?? 0));
    const childCount = Math.max(0, Number(snapshot.children ?? 0));
    const supplierIds = Array.from(
      new Set(
        orderedItems
          .map(({ item }) => this.getBookingServiceSupplierIdFromSnapshotItem(item))
          .filter((supplierId): supplierId is string => Boolean(supplierId)),
      ),
    );
    const supplierNamesById = supplierIds.length
      ? new Map(
          (
            await prismaClient.supplier.findMany({
              where: {
                id: {
                  in: supplierIds,
                },
              },
              select: {
                id: true,
                name: true,
              },
            })
          ).map((supplier) => [supplier.id, supplier.name]),
        )
      : new Map<string, string>();

    return orderedItems
      .filter(({ item }) => !item.optionId)
      .slice()
      .sort((left, right) => {
        const leftDay = left.item.itineraryId
          ? itineraryContextById.get(left.item.itineraryId)?.dayNumber ?? Number.MAX_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER;
        const rightDay = right.item.itineraryId
          ? itineraryContextById.get(right.item.itineraryId)?.dayNumber ?? Number.MAX_SAFE_INTEGER
          : Number.MAX_SAFE_INTEGER;

        if (leftDay !== rightDay) {
          return leftDay - rightDay;
        }

        return left.index - right.index;
      })
      .map(({ item }, index) => {
        const parsedQty = Number(item.quantity);
        const qty = Number.isFinite(parsedQty) && parsedQty > 0 ? Math.floor(parsedQty) : 1;
        const totalCost = Number((item.totalCost ?? 0).toFixed(2));
        const totalSell = Number((item.totalSell ?? 0).toFixed(2));
        const operationalDescription = item.service?.name?.trim() || '';
        const pricingDescription = item.pricingDescription?.trim() || '';
        const description = operationalDescription || pricingDescription || 'Quote service';
        const rawSupplierId = this.getBookingServiceSupplierIdFromSnapshotItem(item);
        const supplierName = rawSupplierId ? supplierNamesById.get(rawSupplierId) ?? null : null;
        const supplierId = supplierName ? rawSupplierId : null;
        const resolvedServiceDate = this.resolveQuoteItemServiceDateValue({
          explicitServiceDate:
            item.serviceDate || (item.itineraryId ? itineraryContextById.get(item.itineraryId)?.serviceDate ?? null : null),
          itineraryId: item.itineraryId,
          travelStartDate: snapshot.travelStartDate,
          itineraryContextById,
        });
        const serviceDate = resolvedServiceDate ? resolvedServiceDate.toISOString() : null;
        const normalizedServiceType = item.service?.category?.trim() || 'other';
        const normalizedCategory = normalizedServiceType.toLowerCase();
        const operationType = this.inferBookingOperationServiceType(normalizedCategory, item.service?.name);
        const isActivityService =
          normalizedCategory.includes('activity') ||
          normalizedCategory.includes('tour') ||
          normalizedCategory.includes('excursion') ||
          normalizedCategory.includes('experience') ||
          normalizedCategory.includes('sightseeing');
        const hasResolvedOperationalData = Boolean(supplierId || supplierName) && (totalCost > 0 || totalSell > 0);

        const resolvedAdultCount =
          isActivityService && item.adultCount !== undefined && item.adultCount !== null
            ? Math.max(0, Number(item.adultCount))
            : adultCount;
        const resolvedChildCount =
          isActivityService && item.childCount !== undefined && item.childCount !== null
            ? Math.max(0, Number(item.childCount))
            : childCount;
        const resolvedParticipantCount =
          isActivityService && item.participantCount !== undefined && item.participantCount !== null
            ? Math.max(0, Number(item.participantCount))
            : Math.max(0, resolvedAdultCount + resolvedChildCount);

        return {
          sourceQuoteItemId: item.id ?? null,
          serviceOrder: index,
          serviceType: normalizedServiceType,
          operationType,
          operationStatus: BookingOperationServiceStatus.PENDING,
          serviceDate,
          startTime: isActivityService ? item.startTime?.trim() || null : null,
          pickupTime: isActivityService ? item.pickupTime?.trim() || null : null,
          pickupLocation: isActivityService ? item.pickupLocation?.trim() || item.location?.trim() || null : null,
          meetingPoint: isActivityService ? item.meetingPoint?.trim() || null : null,
          participantCount: isActivityService ? resolvedParticipantCount : null,
          adultCount: isActivityService ? resolvedAdultCount : null,
          childCount: isActivityService ? resolvedChildCount : null,
          supplierReference: null,
          reconfirmationRequired: isActivityService ? Boolean(item.reconfirmationRequired) : false,
          reconfirmationDueAt:
            isActivityService && item.reconfirmationDueAt?.trim()
              ? item.reconfirmationDueAt.trim()
              : null,
          description,
          notes: pricingDescription && pricingDescription !== description ? pricingDescription : null,
          qty,
          unitCost: Number((totalCost / qty).toFixed(2)),
          unitSell: Number((totalSell / qty).toFixed(2)),
          totalCost,
          totalSell,
          supplierId,
          supplierName,
          status: hasResolvedOperationalData ? BookingServiceLifecycleStatus.ready : BookingServiceLifecycleStatus.pending,
          confirmationStatus: BookingServiceStatus.pending,
          confirmationNumber: null,
          confirmationNotes: null,
          confirmationRequestedAt: null,
          confirmationConfirmedAt: null,
        };
      });
  }

  private buildBookingDaysFromAcceptedVersion(snapshotJson: unknown) {
    const snapshot = (snapshotJson || {}) as {
      travelStartDate?: string | Date | null;
      nightCount?: number | null;
      itineraries?: Array<{
        dayNumber?: number | null;
        title?: string | null;
        description?: string | null;
        summary?: string | null;
        notes?: string | null;
        serviceDate?: string | Date | null;
      }>;
    };
    const travelStartDate = this.parseDateLike(snapshot.travelStartDate);
    const byDayNumber = new Map<number, { dayNumber: number; date: Date | null; title: string; notes: string | null; status: BookingDayStatus }>();

    for (const day of snapshot.itineraries || []) {
      const dayNumber = Math.max(1, Math.floor(Number(day.dayNumber || 1)));
      const explicitDate = this.parseDateLike(day.serviceDate);
      const date = explicitDate || (travelStartDate ? new Date(travelStartDate.getTime() + (dayNumber - 1) * 24 * 60 * 60 * 1000) : null);
      if (!byDayNumber.has(dayNumber)) {
        byDayNumber.set(dayNumber, {
          dayNumber,
          date,
          title: day.title?.trim() || `Day ${dayNumber}`,
          notes: day.notes?.trim() || day.description?.trim() || day.summary?.trim() || null,
          status: BookingDayStatus.PENDING,
        });
      }
    }

    const expectedDayCount = Math.max(byDayNumber.size, Math.max(1, Number(snapshot.nightCount || 0) + 1));
    for (let dayNumber = 1; dayNumber <= expectedDayCount; dayNumber += 1) {
      if (!byDayNumber.has(dayNumber)) {
        byDayNumber.set(dayNumber, {
          dayNumber,
          date: travelStartDate ? new Date(travelStartDate.getTime() + (dayNumber - 1) * 24 * 60 * 60 * 1000) : null,
          title: `Day ${dayNumber}`,
          notes: null,
          status: BookingDayStatus.PENDING,
        });
      }
    }

    return Array.from(byDayNumber.values()).sort((left, right) => left.dayNumber - right.dayNumber);
  }

  private getBookingServiceSupplierIdFromSnapshotItem(item: {
    service?: {
      supplierId?: string | null;
    } | null;
    hotel?: {
      supplierId?: string | null;
    } | null;
    appliedVehicleRate?: {
      vehicle?: {
        supplierId?: string | null;
      } | null;
    } | null;
  }) {
    return (
      item.service?.supplierId?.trim() ||
      item.hotel?.supplierId?.trim() ||
      item.appliedVehicleRate?.vehicle?.supplierId?.trim() ||
      null
    );
  }

  private inferBookingOperationServiceType(category?: string | null, serviceName?: string | null): BookingOperationServiceType {
    const normalized = `${category || ''} ${serviceName || ''}`.trim().toLowerCase();

    if (normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle')) {
      return BookingOperationServiceType.TRANSPORT;
    }

    if (normalized.includes('guide') || normalized.includes('escort')) {
      return BookingOperationServiceType.GUIDE;
    }

    if (normalized.includes('hotel') || normalized.includes('accommodation')) {
      return BookingOperationServiceType.HOTEL;
    }

    if (normalized.includes('external') || normalized.includes('package')) {
      return BookingOperationServiceType.EXTERNAL_PACKAGE;
    }

    return BookingOperationServiceType.ACTIVITY;
  }

  private assertQuoteWorkflowStateIsComplete(snapshotJson: unknown) {
    const snapshot = (snapshotJson || {}) as {
      adults?: number | null;
      children?: number | null;
      pricingMode?: string | null;
      pricingType?: string | null;
      fixedPricePerPerson?: number | null;
      pricingSlabs?: QuotePricingSlabInput[];
      travelStartDate?: string | Date | null;
      itineraries?: Array<{
        id?: string;
        dayNumber?: number | null;
      }>;
      quoteItems?: Array<{
        id?: string;
        quantity?: number | null;
        paxCount?: number | null;
        totalCost?: number | null;
        totalSell?: number | null;
        serviceDate?: string | Date | null;
        itineraryId?: string | null;
        startTime?: string | null;
        pickupTime?: string | null;
        pickupLocation?: string | null;
        meetingPoint?: string | null;
        participantCount?: number | null;
        adultCount?: number | null;
        childCount?: number | null;
        reconfirmationRequired?: boolean | null;
        reconfirmationDueAt?: string | null;
        service?: {
          name?: string | null;
          category?: string | null;
          serviceType?: {
            name?: string | null;
            code?: string | null;
          } | null;
        } | null;
      }>;
    };

    const totalPax = Math.max(0, Number(snapshot.adults ?? 0) + Number(snapshot.children ?? 0));

    if (totalPax <= 0) {
      throw new BadRequestException('Quote workflow requires at least one passenger before moving to Ready, Sent, or Accepted.');
    }

    const normalizedPricingMode = this.normalizeQuotePricingMode(
      snapshot.pricingMode,
      this.normalizeQuotePricingType(snapshot.pricingType),
    );

    if (normalizedPricingMode === 'SLAB') {
      this.quotePricingService.assertValidPricingConfig({
        mode: 'group',
        pricingSlabs: Array.isArray(snapshot.pricingSlabs) ? snapshot.pricingSlabs : [],
      });
    } else if (!Number.isFinite(Number(snapshot.fixedPricePerPerson ?? 0)) || Number(snapshot.fixedPricePerPerson ?? 0) < 0) {
      throw new BadRequestException('Quote workflow requires a valid fixed price per person.');
    }

    const quoteItems = snapshot.quoteItems ?? [];

    if (quoteItems.length === 0) {
      throw new BadRequestException('Quote workflow requires at least one priced quote item.');
    }

    const itineraryContextById = new Map(
      (snapshot.itineraries ?? [])
        .filter((day): day is { id: string; dayNumber: number } => Boolean(day.id) && Number.isFinite(day.dayNumber))
        .map((day) => [day.id, { dayNumber: day.dayNumber }]),
    );

    const invalidItems = quoteItems
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const quantity = Math.max(0, Number(item.quantity ?? 0));
        const paxCount = Math.max(0, Number(item.paxCount ?? 0));
        const hasPricing = Number(item.totalCost ?? 0) > 0 && Number(item.totalSell ?? 0) > 0;

        if (quantity <= 0 || paxCount <= 0 || !hasPricing) {
          return true;
        }

        const isActivity = this.isActivityService({
          category: item.service?.category?.trim() || 'other',
          serviceType: item.service?.serviceType
            ? {
                name: item.service.serviceType.name ?? '',
                code: item.service.serviceType.code ?? null,
              }
            : null,
        });

        if (!isActivity) {
          return false;
        }

        const resolvedServiceDate = this.resolveQuoteItemServiceDateValue({
          explicitServiceDate: item.serviceDate,
          itineraryId: item.itineraryId,
          travelStartDate: snapshot.travelStartDate,
          itineraryContextById,
        });
        const hasTime = Boolean(item.startTime?.trim() || item.pickupTime?.trim());
        const hasLocation = Boolean(item.pickupLocation?.trim() || item.meetingPoint?.trim());
        const participantCount = Number(item.participantCount ?? 0);
        const adultCount = Number(item.adultCount ?? 0);
        const childCount = Number(item.childCount ?? 0);
        const hasCounts = participantCount > 0 || adultCount + childCount > 0;
        const reconfirmationComplete = !item.reconfirmationRequired || Boolean(item.reconfirmationDueAt?.trim());

        return !(resolvedServiceDate && hasTime && hasLocation && hasCounts && reconfirmationComplete);
      });

    if (invalidItems.length > 0) {
      const labels = invalidItems
        .slice(0, 3)
        .map(({ item, index }) => item.service?.name?.trim() || `item ${index + 1}`)
        .join(', ');
      throw new BadRequestException(
        `Quote workflow is incomplete. Ensure each item has pricing and pax, and complete all activity dates, timing, location, participant counts, and reconfirmation due dates where required (${labels}).`,
      );
    }
  }

  private normalizeQuoteFocType(value: string | undefined | null): QuoteFocType {
    if (value === 'ratio') {
      return 'ratio';
    }

    if (value === 'fixed' || value === 'manual') {
      return 'fixed';
    }

    return 'none';
  }

  private normalizeQuoteFocRoomType(value: string | undefined | null): QuoteFocRoomType | null {
    return value === 'single' || value === 'double' ? value : null;
  }

  private normalizeQuoteFocConfig(values: {
    focType?: QuoteFocType | null;
    focRatio?: number | null;
    focCount?: number | null;
    focRoomType?: QuoteFocRoomType | null;
  }) {
    const focType = this.normalizeQuoteFocType(values.focType);
    const focRoomType = this.normalizeQuoteFocRoomType(values.focRoomType);

    if (focType === 'none') {
      return {
        focType,
        focRatio: null,
        focCount: null,
        focRoomType: null,
      };
    }

    if (!focRoomType) {
      throw new BadRequestException('FOC room type is required when FOC is enabled');
    }

    if (focType === 'ratio') {
      const focRatio = Number(values.focRatio);
      if (!Number.isFinite(focRatio) || focRatio <= 0) {
        throw new BadRequestException('FOC ratio must be greater than zero');
      }

      return {
        focType,
        focRatio: Number(focRatio.toFixed(2)),
        focCount: null,
        focRoomType,
      };
    }

    const focCount = Number(values.focCount);
    if (!Number.isFinite(focCount) || focCount < 0) {
      throw new BadRequestException('FOC count must be zero or greater');
    }

    return {
      focType,
      focRatio: null,
      focCount: Math.floor(focCount),
      focRoomType,
    };
  }

  private resolveQuoteFoc(values: {
    adults: number;
    children: number;
    focType: string;
    focRatio: number | null;
    focCount: number | null;
    focRoomType: string | null;
  }) {
    const totalPax = Math.max(0, values.adults + values.children);
    const focType = this.normalizeQuoteFocType(values.focType);
    const focRoomType = this.normalizeQuoteFocRoomType(values.focRoomType);

    if (focType === 'ratio') {
      const ratio = values.focRatio && values.focRatio > 0 ? values.focRatio : null;
      return {
        focType,
        focRatio: ratio,
        focCount: null,
        focRoomType,
        resolvedFocCount: ratio ? Math.floor(totalPax / ratio) : 0,
        resolvedFocRoomType: focRoomType,
      };
    }

    if (focType === 'fixed') {
      const count = Math.max(0, Math.floor(values.focCount ?? 0));
      return {
        focType,
        focRatio: null,
        focCount: count,
        focRoomType,
        resolvedFocCount: count,
        resolvedFocRoomType: focRoomType,
      };
    }

    return {
      focType: 'none' as QuoteFocType,
      focRatio: null,
      focCount: null,
      focRoomType: null,
      resolvedFocCount: 0,
      resolvedFocRoomType: null,
    };
  }

  private normalizePricingSlabInputs(slabs: QuotePricingSlabInput[]) {
    return slabs.map((slab) => this.normalizePricingSlabInput(slab));
  }

  private normalizeQuotePricingMode(value: string | undefined | null, pricingType?: QuotePricingType | null): QuotePricingMode {
    if (value === 'SLAB' || value === 'FIXED') {
      return value;
    }

    return pricingType === 'group' ? 'SLAB' : 'FIXED';
  }

  private normalizeFixedPricePerPerson(value: number | null | undefined) {
    if (value === null || value === undefined) {
      return 0;
    }

    const normalized = Number(value);

    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException('fixedPricePerPerson must be zero or greater');
    }

    return Number(normalized.toFixed(2));
  }

  private normalizePricingSlabInput(slab: QuotePricingSlabInput) {
    const minPax = Number.isFinite(Number(slab.minPax)) ? Math.floor(Number(slab.minPax)) : Number.NaN;
    const maxPax =
      slab.maxPax === null || slab.maxPax === undefined || `${slab.maxPax}`.trim() === ''
        ? null
        : Number.isFinite(Number(slab.maxPax))
          ? Math.floor(Number(slab.maxPax))
          : Number.NaN;
    const price = Number(slab.price);
    const focPax = slab.focPax === null || slab.focPax === undefined ? 0 : Math.floor(Number(slab.focPax));
    const notes = typeof slab.notes === 'string' ? slab.notes.trim() || null : null;

    if (!Number.isFinite(minPax) || (maxPax !== null && !Number.isFinite(maxPax))) {
      throw new BadRequestException('Pricing slab minPax and maxPax must be valid numbers');
    }

    if (!Number.isFinite(price) || price < 0) {
      throw new BadRequestException('Pricing slab price must be zero or greater');
    }

    if (!Number.isFinite(focPax) || focPax < 0) {
      throw new BadRequestException('Pricing slab focPax must be zero or greater');
    }

    return {
      minPax,
      maxPax,
      price: Number(price.toFixed(2)),
      focPax,
      notes,
    };
  }

  private async replaceQuotePricingSlabs(
    tx: Prisma.TransactionClient,
    quoteId: string,
    slabs: Array<{ minPax: number; maxPax: number | null; price: number; focPax?: number | null; notes?: string | null }>,
  ) {
    await tx.quotePricingSlab.deleteMany({
      where: { quoteId },
    });

    if (slabs.length === 0) {
      return;
    }

    await tx.quotePricingSlab.createMany({
      data: slabs.map((slab) => ({
        quoteId,
        minPax: slab.minPax,
        maxPax: slab.maxPax,
        price: slab.price,
        focPax: slab.focPax ?? 0,
        notes: slab.notes ?? null,
      })),
    });
  }

  private loadQuoteState(id: string, prismaClient: any = this.prisma, actor?: CompanyScopedActor) {
    const companyId = actor?.companyId?.trim() || null;
    return prismaClient.quote.findFirst({
      where: {
        id,
        ...(companyId ? { clientCompanyId: companyId } : {}),
      },
      include: {
        clientCompany: {
          include: {
            branding: true,
          },
        },
        brandCompany: {
          include: {
            branding: true,
          },
        },
        contact: true,
        agent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        pricingSlabs: {
          orderBy: [
            {
              minPax: 'asc',
            },
            {
              maxPax: 'asc',
            },
            {
              createdAt: 'asc',
            },
          ],
        },
        quoteItems: {
          where: {
            optionId: null,
          },
          include: {
            service: {
              include: {
                serviceType: true,
              },
            },
            itinerary: true,
            hotel: true,
            contract: true,
            roomCategory: true,
            appliedVehicleRate: {
              include: {
                vehicle: true,
                serviceType: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        itineraries: {
          include: {
            images: {
              include: {
                galleryImage: true,
              },
              orderBy: [
                {
                  sortOrder: 'asc',
                },
                {
                  id: 'asc',
                },
              ],
            },
          },
          orderBy: {
            dayNumber: 'asc',
          },
        },
        quoteOptions: {
          include: {
            hotelCategory: true,
            quoteItems: {
              include: {
                service: {
                  include: {
                    serviceType: true,
                  },
                },
                itinerary: true,
                hotel: true,
                contract: true,
                roomCategory: true,
                appliedVehicleRate: {
                  include: {
                    vehicle: true,
                    serviceType: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        scenarios: {
          orderBy: {
            paxCount: 'asc',
          },
        },
        invoice: true,
        booking: true,
      },
    } as any).then((quote: any) => {
      if (!quote) {
        return null;
      }

      return this.attachResolvedQuoteFields({
        ...quote,
        quoteOptions: quote.quoteOptions.map((option: any) => ({
          ...option,
          ...this.calculateOptionTotals(option, quote.adults + quote.children),
        })),
      });
    });
  }

  private attachResolvedQuoteFields<
    T extends {
      adults: number;
      children: number;
      focType: string;
      focRatio: number | null;
      focCount: number | null;
      focRoomType: string | null;
      pricingMode?: string | null;
      pricingType?: string | null;
      pricingSlabs?: Array<{
        id?: string;
        minPax: number;
        maxPax: number | null;
        price: number;
        actualPax?: number;
        focPax?: number;
        payingPax?: number;
        totalCost?: number;
        totalSell?: number;
        pricePerPayingPax?: number;
        pricePerActualPax?: number | null;
        notes?: string | null;
      }> | null;
      totalCost?: number | null;
      totalSell?: number | null;
      pricePerPax?: number | null;
      fixedPricePerPerson?: number | null;
      singleSupplement?: number | null;
      clientCompany?: unknown;
      brandCompany?: unknown;
      company?: unknown;
    },
  >(quote: T) {
    const priceComputation =
      quote.pricingType === undefined
        ? null
        : this.quotePricingService.computePriceResult({
            pricingMode: quote.pricingMode,
            pricingType: quote.pricingType,
            pricingSlabs: quote.pricingSlabs || [],
            totalCost: quote.totalCost ?? null,
            adults: quote.adults,
            children: quote.children,
            totalSell: quote.totalSell ?? null,
            pricePerPax: quote.pricePerPax ?? null,
            fixedPricePerPerson: quote.fixedPricePerPerson ?? null,
            singleSupplement: quote.singleSupplement ?? null,
            focType: quote.focType,
            focRatio: quote.focRatio,
            focCount: quote.focCount,
            focRoomType: quote.focRoomType,
          });

    return {
      ...quote,
      company: (quote.clientCompany ?? quote.company) as T extends { company: infer U } ? U : unknown,
      clientCompany: (quote.clientCompany ?? quote.company) as T extends { clientCompany: infer U } ? U : unknown,
      brandCompany: (quote.brandCompany ?? quote.clientCompany ?? quote.company) as T extends { brandCompany: infer U } ? U : unknown,
      ...(priceComputation?.foc || this.quotePricingService.calculateFoc(quote)),
      priceComputation,
      pricingMode: this.normalizeQuotePricingMode(quote.pricingMode, this.normalizeQuotePricingType(quote.pricingType)),
      currentPricing:
        priceComputation === null
          ? null
          : {
              pricingType: priceComputation.mode,
              pricingMode: priceComputation.mode === 'group' ? 'SLAB' : 'FIXED',
              paxCount: priceComputation.requestedPax,
              isAvailable: priceComputation.status === 'ok',
              label: priceComputation.display.summaryLabel,
              value: priceComputation.totals?.pricePerPayingPax ?? priceComputation.totals?.totalPrice ?? null,
              message: priceComputation.warnings[0] || null,
              matchedSlab: priceComputation.matchedSlab
                ? {
                    minPax: priceComputation.matchedSlab.minPax,
                    maxPax: priceComputation.matchedSlab.maxPax ?? priceComputation.matchedSlab.minPax,
                    price: priceComputation.matchedSlab.pricePerPayingPax,
                    label: priceComputation.matchedSlab.label,
                    actualPax: priceComputation.matchedSlab.actualPax,
                    focPax: priceComputation.matchedSlab.focPax,
                    payingPax: priceComputation.matchedSlab.payingPax,
                    totalCost: priceComputation.matchedSlab.totalCost,
                    totalSell: priceComputation.matchedSlab.totalSell,
                    pricePerPayingPax: priceComputation.matchedSlab.pricePerPayingPax,
                    pricePerActualPax: priceComputation.matchedSlab.pricePerActualPax,
                  }
                : null,
            },
    };
  }

  private async generateNextQuoteNumber(prismaClient: Prisma.TransactionClient | PrismaService) {
    const year = new Date().getUTCFullYear();
    const prefix = `Q-${year}-`;
    const latestQuote = await prismaClient.quote.findFirst({
      where: {
        quoteNumber: {
          startsWith: prefix,
        },
      },
      select: {
        quoteNumber: true,
      },
      orderBy: {
        quoteNumber: 'desc',
      },
    });
    const currentSequence = latestQuote?.quoteNumber ? Number(latestQuote.quoteNumber.slice(prefix.length)) : 0;
    const nextSequence = Number.isInteger(currentSequence) ? currentSequence + 1 : 1;

    return `${prefix}${String(nextSequence).padStart(4, '0')}`;
  }

  private async generateNextBookingRef(prismaClient: Prisma.TransactionClient | PrismaService) {
    const year = new Date().getUTCFullYear();
    const prefix = `BK-${year}-`;
    const latestBooking = await prismaClient.booking.findFirst({
      where: {
        bookingRef: {
          startsWith: prefix,
        },
      },
      select: {
        bookingRef: true,
      },
      orderBy: {
        bookingRef: 'desc',
      },
    });
    const currentSequence = latestBooking?.bookingRef ? Number(latestBooking.bookingRef.slice(prefix.length)) : 0;
    const nextSequence = Number.isInteger(currentSequence) ? currentSequence + 1 : 1;

    return `${prefix}${String(nextSequence).padStart(4, '0')}`;
  }

  private isQuoteNumberConflict(error: unknown) {
    const target = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta?.target : undefined;
    const normalizedTarget = Array.isArray(target) ? target.join(',') : String(target ?? '');

    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      normalizedTarget.includes('quoteNumber')
    );
  }

  private async drawProposalHeader(
    doc: PDFKit.PDFDocument,
    values: {
      brandName: string;
      title: string;
      subtitle: string;
      supportingMeta: string;
      clientName: string;
      dateLabel: string;
      quoteNumber: string | null;
      logoUrl: string | null;
      accentColor: string;
      accentSoftColor: string;
      dividerColor: string;
    },
  ) {
    this.ensurePageSpace(doc, 240);
    const startX = doc.page.margins.left;
    const topY = 34;
    const headerWidth = 500;
    const outerPaddingX = 22;
    const outerPaddingY = 24;
    const headerInnerWidth = headerWidth - outerPaddingX * 2;
    const logoColumnWidth = 118;
    const logoBoxWidth = 112;
    const logoBoxHeight = 72;
    const logoX = startX + outerPaddingX;
    const logoY = topY + outerPaddingY + 6;
    const hasLogo = Boolean(values.logoUrl);
    const headerRows = [
      { label: 'Client', value: values.clientName },
      { label: 'Date', value: values.dateLabel },
      { label: 'Reference', value: values.quoteNumber || 'To be confirmed' },
    ];
    const titleX = logoX + logoColumnWidth + 18;
    const titleWidth = startX + headerWidth - outerPaddingX - titleX;
    const titleLayout = this.getHeaderTitleLayout(doc, values.title, titleWidth);
    const brandLabelHeight = doc.font('Helvetica-Bold').fontSize(10).heightOfString(values.subtitle.toUpperCase(), {
      width: titleWidth,
      characterSpacing: 0.9,
    });
    const supportingMetaHeight = doc.font('Helvetica').fontSize(9.5).heightOfString(values.supportingMeta.toUpperCase(), {
      width: titleWidth,
      characterSpacing: 0.8,
      lineGap: 2,
    });
    const titleBlockHeight = brandLabelHeight + 8 + titleLayout.height + 10 + supportingMetaHeight;
    const topRowHeight = Math.max(logoBoxHeight + 28, titleBlockHeight);
    const metaCardWidth = headerInnerWidth;
    const metaCardPaddingX = 12;
    const metaCardPaddingY = 14;
    const metaCardX = startX + outerPaddingX;
    const metaCardY = topY + outerPaddingY + topRowHeight + 20;
    const metaX = metaCardX + metaCardPaddingX;
    const metaWidth = metaCardWidth - metaCardPaddingX * 2;
    const metaCardHeight =
      this.measureHeaderInfoTableHeight(doc, {
        width: metaWidth,
        rows: headerRows,
      }) +
      metaCardPaddingY * 2;
    const mastheadHeight = outerPaddingY + topRowHeight + 20 + metaCardHeight + outerPaddingY;
    const brandTextWidth = logoColumnWidth;

    doc.save();
    doc.roundedRect(startX, topY, headerWidth, mastheadHeight, 24).fill('#fbf8f3');
    doc.rect(startX, topY, headerWidth, 8).fill(values.accentColor);
    doc.roundedRect(metaCardX, metaCardY, metaCardWidth, metaCardHeight, 16).fill('#ffffff');
    doc
      .roundedRect(metaCardX, metaCardY, metaCardWidth, metaCardHeight, 16)
      .lineWidth(0.8)
      .stroke(values.dividerColor);
    if (hasLogo) {
      doc.roundedRect(logoX, logoY, logoBoxWidth, logoBoxHeight, 14).fill(values.accentSoftColor);
    }
    doc.restore();

    if (hasLogo && values.logoUrl) {
      try {
        const imageBuffer = await this.loadPdfImageBuffer(values.logoUrl);
        doc.image(imageBuffer, logoX + 12, logoY + 10, {
          fit: [logoBoxWidth - 24, logoBoxHeight - 20],
        });
      } catch (error) {
        doc.fontSize(8).fillColor(values.accentColor).text(values.brandName.toUpperCase(), logoX + 12, logoY + 26, {
          width: logoBoxWidth - 24,
          align: 'center',
          characterSpacing: 0.8,
        });
      }
    }

    const leftStartY = topY + outerPaddingY;
    doc.x = titleX;
    doc.y = leftStartY;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(values.accentColor).text(values.subtitle.toUpperCase(), {
      width: titleWidth,
      characterSpacing: 0.9,
    });
    this.addVerticalSpace(doc, 8);
    doc.font('Helvetica-Bold').fontSize(titleLayout.fontSize).fillColor('#1f1a17');
    doc.text(values.title, {
      width: titleWidth,
      lineGap: titleLayout.lineGap,
      lineBreak: titleLayout.maxLines > 1,
    });
    doc.font('Helvetica');
    this.addVerticalSpace(doc, 10);
    doc.fontSize(9.5).fillColor('#766c61').text(values.supportingMeta.toUpperCase(), {
      width: titleWidth,
      characterSpacing: 0.8,
      lineGap: 2,
    });
    const leftEndY = Math.max(doc.y, topY + outerPaddingY + topRowHeight);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(values.accentColor).text(values.brandName.toUpperCase(), logoX, logoY + logoBoxHeight + 12, {
      width: brandTextWidth,
      align: 'center',
      characterSpacing: 0.6,
    });

    doc.x = metaX;
    doc.y = metaCardY + metaCardPaddingY;
    this.drawHeaderInfoTable(doc, {
      x: metaX,
      y: metaCardY + metaCardPaddingY,
      width: metaWidth,
      rows: headerRows,
      dividerColor: values.dividerColor,
    });
    const rightEndY = doc.y + 6;
    const headerBottomY = Math.max(leftEndY, rightEndY, topY + mastheadHeight + 18);

    doc.x = doc.page.margins.left;
    doc.y = headerBottomY;
    this.drawSoftDivider(doc, values.dividerColor);
    return headerBottomY;
  }

  private async drawCover(
    doc: PDFKit.PDFDocument,
    values: {
      brandName: string;
      title: string;
      destination: string;
      clientName: string;
      tripDates: string;
      subtitle: string;
      proposalDate: string;
      quoteReference: string;
      logoUrl: string | null;
      accentColor: string;
      accentSoftColor: string;
      dividerColor: string;
    },
  ) {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;
    const panelY = 110;
    const panelHeight = 440;

    doc.save();
    doc.rect(0, 0, pageWidth, pageHeight).fill('#fffdf9');
    doc.rect(0, 0, pageWidth, 14).fill(values.accentColor);
    doc
      .roundedRect(left, panelY, contentWidth, panelHeight, 28)
      .fill('#fbf8f2');
    doc
      .roundedRect(left, panelY + 262, contentWidth, 128, 22)
      .fill(values.accentSoftColor);
    doc
      .roundedRect(left + contentWidth - 120, 56, 64, 64, 16)
      .fill(values.accentSoftColor);
    doc.restore();

    if (values.logoUrl) {
      try {
        const imageBuffer = await this.loadPdfImageBuffer(values.logoUrl);
        doc.image(imageBuffer, left + contentWidth - 110, 66, {
          fit: [44, 44],
          align: 'center',
          valign: 'center',
        });
      } catch (error) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(values.accentColor).text(values.brandName.toUpperCase(), left + contentWidth - 112, 84, {
          width: 48,
          align: 'center',
          characterSpacing: 0.6,
        });
      }
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor(values.accentColor).text(values.brandName.toUpperCase(), left, 60, {
      width: 240,
      characterSpacing: 1.2,
    });
    doc.font('Helvetica').fontSize(9).fillColor('#8a7f72').text(values.quoteReference, left, 78, {
      width: 220,
    });

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(values.accentColor).text('TRAVEL PROPOSAL', left + 28, panelY + 38, {
      width: contentWidth - 56,
      characterSpacing: 1.6,
    });
    doc.font('Helvetica').fontSize(10).fillColor('#7d7266').text(values.destination.toUpperCase(), left + 28, panelY + 66, {
      width: contentWidth - 56,
      characterSpacing: 1,
    });
    doc.font('Helvetica-Bold').fontSize(34).fillColor('#1f1a17').text(values.title, left + 28, panelY + 106, {
      width: contentWidth - 56,
      lineGap: 3,
    });
    const subtitleY = doc.y + 18;
    doc.font('Helvetica').fontSize(10.5).fillColor('#5f5a52').text(values.subtitle, left + 28, subtitleY, {
      width: contentWidth - 56,
      lineGap: 3,
    });
    doc
      .strokeColor(values.dividerColor)
      .lineWidth(0.8)
      .moveTo(left + 28, subtitleY + 44)
      .lineTo(right - 28, subtitleY + 44)
      .stroke();

    const infoY = panelY + 326;
    const columnWidth = (contentWidth - 84) / 3;
    const infoColumns = [
      {
        label: 'Presented For',
        value: values.clientName,
      },
      {
        label: 'Trip Dates',
        value: values.tripDates,
      },
      {
        label: 'Proposal Date',
        value: values.proposalDate,
      },
    ];

    infoColumns.forEach((column, index) => {
      const columnX = left + 28 + index * (columnWidth + 14);
      doc.font('Helvetica').fontSize(7.6).fillColor('#8c857d').text(column.label.toUpperCase(), columnX, infoY, {
        width: columnWidth,
        characterSpacing: 1.1,
      });
      doc.font('Helvetica-Bold').fontSize(12.6).fillColor('#1f1a17').text(column.value, columnX, infoY + 20, {
        width: columnWidth,
        lineGap: 2,
      });
    });

    doc
      .strokeColor(values.dividerColor)
      .lineWidth(1)
      .moveTo(left + 28, panelY + panelHeight - 34)
      .lineTo(right - 28, panelY + panelHeight - 34)
      .stroke();

    doc.font('Helvetica').fontSize(10).fillColor('#6b655d').text(
      'Prepared for your review with a clear journey outline, itinerary highlights, and investment summary.',
      left + 28,
      panelY + panelHeight - 22,
      {
        width: contentWidth - 56,
        lineGap: 3,
      },
    );
  }

  private drawPageHeader(
    doc: PDFKit.PDFDocument,
    values: {
      brandName: string;
      quoteReference: string;
      accentColor: string;
      dividerColor: string;
    },
  ) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const topY = 28;
    const previousX = doc.x;
    const previousY = doc.y;
    const brandName = this.truncatePdfSingleLine(doc, values.brandName.toUpperCase(), 220, 'Helvetica-Bold', 9, 0.9);
    const quoteReference = this.truncatePdfSingleLine(doc, values.quoteReference, 180, 'Helvetica', 8.5);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(values.accentColor).text(brandName, left, topY, {
      width: 220,
      lineBreak: false,
      characterSpacing: 0.9,
    });
    doc.font('Helvetica').fontSize(8.5).fillColor('#7a7064').text(quoteReference, right - 180, topY, {
      width: 180,
      align: 'right',
      lineBreak: false,
    });
    doc
      .strokeColor(values.dividerColor)
      .lineWidth(0.8)
      .moveTo(left, topY + 18)
      .lineTo(right, topY + 18)
      .stroke();
    doc.x = previousX;
    doc.y = previousY;
  }

  private addPageWithChrome(
    doc: PDFKit.PDFDocument,
    values: {
      brandName: string;
      footerText?: string | null;
      details: string[];
      accentColor: string;
      dividerColor: string;
      quoteReference: string;
    },
    pageNumber: number,
  ) {
    this.startNewPage(doc, `legacy-chrome:${pageNumber}`);
    this.drawPageHeader(doc, {
      brandName: values.brandName,
      quoteReference: values.quoteReference,
      accentColor: values.accentColor,
      dividerColor: values.dividerColor,
    });
    this.drawFooter(doc, {
      companyName: values.brandName,
      footerText: values.footerText,
      details: values.details,
      accentColor: values.accentColor,
      dividerColor: values.dividerColor,
      quoteReference: values.quoteReference,
      pageNumber,
    });
    doc.x = doc.page.margins.left;
    doc.y = doc.page.margins.top;
  }

  private startNewPage(doc: PDFKit.PDFDocument, reason: string) {
    console.info('[quote-pdf] startNewPage', {
      template: 'legacy',
      reason,
    });
    doc.addPage();
  }

  private drawSummary(
    doc: PDFKit.PDFDocument,
    values: {
      title: string;
      summary: string;
      accentColor: string;
      dividerColor: string;
      blocks: Array<{
        label: string;
        value: string;
        helper?: string | null;
      }>;
    },
  ) {
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const gap = 12;
    const columnWidth = (pageWidth - gap) / 2;
    const summaryHeight = doc.font('Helvetica').fontSize(10.2).heightOfString(values.summary, {
      width: pageWidth,
      lineGap: 3,
    });
    const rowHeights: number[] = [];

    for (let index = 0; index < values.blocks.length; index += 2) {
      const row = values.blocks.slice(index, index + 2);
      rowHeights.push(Math.max(...row.map((block) => this.measureSummaryBlockHeight(doc, {
        width: columnWidth,
        label: block.label,
        value: block.value,
        helper: block.helper || null,
      }))));
    }

    const rowGap = 8;
    const sectionHeight =
      24 + summaryHeight + 10 + rowHeights.reduce((total, height) => total + height, 0) + Math.max(0, rowHeights.length - 1) * rowGap + 2;
    this.ensureSpace(doc, sectionHeight);

    this.writeProposalSectionTitle(doc, values.title, values.accentColor);
    doc.font('Helvetica').fontSize(10.2).fillColor('#5f5a52').text(values.summary, doc.page.margins.left, doc.y, {
      width: pageWidth,
      lineGap: 3,
    });
    this.addVerticalSpace(doc, 10);

    for (let index = 0; index < values.blocks.length; index += 2) {
      const row = values.blocks.slice(index, index + 2);
      const rowHeight = rowHeights[Math.floor(index / 2)];
      const rowTop = doc.y;

      row.forEach((block, rowIndex) => {
        this.drawSummaryBlock(doc, {
          x: doc.page.margins.left + rowIndex * (columnWidth + gap),
          y: rowTop,
          width: columnWidth,
          height: rowHeight,
          label: block.label,
          value: block.value,
          helper: block.helper || null,
          accentColor: values.accentColor,
          dividerColor: values.dividerColor,
        });
      });

      doc.y = rowTop + rowHeight + rowGap;
    }

    this.addVerticalSpace(doc, 2);
  }

  private drawDayCard(
    doc: PDFKit.PDFDocument,
    values: {
      dayNumber: number;
      city: string;
      title: string;
      overview?: string | null;
      services: Array<{
        eyebrow: string;
        title: string;
        description?: string | null;
      }>;
      accentColor: string;
      accentSoftColor: string;
      dividerColor: string;
    },
  ) {
    const startX = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const outerSpacingTop = 6;
    const outerSpacingBottom = 18;
    const padding = 13;
    const bodyX = startX + padding;
    const bodyWidth = width - padding * 2;
    const services = values.services.length > 0
      ? values.services
      : [{ eyebrow: 'Program', title: 'Program details', description: this.getProposalItineraryPlaceholder() }];
    const dayTitle = `Day ${String(values.dayNumber).padStart(2, '0')} - ${values.title}`;
    const titleHeight = doc.font('Helvetica-Bold').fontSize(14.4).heightOfString(dayTitle, {
      width: bodyWidth,
      lineGap: 1,
    });
    const cityHeight = doc.font('Helvetica-Bold').fontSize(7.6).heightOfString(values.city.toUpperCase(), {
      width: bodyWidth,
      characterSpacing: 1,
    });
    const overviewHeight = values.overview
      ? doc.font('Helvetica').fontSize(8.4).heightOfString(values.overview, {
          width: bodyWidth,
          lineGap: 1,
        })
      : 0;
    const serviceWidth = width - padding * 2;
    const serviceHeights = services.map((service) => this.measureServiceBlockHeight(doc, {
      width: serviceWidth,
      eyebrow: service.eyebrow,
      title: service.title,
      description: service.description,
    }));
    const serviceAreaHeight = serviceHeights.reduce((total, height) => total + height, 0) + Math.max(0, services.length - 1) * 4;
    const headerHeight = Math.max(42, cityHeight + titleHeight + (overviewHeight ? overviewHeight + 7 : 0) + 10);
    const cardHeight = padding * 2 + headerHeight + 9 + serviceAreaHeight;
    const pageCapacity = Math.max(0, (doc.page.height - doc.page.margins.bottom) - doc.page.margins.top);

    if (cardHeight + outerSpacingTop + outerSpacingBottom >= pageCapacity) {
      this.drawSplitDayCard(doc, {
        ...values,
        services,
        headerHeight,
        cityHeight,
        titleHeight,
        bodyX,
        bodyWidth,
        outerSpacingTop,
        outerSpacingBottom,
        padding,
        startX,
        width,
        serviceWidth,
        serviceHeights,
      });
      return;
    }

    this.ensureSpace(doc, cardHeight + outerSpacingTop + outerSpacingBottom);
    const cardTop = doc.y + outerSpacingTop;

    doc.save();
    doc.roundedRect(startX, cardTop, width, cardHeight, 20).fill('#fcfaf6');
    doc.roundedRect(startX, cardTop, width, 6, 3).fill(values.accentColor);
    doc.restore();

    const headerTop = cardTop + padding;
    doc.font('Helvetica-Bold').fontSize(7.6).fillColor(values.accentColor).text(values.city.toUpperCase(), bodyX, headerTop + 1, {
      width: bodyWidth,
      characterSpacing: 1,
    });
    doc.font('Helvetica-Bold').fontSize(14.4).fillColor('#1f1a17').text(dayTitle, bodyX, headerTop + 12, {
      width: bodyWidth,
      lineGap: 1,
    });
    if (values.overview) {
      doc.font('Helvetica').fontSize(8.4).fillColor('#5f5a52').text(values.overview, bodyX, headerTop + 12 + titleHeight + 4, {
        width: bodyWidth,
        lineGap: 1,
      });
    }

    let currentY = cardTop + padding + headerHeight;
    doc
      .strokeColor(values.dividerColor)
      .lineWidth(0.8)
      .moveTo(startX + padding, currentY)
      .lineTo(startX + width - padding, currentY)
      .stroke();
    currentY += 7;

    services.forEach((service, index) => {
      this.drawServiceBlock(doc, {
        x: startX + padding,
        y: currentY,
        width: serviceWidth,
        eyebrow: service.eyebrow,
        title: service.title,
        description: service.description,
        accentColor: values.accentColor,
        accentSoftColor: values.accentSoftColor,
        dividerColor: values.dividerColor,
      });
      currentY += serviceHeights[index] + 3;
    });

    doc.y = cardTop + cardHeight + outerSpacingBottom;
  }

  private drawSplitDayCard(
    doc: PDFKit.PDFDocument,
    values: {
      dayNumber: number;
      city: string;
      title: string;
      overview?: string | null;
      services: Array<{
        eyebrow: string;
        title: string;
        description?: string | null;
      }>;
      accentColor: string;
      accentSoftColor: string;
      dividerColor: string;
      headerHeight: number;
      cityHeight: number;
      titleHeight: number;
      bodyX: number;
      bodyWidth: number;
      outerSpacingTop: number;
      outerSpacingBottom: number;
      padding: number;
      startX: number;
      width: number;
      serviceWidth: number;
      serviceHeights: number[];
    },
  ) {
    const dayTitleBase = `Day ${String(values.dayNumber).padStart(2, '0')} - ${values.title}`;

    const renderHeader = (continued: boolean) => {
      const dayTitle = continued ? `${dayTitleBase} (continued)` : dayTitleBase;
      const overviewHeight = !continued && values.overview
        ? doc.font('Helvetica').fontSize(8.4).heightOfString(values.overview, {
            width: values.bodyWidth,
            lineGap: 1,
          })
        : 0;
      const titleHeight = doc.font('Helvetica-Bold').fontSize(14.4).heightOfString(dayTitle, {
        width: values.bodyWidth,
        lineGap: 1,
      });
      const headerHeight = Math.max(42, values.cityHeight + titleHeight + (overviewHeight ? overviewHeight + 7 : 0) + 10);
      const cardHeight = values.padding * 2 + headerHeight;

      this.ensureSpace(doc, cardHeight + values.outerSpacingTop + 10);
      const cardTop = doc.y + values.outerSpacingTop;

      doc.save();
      doc.roundedRect(values.startX, cardTop, values.width, cardHeight, 20).fill('#fcfaf6');
      doc.roundedRect(values.startX, cardTop, values.width, 6, 3).fill(values.accentColor);
      doc.restore();

      const headerTop = cardTop + values.padding;
      doc.font('Helvetica-Bold').fontSize(7.6).fillColor(values.accentColor).text(values.city.toUpperCase(), values.bodyX, headerTop + 1, {
        width: values.bodyWidth,
        characterSpacing: 1,
      });
      doc.font('Helvetica-Bold').fontSize(14.4).fillColor('#1f1a17').text(dayTitle, values.bodyX, headerTop + 12, {
        width: values.bodyWidth,
        lineGap: 1,
      });

      if (!continued && values.overview) {
        doc.font('Helvetica').fontSize(8.4).fillColor('#5f5a52').text(values.overview, values.bodyX, headerTop + 12 + titleHeight + 4, {
          width: values.bodyWidth,
          lineGap: 1,
        });
      }

      doc.y = cardTop + cardHeight + 8;
    };

    renderHeader(false);

    values.services.forEach((service, index) => {
      const blockHeight = values.serviceHeights[index];
      this.ensureSpace(doc, blockHeight + 8);

      if (doc.y <= doc.page.margins.top + 12 && index > 0) {
        renderHeader(true);
      }

      this.drawServiceBlock(doc, {
        x: values.startX + values.padding,
        y: doc.y,
        width: values.serviceWidth,
        eyebrow: service.eyebrow,
        title: service.title,
        description: service.description,
        accentColor: values.accentColor,
        accentSoftColor: values.accentSoftColor,
        dividerColor: values.dividerColor,
      });

      doc.y += blockHeight + 4;
    });

    doc.y += values.outerSpacingBottom - 4;
  }

  private drawServiceBlock(
    doc: PDFKit.PDFDocument,
    values: {
      x: number;
      y: number;
      width: number;
      eyebrow: string;
      title: string;
      description?: string | null;
      accentColor: string;
      accentSoftColor: string;
      dividerColor: string;
    },
  ) {
    const height = this.measureServiceBlockHeight(doc, {
      width: values.width,
      eyebrow: values.eyebrow,
      title: values.title,
      description: values.description,
    });

    doc.save();
    doc.roundedRect(values.x, values.y, values.width, height, 14).fill('#fffdfa');
    doc.restore();

    const contentX = values.x + 14;
    const contentWidth = values.width - 28;
    let currentY = values.y + 8;
    const detailRows = this.parseServiceBlockDetailRows(values.description);

    doc.font('Helvetica').fontSize(7.1).fillColor('#8c857d').text(values.eyebrow.toUpperCase(), contentX, currentY, {
      width: contentWidth,
      characterSpacing: 1.1,
    });
    currentY += 14;

    doc.font('Helvetica-Bold').fontSize(10.8).fillColor('#1f1a17').text(values.title, contentX, currentY, {
      width: contentWidth,
      lineGap: 2,
    });
    currentY = doc.y + 6;

    if (detailRows.length > 0) {
      currentY = this.drawServiceBlockDetailRows(doc, {
        x: contentX,
        y: currentY,
        width: contentWidth,
        rows: detailRows,
      });
    } else if (values.description) {
      doc.font('Helvetica').fontSize(8.4).fillColor('#635c54').text(values.description, contentX, currentY, {
        width: contentWidth,
        lineGap: 2,
      });
    }
  }

  private getHeaderTitleLayout(doc: PDFKit.PDFDocument, title: string, width: number) {
    let fontSize = 26;
    const minFontSize = 18;
    const maxLines = 2;
    let height = 0;
    let lineGap = 3;

    while (fontSize >= minFontSize) {
      lineGap = fontSize >= 24 ? 3 : 2;
      height = doc.font('Helvetica-Bold').fontSize(fontSize).heightOfString(title, {
        width,
        lineGap,
      });
      const lineHeight = doc.currentLineHeight() + lineGap;

      if (height <= lineHeight * maxLines + 1) {
        break;
      }

      fontSize -= 1;
    }

    doc.font('Helvetica');
    return {
      fontSize,
      height,
      lineGap,
      maxLines,
    };
  }

  private drawHeaderInfoTable(
    doc: PDFKit.PDFDocument,
    values: {
      x: number;
      y: number;
      width: number;
      rows: Array<{
        label: string;
        value: string;
      }>;
      dividerColor: string;
    },
  ) {
    const labelWidth = 108;
    const valueGap = 10;
    const valueWidth = values.width - labelWidth - valueGap;
    let currentY = values.y;

    for (const [index, row] of values.rows.entries()) {
      const valueLayout = this.getHeaderInfoValueLayout(doc, row, valueWidth);
      const labelLineHeight = doc.font('Helvetica-Bold').fontSize(7.5).currentLineHeight();
      const rowHeight = Math.max(24, valueLayout.height + 8);
      const labelY = currentY + (rowHeight - labelLineHeight) / 2;
      const valueY = currentY + (rowHeight - valueLayout.height) / 2;

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#8c857d').text(row.label.toUpperCase(), values.x, labelY, {
        width: labelWidth,
        characterSpacing: 0.5,
        lineBreak: false,
      });
      doc.font('Helvetica-Bold').fontSize(valueLayout.fontSize).fillColor('#1f1a17').text(
        row.value,
        values.x + labelWidth + valueGap,
        valueY,
        {
          width: valueWidth,
          align: 'left',
          lineGap: 2,
          height: valueLayout.height,
          lineBreak: valueLayout.maxLines !== 1,
        },
      );

      const rowBottomY = currentY + rowHeight;
      currentY = rowBottomY + 12;

      if (index < values.rows.length - 1) {
        doc
          .strokeColor(values.dividerColor)
          .lineWidth(0.6)
          .moveTo(values.x, currentY - 6)
          .lineTo(values.x + values.width, currentY - 6)
          .stroke();
      }
    }

    doc.font('Helvetica');
    doc.y = currentY;
  }

  private measureHeaderInfoTableHeight(
    doc: PDFKit.PDFDocument,
    values: {
      width: number;
      rows: Array<{
        label: string;
        value: string;
      }>;
    },
  ) {
    const labelWidth = 108;
    const valueGap = 10;
    const valueWidth = values.width - labelWidth - valueGap;
    let totalHeight = 0;

    for (const [index, row] of values.rows.entries()) {
      const valueLayout = this.getHeaderInfoValueLayout(doc, row, valueWidth);
      totalHeight += Math.max(24, valueLayout.height + 8);

      if (index < values.rows.length - 1) {
        totalHeight += 12;
      }
    }

    doc.font('Helvetica');
    return totalHeight;
  }

  private getHeaderInfoValueLayout(
    doc: PDFKit.PDFDocument,
    row: {
      label: string;
      value: string;
    },
    width: number,
  ) {
    const isClientRow = row.label.toUpperCase() === 'CLIENT';
    const maxLines = isClientRow ? 2 : 1;
    let fontSize = isClientRow ? 10 : 9.6;
    const minFontSize = isClientRow ? 8.6 : 8.6;
    let height = 0;

    while (fontSize >= minFontSize) {
      height = doc.font('Helvetica-Bold').fontSize(fontSize).heightOfString(row.value, {
        width,
        lineGap: 2,
      });
      const lineHeight = doc.currentLineHeight() + 2;
      if (height <= lineHeight * maxLines + 0.5) {
        break;
      }

      fontSize -= 0.2;
    }

    doc.font('Helvetica');
    return {
      fontSize,
      height,
      maxLines,
    };
  }

  private writeProposalSectionTitle(doc: PDFKit.PDFDocument, title: string, accentColor = '#8f7a55') {
    this.ensureSpace(doc, 42);
    doc.x = doc.page.margins.left;
    doc.save();
    doc.roundedRect(doc.page.margins.left, doc.y + 7, 28, 3, 2).fill(accentColor);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#1f1a17').text(title, doc.page.margins.left + 52, doc.y, {
      width: 454,
    });
    doc.font('Helvetica');
    this.addVerticalSpace(doc, 10);
    this.drawSoftDivider(doc, '#ece3d7');
    this.addVerticalSpace(doc, 8);
    doc.x = doc.page.margins.left;
  }

  private writeProposalSectionDivider(doc: PDFKit.PDFDocument, color = '#ece3d7', topSpacing = 8, bottomSpacing = 14) {
    this.ensureSpace(doc, topSpacing + bottomSpacing + 4);
    this.addVerticalSpace(doc, topSpacing);
    this.drawSoftDivider(doc, color);
    this.addVerticalSpace(doc, bottomSpacing);
    doc.x = doc.page.margins.left;
  }

  private measureSummaryBlockHeight(
    doc: PDFKit.PDFDocument,
    values: {
      width: number;
      label: string;
      value: string;
      helper?: string | null;
    },
  ) {
    const innerWidth = values.width - 32;
    const labelHeight = doc.font('Helvetica').fontSize(7.1).heightOfString(values.label.toUpperCase(), {
      width: innerWidth,
      characterSpacing: 1.1,
    });
    const valueHeight = doc.font('Helvetica-Bold').fontSize(16.2).heightOfString(values.value, {
      width: innerWidth,
      lineGap: 3,
    });
    const helperHeight = values.helper
      ? doc.font('Helvetica').fontSize(8.6).heightOfString(values.helper, {
          width: innerWidth,
          lineGap: 2,
        })
      : 0;

    return 18 + labelHeight + 8 + valueHeight + (helperHeight ? helperHeight + 12 : 0) + 16;
  }

  private drawSummaryBlock(
    doc: PDFKit.PDFDocument,
    values: {
      x: number;
      y: number;
      width: number;
      height: number;
      label: string;
      value: string;
      helper?: string | null;
      accentColor: string;
      dividerColor: string;
    },
  ) {
    doc.save();
    doc.roundedRect(values.x, values.y, values.width, values.height, 18).fill('#fcfaf6');
    doc.roundedRect(values.x, values.y, values.width, 4, 2).fill(values.accentColor);
    doc
      .roundedRect(values.x, values.y, values.width, values.height, 18)
      .lineWidth(0.8)
      .stroke(values.dividerColor);
    doc.restore();

    const innerX = values.x + 16;
    const innerWidth = values.width - 32;
    let currentY = values.y + 14;
    doc.font('Helvetica').fontSize(7.1).fillColor('#8c857d').text(values.label.toUpperCase(), innerX, currentY, {
      width: innerWidth,
      characterSpacing: 1.1,
    });
    currentY = doc.y + 6;
    doc.font('Helvetica-Bold').fontSize(16.2).fillColor('#1f1a17').text(values.value, innerX, currentY, {
      width: innerWidth,
      lineGap: 3,
    });
    if (values.helper) {
      currentY = doc.y + 8;
      doc.font('Helvetica').fontSize(8.6).fillColor('#6b655d').text(values.helper, innerX, currentY, {
        width: innerWidth,
        lineGap: 2,
      });
    }
  }

  private drawPriceSummary(
    doc: PDFKit.PDFDocument,
    values: {
      label: string;
      value: string;
      contextLines: string[];
      notes: string[];
      accentColor: string;
      accentSoftColor: string;
      dividerColor: string;
    },
  ) {
    const rowHeight = Math.max(values.contextLines.length, 1) * 16;
    const noteHeight = Math.max(values.notes.length, 1) * 14;
    const cardHeight = 194 + rowHeight + noteHeight;
    this.ensureSpace(doc, cardHeight + 14);
    doc.x = doc.page.margins.left;
    const startX = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const cardTop = doc.y;
    const innerX = startX + 22;
    const innerWidth = width - 44;
    let currentY = cardTop + 20;

    doc.save();
    doc.roundedRect(startX, cardTop, width, cardHeight, 18).fill('#fcfaf6');
    doc.roundedRect(innerX, cardTop + 24, innerWidth, 112, 16).fill(values.accentSoftColor);
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(11).fillColor(values.accentColor).text('PRICE PER PERSON', innerX, currentY, {
      width: innerWidth,
      align: 'center',
      characterSpacing: 1.1,
    });
    doc.font('Helvetica');
    currentY += 20;
    doc.font('Helvetica-Bold').fontSize(34).fillColor('#1f1a17').text(values.value, innerX, currentY, {
      width: innerWidth,
      align: 'center',
      lineGap: 2,
    });
    doc.font('Helvetica');
    currentY = doc.y + 6;
    doc.fontSize(10).fillColor('#6b655d').text('per person', innerX, currentY, {
      width: innerWidth,
      align: 'center',
      characterSpacing: 0.5,
    });
    currentY = cardTop + 156;

    for (const contextLine of values.contextLines) {
      doc.fontSize(10).fillColor('#5f5a52').text(contextLine, innerX, currentY, {
        width: innerWidth,
        lineGap: 2,
      });
      currentY = doc.y + 4;
    }

    if (values.notes.length > 0) {
      currentY += 6;
      doc
        .strokeColor(values.dividerColor)
        .lineWidth(1)
        .moveTo(innerX, currentY)
        .lineTo(innerX + innerWidth, currentY)
        .stroke();
      currentY += 10;
    }

    for (const note of values.notes) {
      doc.fontSize(9.5).fillColor('#6b655d').text(note, innerX, currentY, {
        width: innerWidth,
        lineGap: 3,
      });
      currentY = doc.y + 4;
    }

    doc.y = cardTop + cardHeight + 10;
  }

  private drawGroupPriceSummary(
    doc: PDFKit.PDFDocument,
    values: {
      label: string;
      selectedValue: string;
      entries: Array<{
        label: string;
        value: string;
        isSelected?: boolean;
      }>;
      contextLines: string[];
      notes: string[];
      accentColor: string;
      accentSoftColor: string;
      dividerColor: string;
    },
  ) {
    const entryHeight = Math.max(values.entries.length, 1) * 28;
    const contextHeight = Math.max(values.contextLines.length, 1) * 14;
    const noteHeight = Math.max(values.notes.length, 1) * 14;
    const cardHeight = 238 + entryHeight + contextHeight + noteHeight;

    this.ensureSpace(doc, cardHeight + 16);
    doc.x = doc.page.margins.left;
    const startX = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const cardTop = doc.y;
    const innerX = startX + 22;
    const innerWidth = width - 44;
    let currentY = cardTop + 20;

    doc.save();
    doc.roundedRect(startX, cardTop, width, cardHeight, 18).fill('#fcfaf6');
    doc.roundedRect(innerX, currentY + 10, innerWidth, 110, 16).fill(values.accentSoftColor);
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(11).fillColor(values.accentColor).text('PRICE PER PERSON', innerX, currentY, {
      width: innerWidth,
      align: 'center',
      characterSpacing: 1.1,
    });
    doc.font('Helvetica');
    currentY += 20;

    doc.font('Helvetica-Bold').fontSize(34).fillColor('#1f1a17').text(values.selectedValue, innerX, currentY, {
      width: innerWidth,
      align: 'center',
      lineGap: 2,
    });
    doc.font('Helvetica');
    currentY = doc.y + 6;
    doc.fontSize(10).fillColor('#6b655d').text('per person', innerX, currentY, {
      width: innerWidth,
      align: 'center',
      characterSpacing: 0.5,
    });
    currentY += 22;

    for (const contextLine of values.contextLines) {
      doc.fontSize(10).fillColor('#5f5a52').text(contextLine, innerX, currentY, {
        width: innerWidth,
        lineGap: 2,
        align: 'center',
      });
      currentY = doc.y + 4;
    }

    currentY += 8;

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(values.accentColor).text('Group Pricing', innerX, currentY, {
      width: innerWidth,
      characterSpacing: 0.6,
    });
    currentY += 14;

    doc.save();
    doc.roundedRect(innerX, currentY, innerWidth, 28, 10).fill(values.accentColor);
    doc.roundedRect(innerX, currentY + 28, innerWidth, entryHeight + 14, 12).fill('#f7f1e7');
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff').text('Guests', innerX + 16, currentY + 10, {
      width: 180,
      characterSpacing: 0.8,
    });
    doc.text('Price per person', innerX + 210, currentY + 10, {
      width: innerWidth - 226,
      align: 'right',
      characterSpacing: 0.8,
    });
    currentY += 34;

    for (const entry of values.entries) {
      if (entry.isSelected) {
        doc.save();
        doc.roundedRect(innerX + 8, currentY - 4, innerWidth - 16, 24, 8).fill(values.accentSoftColor);
        doc.restore();
      }

      doc
        .font(entry.isSelected ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(10.5)
        .fillColor('#1f1a17')
        .text(`${entry.label}${entry.isSelected ? '  ACTIVE' : ''}`, innerX + 16, currentY, {
        width: 180,
      });
      doc
        .font(entry.isSelected ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(11)
        .fillColor('#1f1a17')
        .text(entry.value, innerX + 210, currentY, {
          width: innerWidth - 226,
          align: 'right',
        });
      doc
        .strokeColor('#e3d8c8')
        .lineWidth(1)
        .moveTo(innerX + 16, currentY + 22)
        .lineTo(innerX + innerWidth - 16, currentY + 22)
        .stroke();
      doc.font('Helvetica');
      currentY += 28;
    }

    currentY += 10;

    if (values.notes.length > 0) {
      currentY += 6;
      doc
        .strokeColor(values.dividerColor)
        .lineWidth(1)
        .moveTo(innerX, currentY)
        .lineTo(innerX + innerWidth, currentY)
        .stroke();
      currentY += 12;
    }

    for (const note of values.notes) {
      doc.fontSize(9.5).fillColor('#6b655d').text(note, innerX, currentY, {
        width: innerWidth,
        lineGap: 3,
      });
      currentY = doc.y + 4;
    }

    doc.y = cardTop + cardHeight + 10;
  }

  private drawAccommodationSummary(
    doc: PDFKit.PDFDocument,
    values: {
      rows: Array<{
        city: string;
        hotelName: string;
        roomType: string | null;
        nights: number;
      }>;
      accentColor: string;
      accentSoftColor: string;
      dividerColor: string;
    },
  ) {
    const headerHeight = 34;
    const rowGap = 8;
    const columnWidths = [94, 182, 100, 48];
    const bodyHeight =
      values.rows.length > 0
        ? values.rows.reduce((total, row) => total + this.getAccommodationRowHeight(doc, row, columnWidths), 0) +
          (values.rows.length - 1) * rowGap +
          16
        : 20;
    const tableHeight = headerHeight + 12 + bodyHeight;
    const cardHeight = tableHeight + 28;

    this.ensurePageSpace(doc, cardHeight + 24);
    doc.x = doc.page.margins.left;
    const startX = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const cardTop = doc.y;
    const innerX = startX + 22;
    const innerWidth = width - 44;
    const tablePaddingX = 16;
    let currentY = cardTop + 20;

    doc.save();
    doc.roundedRect(startX, cardTop, width, cardHeight, 18).fill('#fcfaf6');
    doc.restore();

    doc.save();
    doc.roundedRect(innerX, currentY, innerWidth, headerHeight, 10).fill(values.accentColor);
    doc.roundedRect(innerX, currentY + headerHeight, innerWidth, bodyHeight, 12).fill(values.accentSoftColor);
    doc.restore();

    const columnX = [
      innerX + tablePaddingX,
      innerX + tablePaddingX + columnWidths[0],
      innerX + tablePaddingX + columnWidths[0] + columnWidths[1],
      innerX + tablePaddingX + columnWidths[0] + columnWidths[1] + columnWidths[2],
    ];

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#ffffff');
    doc.text('CITY', columnX[0], currentY + 12, {
      width: columnWidths[0],
      characterSpacing: 1,
    });
    doc.text('HOTEL', columnX[1], currentY + 12, {
      width: columnWidths[1],
      characterSpacing: 1,
    });
    doc.text('ROOM', columnX[2], currentY + 12, {
      width: columnWidths[2],
      characterSpacing: 1,
    });
    doc.text('NIGHTS', columnX[3], currentY + 12, {
      width: columnWidths[3],
      align: 'right',
      characterSpacing: 1,
    });
    currentY += headerHeight + 8;

    for (const row of values.rows) {
      const rowHeight = this.getAccommodationRowHeight(doc, row, columnWidths);
      doc.save();
      doc.roundedRect(innerX + 8, currentY - 4, innerWidth - 16, rowHeight + 8, 8).fill('#fffdfa');
      doc.restore();

      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#1f1a17').text(row.city, columnX[0], currentY, {
        width: columnWidths[0],
        lineGap: 2,
      });
      doc.font('Helvetica').fontSize(10.5).fillColor('#1f1a17').text(row.hotelName, columnX[1], currentY, {
        width: columnWidths[1],
        lineGap: 2,
      });
      doc.fillColor('#5f5a52').text(row.roomType || 'To be confirmed', columnX[2], currentY, {
        width: columnWidths[2],
        lineGap: 2,
      });
      doc.fillColor('#1f1a17').text(String(row.nights), columnX[3], currentY, {
        width: columnWidths[3],
        align: 'right',
      });
      doc
        .strokeColor(values.dividerColor)
        .lineWidth(0.6)
        .moveTo(innerX + 16, currentY + rowHeight + 4)
        .lineTo(innerX + innerWidth - 16, currentY + rowHeight + 4)
        .stroke();
      currentY += rowHeight + rowGap;
    }

    doc.y = cardTop + cardHeight + 18;
  }

  private drawFooter(
    doc: PDFKit.PDFDocument,
    values: {
      companyName: string;
      footerText?: string | null;
      details: string[];
      accentColor: string;
      dividerColor: string;
      quoteReference: string;
      pageNumber: number;
    },
  ) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const footerTop = doc.page.height - doc.page.margins.bottom + 6;
    const previousX = doc.x;
    const previousY = doc.y;
    const details = [values.footerText, ...values.details].filter((value): value is string => Boolean(value?.trim())).join(' | ');
    const companyName = this.truncatePdfSingleLine(doc, values.companyName.toUpperCase(), 126, 'Helvetica-Bold', 8.6, 0.8);
    const footerDetails = this.truncatePdfSingleLine(
      doc,
      details,
      Math.max(120, right - left - 232),
      'Helvetica',
      8.3,
    );
    const pageLabel = this.truncatePdfSingleLine(doc, `${values.quoteReference}  |  Page ${values.pageNumber}`, 150, 'Helvetica', 8.2);

    doc
      .strokeColor(values.dividerColor)
      .lineWidth(0.7)
      .moveTo(left, footerTop - 8)
      .lineTo(right, footerTop - 8)
      .stroke();
    doc.font('Helvetica-Bold').fontSize(8.6).fillColor(values.accentColor).text(companyName, left, footerTop, {
      width: 126,
      lineBreak: false,
      characterSpacing: 0.8,
    });
    doc.font('Helvetica').fontSize(8.3).fillColor('#6b655d').text(footerDetails, left + 152, footerTop, {
      width: Math.max(120, right - left - 232),
      lineBreak: false,
      lineGap: 2,
    });
    doc.font('Helvetica').fontSize(8.2).fillColor('#7a7064').text(pageLabel, right - 150, footerTop, {
      width: 150,
      align: 'right',
      lineBreak: false,
    });
    doc.x = previousX;
    doc.y = previousY;
  }

  private drawSoftDivider(doc: PDFKit.PDFDocument, color = '#eee6da') {
    const y = doc.y;
    doc
      .strokeColor(color)
      .lineWidth(1)
      .moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.width - doc.page.margins.right, y)
      .stroke();
  }

  private writeBulletLine(doc: PDFKit.PDFDocument, text: string, description?: string | null, accentColor = '#8f7a55') {
    this.ensurePageSpace(doc, description ? 34 : 18);
    const bulletX = doc.page.margins.left + 4;
    const textX = doc.page.margins.left + 16;
    const y = doc.y;
    doc.fontSize(10).fillColor(accentColor).text('\u2022', bulletX, y);
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#3b352f').text(text, textX, y, {
      width: 484,
      lineGap: 2,
    });
    doc.font('Helvetica');
    if (description) {
      doc.fontSize(9.5).fillColor('#6b655d').text(description, textX, doc.y + 1, {
        width: 484,
        lineGap: 2,
      });
    }
    doc.moveDown(0.35);
  }

  private writeItineraryEntry(doc: PDFKit.PDFDocument, title?: string | null, description?: string | null, accentColor = '#8f7a55') {
    const finalTitle = title?.trim() || null;
    const finalDescription = description?.trim() || null;

    if (!finalTitle && !finalDescription) {
      return;
    }

    this.ensurePageSpace(doc, 70);
    const startX = doc.page.margins.left;
    const y = doc.y;
    const titleHeight = finalTitle
      ? doc.heightOfString(finalTitle, {
          width: 452,
          lineGap: 2,
        })
      : 0;
    const descriptionHeight = finalDescription
      ? doc.heightOfString(finalDescription, {
          width: 452,
          lineGap: 3,
        })
      : 0;
    const cardHeight = 24 + titleHeight + descriptionHeight;

    doc.save();
    doc.roundedRect(startX, y, 500, cardHeight, 14).fill('#faf7f2');
    doc.roundedRect(startX, y, 6, cardHeight, 3).fill(accentColor);
    doc.restore();

    if (finalTitle) {
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#2b2622').text(finalTitle, startX + 20, y + 12, {
        width: 452,
        lineGap: 2,
      });
    }
    doc.font('Helvetica');

    if (finalDescription) {
      doc.fontSize(10).fillColor('#6b655d').text(finalDescription, startX + 20, doc.y + (finalTitle ? 3 : 12), {
        width: 452,
        lineGap: 3,
      });
    }

    doc.y = y + cardHeight + 10;
  }

  private drawItineraryDayHeader(
    doc: PDFKit.PDFDocument,
    values: {
      dayNumber: number;
      city: string;
      accentColor: string;
      accentSoftColor: string;
    },
  ) {
    const dayLabel = `DAY ${values.dayNumber} \u2013 ${values.city}`;
    const titleHeight = doc.heightOfString(dayLabel, {
      width: 368,
      lineGap: 2,
    });
    const blockHeight = 48 + titleHeight;
    const startY = doc.y;

    doc.save();
    doc.roundedRect(doc.page.margins.left, startY, 500, blockHeight, 18).fill('#fcfaf6');
    doc.roundedRect(doc.page.margins.left + 16, startY + 16, 468, blockHeight - 32, 14).fill(values.accentSoftColor);
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(15.5).fillColor('#1f1a17').text(dayLabel, doc.page.margins.left + 32, startY + 25, {
      width: 436,
      lineGap: 2,
    });

    doc.y = startY + blockHeight + 14;
  }

  private addVerticalSpace(doc: PDFKit.PDFDocument, amount: number) {
    doc.y += amount;
  }

  private measureServiceBlockHeight(
    doc: PDFKit.PDFDocument,
    values: {
      width: number;
      eyebrow: string;
      title: string;
      description?: string | null;
    },
  ) {
    const innerWidth = values.width - 28;
    const detailRows = this.parseServiceBlockDetailRows(values.description);
    const eyebrowHeight = doc.font('Helvetica').fontSize(7.1).heightOfString(values.eyebrow.toUpperCase(), {
      width: innerWidth,
      characterSpacing: 1.1,
    });
    const titleHeight = doc.font('Helvetica-Bold').fontSize(10.8).heightOfString(values.title, {
      width: innerWidth,
      lineGap: 2,
    });
    const descriptionHeight = detailRows.length > 0
      ? this.measureServiceBlockDetailRowsHeight(doc, {
          width: innerWidth,
          rows: detailRows,
        })
      : values.description
      ? doc.font('Helvetica').fontSize(8.4).heightOfString(values.description, {
          width: innerWidth,
          lineGap: 2,
        })
      : 0;

    return 10 + eyebrowHeight + 8 + titleHeight + (descriptionHeight ? descriptionHeight + 8 : 0) + 10;
  }

  private parseServiceBlockDetailRows(description?: string | null) {
    const parts = (description || '')
      .split(' | ')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0 || parts.some((part) => !part.includes(':'))) {
      return [];
    }

    return parts
      .map((part) => {
        const [label, ...valueParts] = part.split(':');
        const value = valueParts.join(':').trim();
        return {
          label: label.trim(),
          value,
        };
      })
      .filter((row) => row.label && row.value);
  }

  private measureServiceBlockDetailRowsHeight(
    doc: PDFKit.PDFDocument,
    values: {
      width: number;
      rows: Array<{
        label: string;
        value: string;
      }>;
    },
  ) {
    return values.rows.reduce((total, row, index) => {
      const labelHeight = doc.font('Helvetica').fontSize(6.9).heightOfString(row.label.toUpperCase(), {
        width: values.width,
        characterSpacing: 1,
      });
      const valueHeight = doc.font('Helvetica-Bold').fontSize(8.7).heightOfString(row.value, {
        width: values.width,
        lineGap: 1,
      });

      return total + labelHeight + 2 + valueHeight + (index < values.rows.length - 1 ? 6 : 0);
    }, 0);
  }

  private drawServiceBlockDetailRows(
    doc: PDFKit.PDFDocument,
    values: {
      x: number;
      y: number;
      width: number;
      rows: Array<{
        label: string;
        value: string;
      }>;
    },
  ) {
    let currentY = values.y;

    for (const [index, row] of values.rows.entries()) {
      doc.font('Helvetica').fontSize(6.9).fillColor('#8c857d').text(row.label.toUpperCase(), values.x, currentY, {
        width: values.width,
        characterSpacing: 1,
      });
      currentY = doc.y + 2;
      doc.font('Helvetica-Bold').fontSize(8.7).fillColor('#1f1a17').text(row.value, values.x, currentY, {
        width: values.width,
        lineGap: 1,
      });
      currentY = doc.y + (index < values.rows.length - 1 ? 6 : 0);
    }

    return currentY;
  }

  private buildPdfDayActivities(
    dayItems: Array<{
      quantity: number;
      baseCost: number;
      overrideCost: number | null;
      useOverride: boolean;
      currency: string;
      pricingDescription: string | null;
      service: {
        supplierId: string;
        name: string;
        category: string;
      };
      seasonName: string | null;
      occupancyType: HotelOccupancyType | null;
      mealPlan: HotelMealPlan | null;
      appliedVehicleRate: {
        routeName: string;
        vehicle: {
          name: string;
        };
        serviceType: {
          name: string;
        };
      } | null;
      hotel: {
        name: string;
      } | null;
      contract: {
        name: string;
      } | null;
      roomCategory: {
        name: string;
      } | null;
    }>,
    itineraryTitle?: string | null,
  ) {
    const activitiesByTitle = new Map<string, { name: string; description: string | null }>();

    dayItems
      .filter((item) => !this.isHotelService(item.service))
      .map((item) => this.getDayActivityDetails(item, itineraryTitle))
      .forEach((activity) => {
        const key = this.normalizeComparisonText(activity.name);
        if (!key) {
          return;
        }

        const existing = activitiesByTitle.get(key);
        if (!existing) {
          activitiesByTitle.set(key, activity);
          return;
        }

        if (!existing.description && activity.description) {
          activitiesByTitle.set(key, activity);
        }
      });

    return Array.from(activitiesByTitle.values());
  }

  private buildProposalDayServiceBlocks(
    dayItems: Array<{
      quantity: number;
      baseCost: number;
      overrideCost: number | null;
      useOverride: boolean;
      currency: string;
      pricingDescription: string | null;
      service: {
        supplierId: string;
        name: string;
        category: string;
      };
      seasonName: string | null;
      occupancyType: HotelOccupancyType | null;
      mealPlan: HotelMealPlan | null;
      appliedVehicleRate: {
        routeName: string;
        vehicle: {
          name: string;
        };
        serviceType: {
          name: string;
        };
      } | null;
      hotel: {
        name: string;
      } | null;
      contract: {
        name: string;
      } | null;
      roomCategory: {
        name: string;
      } | null;
    }>,
    itineraryTitle?: string | null,
  ) {
    const blocks: Array<{
      eyebrow: string;
      title: string;
      description?: string | null;
    }> = [];
    const seen = new Set<string>();

    const pushBlock = (block: { eyebrow: string; title: string; description?: string | null }) => {
      const key = `${this.normalizeComparisonText(block.eyebrow)}|${this.normalizeComparisonText(block.title)}|${this.normalizeComparisonText(block.description || '')}`;
      if (!key || seen.has(key)) {
        return;
      }

      seen.add(key);
      blocks.push(block);
    };

    for (const item of dayItems.filter((entry) => this.isHotelService(entry.service))) {
      const title = this.cleanAccommodationCell(item.hotel?.name || item.service.name) || 'Hotel to be confirmed';
      const details = [
        item.roomCategory?.name ? `Room: ${this.cleanAccommodationCell(item.roomCategory.name)}` : null,
        item.mealPlan ? `Meals: ${String(item.mealPlan).toUpperCase()}` : null,
        !item.roomCategory?.name && item.occupancyType ? `Occupancy: ${String(item.occupancyType).toUpperCase()}` : null,
      ].filter((value): value is string => Boolean(value));

      pushBlock({
        eyebrow: 'Stay',
        title,
        description: details.length > 0 ? details.join(' | ') : 'Accommodation details to be confirmed.',
      });
    }

    for (const activity of this.buildPdfDayActivities(dayItems, itineraryTitle)) {
      pushBlock({
        eyebrow: 'Service',
        title: activity.name,
        description: activity.description,
      });
    }

    return blocks;
  }

  private buildPdfDayActivitySummary(
    dayItems: Array<{
      quantity: number;
      baseCost: number;
      overrideCost: number | null;
      useOverride: boolean;
      currency: string;
      pricingDescription: string | null;
      service: {
        supplierId: string;
        name: string;
        category: string;
      };
      seasonName: string | null;
      occupancyType: HotelOccupancyType | null;
      mealPlan: HotelMealPlan | null;
      appliedVehicleRate: {
        routeName: string;
        vehicle: {
          name: string;
        };
        serviceType: {
          name: string;
        };
      } | null;
      hotel: {
        name: string;
      } | null;
      contract: {
        name: string;
      } | null;
      roomCategory: {
        name: string;
      } | null;
    }>,
    itineraryTitle?: string | null,
  ) {
    const activities = this.buildPdfDayActivities(dayItems, itineraryTitle);
    if (activities.length === 0) {
      return null;
    }

    const [primaryActivity, ...otherActivities] = activities;
    const seenDescriptions = new Set<string>();
    const descriptionParts: string[] = [];

    const pushDescription = (value?: string | null) => {
      const cleaned = this.ensureSingleSentence((value || '').trim());
      const normalized = this.normalizeComparisonText(cleaned);
      if (!normalized || seenDescriptions.has(normalized)) {
        return;
      }

      if (!primaryActivity || this.normalizeComparisonText(primaryActivity.name) !== normalized) {
        seenDescriptions.add(normalized);
        descriptionParts.push(cleaned);
      }
    };

    pushDescription(primaryActivity.description);
    for (const activity of otherActivities) {
      pushDescription(activity.description);
    }

    return {
      name: primaryActivity.name,
      description: descriptionParts.length > 0 ? descriptionParts.join(' ') : null,
    };
  }

  private buildPdfAccommodationRows(
    sortedDays: Array<{
      id: string;
      dayNumber: number;
      title: string;
    }>,
    quoteItems: Array<{
      itineraryId: string | null;
      service: {
        name: string;
        category: string;
      };
      hotel: {
        name: string;
      } | null;
      roomCategory: {
        name: string;
      } | null;
    }>,
  ) {
    const rows: Array<{
      city: string;
      hotelName: string;
      roomType: string | null;
      nights: number;
      lastDayNumber: number;
    }> = [];

    for (const day of sortedDays) {
      const city = this.getProposalDayCity(day.title, day.dayNumber);
      const dayRows = quoteItems
        .filter((item) => item.itineraryId === day.id && this.isHotelService(item.service))
        .map((item) => ({
          city,
          hotelName: this.cleanAccommodationCell(item.hotel?.name || item.service.name) || 'Hotel to be confirmed',
          roomType: this.cleanAccommodationCell(item.roomCategory?.name || '') || null,
        }))
        .filter((row, index, list) => {
          const key = `${row.city}|${row.hotelName}|${row.roomType || ''}`;
          return list.findIndex((candidate) => `${candidate.city}|${candidate.hotelName}|${candidate.roomType || ''}` === key) === index;
        });

      if (dayRows.length !== 1) {
        for (const row of dayRows) {
          rows.push({
            ...row,
            nights: 1,
            lastDayNumber: day.dayNumber,
          });
        }
        continue;
      }

      const row = dayRows[0];
      const lastRow = rows[rows.length - 1];
      const isConsecutiveMatch =
        Boolean(lastRow) &&
        lastRow.city === row.city &&
        lastRow.hotelName === row.hotelName &&
        lastRow.roomType === row.roomType &&
        lastRow.lastDayNumber === day.dayNumber - 1;

      if (isConsecutiveMatch && lastRow) {
        lastRow.nights += 1;
        lastRow.lastDayNumber = day.dayNumber;
      } else {
        rows.push({
          ...row,
          nights: 1,
          lastDayNumber: day.dayNumber,
        });
      }
    }

    return rows.map(({ lastDayNumber, ...row }) => row);
  }

  private getDayActivityDetails(item: {
    quantity: number;
    baseCost: number;
    overrideCost: number | null;
    useOverride: boolean;
    currency: string;
    pricingDescription: string | null;
    service: {
      supplierId: string;
      name: string;
      category: string;
    };
    seasonName: string | null;
    occupancyType: HotelOccupancyType | null;
    mealPlan: HotelMealPlan | null;
    appliedVehicleRate: {
      routeName: string;
      vehicle: {
        name: string;
      };
      serviceType: {
        name: string;
      };
    } | null;
    hotel: {
      name: string;
    } | null;
    contract: {
      name: string;
    } | null;
    roomCategory: {
      name: string;
    } | null;
  }, itineraryTitle?: string | null) {
    const importedDetails = this.getImportedServiceDisplay(item.service.name, item.pricingDescription, item.service.supplierId);
    const rawDetail = this.cleanActivityDetailText(importedDetails?.description || this.getItemSummary(item));
    const rawName = this.getClientFacingActivityTitle({
      importedName: importedDetails?.name || null,
      detail: rawDetail,
      itineraryTitle: itineraryTitle || null,
      category: item.service.category,
    });
    const fallbackTitle = this.getActivityCategoryFallback(item.service.category, itineraryTitle || null);
    const name = this.cleanActivityTitle(rawName) || this.cleanActivityTitle(fallbackTitle);
    const description = this.cleanActivityDescription(rawDetail, name);

    return {
      name,
      description,
    };
  }

  private buildInclusions(
    items: Array<{
      service: {
        category: string;
      };
    }>,
  ) {
    const categoryLabels = new Map<string, string>([
      ['hotel', 'Accommodation as outlined in the itinerary'],
      ['transport', 'Private transport and transfers as programmed'],
      ['activity', 'Scheduled touring and destination experiences'],
      ['guide', 'Guiding and on-ground assistance where indicated'],
      ['meal', 'Meals specifically mentioned in the program'],
    ]);
    const labels = new Set<string>();

    for (const item of items) {
      const label = categoryLabels.get(item.service.category.toLowerCase());
      if (label) {
        labels.add(label);
      }
    }

    if (labels.size === 0) {
      labels.add('Accommodation and touring as per the confirmed itinerary');
      labels.add('Ground transport and logistics as programmed');
    }

    return Array.from(labels);
  }

  private buildExclusions() {
    return [
      'International flights',
      'Personal expenses and discretionary spending',
      'Tips, porterage, and items not specifically listed as included',
    ];
  }

  private normalizeSupportText(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private parseSupportTextList(value: string | null | undefined) {
    const normalized = this.normalizeSupportText(value);

    if (!normalized) {
      return null;
    }

    return normalized
      .split(/\r?\n/)
      .map((line) => line.replace(/^[\s*-]+/, '').trim())
      .filter((line) => Boolean(line));
  }

  private formatDate(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);

    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  private getProposalTravelDateLabel(value: Date | string | null | undefined, nightCount: number) {
    const travelStart = value ? new Date(value) : null;
    if (!travelStart || Number.isNaN(travelStart.getTime())) {
      return 'Travel dates to be advised';
    }

    const travelEnd = new Date(travelStart);
    travelEnd.setUTCDate(travelEnd.getUTCDate() + Math.max(nightCount, 0));

    return `${this.formatDate(travelStart)} - ${this.formatDate(travelEnd)}`;
  }

  private truncatePdfSingleLine(
    doc: PDFKit.PDFDocument,
    value: string,
    width: number,
    font: string,
    fontSize: number,
    characterSpacing = 0,
  ) {
    const text = `${value || ''}`.replace(/\s+/g, ' ').trim();
    if (!text) {
      return '';
    }

    doc.font(font).fontSize(fontSize);
    if (doc.widthOfString(text, { characterSpacing }) <= width) {
      return text;
    }

    const ellipsis = '...';
    let end = text.length;

    while (end > 1) {
      const candidate = `${text.slice(0, end).trim()}${ellipsis}`;
      if (doc.widthOfString(candidate, { characterSpacing }) <= width) {
        return candidate;
      }

      end -= 1;
    }

    return ellipsis;
  }

  private getItemSummary(item: {
    quantity: number;
    baseCost: number;
    overrideCost: number | null;
    useOverride: boolean;
    currency: string;
    pricingDescription: string | null;
    seasonName: string | null;
    occupancyType: HotelOccupancyType | null;
    mealPlan: HotelMealPlan | null;
    appliedVehicleRate: {
      routeName: string;
      vehicle: {
        name: string;
      };
      serviceType: {
        name: string;
      };
    } | null;
    hotel: {
      name: string;
    } | null;
    contract: {
      name: string;
    } | null;
    roomCategory: {
      name: string;
    } | null;
  }) {
    if (item.hotel && item.contract && item.seasonName && item.roomCategory && item.occupancyType && item.mealPlan) {
      return `${item.hotel.name} | ${item.contract.name} | ${item.seasonName} | ${item.roomCategory.name} | ${item.occupancyType} / ${item.mealPlan}`;
    }

    if (item.appliedVehicleRate) {
      return `${item.appliedVehicleRate.routeName} | ${item.appliedVehicleRate.vehicle.name} | ${item.appliedVehicleRate.serviceType.name}`;
    }

    return item.pricingDescription || '';
  }

  private getProposalTitle(
    quoteTitle: string,
    sortedDays: Array<{
      title: string;
    }>,
  ) {
    const destination = this.extractProposalDestination(quoteTitle) || this.extractProposalDestination(sortedDays[0]?.title || '');
    return destination ? `${destination} Journey` : 'Travel Proposal';
  }

  private buildProposalSummary(values: {
    quoteTitle: string;
    quoteDescription: string | null;
    sortedDays: Array<{
      title: string;
      description?: string | null;
    }>;
    totalPax: number;
    nightCount: number;
  }) {
    const dayCount = Math.max(values.sortedDays.length, values.nightCount + 1 || 0, 1);
    const destination =
      this.extractProposalDestination(values.quoteTitle) ||
      this.summarizeDestinations(values.sortedDays.map((day) => day.title).filter(Boolean));
    const rawDescription = this.cleanProposalText(values.quoteDescription?.trim() || '');
    const guestCountLabel = this.formatGuestCountLabel(values.totalPax);
    if (this.isValidTripSummary(rawDescription)) {
      return rawDescription;
    }

    return destination
      ? `A ${dayCount}-day journey through ${destination} for ${guestCountLabel}, with accommodation, transport, and touring arranged throughout.`
      : `A ${dayCount}-day journey for ${guestCountLabel}, with accommodation, transport, and touring arranged throughout.`;
  }

  private isValidTripSummary(value: string) {
    if (!value || value.length < MIN_TRIP_SUMMARY_LENGTH) {
      return false;
    }

    return !INVALID_TRIP_SUMMARY_PATTERNS.some((pattern) => pattern.test(value));
  }

  private summarizeDestinations(destinations: string[]) {
    const cleaned = Array.from(
      new Set(
        destinations
          .map((destination) => this.extractProposalDestination(destination))
          .filter((destination): destination is string => Boolean(destination)),
      ),
    );

    if (cleaned.length === 0) {
      return '';
    }

    if (cleaned.length === 1) {
      return cleaned[0];
    }

    if (cleaned.length === 2) {
      return `${cleaned[0]} and ${cleaned[1]}`;
    }

    return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}`;
  }

  private extractProposalDestination(value: string) {
    const cleaned = value
      .replace(/^Imported itinerary:\s*/i, '')
      .replace(/\b(?:demo|test)\b/gi, '')
      .replace(/\b(?:revision requested|draft|ready|sent|accepted|confirmed|cancelled|expired)\b/gi, '')
      .replace(/\bquote\b/gi, '')
      .replace(/\bexperience\b$/i, '')
      .replace(/\bjourney\b$/i, '')
      .replace(/^Day\s+\d+\s*[:\-]\s*/i, '')
      .replace(/[–-]\s*$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return cleaned || '';
  }

  private getImportedServiceDisplay(serviceName: string, pricingDescription: string | null, supplierId: string) {
    if (supplierId !== IMPORTED_SERVICE_SUPPLIER_ID) {
      return null;
    }

    const parts = (pricingDescription || '')
      .split(' | ')
      .map((part) => part.trim())
      .filter(Boolean);

    const fallbackName = this.cleanProposalText(serviceName.replace(/^Imported\s+/i, '').trim() || serviceName);
    const name = this.cleanProposalText(parts[0] || fallbackName);
    const descriptions = parts
      .slice(1)
      .map((part) => part.replace(/^Description:\s*/i, '').replace(/^Notes:\s*/i, '').trim())
      .filter(Boolean);

    return {
      name,
      description: descriptions.join('. '),
    };
  }

  private getClientFacingActivityTitle(values: {
    importedName: string | null;
    detail: string;
    itineraryTitle: string | null;
    category: string;
  }) {
    const importedName = this.cleanProposalText(values.importedName || '');
    if (importedName && this.isClientFacingActivityName(importedName)) {
      return importedName;
    }

    const detailTitle = this.extractActivityTitleFromDetail(values.detail);
    if (detailTitle) {
      return detailTitle;
    }

    return this.getActivityCategoryFallback(values.category, values.itineraryTitle);
  }

  private extractActivityTitleFromDetail(detail: string) {
    const cleaned = this.cleanProposalText(detail);
    if (!cleaned) {
      return '';
    }

    const firstSegment = cleaned
      .split(/[|,.:;]/)
      .map((part) => part.trim())
      .find(Boolean);

    if (!firstSegment) {
      return '';
    }

    if (this.looksLikeInternalActivityName(firstSegment)) {
      return '';
    }

    return this.toClientTitleCase(firstSegment);
  }

  private isClientFacingActivityName(value: string) {
    return !this.looksLikeInternalActivityName(value);
  }

  private looksLikeInternalActivityName(value: string) {
    const cleaned = value.trim();
    if (!cleaned) {
      return true;
    }

    if (this.isPlaceholderActivityLabel(cleaned)) {
      return true;
    }

    if (/[|]/.test(cleaned) || /\b(?:qty|override|imported|usd)\b/i.test(cleaned)) {
      return true;
    }

    if (/^[a-z0-9\s'&/-]+$/.test(cleaned) && cleaned === cleaned.toLowerCase()) {
      return true;
    }

    return false;
  }

  private getActivityCategoryFallback(category: string, itineraryTitle: string | null) {
    const location = this.cleanProposalText(itineraryTitle || '');
    const categoryKey = category.toLowerCase();

    if (categoryKey === 'transport') {
      return location ? `Private Transfer to ${location}` : 'Private Transfer';
    }

    if (categoryKey === 'hotel') {
      return location ? `Stay in ${location}` : 'Stay Overnight';
    }

    if (categoryKey === 'meal') {
      return location ? `Dine in ${location}` : 'Dining';
    }

    if (categoryKey === 'guide') {
      return location ? `Guided Tour of ${location}` : 'Guided Tour';
    }

    return location ? `Visit ${location}` : 'Visit Highlight';
  }

  private isActivityDescriptionRedundant(name: string, detail: string) {
    return this.cleanProposalText(name).toLowerCase() === this.cleanProposalText(detail).toLowerCase();
  }

  private toClientTitleCase(value: string) {
    const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

    return value
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) => {
        if (index > 0 && minorWords.has(word)) {
          return word;
        }

        return word.replace(/^[a-z]/, (letter) => letter.toUpperCase());
      })
      .join(' ');
  }

  private cleanActivityTitle(value: string) {
    const cleaned = this.cleanProposalText(value)
      .split(',')
      .map((part) => part.trim())
      .find(Boolean);

    if (!cleaned) {
      return '';
    }

    const normalized = this.toClientTitleCase(cleaned.replace(/[.;:]+$/g, '').trim());

    if (this.isPlaceholderActivityLabel(normalized)) {
      return '';
    }

    if (/\bexperience\b/i.test(normalized)) {
      const location = normalized.replace(/\bExperience\b/gi, '').trim();
      return location ? `Visit ${location}` : '';
    }

    if (/^(?:curated|program)\s+experience$/i.test(normalized)) {
      return '';
    }

    return normalized;
  }

  private cleanActivityDescription(detail: string, title: string) {
    let cleaned = this.cleanProposalText(detail);
    if (!cleaned) {
      return null;
    }

    const normalizedTitle = this.normalizeComparisonText(title);
    const segments = cleaned
      .split(/(?<=[.!?])\s+|,\s+/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .filter((segment) => {
        const normalizedSegment = this.normalizeComparisonText(segment);
        if (!normalizedSegment) {
          return false;
        }

        if (this.isPlaceholderActivityLabel(segment)) {
          return false;
        }

        if (normalizedSegment === normalizedTitle) {
          return false;
        }

        return !normalizedTitle || !normalizedSegment.includes(normalizedTitle);
      });

    cleaned = segments.join('. ').trim() || cleaned;
    cleaned = this.stripLeadingTitlePhrase(cleaned, title);
    cleaned = this.rewriteActivityDescription(cleaned, title);
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    if (!cleaned || this.isActivityDescriptionRedundant(title, cleaned)) {
      return null;
    }

    return this.ensureSingleSentence(cleaned);
  }

  private isPlaceholderActivityLabel(value: string) {
    const cleaned = this.normalizeComparisonText(value);
    return (
      cleaned === 'activity' ||
      cleaned === 'imported activity' ||
      cleaned === 'imported itineraries' ||
      cleaned === 'imported itinerary' ||
      cleaned === 'system generated'
    );
  }

  private cleanActivityDetailText(value: string) {
    return this.cleanProposalText(value)
      .replace(/\bAll Year\b/gi, '')
      .replace(/\b(?:contract|season|rate season|contract terms?)\b:?\s*/gi, '')
      .replace(/\s*,\s*(?=,)/g, ', ')
      .replace(/^(?:,\s*)+|(?:,\s*)+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private cleanAccommodationCell(value: string) {
    return this.cleanProposalText(value)
      .replace(/\bAll Year\b/gi, '')
      .replace(/\b(?:contract|season|rate season|contract terms?)\b:?\s*/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/^(?:,\s*)+|(?:,\s*)+$/g, '')
      .trim();
  }

  private getAccommodationRowHeight(
    doc: PDFKit.PDFDocument,
    row: {
      city: string;
      hotelName: string;
      roomType: string | null;
      nights: number;
    },
    columnWidths: number[],
  ) {
    const cityHeight = doc.heightOfString(row.city, {
      width: columnWidths[0],
      lineGap: 2,
    });
    const hotelHeight = doc.heightOfString(row.hotelName, {
      width: columnWidths[1],
      lineGap: 2,
    });
    const roomHeight = doc.heightOfString(row.roomType || 'To be confirmed', {
      width: columnWidths[2],
      lineGap: 2,
    });

    return Math.max(24, cityHeight, hotelHeight, roomHeight);
  }

  private stripLeadingTitlePhrase(detail: string, title: string) {
    const normalizedTitle = this.normalizeComparisonText(title);
    if (!normalizedTitle) {
      return detail;
    }

    const segments = detail
      .split(/,\s+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return detail;
    }

    const [firstSegment, ...rest] = segments;
    if (this.normalizeComparisonText(firstSegment).includes(normalizedTitle) && rest.length > 0) {
      return rest.join('. ');
    }

    return detail;
  }

  private rewriteActivityDescription(detail: string, title: string) {
    const cleaned = detail.replace(/^(?:take|enjoy|have|experience)\s+/i, '').trim();
    const lowerTitle = title.toLowerCase();

    const exploreMatch = cleaned.match(/^(?:a\s+)?(?:guided\s+)?(?:jeep|city|walking|boat|desert)?\s*tour\s+to\s+explore\s+(.+)$/i);
    if (exploreMatch) {
      const subject = this.lowercaseSentenceFragment(exploreMatch[1]);
      const mode = lowerTitle.includes('jeep tour')
        ? 'on a guided jeep tour'
        : lowerTitle.includes('city tour')
          ? 'on a guided city tour'
          : 'with a guided tour';

      return `Explore ${subject} ${mode}`;
    }

    const discoverMatch = cleaned.match(/^(?:a\s+)?(?:guided\s+)?(?:tour\s+to\s+)?discover\s+(.+)$/i);
    if (discoverMatch) {
      return `Discover ${this.lowercaseSentenceFragment(discoverMatch[1])}`;
    }

    const visitMatch = cleaned.match(/^(?:a\s+)?(?:guided\s+)?(?:tour\s+to\s+)?visit\s+(.+)$/i);
    if (visitMatch) {
      return `Visit ${this.lowercaseSentenceFragment(visitMatch[1])}`;
    }

    return cleaned;
  }

  private lowercaseSentenceFragment(value: string) {
    const cleaned = value.replace(/[.;:]+$/g, '').trim();
    if (!cleaned) {
      return '';
    }

    return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  }

  private ensureSentence(value: string) {
    const trimmed = value.replace(/[.;:]+$/g, '').trim();
    if (!trimmed) {
      return '';
    }

    const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  }

  private ensureSingleSentence(value: string) {
    const sentence = this.ensureSentence(value);
    const firstSentence = sentence.match(/^[^.?!]+[.?!]/);
    return firstSentence ? firstSentence[0].trim() : sentence;
  }

  private ensureItineraryDescription(title: string, description?: string | null) {
    const cleaned = description?.trim();
    if (cleaned) {
      return this.ensureSingleSentence(cleaned);
    }

    const lowerTitle = title.toLowerCase();

    if (lowerTitle.startsWith('visit ')) {
      return this.ensureSentence(`Discover the highlights of ${title.slice(6).trim()} with a well-paced visit`);
    }

    if (lowerTitle.startsWith('private transfer')) {
      return 'Travel comfortably with private chauffeured transfer arrangements.';
    }

    if (lowerTitle.startsWith('stay ')) {
      return 'Enjoy a carefully selected stay with comfort and convenience throughout the evening.';
    }

    if (lowerTitle.startsWith('dine ')) {
      return 'Savor a thoughtfully arranged dining experience in a memorable setting.';
    }

    if (lowerTitle.startsWith('guided tour')) {
      return 'Explore the destination with a knowledgeable guide and a well-paced program.';
    }

    return 'Enjoy a thoughtfully arranged experience designed to complement the day\'s program.';
  }

  private getProposalItineraryPlaceholder() {
    return 'Your final service timings and travel documents will be shared before departure.';
  }

  private getProposalDayCity(value: string | null | undefined, dayNumber: number) {
    const cleaned = this.cleanAccommodationCell(value || '')
      .replace(/^Day\s+\d+\s*[:\-]\s*/i, '')
      .replace(/^Visit\s+/i, '')
      .replace(/^Stay\s+in\s+/i, '')
      .trim();

    return cleaned || `City ${dayNumber}`;
  }

  private normalizeComparisonText(value: string) {
    return this.cleanProposalText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatGuestCountLabel(value: number) {
    return `${value} guest${value === 1 ? '' : 's'}`;
  }

  private formatProposalNightCountLabel(value: number) {
    return `${value} NIGHT${value === 1 ? '' : 'S'}`;
  }

  private formatFocRoomType(value: string | null | undefined) {
    return value === 'single' ? 'single room' : value === 'double' ? 'double room' : 'room';
  }

  private buildQuoteFocNote(values: {
    focType: string;
    focRatio: number | null;
    focCount: number | null;
    focRoomType: string | null;
    resolvedFocCount: number;
    adults: number;
    children: number;
  }) {
    if (!values.resolvedFocCount) {
      return null;
    }

    if (this.normalizeQuoteFocType(values.focType) === 'ratio' && values.focRatio) {
      const qualifyingPayingGuests = Math.min(
        Math.max(values.adults + values.children, 0),
        Math.floor(values.resolvedFocCount * values.focRatio),
      );

      return `${values.resolvedFocCount} complimentary place${values.resolvedFocCount === 1 ? '' : 's'} in ${this.formatFocRoomType(values.focRoomType)} based on ${qualifyingPayingGuests} paying guests (1 complimentary place per ${values.focRatio} paying guests).`;
    }

    if (this.normalizeQuoteFocType(values.focType) === 'fixed') {
      return `${values.resolvedFocCount} complimentary place${values.resolvedFocCount === 1 ? '' : 's'} in ${this.formatFocRoomType(values.focRoomType)}.`;
    }

    return null;
  }

  private getProposalBranding(company: {
    name?: string | null;
    website?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
    branding?: {
      displayName?: string | null;
      logoUrl?: string | null;
      headerTitle?: string | null;
      headerSubtitle?: string | null;
      footerText?: string | null;
      website?: string | null;
      email?: string | null;
      phone?: string | null;
      primaryColor?: string | null;
      secondaryColor?: string | null;
    } | null;
  }) {
    const hasBrandingOverride = Boolean(company.branding);
    const primaryColor = this.normalizeBrandColor(company.branding?.primaryColor || company.primaryColor);
    const secondaryColor = this.normalizeBrandColor(company.branding?.secondaryColor || company.primaryColor);
    const displayName = hasBrandingOverride
      ? this.cleanProposalText(company.branding?.displayName || '') || 'Travel Proposal'
      : this.cleanProposalText(company.name || '') || 'Travel Proposal';

    return {
      displayName,
      headerTitle: this.getClientFacingProposalHeaderTitle(company.branding?.headerTitle || ''),
      headerSubtitle: this.cleanProposalText(company.branding?.headerSubtitle || '') || null,
      footerText: this.cleanProposalText(company.branding?.footerText || '') || null,
      website: this.cleanProposalText(company.branding?.website || company.website || '') || null,
      email: this.cleanProposalText(company.branding?.email || '') || null,
      phone: this.cleanProposalText(company.branding?.phone || '') || null,
      primaryColor,
      secondaryColor,
      logoUrl: this.cleanProposalText(company.branding?.logoUrl || company.logoUrl || '') || null,
      softColor: this.mixHexColor(secondaryColor, '#FFFFFF', 0.88),
      dividerColor: this.mixHexColor(secondaryColor, '#FFFFFF', 0.72),
    };
  }

  private async loadPdfImageBuffer(imageUrl: string) {
    const normalizedUrl = imageUrl.trim();
    if (normalizedUrl.startsWith('/uploads/')) {
      return readFile(resolve(process.cwd(), 'apps', 'api', `.${normalizedUrl}`));
    }

    const imageResponse = await fetch(normalizedUrl);
    const arrayBuffer = await imageResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private normalizeBrandColor(value?: string | null) {
    const normalized = (value || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : '#0F766E';
  }

  private mixHexColor(baseColor: string, targetColor: string, weight: number) {
    const clampWeight = Math.max(0, Math.min(1, weight));
    const base = this.hexToRgb(baseColor);
    const target = this.hexToRgb(targetColor);
    const mixed = {
      r: Math.round(base.r * (1 - clampWeight) + target.r * clampWeight),
      g: Math.round(base.g * (1 - clampWeight) + target.g * clampWeight),
      b: Math.round(base.b * (1 - clampWeight) + target.b * clampWeight),
    };

    return this.rgbToHex(mixed.r, mixed.g, mixed.b);
  }

  private hexToRgb(value: string) {
    const normalized = value.replace('#', '');
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  }

  private rgbToHex(r: number, g: number, b: number) {
    return `#${[r, g, b]
      .map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`;
  }

  private ensureSingleLineTitle(value: string) {
    const cleaned = this.cleanProposalText(value).replace(/\s+/g, ' ').trim();
    return cleaned || 'Travel Experience';
  }

  private buildProposalV2Document(quote: any): ProposalV2Document {
    const sortedDays = [...quote.itineraries].sort((a, b) => a.dayNumber - b.dayNumber);
    const totalPax = quote.adults + quote.children;
    const dayCount = Math.max(sortedDays.length, quote.nightCount + 1 || 0, 1);
    const travelerName = this.cleanProposalText(quote.clientCompany?.name || '') || this.getProposalClientName(quote.contact);
    const title = this.ensureSingleLineTitle(this.getProposalTitle(quote.title, sortedDays));
    const branding = this.getProposalBranding(quote.brandCompany || quote.clientCompany);
    const proposalCurrency = this.getProposalCurrency(quote.quoteItems);
    const destinations = Array.from(new Set(sortedDays.map((day) => this.getProposalDayCity(day.title, day.dayNumber)).filter(Boolean)));
    const destinationLine = this.summarizeDestinations(destinations) || title.replace(/\s+Journey$/i, '');
    const pricing = buildProposalPricingViewModel(quote, proposalCurrency, (amount, currency) => this.formatProposalMoney(amount, currency));
    const unassignedItems = quote.quoteItems.filter((item: any) => !item.itineraryId);
    const notes =
      this.parseSupportTextList(quote.termsNotesText) ||
      [
        'Rates remain subject to final availability and confirmation at the time of booking.',
        quote.quoteOptions.length > 0
          ? `Alternative service options can be shared on request. ${quote.quoteOptions.length} option${quote.quoteOptions.length === 1 ? '' : 's'} available.`
          : 'Alternative services or accommodation options can be prepared on request.',
        unassignedItems.length > 0
          ? `${unassignedItems.length} additional arrangement${unassignedItems.length === 1 ? '' : 's'} will be confirmed separately.`
          : 'All services shown are aligned to the itinerary outlined in this proposal.',
      ].filter((note): note is string => Boolean(note?.trim()));

    return {
      branding,
      title,
      quoteReference: quote.quoteNumber || 'Quote reference to be confirmed',
      travelerName,
      destinationLine,
      durationLabel: `${dayCount} day${dayCount === 1 ? '' : 's'} / ${this.formatProposalNightCountLabel(quote.nightCount).toLowerCase()}`,
      travelDatesLabel: this.getProposalTravelDateLabel(quote.travelStartDate, quote.nightCount),
      subtitle: this.buildProposalSubtitle(sortedDays, quote),
      proposalDate: this.formatDate(quote.createdAt || new Date()),
      travelerCountLabel: this.formatGuestCountLabel(totalPax),
      servicesCountLabel: `${quote.quoteItems.length} service${quote.quoteItems.length === 1 ? '' : 's'}`,
      totalDays: dayCount,
      journeySummary: this.buildProposalSummary({
        quoteTitle: quote.title,
        quoteDescription: quote.description,
        sortedDays,
        totalPax,
        nightCount: quote.nightCount,
      }),
      highlights: this.buildProposalV2Highlights(sortedDays, quote.quoteItems),
      pricing,
      days: sortedDays.map((day) => this.buildProposalV2Day(day, quote.quoteItems.filter((item: any) => item.itineraryId === day.id))),
      inclusions: this.parseSupportTextList(quote.inclusionsText) || this.buildInclusions(quote.quoteItems),
      exclusions: this.parseSupportTextList(quote.exclusionsText) || this.buildExclusions(),
      notes,
    };
  }

  private buildProposalSubtitle(
    sortedDays: Array<{ title: string; dayNumber: number }>,
    quote: { title: string; adults: number; children: number; nightCount: number },
  ) {
    const destinations = this.summarizeDestinations(sortedDays.map((day) => this.getProposalDayCity(day.title, day.dayNumber)).filter(Boolean));
    const guestLabel = this.formatGuestCountLabel(quote.adults + quote.children);
    if (destinations) {
      return `${this.formatProposalNightCountLabel(quote.nightCount)} · ${guestLabel} · ${destinations}`;
    }

    return `${this.formatProposalNightCountLabel(quote.nightCount)} · ${guestLabel}`;
  }

  private buildProposalV2Highlights(
    sortedDays: Array<{ id: string; title: string; dayNumber: number }>,
    quoteItems: any[],
  ) {
    const highlights = new Set<string>();
    const destinations = sortedDays.map((day) => this.getProposalDayCity(day.title, day.dayNumber)).filter(Boolean);

    destinations.slice(0, 2).forEach((destination) => {
      highlights.add(`Curated journey flow through ${destination}.`);
    });

    for (const day of sortedDays) {
      const dayItems = quoteItems.filter((item) => item.itineraryId === day.id);
      const locationLabel = this.getProposalDayCity(day.title, day.dayNumber);
      const activities = this.buildPdfDayActivities(dayItems, locationLabel);
      activities.slice(0, 1).forEach((activity) => {
        highlights.add(activity.name);
      });
      if (highlights.size >= 4) {
        break;
      }
    }

    return Array.from(highlights).slice(0, 4);
  }

  private buildProposalV2Day(day: any, dayItems: any[]) {
    const locationLabel = this.getProposalDayCity(day.title, day.dayNumber);
    const activitySummary = this.buildPdfDayActivitySummary(dayItems, locationLabel);
    const groups = this.buildProposalV2ServiceGroups(dayItems, locationLabel);
    const cleanedDayTitle = this.cleanProposalText(day.title || '');
    const cleanedSummary = this.cleanProposalText(day.description?.trim() || '') || this.cleanProposalText(activitySummary?.description || '');

    return {
      dayNumber: day.dayNumber,
      title: this.isWeakProposalDayTitle(cleanedDayTitle, day.dayNumber) ? locationLabel : cleanedDayTitle || locationLabel,
      summary: this.isProposalPlaceholderText(cleanedSummary) ? null : cleanedSummary || null,
      overnightLocation: dayItems.some((item) => this.isHotelService(item.service)) ? locationLabel : null,
      groups,
    };
  }

  private buildProposalV2ServiceGroups(dayItems: any[], itineraryTitle?: string | null): ProposalV2ServiceGroup[] {
    const grouped = new Map<string, ProposalV2ServiceItem[]>();
    const order = ['Stay', 'Transfer', 'Experience', 'Meal', 'Guide', 'Other'];

    const pushItem = (groupLabel: string, item: ProposalV2ServiceItem) => {
      const existing = grouped.get(groupLabel) || [];
      existing.push(item);
      grouped.set(groupLabel, existing);
    };

    for (const item of dayItems) {
      const groupLabel = this.getProposalV2ServiceGroupLabel(item.service);
      pushItem(groupLabel, this.buildProposalV2ServiceItem(item, itineraryTitle));
    }

    return order
      .filter((label) => grouped.has(label))
      .map((label) => ({
        label,
        items: grouped.get(label) || [],
      }));
  }

  private getProposalV2ServiceGroupLabel(service: { category: string; serviceType?: { name: string; code: string | null } | null }) {
    if (this.isHotelService(service)) {
      return 'Stay';
    }
    if (this.isTransportService(service)) {
      return 'Transfer';
    }
    if (this.isGuideService(service)) {
      return 'Guide';
    }
    if ((service.category || '').toLowerCase().includes('meal')) {
      return 'Meal';
    }
    if (this.isActivityService(service)) {
      return 'Experience';
    }
    return 'Other';
  }

  private buildProposalV2ServiceItem(item: any, itineraryTitle?: string | null): ProposalV2ServiceItem {
    const groupLabel = this.getProposalV2ServiceGroupLabel(item.service);

    if (this.isHotelService(item.service)) {
      return {
        title: this.cleanAccommodationCell(item.hotel?.name || item.service.name) || 'Hotel to be confirmed',
        description: [
          item.roomCategory?.name ? `Room ${this.cleanAccommodationCell(item.roomCategory.name)}` : null,
          item.mealPlan ? `Meals ${String(item.mealPlan).toUpperCase()}` : null,
          item.occupancyType ? `Occupancy ${String(item.occupancyType).toUpperCase()}` : null,
        ].filter(Boolean).join(' · ') || 'Accommodation details to be confirmed.',
        meta: item.contract?.name ? `Contract ${this.cleanAccommodationCell(item.contract.name)}` : null,
      };
    }

    if (this.isTransportService(item.service) && item.appliedVehicleRate) {
      return {
        title: this.cleanProposalText(item.appliedVehicleRate.routeName || item.service.name) || 'Transfer',
        description: `${item.appliedVehicleRate.vehicle?.name || 'Vehicle to be confirmed'} · ${item.appliedVehicleRate.serviceType?.name || 'Transport service'}`,
        meta: this.buildProposalV2OperationalMeta(item),
      };
    }

    const importedDetails = this.getImportedServiceDisplay(item.service.name, item.pricingDescription, item.service.supplierId);
    const detail = this.cleanActivityDetailText(importedDetails?.description || this.getItemSummary(item));
    const title = this.isActivityService(item.service)
      ? this.getClientFacingActivityTitle({
          importedName: importedDetails?.name || null,
          detail,
          itineraryTitle: itineraryTitle || null,
          category: item.service.category,
        })
      : importedDetails?.name || this.cleanProposalText(item.service.name || '') || 'Service to be confirmed';
    const operationalMeta = this.buildProposalV2OperationalMeta(item);
    let resolvedTitle = this.cleanProposalText(title) || this.getProposalV2FallbackTitle(groupLabel, itineraryTitle);
    let resolvedDescription = detail || null;

    if (groupLabel === 'Transfer' && this.looksLikeProposalAccommodationText(`${resolvedTitle} ${resolvedDescription || ''}`)) {
      resolvedTitle = this.getProposalV2FallbackTitle('Transfer', itineraryTitle);
      resolvedDescription = 'Transfer details to be confirmed.';
    }

    if (this.isProposalPlaceholderText(resolvedTitle)) {
      resolvedTitle = this.getProposalV2FallbackTitle(groupLabel, itineraryTitle);
    }

    if (this.isProposalPlaceholderText(resolvedDescription)) {
      resolvedDescription = null;
    }

    return {
      title: resolvedTitle,
      description: resolvedDescription,
      meta: this.isProposalPlaceholderText(operationalMeta) ? null : operationalMeta,
    };
  }

  private buildProposalV2OperationalMeta(item: any) {
    return [
      item.serviceDate ? `Date ${this.formatDate(item.serviceDate)}` : null,
      item.startTime ? `Start ${item.startTime}` : null,
      item.pickupTime ? `Pickup ${item.pickupTime}` : null,
      item.pickupLocation ? `Pickup ${this.cleanProposalText(item.pickupLocation)}` : null,
      item.meetingPoint ? `Meeting ${this.cleanProposalText(item.meetingPoint)}` : null,
      item.participantCount ? `${item.participantCount} pax` : null,
    ].filter(Boolean).join(' · ') || null;
  }

  private getProposalV2FallbackTitle(groupLabel: string, itineraryTitle?: string | null) {
    const location = this.cleanProposalText(itineraryTitle || '');

    if (groupLabel === 'Stay') {
      return location ? `Stay in ${location}` : 'Stay arrangements';
    }

    if (groupLabel === 'Transfer') {
      return location ? `Private Transfer to ${location}` : 'Transfer arrangements';
    }

    if (groupLabel === 'Experience') {
      return location ? `Visit ${location}` : 'Experience details';
    }

    if (groupLabel === 'Meal') {
      return location ? `Dining in ${location}` : 'Dining arrangements';
    }

    if (groupLabel === 'Guide') {
      return location ? `Guided Tour of ${location}` : 'Guide arrangements';
    }

    return 'Program details';
  }

  private isWeakProposalDayTitle(value: string, dayNumber: number) {
    const normalized = this.normalizeComparisonText(value);

    return !normalized || normalized === `day ${dayNumber}` || normalized === 'day';
  }

  private isProposalPlaceholderText(value: string | null | undefined) {
    const normalized = this.normalizeComparisonText(value || '');

    return (
      !normalized ||
      normalized.includes('to be confirmed') ||
      normalized.includes('details to be confirmed') ||
      normalized.includes('program details') ||
      normalized.includes('service to be confirmed') ||
      normalized.includes('internal use only')
    );
  }

  private looksLikeProposalAccommodationText(value: string) {
    const normalized = this.normalizeComparisonText(value);

    return (
      normalized.includes('hotel') ||
      normalized.includes('room') ||
      normalized.includes('occupancy') ||
      normalized.includes('meal') ||
      normalized.includes('breakfast') ||
      normalized.includes('check in') ||
      normalized.includes('check out') ||
      normalized.includes('accommodation')
    );
  }

  private cleanProposalText(value: string) {
    return value
      .replace(/\s*\|\s*/g, ', ')
      .replace(/\bDescription:\s*/gi, '')
      .replace(/\bNotes:\s*/gi, '')
      .replace(/\bImported itinerary:\s*/gi, '')
      .replace(/\bImported Drafts?\b/gi, '')
      .replace(/\bImported Itineraries\b/gi, '')
      .replace(/\bImported Activity\b/gi, '')
      .replace(/\bInternal Use Only\b/gi, '')
      .replace(/\bSystem Generated\b/gi, '')
      .replace(/\bDemo\b/gi, '')
      .replace(/\bTest\b/gi, '')
      .replace(/\bRevision Requested\b/gi, '')
      .replace(/\bWorkflow\b/gi, '')
      .replace(/\bERP\b/gi, '')
      .replace(/\bQA\b/gi, '')
      .replace(/\s+[–-]\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getProposalClientName(contact: { firstName?: string | null; lastName?: string | null }) {
    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
    const cleanedName = this.cleanProposalText(fullName);

    if (!cleanedName || /^(imported|draft|internal)\b/i.test(cleanedName)) {
      return 'Private Client';
    }

    return cleanedName;
  }

  private getClientFacingProposalHeaderTitle(value: string) {
    const cleaned = this.cleanProposalText(value);
    if (!cleaned || /\b(imported|draft|internal)\b/i.test(cleaned)) {
      return 'Bespoke Travel Proposal';
    }

    return cleaned;
  }

  private formatProposalMoney(amount: number, currency = 'USD') {
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const safeCurrency = ['USD', 'EUR', 'JOD'].includes((currency || '').trim().toUpperCase())
      ? currency.trim().toUpperCase()
      : 'USD';
    const formattedAmount = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: Number.isInteger(safeAmount) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);

    return `${safeCurrency} ${formattedAmount}`;
  }

  private getProposalPriceSummary(
    quote: {
      adults: number;
      children: number;
      pricingMode?: string | null;
      pricingSlabs?: Array<{
        minPax: number;
        maxPax?: number | null;
        price?: number;
        pricePerPayingPax?: number | null;
        actualPax?: number;
        focPax?: number | null;
        payingPax?: number;
      }> | null;
      singleSupplement?: number | null;
      fixedPricePerPerson?: number | null;
      currentPricing?: {
        isAvailable: boolean;
        value: number | null;
        label?: string | null;
        paxCount?: number;
        matchedSlab?: {
          label: string;
        } | null;
        message?: string | null;
      } | null;
      priceComputation?: {
        mode: 'simple' | 'group';
        status: 'ok' | 'missing_coverage' | 'invalid_config';
        warnings: string[];
        display: {
          summaryLabel: string;
          summaryValue?: string | null;
          slabLines?: Array<{ label: string; value: string; detail?: string }>;
          contextLines?: string[];
          pricingText?: string;
          singleSupplementText?: string;
          focText?: string;
        };
      } | null;
    },
    currency: string,
  ) {
    if (quote.priceComputation) {
      return {
        mode: quote.priceComputation.mode,
        label: quote.priceComputation.display.summaryLabel,
        value: quote.priceComputation.display.summaryValue || 'Price unavailable',
        slabLines: quote.priceComputation.display.slabLines || [],
        contextLines: quote.priceComputation.display.contextLines || [],
        notes: Array.from(
          new Set([
            ...(quote.priceComputation.display.pricingText && quote.priceComputation.status === 'invalid_config'
              ? [quote.priceComputation.display.pricingText]
              : []),
            ...(quote.priceComputation.display.singleSupplementText ? [quote.priceComputation.display.singleSupplementText] : []),
            ...(quote.priceComputation.display.focText ? [quote.priceComputation.display.focText] : []),
            ...quote.priceComputation.warnings,
          ]),
        ),
      };
    }

    const guestCount = Math.max((quote.adults || 0) + (quote.children || 0), 1);
    if (quote.pricingMode === 'SLAB') {
      return {
        mode: 'group' as const,
        label: 'Group pricing',
        value:
          quote.currentPricing?.isAvailable && quote.currentPricing.value !== null
            ? this.formatProposalMoney(quote.currentPricing.value, currency)
            : 'Price unavailable',
        slabLines: (quote.pricingSlabs || []).map((slab) => ({
          label: slab.minPax === (slab.maxPax ?? slab.minPax) ? `${slab.minPax} pax` : `${slab.minPax}-${slab.maxPax} pax`,
          value: this.formatProposalMoney(slab.pricePerPayingPax ?? slab.price ?? 0, currency),
          detail:
            slab.actualPax !== undefined
              ? `${slab.actualPax} actual | ${slab.focPax ?? 0} FOC | ${slab.payingPax ?? slab.actualPax} paying`
              : undefined,
        })),
        contextLines: [
          ...(quote.currentPricing?.matchedSlab
            ? [`Selected group size: ${quote.currentPricing.paxCount || guestCount} pax (${quote.currentPricing.matchedSlab.label})`]
            : []),
          'Accommodation in double/twin sharing room',
        ],
        notes: [
          ...(!quote.currentPricing?.isAvailable ? [quote.currentPricing?.message || 'Price unavailable for selected passenger count.'] : []),
          quote.singleSupplement !== null && quote.singleSupplement !== undefined
            ? `Single supplement: ${this.formatProposalMoney(quote.singleSupplement, currency)} per person`
            : 'Single supplement available on request',
        ],
      };
    }

    return {
      mode: 'simple' as const,
      label: quote.currentPricing?.label || 'Package sell price per person',
      value: this.formatProposalMoney(quote.currentPricing?.value ?? quote.fixedPricePerPerson ?? 0, currency),
      slabLines: [] as Array<{ label: string; value: string; detail?: string }>,
      contextLines: [`Based on ${guestCount} guests sharing`, 'Accommodation in double/twin sharing room'],
      notes: [
        quote.singleSupplement !== null && quote.singleSupplement !== undefined
          ? `Single supplement: ${this.formatProposalMoney(quote.singleSupplement, currency)} per person`
          : 'Single supplement available on request',
      ],
    };
  }

  private getProposalCurrency(items: Array<{ currency: string | null | undefined }>) {
    const candidate = items.find((item) => item.currency?.trim())?.currency?.trim().toUpperCase();
    return ['USD', 'EUR', 'JOD'].includes(candidate || '') ? candidate! : 'USD';
  }

  private normalizeCurrencyCode(currency: string | null | undefined) {
    const normalized = currency?.trim().toUpperCase() || 'USD';

    return ['USD', 'EUR', 'JOD'].includes(normalized) ? normalized : 'USD';
  }

  private validateInputCurrencyCode(currency: string | null | undefined, fieldLabel: string) {
    return requireSupportedCurrency(currency || 'USD', fieldLabel);
  }

  private mapInvoiceSummary(invoice: QuoteInvoiceSummary | null | undefined) {
    if (!invoice) {
      return null;
    }

    return {
      id: invoice.id,
      quoteId: invoice.quoteId,
      totalAmount: invoice.totalAmount,
      currency: invoice.currency,
      status: invoice.status,
      dueDate: invoice.dueDate,
    };
  }

  private async ensureInvoiceForAcceptedQuote(
    quoteId: string,
    prismaClient: Prisma.TransactionClient | PrismaService = this.prisma,
    actor?: CompanyScopedActor,
  ) {
    const quoteModel = (prismaClient as any).quote;
    const invoiceModel = (prismaClient as any).invoice;
    const companyId = actor?.companyId?.trim() || null;
    const quote = await quoteModel.findFirst({
      where: {
        id: quoteId,
        ...(companyId
          ? {
              clientCompanyId: companyId,
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        acceptedAt: true,
        totalSell: true,
        quoteCurrency: true,
        invoice: {
          select: {
            id: true,
            quoteId: true,
            totalAmount: true,
            currency: true,
            status: true,
            dueDate: true,
          },
        },
        quoteItems: {
          where: {
            optionId: null,
          },
          select: {
            currency: true,
          },
        },
      },
    });

    if (!quote) {
      throw new BadRequestException('Quote not found');
    }

    if (quote.status !== QuoteStatus.ACCEPTED && quote.status !== QuotesService.CONFIRMED) {
      throw new BadRequestException('Invoice can only be created for accepted or confirmed quotes');
    }

    if (quote.invoice) {
      return quote.invoice;
    }

    const issuedAt = quote.acceptedAt ?? new Date();
    const dueDate = new Date(issuedAt);
    dueDate.setUTCDate(dueDate.getUTCDate() + 7);

    return invoiceModel.create({
      data: {
        quoteId: quote.id,
        totalAmount: Number((quote.totalSell || 0).toFixed(2)),
        currency: this.normalizeCurrencyCode((quote as any).quoteCurrency || this.getProposalCurrency(quote.quoteItems)),
        status: 'ISSUED',
        dueDate,
      },
      select: {
        id: true,
        quoteId: true,
        totalAmount: true,
        currency: true,
        status: true,
        dueDate: true,
      },
    });
  }

  private formatMoney(amount: number, currency = 'USD') {
    return `${currency} ${amount.toFixed(2)}`;
  }

  private ensureSpace(doc: PDFKit.PDFDocument, minimumHeight: number) {
    this.ensurePageSpace(doc, minimumHeight);
  }

  private ensurePageSpace(doc: PDFKit.PDFDocument, minimumHeight: number) {
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    const pageTop = doc.page.margins.top;
    const pageCapacity = Math.max(0, pageBottom - pageTop);
    const cursorOffset = Math.max(0, doc.y - pageTop);

    if (doc.y + minimumHeight <= pageBottom) {
      return;
    }

    const onFreshPage = cursorOffset <= 12;
    const blockExceedsPageCapacity = minimumHeight >= pageCapacity;

    if (onFreshPage && blockExceedsPageCapacity) {
      return;
    }

    const chromeContext = (doc as PDFKit.PDFDocument & {
      __quotePdfChromeContext?: {
        brandName: string;
        footerText?: string | null;
        details: string[];
        accentColor: string;
        dividerColor: string;
        quoteReference: string;
      };
      __quotePdfPageNumber?: number;
    }).__quotePdfChromeContext;
    if (chromeContext) {
      const nextPageNumber = (((doc as PDFKit.PDFDocument & { __quotePdfPageNumber?: number }).__quotePdfPageNumber || 1) + 1);
      (doc as PDFKit.PDFDocument & { __quotePdfPageNumber?: number }).__quotePdfPageNumber = nextPageNumber;
      this.addPageWithChrome(doc, chromeContext, nextPageNumber);
      return;
    }

    this.startNewPage(doc, 'fallback-no-chrome');
  }

  private generateBookingAccessToken() {
    return randomBytes(24).toString('hex');
  }
}
