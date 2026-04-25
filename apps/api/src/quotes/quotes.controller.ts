import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { HotelMealPlan, HotelOccupancyType, QuoteStatus } from '@prisma/client';
import { Actor, Public, Roles } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { ProposalV3Service } from './proposal-v3.service';
import { QuotesService } from './quotes.service';

type QuotePricingType = 'simple' | 'group';
type QuotePricingMode = 'SLAB' | 'FIXED';
type QuoteFocType = 'none' | 'ratio' | 'fixed';
type QuoteFocRoomType = 'single' | 'double';
type QuoteTypeValue = 'FIT' | 'GROUP';
type QuoteBookingType = 'FIT' | 'GROUP' | 'SERIES';

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
};

type UpdateQuoteBody = Partial<CreateQuoteBody> & {
  status?: QuoteStatus;
};

type UpdateQuoteStatusBody = {
  status: QuoteStatus;
  acceptedVersionId?: string | null;
};

type CreateQuoteItemBody = {
  serviceId: string;
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
  quantity?: number;
  paxCount?: number;
  roomCount?: number;
  nightCount?: number;
  dayCount?: number;
  overrideCost?: number | null;
  useOverride?: boolean;
  currency?: string | null;
  markupPercent?: number;
  transportServiceTypeId?: string;
  routeId?: string;
  routeName?: string;
};

type UpdateQuoteItemBody = Partial<CreateQuoteItemBody>;

type AssignQuoteItemServiceBody = {
  serviceId: string;
};

type CreateQuoteOptionBody = {
  name?: string;
  notes?: string;
  hotelCategoryId?: string | null;
  pricingMode?: 'itemized' | 'package';
  packageMarginPercent?: number | null;
};

type UpdateQuoteOptionBody = Partial<CreateQuoteOptionBody>;

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

  @Get()
  findAll(@Actor() actor: AuthenticatedActor) {
    return this.quotesService.findAll(actor);
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
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return quote;
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res({ passthrough: true }) response: any, @Actor() actor: AuthenticatedActor) {
    console.info('[proposal-v3] controller:pdf-request', { quoteId: id });
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const pdfBuffer = await this.proposalV3Service.getProposalPdf(id, actor);

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
  ) {
    console.info('[proposal-v3] controller:html-request', { quoteId });
    const html = await this.proposalV3Service.getProposalHtml(quoteId, actor);

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
  ) {
    const quote = await this.quotesService.findOne(quoteId, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const pdfBuffer = await this.proposalV3Service.getProposalPdf(quoteId, actor);

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
  async findVersions(@Param('id') id: string) {
    const quote = await this.quotesService.findOne(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.findVersions(id);
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
  async findVersion(@Param('id') id: string, @Param('versionId') versionId: string) {
    const quote = await this.quotesService.findOne(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    const version = await this.quotesService.findVersion(id, versionId);

    if (!version) {
      throw new NotFoundException('Quote version not found');
    }

    return version;
  }

  @Get(':id/items')
  async findItems(@Param('id') id: string) {
    const quote = await this.quotesService.findOne(id);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.findItems(id);
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

    return this.quotesService.createItem({
      quoteId: id,
      serviceId: body.serviceId,
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
      quantity: Number(body.quantity ?? 1),
      paxCount: body.paxCount === undefined ? undefined : Number(body.paxCount),
      roomCount: body.roomCount === undefined ? undefined : Number(body.roomCount),
      nightCount: body.nightCount === undefined ? undefined : Number(body.nightCount),
      dayCount: body.dayCount === undefined ? undefined : Number(body.dayCount),
      overrideCost:
        body.overrideCost === undefined ? undefined : body.overrideCost === null ? null : Number(body.overrideCost),
      useOverride: body.useOverride === undefined ? undefined : Boolean(body.useOverride),
      markupPercent: Number(body.markupPercent ?? 0),
      transportServiceTypeId: body.transportServiceTypeId || undefined,
      routeId: body.routeId || undefined,
      routeName: body.routeName || undefined,
    }, actor);
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

    return this.quotesService.updateItem(itemId, {
      quoteId: id,
      serviceId: body.serviceId,
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
      quantity: body.quantity === undefined ? undefined : Number(body.quantity),
      paxCount: body.paxCount === undefined ? undefined : Number(body.paxCount),
      roomCount: body.roomCount === undefined ? undefined : Number(body.roomCount),
      nightCount: body.nightCount === undefined ? undefined : Number(body.nightCount),
      dayCount: body.dayCount === undefined ? undefined : Number(body.dayCount),
      overrideCost:
        body.overrideCost === undefined ? undefined : body.overrideCost === null ? null : Number(body.overrideCost),
      useOverride: body.useOverride === undefined ? undefined : Boolean(body.useOverride),
      currency: body.currency === undefined ? undefined : (body.currency || '').trim(),
      markupPercent: body.markupPercent === undefined ? undefined : Number(body.markupPercent),
      transportServiceTypeId: body.transportServiceTypeId || undefined,
      routeId: body.routeId || undefined,
      routeName: body.routeName || undefined,
    }, actor);
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
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Actor() actor: AuthenticatedActor,
  ) {
    const quote = await this.quotesService.findOne(id, actor);

    if (!quote) {
      throw new NotFoundException('Quote not found');
    }

    return this.quotesService.removeOption(id, optionId, actor);
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

    return this.quotesService.createOptionItem(optionId, {
      quoteId: id,
      serviceId: body.serviceId,
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
      quantity: Number(body.quantity ?? 1),
      paxCount: body.paxCount === undefined ? undefined : Number(body.paxCount),
      roomCount: body.roomCount === undefined ? undefined : Number(body.roomCount),
      nightCount: body.nightCount === undefined ? undefined : Number(body.nightCount),
      dayCount: body.dayCount === undefined ? undefined : Number(body.dayCount),
      overrideCost:
        body.overrideCost === undefined ? undefined : body.overrideCost === null ? null : Number(body.overrideCost),
      useOverride: body.useOverride === undefined ? undefined : Boolean(body.useOverride),
      markupPercent: Number(body.markupPercent ?? 0),
      transportServiceTypeId: body.transportServiceTypeId || undefined,
      routeId: body.routeId || undefined,
      routeName: body.routeName || undefined,
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

    return this.quotesService.updateOptionItem(optionId, itemId, {
      serviceId: body.serviceId,
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
      quantity: body.quantity === undefined ? undefined : Number(body.quantity),
      paxCount: body.paxCount === undefined ? undefined : Number(body.paxCount),
      roomCount: body.roomCount === undefined ? undefined : Number(body.roomCount),
      nightCount: body.nightCount === undefined ? undefined : Number(body.nightCount),
      dayCount: body.dayCount === undefined ? undefined : Number(body.dayCount),
      overrideCost:
        body.overrideCost === undefined ? undefined : body.overrideCost === null ? null : Number(body.overrideCost),
      useOverride: body.useOverride === undefined ? undefined : Boolean(body.useOverride),
      currency: body.currency === undefined ? undefined : (body.currency || '').trim(),
      markupPercent: body.markupPercent === undefined ? undefined : Number(body.markupPercent),
      transportServiceTypeId: body.transportServiceTypeId || undefined,
      routeId: body.routeId || undefined,
      routeName: body.routeName || undefined,
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

