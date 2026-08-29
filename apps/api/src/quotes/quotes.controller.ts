import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { BookingRoomOccupancy, HotelMealPlan, HotelOccupancyType, QuoteOptionKind, QuoteStatus } from '@prisma/client';
import { Actor, Public, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor, DmcRole } from '../auth/auth.types';

/**
 * HC-1A: EXPLICIT exact-role allowlist for the read-only hotel contract/rate
 * summary. This is a plain `includes` (NOT the coalescing roles.guard), so
 * `agent_admin` — which the guard coalesces to `admin` because the route @Roles
 * includes 'admin' — is BLOCKED here, and `super_admin` is listed explicitly.
 * Mirrors the Catalog V2 allowlist pattern. Does not broaden access.
 */
const HOTEL_CONTRACT_SUMMARY_ROLES: readonly DmcRole[] = ['admin', 'super_admin', 'operations', 'viewer', 'finance'];

/**
 * CP-N3a′: EXPLICIT internal-role allowlist for the GENERIC authenticated quote
 * read endpoints (GET /quotes and GET /quotes/:id). This is a plain `includes`
 * (NOT the coalescing roles.guard), so `agent_admin` — which the guard would
 * coalesce to `admin` — is BLOCKED here, alongside `agent` and any missing /
 * unknown / future unlisted role (fail-closed). External Agent roles read quotes
 * only through /agent/*. This role gate adds NO tenant `where` predicate:
 * internal DMC roles keep managing quotes for client companies different from
 * `actor.companyId` (see security/multi-company-isolation.test.ts).
 */
const INTERNAL_QUOTE_READ_ROLES: readonly DmcRole[] = ['admin', 'super_admin', 'finance', 'operations', 'viewer'];
import { ProposalV3Service } from './proposal-v3.service';
import { QuotesService } from './quotes.service';
import { stripRestrictedQuoteCostWriteFields } from './quote-cost-write-policy';
import { mapQuoteToOperational } from './quote-operational.mapper';

type QuotePricingType = 'simple' | 'group';
type QuotePricingMode = 'SLAB' | 'FIXED';
type QuoteFocType = 'none' | 'ratio' | 'fixed';
type QuoteFocRoomType = 'single' | 'double';
type QuoteTypeValue = 'FIT' | 'GROUP';
type QuoteBookingType = 'FIT' | 'GROUP' | 'SERIES';
type JordanPassTypeValue = 'NONE' | 'WANDERER' | 'EXPLORER' | 'EXPERT';

type QuotePricingSlabBody = {
  minPax: number;
  maxPax?: number | null;
  price: number;
  focPax?: number | null;
  notes?: string | null;
};

type CreateQuoteBody = {
  clientCompanyId?: string;
  companyId: string;
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
  pricingSlabs?: QuotePricingSlabBody[];
  focType?: QuoteFocType;
  focRatio?: number | null;
  focCount?: number | null;
  focRoomType?: QuoteFocRoomType | null;
  adults?: number;
  children?: number;
  roomCount?: number;
  nightCount?: number;
  singleSupplement?: number | null;
  travelStartDate?: string | null;
  validUntil?: string | null;
  quoteCurrency?: string;
  proposalLanguage?: string;
};

type UpdateQuoteBody = Partial<CreateQuoteBody> & {
  status?: QuoteStatus;
};

type QuotePassengerBody = {
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  nationality?: string | null;
  passportNumber?: string | null;
  passportExpiry?: string | null;
  dietaryNotes?: string | null;
  mobilityNotes?: string | null;
  emergencyContact?: string | null;
  remarks?: string | null;
};

type QuoteRoomingGroupBody = {
  itineraryDayId?: string | null;
  hotelQuoteItemId?: string | null;
  roomType?: string | null;
  occupancyType?: BookingRoomOccupancy | 'single' | 'double' | 'triple' | 'quad' | 'unknown' | null;
  notes?: string | null;
  temporaryRoomLabel?: string | null;
  guideRoom?: boolean;
  leaderRoom?: boolean;
  sortOrder?: number | null;
};

type QuoteRoomingAssignmentBody = {
  quotePassengerId?: string | null;
};

type UpdateQuoteStatusBody = {
  status: QuoteStatus;
  acceptedVersionId?: string | null;
};

type CreateQuoteItemBody = {
  packageTemplateId?: string | null;
  packageTemplateDayId?: string | null;
  packageTemplateComponentId?: string | null;
  serviceId?: string | null;
  activityId?: string | null;
  activityRateVariantId?: string | null;
  excursionTemplateId?: string | null;
  excursionTemplateComponentId?: string | null;
  excursionTemplateComponentOptional?: boolean | null;
  ticketRateVariantId?: string | null;
  itineraryId?: string;
  serviceDate?: string | null;
  startTime?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  meetingPoint?: string | null;
  participantCount?: number | null;
  adultCount?: number | null;
  childCount?: number | null;
  reconfirmationRequired?: boolean;
  reconfirmationDueAt?: string | null;
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
  packageName?: string | null;
  country?: string | null;
  supplierName?: string | null;
  startDay?: number | null;
  endDay?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  netCost?: number | null;
  pricingMatrixJson?: unknown;
  singleSupplement?: number | null;
  includes?: string | null;
  excludes?: string | null;
  internalNotes?: string | null;
  hotelsOrSimilar?: string | null;
  clientDescription?: string | null;
  quantity?: number;
  paxCount?: number;
  roomCount?: number;
  nightCount?: number;
  dayCount?: number;
  overrideCost?: number | null;
  overrideReason?: string | null;
  useOverride?: boolean;
  markupAmount?: number | null;
  sellPrice?: number | null;
  sellPriceOverrideExplicit?: boolean;
  currency?: string | null;
  markupPercent?: number;
  transportServiceTypeId?: string;
  vehicleRateId?: string | null;
  transportVehicleId?: string;
  routeId?: string;
  touringRouteId?: string | null;
  touringRoutePricingId?: string | null;
  normalizedKey?: string;
  routeName?: string;
  transportLabel?: string | null;
  standaloneTransfer?: boolean;
  transportAddOns?: Array<{ rateId?: string; quantity?: number }>;
};

type UpdateQuoteItemBody = Partial<CreateQuoteItemBody>;

// Pricing-inert display-text update. Only these client-facing fields — which the
// proposal-v3 mapper already renders — may be edited via the display-text route.
// Every pricing/identity/quantity field is intentionally absent here so it can
// never be forwarded to the service.
type UpdateQuoteItemDisplayTextBody = {
  externalClientDescription?: string | null;
  externalIncludes?: string | null;
  externalExcludes?: string | null;
  externalHotelsOrSimilar?: string | null;
  transportLabel?: string | null;
};

type ExpandExcursionTemplateBody = {
  itineraryId?: string | null;
  serviceDate?: string | null;
  selectedOptionalComponentIds?: string[];
  selectedTouringRouteId?: string | null;
  selectedTouringRoutePricingId?: string | null;
  paxCount?: number;
  quantity?: number;
  markupPercent?: number;
};

type ApplyPackageTemplateBody = {
  selectedOptionalComponentIds?: string[];
};

type ImportProgramTemplateBody = {
  packageTemplateId?: string | null;
  startDate?: string | null;
  hotelCategory?: string | null;
  pax?: number | string | null;
  guideLanguage?: string | null;
};

type AssignQuoteItemServiceBody = {
  serviceId: string;
};

type ReorderQuoteItemsBody = {
  day: number;
  serviceType: string;
  orderedItemIds: string[];
};

type MoveQuoteItemBody = {
  day: number;
  serviceType: string;
};

type CreateQuoteOptionBody = {
  kind?: 'HOTEL_OPTION_SET' | 'COMMERCIAL_OPTION';
  name?: string;
  notes?: string;
  hotelCategoryId?: string | null;
  pricingMode?: 'itemized' | 'package';
  packageMarginPercent?: number | null;
};

type UpdateQuoteOptionBody = Partial<CreateQuoteOptionBody>;

type CreateQuoteHotelOptionBody = {
  city?: string;
  hotelId?: string | null;
  roomCategoryId?: string | null;
  hotelNameSnapshot?: string;
  roomType?: string;
  mealPlan?: string;
  mealPlanCode?: HotelMealPlan | null;
  nights?: number | string;
  isPrimary?: boolean;
  notes?: string | null;
};

type UpdateQuoteHotelOptionBody = Partial<CreateQuoteHotelOptionBody>;

type GenerateQuoteScenariosBody = {
  paxCounts?: number[];
};

type CreateQuoteVersionBody = {
  label?: string;
};

type PublicQuoteChangeRequestBody = {
  message?: string;
};

const DEFAULT_PROPOSAL_VARIANT = 'v3' as const;

@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly quotesService: QuotesService,
    private readonly proposalV3Service: ProposalV3Service,
  ) {}

  // CP-N3a′: fail-closed internal-role gate for the generic quote read endpoints.
  // Rejects disallowed/missing/unknown roles BEFORE any quote service call. Adds
  // no tenant filtering and does not touch findAll/findOne/loadQuoteState.
  private assertInternalQuoteReadAccess(actor: AuthenticatedActor | undefined) {
    const role = actor?.role;
    if (!role || !(INTERNAL_QUOTE_READ_ROLES as readonly string[]).includes(role)) {
      throw new ForbiddenException('This quote endpoint is restricted to internal roles.');
    }
  }

  @Get()
  findAll(@Actor() actor: AuthenticatedActor) {
    this.assertInternalQuoteReadAccess(actor);
    return this.quotesService.findAll(actor);
  }

  private normalizeQuotePassengerBody(body: QuotePassengerBody) {
    return {
      firstName: body.firstName,
      lastName: body.lastName,
      gender: body.gender,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : body.dateOfBirth === null ? null : undefined,
      nationality: body.nationality,
      passportNumber: body.passportNumber,
      passportExpiry: body.passportExpiry ? new Date(body.passportExpiry) : body.passportExpiry === null ? null : undefined,
      dietaryNotes: body.dietaryNotes,
      mobilityNotes: body.mobilityNotes,
      emergencyContact: body.emergencyContact,
      remarks: body.remarks,
    };
  }

  @Public()
  @Get('public/:token/view')
  async findPublicView(@Param('token') token: string) {
    const quoteView = await this.quotesService.findPublicView(token);

    if (!quoteView) {
      throw new NotFoundException('Quote not found');
    }

    return quoteView;
  }

  @Public()
  @Post('public/:token/accept')
  async acceptPublicQuote(@Param('token') token: string) {
    const result = await this.quotesService.acceptPublicQuote(token);

    if (!result) {
      throw new NotFoundException('Quote not found');
    }

    return result;
  }

  @Public()
  @Post('public/:token/request-changes')
  async requestPublicQuoteChanges(@Param('token') token: string, @Body() body: PublicQuoteChangeRequestBody) {
    const result = await this.quotesService.requestPublicQuoteChanges(token, body.message || '');

    if (!result) {
      throw new NotFoundException('Quote not found');
    }

    return result;
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    this.assertInternalQuoteReadAccess(actor);
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return quote;
  }

  // CP-N3b2a: additive, non-finance operational projection of the quote detail.
  // Same explicit internal-role gate as the raw read (fail-closed BEFORE any
  // service call); returns the closed OperationalQuoteDetail allowlist — identical
  // for every authorized role, with no cost / margin / supplier identity / contract
  // identity / token / snapshot / PII beyond { id, firstName, lastName }. The raw
  // GET :id endpoint is intentionally left unchanged (tightened only in a later slice).
  @Get(':id/operational')
  async findOneOperational(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    this.assertInternalQuoteReadAccess(actor);
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return mapQuoteToOperational(quote);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: any,
    @Actor() actor: AuthenticatedActor,
    // Phase 3D.1I.1 — honour the proposal language selector for PDF downloads too.
    @Query('language') language?: string,
  ) {
    console.info('[proposal-v3] controller:pdf-request', { quoteId: id, language });
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const pdfBuffer = await this.proposalV3Service.getProposalPdf(id, actor, language);

    if (!pdfBuffer) {
      throw new NotFoundException('Quote not found');
    }

    const fileName = `${quote.title || 'quote'}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'quote';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
    response.setHeader('X-Proposal-Renderer', DEFAULT_PROPOSAL_VARIANT);

    return new StreamableFile(pdfBuffer);
  }

  @Get(':id/export')
  async exportQuotePdf(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: any,
    @Actor() actor: AuthenticatedActor,
    // Phase 3D.1I.1 — the operator "Export quote PDF" button sends ?language=…;
    // thread it through so the exported PDF matches the chosen language.
    @Query('language') language?: string,
  ) {
    console.info('[quote-export] controller:pdf-request', { quoteId: id, language });
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const pdfBuffer = await this.proposalV3Service.getProposalPdf(id, actor, language);

    if (!pdfBuffer) {
      throw new NotFoundException('Quote not found');
    }

    const fileName = `${quote.title || 'quote'}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'quote';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}-export.pdf"`);
    response.setHeader('X-Proposal-Renderer', DEFAULT_PROPOSAL_VARIANT);

    return new StreamableFile(pdfBuffer);
  }

  @Get(':id/proposal-v2.pdf')
  async downloadProposalV2Pdf(@Param('id') id: string, @Res({ passthrough: true }) response: any, @Actor() actor: AuthenticatedActor) {
    // Temporary internal fallback only. Remove this route when Proposal V2 is retired.
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const pdfBuffer = await this.quotesService.generatePdf(id);
    const fileName =
      `${quote.title || 'quote'}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'quote';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}-proposal-v2.pdf"`);
    response.setHeader('X-Proposal-Renderer', 'v2-fallback');

    return new StreamableFile(pdfBuffer);
  }

  @Get(':quoteId/proposal-v3.html')
  async previewProposalV3Html(
    @Param('quoteId') quoteId: string,
    @Res({ passthrough: true }) response: any,
    @Actor() actor: AuthenticatedActor,
    @Query('language') language?: string,
  ) {
    console.info('[proposal-v3] controller:html-request', { quoteId, language });
    const html = await this.proposalV3Service.getProposalHtml(quoteId, actor, language);

    if (!html) {
      throw new NotFoundException('Quote not found');
    }

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('X-Proposal-Renderer', DEFAULT_PROPOSAL_VARIANT);
    return html;
  }

  @Get(':quoteId/proposal-v3.pdf')
  async downloadProposalV3Pdf(
    @Param('quoteId') quoteId: string,
    @Res({ passthrough: true }) response: any,
    @Actor() actor: AuthenticatedActor,
    @Query('language') language?: string,
  ) {
    const quote = await this.quotesService.findOne(quoteId, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const pdfBuffer = await this.proposalV3Service.getProposalPdf(quoteId, actor, language);

    if (!pdfBuffer) {
      throw new NotFoundException('Quote not found');
    }

    const fileName =
      `${quote.title || 'quote'}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'quote';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}-proposal-v3.pdf"`);
    response.setHeader('X-Proposal-Renderer', DEFAULT_PROPOSAL_VARIANT);

    return new StreamableFile(pdfBuffer);
  }

  @Post(':id/enable-public-link')
  @Roles('admin', 'viewer', 'finance')
  async enablePublicLink(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.enablePublicLink(id, actor);
  }

  @Post(':id/disable-public-link')
  @Roles('admin', 'viewer', 'finance')
  async disablePublicLink(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.disablePublicLink(id, actor);
  }

  @Post(':id/regenerate-public-link')
  @Roles('admin', 'viewer', 'finance')
  async regeneratePublicLink(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.regeneratePublicLink(id, actor);
  }

  // Backend foundation for proposal email send (PR #575). Gated by
  // QUOTE_PROPOSAL_EMAIL_SEND (default OFF) inside the service: when OFF it
  // returns a safe blocked response and sends nothing. Dry-run when SMTP is not
  // configured. Role-gated to admin/operations. Does NOT change quote status.
  @Post(':id/send-proposal-email')
  @Roles('admin', 'operations')
  async sendProposalEmail(
    @Param('id') id: string,
    @Body() body: { attachPdf?: boolean; language?: string } | undefined,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.quotesService.sendProposalEmail(id, actor, {
      attachPdf: body?.attachPdf === true,
      language: typeof body?.language === 'string' ? body.language : undefined,
      getPdf: (language?: string) => this.proposalV3Service.getProposalPdf(id, actor, language),
    });
  }

  @Post()
  @Roles('admin', 'viewer', 'finance')
  create(
    @Body() body: CreateQuoteBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.quotesService.create({
      clientCompanyId: body.clientCompanyId || body.companyId,
      brandCompanyId: body.brandCompanyId === undefined ? undefined : body.brandCompanyId || null,
      contactId: body.contactId,
      agentId: body.agentId === undefined ? undefined : body.agentId || null,
      quoteType: body.quoteType,
      jordanPassType: body.jordanPassType,
      bookingType: body.bookingType,
      title: body.title,
      description: body.description,
      inclusionsText: body.inclusionsText === undefined ? undefined : body.inclusionsText || null,
      exclusionsText: body.exclusionsText === undefined ? undefined : body.exclusionsText || null,
      termsNotesText: body.termsNotesText === undefined ? undefined : body.termsNotesText || null,
      pricingMode: body.pricingMode,
      pricingType: body.pricingType,
      fixedPricePerPerson:
        body.fixedPricePerPerson === undefined
          ? undefined
          : body.fixedPricePerPerson === null
            ? null
            : Number(body.fixedPricePerPerson),
      pricingSlabs: body.pricingSlabs?.map((slab) => ({
        minPax: Number(slab.minPax),
        maxPax: slab.maxPax === undefined || slab.maxPax === null ? null : Number(slab.maxPax),
        price: Number(slab.price),
        focPax: slab.focPax === undefined || slab.focPax === null ? null : Number(slab.focPax),
        notes: slab.notes === undefined ? undefined : slab.notes || null,
      })),
      focType: body.focType,
      focRatio: body.focRatio === undefined ? undefined : body.focRatio === null ? null : Number(body.focRatio),
      focCount: body.focCount === undefined ? undefined : body.focCount === null ? null : Number(body.focCount),
      focRoomType: body.focRoomType === undefined ? undefined : body.focRoomType || null,
      adults: Number(body.adults ?? 1),
      children: Number(body.children ?? 0),
      roomCount: Number(body.roomCount ?? 1),
      nightCount: Number(body.nightCount ?? 1),
      singleSupplement: body.singleSupplement === undefined ? undefined : body.singleSupplement === null ? null : Number(body.singleSupplement),
      travelStartDate:
        body.travelStartDate === undefined ? undefined : body.travelStartDate ? new Date(body.travelStartDate) : null,
      validUntil: body.validUntil === undefined ? undefined : body.validUntil ? new Date(body.validUntil) : null,
      quoteCurrency: body.quoteCurrency,
      proposalLanguage: body.proposalLanguage,
    }, actor);
  }

  @Patch(':id')
  @Roles('admin', 'viewer', 'finance')
  update(
    @Param('id') id: string,
    @Body() body: UpdateQuoteBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.quotesService.update(id, {
      clientCompanyId: body.clientCompanyId || body.companyId,
      brandCompanyId: body.brandCompanyId === undefined ? undefined : body.brandCompanyId || null,
      contactId: body.contactId,
      agentId: body.agentId === undefined ? undefined : body.agentId || null,
      quoteType: body.quoteType,
      jordanPassType: body.jordanPassType,
      bookingType: body.bookingType,
      title: body.title,
      description: body.description,
      inclusionsText: body.inclusionsText === undefined ? undefined : body.inclusionsText || null,
      exclusionsText: body.exclusionsText === undefined ? undefined : body.exclusionsText || null,
      termsNotesText: body.termsNotesText === undefined ? undefined : body.termsNotesText || null,
      pricingMode: body.pricingMode,
      pricingType: body.pricingType,
      fixedPricePerPerson:
        body.fixedPricePerPerson === undefined
          ? undefined
          : body.fixedPricePerPerson === null
            ? null
            : Number(body.fixedPricePerPerson),
      pricingSlabs: body.pricingSlabs?.map((slab) => ({
        minPax: Number(slab.minPax),
        maxPax: slab.maxPax === undefined || slab.maxPax === null ? null : Number(slab.maxPax),
        price: Number(slab.price),
        focPax: slab.focPax === undefined || slab.focPax === null ? null : Number(slab.focPax),
        notes: slab.notes === undefined ? undefined : slab.notes || null,
      })),
      focType: body.focType,
      focRatio: body.focRatio === undefined ? undefined : body.focRatio === null ? null : Number(body.focRatio),
      focCount: body.focCount === undefined ? undefined : body.focCount === null ? null : Number(body.focCount),
      focRoomType: body.focRoomType === undefined ? undefined : body.focRoomType || null,
      adults: body.adults === undefined ? undefined : Number(body.adults),
      children: body.children === undefined ? undefined : Number(body.children),
      roomCount: body.roomCount === undefined ? undefined : Number(body.roomCount),
      nightCount: body.nightCount === undefined ? undefined : Number(body.nightCount),
      singleSupplement:
        body.singleSupplement === undefined ? undefined : body.singleSupplement === null ? null : Number(body.singleSupplement),
      travelStartDate:
        body.travelStartDate === undefined ? undefined : body.travelStartDate ? new Date(body.travelStartDate) : null,
      validUntil: body.validUntil === undefined ? undefined : body.validUntil ? new Date(body.validUntil) : null,
      quoteCurrency: body.quoteCurrency,
      proposalLanguage: body.proposalLanguage,
      status: body.status,
    }, actor);
  }

  @Patch(':id/status')
  @Roles('admin', 'viewer', 'finance')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateQuoteStatusBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.quotesService.updateStatus(id, {
      status: body.status,
      acceptedVersionId: body.acceptedVersionId === undefined ? undefined : body.acceptedVersionId || null,
    }, actor);
  }

  @Patch(':id/cancel')
  @Roles('admin', 'viewer', 'finance')
  cancelQuote(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.quotesService.cancelQuote(id, actor);
  }

  @Patch(':id/items/reorder')
  @Roles('admin', 'viewer', 'finance')
  async reorderItems(
    @Param('id') id: string,
    @Body() body: ReorderQuoteItemsBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.reorderItems(id, {
      day: Number(body.day),
      serviceType: body.serviceType,
      orderedItemIds: Array.isArray(body.orderedItemIds) ? body.orderedItemIds : [],
    }, actor);
  }

  @Patch(':id/items/:itemId/move')
  @Roles('admin', 'viewer', 'finance')
  async moveItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: MoveQuoteItemBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.moveItem(id, itemId, {
      day: Number(body.day),
      serviceType: body.serviceType,
    }, actor);
  }

  @Post(':id/requote')
  @Roles('admin', 'viewer', 'finance')
  requote(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.quotesService.requote(id, actor);
  }

  @Post(':id/create-invoice')
  @Roles('admin', 'viewer', 'finance')
  createInvoice(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.quotesService.createInvoice(id, actor);
  }

  @Delete(':id')
  @Roles('admin', 'viewer')
  remove(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.quotesService.remove(id, actor);
  }

  @Get(':id/pricing-slabs')
  async findPricingSlabs(@Param('id') id: string) {
    const quote = await this.quotesService.findOne(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.findPricingSlabs(id);
  }

  @Post(':id/pricing-slabs')
  @Roles('admin', 'viewer', 'finance')
  async createPricingSlab(
    @Param('id') id: string,
    @Body() body: QuotePricingSlabBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.createPricingSlab(id, {
      minPax: Number(body.minPax),
      maxPax: Number(body.maxPax),
      price: Number(body.price),
    }, actor);
  }

  @Patch(':id/pricing-slabs/:slabId')
  @Roles('admin', 'viewer', 'finance')
  async updatePricingSlab(
    @Param('id') id: string,
    @Param('slabId') slabId: string,
    @Body() body: Partial<QuotePricingSlabBody>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.updatePricingSlab(id, slabId, {
      minPax: body.minPax === undefined ? undefined : Number(body.minPax),
      maxPax: body.maxPax === undefined ? undefined : Number(body.maxPax),
      price: body.price === undefined ? undefined : Number(body.price),
    }, actor);
  }

  @Delete(':id/pricing-slabs/:slabId')
  @Roles('admin', 'viewer', 'finance')
  async removePricingSlab(
    @Param('id') id: string,
    @Param('slabId') slabId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.removePricingSlab(id, slabId, actor);
  }

  @Get(':id/versions')
  @Roles('admin', 'viewer', 'finance')
  async findVersions(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    // Scope + gate the version LIST: same policy as createVersion / version-readiness
    // (role admin/viewer/finance + actor company context via findOne(id, actor)).
    // Previously ungated and called findOne without the actor. Response shape
    // (metadata only) is unchanged.
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.findVersions(id);
  }

  @Get(':id/version-readiness')
  @Roles('admin', 'viewer', 'finance')
  async getVersionReadiness(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.getVersionReadiness(id);
  }

  @Post(':id/convert-to-booking')
  @Roles('admin', 'viewer', 'finance')
  async convertToBooking(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.convertToBooking(id, actor);
  }

  @Post(':id/versions')
  @Roles('admin', 'viewer', 'finance')
  async createVersion(
    @Param('id') id: string,
    @Body() body: CreateQuoteVersionBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.createVersion({
      quoteId: id,
      label: body.label,
    }, actor);
  }

  @Get(':id/versions/:versionId')
  @Roles('admin', 'viewer', 'finance')
  async findVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    // Scope + gate the version DETAIL (which returns the raw QuoteVersion incl.
    // snapshotJson): same policy as createVersion / version-readiness. Previously
    // ungated and called findOne without the actor. findVersion still filters the
    // version to this quote (404 if it belongs to another quote). Response shape
    // is unchanged — surfacing a redacted summary is a later, separate slice.
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const version = await this.quotesService.findVersion(id, versionId);

    if (!version) {
      throw new NotFoundException('Quote version not found');
    }

    return version;
  }

  @Get(':id/versions/:versionId/summary')
  @Roles('admin', 'viewer', 'finance')
  async findVersionSummary(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    // VV-3 Slice 2A: SAFE, whitelist-curated version summary for V2 — never the raw
    // snapshotJson. Same gate + actor scoping as the hardened version routes; the
    // version is scoped to the quote (404 cross-quote). The cost block is included
    // only for cost-visible roles (handled in getVersionSummary). Read-only.
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const summary = await this.quotesService.getVersionSummary(id, versionId, actor);

    if (!summary) {
      throw new NotFoundException('Quote version not found');
    }

    return summary;
  }

  @Get(':id/v2/items/:itemId/hotel-contract-summary')
  @Roles('admin', 'super_admin', 'operations', 'viewer', 'finance')
  async findHotelContractSummary(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    // HC-1: SAFE, whitelist-curated hotel contract/rate summary for a priced hotel
    // QuoteItem (Option C — anchored on the item). Same actor scoping as the other
    // V2 read routes (findOne(id, actor) first), then the item is scoped to the
    // quote (cross-quote/missing/non-hotel → 404). The cost block is included only
    // for cost-visible roles (handled in getHotelContractSummary). Read-only.
    //
    // HC-1A: explicit exact-role allowlist fail-closed. The roles.guard coalesces
    // agent_admin → admin (because @Roles includes 'admin'), so it would otherwise
    // reach this endpoint; this check blocks agent_admin/agent by their ACTUAL role
    // before any quote is loaded. Does not change cost-gating (still via canActorViewCost).
    if (!actor || !HOTEL_CONTRACT_SUMMARY_ROLES.includes(actor.role as DmcRole)) {
      throw new ForbiddenException('You do not have permission to view hotel contract details');
    }

    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const summary = await this.quotesService.getHotelContractSummary(id, itemId, actor);

    if (!summary) {
      throw new NotFoundException('Hotel contract summary not found');
    }

    return summary;
  }

  @Get(':id/items')
  async findItems(@Param('id') id: string) {
    const quote = await this.quotesService.findOne(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.findItems(id);
  }

  @Get(':id/passengers')
  async findPassengers(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.findPassengers(id, actor);
  }

  @Post(':id/passengers')
  @Roles('admin', 'operations', 'viewer')
  async createPassenger(
    @Param('id') id: string,
    @Body() body: QuotePassengerBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.createPassenger(id, this.normalizeQuotePassengerBody(body), actor);
  }

  @Patch(':id/passengers/:passengerId')
  @Roles('admin', 'operations', 'viewer')
  async updatePassenger(
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
    @Body() body: QuotePassengerBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.updatePassenger(id, passengerId, this.normalizeQuotePassengerBody(body), actor);
  }

  @Delete(':id/passengers/:passengerId')
  @Roles('admin', 'operations', 'viewer')
  async removePassenger(
    @Param('id') id: string,
    @Param('passengerId') passengerId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.removePassenger(id, passengerId, actor);
  }

  @Get(':id/rooming')
  async findRoomingGroups(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.findRoomingGroups(id, actor);
  }

  @Post(':id/rooming')
  @Roles('admin', 'operations', 'viewer')
  async createRoomingGroup(
    @Param('id') id: string,
    @Body() body: QuoteRoomingGroupBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.createRoomingGroup(id, body, actor);
  }

  @Patch(':id/rooming/:roomingGroupId')
  @Roles('admin', 'operations', 'viewer')
  async updateRoomingGroup(
    @Param('id') id: string,
    @Param('roomingGroupId') roomingGroupId: string,
    @Body() body: QuoteRoomingGroupBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.updateRoomingGroup(id, roomingGroupId, body, actor);
  }

  @Delete(':id/rooming/:roomingGroupId')
  @Roles('admin', 'operations', 'viewer')
  async deleteRoomingGroup(
    @Param('id') id: string,
    @Param('roomingGroupId') roomingGroupId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.deleteRoomingGroup(id, roomingGroupId, actor);
  }

  @Post(':id/rooming/:roomingGroupId/assignments')
  @Roles('admin', 'operations', 'viewer')
  async assignPassengerToRoomingGroup(
    @Param('id') id: string,
    @Param('roomingGroupId') roomingGroupId: string,
    @Body() body: QuoteRoomingAssignmentBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.assignPassengerToRoomingGroup(id, roomingGroupId, body.quotePassengerId || '', actor);
  }

  @Delete(':id/rooming/:roomingGroupId/assignments/:quotePassengerId')
  @Roles('admin', 'operations', 'viewer')
  async removePassengerFromRoomingGroup(
    @Param('id') id: string,
    @Param('roomingGroupId') roomingGroupId: string,
    @Param('quotePassengerId') quotePassengerId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.removePassengerFromRoomingGroup(id, roomingGroupId, quotePassengerId, actor);
  }

  @Post(':id/items')
  @Roles('admin', 'viewer', 'finance')
  async createItem(
    @Param('id') id: string,
    @Body() body: CreateQuoteItemBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    // CP-N3b1: strip restricted buy-side cost/provenance fields for non-finance
    // actors before mapping (fresh object; request DTO not mutated).
    body = stripRestrictedQuoteCostWriteFields(body, actor);

    return this.quotesService.createItem({
      quoteId: id,
      packageTemplateId: body.packageTemplateId === undefined ? undefined : body.packageTemplateId || null,
      packageTemplateDayId: body.packageTemplateDayId === undefined ? undefined : body.packageTemplateDayId || null,
      packageTemplateComponentId: body.packageTemplateComponentId === undefined ? undefined : body.packageTemplateComponentId || null,
      serviceId: body.serviceId === undefined ? undefined : body.serviceId || null,
      activityId: body.activityId === undefined ? undefined : body.activityId || null,
      activityRateVariantId: body.activityRateVariantId === undefined ? undefined : body.activityRateVariantId || null,
      excursionTemplateId: body.excursionTemplateId === undefined ? undefined : body.excursionTemplateId || null,
      excursionTemplateComponentId:
        body.excursionTemplateComponentId === undefined ? undefined : body.excursionTemplateComponentId || null,
      excursionTemplateComponentOptional:
        body.excursionTemplateComponentOptional === undefined ? undefined : Boolean(body.excursionTemplateComponentOptional),
      ticketRateVariantId: body.ticketRateVariantId === undefined ? undefined : body.ticketRateVariantId || null,
      itineraryId: body.itineraryId || undefined,
      serviceDate: body.serviceDate ? new Date(body.serviceDate) : body.serviceDate === null ? null : undefined,
      startTime: body.startTime === undefined ? undefined : body.startTime || null,
      pickupTime: body.pickupTime === undefined ? undefined : body.pickupTime || null,
      pickupLocation: body.pickupLocation === undefined ? undefined : body.pickupLocation || null,
      meetingPoint: body.meetingPoint === undefined ? undefined : body.meetingPoint || null,
      participantCount:
        body.participantCount === undefined ? undefined : body.participantCount === null ? null : Number(body.participantCount),
      adultCount: body.adultCount === undefined ? undefined : body.adultCount === null ? null : Number(body.adultCount),
      childCount: body.childCount === undefined ? undefined : body.childCount === null ? null : Number(body.childCount),
      reconfirmationRequired:
        body.reconfirmationRequired === undefined ? undefined : Boolean(body.reconfirmationRequired),
      reconfirmationDueAt:
        body.reconfirmationDueAt === undefined
          ? undefined
          : body.reconfirmationDueAt
            ? new Date(body.reconfirmationDueAt)
            : null,
      hotelId: body.hotelId || undefined,
      contractId: body.contractId || undefined,
      seasonId: body.seasonId || undefined,
      seasonName: body.seasonName || undefined,
      roomCategoryId: body.roomCategoryId || undefined,
      occupancyType: body.occupancyType,
      mealPlan: body.mealPlan,
      guideType: body.guideType || undefined,
      guideDuration: body.guideDuration || undefined,
      overnight: body.overnight,
      customServiceName: body.customServiceName === undefined ? undefined : body.customServiceName || null,
      unitCost: body.unitCost === undefined || body.unitCost === null ? body.unitCost : Number(body.unitCost),
      pricingBasis: body.pricingBasis ?? undefined,
      packageName: body.packageName === undefined ? undefined : body.packageName || null,
      country: body.country === undefined ? undefined : body.country || null,
      supplierName: body.supplierName === undefined ? undefined : body.supplierName || null,
      startDay: body.startDay === undefined || body.startDay === null ? body.startDay : Number(body.startDay),
      endDay: body.endDay === undefined || body.endDay === null ? body.endDay : Number(body.endDay),
      startDate: body.startDate === undefined ? undefined : body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate === undefined ? undefined : body.endDate ? new Date(body.endDate) : null,
      netCost: body.netCost === undefined || body.netCost === null ? body.netCost : Number(body.netCost),
      pricingMatrixJson: body.pricingMatrixJson === undefined ? undefined : body.pricingMatrixJson,
      singleSupplement: body.singleSupplement === undefined || body.singleSupplement === null ? body.singleSupplement : Number(body.singleSupplement),
      includes: body.includes === undefined ? undefined : body.includes || null,
      excludes: body.excludes === undefined ? undefined : body.excludes || null,
      internalNotes: body.internalNotes === undefined ? undefined : body.internalNotes || null,
      hotelsOrSimilar: body.hotelsOrSimilar === undefined ? undefined : body.hotelsOrSimilar || null,
      clientDescription: body.clientDescription === undefined ? undefined : body.clientDescription || null,
      quantity: Number(body.quantity ?? 1),
      paxCount: body.paxCount === undefined ? undefined : Number(body.paxCount),
      roomCount: body.roomCount === undefined ? undefined : Number(body.roomCount),
      nightCount: body.nightCount === undefined ? undefined : Number(body.nightCount),
      dayCount: body.dayCount === undefined ? undefined : Number(body.dayCount),
      overrideCost:
        body.overrideCost === undefined ? undefined : body.overrideCost === null ? null : Number(body.overrideCost),
      overrideReason: body.overrideReason === undefined ? undefined : body.overrideReason || null,
      useOverride: body.useOverride === undefined ? undefined : Boolean(body.useOverride),
      markupAmount: body.markupAmount === undefined ? undefined : body.markupAmount === null ? null : Number(body.markupAmount),
      sellPrice: body.sellPrice === undefined ? undefined : body.sellPrice === null ? null : Number(body.sellPrice),
      sellPriceOverrideExplicit: body.sellPriceOverrideExplicit === undefined ? undefined : Boolean(body.sellPriceOverrideExplicit),
      currency: body.currency === undefined ? undefined : (body.currency || '').trim(),
      markupPercent: Number(body.markupPercent ?? 0),
      transportServiceTypeId: body.transportServiceTypeId || undefined,
      vehicleRateId: body.vehicleRateId || undefined,
      transportVehicleId: body.transportVehicleId || undefined,
      routeId: body.routeId || undefined,
      touringRouteId: body.touringRouteId === undefined ? undefined : body.touringRouteId || null,
      touringRoutePricingId: body.touringRoutePricingId === undefined ? undefined : body.touringRoutePricingId || null,
      normalizedKey: body.normalizedKey || undefined,
      routeName: body.routeName || undefined,
      transportLabel: body.transportLabel === undefined ? undefined : body.transportLabel || null,
      standaloneTransfer: body.standaloneTransfer === undefined ? undefined : Boolean(body.standaloneTransfer),
      transportAddOns: Array.isArray(body.transportAddOns)
        ? body.transportAddOns.map((addOn) => ({ rateId: addOn.rateId, quantity: Number(addOn.quantity ?? 0) }))
        : undefined,
    }, actor);
  }

  @Get(':id/package-templates/:templateId/preview')
  async previewPackageTemplateAssembly(
    @Param('id') id: string,
    @Param('templateId') templateId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.previewPackageTemplateAssembly(id, templateId, actor);
  }

  @Post(':id/package-templates/:templateId/apply')
  @Roles('admin', 'viewer', 'finance')
  async applyPackageTemplateAssembly(
    @Param('id') id: string,
    @Param('templateId') templateId: string,
    @Body() body: ApplyPackageTemplateBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.applyPackageTemplateToQuote(
      id,
      {
        packageTemplateId: templateId,
        selectedOptionalComponentIds: Array.isArray(body.selectedOptionalComponentIds) ? body.selectedOptionalComponentIds : [],
      },
      actor,
    );
  }

  @Post(':id/import-program-template')
  @Roles('admin', 'viewer', 'finance')
  async importProgramTemplate(
    @Param('id') id: string,
    @Body() body: ImportProgramTemplateBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.importProgramTemplateToQuote(
      id,
      {
        packageTemplateId: String(body.packageTemplateId || '').trim(),
        startDate: body.startDate || null,
        hotelCategory: body.hotelCategory || null,
        pax: body.pax === undefined || body.pax === null || body.pax === '' ? null : Number(body.pax),
        guideLanguage: body.guideLanguage || null,
      },
      actor,
    );
  }

  @Post(':id/excursion-templates/:templateId/expand')
  @Roles('admin', 'viewer', 'finance')
  async expandExcursionTemplate(
    @Param('id') id: string,
    @Param('templateId') templateId: string,
    @Body() body: ExpandExcursionTemplateBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    // CP-N3b1: strip restricted buy-side cost fields (e.g. markupPercent) for non-finance actors.
    body = stripRestrictedQuoteCostWriteFields(body, actor);

    return this.quotesService.expandExcursionTemplateIntoQuote({
      quoteId: id,
      excursionTemplateId: templateId,
      itineraryId: body.itineraryId || undefined,
      serviceDate: body.serviceDate ? new Date(body.serviceDate) : body.serviceDate === null ? null : undefined,
      selectedOptionalComponentIds: Array.isArray(body.selectedOptionalComponentIds) ? body.selectedOptionalComponentIds : [],
      selectedTouringRouteId: body.selectedTouringRouteId || null,
      selectedTouringRoutePricingId: body.selectedTouringRoutePricingId || null,
      paxCount: body.paxCount === undefined ? undefined : Number(body.paxCount),
      quantity: body.quantity === undefined ? undefined : Number(body.quantity),
      markupPercent: body.markupPercent === undefined ? undefined : Number(body.markupPercent),
    }, actor);
  }

  @Patch(':id/excursion-package-rate')
  @Roles('admin', 'viewer', 'finance')
  setExcursionPackageRate(
    @Param('id') id: string,
    @Body() body: { value?: boolean },
    @Actor() actor: AuthenticatedActor,
  ) {
    return this.quotesService.setExcursionPackageRate(id, Boolean(body?.value), actor);
  }

  @Patch(':id/items/:itemId')
  @Roles('admin', 'viewer', 'finance')
  async updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateQuoteItemBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    // CP-N3b1: strip restricted buy-side cost/provenance fields for non-finance actors.
    return this.quotesService.updateItem(itemId, this.buildUpdateItemServiceInput(id, stripRestrictedQuoteCostWriteFields(body, actor)), actor);
  }

  /**
   * Map the update-item request body to the service input. Shared by updateItem
   * (apply) and the dry-run preview endpoint so both interpret the payload
   * identically. Pure mapping — no side effects.
   */
  private buildUpdateItemServiceInput(id: string, body: UpdateQuoteItemBody) {
    return {
      quoteId: id,
      serviceId: body.serviceId === undefined ? undefined : body.serviceId || null,
      activityId: body.activityId === undefined ? undefined : body.activityId || null,
      activityRateVariantId: body.activityRateVariantId === undefined ? undefined : body.activityRateVariantId || null,
      excursionTemplateId: body.excursionTemplateId === undefined ? undefined : body.excursionTemplateId || null,
      excursionTemplateComponentId:
        body.excursionTemplateComponentId === undefined ? undefined : body.excursionTemplateComponentId || null,
      excursionTemplateComponentOptional:
        body.excursionTemplateComponentOptional === undefined ? undefined : Boolean(body.excursionTemplateComponentOptional),
      ticketRateVariantId: body.ticketRateVariantId === undefined ? undefined : body.ticketRateVariantId || null,
      itineraryId: body.itineraryId || undefined,
      serviceDate: body.serviceDate ? new Date(body.serviceDate) : body.serviceDate === null ? null : undefined,
      startTime: body.startTime === undefined ? undefined : body.startTime || null,
      pickupTime: body.pickupTime === undefined ? undefined : body.pickupTime || null,
      pickupLocation: body.pickupLocation === undefined ? undefined : body.pickupLocation || null,
      meetingPoint: body.meetingPoint === undefined ? undefined : body.meetingPoint || null,
      participantCount:
        body.participantCount === undefined ? undefined : body.participantCount === null ? null : Number(body.participantCount),
      adultCount: body.adultCount === undefined ? undefined : body.adultCount === null ? null : Number(body.adultCount),
      childCount: body.childCount === undefined ? undefined : body.childCount === null ? null : Number(body.childCount),
      reconfirmationRequired:
        body.reconfirmationRequired === undefined ? undefined : Boolean(body.reconfirmationRequired),
      reconfirmationDueAt:
        body.reconfirmationDueAt === undefined
          ? undefined
          : body.reconfirmationDueAt
            ? new Date(body.reconfirmationDueAt)
            : null,
      hotelId: body.hotelId || undefined,
      contractId: body.contractId || undefined,
      seasonId: body.seasonId || undefined,
      seasonName: body.seasonName || undefined,
      roomCategoryId: body.roomCategoryId || undefined,
      occupancyType: body.occupancyType,
      mealPlan: body.mealPlan,
      guideType: body.guideType || undefined,
      guideDuration: body.guideDuration || undefined,
      overnight: body.overnight,
      customServiceName: body.customServiceName === undefined ? undefined : body.customServiceName || null,
      unitCost: body.unitCost === undefined || body.unitCost === null ? body.unitCost : Number(body.unitCost),
      pricingBasis: body.pricingBasis ?? undefined,
      packageName: body.packageName === undefined ? undefined : body.packageName || null,
      country: body.country === undefined ? undefined : body.country || null,
      supplierName: body.supplierName === undefined ? undefined : body.supplierName || null,
      startDay: body.startDay === undefined || body.startDay === null ? body.startDay : Number(body.startDay),
      endDay: body.endDay === undefined || body.endDay === null ? body.endDay : Number(body.endDay),
      startDate: body.startDate === undefined ? undefined : body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate === undefined ? undefined : body.endDate ? new Date(body.endDate) : null,
      netCost: body.netCost === undefined || body.netCost === null ? body.netCost : Number(body.netCost),
      pricingMatrixJson: body.pricingMatrixJson === undefined ? undefined : body.pricingMatrixJson,
      singleSupplement: body.singleSupplement === undefined || body.singleSupplement === null ? body.singleSupplement : Number(body.singleSupplement),
      includes: body.includes === undefined ? undefined : body.includes || null,
      excludes: body.excludes === undefined ? undefined : body.excludes || null,
      internalNotes: body.internalNotes === undefined ? undefined : body.internalNotes || null,
      hotelsOrSimilar: body.hotelsOrSimilar === undefined ? undefined : body.hotelsOrSimilar || null,
      clientDescription: body.clientDescription === undefined ? undefined : body.clientDescription || null,
      quantity: body.quantity === undefined ? undefined : Number(body.quantity),
      paxCount: body.paxCount === undefined ? undefined : Number(body.paxCount),
      roomCount: body.roomCount === undefined ? undefined : Number(body.roomCount),
      nightCount: body.nightCount === undefined ? undefined : Number(body.nightCount),
      dayCount: body.dayCount === undefined ? undefined : Number(body.dayCount),
      overrideCost:
        body.overrideCost === undefined ? undefined : body.overrideCost === null ? null : Number(body.overrideCost),
      overrideReason: body.overrideReason === undefined ? undefined : body.overrideReason || null,
      useOverride: body.useOverride === undefined ? undefined : Boolean(body.useOverride),
      markupAmount: body.markupAmount === undefined ? undefined : body.markupAmount === null ? null : Number(body.markupAmount),
      sellPrice: body.sellPrice === undefined ? undefined : body.sellPrice === null ? null : Number(body.sellPrice),
      sellPriceOverrideExplicit: body.sellPriceOverrideExplicit === undefined ? undefined : Boolean(body.sellPriceOverrideExplicit),
      currency: body.currency === undefined ? undefined : (body.currency || '').trim(),
      markupPercent: body.markupPercent === undefined ? undefined : Number(body.markupPercent),
      transportServiceTypeId: body.transportServiceTypeId || undefined,
      vehicleRateId: body.vehicleRateId || undefined,
      touringRouteId: body.touringRouteId === undefined ? undefined : body.touringRouteId || null,
      touringRoutePricingId: body.touringRoutePricingId === undefined ? undefined : body.touringRoutePricingId || null,
      transportVehicleId: body.transportVehicleId || undefined,
      routeId: body.routeId || undefined,
      normalizedKey: body.normalizedKey || undefined,
      routeName: body.routeName || undefined,
      transportLabel: body.transportLabel === undefined ? undefined : body.transportLabel || null,
      standaloneTransfer: body.standaloneTransfer === undefined ? undefined : Boolean(body.standaloneTransfer),
      transportAddOns: Array.isArray(body.transportAddOns)
        ? body.transportAddOns.map((addOn) => ({ rateId: addOn.rateId, quantity: Number(addOn.quantity ?? 0) }))
        : undefined,
    };
  }

  @Post(':id/items/:itemId/preview')
  @Roles('admin', 'operations')
  async previewItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateQuoteItemBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    // Dry-run pricing preview for editing one existing item. Persists nothing and
    // never recalculates the live quote. Flag-gated (default OFF) + status/role
    // guarded inside the service; reuses the same body mapping as the real edit.
    return this.quotesService.previewUpdateQuoteItem(
      id,
      itemId,
      // CP-N3b1: non-finance actors cannot inject cost/provenance via the dry-run.
      this.buildUpdateItemServiceInput(id, stripRestrictedQuoteCostWriteFields(body, actor)),
      actor,
    );
  }

  @Post(':id/items/:itemId/apply-preview')
  @Roles('admin', 'operations')
  async applyPreviewItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateQuoteItemBody & { previewToken?: string; acknowledgedDelta?: boolean },
    @Actor() actor: AuthenticatedActor,
  ) {
    // Apply a previously-previewed MEAL edit. Validates the stateless preview
    // token, re-derives the dry-run, and only on a full match delegates to the
    // existing updateItem write path. Dual-flag-gated (QUOTE_PRICING_PREVIEW +
    // QUOTE_PRICING_APPLY, both default OFF) and status/role/meal guarded inside
    // the service. The same body mapping as the real edit is used so the applied
    // payload matches what was previewed.
    const { previewToken, acknowledgedDelta, ...editBody } = body ?? {};
    return this.quotesService.applyPreviewQuoteItem(
      id,
      itemId,
      // CP-N3b1: client cost values are not trusted on apply just because they were
      // echoed from a prior server response — strip them for non-finance actors.
      this.buildUpdateItemServiceInput(id, stripRestrictedQuoteCostWriteFields(editBody, actor)),
      previewToken,
      Boolean(acknowledgedDelta),
      actor,
    );
  }

  @Get(':id/pricing-apply-audit')
  @Roles('admin', 'operations')
  async getPricingApplyAudit(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    // Read-only audit history of V2 pricing applies for this quote. Returns only
    // sanitized `quote.pricing.apply` entries (no tokens/secrets/raw metadata),
    // scoped by the same access as the quote write path.
    return this.quotesService.getPricingApplyAudit(id, actor);
  }

  @Get(':id/items/:itemId/suggested-services')
  async findSuggestedServices(@Param('id') id: string, @Param('itemId') itemId: string) {
    const quote = await this.quotesService.findOne(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.findSuggestedServices(id, itemId);
  }

  @Patch(':id/items/:itemId/assign-service')
  @Roles('admin', 'viewer', 'finance')
  async assignService(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: AssignQuoteItemServiceBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.assignServiceToItem(id, itemId, body.serviceId, actor);
  }

  @Delete(':id/items/:itemId')
  @Roles('admin', 'viewer', 'finance')
  async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.removeItem(itemId, actor);
  }

  @Patch(':id/items/:itemId/detach-contract')
  @Roles('admin', 'viewer', 'finance')
  async detachItemHotelContract(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.detachItemHotelContract(id, itemId, actor);
  }

  // Pricing-inert client-facing display-text update. Updates ONLY the whitelisted
  // text fields; never re-prices the quote. The raw body is forwarded so the
  // service can STRICT-reject (400) any non-whitelisted field (totals,
  // quantities, IDs, serviceDate, currency/FX, etc.) instead of silently
  // ignoring it.
  @Patch(':id/items/:itemId/display-text')
  @Roles('admin', 'finance')
  async updateItemDisplayText(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateQuoteItemDisplayTextBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.updateItemDisplayText(
      id,
      itemId,
      (body ?? {}) as Record<string, unknown>,
      actor,
    );
  }

  @Get(':id/options')
  async findOptions(@Param('id') id: string) {
    const quote = await this.quotesService.findOne(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.findOptions(id);
  }

  @Post(':id/options')
  @Roles('admin', 'viewer', 'finance')
  async createOption(
    @Param('id') id: string,
    @Body() body: CreateQuoteOptionBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.createOption({
      quoteId: id,
      kind: body.kind === 'HOTEL_OPTION_SET' ? QuoteOptionKind.HOTEL_OPTION_SET : undefined,
      name: body.name,
      notes: body.notes,
      hotelCategoryId: body.hotelCategoryId,
      pricingMode: body.pricingMode,
      packageMarginPercent: body.packageMarginPercent,
    }, actor);
  }

  @Patch(':id/options/:optionId')
  @Roles('admin', 'viewer', 'finance')
  async updateOption(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body() body: UpdateQuoteOptionBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.updateOption(optionId, {
      name: body.name,
      notes: body.notes,
      hotelCategoryId: body.hotelCategoryId,
      pricingMode: body.pricingMode,
      packageMarginPercent: body.packageMarginPercent,
    }, actor);
  }

  @Delete(':id/options/:optionId')
  @Roles('admin', 'viewer', 'finance')
  async removeOption(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Query('kind') kind: 'HOTEL_OPTION_SET' | 'COMMERCIAL_OPTION' | undefined,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.removeOption(
      id,
      optionId,
      actor,
      kind === 'HOTEL_OPTION_SET' ? { expectedKind: QuoteOptionKind.HOTEL_OPTION_SET } : undefined,
    );
  }

  @Post(':id/options/:optionId/hotel-options')
  @Roles('admin', 'viewer', 'finance')
  async createHotelOptionAlternative(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body() body: CreateQuoteHotelOptionBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.createHotelOptionAlternative(id, optionId, body, actor);
  }

  @Patch(':id/options/:optionId/hotel-options/:hotelOptionId')
  @Roles('admin', 'viewer', 'finance')
  async updateHotelOptionAlternative(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Param('hotelOptionId') hotelOptionId: string,
    @Body() body: UpdateQuoteHotelOptionBody,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.updateHotelOptionAlternative(id, optionId, hotelOptionId, body, actor);
  }

  @Delete(':id/options/:optionId/hotel-options/:hotelOptionId')
  @Roles('admin', 'viewer', 'finance')
  async removeHotelOptionAlternative(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Param('hotelOptionId') hotelOptionId: string,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.removeHotelOptionAlternative(id, optionId, hotelOptionId, actor);
  }

  @Get(':id/options/:optionId/items')
  async findOptionItems(@Param('id') id: string, @Param('optionId') optionId: string) {
    const quote = await this.quotesService.findOne(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.findOptionItems(id, optionId);
  }

  @Post(':id/options/:optionId/items')
  @Roles('admin', 'viewer', 'finance')
  async createOptionItem(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Body() body: CreateQuoteItemBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    // CP-N3b1: strip restricted buy-side cost/provenance fields for non-finance actors.
    body = stripRestrictedQuoteCostWriteFields(body, actor);

    return this.quotesService.createOptionItem(optionId, {
      quoteId: id,
      serviceId: body.serviceId || null,
      activityId: body.activityId === undefined ? undefined : body.activityId || null,
      activityRateVariantId: body.activityRateVariantId === undefined ? undefined : body.activityRateVariantId || null,
      excursionTemplateId: body.excursionTemplateId === undefined ? undefined : body.excursionTemplateId || null,
      excursionTemplateComponentId:
        body.excursionTemplateComponentId === undefined ? undefined : body.excursionTemplateComponentId || null,
      excursionTemplateComponentOptional:
        body.excursionTemplateComponentOptional === undefined ? undefined : Boolean(body.excursionTemplateComponentOptional),
      ticketRateVariantId: body.ticketRateVariantId === undefined ? undefined : body.ticketRateVariantId || null,
      itineraryId: body.itineraryId || undefined,
      serviceDate: body.serviceDate ? new Date(body.serviceDate) : body.serviceDate === null ? null : undefined,
      startTime: body.startTime === undefined ? undefined : body.startTime || null,
      pickupTime: body.pickupTime === undefined ? undefined : body.pickupTime || null,
      pickupLocation: body.pickupLocation === undefined ? undefined : body.pickupLocation || null,
      meetingPoint: body.meetingPoint === undefined ? undefined : body.meetingPoint || null,
      participantCount:
        body.participantCount === undefined ? undefined : body.participantCount === null ? null : Number(body.participantCount),
      adultCount: body.adultCount === undefined ? undefined : body.adultCount === null ? null : Number(body.adultCount),
      childCount: body.childCount === undefined ? undefined : body.childCount === null ? null : Number(body.childCount),
      reconfirmationRequired:
        body.reconfirmationRequired === undefined ? undefined : Boolean(body.reconfirmationRequired),
      reconfirmationDueAt:
        body.reconfirmationDueAt === undefined
          ? undefined
          : body.reconfirmationDueAt
            ? new Date(body.reconfirmationDueAt)
            : null,
      hotelId: body.hotelId || undefined,
      contractId: body.contractId || undefined,
      seasonId: body.seasonId || undefined,
      seasonName: body.seasonName || undefined,
      roomCategoryId: body.roomCategoryId || undefined,
      occupancyType: body.occupancyType,
      mealPlan: body.mealPlan,
      guideType: body.guideType || undefined,
      guideDuration: body.guideDuration || undefined,
      overnight: body.overnight,
      customServiceName: body.customServiceName === undefined ? undefined : body.customServiceName || null,
      unitCost: body.unitCost === undefined || body.unitCost === null ? body.unitCost : Number(body.unitCost),
      pricingBasis: body.pricingBasis ?? undefined,
      packageName: body.packageName === undefined ? undefined : body.packageName || null,
      country: body.country === undefined ? undefined : body.country || null,
      supplierName: body.supplierName === undefined ? undefined : body.supplierName || null,
      startDay: body.startDay === undefined || body.startDay === null ? body.startDay : Number(body.startDay),
      endDay: body.endDay === undefined || body.endDay === null ? body.endDay : Number(body.endDay),
      startDate: body.startDate === undefined ? undefined : body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate === undefined ? undefined : body.endDate ? new Date(body.endDate) : null,
      netCost: body.netCost === undefined || body.netCost === null ? body.netCost : Number(body.netCost),
      pricingMatrixJson: body.pricingMatrixJson === undefined ? undefined : body.pricingMatrixJson,
      singleSupplement: body.singleSupplement === undefined || body.singleSupplement === null ? body.singleSupplement : Number(body.singleSupplement),
      includes: body.includes === undefined ? undefined : body.includes || null,
      excludes: body.excludes === undefined ? undefined : body.excludes || null,
      internalNotes: body.internalNotes === undefined ? undefined : body.internalNotes || null,
      hotelsOrSimilar: body.hotelsOrSimilar === undefined ? undefined : body.hotelsOrSimilar || null,
      clientDescription: body.clientDescription === undefined ? undefined : body.clientDescription || null,
      quantity: Number(body.quantity ?? 1),
      paxCount: body.paxCount === undefined ? undefined : Number(body.paxCount),
      roomCount: body.roomCount === undefined ? undefined : Number(body.roomCount),
      nightCount: body.nightCount === undefined ? undefined : Number(body.nightCount),
      dayCount: body.dayCount === undefined ? undefined : Number(body.dayCount),
      overrideCost:
        body.overrideCost === undefined ? undefined : body.overrideCost === null ? null : Number(body.overrideCost),
      overrideReason: body.overrideReason === undefined ? undefined : body.overrideReason || null,
      useOverride: body.useOverride === undefined ? undefined : Boolean(body.useOverride),
      markupAmount: body.markupAmount === undefined ? undefined : body.markupAmount === null ? null : Number(body.markupAmount),
      sellPrice: body.sellPrice === undefined ? undefined : body.sellPrice === null ? null : Number(body.sellPrice),
      sellPriceOverrideExplicit: body.sellPriceOverrideExplicit === undefined ? undefined : Boolean(body.sellPriceOverrideExplicit),
      currency: body.currency === undefined ? undefined : (body.currency || '').trim(),
      markupPercent: Number(body.markupPercent ?? 0),
      transportServiceTypeId: body.transportServiceTypeId || undefined,
      vehicleRateId: body.vehicleRateId || undefined,
      touringRoutePricingId: body.touringRoutePricingId || undefined,
      transportVehicleId: body.transportVehicleId || undefined,
      routeId: body.routeId || undefined,
      normalizedKey: body.normalizedKey || undefined,
      routeName: body.routeName || undefined,
      transportLabel: body.transportLabel === undefined ? undefined : body.transportLabel || null,
      standaloneTransfer: body.standaloneTransfer === undefined ? undefined : Boolean(body.standaloneTransfer),
      transportAddOns: Array.isArray(body.transportAddOns)
        ? body.transportAddOns.map((addOn) => ({ rateId: addOn.rateId, quantity: Number(addOn.quantity ?? 0) }))
        : undefined,
    }, actor);
  }

  @Patch(':id/options/:optionId/items/:itemId')
  @Roles('admin', 'viewer', 'finance')
  async updateOptionItem(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateQuoteItemBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    // CP-N3b1: strip restricted buy-side cost/provenance fields for non-finance actors.
    body = stripRestrictedQuoteCostWriteFields(body, actor);

    return this.quotesService.updateOptionItem(optionId, itemId, {
      serviceId: body.serviceId === undefined ? undefined : body.serviceId || null,
      activityId: body.activityId === undefined ? undefined : body.activityId || null,
      activityRateVariantId: body.activityRateVariantId === undefined ? undefined : body.activityRateVariantId || null,
      excursionTemplateId: body.excursionTemplateId === undefined ? undefined : body.excursionTemplateId || null,
      excursionTemplateComponentId:
        body.excursionTemplateComponentId === undefined ? undefined : body.excursionTemplateComponentId || null,
      excursionTemplateComponentOptional:
        body.excursionTemplateComponentOptional === undefined ? undefined : Boolean(body.excursionTemplateComponentOptional),
      ticketRateVariantId: body.ticketRateVariantId === undefined ? undefined : body.ticketRateVariantId || null,
      itineraryId: body.itineraryId || undefined,
      serviceDate: body.serviceDate ? new Date(body.serviceDate) : body.serviceDate === null ? null : undefined,
      startTime: body.startTime === undefined ? undefined : body.startTime || null,
      pickupTime: body.pickupTime === undefined ? undefined : body.pickupTime || null,
      pickupLocation: body.pickupLocation === undefined ? undefined : body.pickupLocation || null,
      meetingPoint: body.meetingPoint === undefined ? undefined : body.meetingPoint || null,
      participantCount:
        body.participantCount === undefined ? undefined : body.participantCount === null ? null : Number(body.participantCount),
      adultCount: body.adultCount === undefined ? undefined : body.adultCount === null ? null : Number(body.adultCount),
      childCount: body.childCount === undefined ? undefined : body.childCount === null ? null : Number(body.childCount),
      reconfirmationRequired:
        body.reconfirmationRequired === undefined ? undefined : Boolean(body.reconfirmationRequired),
      reconfirmationDueAt:
        body.reconfirmationDueAt === undefined
          ? undefined
          : body.reconfirmationDueAt
            ? new Date(body.reconfirmationDueAt)
            : null,
      hotelId: body.hotelId || undefined,
      contractId: body.contractId || undefined,
      seasonId: body.seasonId || undefined,
      seasonName: body.seasonName || undefined,
      roomCategoryId: body.roomCategoryId || undefined,
      occupancyType: body.occupancyType,
      mealPlan: body.mealPlan,
      guideType: body.guideType || undefined,
      guideDuration: body.guideDuration || undefined,
      overnight: body.overnight,
      customServiceName: body.customServiceName === undefined ? undefined : body.customServiceName || null,
      unitCost: body.unitCost === undefined || body.unitCost === null ? body.unitCost : Number(body.unitCost),
      pricingBasis: body.pricingBasis ?? undefined,
      packageName: body.packageName === undefined ? undefined : body.packageName || null,
      country: body.country === undefined ? undefined : body.country || null,
      supplierName: body.supplierName === undefined ? undefined : body.supplierName || null,
      startDay: body.startDay === undefined || body.startDay === null ? body.startDay : Number(body.startDay),
      endDay: body.endDay === undefined || body.endDay === null ? body.endDay : Number(body.endDay),
      startDate: body.startDate === undefined ? undefined : body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate === undefined ? undefined : body.endDate ? new Date(body.endDate) : null,
      netCost: body.netCost === undefined || body.netCost === null ? body.netCost : Number(body.netCost),
      pricingMatrixJson: body.pricingMatrixJson === undefined ? undefined : body.pricingMatrixJson,
      singleSupplement: body.singleSupplement === undefined || body.singleSupplement === null ? body.singleSupplement : Number(body.singleSupplement),
      includes: body.includes === undefined ? undefined : body.includes || null,
      excludes: body.excludes === undefined ? undefined : body.excludes || null,
      internalNotes: body.internalNotes === undefined ? undefined : body.internalNotes || null,
      hotelsOrSimilar: body.hotelsOrSimilar === undefined ? undefined : body.hotelsOrSimilar || null,
      clientDescription: body.clientDescription === undefined ? undefined : body.clientDescription || null,
      quantity: body.quantity === undefined ? undefined : Number(body.quantity),
      paxCount: body.paxCount === undefined ? undefined : Number(body.paxCount),
      roomCount: body.roomCount === undefined ? undefined : Number(body.roomCount),
      nightCount: body.nightCount === undefined ? undefined : Number(body.nightCount),
      dayCount: body.dayCount === undefined ? undefined : Number(body.dayCount),
      overrideCost:
        body.overrideCost === undefined ? undefined : body.overrideCost === null ? null : Number(body.overrideCost),
      overrideReason: body.overrideReason === undefined ? undefined : body.overrideReason || null,
      useOverride: body.useOverride === undefined ? undefined : Boolean(body.useOverride),
      markupAmount: body.markupAmount === undefined ? undefined : body.markupAmount === null ? null : Number(body.markupAmount),
      sellPrice: body.sellPrice === undefined ? undefined : body.sellPrice === null ? null : Number(body.sellPrice),
      sellPriceOverrideExplicit: body.sellPriceOverrideExplicit === undefined ? undefined : Boolean(body.sellPriceOverrideExplicit),
      currency: body.currency === undefined ? undefined : (body.currency || '').trim(),
      markupPercent: body.markupPercent === undefined ? undefined : Number(body.markupPercent),
      transportServiceTypeId: body.transportServiceTypeId || undefined,
      vehicleRateId: body.vehicleRateId || undefined,
      touringRoutePricingId: body.touringRoutePricingId || undefined,
      transportVehicleId: body.transportVehicleId || undefined,
      routeId: body.routeId || undefined,
      normalizedKey: body.normalizedKey || undefined,
      routeName: body.routeName || undefined,
      transportLabel: body.transportLabel === undefined ? undefined : body.transportLabel || null,
      standaloneTransfer: body.standaloneTransfer === undefined ? undefined : Boolean(body.standaloneTransfer),
      transportAddOns: Array.isArray(body.transportAddOns)
        ? body.transportAddOns.map((addOn) => ({ rateId: addOn.rateId, quantity: Number(addOn.quantity ?? 0) }))
        : undefined,
    }, actor);
  }

  @Delete(':id/options/:optionId/items/:itemId')
  @Roles('admin', 'viewer', 'finance')
  async removeOptionItem(
    @Param('id') id: string,
    @Param('optionId') optionId: string,
    @Param('itemId') itemId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.removeOptionItem(optionId, itemId, actor);
  }

  @Post(':id/scenarios/generate')
  @Roles('admin', 'viewer', 'finance')
  async generateScenarios(
    @Param('id') id: string,
    @Body() body: GenerateQuoteScenariosBody,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const quote = await this.quotesService.findOne(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.generateScenarios({
      quoteId: id,
      paxCounts: Array.isArray(body.paxCounts) ? body.paxCounts : [],
    });
  }
}

