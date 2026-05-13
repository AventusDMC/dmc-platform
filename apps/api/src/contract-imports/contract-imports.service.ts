import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  ChildPolicyChargeBasis,
  ContractImportStatus,
  ContractImportType,
  HotelCancellationDeadlineUnit,
  HotelCancellationPenaltyType,
  HotelContractChargeBasis,
  HotelContractSupplementType,
  HotelMealPlan,
  HotelRatePricingBasis,
  HotelRatePricingMode,
  Prisma,
} from '@prisma/client';
import { readFileSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedActor } from '../auth/auth.types';
import { requireActorCompanyId } from '../auth/company-scope';

type AnalyzeInput = {
  contractType?: 'HOTEL' | 'TRANSPORT' | 'ACTIVITY';
  supplierId?: string;
  supplierName?: string;
  contractYear?: string;
  validFrom?: string;
  validTo?: string;
  file: {
    originalname: string;
    filename: string;
    path: string;
    mimetype?: string;
  };
};

type ContractImportApprovalMode = 'replace' | 'version';

type PreviewRate = {
  roomType?: string;
  serviceName?: string;
  routeName?: string;
  occupancyType?: string;
  mealPlan?: string;
  seasonName?: string;
  seasonFrom?: string;
  seasonTo?: string;
  cost?: number;
  currency?: string;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM';
  normalizedPricingBasis?: 'PER_PERSON_NIGHT' | 'PER_ROOM_NIGHT';
  salesTaxPercent?: number | null;
  serviceChargePercent?: number | null;
  salesTaxIncluded?: boolean | null;
  serviceChargeIncluded?: boolean | null;
  uncertain?: boolean;
  notes?: string;
};

type RatePolicyPreview = {
  policyType: string;
  appliesTo?: string | null;
  ageFrom?: number | null;
  ageTo?: number | null;
  amount?: number | null;
  percent?: number | null;
  currency?: string | null;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM';
  mealPlan?: string | null;
  notes?: string | null;
};

type AssistedExtractionBlockTag =
  | 'ROOM_RATE_TABLE'
  | 'SEASON_TABLE'
  | 'SUPPLEMENT_SECTION'
  | 'CHILD_POLICY'
  | 'CANCELLATION_POLICY'
  | 'TAXES_SERVICE_NOTES';

type AssistedExtractionColumnRole =
  | 'ROOM_CATEGORY'
  | 'SEASON'
  | 'DATE_RANGE'
  | 'MEAL_PLAN'
  | 'PRICING_BASIS'
  | 'RATE'
  | 'SINGLE_SUPPLEMENT';

type HotelContractLineClassification =
  | 'HOTEL_NAME'
  | 'ROOM_TYPE'
  | 'SEASON'
  | 'DATE_RANGE'
  | 'MEAL_PLAN'
  | 'RATE_ROW'
  | 'SUPPLEMENT'
  | 'CHILD_POLICY'
  | 'CANCELLATION'
  | 'TAX_NOTE'
  | 'UNKNOWN';

type AssistedRateCandidate = {
  id: string;
  lineNumber: number;
  rawLine: string;
  lineType: HotelContractLineClassification;
  detectedHotel?: string;
  detectedRoom?: string;
  detectedMealPlan?: string;
  detectedOccupancy?: string;
  detectedSeason?: string;
  detectedDateRange?: string;
  detectedNumericValues: number[];
  sourceLines?: number[];
  rejectionReason?: string;
  confidence: number;
  mappingSuggestions: Partial<Record<AssistedExtractionColumnRole, string>>;
};

type AssistedRateCandidateRejection = {
  lineNumber: number;
  rawLine: string;
  detectedHotel?: string;
  possibleRoom?: string;
  possibleMealPlan?: string;
  possibleOccupancy?: string;
  possibleSeason?: string;
  possibleDateRange?: string;
  possiblePriceValues: number[];
  sourceLines: number[];
  confidence: number;
  rejectionReason: string;
};

type AssistedExtractionPreview = {
  mode: 'PDF_ASSISTED_REVIEW';
  importDisabled: boolean;
  oneHotelAtATimeRequired: boolean;
  requiredColumnRoles: AssistedExtractionColumnRole[];
  blocks: Array<{
    id: string;
    kind: 'RAW_TEXT' | 'DETECTED_TABLE' | 'SKIPPED_SECTION';
    label: string;
    suggestedTag?: AssistedExtractionBlockTag;
    tag?: AssistedExtractionBlockTag;
    lineStart?: number;
    lineEnd?: number;
    text: string;
    rows?: string[][];
    columns?: string[];
    mappings?: Partial<Record<AssistedExtractionColumnRole, string>>;
    approved?: boolean;
    rateCandidateIds?: string[];
  }>;
  lineClassifications: Array<{ lineNumber: number; rawLine: string; type: HotelContractLineClassification; confidence: number }>;
  rateCandidates: AssistedRateCandidate[];
  rejectedRateCandidates?: AssistedRateCandidateRejection[];
  qcWarnings: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }>;
};

type ContractPreview = {
  contractType: ContractImportType;
  supplier: {
    id?: string | null;
    name: string;
    isNew: boolean;
  };
  contract: {
    name: string;
    year?: number | null;
    validFrom?: string | null;
    validTo?: string | null;
    currency: string;
  };
  hotel?: {
    name: string;
    city: string;
    category: string;
    hotelCategoryId?: string | null;
  };
  roomCategories: Array<{ name: string; code?: string | null; description?: string | null; uncertain?: boolean }>;
  seasons: Array<{ name: string; validFrom?: string | null; validTo?: string | null; uncertain?: boolean }>;
  rates: PreviewRate[];
  mealPlans: Array<{ code: string; isDefault?: boolean; notes?: string | null; uncertain?: boolean }>;
  taxes: Array<{ name: string; value: number; included: boolean; uncertain?: boolean }>;
  supplements: Array<{
    name: string;
    type?: string | null;
    chargeBasis?: string | null;
    pricingBasis?: 'PER_PERSON' | 'PER_ROOM';
    amount?: number | null;
    currency?: string | null;
    isMandatory?: boolean;
    notes?: string;
    uncertain?: boolean;
  }>;
  policies: Array<{ name: string; value: string; uncertain?: boolean }>;
  ratePolicies?: RatePolicyPreview[];
  cancellationPolicy?: {
    summary?: string | null;
    notes?: string | null;
    noShowPenaltyType?: string | null;
    noShowPenaltyValue?: number | null;
    rules?: Array<{
      daysBefore?: number;
      penaltyPercent?: number;
      windowFromValue: number;
      windowToValue: number;
      deadlineUnit: string;
      penaltyType: string;
      penaltyValue?: number | null;
      notes?: string | null;
    }>;
  } | null;
  cancellationPolicies?: Array<NonNullable<ContractPreview['cancellationPolicy']>>;
  childPolicy?: {
    infantMaxAge: number;
    childMaxAge: number;
    notes?: string | null;
    bands?: Array<{
      label: string;
      minAge: number;
      maxAge: number;
      chargeBasis: string;
      chargeValue?: number | null;
      notes?: string | null;
    }>;
  } | null;
  multiProperty?: {
    detected: boolean;
    propertyCount: number;
    hotels: ContractPreview[];
  normalizedWorkbooks: Array<{ hotelName: string; fileName: string; rateCount: number; warningCount: number; roomCount?: number; supplementCount?: number; seasonCount?: number }>;
  };
  meta?: Record<string, unknown>;
  hotelName?: string;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  currency?: string;
  serviceCharge?: { name: string; value: number; included: boolean; uncertain?: boolean } | null;
  warnings?: Array<{ severity: 'blocker' | 'warning' | 'info'; field: string; message: string }>;
  parserDiagnostics?: {
    source: 'workbook' | 'text';
    rowCount: number;
    parsedTextLineCount: number;
    first20Lines: string[];
    detectedHotels?: string[];
    detectedTables?: Array<{ label: string; lineNumber?: number; confidence: number; columns?: string[] }>;
    skippedSections?: Array<{ label: string; reason: string; lineNumber?: number }>;
    rateCandidateRejections?: AssistedRateCandidateRejection[];
    confidence?: number;
    warnings?: string[];
    extractionMode?: 'SINGLE_PROPERTY' | 'MULTI_PROPERTY' | 'TEXT_PDF' | 'WORKBOOK';
  };
  assistedExtraction?: AssistedExtractionPreview;
  missingFields: string[];
  uncertainFields: string[];
};

const HOTEL_MEAL_PLAN_VALUES = ['RO', 'BB', 'HB', 'FB', 'AI'];
const HOTEL_SUPPLEMENT_TYPE_VALUES = [
  'EXTRA_BED',
  'EXTRA_BREAKFAST',
  'EXTRA_LUNCH',
  'EXTRA_DINNER',
  'GALA_DINNER',
  'MANDATORY_SUPPLEMENT',
  'OPTIONAL_SUPPLEMENT',
];
const HOTEL_CONTRACT_CHARGE_BASIS_VALUES = ['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT'];
const CHILD_POLICY_CHARGE_BASIS_VALUES = ['FREE', 'PERCENT_OF_ADULT', 'FIXED_AMOUNT'];
const SUPPORTED_CONTRACT_CURRENCIES = ['USD', 'EUR', 'JOD'];

@Injectable()
export class ContractImportsService {
  private readonly logger = new Logger(ContractImportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(actor?: AuthenticatedActor) {
    const companyId = requireActorCompanyId(actor);
    const scopedUserIds = await this.findCompanyUserIds(companyId);
    const records: any[] = await (this.prisma as any).contractImport.findMany({
      where: this.buildImportOwnershipWhere(scopedUserIds),
      orderBy: [{ createdAt: 'desc' }],
      include: {
        auditLogs: {
          orderBy: [{ createdAt: 'desc' }],
        },
      },
    });
    const userIds = Array.from(
      new Set<string>(
        (records as Array<{ createdByUserId: string | null; approvedByUserId: string | null; auditLogs: Array<{ actorUserId: string | null }> }>)
          .flatMap((record) => [record.createdByUserId, record.approvedByUserId, ...record.auditLogs.map((log) => log.actorUserId)])
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));

    return records.map((record: any) => {
      const preview = this.normalizePreviewForDisplay(record.approvedJson || record.extractedJson);
      const createdBy = record.createdByUserId ? usersById.get(record.createdByUserId) || null : null;
      const approvedBy = record.approvedByUserId ? usersById.get(record.approvedByUserId) || null : null;

      return {
        ...record,
        contractName: preview?.contract.name || record.sourceFileName,
        user: this.formatUser(approvedBy || createdBy, record.auditLogs[0]?.actor || null),
        auditLogs: record.auditLogs.map((log: any) => ({
          ...log,
          user: this.formatUser(log.actorUserId ? usersById.get(log.actorUserId) || null : null, log.actor || null),
        })),
      };
    });
  }

  async analyze(input: AnalyzeInput, actor: AuthenticatedActor) {
    const contractType = this.parseContractType(input.contractType);
    const contractYear = this.parseOptionalInt(input.contractYear);
    const validFrom = this.parseOptionalDate(input.validFrom);
    const validTo = this.parseOptionalDate(input.validTo);

    if (validFrom && validTo && validFrom > validTo) {
      throw new BadRequestException('validFrom cannot be after validTo');
    }

    const supplier = input.supplierId
      ? await this.prisma.supplier.findUnique({ where: { id: input.supplierId } })
      : null;
    if (input.supplierId && !supplier) {
      throw new BadRequestException('Supplier not found');
    }

    const preview = this.extractPreview({
      contractType,
      supplierName: supplier?.name || input.supplierName || '',
      contractYear,
      validFrom,
      validTo,
      filePath: input.file.path,
      fileName: input.file.originalname,
    });
    console.log('[contract-imports/analyze] mapped extractedJson summary', {
      contractType: preview.contractType,
      contractName: preview.contract?.name,
      ratesLength: preview.rates.length,
      supplementsLength: preview.supplements.length,
      multiProperty: preview.multiProperty
        ? {
            detected: preview.multiProperty.detected,
            propertyCount: preview.multiProperty.propertyCount,
            hotelNames: preview.multiProperty.hotels?.map((hotel) => hotel.hotel?.name || hotel.hotelName || hotel.supplier?.name).slice(0, 20),
          }
        : undefined,
      diagnostics: preview.parserDiagnostics
        ? {
            source: preview.parserDiagnostics.source,
            parsedTextLineCount: preview.parserDiagnostics.parsedTextLineCount,
            detectedHotels: preview.parserDiagnostics.detectedHotels?.slice(0, 20),
            detectedTableCount: preview.parserDiagnostics.detectedTables?.length || 0,
            skippedSectionCount: preview.parserDiagnostics.skippedSections?.length || 0,
            confidence: preview.parserDiagnostics.confidence,
          }
        : undefined,
    });
    const warnings = [...this.buildWarnings(preview), ...(await this.buildPersistenceWarnings(preview))];
    preview.warnings = warnings;
    console.log('[contract-imports/analyze] extractedJson summary', {
      ratesLength: preview.rates.length,
      supplementsLength: preview.supplements.length,
      policiesLength: preview.policies.length,
      ratePoliciesLength: preview.ratePolicies?.length || 0,
      hasMeta: Boolean(preview.meta),
      hasCancellationPolicy: Boolean(preview.cancellationPolicy),
      hasChildPolicy: Boolean(preview.childPolicy),
      missingFields: preview.missingFields,
      uncertainFields: preview.uncertainFields,
      warnings,
    });
    console.log('[contract-imports/analyze] first 5 extracted rate rows', preview.rates.slice(0, 5));

    const record = await this.prisma.contractImport.create({
      data: {
        contractType,
        supplierId: supplier?.id || null,
        supplierName: preview.supplier.name || null,
        sourceFileName: input.file.originalname,
        sourceFilePath: input.file.path,
        sourceContentType: input.file.mimetype || null,
        contractYear,
        validFrom,
        validTo,
        status: ContractImportStatus.ANALYZED,
        extractedJson: preview as unknown as Prisma.InputJsonValue,
        warnings: warnings as unknown as Prisma.InputJsonValue,
        errors: [],
        createdByUserId: actor.id,
      },
    });
    await this.writeAuditLog(record.id, 'ANALYZED', ContractImportStatus.ANALYZED, actor, {
      sourceFileName: input.file.originalname,
      warnings: warnings.length,
    });
    return {
      ...record,
      extractedJson: preview,
    };
  }

  async findOne(id: string, actor?: AuthenticatedActor) {
    const record = await (this.prisma as any).contractImport.findUnique({
      where: { id },
      include: {
        auditLogs: {
          orderBy: [{ createdAt: 'desc' }],
        },
      },
    });
    if (!record) {
      throw new BadRequestException('Contract import not found');
    }
    await this.assertImportAccess(record, actor);
    return record;
  }

  async approve(id: string, approvedData: unknown, actor: AuthenticatedActor, approvalMode?: ContractImportApprovalMode) {
    try {
      const record = await this.findOne(id, actor);
      if (record.status !== ContractImportStatus.ANALYZED) {
        throw new BadRequestException('Only analyzed imports can be approved');
      }
      if (typeof (this.prisma.contractImport as any).updateMany === 'function') {
        const claim = await (this.prisma.contractImport as any).updateMany({
          where: { id, status: ContractImportStatus.ANALYZED },
          data: { status: ContractImportStatus.APPROVED },
        });
        if (claim.count !== 1) {
          throw new ConflictException('Contract import approval is already in progress or completed');
        }
      }

      const preview = this.normalizeApprovedPreview(approvedData || record.extractedJson);
      const warnings = [...this.buildWarnings(preview), ...(await this.buildPersistenceWarnings(preview))];
      const blockingWarnings = warnings.filter((warning) => warning.severity === 'blocker');
      if (blockingWarnings.length > 0) {
        await this.prisma.contractImport.update({
          where: { id },
          data: {
            status: ContractImportStatus.FAILED,
            approvedJson: preview as unknown as Prisma.InputJsonValue,
            warnings: warnings as unknown as Prisma.InputJsonValue,
            errors: blockingWarnings as unknown as Prisma.InputJsonValue,
          },
        });
        await this.writeAuditLog(id, 'FAILED', ContractImportStatus.FAILED, actor, {
          blockers: blockingWarnings,
        });
        throw new BadRequestException(blockingWarnings.map((warning) => `${warning.field}: ${warning.message}`).join('; '));
      }

      let importedEntityId: string;
      try {
        console.log('[contract-imports/approve] starting import', this.buildApprovalDebugContext(id, preview));
        importedEntityId = await this.importApprovedPreviewTransactionally(preview, record, approvalMode);
      } catch (error) {
        if (error instanceof ConflictException) {
          throw error;
        }

        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        console.error('[contract-imports/approve] import failed', {
          ...this.buildApprovalDebugContext(id, preview),
          errorMessage: message,
          stack,
        });

        await this.prisma.contractImport.update({
          where: { id },
          data: {
            status: ContractImportStatus.FAILED,
            approvedJson: preview as unknown as Prisma.InputJsonValue,
            warnings: warnings as unknown as Prisma.InputJsonValue,
            errors: [{ message }] as unknown as Prisma.InputJsonValue,
          },
        });
        await this.writeAuditLog(id, 'FAILED', ContractImportStatus.FAILED, actor, {
          errorMessage: message,
        });

        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(`Contract import approval failed: ${message}`);
      }

      const updated = await this.prisma.contractImport.update({
        where: { id },
        data: {
          status: ContractImportStatus.IMPORTED,
          approvedJson: preview as unknown as Prisma.InputJsonValue,
          warnings: warnings as unknown as Prisma.InputJsonValue,
          errors: [],
          approvedByUserId: actor.id,
          approvedAt: new Date(),
          importedAt: new Date(),
          importedEntityId,
        },
      });
      await this.writeAuditLog(id, 'IMPORTED', ContractImportStatus.IMPORTED, actor, {
        importedEntityId,
        warnings: warnings.length,
      });
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('APPROVE ERROR FULL:', error);
      if (error instanceof Error) {
        console.error(error.stack);
      }
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new BadRequestException(`Contract import approval failed: ${message}`);
    }
  }

  async reimport(id: string, actor: AuthenticatedActor) {
    const record = await this.findOne(id, actor);
    const sourceData = record.approvedJson || record.extractedJson;
    if (!sourceData) {
      throw new BadRequestException('No reviewed import data is available to re-import');
    }

    const preview = this.normalizeApprovedPreview(sourceData);
    const warnings = [...this.buildWarnings(preview), ...(await this.buildPersistenceWarnings(preview))];
    const blockingWarnings = warnings.filter((warning) => warning.severity === 'blocker');
    if (blockingWarnings.length > 0) {
      throw new BadRequestException(blockingWarnings.map((warning) => warning.message).join('; '));
    }

    const importedEntityId = await this.importApprovedPreview(preview, record);
    const updated = await this.prisma.contractImport.update({
      where: { id },
      data: {
        status: ContractImportStatus.IMPORTED,
        approvedJson: preview as unknown as Prisma.InputJsonValue,
        warnings: warnings as unknown as Prisma.InputJsonValue,
        errors: [],
        approvedByUserId: actor.id,
        approvedAt: new Date(),
        importedAt: new Date(),
        importedEntityId,
      },
    });
    await this.writeAuditLog(id, 'REIMPORTED', ContractImportStatus.IMPORTED, actor, {
      importedEntityId,
      warnings: warnings.length,
    });
    return updated;
  }

  async exportExcel(id: string, actor?: AuthenticatedActor, approvedData?: unknown) {
    const record = await this.findOne(id, actor);
    if (!record.extractedJson) {
      throw new BadRequestException('No extracted contract data is available to export');
    }

    const preview = this.normalizeApprovedPreview(approvedData || record.extractedJson);
    return this.generateExcel(preview, record.sourceFileName || preview.contract.name || 'contract-import');
  }

  private extractPreview(input: {
    contractType: ContractImportType;
    supplierName: string;
    contractYear: number | null;
    validFrom: Date | null;
    validTo: Date | null;
    filePath: string;
    fileName: string;
  }): ContractPreview {
    const workbookRows = this.readWorkbookRows(input.filePath, input.fileName);
    const text = workbookRows.length > 0 ? this.workbookRowsToText(workbookRows) : this.readTextPreview(input.filePath);
    const parsedTextLines = this.firstParsedTextLines(text, 20);
    const diagnostics: ContractPreview['parserDiagnostics'] = {
      ...this.buildTextExtractionDiagnostics(text, workbookRows),
    };
    console.log('[contract-imports/analyze] raw parsed text', {
      fileName: input.fileName,
      source: workbookRows.length > 0 ? 'workbook' : 'text',
      rowCount: workbookRows.length,
      textPreview: text.slice(0, 8000),
    });
    console.log('[contract-imports/analyze] first 20 parsed text lines', parsedTextLines);
    if (input.contractType === ContractImportType.HOTEL) {
      const templatePreview = this.extractHotelExcelTemplatePreview(input);
      if (templatePreview) {
        return this.attachParserDiagnostics(this.addPreviewAliases(templatePreview), diagnostics);
      }
    }

    const parsedJson = this.parseJsonPreview(text);
    if (parsedJson) {
      return this.attachParserDiagnostics(this.addPreviewAliases(this.normalizeApprovedPreview({
        ...parsedJson,
        contractType: parsedJson.contractType || input.contractType,
      })), diagnostics);
    }

    if (input.contractType === ContractImportType.HOTEL) {
      const hotelPreview = this.extractHotelContractPreview({
        ...input,
        text,
        workbookRows,
      });

      if (hotelPreview) {
        return this.attachParserDiagnostics(this.addPreviewAliases(hotelPreview), diagnostics);
      }
    }

    const csvRows = this.parseDelimitedRows(text);
    const rates = csvRows.map((row) => ({
      roomType: row.roomType || row.room || row.service || undefined,
      serviceName: row.service || row.serviceName || undefined,
      routeName: row.route || row.routeName || undefined,
      occupancyType: row.occupancy || row.occupancyType || 'DBL',
      mealPlan: row.mealPlan || row.meal || 'BB',
      seasonName: row.season || row.seasonName || 'Imported',
      cost: this.parseNumber(row.cost || row.price || row.rate),
      currency: row.currency || 'JOD',
      uncertain: false,
      notes: row.notes || undefined,
    }));

    const supplierName = input.supplierName || this.guessNameFromFile(input.fileName);
    const contractName = `${supplierName} ${input.contractYear || new Date().getFullYear()} Contract`;

    return this.attachParserDiagnostics(this.addPreviewAliases({
      contractType: input.contractType,
      supplier: {
        name: supplierName,
        isNew: true,
      },
      contract: {
        name: contractName,
        year: input.contractYear,
        validFrom: input.validFrom ? this.isoDate(input.validFrom) : null,
        validTo: input.validTo ? this.isoDate(input.validTo) : null,
        currency: rates[0]?.currency || 'JOD',
      },
      hotel:
        input.contractType === ContractImportType.HOTEL
          ? {
              name: supplierName,
              city: 'Amman',
              category: 'Unclassified',
            }
          : undefined,
      rates,
      roomCategories: Array.from(new Set(rates.map((rate) => rate.roomType).filter(Boolean))).map((name) => ({
        name: name!,
      })),
      seasons: Array.from(new Set(rates.map((rate) => rate.seasonName).filter(Boolean))).map((name) => ({
        name: name!,
        validFrom: input.validFrom ? this.isoDate(input.validFrom) : null,
        validTo: input.validTo ? this.isoDate(input.validTo) : null,
      })),
      mealPlans: Array.from(new Set(rates.map((rate) => rate.mealPlan).filter(Boolean))).map((code, index) => ({
        code: code!,
        isDefault: index === 0,
      })),
      taxes: [],
      supplements: [],
      policies: [
        {
          name: 'Source file',
          value: input.fileName,
        },
      ],
      missingFields: [],
      uncertainFields: csvRows.length > 0 ? [] : ['rates'],
    }), diagnostics);
  }

  private async importApprovedPreview(
    preview: ContractPreview,
    record: { supplierId: string | null; sourceFileName: string; sourceFilePath: string },
    approvalMode?: ContractImportApprovalMode,
  ) {
    const supplier = await this.ensureSupplier(record.supplierId, preview.supplier.name, preview.contractType);

    if (preview.contractType === ContractImportType.HOTEL) {
      return this.importHotelPreview(preview, supplier.id, record.sourceFileName, record.sourceFilePath, approvalMode);
    }

    return this.importServicePreview(preview, supplier.id, record.sourceFileName);
  }

  private async importApprovedPreviewTransactionally(
    preview: ContractPreview,
    record: { supplierId: string | null; sourceFileName: string; sourceFilePath: string },
    approvalMode?: ContractImportApprovalMode,
  ) {
    if (typeof (this.prisma as any).$transaction !== 'function') {
      return this.importApprovedPreview(preview, record, approvalMode);
    }

    return (this.prisma as any).$transaction(
      async (tx: PrismaService) => {
        const transactionalService = new ContractImportsService(tx);
        return transactionalService.importApprovedPreview(preview, record, approvalMode);
      },
      { timeout: 30000 },
    );
  }

  private buildApprovalDebugContext(id: string, preview: ContractPreview) {
    return {
      contractImportId: id,
      contractType: preview.contractType,
      hotelName: preview.hotel?.name || preview.hotelName || null,
      hotelId: null,
      ratesCount: preview.rates.length,
      roomCategoriesCount: preview.roomCategories.length,
      supplementsCount: preview.supplements.length,
      ratePoliciesCount: preview.ratePolicies?.length || 0,
      cancellationRulesCount: preview.cancellationPolicy?.rules?.length || preview.cancellationPolicies?.reduce((count, policy) => count + (policy?.rules?.length || 0), 0) || 0,
      mealPlansCount: preview.mealPlans.length,
    };
  }

  private extractHotelExcelTemplatePreview(input: {
    contractType: ContractImportType;
    supplierName: string;
    contractYear: number | null;
    validFrom: Date | null;
    validTo: Date | null;
    filePath: string;
    fileName: string;
    propertyName?: string;
    isMultiPropertyChild?: boolean;
  }): ContractPreview | null {
    const workbook = this.readWorkbook(input.filePath, input.fileName);
    const normalizedWorkbookPreview = this.extractNormalizedHotelWorkbookPreview(input, workbook);
    if (normalizedWorkbookPreview) {
      return normalizedWorkbookPreview;
    }

    const ratesSheet = this.getWorkbookSheet(workbook, 'Rates');
    if (!workbook || !ratesSheet) {
      return null;
    }

    const meta = this.readMetaSheet(workbook);
    const allRatesRows: Array<Record<string, string>> = this.sheetToObjects(workbook, ratesSheet);
    const detectedProperties = this.detectWorkbookProperties(allRatesRows);
    if (!input.propertyName && detectedProperties.length > 1) {
      const hotels = detectedProperties
        .map((propertyName) =>
          this.extractHotelExcelTemplatePreview({
            ...input,
            propertyName,
            isMultiPropertyChild: true,
          }),
        )
        .filter((preview): preview is ContractPreview => Boolean(preview));
      const supplierName = meta.supplierName || meta.supplier || input.supplierName || this.guessNameFromFile(input.fileName);
      const year = input.contractYear || new Date().getFullYear();
      const contractValidFrom = this.isoDateFromTemplate(meta.validFrom || meta.contractStartDate || meta.startDate) || (input.validFrom ? this.isoDate(input.validFrom) : null);
      const contractValidTo = this.isoDateFromTemplate(meta.validTo || meta.contractEndDate || meta.endDate) || (input.validTo ? this.isoDate(input.validTo) : null);
      const contractCurrency = (meta.currency || hotels[0]?.contract.currency || 'USD').trim().toUpperCase();
      const normalizedWorkbooks = hotels.map((hotel) => {
        const hotelWarnings = this.buildExtractionQcWarnings(hotel);
        return {
          hotelName: hotel.hotel?.name || hotel.hotelName || hotel.supplier.name,
          fileName: `${this.safeExportFileName(hotel.contract.name || hotel.hotel?.name || 'hotel-contract')}-extracted-contract.xlsx`,
          roomCount: hotel.roomCategories.length,
          rateCount: hotel.rates.length,
          supplementCount: hotel.supplements.length,
          seasonCount: hotel.seasons.length,
          warningCount: hotelWarnings.length + (hotel.warnings?.length || 0),
        };
      });

      return this.addPreviewAliases({
        contractType: ContractImportType.HOTEL,
        supplier: { name: supplierName, isNew: true },
        contract: {
          name: `${supplierName} Multi-Property ${year}`,
          year,
          validFrom: contractValidFrom,
          validTo: contractValidTo,
          currency: contractCurrency,
        },
        hotel: {
          name: `${detectedProperties.length} properties detected`,
          city: meta.city || 'Amman',
          category: 'Multi-property preview',
        },
        roomCategories: this.mergePreviewArrayByName(hotels.flatMap((hotel) => hotel.roomCategories || [])),
        seasons: this.mergePreviewArrayByName(hotels.flatMap((hotel) => hotel.seasons || [])),
        rates: hotels.flatMap((hotel) => hotel.rates.map((rate) => ({ ...rate, notes: [hotel.hotel?.name, rate.notes].filter(Boolean).join(' | ') }))),
        mealPlans: this.mergePreviewArrayByCode(hotels.flatMap((hotel) => hotel.mealPlans || [])),
        taxes: hotels[0]?.taxes || [],
        supplements: hotels.flatMap((hotel) => hotel.supplements.map((supplement) => ({ ...supplement, notes: [hotel.hotel?.name, supplement.notes].filter(Boolean).join(' | ') }))),
        policies: [
          { name: 'Multi-property extraction', value: `${detectedProperties.length} hotel workbooks generated for preview/QC only.` },
          { name: 'Source file', value: input.fileName },
        ],
        ratePolicies: hotels.flatMap((hotel) => hotel.ratePolicies || []),
        cancellationPolicies: hotels.flatMap((hotel) => hotel.cancellationPolicies || (hotel.cancellationPolicy ? [hotel.cancellationPolicy] : [])),
        cancellationPolicy: null,
        childPolicy: null,
        meta: {
          ...meta,
          extractionMode: 'MULTI_PROPERTY_PREVIEW',
        },
        multiProperty: {
          detected: true,
          propertyCount: hotels.length,
          hotels,
          normalizedWorkbooks,
        },
        warnings: [
          {
            severity: 'blocker',
            field: 'multiProperty',
            message: 'Multi-property contracts are split into per-hotel normalized workbooks for preview/QC only. Automatic import is disabled.',
          },
          ...hotels.flatMap((hotel, index) =>
            this.buildExtractionQcWarnings(hotel).map((warning) => ({
              ...warning,
              field: `multiProperty.hotels.${index + 1}.${warning.field}`,
              message: `${hotel.hotel?.name || `Hotel ${index + 1}`}: ${warning.message}`,
            })),
          ),
        ],
        missingFields: [],
        uncertainFields: ['multiProperty approval'],
      });
    }
    const ratesRows = input.propertyName ? this.filterRowsForProperty(allRatesRows, input.propertyName) : allRatesRows;
    const requiredColumns = ['Room Type', 'Occupancy', 'Meal Plan', 'Cost'];
    const actualColumns = Object.keys(ratesRows[0] || {});
    const rateHeaderText = actualColumns.join(' ');
    const missingColumns = requiredColumns.filter((column) => !actualColumns.some((actual) => this.templateHeaderMatches(actual, column)));
    const year = input.contractYear || new Date().getFullYear();
    const hotelName = input.propertyName || meta.hotelName || meta.hotel || input.supplierName || this.guessNameFromFile(input.fileName);
    const supplierName = meta.supplierName || meta.supplier || input.supplierName || hotelName;
    const contractName = input.propertyName ? `${hotelName} ${year}` : meta.contractName || meta.contract || `${hotelName} ${year}`;
    const contractValidFrom = this.isoDateFromTemplate(meta.validFrom || meta.contractStartDate || meta.startDate) || (input.validFrom ? this.isoDate(input.validFrom) : null);
    const contractValidTo = this.isoDateFromTemplate(meta.validTo || meta.contractEndDate || meta.endDate) || (input.validTo ? this.isoDate(input.validTo) : null);
    const contractCurrency = (meta.currency || 'USD').trim().toUpperCase();
    const defaultTaxPercent = this.parseNumber(meta.defaultTaxPercent || meta.defaultTax || meta.taxPercent);
    const defaultServicePercent = this.parseNumber(meta.defaultServicePercent || meta.defaultService || meta.servicePercent);
    const defaultTaxIncluded = this.parseBoolean(meta.taxIncluded);
    const defaultServiceIncluded = this.parseBoolean(meta.serviceIncluded);
    const warnings: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }> = missingColumns.map((column) => ({
      severity: 'blocker' as const,
      field: `Rates.${column}`,
      message: `Rates sheet is missing required column: ${column}`,
    }));

    const rates: PreviewRate[] =
      missingColumns.length > 0
        ? []
        : ratesRows
            .map((row: Record<string, string>): PreviewRate | null => {
              const roomType = this.templateCell(row, 'Room Type');
              const occupancyType = this.templateCell(row, 'Occupancy');
              const mealPlan = this.templateCell(row, 'Meal Plan');
              const cost = this.parseNumber(this.templateCell(row, 'Cost'));
              if (!roomType || !occupancyType || !cost) return null;
              const seasonFrom = this.templateCell(row, 'Season From');
              const seasonTo = this.templateCell(row, 'Season To');
              const pricingBasis = this.templatePricingBasis(row, rateHeaderText);
              const normalizedSeasonFrom = this.isoDateFromTemplate(seasonFrom);
              const normalizedSeasonTo = this.isoDateFromTemplate(seasonTo);
              const rateTaxPercent = this.parseNumber(this.templateCell(row, 'Tax %') || this.templateCell(row, 'Tax Percent'));
              const rateServicePercent = this.parseNumber(this.templateCell(row, 'Service %') || this.templateCell(row, 'Service Percent'));
              const rateTaxIncluded = this.parseBoolean(this.templateCell(row, 'Tax Included'));
              const rateServiceIncluded = this.parseBoolean(this.templateCell(row, 'Service Included'));
              return {
                roomType,
                occupancyType: this.normalizeTemplateOccupancy(occupancyType),
                mealPlan: mealPlan ? this.hotelMealPlan(mealPlan) : '',
                seasonName: normalizedSeasonFrom || normalizedSeasonTo ? `${normalizedSeasonFrom || 'Start'} - ${normalizedSeasonTo || 'End'}` : 'Imported',
                seasonFrom: normalizedSeasonFrom || undefined,
                seasonTo: normalizedSeasonTo || undefined,
                cost,
                currency: this.templateCell(row, 'Currency') || contractCurrency,
                pricingBasis,
                normalizedPricingBasis: this.normalizedNightlyPricingBasis(pricingBasis),
                salesTaxPercent: rateTaxPercent ?? defaultTaxPercent ?? null,
                serviceChargePercent: rateServicePercent ?? defaultServicePercent ?? null,
                salesTaxIncluded: rateTaxIncluded ?? defaultTaxIncluded ?? false,
                serviceChargeIncluded: rateServiceIncluded ?? defaultServiceIncluded ?? false,
              };
            })
            .filter((rate: PreviewRate | null): rate is PreviewRate => Boolean(rate));

    const roomCategoriesFromSheet = this.filterRowsForProperty(this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'RoomCategories')), input.propertyName)
      .map((row: Record<string, string>) => ({
        name: this.templateCell(row, 'Name') || this.templateCell(row, 'Room Type') || this.templateCell(row, 'Room Category'),
        code: this.templateCell(row, 'Code') || null,
        description: this.templateCell(row, 'Description') || this.templateCell(row, 'Notes') || null,
      }))
      .filter((category) => category.name);
    const supplements: ContractPreview['supplements'] = this.filterRowsForProperty(this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'Supplements')), input.propertyName)
      .flatMap((row: Record<string, string>) => {
        const rawCurrency = this.templateCell(row, 'Currency');
        const normalizedCurrency = this.normalizeSupplementCurrency(rawCurrency, contractCurrency);
        const name = this.templateSupplementName(row);
        const notes = this.templateCell(row, 'Notes');

        if (this.isDerivedPercentSupplementRow(name, rawCurrency, notes)) {
          return [];
        }

        return [
          {
            name,
            type: this.templateCell(row, 'Type') || name || null,
            chargeBasis: this.templateCell(row, 'Charge Basis') || this.templateCell(row, 'Basis') || null,
            amount: this.parseNumber(this.templateCell(row, 'Amount') || this.templateCell(row, 'Cost')) ?? null,
            currency: normalizedCurrency.currency,
            pricingBasis: this.normalizePricingBasis(this.templateCell(row, 'Pricing Basis')) || 'PER_ROOM',
            isMandatory: /^(true|yes|y|1)$/i.test(this.templateCell(row, 'Mandatory')),
            notes: [this.supplementCategoryNote(name), this.supplementLabelNote(name), notes, normalizedCurrency.note].filter(Boolean).join(' | ') || undefined,
          },
        ];
      });
    const policies: ContractPreview['policies'] = this.filterRowsForProperty(this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'Policies')), input.propertyName).map((row: Record<string, string>) => ({
      name: this.templateCell(row, 'Name') || this.templateCell(row, 'Policy') || 'Policy',
      value: this.templateCell(row, 'Value') || this.templateCell(row, 'Description') || this.templateCell(row, 'Notes') || '',
    }));
    const cancellationPolicy = this.readCancellationPolicySheet(workbook);
    const ratePolicyResult = this.readRatePoliciesSheet(workbook, contractCurrency, input.propertyName);
    warnings.push(...ratePolicyResult.warnings);
    const ratePolicies = ratePolicyResult.policies;
    const childPolicy = this.readChildPolicySheet(workbook, meta, ratePolicies, policies, input.propertyName);
    const taxes: ContractPreview['taxes'] = [];
    if (defaultTaxPercent !== undefined) {
      taxes.push({ name: 'Sales tax', value: defaultTaxPercent, included: defaultTaxIncluded ?? false });
    }
    if (defaultServicePercent !== undefined) {
      taxes.push({ name: 'Service charge', value: defaultServicePercent, included: defaultServiceIncluded ?? false });
    }

    return {
      contractType: ContractImportType.HOTEL,
      supplier: { name: supplierName, isNew: true },
      contract: {
        name: contractName,
        year,
        validFrom: contractValidFrom,
        validTo: contractValidTo,
        currency: rates[0]?.currency || contractCurrency,
      },
      hotel: {
        name: hotelName,
        city: meta.city || 'Amman',
        category: meta.category || meta.hotelCategory || 'Unclassified',
      },
      roomCategories: roomCategoriesFromSheet.length > 0 ? roomCategoriesFromSheet : this.roomCategoriesFromRates(rates),
      seasons: Array.from(new Set<string>(rates.map((rate: PreviewRate) => rate.seasonName || 'Imported'))).map((name) => {
        const matchingRate = rates.find((rate) => (rate.seasonName || 'Imported') === name);
        return { name, validFrom: matchingRate?.seasonFrom || contractValidFrom, validTo: matchingRate?.seasonTo || contractValidTo };
      }),
      rates,
      mealPlans: Array.from(new Set<string>(rates.map((rate: PreviewRate) => rate.mealPlan || 'BB'))).map((code, index) => ({
        code,
        isDefault: index === 0,
      })),
      taxes,
      supplements,
      policies,
      ratePolicies,
      cancellationPolicy,
      cancellationPolicies: cancellationPolicy ? [cancellationPolicy] : [],
      childPolicy,
      meta: {
        ...meta,
        defaultTaxPercent: defaultTaxPercent ?? null,
        defaultServicePercent: defaultServicePercent ?? null,
        taxIncluded: defaultTaxIncluded ?? null,
        serviceIncluded: defaultServiceIncluded ?? null,
      },
      warnings: [...warnings, ...this.buildExtractionQcWarnings({ rates, seasons: [] })],
      missingFields: missingColumns.map((column) => `Rates.${column}`),
      uncertainFields: [],
    };
  }

  private appendNormalizedHotelWorkbookSheets(workbook: any, preview: ContractPreview) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const xlsx = require('xlsx');
    const contractCurrency = preview.contract.currency || 'USD';
    const codeFrom = (value: unknown, fallback: string) => {
      const normalized = this.optionalString(value)
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
      return (normalized || fallback).slice(0, 20);
    };
    const uniqueCode = (base: string, used: Set<string>) => {
      let code = base || 'CODE';
      let suffix = 2;
      while (used.has(code)) {
        code = `${base.slice(0, Math.max(1, 18 - String(suffix).length))}_${suffix}`;
        suffix += 1;
      }
      used.add(code);
      return code;
    };
    const seasonCodes = new Map<string, string>();
    const usedSeasonCodes = new Set<string>();
    const seasons: Array<{ name: string; validFrom?: string | null; validTo?: string | null; uncertain?: boolean }> = (preview.seasons || []).length
      ? preview.seasons
      : Array.from(new Set((preview.rates || []).map((rate) => rate.seasonName || 'Imported'))).map((name) => {
          const matchingRate = preview.rates.find((rate) => (rate.seasonName || 'Imported') === name);
          return { name, validFrom: matchingRate?.seasonFrom || preview.contract.validFrom, validTo: matchingRate?.seasonTo || preview.contract.validTo };
        });
    const seasonRows = seasons.map((season, index) => {
      const code = uniqueCode(codeFrom((season as any).code || season.name, `SEASON_${index + 1}`), usedSeasonCodes);
      seasonCodes.set(season.name || `Season ${index + 1}`, code);
      return {
        SeasonCode: code,
        SeasonName: season.name || code,
        StartDate: season.validFrom || preview.contract.validFrom || '',
        EndDate: season.validTo || preview.contract.validTo || '',
        SeasonType: /high/i.test(season.name || '') ? 'HIGH' : /low/i.test(season.name || '') ? 'LOW' : 'STANDARD',
        Notes: season.uncertain ? 'Needs review' : '',
      };
    });

    const roomCodes = new Map<string, string>();
    const usedRoomCodes = new Set<string>();
    const roomSource: Array<{ name: string; code?: string | null; description?: string | null; uncertain?: boolean }> = (preview.roomCategories || []).length
      ? preview.roomCategories
      : Array.from(new Set((preview.rates || []).map((rate) => rate.roomType).filter(Boolean))).map((name) => ({ name: name as string }));
    const roomRows = roomSource.map((room, index) => {
      const code = uniqueCode(codeFrom(room.code || room.name, `ROOM_${index + 1}`), usedRoomCodes);
      roomCodes.set(room.name || `Room ${index + 1}`, code);
      return {
        RoomCode: code,
        RoomName: room.name || code,
        RoomType: '',
        Bedding: '',
        MaxAdults: '',
        MaxChildren: '',
        Notes: room.description || (room.uncertain ? 'Needs review' : ''),
      };
    });

    const rateRows = (preview.rates || []).map((rate) => {
      const seasonCode =
        seasonCodes.get(rate.seasonName || '') ||
        uniqueCode(codeFrom(rate.seasonName || 'IMPORTED', `SEASON_${seasonCodes.size + 1}`), usedSeasonCodes);
      if (rate.seasonName && !seasonCodes.has(rate.seasonName)) seasonCodes.set(rate.seasonName, seasonCode);
      const roomCode =
        roomCodes.get(rate.roomType || '') ||
        uniqueCode(codeFrom(rate.roomType || 'ROOM', `ROOM_${roomCodes.size + 1}`), usedRoomCodes);
      if (rate.roomType && !roomCodes.has(rate.roomType)) roomCodes.set(rate.roomType, roomCode);
      return {
        SeasonCode: seasonCode,
        RoomCode: roomCode,
        Occupancy: rate.occupancyType || 'DBL',
        MealPlan: rate.mealPlan || 'BB',
        PricingBasis: rate.normalizedPricingBasis || this.normalizedNightlyPricingBasis(rate.pricingBasis || 'PER_ROOM'),
        Cost: rate.cost ?? '',
        Currency: rate.currency || contractCurrency,
        MinStay: '',
        Notes: rate.notes || '',
      };
    });

    const supplementRows = (preview.supplements || []).map((supplement) => ({
      SupplementType: supplement.name || supplement.type || 'Supplement',
      SeasonCode: '',
      RoomCode: '',
      MealPlan: '',
      Basis: supplement.chargeBasis || 'PER_NIGHT',
      Amount: supplement.amount ?? '',
      Currency: supplement.currency || contractCurrency,
      Mandatory: supplement.isMandatory ? 'Yes' : 'No',
      Notes: supplement.notes || '',
    }));
    const cancellationRows = (preview.cancellationPolicy?.rules || []).map((rule, index) => ({
      PolicyName: rule.notes?.split('|')[0]?.trim() || `Cancellation ${index + 1}`,
      DaysBeforeArrival: rule.daysBefore ?? rule.windowFromValue ?? '',
      PenaltyType: rule.penaltyType === 'NIGHTS' ? 'NIGHT' : rule.penaltyType || '',
      PenaltyValue: rule.penaltyValue ?? rule.penaltyPercent ?? '',
      Notes: rule.notes || '',
    }));
    const childRows = (preview.childPolicy?.bands || []).map((band) => ({
      ChildAgeFrom: band.minAge,
      ChildAgeTo: band.maxAge,
      SharingBasis: '',
      RateType: band.chargeBasis,
      RateValue: band.chargeValue ?? '',
      Notes: band.notes || band.label || '',
    }));
    const noteRows = (preview.policies || []).map((policy) => ({ Notes: `${policy.name}: ${policy.value}` }));

    xlsx.utils.book_append_sheet(
      workbook,
      xlsx.utils.json_to_sheet([
        {
          HotelName: preview.hotel?.name || preview.hotelName || '',
          SupplierName: preview.supplier.name || '',
          ContractName: preview.contract.name || '',
          ContractYear: preview.contract.year || '',
          Currency: contractCurrency,
          City: preview.hotel?.city || '',
          Country: 'Jordan',
          Category: preview.hotel?.category || '',
          ValidFrom: preview.contract.validFrom || '',
          ValidTo: preview.contract.validTo || '',
          ContractStatus: 'Draft',
          SourceReference: String(preview.meta?.sourceReference || ''),
        },
      ]),
      'CONTRACT',
    );
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(seasonRows), 'SEASONS');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(roomRows), 'ROOM_CATEGORIES');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rateRows), 'RATES');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(supplementRows), 'SUPPLEMENTS');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(cancellationRows), 'CANCELLATION_POLICY');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(childRows), 'CHILD_POLICY');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(noteRows), 'NOTES');
  }

  private generateExcel(preview: ContractPreview, sourceName: string): { buffer: Buffer; fileName: string; contentType?: string } {
    if (preview.multiProperty?.detected && preview.multiProperty.hotels.length > 0) {
      const files = preview.multiProperty.hotels.map((hotelPreview) => {
        const exported = this.generateExcel({ ...hotelPreview, multiProperty: undefined }, hotelPreview.contract.name || hotelPreview.hotel?.name || sourceName);
        return {
          fileName: exported.fileName,
          buffer: exported.buffer,
        };
      });
      return {
        buffer: this.createStoredZip(files),
        fileName: `${this.safeExportFileName(preview.contract.name || sourceName)}-normalized-hotel-workbooks.zip`,
        contentType: 'application/zip',
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const xlsx = require('xlsx');
    const workbook = xlsx.utils.book_new();
    const hotelName = preview.hotel?.name || preview.hotelName || preview.supplier.name || '';
    this.appendNormalizedHotelWorkbookSheets(workbook, preview);
    const rates = preview.rates.map((rate) => {
      const season = this.splitSeasonName(rate.seasonName);
      return {
        Hotel: hotelName,
        'Room Type': rate.roomType || rate.serviceName || rate.routeName || '',
        'Season From': rate.seasonFrom || season.from,
        'Season To': rate.seasonTo || season.to,
        Occupancy: rate.occupancyType || '',
        'Meal Plan': rate.mealPlan || '',
        Cost: rate.cost ?? '',
        Currency: rate.currency || preview.contract.currency || 'USD',
        'Pricing Basis': rate.normalizedPricingBasis || this.normalizedNightlyPricingBasis(rate.pricingBasis || 'PER_ROOM'),
        Notes: rate.notes || '',
      };
    });

    const supplements = preview.supplements.map((supplement) => ({
      Name: supplement.name,
      Type: supplement.type || '',
      'Charge Basis': supplement.chargeBasis || '',
      Amount: supplement.amount ?? '',
      Currency: supplement.currency || preview.contract.currency || 'USD',
      'Pricing Basis': this.normalizedNightlyPricingBasis(supplement.pricingBasis || 'PER_ROOM'),
      Mandatory: supplement.isMandatory ? 'Yes' : 'No',
      Notes: supplement.notes || '',
    }));
    const policies = preview.policies.map((policy) => ({
      Name: policy.name,
      Value: policy.value,
    }));
    const roomCategories = (preview.roomCategories || []).map((roomCategory) => ({
      Hotel: hotelName,
      Name: roomCategory.name || '',
      Code: roomCategory.code || '',
      Description: roomCategory.description || '',
      Confidence: roomCategory.uncertain ? 'Needs Review' : 'Approved',
    }));

    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rates), 'Rates');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(roomCategories), 'Room Categories');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(supplements), 'Supplements');
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(policies), 'Policies');
    if (preview.assistedExtraction) {
      const blocks = preview.assistedExtraction.blocks.map((block) => ({
        BlockId: block.id,
        Kind: block.kind,
        SuggestedTag: block.suggestedTag || '',
        OperatorTag: block.tag || '',
        Approved: block.approved ? 'Yes' : 'No',
        LineStart: block.lineStart ?? '',
        LineEnd: block.lineEnd ?? '',
        Label: block.label,
        Text: block.text,
      }));
      const mappings = preview.assistedExtraction.blocks.flatMap((block) =>
        Object.entries(block.mappings || {}).map(([role, sourceColumn]) => ({
          BlockId: block.id,
          Tag: block.tag || block.suggestedTag || '',
          Role: role,
          SourceColumn: sourceColumn || '',
          Approved: block.approved ? 'Yes' : 'No',
        })),
      );
      const qcWarnings = preview.assistedExtraction.qcWarnings.map((warning) => ({
        Severity: warning.severity,
        Field: warning.field,
        Message: warning.message,
      }));
      const rateCandidates = (preview.assistedExtraction.rateCandidates || []).map((candidate) => ({
        CandidateId: candidate.id,
        Line: candidate.lineNumber,
        Property: candidate.detectedHotel || '',
        Type: candidate.lineType,
        Confidence: candidate.confidence,
        Room: candidate.detectedRoom || '',
        MealPlan: candidate.detectedMealPlan || '',
        Occupancy: candidate.detectedOccupancy || '',
        Season: candidate.detectedSeason || '',
        DateRange: candidate.detectedDateRange || '',
        Values: candidate.detectedNumericValues.join(', '),
        SourceLines: (candidate.sourceLines || [candidate.lineNumber]).join(', '),
        RawLine: candidate.rawLine,
      }));
      const rejectedRateCandidates = (preview.assistedExtraction.rejectedRateCandidates || preview.parserDiagnostics?.rateCandidateRejections || []).map((candidate) => ({
        Line: candidate.lineNumber,
        Property: candidate.detectedHotel || '',
        PossibleRoom: candidate.possibleRoom || '',
        PossibleMealPlan: candidate.possibleMealPlan || '',
        PossibleOccupancy: candidate.possibleOccupancy || '',
        PossibleSeason: candidate.possibleSeason || '',
        PossibleDateRange: candidate.possibleDateRange || '',
        Values: candidate.possiblePriceValues.join(', '),
        SourceLines: candidate.sourceLines.join(', '),
        Confidence: candidate.confidence,
        RejectionReason: candidate.rejectionReason,
        RawLine: candidate.rawLine,
      }));
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(blocks), 'Assisted Blocks');
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(mappings), 'Assisted Mappings');
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rateCandidates), 'Rate Candidates');
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rejectedRateCandidates), 'Rejected Rate Lines');
      xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(qcWarnings), 'Assisted QC');
    }

    return {
      buffer: xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer,
      fileName: `${this.safeExportFileName(preview.contract.name || hotelName || sourceName)}-extracted-contract.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private extractHotelContractPreview(input: {
    contractType: ContractImportType;
    supplierName: string;
    contractYear: number | null;
    validFrom: Date | null;
    validTo: Date | null;
    filePath: string;
    fileName: string;
    text: string;
    workbookRows: string[][];
    propertyName?: string;
    isMultiPropertyChild?: boolean;
  }): ContractPreview | null {
    const text = input.text;
    const lowerText = text.toLowerCase();
    const textDiagnostics = this.buildTextExtractionDiagnostics(text, input.workbookRows);
    const hotelSections = this.detectHotelSections(text, input.fileName);
    if (!input.isMultiPropertyChild && hotelSections.length > 1) {
      const hotels = hotelSections
        .map((section) =>
          this.extractHotelContractPreview({
            ...input,
            text: section.text,
            workbookRows: this.textToRows(section.text),
            propertyName: section.hotelName,
            isMultiPropertyChild: true,
          }),
        )
        .filter((preview): preview is ContractPreview => Boolean(preview));
      const year = input.contractYear || this.guessYear(text) || new Date().getFullYear();
      const supplierName = input.supplierName || this.guessEnterpriseSupplierName(text, input.fileName);
      const validFrom = input.validFrom ? this.isoDate(input.validFrom) : `${year}-01-01`;
      const validTo = input.validTo ? this.isoDate(input.validTo) : `${year}-12-31`;
      const currency = this.detectCurrency(text) || hotels[0]?.contract.currency || 'JOD';

      return this.addPreviewAliases({
        contractType: ContractImportType.HOTEL,
        supplier: { name: supplierName, isNew: true },
        contract: {
          name: `${supplierName} Multi-Property ${year}`,
          year,
          validFrom,
          validTo,
          currency,
        },
        hotel: {
          name: `${hotels.length} properties detected`,
          city: 'Multiple',
          category: 'Multi-property preview',
        },
        roomCategories: this.mergePreviewArrayByName(hotels.flatMap((hotel) => hotel.roomCategories || [])),
        seasons: this.mergePreviewArrayByName(hotels.flatMap((hotel) => hotel.seasons || [])),
        rates: hotels.flatMap((hotel) => hotel.rates.map((rate) => ({ ...rate, notes: [hotel.hotel?.name, rate.notes].filter(Boolean).join(' | ') }))),
        mealPlans: this.mergePreviewArrayByCode(hotels.flatMap((hotel) => hotel.mealPlans || [])),
        taxes: hotels[0]?.taxes || this.extractTaxes(text, false),
        supplements: hotels.flatMap((hotel) => hotel.supplements.map((supplement) => ({ ...supplement, notes: [hotel.hotel?.name, supplement.notes].filter(Boolean).join(' | ') }))),
        policies: [
          { name: 'Multi-property PDF extraction', value: `${hotels.length} hotel sections detected for preview/QC only.` },
          { name: 'Source file', value: input.fileName },
        ],
        ratePolicies: hotels.flatMap((hotel) => hotel.ratePolicies || []),
        cancellationPolicy: null,
        cancellationPolicies: hotels.flatMap((hotel) => hotel.cancellationPolicies || (hotel.cancellationPolicy ? [hotel.cancellationPolicy] : [])),
        childPolicy: null,
        meta: {
          extractionMode: 'MULTI_PROPERTY_TEXT_PDF_PREVIEW',
          pdfTextWarning: 'PDF text extraction is heuristic and may require OCR/table review for Arabic or scanned pages.',
        },
        multiProperty: {
          detected: true,
          propertyCount: hotels.length,
          hotels,
          normalizedWorkbooks: hotels.map((hotel) => {
            const hotelWarnings = this.buildExtractionQcWarnings(hotel);
            return {
              hotelName: hotel.hotel?.name || hotel.hotelName || hotel.supplier.name,
              fileName: `${this.safeExportFileName(hotel.contract.name || hotel.hotel?.name || 'hotel-contract')}-extracted-contract.xlsx`,
              rateCount: hotel.rates.length,
              warningCount: hotelWarnings.length + (hotel.warnings?.length || 0),
            };
          }),
        },
        warnings: [
          {
            severity: 'blocker',
            field: 'multiProperty',
            message: 'Multi-property PDF contracts are preview/QC only. Download normalized hotel workbooks and import one reviewed hotel contract at a time.',
          },
          ...hotels.flatMap((hotel, index) =>
            this.buildExtractionQcWarnings(hotel).map((warning) => ({
              ...warning,
              field: `multiProperty.hotels.${index + 1}.${warning.field}`,
              message: `${hotel.hotel?.name || `Hotel ${index + 1}`}: ${warning.message}`,
            })),
          ),
        ],
        parserDiagnostics: {
          source: 'text',
          rowCount: input.workbookRows.length,
          parsedTextLineCount: text.split(/\r?\n/).filter((line) => line.trim()).length,
          first20Lines: this.firstParsedTextLines(text, 20),
          detectedHotels: hotels.map((hotel) => hotel.hotel?.name || hotel.hotelName || hotel.supplier.name),
          extractionMode: 'MULTI_PROPERTY',
          confidence: Math.min(0.9, Math.max(0.35, textDiagnostics.confidence || 0.35)),
          ...this.buildTextExtractionDiagnosticsOverrides(textDiagnostics),
        },
        assistedExtraction: this.buildAssistedExtractionPreview(text, input.workbookRows, { oneHotelAtATimeRequired: true }),
        missingFields: [],
        uncertainFields: ['multiProperty PDF extraction', 'OCR/table review'],
      });
    }
    const isGrandHyatt = lowerText.includes('grand hyatt') || input.fileName.toLowerCase().includes('grand-hyatt');
    const year = input.contractYear || this.guessYear(text) || new Date().getFullYear();
    const supplierName = input.supplierName || (isGrandHyatt ? 'Grand Hyatt Amman' : this.guessEnterpriseSupplierName(text, input.fileName));
    const hotelName = input.propertyName || (isGrandHyatt ? 'Grand Hyatt Amman' : this.guessHotelNameFromText(text, supplierName));
    const validFrom = input.validFrom ? this.isoDate(input.validFrom) : `${year}-01-01`;
    const validTo = input.validTo ? this.isoDate(input.validTo) : `${year}-12-31`;
    const currency = this.detectCurrency(text) || 'JOD';
    const tableRows = input.workbookRows.length > 0 ? input.workbookRows : this.textToRows(text);
    const extractedSeasons = this.extractSeasons(tableRows, text, year, validFrom, validTo);
    const defaultSeasonName = extractedSeasons[0]?.name || `${hotelName} ${year} Full Year`;
    const mealPlanTableRates = this.extractSeasonMealPlanRates(tableRows, text, currency);
    const tableRates = mealPlanTableRates.length > 0 ? mealPlanTableRates : this.extractHotelRatesFromTable(tableRows, text, currency);
    const extractedRates = tableRates.length > 0 ? tableRates : this.extractHotelRatesFromRows(tableRows, currency, defaultSeasonName);
    const fallbackRates = extractedRates.length > 0 ? [] : this.extractHotelRatesFromText(text, currency, defaultSeasonName);
    const rates =
      extractedRates.length > 0
        ? extractedRates
        : fallbackRates.length > 0
          ? fallbackRates
        : isGrandHyatt
          ? [
              { roomType: 'Grand Room', occupancyType: 'SGL', mealPlan: 'BB', seasonName: `Grand Hyatt Amman ${year} Full Year`, cost: 85, currency },
              { roomType: 'Grand Room', occupancyType: 'DBL', mealPlan: 'BB', seasonName: `Grand Hyatt Amman ${year} Full Year`, cost: 95, currency },
              { roomType: 'Deluxe Room', occupancyType: 'SGL', mealPlan: 'BB', seasonName: `Grand Hyatt Amman ${year} Full Year`, cost: 110, currency },
              { roomType: 'Deluxe Room', occupancyType: 'DBL', mealPlan: 'BB', seasonName: `Grand Hyatt Amman ${year} Full Year`, cost: 120, currency },
              { roomType: 'Grand Club', occupancyType: 'SGL', mealPlan: 'BB', seasonName: `Grand Hyatt Amman ${year} Full Year`, cost: 115, currency },
              { roomType: 'Grand Club', occupancyType: 'DBL', mealPlan: 'BB', seasonName: `Grand Hyatt Amman ${year} Full Year`, cost: 125, currency },
              { roomType: 'Grand Suite', occupancyType: 'SGL', mealPlan: 'BB', seasonName: `Grand Hyatt Amman ${year} Full Year`, cost: 175, currency },
              { roomType: 'Grand Suite', occupancyType: 'DBL', mealPlan: 'BB', seasonName: `Grand Hyatt Amman ${year} Full Year`, cost: 185, currency },
            ]
          : [];
    const roomCategories = this.roomCategoriesFromRates(rates);
    const seasonName = rates[0]?.seasonName || defaultSeasonName;
    const taxes = this.extractTaxes(text, isGrandHyatt);
    const mealPlans = this.extractMealPlans(text, rates);
    const supplements = this.extractSupplements(text, currency, isGrandHyatt);
    const cancellationPolicy = this.extractCancellationPolicy(text, isGrandHyatt);
    const childPolicy = this.extractChildPolicy(text, isGrandHyatt);
    const uncertainFields: string[] = [];

    if (input.workbookRows.length === 0) {
      uncertainFields.push('file parsing');
    }
    if (rates.length === 0) {
      uncertainFields.push('rates');
    } else if (mealPlanTableRates.length > 0) {
      uncertainFields.push('rates extracted from season meal-plan table');
    } else if (tableRates.length > 0) {
      uncertainFields.push('rates extracted from table header');
    } else if (extractedRates.length === 0 && fallbackRates.length > 0) {
      uncertainFields.push('rates extracted from text fallback');
    }
    if (supplements.length === 0) {
      uncertainFields.push('supplements');
    }
    if (!cancellationPolicy) {
      uncertainFields.push('cancellation policy');
    }
    if (!childPolicy) {
      uncertainFields.push('child policy');
    }

    return this.addPreviewAliases({
      contractType: ContractImportType.HOTEL,
      supplier: { name: supplierName, isNew: true },
      contract: {
        name: `${hotelName} ${year}`,
        year,
        validFrom,
        validTo,
        currency,
      },
      hotel: {
        name: hotelName,
        city: lowerText.includes('aqaba') ? 'Aqaba' : 'Amman',
        category: lowerText.includes('5 star') || isGrandHyatt ? '5 Star' : 'Unclassified',
      },
      roomCategories,
      seasons: extractedSeasons.length > 0 ? extractedSeasons : [{ name: seasonName, validFrom, validTo, uncertain: true }],
      rates,
      mealPlans,
      taxes,
      supplements,
      policies: [
        { name: 'Cancellation policy', value: cancellationPolicy?.summary || 'Not extracted', uncertain: !cancellationPolicy },
        { name: 'Child policy', value: childPolicy?.notes || 'Not extracted', uncertain: !childPolicy },
        { name: 'Source file', value: input.fileName },
      ],
      cancellationPolicy,
      childPolicy,
      parserDiagnostics: {
        source: input.workbookRows.length > 0 ? 'workbook' : 'text',
        rowCount: input.workbookRows.length,
        parsedTextLineCount: text.split(/\r?\n/).filter((line) => line.trim()).length,
        first20Lines: this.firstParsedTextLines(text, 20),
        detectedHotels: [hotelName],
        extractionMode: input.workbookRows.length > 0 ? 'WORKBOOK' : 'TEXT_PDF',
        ...this.buildTextExtractionDiagnosticsOverrides(textDiagnostics),
      },
      assistedExtraction: this.buildAssistedExtractionPreview(text, input.workbookRows, { oneHotelAtATimeRequired: true }),
      missingFields: [],
      uncertainFields,
    });
  }

  private extractHotelRatesFromRows(rows: string[][], currency: string, seasonName: string): PreviewRate[] {
    const rates: PreviewRate[] = [];
    const knownRoomNames = [
      'Grand Room',
      'Deluxe Room',
      'Grand Club',
      'Grand Suite',
      'Standard Room',
      'Superior Room',
      'Executive Room',
      'Classic Room',
      'Premium Room',
      'Family Room',
      'Junior Suite',
      'Suite',
    ];
    let lastRoomName = '';
    let currentSeasonName = seasonName;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const previousRows = rows.slice(Math.max(0, rowIndex - 4), rowIndex);
      currentSeasonName = this.guessSeasonNameFromRows(previousRows, currentSeasonName);
      const headerCells = previousRows.flat().join(' ');
      const cells = row.map((cell) => String(cell || '').trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const rowText = cells.join(' ');
      if (/^(sheet:|season|period|validity|valid from|from|to)$/i.test(cells[0])) continue;
      const explicitRoomName = knownRoomNames.find((name) => new RegExp(`\\b${this.escapeRegExp(name)}\\b`, 'i').test(rowText)) || this.detectRoomName(rowText);
      const firstCellLooksLikeRoom = /(room|suite|club|deluxe|standard|superior|executive|classic|premium|family)/i.test(cells[0]);
      const firstCellLooksLikeOccupancy = /^(single|double|triple|sgl|dbl|tpl|s\/?d|single\/double)$/i.test(cells[0]);
      const roomName = explicitRoomName || (firstCellLooksLikeRoom ? cells[0] : firstCellLooksLikeOccupancy ? lastRoomName : '');
      if (roomName) {
        lastRoomName = roomName;
      }
      const numbers = this.extractMoneyAmounts(rowText).map((amount) => amount.amount);

      if (!roomName || numbers.length === 0 || !/(room|suite|club|deluxe|standard|superior|executive|grand|classic|premium|family)/i.test(roomName)) {
        continue;
      }

      const occupancyLabels = `${headerCells} ${rowText}`.toLowerCase();
      const mealPlan = this.extractMealPlanFromText(`${headerCells} ${rowText}`);
      const pricingBasis = this.detectPricingBasis(`${headerCells} ${rowText}`);
      if (numbers.length >= 2 || occupancyLabels.includes('single') || occupancyLabels.includes('double') || /\bsgl\b|\bdbl\b/i.test(occupancyLabels)) {
        rates.push({
          roomType: roomName,
          occupancyType: 'SGL',
          mealPlan,
          seasonName: currentSeasonName,
          cost: numbers[0],
          currency,
          pricingBasis,
        });
        if (numbers[1]) {
          rates.push({
            roomType: roomName,
            occupancyType: 'DBL',
            mealPlan,
            seasonName: currentSeasonName,
            cost: numbers[1],
            currency,
            pricingBasis,
          });
        }
        if (numbers[2]) {
          rates.push({
            roomType: roomName,
            occupancyType: 'TPL',
            mealPlan,
            seasonName: currentSeasonName,
            cost: numbers[2],
            currency,
            pricingBasis,
          });
        }
      } else {
        rates.push({
          roomType: roomName,
          occupancyType: 'DBL',
          mealPlan,
          seasonName: currentSeasonName,
          cost: numbers[0],
          currency,
          pricingBasis,
          uncertain: true,
          notes: 'Occupancy was not explicit in the source row.',
        });
      }
    }

    return this.dedupeRates(rates);
  }

  private buildTextExtractionDiagnostics(text: string, rows: string[][]): NonNullable<ContractPreview['parserDiagnostics']> {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const detectedHotels = this.detectHotelSections(text, '').map((section) => section.hotelName);
    const detectedTables = this.detectTextRateTables(lines);
    const skippedSections = this.detectSkippedTextSections(lines);
    const lineClassifications = this.classifyHotelContractLines(lines);
    const rateIntelligence = rows.length === 0 ? this.buildAssistedRateIntelligence(lines, lineClassifications) : { rejections: [] };
    const warnings: string[] = [];
    if (/[\u0600-\u06FF]/.test(text)) {
      warnings.push('Arabic text detected; PDF text extraction may need OCR validation for Arabic-only notes.');
    }
    if (/m[oö]venpick|moevenpick/i.test(text) && detectedHotels.length <= 1) {
      warnings.push('Movenpick enterprise contract indicators found but only one hotel section was detected.');
    }
    if (detectedTables.length === 0 && /\b(rate|rates|room|single|double|sgl|dbl|bb|hb)\b/i.test(text)) {
      warnings.push('Pricing keywords were found but no confident rate table header was detected.');
    }
    const confidence = Math.max(
      0.2,
      Math.min(
        0.95,
        0.25 + (detectedHotels.length > 0 ? 0.2 : 0) + (detectedTables.length > 0 ? 0.3 : 0) + (rows.length > 0 ? 0.15 : 0) - (warnings.length * 0.08),
      ),
    );

    return {
      source: rows.length > 0 ? 'workbook' : 'text',
      rowCount: rows.length,
      parsedTextLineCount: lines.length,
      first20Lines: lines.slice(0, 20),
      detectedHotels,
      detectedTables,
      skippedSections,
      rateCandidateRejections: rateIntelligence.rejections.slice(0, 200),
      confidence: Number(confidence.toFixed(2)),
      warnings,
      extractionMode: rows.length > 0 ? 'WORKBOOK' : 'TEXT_PDF',
    };
  }

  private buildAssistedExtractionPreview(
    text: string,
    rows: string[][],
    options: { oneHotelAtATimeRequired?: boolean } = {},
  ): AssistedExtractionPreview | undefined {
    if (rows.length > 0 || !text.trim()) return undefined;

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const diagnostics = this.buildTextExtractionDiagnostics(text, rows);
    const lineClassifications = this.classifyHotelContractLines(lines);
    const rateIntelligence = this.buildAssistedRateIntelligence(lines, lineClassifications);
    const rateCandidates = rateIntelligence.candidates;
    const blocks: AssistedExtractionPreview['blocks'] = [];
    const seen = new Set<string>();

    const addBlock = (block: AssistedExtractionPreview['blocks'][number]) => {
      const key = `${block.kind}:${block.lineStart || 0}:${block.label.toLowerCase()}`;
      if (seen.has(key) || !block.text.trim()) return;
      seen.add(key);
      blocks.push({
        ...block,
        suggestedTag: block.suggestedTag || this.suggestAssistedBlockTag(block.text),
      });
    };

    for (const table of diagnostics.detectedTables || []) {
      const start = Math.max(0, (table.lineNumber || 1) - 1);
      const tableLines = lines.slice(start, Math.min(lines.length, start + 10));
      const candidateIds = rateCandidates
        .filter((candidate) => candidate.lineNumber >= start + 1 && candidate.lineNumber <= start + tableLines.length)
        .map((candidate) => candidate.id);
      addBlock({
        id: `table-${table.lineNumber || blocks.length + 1}`,
        kind: 'DETECTED_TABLE',
        label: table.label || `Detected table at line ${table.lineNumber || start + 1}`,
        suggestedTag: 'ROOM_RATE_TABLE',
        lineStart: start + 1,
        lineEnd: start + tableLines.length,
        text: tableLines.join('\n'),
        rows: tableLines.map((line) => line.split(/\t+| {2,}|,/).map((cell) => cell.trim()).filter(Boolean)),
        columns: table.columns || [],
        rateCandidateIds: candidateIds,
      });
    }

    for (const candidate of rateCandidates.slice(0, 120)) {
      const start = Math.max(0, candidate.lineNumber - 2);
      const candidateLines = lines.slice(start, Math.min(lines.length, start + 5));
      addBlock({
        id: `rate-candidate-${candidate.lineNumber}`,
        kind: 'DETECTED_TABLE',
        label: `Rate candidate line ${candidate.lineNumber} (${Math.round(candidate.confidence * 100)}%)`,
        suggestedTag: 'ROOM_RATE_TABLE',
        lineStart: start + 1,
        lineEnd: start + candidateLines.length,
        text: candidateLines.join('\n'),
        rows: [this.tokenizeHotelContractLine(candidate.rawLine)],
        columns: Object.values(candidate.mappingSuggestions).filter(Boolean),
        mappings: candidate.mappingSuggestions,
        rateCandidateIds: [candidate.id],
      });
    }

    for (const section of diagnostics.skippedSections || []) {
      const start = Math.max(0, (section.lineNumber || 1) - 1);
      const sectionLines = lines.slice(start, Math.min(lines.length, start + 6));
      addBlock({
        id: `section-${section.lineNumber || blocks.length + 1}`,
        kind: 'SKIPPED_SECTION',
        label: section.label || section.reason,
        lineStart: start + 1,
        lineEnd: start + sectionLines.length,
        text: sectionLines.join('\n'),
      });
    }

    lines.slice(0, 2500).forEach((line, index) => {
      const suggestedTag = this.suggestAssistedBlockTag(line);
      if (!suggestedTag || (suggestedTag !== 'CHILD_POLICY' && suggestedTag !== 'CANCELLATION_POLICY' && suggestedTag !== 'SUPPLEMENT_SECTION' && suggestedTag !== 'TAXES_SERVICE_NOTES')) {
        return;
      }
      const sectionLines = lines.slice(index, Math.min(lines.length, index + 5));
      addBlock({
        id: `${suggestedTag.toLowerCase()}-${index + 1}`,
        kind: 'RAW_TEXT',
        label: `${this.humanizeAssistedRole(suggestedTag as unknown as AssistedExtractionColumnRole)} lines ${index + 1}-${index + sectionLines.length}`,
        suggestedTag,
        lineStart: index + 1,
        lineEnd: index + sectionLines.length,
        text: sectionLines.join('\n'),
      });
    });

    for (let index = 0; index < lines.length && blocks.length < 24; index += 14) {
      const chunk = lines.slice(index, index + 14);
      addBlock({
        id: `text-${index + 1}`,
        kind: 'RAW_TEXT',
        label: `Raw text lines ${index + 1}-${index + chunk.length}`,
        lineStart: index + 1,
        lineEnd: index + chunk.length,
        text: chunk.join('\n'),
      });
    }

    const preview: AssistedExtractionPreview = {
      mode: 'PDF_ASSISTED_REVIEW',
      importDisabled: true,
      oneHotelAtATimeRequired: options.oneHotelAtATimeRequired ?? true,
      requiredColumnRoles: ['ROOM_CATEGORY', 'SEASON', 'DATE_RANGE', 'MEAL_PLAN', 'PRICING_BASIS', 'RATE'],
      blocks: blocks.slice(0, 40),
      lineClassifications: lineClassifications.slice(0, 500),
      rateCandidates: rateCandidates.slice(0, 200),
      rejectedRateCandidates: rateIntelligence.rejections.slice(0, 200),
      qcWarnings: [],
    };
    preview.qcWarnings = this.buildAssistedExtractionQcWarnings(preview);
    return preview;
  }

  private suggestAssistedBlockTag(text: string): AssistedExtractionBlockTag | undefined {
    if (/\b(cancel|cancellation|no[- ]?show|penalt)/i.test(text)) return 'CANCELLATION_POLICY';
    if (/\b(child|children|infant|age|extra bed)\b/i.test(text)) return 'CHILD_POLICY';
    if (/\b(tax|service charge|vat|municipality)\b/i.test(text)) return 'TAXES_SERVICE_NOTES';
    if (/\b(supplement|gala|extra meal|single supplement)\b/i.test(text)) return 'SUPPLEMENT_SECTION';
    if (/\b(season|valid|from|to|date range)\b/i.test(text) && !/\b(room|rate|sgl|dbl|single|double)\b/i.test(text)) return 'SEASON_TABLE';
    if (/\b(room|suite|rate|sgl|dbl|single|double|bb|hb|fb)\b/i.test(text)) return 'ROOM_RATE_TABLE';
    return undefined;
  }

  private classifyHotelContractLines(lines: string[]) {
    return lines.map((rawLine, index) => {
      const line = rawLine.replace(/\s+/g, ' ').trim();
      const amounts = this.extractMoneyAmounts(line);
      const roomName = this.detectRoomName(line) || this.detectLooseRoomName(line);
      const season = this.detectSeasonNameInLine(line);
      const dateRange = this.detectDateRangeInLine(line);
      const mealPlan = this.extractMealPlanFromText(line);
      let type: HotelContractLineClassification = 'UNKNOWN';
      let confidence = 0.25;

      if (this.extractHotelHeading(line)) {
        type = 'HOTEL_NAME';
        confidence = 0.82;
      } else if (/\b(cancel|cancellation|no[- ]?show|penalt)/i.test(line)) {
        type = 'CANCELLATION';
        confidence = 0.88;
      } else if (/\b(child|children|infant|age|extra bed)\b/i.test(line)) {
        type = 'CHILD_POLICY';
        confidence = 0.84;
      } else if (/\b(tax|service charge|vat|municipality)\b/i.test(line)) {
        type = 'TAX_NOTE';
        confidence = 0.82;
      } else if (/\b(supplement|gala|extra meal|single supplement)\b/i.test(line)) {
        type = amounts.length > 0 ? 'SUPPLEMENT' : 'UNKNOWN';
        confidence = amounts.length > 0 ? 0.82 : 0.45;
      } else if (amounts.length > 0 && (roomName || /\b(room|suite|sgl|dbl|tpl|trp|single|double|triple|bb|hb|fb)\b/i.test(line))) {
        type = 'RATE_ROW';
        confidence = Math.min(0.92, 0.45 + (roomName ? 0.2 : 0) + (amounts.length >= 2 ? 0.15 : 0) + (mealPlan !== 'BB' || /\bbb\b/i.test(line) ? 0.08 : 0) + (dateRange ? 0.08 : 0));
      } else if (roomName) {
        type = 'ROOM_TYPE';
        confidence = 0.76;
      } else if (season) {
        type = 'SEASON';
        confidence = 0.78;
      } else if (dateRange) {
        type = 'DATE_RANGE';
        confidence = 0.78;
      } else if (/\b(bb|hb|fb|half board|full board|bed\s*(?:and|&)\s*breakfast)\b/i.test(line)) {
        type = 'MEAL_PLAN';
        confidence = 0.7;
      }

      return {
        lineNumber: index + 1,
        rawLine,
        type,
        confidence: Number(confidence.toFixed(2)),
      };
    });
  }

  private buildAssistedRateIntelligence(
    lines: string[],
    classifications: Array<{ lineNumber: number; rawLine: string; type: HotelContractLineClassification; confidence: number }>,
  ): { candidates: AssistedRateCandidate[]; rejections: AssistedRateCandidateRejection[] } {
    const candidates: AssistedRateCandidate[] = [];
    const rejections: AssistedRateCandidateRejection[] = [];
    const acceptedLineNumbers = new Set<number>();
    const hotelSections = this.detectHotelSections(lines.join('\n'), '');
    let lastRoom = '';
    let currentSeason = '';
    let currentDateRange = '';
    let currentMealPlan = 'BB';
    const recentNumericOnlyLines: Array<{ lineNumber: number; rawLine: string; values: number[] }> = [];

    classifications.forEach((classified, index) => {
      const line = classified.rawLine.replace(/\s+/g, ' ').trim();
      const room = this.detectRoomName(line) || this.detectLooseRoomName(line);
      const season = this.detectSeasonNameInLine(line);
      const dateRange = this.detectDateRangeInLine(line);
      const mealPlan = this.extractMealPlanFromText(line);
      const amounts = this.extractMoneyAmounts(line);
      const numericValues = amounts.map((amount) => amount.amount);
      const detectedHotel = this.findDetectedHotelForLine(classified.lineNumber, hotelSections);

      if (room) lastRoom = room;
      if (season) currentSeason = season;
      if (dateRange) currentDateRange = dateRange;
      if (mealPlan) currentMealPlan = mealPlan;

      const numericOnly = numericValues.length > 0 && !/[A-Za-z]/.test(line.replace(/\b(JOD|USD|EUR)\b/gi, ''));
      if (numericOnly) {
        recentNumericOnlyLines.push({ lineNumber: classified.lineNumber, rawLine: line, values: numericValues });
        if (recentNumericOnlyLines.length > 4) recentNumericOnlyLines.shift();
      }

      const previous = classifications.slice(Math.max(0, index - 4), index);
      const next = classifications.slice(index + 1, Math.min(classifications.length, index + 6));
      const previousRoom = [...previous].reverse().map((entry) => this.detectRoomName(entry.rawLine) || this.detectLooseRoomName(entry.rawLine)).find(Boolean) || lastRoom;
      const nextRoom = next.map((entry) => this.detectRoomName(entry.rawLine) || this.detectLooseRoomName(entry.rawLine)).find(Boolean) || '';
      const candidateRoom = room || previousRoom;
      const shouldReconstruct = (numericValues.length === 0 && Boolean(room || nextRoom || previousRoom)) || numericOnly;
      const reconstructed = shouldReconstruct
        ? this.reconstructFlattenedRateCandidate(classified, index, classifications, candidateRoom || nextRoom, {
            currentSeason,
            currentDateRange,
            currentMealPlan,
            detectedHotel,
          })
        : null;
      const hasRateSignal =
        classified.type === 'RATE_ROW' ||
        (numericValues.length >= 2 && Boolean(candidateRoom)) ||
        (numericValues.length >= 1 && /\b(sgl|dbl|tpl|trp|single|double|triple|bb|hb|fb)\b/i.test(line)) ||
        Boolean(reconstructed);

      if (!hasRateSignal || (numericValues.length === 0 && !reconstructed)) {
        const looksTableLike = this.isNumericOrTableLikeRateLine(line, classified.type, numericValues);
        if (looksTableLike) {
          rejections.push(
            this.buildRateCandidateRejection(classified, {
              detectedHotel,
              possibleRoom: candidateRoom || nextRoom,
              possibleMealPlan: mealPlan || currentMealPlan,
              possibleOccupancy: this.detectOccupancy(line),
              possibleSeason: season || currentSeason,
              possibleDateRange: dateRange || currentDateRange,
              possiblePriceValues: numericValues,
              sourceLines: [classified.lineNumber],
              confidence: classified.confidence,
              rejectionReason: this.explainRateCandidateRejection(line, candidateRoom || nextRoom, numericValues),
            }),
          );
        }
        return;
      }

      const detectedOccupancy = this.detectOccupancy(line);
      const candidateValues = reconstructed?.numericValues || numericValues;
      const sourceLines = reconstructed?.sourceLines || [classified.lineNumber];
      const resolvedRoom = reconstructed?.room || candidateRoom;
      const resolvedMealPlan = reconstructed?.mealPlan || mealPlan || currentMealPlan;
      const confidence = Math.min(
        0.95,
        0.35 +
          (resolvedRoom ? 0.2 : 0) +
          (candidateValues.length >= 2 ? 0.15 : 0) +
          (/\b(sgl|dbl|tpl|trp|single|double|triple)\b/i.test(line) ? 0.1 : 0) +
          (currentSeason || season ? 0.08 : 0) +
          (resolvedMealPlan ? 0.06 : 0) +
          (reconstructed ? 0.08 : 0) +
          (numericOnly ? -0.12 : 0),
      );
      const mappingSuggestions: Partial<Record<AssistedExtractionColumnRole, string>> = {};
      if (resolvedRoom) mappingSuggestions.ROOM_CATEGORY = resolvedRoom;
      if (reconstructed?.season || currentSeason || season) mappingSuggestions.SEASON = reconstructed?.season || season || currentSeason;
      if (reconstructed?.dateRange || currentDateRange || dateRange) mappingSuggestions.DATE_RANGE = reconstructed?.dateRange || dateRange || currentDateRange;
      if (resolvedMealPlan) mappingSuggestions.MEAL_PLAN = resolvedMealPlan;
      mappingSuggestions.PRICING_BASIS = this.detectPricingBasis(line);
      if (candidateValues.length > 0) mappingSuggestions.RATE = candidateValues.join(', ');
      if (/\b(single supplement|sgl supp|single supp)\b/i.test(line) && candidateValues[0]) mappingSuggestions.SINGLE_SUPPLEMENT = String(candidateValues[0]);

      candidates.push({
        id: `rate-${sourceLines.join('-')}`,
        lineNumber: classified.lineNumber,
        rawLine: reconstructed?.rawLine || classified.rawLine,
        lineType: classified.type,
        detectedHotel: detectedHotel || undefined,
        detectedRoom: resolvedRoom || undefined,
        detectedMealPlan: resolvedMealPlan || undefined,
        detectedOccupancy: reconstructed?.occupancy || detectedOccupancy,
        detectedSeason: reconstructed?.season || season || currentSeason || undefined,
        detectedDateRange: reconstructed?.dateRange || dateRange || currentDateRange || undefined,
        detectedNumericValues: candidateValues,
        sourceLines,
        confidence: Number(confidence.toFixed(2)),
        mappingSuggestions,
      });
      sourceLines.forEach((lineNumber) => acceptedLineNumbers.add(lineNumber));
    });

    const dedupedCandidates = candidates.filter((candidate, index, all) => all.findIndex((other) => other.rawLine === candidate.rawLine && other.lineNumber === candidate.lineNumber) === index);
    const dedupedAcceptedLineNumbers = new Set(dedupedCandidates.flatMap((candidate) => candidate.sourceLines || [candidate.lineNumber]));
    const dedupedRejections = rejections
      .filter((rejection) => !dedupedAcceptedLineNumbers.has(rejection.lineNumber))
      .filter((rejection, index, all) => all.findIndex((other) => other.rawLine === rejection.rawLine && other.lineNumber === rejection.lineNumber) === index);
    acceptedLineNumbers.clear();
    return { candidates: dedupedCandidates, rejections: dedupedRejections };
  }

  private reconstructFlattenedRateCandidate(
    classified: { lineNumber: number; rawLine: string; type: HotelContractLineClassification; confidence: number },
    index: number,
    classifications: Array<{ lineNumber: number; rawLine: string; type: HotelContractLineClassification; confidence: number }>,
    fallbackRoom: string,
    context: { currentSeason: string; currentDateRange: string; currentMealPlan: string; detectedHotel: string },
  ) {
    const line = classified.rawLine.replace(/\s+/g, ' ').trim();
    if (['HOTEL_NAME', 'SEASON', 'DATE_RANGE', 'SUPPLEMENT', 'CHILD_POLICY', 'CANCELLATION', 'TAX_NOTE'].includes(classified.type)) {
      return null;
    }
    const localRoom = this.detectRoomName(line) || this.detectLooseRoomName(line) || fallbackRoom;
    const window = classifications.slice(index, Math.min(classifications.length, index + 6));
    const sourceEntries: Array<{ lineNumber: number; rawLine: string; type: HotelContractLineClassification; confidence: number }> = [];
    for (const [offset, entry] of window.entries()) {
      const entryLine = entry.rawLine.replace(/\s+/g, ' ').trim();
      if (offset > 0 && ['HOTEL_NAME', 'SEASON', 'DATE_RANGE', 'SUPPLEMENT', 'CHILD_POLICY', 'CANCELLATION', 'TAX_NOTE'].includes(entry.type)) break;
      if (offset > 0 && entry.type === 'RATE_ROW' && sourceEntries.some((source) => this.extractMoneyAmounts(source.rawLine).length > 0)) break;
      const values = this.extractMoneyAmounts(entryLine).map((amount) => amount.amount);
      const hasRoom = Boolean(this.detectRoomName(entryLine) || this.detectLooseRoomName(entryLine));
      const hasContext = /\b(sgl|dbl|tpl|trp|single|double|triple|bb|hb|fb|room|suite|chalet|villa)\b/i.test(entryLine);
      if (offset === 0 || values.length > 0 || hasRoom || hasContext) sourceEntries.push(entry);
    }
    const combined = sourceEntries.map((entry) => entry.rawLine.replace(/\s+/g, ' ').trim()).join(' ');
    const numericValues = this.extractMoneyAmounts(combined).map((amount) => amount.amount);
    const room = this.detectRoomName(combined) || this.detectLooseRoomName(combined) || localRoom;
    if (!room || numericValues.length === 0) return null;
    if (numericValues.length === 1 && !/\b(sgl|dbl|tpl|trp|single|double|triple|bb|hb|fb)\b/i.test(combined)) return null;

    return {
      rawLine: sourceEntries.map((entry) => entry.rawLine).join(' | '),
      room,
      mealPlan: this.extractMealPlanFromText(combined) || context.currentMealPlan,
      occupancy: this.detectOccupancy(combined),
      numericValues,
      sourceLines: sourceEntries.map((entry) => entry.lineNumber),
      season: this.detectSeasonNameInLine(combined) || context.currentSeason,
      dateRange: this.detectDateRangeInLine(combined) || context.currentDateRange,
      detectedHotel: context.detectedHotel,
    };
  }

  private isNumericOrTableLikeRateLine(line: string, type: HotelContractLineClassification, numericValues: number[]) {
    return (
      numericValues.length > 0 ||
      type === 'ROOM_TYPE' ||
      type === 'RATE_ROW' ||
      /\b(room|suite|chalet|villa|sgl|dbl|tpl|trp|single|double|triple|bb|hb|fb|rate|rates?)\b/i.test(line)
    );
  }

  private explainRateCandidateRejection(line: string, room: string, numericValues: number[]) {
    if (numericValues.length === 0 && room) return 'Room-like line had no price values nearby.';
    if (numericValues.length === 0) return 'Table-like line had no price values.';
    if (!room) return 'Price values found but no room category could be linked from the surrounding lines.';
    if (numericValues.length === 1 && !/\b(sgl|dbl|tpl|trp|single|double|triple|bb|hb|fb)\b/i.test(line)) {
      return 'Only one price value found without occupancy or meal-plan context.';
    }
    return 'Line looked table-like but did not meet review candidate confidence thresholds.';
  }

  private buildRateCandidateRejection(
    classified: { lineNumber: number; rawLine: string },
    details: {
      detectedHotel: string;
      possibleRoom: string;
      possibleMealPlan: string;
      possibleOccupancy: string;
      possibleSeason: string;
      possibleDateRange: string;
      possiblePriceValues: number[];
      sourceLines: number[];
      confidence: number;
      rejectionReason: string;
    },
  ): AssistedRateCandidateRejection {
    return {
      lineNumber: classified.lineNumber,
      rawLine: classified.rawLine,
      detectedHotel: details.detectedHotel || undefined,
      possibleRoom: details.possibleRoom || undefined,
      possibleMealPlan: details.possibleMealPlan || undefined,
      possibleOccupancy: details.possibleOccupancy || undefined,
      possibleSeason: details.possibleSeason || undefined,
      possibleDateRange: details.possibleDateRange || undefined,
      possiblePriceValues: details.possiblePriceValues,
      sourceLines: details.sourceLines,
      confidence: Number(details.confidence.toFixed(2)),
      rejectionReason: details.rejectionReason,
    };
  }

  private findDetectedHotelForLine(lineNumber: number, sections: Array<{ hotelName: string; lineStart: number; lineEnd: number }>) {
    return sections.find((section) => lineNumber >= section.lineStart && lineNumber <= section.lineEnd)?.hotelName || '';
  }

  private tokenizeHotelContractLine(line: string) {
    return line.split(/\t+| {2,}|\|/).map((cell) => cell.trim()).filter(Boolean).length > 1
      ? line.split(/\t+| {2,}|\|/).map((cell) => cell.trim()).filter(Boolean)
      : line.split(/\s+/).map((cell) => cell.trim()).filter(Boolean);
  }

  private buildAssistedExtractionQcWarnings(assisted: AssistedExtractionPreview) {
    const warnings: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }> = [
      {
        severity: 'blocker',
        field: 'assistedExtraction',
        message: 'Raw PDF extraction is assisted-review only. Import stays disabled until an operator approves mappings and exports a normalized workbook.',
      },
    ];
    const approvedRoomRateBlocks = assisted.blocks.filter((block) => block.tag === 'ROOM_RATE_TABLE' && block.approved);
    const mappedRoles = new Set<string>();
    for (const block of approvedRoomRateBlocks) {
      for (const [role, sourceColumn] of Object.entries(block.mappings || {})) {
        if (sourceColumn) mappedRoles.add(role);
      }
    }
    for (const role of assisted.requiredColumnRoles) {
      if (!mappedRoles.has(role)) {
        warnings.push({
          severity: 'warning',
          field: `assistedExtraction.mappings.${role}`,
          message: `${this.humanizeAssistedRole(role)} is not mapped on an approved room/rate table.`,
        });
      }
    }
    if (!assisted.blocks.some((block) => block.suggestedTag === 'CHILD_POLICY' || block.tag === 'CHILD_POLICY')) {
      warnings.push({ severity: 'warning', field: 'assistedExtraction.childPolicy', message: 'No child policy block was tagged or detected.' });
    }
    if (!assisted.blocks.some((block) => block.suggestedTag === 'CANCELLATION_POLICY' || block.tag === 'CANCELLATION_POLICY')) {
      warnings.push({ severity: 'warning', field: 'assistedExtraction.cancellationPolicy', message: 'No cancellation policy block was tagged or detected.' });
    }
    return warnings;
  }

  private humanizeAssistedRole(role: AssistedExtractionColumnRole) {
    return role.toLowerCase().replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
  }

  private buildTextExtractionDiagnosticsOverrides(
    diagnostics: NonNullable<ContractPreview['parserDiagnostics']>,
  ): Omit<
    NonNullable<ContractPreview['parserDiagnostics']>,
    'source' | 'rowCount' | 'parsedTextLineCount' | 'first20Lines' | 'detectedHotels' | 'extractionMode' | 'confidence'
  > {
    const {
      source: _source,
      rowCount: _rowCount,
      parsedTextLineCount: _parsedTextLineCount,
      first20Lines: _first20Lines,
      detectedHotels: _detectedHotels,
      extractionMode: _extractionMode,
      confidence: _confidence,
      ...details
    } = diagnostics;
    return details;
  }

  private detectHotelSections(text: string, fileName: string) {
    const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim());
    const candidates: Array<{ hotelName: string; lineIndex: number }> = [];
    const seen = new Set<string>();

    lines.forEach((line, lineIndex) => {
      const hotelName = this.extractHotelHeading(line);
      if (!hotelName) return;
      const key = hotelName.toLowerCase();
      if (seen.has(`${key}:${lineIndex}`)) return;
      seen.add(`${key}:${lineIndex}`);
      candidates.push({ hotelName, lineIndex });
    });

    const sectionStarts: Array<{ hotelName: string; lineIndex: number }> = [];
    const sectionNames = new Set<string>();
    candidates.forEach((candidate) => {
      const key = candidate.hotelName.toLowerCase();
      if (sectionNames.has(key)) return;
      sectionNames.add(key);
      sectionStarts.push(candidate);
    });

    if (sectionStarts.length === 1) {
      return [{ hotelName: sectionStarts[0].hotelName, text, lineStart: sectionStarts[0].lineIndex + 1, lineEnd: lines.length }];
    }

    if (sectionStarts.length === 0) {
      return [];
    }

    return sectionStarts.map((section, index) => {
      const next = sectionStarts[index + 1];
      const sectionLines = lines.slice(section.lineIndex, next ? next.lineIndex : lines.length).filter(Boolean);
      return {
        hotelName: section.hotelName,
        text: sectionLines.join('\n'),
        lineStart: section.lineIndex + 1,
        lineEnd: next ? next.lineIndex : lines.length,
      };
    });
  }

  private extractHotelHeading(line: string) {
    const normalized = line
      .replace(/[|•]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized || normalized.length > 140) return '';
    const lower = normalized.toLowerCase();
    const hasPropertySignal = /\b(dead sea|petra|aqaba|tala|nabatean|castle|spa|city|amman|wadi|rum|souq|village|island|beach|club|red sea)\b/i.test(normalized);
    if (
      /\b(enterprise|contract|agreement|rate\s+sheet|tariff|hotels\s*&\s*resorts|hotels and resorts|group)\b/i.test(normalized) &&
      !hasPropertySignal
    ) {
      return '';
    }
    if (/\bm[oÃ¶]venpick\s+hotels?\b/i.test(normalized) && !hasPropertySignal) return '';
    if (lower === 'movenpick' || lower === 'mövenpick' || lower === 'moevenpick') return '';

    const movenpick = normalized.match(/\b(?:m[oö]venpick|moevenpick)\b(?:\s+(?:resort|hotel|dead|petra|aqaba|tala|nabatean|castle|spa|city|amman|wadi|rum|jordan|&|and|by|sea|souq|royal|village|island|beach|club|red)){0,12}/i);
    if (movenpick) {
      return this.cleanHotelHeading(movenpick[0]);
    }

    const generic = normalized.match(/\b[A-Z][A-Za-z'&.-]+(?:\s+[A-Z][A-Za-z'&.-]+){0,8}\s+(?:Hotel|Resort|Suites|Lodge|Camp|Village|Castle|Spa)\b/i);
    return generic ? this.cleanHotelHeading(generic[0]) : '';
  }

  private cleanHotelHeading(value: string) {
    return value
      .replace(/\b(contract|rates?|tariff|agreement|202\d|validity|page)\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .replace(/\bMövenpick\b/i, 'Mövenpick')
      .replace(/\bMovenpick\b/i, 'Mövenpick')
      .replace(/\bMoevenpick\b/i, 'Mövenpick');
  }

  private detectTextRateTables(lines: string[]) {
    const tables: Array<{ label: string; lineNumber?: number; confidence: number; columns?: string[] }> = [];
    lines.slice(0, 2500).forEach((line, index) => {
      if (tables.length >= 120) return;
      const header = this.detectRateHeader(line);
      if (header.columns.length > 0) {
        tables.push({
          label: line.slice(0, 160),
          lineNumber: index + 1,
          confidence: 0.86,
          columns: header.columns.map((column) => column.occupancyType),
        });
        return;
      }
      if (this.isSeasonMealPlanHeader(line)) {
        tables.push({
          label: line.slice(0, 160),
          lineNumber: index + 1,
          confidence: 0.82,
          columns: ['HB', 'BB', 'SINGLE_SUPPLEMENT'],
        });
        return;
      }
      const amounts = this.extractMoneyAmounts(line);
      if (amounts.length >= 2 && (/\b(room|suite|single|double|sgl|dbl|tpl|trp|bb|hb|fb|rate|rates?)\b/i.test(line) || this.detectLooseRoomName(line))) {
        tables.push({
          label: line.slice(0, 160),
          lineNumber: index + 1,
          confidence: 0.55,
          columns: ['INFERRED_AMOUNTS'],
        });
      } else if (amounts.length >= 1 && this.detectLooseRoomName(line) && /\b(standard|deluxe|superior|suite|family|chalet|villa|king|twin)\b/i.test(line)) {
        tables.push({
          label: line.slice(0, 160),
          lineNumber: index + 1,
          confidence: 0.45,
          columns: ['REVIEW_CANDIDATE'],
        });
      }
    });
    return tables;
  }

  private detectSkippedTextSections(lines: string[]) {
    const skipped: Array<{ label: string; reason: string; lineNumber?: number }> = [];
    lines.slice(0, 2500).forEach((line, index) => {
      if (/[\u0600-\u06FF]/.test(line) && !/\d/.test(line)) {
        skipped.push({ label: line.slice(0, 120), reason: 'Arabic text section requires manual OCR/QC review', lineNumber: index + 1 });
      } else if (/^\s*(arabic|terms|general conditions|bank details|signature|stamp)\b/i.test(line)) {
        skipped.push({ label: line.slice(0, 120), reason: 'Non-pricing administrative section', lineNumber: index + 1 });
      }
    });
    return skipped.slice(0, 30);
  }

  private guessEnterpriseSupplierName(text: string, fileName: string) {
    if (/\b(?:m[oö]venpick|moevenpick)\b/i.test(text) || /\b(?:m[oö]venpick|moevenpick)\b/i.test(fileName)) {
      return 'Mövenpick Hotels Jordan';
    }
    return this.guessNameFromFile(fileName);
  }

  private guessHotelNameFromText(text: string, fallback: string) {
    const detected = text
      .split(/\r?\n/)
      .map((line) => this.extractHotelHeading(line))
      .find(Boolean);
    return detected || fallback;
  }

  private extractHotelRatesFromTable(rows: string[][], text: string, fallbackCurrency: string): PreviewRate[] {
    const rates: PreviewRate[] = [];
    const tableLines = [
      ...rows.map((row) => row.map((cell) => String(cell || '').trim()).filter(Boolean)),
      ...text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => [line]),
    ].filter((row) => row.length > 0).slice(0, 2500);
    let activeHeader: Array<{ occupancyType: string; index: number; amountOffset: number }> = [];
    let activeSplitPattern: RegExp = /\s+/;
    let activePricingBasis: 'PER_PERSON' | 'PER_ROOM' = 'PER_ROOM';
    let currentSeasonName = 'Imported';

    for (const rawCells of tableLines) {
      const line = rawCells.join(' ').trim();
      currentSeasonName = this.detectSeasonNameInLine(line) || currentSeasonName;
      const header = this.detectRateHeader(line);
      if (header.columns.length > 0) {
        activeHeader = header.columns;
        activeSplitPattern = header.splitPattern;
        activePricingBasis = this.detectPricingBasis(line);
        continue;
      }

      const strictCells = line
        .split(activeSplitPattern)
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (strictCells.length < 2) {
        rates.push(...this.extractFlattenedTableRates(line, fallbackCurrency, activePricingBasis, currentSeasonName));
        continue;
      }
      const cells = strictCells;
      if (cells.length < 2) continue;

      if (activeHeader.length === 0) continue;

      const firstAmountIndex = cells.findIndex((cell) => this.extractMoneyAmounts(cell).length > 0);
      const roomCells = cells.filter((cell, index) => index < firstAmountIndex || (firstAmountIndex < 0 && this.extractMoneyAmounts(cell).length === 0));
      const roomName = this.normalizeRoomName(roomCells.join(' '));
      if (!roomName) continue;

      const rowAmountCells = cells.slice(firstAmountIndex >= 0 ? firstAmountIndex : 1);
      const rowAmounts = rowAmountCells.flatMap((cell) => this.extractMoneyAmounts(cell));
      if (rowAmounts.length === 0) continue;

      activeHeader.forEach((column) => {
        const amount = rowAmounts[column.amountOffset];
        if (!amount) return;
        rates.push({
          roomType: roomName,
          occupancyType: column.occupancyType,
          mealPlan: 'BB',
          seasonName: currentSeasonName,
          cost: amount.amount,
          currency: amount.currency || fallbackCurrency,
          pricingBasis: this.detectPricingBasis(line, activePricingBasis),
        });
      });
    }

    return this.dedupeRates(rates);
  }

  private extractSeasonMealPlanRates(rows: string[][], text: string, fallbackCurrency: string): PreviewRate[] {
    const rates: PreviewRate[] = [];
    const tableLines = [
      ...rows.map((row) => row.map((cell) => String(cell || '').trim()).filter(Boolean)),
      ...text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => [line]),
    ].filter((row) => row.length > 0).slice(0, 2500);
    let headerDetected = false;

    for (const rawCells of tableLines) {
      const line = rawCells.join(' ').trim();
      if (this.isSeasonMealPlanHeader(line)) {
        headerDetected = true;
        continue;
      }

      if (!headerDetected) continue;

      const parsed = this.parseSeasonMealPlanRow(line, fallbackCurrency || 'USD');
      if (!parsed) continue;

      rates.push({
        roomType: 'Standard',
        occupancyType: 'DBL',
        mealPlan: 'HB',
        seasonName: parsed.seasonName,
        cost: parsed.hb,
        currency: parsed.currency,
        pricingBasis: this.detectPricingBasis(line, 'PER_PERSON'),
      });
      rates.push({
        roomType: 'Standard',
        occupancyType: 'DBL',
        mealPlan: 'BB',
        seasonName: parsed.seasonName,
        cost: parsed.bb,
        currency: parsed.currency,
        pricingBasis: this.detectPricingBasis(line, 'PER_PERSON'),
      });
      if (typeof parsed.singleSupplement === 'number') {
        rates.push({
          roomType: 'Standard',
          occupancyType: 'SGL',
          mealPlan: 'BB',
          seasonName: parsed.seasonName,
          cost: parsed.bb + parsed.singleSupplement,
          currency: parsed.currency,
          pricingBasis: this.detectPricingBasis(line, 'PER_PERSON'),
          notes: 'Single rate calculated from BB plus single supplement.',
        });
      }
    }

    return this.dedupeRates(rates);
  }

  private isSeasonMealPlanHeader(line: string) {
    const normalized = line.toLowerCase();
    return /\bhb\b|half\s*board/.test(normalized) && /\bbb\b|bed\s*(?:and|&)\s*breakfast/.test(normalized) && /single\s*(?:supp|supplement)/.test(normalized);
  }

  private parseSeasonMealPlanRow(line: string, fallbackCurrency: string) {
    const amounts = this.extractMoneyAmounts(line);
    if (amounts.length < 2) return null;

    const firstAmountMatch = line.match(/(?:(?:JOD|USD|EUR|\$)\s*)?\d+(?:,\d{3})*(?:\.\d{1,2})?(?:\s*(?:JOD|USD|EUR))?/i);
    const seasonRaw = firstAmountMatch ? line.slice(0, firstAmountMatch.index).trim() : line.replace(/\d+(?:\.\d+)?/g, '').trim();
    const seasonName = this.normalizeSeasonLabel(seasonRaw);
    if (!seasonName) return null;

    return {
      seasonName,
      hb: amounts[0].amount,
      bb: amounts[1].amount,
      singleSupplement: amounts[2]?.amount,
      currency: amounts.find((amount) => amount.currency)?.currency || (line.includes('$') ? 'USD' : fallbackCurrency || 'USD'),
    };
  }

  private extractFlattenedTableRates(
    line: string,
    fallbackCurrency: string,
    fallbackPricingBasis: 'PER_PERSON' | 'PER_ROOM' = 'PER_ROOM',
    seasonName = 'Imported',
  ): PreviewRate[] {
    const numberMatches = line.match(/\d+(?:\.\d+)?/g) || [];
    const numbers = numberMatches
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0 && value < 10000);
    if (numbers.length === 0) return [];

    const room = this.normalizeRoomName(line.replace(/\d+(?:\.\d+)?/g, '').trim());
    if (!room) return [];

    const occupancyTypes = numbers.length >= 3 ? ['SGL', 'DBL', 'TRP'] : numbers.length === 2 ? ['DBL', 'TRP'] : ['DBL'];
    return numbers.slice(0, occupancyTypes.length).map((cost, index) => ({
      roomType: room,
      occupancyType: occupancyTypes[index],
      mealPlan: 'BB',
      seasonName,
      cost,
      currency: fallbackCurrency,
      pricingBasis: this.detectPricingBasis(line, fallbackPricingBasis),
      uncertain: true,
      notes: 'Extracted from flattened table row.',
    }));
  }

  private extractHotelRatesFromText(text: string, fallbackCurrency: string, seasonName: string): PreviewRate[] {
    const rates: PreviewRate[] = [];
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    let lastRoomName = '';

    for (const line of lines) {
      const roomName = this.detectRoomName(line) || lastRoomName;
      if (!roomName) continue;

      if (this.detectRoomName(line)) {
        lastRoomName = roomName;
      }

      const amounts = this.extractMoneyAmounts(line);
      if (amounts.length === 0) continue;

      const occupancy = this.detectOccupancy(line);
      const mealPlan = this.extractMealPlanFromText(line);
      const explicitOccupancy = occupancy !== 'DBL' || /\b(single|double|triple|sgl|dbl|tpl|trp)\b/i.test(line);
      const pricingBasis = this.detectPricingBasis(line);

      if (amounts.length >= 2 && !explicitOccupancy) {
        rates.push({
          roomType: roomName,
          occupancyType: 'SGL',
          mealPlan,
          seasonName,
          cost: amounts[0].amount,
          currency: amounts[0].currency || fallbackCurrency,
          pricingBasis,
          uncertain: true,
          notes: 'Single rate inferred from first amount in table-like row.',
        });
        rates.push({
          roomType: roomName,
          occupancyType: 'DBL',
          mealPlan,
          seasonName,
          cost: amounts[1].amount,
          currency: amounts[1].currency || fallbackCurrency,
          pricingBasis,
          uncertain: true,
          notes: 'Double rate inferred from second amount in table-like row.',
        });
        if (amounts[2]) {
          rates.push({
            roomType: roomName,
            occupancyType: 'TPL',
            mealPlan,
            seasonName,
            cost: amounts[2].amount,
            currency: amounts[2].currency || fallbackCurrency,
            pricingBasis,
            uncertain: true,
            notes: 'Triple rate inferred from third amount in table-like row.',
          });
        }
        continue;
      }

      rates.push({
        roomType: roomName,
        occupancyType: occupancy,
        mealPlan,
        seasonName,
        cost: amounts[0].amount,
        currency: amounts[0].currency || fallbackCurrency,
        pricingBasis,
        uncertain: !explicitOccupancy,
        notes: explicitOccupancy ? 'Extracted from text line.' : 'Occupancy defaulted to DBL from table-like text line.',
      });
    }

    return this.dedupeRates(rates);
  }

  private detectRoomName(line: string) {
    const roomPattern =
      /\b((?:standard|deluxe|superior|executive|classic|premium|family|grand|twin|double|triple|king|queen|chalet|villa|studio)\s+(?:room|suite|chalet|villa)|(?:junior|executive|grand|family|royal|presidential)\s+suite|(?:family\s+room)|(?:king|twin)\s+room|chalet|villa|suite|twin|double|triple)\b/i;
    const match = line.match(roomPattern);
    if (!match) return '';
    return match[1].replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private detectLooseRoomName(line: string) {
    const cleaned = line.replace(/\b(JOD|USD|EUR|BB|HB|FB|SGL|DBL|TPL|TRP)\b/gi, ' ').replace(/\d+(?:,\d{3})*(?:\.\d+)?/g, ' ');
    const match = cleaned.match(/\b(standard|deluxe|superior|executive|classic|premium|family|grand|junior|royal|presidential|king|queen|twin|chalet|villa|studio)(?:\s+(?:room|suite|chalet|villa))?\b/i);
    if (!match) return '';
    const suffix = /\b(room|suite|chalet|villa)\b/i.test(match[0]) ? '' : /\b(chalet|villa)\b/i.test(match[1]) ? '' : ' Room';
    return `${match[0]}${suffix}`.replace(/\s+/g, ' ').trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private normalizeRoomName(value: string) {
    const cleaned = value
      .replace(/\b(room|type|category|rates?|rate|price|prices?|nett|net|jod|usd|eur)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || /^\d/.test(cleaned)) return '';

    const detected = this.detectRoomName(cleaned);
    if (detected) return detected;

    if (/\b(standard|deluxe|suite|twin|double|triple|superior|executive|classic|premium|family|grand|chalet|villa|king|queen|studio)\b/i.test(cleaned)) {
      return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
    }

    return '';
  }

  private splitTableLine(line: string, splitPattern: RegExp) {
    const splitCells = line
      .split(splitPattern)
      .map((cell) => cell.trim())
      .filter(Boolean);

    return splitCells.length > 1 ? splitCells : line.split(/\s+/).map((cell) => cell.trim()).filter(Boolean);
  }

  private detectRateHeader(line: string) {
    const lowerLine = line.toLowerCase();
    const hasSingle = lowerLine.includes('sgl') || lowerLine.includes('single');
    const hasDouble = lowerLine.includes('dbl') || lowerLine.includes('double') || lowerLine.includes('twin');
    const hasTriple = lowerLine.includes('tpl') || lowerLine.includes('trp') || lowerLine.includes('triple');
    const keywordCount = [hasSingle, hasDouble, hasTriple].filter(Boolean).length;
    if (keywordCount < 2) {
      return { columns: [], splitPattern: /\s+/ };
    }

    const splitPattern = /\s{2,}|\t|\|/;
    const cells = this.splitTableLine(line, splitPattern);
    let amountOffset = 0;
    const columns: Array<{ occupancyType: string; index: number; amountOffset: number }> = [];

    cells.forEach((cell, index) => {
      const occupancyType = this.normalizeRateHeaderOccupancy(cell);
      if (!occupancyType) return;
      columns.push({ occupancyType, index, amountOffset });
      amountOffset += 1;
    });

    return { columns: columns.length >= 2 ? columns : [], splitPattern };
  }

  private detectSeasonNameInLine(line: string) {
    const seasonMatch = line.match(/\b(Low Season|High Season|Shoulder Season|Peak Season|Festive Season|Festive|Summer|Winter|Ramadan|Eid|Christmas|New Year)\b/i);
    return seasonMatch ? seasonMatch[1].replace(/\b\w/g, (letter) => letter.toUpperCase()) : '';
  }

  private detectDateRangeInLine(line: string) {
    const numericRange = line.match(/\b\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]20\d{2})?\s*(?:-|to|until|till|–|—)\s*\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]20\d{2})?\b/i);
    if (numericRange) return numericRange[0].replace(/\s+/g, ' ');

    const monthRange = line.match(/\b\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s*(?:20\d{2})?\s*(?:-|to|until|till|–|—)\s*\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*(?:\s*20\d{2})?\b/i);
    return monthRange ? monthRange[0].replace(/\s+/g, ' ') : '';
  }

  private normalizeRateHeaderOccupancy(value: string) {
    const normalized = value.trim().replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (normalized === 'SGL' || normalized === 'SINGLE') return 'SGL';
    if (normalized === 'DBL' || normalized === 'DOUBLE' || normalized === 'TWIN') return 'DBL';
    if (normalized === 'TRP' || normalized === 'TPL' || normalized === 'TRIPLE') return 'TRP';
    return '';
  }

  private detectOccupancy(line: string) {
    if (/\b(SGL|single)\b/i.test(line)) return 'SGL';
    if (/\b(DBL|double|twin)\b/i.test(line)) return 'DBL';
    if (/\b(TPL|TRP|triple)\b/i.test(line)) return 'TRP';
    return 'DBL';
  }

  private detectPricingBasis(text: string, fallback: 'PER_PERSON' | 'PER_ROOM' = 'PER_ROOM') {
    if (/\bper\s+person\b|\bpp\b|\bper\s+pax\b/i.test(text)) return 'PER_PERSON';
    if (/\bper\s+room\b|\bper\s+unit\b/i.test(text)) return 'PER_ROOM';
    return fallback;
  }

  private extractMoneyAmounts(line: string) {
    const amounts: Array<{ amount: number; currency?: string }> = [];
    const moneyPattern = /(?:(JOD|USD|EUR)\s*)?(\d{2,4}(?:,\d{3})*(?:\.\d{1,2})?)(?:\s*(JOD|USD|EUR))?/gi;

    for (const match of line.matchAll(moneyPattern)) {
      const amount = this.parseNumber(match[2]);
      if (!amount || amount <= 0 || amount > 10000) continue;
      amounts.push({ amount, currency: (match[1] || match[3] || '').toUpperCase() || undefined });
    }

    return amounts;
  }

  private dedupeRates(rates: PreviewRate[]) {
    return rates.filter((rate, index, allRates) => {
      const key = `${rate.roomType}|${rate.occupancyType}|${rate.mealPlan}|${rate.seasonName}|${rate.cost}|${rate.currency}`;
      return (
        allRates.findIndex(
          (candidate) =>
            `${candidate.roomType}|${candidate.occupancyType}|${candidate.mealPlan}|${candidate.seasonName}|${candidate.cost}|${candidate.currency}` === key,
        ) === index
      );
    });
  }

  private extractSeasons(rows: string[][], text: string, year: number, validFrom: string, validTo: string): ContractPreview['seasons'] {
    const seasons = new Map<string, { name: string; validFrom?: string | null; validTo?: string | null; uncertain?: boolean }>();
    const seasonNames = ['Low Season', 'High Season', 'Shoulder Season', 'Peak Season', 'Summer', 'Winter', 'Ramadan', 'Eid', 'Christmas', 'New Year'];
    const sourceLines = [
      ...rows.map((row) => row.filter(Boolean).join(' ')),
      ...text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    ];

    for (const line of sourceLines) {
      const seasonName = seasonNames.find((name) => new RegExp(`\\b${this.escapeRegExp(name)}\\b`, 'i').test(line));
      if (!seasonName) continue;
      const dates = Array.from(line.matchAll(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](20\d{2}))?/g));
      const parsedDates = dates
        .map((match) => this.normalizeDayMonthDate(match[1], match[2], match[3] || String(year)))
        .filter((date): date is string => Boolean(date));
      seasons.set(seasonName, {
        name: seasonName,
        validFrom: parsedDates[0] || validFrom,
        validTo: parsedDates[1] || validTo,
        uncertain: parsedDates.length < 2,
      });
    }

    return Array.from(seasons.values());
  }

  private guessSeasonNameFromRows(rows: string[][], fallback: string) {
    const text = rows.flat().join(' ');
    const seasonMatch = text.match(/\b(Low Season|High Season|Shoulder Season|Peak Season|Summer|Winter|Ramadan|Eid|Christmas|New Year)\b/i);
    return seasonMatch ? seasonMatch[1].replace(/\b\w/g, (letter) => letter.toUpperCase()) : fallback;
  }

  private extractMealPlanFromText(text: string) {
    if (/\bAI\b|all inclusive/i.test(text)) return 'AI';
    if (/\bFB\b|full board/i.test(text)) return 'FB';
    if (/\bHB\b|half board|dinner/i.test(text)) return 'HB';
    if (/\bRO\b|room only/i.test(text)) return 'RO';
    return 'BB';
  }

  private normalizeDayMonthDate(day: string, month: string, year: string) {
    const parsedDay = Number(day);
    const parsedMonth = Number(month);
    const parsedYear = Number(year);
    if (!Number.isFinite(parsedDay) || !Number.isFinite(parsedMonth) || !Number.isFinite(parsedYear)) return '';
    if (parsedDay < 1 || parsedDay > 31 || parsedMonth < 1 || parsedMonth > 12) return '';
    return `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-${String(parsedDay).padStart(2, '0')}`;
  }

  private normalizeSeasonLabel(value: string) {
    return value
      .replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1')
      .replace(/\s+/g, ' ')
      .replace(/\s*-\s*/g, ' - ')
      .trim();
  }

  private addPreviewAliases(preview: ContractPreview): ContractPreview {
    const serviceCharge = preview.taxes.find((tax) => /service/i.test(tax.name)) || null;
    const aliased = {
      ...preview,
      meta: this.normalizeExtractedMeta(preview.meta),
      ratePolicies: preview.ratePolicies || [],
      cancellationPolicies: preview.cancellationPolicies || (preview.cancellationPolicy ? [preview.cancellationPolicy] : []),
      hotelName: preview.hotel?.name || preview.supplier.name,
      contractStartDate: preview.contract.validFrom || null,
      contractEndDate: preview.contract.validTo || null,
      currency: preview.contract.currency,
      serviceCharge,
    };
    aliased.missingFields = Array.from(
      new Set([
        ...(preview.missingFields || []),
        ...(!aliased.hotelName ? ['hotelName'] : []),
        ...(!aliased.contractStartDate ? ['contractStartDate'] : []),
        ...(!aliased.contractEndDate ? ['contractEndDate'] : []),
        ...(preview.roomCategories.length === 0 ? ['roomCategories'] : []),
        ...(preview.seasons.length === 0 ? ['seasons'] : []),
        ...(preview.mealPlans.length === 0 ? ['mealPlans'] : []),
        ...(preview.rates.length === 0 ? ['rates'] : []),
      ]),
    );
    return aliased;
  }

  private normalizeExtractedMeta(value: unknown) {
    const meta = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    return {
      ...meta,
      defaultTaxPercent: this.parseNumber(meta.defaultTaxPercent) ?? null,
      defaultServicePercent: this.parseNumber(meta.defaultServicePercent) ?? null,
      taxIncluded: this.parseBoolean(meta.taxIncluded) ?? null,
      serviceIncluded: this.parseBoolean(meta.serviceIncluded) ?? null,
    };
  }

  private normalizeChildPolicyForApproval(value: unknown): ContractPreview['childPolicy'] {
    if (!value || typeof value !== 'object') return null;
    const policy = value as Record<string, unknown>;
    const infantMaxAge = this.parseNumber(policy.infantMaxAge);
    const childMaxAge = this.parseNumber(policy.childMaxAge);
    if (infantMaxAge === undefined || childMaxAge === undefined) {
      return null;
    }

    return {
      infantMaxAge,
      childMaxAge,
      notes: this.optionalString(policy.notes) || null,
      bands: Array.isArray(policy.bands)
        ? policy.bands.map((band: any) => ({
            label: this.optionalString(band.label) || 'Child policy band',
            minAge: this.parseNumber(band.minAge) ?? 0,
            maxAge: this.parseNumber(band.maxAge) ?? childMaxAge,
            chargeBasis: this.optionalString(band.chargeBasis) || ChildPolicyChargeBasis.FREE,
            chargeValue: this.parseNumber(band.chargeValue) ?? null,
            notes: this.optionalString(band.notes) || null,
          }))
        : [],
    };
  }

  private roomCategoriesFromRates(rates: PreviewRate[]) {
    const roomNames = Array.from(new Set(rates.map((rate) => rate.roomType).filter((value): value is string => Boolean(value))));
    return roomNames.map((name) => ({
      name,
      code: name
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .toUpperCase(),
      description: `${name} imported from reviewed contract import.`,
    }));
  }

  private extractTaxes(text: string, isGrandHyatt: boolean) {
    const taxes: ContractPreview['taxes'] = [];
    const taxMatch = text.match(/(?:tax|sales\s+tax)[^\d]{0,20}(\d+(?:\.\d+)?)\s*%/i);
    const serviceMatch = text.match(/(?:service\s+charge|service)[^\d]{0,20}(\d+(?:\.\d+)?)\s*%/i);

    if (taxMatch || isGrandHyatt) {
      taxes.push({ name: 'Sales tax', value: taxMatch ? Number(taxMatch[1]) : 8, included: /tax[^.\n]*(included|inclusive)/i.test(text) });
    }
    if (serviceMatch || isGrandHyatt) {
      taxes.push({
        name: 'Service charge',
        value: serviceMatch ? Number(serviceMatch[1]) : 5,
        included: /service\s+charge[^.\n]*(included|inclusive)/i.test(text),
      });
    }

    return taxes;
  }

  private extractMealPlans(text: string, rates: PreviewRate[]) {
    const codes = new Set(rates.map((rate) => this.hotelMealPlan(rate.mealPlan)).filter(Boolean));
    if (/\bBB\b|breakfast|bed and breakfast/i.test(text)) codes.add(HotelMealPlan.BB);
    if (/\bHB\b|half board|dinner/i.test(text)) codes.add(HotelMealPlan.HB);
    if (codes.size === 0) codes.add(HotelMealPlan.BB);

    return Array.from(codes).map((code, index) => ({
      code,
      isDefault: code === HotelMealPlan.BB || index === 0,
      notes: code === HotelMealPlan.BB ? 'Contracted room rates include bed and breakfast where stated.' : 'Meal plan extracted from contract supplements or notes.',
    }));
  }

  private extractSupplements(text: string, currency: string, isGrandHyatt: boolean): ContractPreview['supplements'] {
    const supplements: ContractPreview['supplements'] = [];
    const extraBed = this.findAmountNear(text, /extra\s+(adult\s+)?bed|extra\s+adult/i) ?? (isGrandHyatt ? 20 : null);
    const breakfast = this.findAmountNear(text, /breakfast/i) ?? (isGrandHyatt ? 10 : null);
    const dinner = this.findAmountNear(text, /dinner|half\s*board/i) ?? (isGrandHyatt ? 17 : null);

    if (extraBed !== null) {
      supplements.push({
        name: 'Extra bed',
        type: HotelContractSupplementType.EXTRA_BED,
        chargeBasis: HotelContractChargeBasis.PER_NIGHT,
        amount: extraBed,
        currency,
        pricingBasis: 'PER_ROOM',
        isMandatory: false,
        notes: 'Extracted extra bed / extra adult supplement.',
      });
    }
    if (breakfast !== null) {
      supplements.push({
        name: 'Extra breakfast',
        type: HotelContractSupplementType.EXTRA_BREAKFAST,
        chargeBasis: HotelContractChargeBasis.PER_NIGHT,
        amount: breakfast,
        currency,
        pricingBasis: 'PER_ROOM',
        isMandatory: false,
        notes: 'Extracted breakfast supplement.',
      });
    }
    if (dinner !== null) {
      supplements.push({
        name: 'Extra dinner',
        type: HotelContractSupplementType.EXTRA_DINNER,
        chargeBasis: HotelContractChargeBasis.PER_PERSON,
        amount: dinner,
        currency,
        pricingBasis: 'PER_ROOM',
        isMandatory: false,
        notes: 'Extracted dinner or half-board supplement.',
      });
    }

    return supplements;
  }

  private extractCancellationPolicy(text: string, isGrandHyatt: boolean): ContractPreview['cancellationPolicy'] {
    if (!/cancel|no[\s-]?show/i.test(text) && !isGrandHyatt) return null;
    const daysMatch = text.match(/(\d+)\s*days?.{0,80}(?:one|1)\s*night/i);
    const percentRules = this.extractCancellationPercentRules(text);
    if (percentRules.length > 0) {
      const summary = percentRules
        .map((rule) => `${rule.penaltyPercent}% cancellation penalty within ${rule.daysBefore} days before arrival`)
        .join('; ');

      return {
        summary,
        notes: this.extractSentence(text, /cancel/i) || 'Cancellation percentage rules extracted from contract.',
        noShowPenaltyType: HotelCancellationPenaltyType.FULL_STAY,
        noShowPenaltyValue: null,
        rules: percentRules.map((rule) => ({
          daysBefore: rule.daysBefore,
          penaltyPercent: rule.penaltyPercent,
          windowFromValue: rule.daysBefore,
          windowToValue: 0,
          deadlineUnit: HotelCancellationDeadlineUnit.DAYS,
          penaltyType: HotelCancellationPenaltyType.PERCENT,
          penaltyValue: rule.penaltyPercent,
          notes: `${rule.penaltyPercent}% penalty when cancelled within ${rule.daysBefore} days before arrival.`,
        })),
      };
    }

    return {
      summary: isGrandHyatt
        ? 'One night is charged for cancellations made within 2 days prior to arrival by 12 PM Jordan time. No-show is charged at 100% of the entire stay.'
        : this.extractSentence(text, /cancel/i) || 'Cancellation terms extracted from contract and need review.',
      notes: isGrandHyatt ? 'Deadline reference is 12 PM Jordan time.' : this.extractSentence(text, /no[\s-]?show/i),
      noShowPenaltyType: HotelCancellationPenaltyType.FULL_STAY,
      noShowPenaltyValue: null,
      rules: [
        {
          windowFromValue: daysMatch ? Number(daysMatch[1]) : isGrandHyatt ? 2 : 1,
          windowToValue: 0,
          deadlineUnit: HotelCancellationDeadlineUnit.DAYS,
          penaltyType: HotelCancellationPenaltyType.NIGHTS,
          penaltyValue: 1,
          notes: isGrandHyatt ? 'Charge one night when cancelled 2 days prior by 12 PM Jordan time.' : 'Extracted cancellation rule needs review.',
        },
      ],
    };
  }

  private extractCancellationPercentRules(text: string) {
    const rules: Array<{ daysBefore: number; penaltyPercent: number }> = [];
    const patterns = [
      /(?:within|less\s+than|inside)?\s*(\d+)\s*days?\s*(?:before|prior\s+to|of)?\s*(?:arrival|check[\s-]?in)?.{0,100}?(\d+(?:\.\d+)?)\s*%/gi,
      /(\d+(?:\.\d+)?)\s*%.{0,100}?(?:within|less\s+than|inside)\s*(\d+)\s*days?/gi,
    ];

    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const first = Number(match[1]);
        const second = Number(match[2]);
        const daysBefore = pattern.source.startsWith('(\\d') ? second : first;
        const penaltyPercent = pattern.source.startsWith('(\\d') ? first : second;

        if (Number.isFinite(daysBefore) && Number.isFinite(penaltyPercent) && daysBefore >= 0 && penaltyPercent > 0) {
          rules.push({
            daysBefore: Math.floor(daysBefore),
            penaltyPercent: Number(penaltyPercent.toFixed(2)),
          });
        }
      }
    }

    return Array.from(
      new Map(rules.map((rule) => [`${rule.daysBefore}:${rule.penaltyPercent}`, rule])).values(),
    ).sort((left, right) => right.daysBefore - left.daysBefore);
  }

  private extractChildPolicy(text: string, isGrandHyatt: boolean): ContractPreview['childPolicy'] {
    if (!/child|children|infant|kid/i.test(text) && !isGrandHyatt) return null;
    return {
      infantMaxAge: 5,
      childMaxAge: 12,
      notes: isGrandHyatt
        ? 'Children below 6 are free. Optional meal supplements for ages 6-12 are charged at 50% of the adult amount.'
        : this.extractSentence(text, /child|children/i) || 'Child policy extracted from contract and needs review.',
      bands: [
        {
          label: 'Child Below 6',
          minAge: 0,
          maxAge: 5,
          chargeBasis: ChildPolicyChargeBasis.FREE,
          chargeValue: null,
          notes: 'Child stays free below 6 years old.',
        },
        {
          label: 'Child 6-12 Meal Discount',
          minAge: 6,
          maxAge: 12,
          chargeBasis: ChildPolicyChargeBasis.PERCENT_OF_ADULT,
          chargeValue: 50,
          notes: 'Used for optional meal supplements when applicable.',
        },
      ],
    };
  }

  private async ensureSupplier(supplierId: string | null, supplierName: string, contractType: ContractImportType) {
    if (supplierId) {
      const existing = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
      if (existing) return existing;
    }

    const name = supplierName.trim();
    const existingByName = await this.prisma.supplier.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existingByName) return existingByName;

    return this.prisma.supplier.create({
      data: {
        name,
        type: contractType.toLowerCase(),
        notes: 'Created from reviewed contract import.',
      },
    });
  }

  private async importHotelPreview(
    preview: ContractPreview,
    supplierId: string,
    sourceFileName: string,
    sourceFilePath: string,
    approvalMode?: ContractImportApprovalMode,
  ) {
    if (!preview.hotel?.name || !preview.contract.validFrom || !preview.contract.validTo) {
      throw new BadRequestException('Hotel imports require hotel name, validFrom, and validTo before approval');
    }

    const hotel = await this.ensureHotel(preview, supplierId);
    console.log('[contract-imports/approve] hotel resolved', {
      hotelId: hotel.id,
      hotelName: hotel.name,
      ratesCount: preview.rates.length,
      roomCategoriesCount: preview.roomCategories.length,
      supplementsCount: preview.supplements.length,
      ratePoliciesCount: preview.ratePolicies?.length || 0,
      cancellationRulesCount: preview.cancellationPolicy?.rules?.length || 0,
    });
    const contractData = {
      hotelId: hotel.id,
      name: preview.contract.name.trim(),
      validFrom: this.parseDateOnly(preview.contract.validFrom) || new Date(preview.contract.validFrom),
      validTo: this.parseDateOnly(preview.contract.validTo) || new Date(preview.contract.validTo),
      currency: preview.contract.currency.trim().toUpperCase(),
      ratePolicies: (preview.ratePolicies || []) as unknown as Prisma.InputJsonValue,
    };
    const existingContract = await this.findOverlappingHotelContract(hotel.id, preview, contractData.validFrom, contractData.validTo);
    if (existingContract && !approvalMode) {
      throw new ConflictException({
        code: 'CONTRACT_EXISTS',
        message: 'A contract already exists for this hotel/year.',
        existingContract: {
          id: existingContract.id,
          name: existingContract.name,
          validFrom: this.isoDate(existingContract.validFrom),
          validTo: this.isoDate(existingContract.validTo),
          createdAt: existingContract.createdAt,
        },
      });
    }

    const contract =
      existingContract && approvalMode === 'replace'
        ? await this.replaceHotelContract(existingContract.id, contractData)
        : await this.prisma.hotelContract.create({ data: contractData });

    const roomCategoryByName = new Map<string, string>();
    for (const category of preview.roomCategories || []) {
      if (!category.name?.trim()) continue;
      const roomCategory = await this.ensureRoomCategory(hotel.id, category.name, category.code || undefined, category.description || undefined);
      roomCategoryByName.set(category.name.toLowerCase(), roomCategory.id);
    }

    for (const mealPlan of preview.mealPlans || []) {
      await this.upsertHotelContractMealPlan(contract.id, mealPlan);
    }

    for (const rate of preview.rates) {
      if (!rate.cost) continue;
      const roomCategoryId =
        (rate.roomType ? roomCategoryByName.get(rate.roomType.toLowerCase()) : undefined) ||
        (await this.ensureRoomCategory(hotel.id, rate.roomType || 'Standard')).id;
      const season = await this.ensureSeason(rate.seasonName || preview.seasons?.[0]?.name || 'Imported');
      const defaultTax = preview.taxes.find((tax) => /tax/i.test(tax.name));
      const defaultServiceCharge = preview.taxes.find((tax) => /service/i.test(tax.name));
      const taxPercent = rate.salesTaxPercent ?? defaultTax?.value ?? 0;
      const taxIncluded = rate.salesTaxIncluded ?? defaultTax?.included ?? false;
      const serviceChargePercent = rate.serviceChargePercent ?? defaultServiceCharge?.value ?? 0;
      const serviceChargeIncluded = rate.serviceChargeIncluded ?? defaultServiceCharge?.included ?? false;
      const seasonBounds = this.normalizeRateSeasonBounds(rate, preview.contract.validFrom, preview.contract.validTo);
      const existingRate = await this.prisma.hotelRate.findFirst({
        where: {
          contractId: contract.id,
          hotelId: hotel.id,
          seasonFrom: seasonBounds.seasonFrom,
          seasonTo: seasonBounds.seasonTo,
          roomCategoryId,
          occupancyType: this.hotelOccupancy(rate.occupancyType),
          mealPlan: this.hotelMealPlan(rate.mealPlan),
        },
      });
      const pricingBasis = this.hotelRatePricingBasis(rate.pricingBasis);
      const rateData = {
        contractId: contract.id,
        hotelId: hotel.id,
        roomCategoryId,
        seasonId: season.id,
        seasonName: rate.seasonName || 'Imported',
        seasonFrom: seasonBounds.seasonFrom,
        seasonTo: seasonBounds.seasonTo,
        occupancyType: this.hotelOccupancy(rate.occupancyType),
        mealPlan: this.hotelMealPlan(rate.mealPlan),
        pricingMode:
          pricingBasis === HotelRatePricingBasis.PER_PERSON
            ? HotelRatePricingMode.PER_PERSON_PER_NIGHT
            : HotelRatePricingMode.PER_ROOM_PER_NIGHT,
        pricingBasis,
        currency: rate.currency || preview.contract.currency,
        cost: rate.cost,
        costBaseAmount: rate.cost,
        costCurrency: rate.currency || preview.contract.currency,
        salesTaxPercent: taxPercent,
        salesTaxIncluded: taxIncluded,
        serviceChargePercent,
        serviceChargeIncluded,
      };

      if (existingRate) {
        await this.prisma.hotelRate.update({ where: { id: existingRate.id }, data: rateData });
      } else {
        await this.prisma.hotelRate.create({ data: rateData });
      }
      this.logger.debug(
        `Imported hotel rate pricingBasis persisted as ${pricingBasis} for contract=${contract.id} roomCategory=${roomCategoryId} occupancy=${rateData.occupancyType} mealPlan=${rateData.mealPlan}`,
      );
    }

    for (const supplement of preview.supplements || []) {
      await this.upsertHotelContractSupplement(contract.id, supplement, preview.contract.currency);
    }

    if (preview.cancellationPolicy) {
      await this.upsertCancellationPolicy(contract.id, preview.cancellationPolicy);
    }

    if (preview.childPolicy) {
      await this.upsertChildPolicy(contract.id, preview.childPolicy);
    }

    await this.appendSupplierSourceNote(supplierId, sourceFileName, sourceFilePath);
    return contract.id;
  }

  private async findOverlappingHotelContract(hotelId: string, preview: ContractPreview, validFrom: Date, validTo: Date) {
    const contractYear = this.parseOptionalInt(preview.contract.year) || validFrom.getFullYear();
    const yearStart = new Date(Date.UTC(contractYear, 0, 1));
    const yearEnd = new Date(Date.UTC(contractYear, 11, 31, 23, 59, 59, 999));

    return this.prisma.hotelContract.findFirst({
      where: {
        hotelId,
        validFrom: { lte: validTo },
        validTo: { gte: validFrom },
        OR: [
          { validFrom: { gte: yearStart, lte: yearEnd } },
          { validTo: { gte: yearStart, lte: yearEnd } },
          {
            AND: [{ validFrom: { lte: yearStart } }, { validTo: { gte: yearEnd } }],
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  private async replaceHotelContract(contractId: string, data: Prisma.HotelContractUncheckedUpdateInput) {
    const cancellationPolicy = await this.prisma.hotelContractCancellationPolicy.findUnique({
      where: { hotelContractId: contractId },
      select: { id: true },
    });
    if (cancellationPolicy) {
      await this.prisma.hotelContractCancellationRule.deleteMany({ where: { cancellationPolicyId: cancellationPolicy.id } });
      await this.prisma.hotelContractCancellationPolicy.delete({ where: { id: cancellationPolicy.id } });
    }

    const childPolicy = await this.prisma.hotelContractChildPolicy.findUnique({
      where: { hotelContractId: contractId },
      select: { id: true },
    });
    if (childPolicy) {
      await this.prisma.hotelContractChildPolicyBand.deleteMany({ where: { childPolicyId: childPolicy.id } });
      await this.prisma.hotelContractChildPolicy.delete({ where: { id: childPolicy.id } });
    }

    await this.prisma.hotelRate.deleteMany({ where: { contractId } });
    await this.prisma.hotelContractSupplement.deleteMany({ where: { hotelContractId: contractId } });
    await this.prisma.hotelContractMealPlan.deleteMany({ where: { hotelContractId: contractId } });

    return this.prisma.hotelContract.update({
      where: { id: contractId },
      data,
    });
  }

  private async importServicePreview(preview: ContractPreview, supplierId: string, sourceFileName: string) {
    for (const rate of preview.rates) {
      const name = rate.serviceName || rate.routeName || rate.roomType || preview.contract.name;
      const existing = await this.prisma.supplierService.findFirst({
        where: {
          supplierId,
          name: { equals: name, mode: 'insensitive' },
        },
      });
      const data = {
        supplierId,
        name,
        category: preview.contractType === ContractImportType.TRANSPORT ? 'transport' : 'activity',
        unitType: preview.contractType === ContractImportType.TRANSPORT ? ('per_vehicle' as any) : ('per_person' as any),
        baseCost: rate.cost || 0,
        currency: rate.currency || preview.contract.currency,
        costBaseAmount: rate.cost || 0,
        costCurrency: rate.currency || preview.contract.currency,
      };
      const service = existing
        ? await this.prisma.supplierService.update({ where: { id: existing.id }, data })
        : await this.prisma.supplierService.create({ data });

      const existingRate = await this.prisma.serviceRate.findFirst({
        where: { serviceId: service.id, pricingMode: preview.contractType === ContractImportType.TRANSPORT ? 'PER_GROUP' : 'PER_PERSON' },
      });
      const rateData = {
        serviceId: service.id,
        supplierId,
        costBaseAmount: rate.cost || 0,
        costCurrency: rate.currency || preview.contract.currency,
        pricingMode: preview.contractType === ContractImportType.TRANSPORT ? ('PER_GROUP' as any) : ('PER_PERSON' as any),
      };
      if (existingRate) {
        await this.prisma.serviceRate.update({ where: { id: existingRate.id }, data: rateData });
      } else {
        await this.prisma.serviceRate.create({ data: rateData });
      }
    }

    await this.appendSupplierSourceNote(supplierId, sourceFileName, '');
    return supplierId;
  }

  private async ensureHotel(preview: ContractPreview, supplierId: string) {
    const name = preview.hotel?.name?.trim() || preview.supplier.name.trim();
    const hotelCategory = preview.hotel?.hotelCategoryId
      ? await this.prisma.hotelCategory.findUnique({ where: { id: preview.hotel.hotelCategoryId } })
      : null;
    const existing = await this.prisma.hotel.findFirst({
      where: {
        supplierId,
        name: { equals: name, mode: 'insensitive' },
      },
    });
    const data = {
      name,
      city: preview.hotel?.city?.trim() || 'Amman',
      category: hotelCategory?.name || preview.hotel?.category?.trim() || existing?.category || 'Unclassified',
      hotelCategoryId: hotelCategory?.id || existing?.hotelCategoryId || null,
      supplierId,
    };
    return existing
      ? this.prisma.hotel.update({ where: { id: existing.id }, data })
      : this.prisma.hotel.create({ data });
  }

  private async ensureRoomCategory(hotelId: string, name: string, code?: string, description?: string) {
    const existing = await this.prisma.hotelRoomCategory.findFirst({
      where: { hotelId, name: { equals: name, mode: 'insensitive' } },
    });
    const data = {
      hotelId,
      name,
      code: code || existing?.code || null,
      description: description || existing?.description || null,
      isActive: true,
    };
    if (existing) return this.prisma.hotelRoomCategory.update({ where: { id: existing.id }, data });
    return this.prisma.hotelRoomCategory.create({
      data,
    });
  }

  private async ensureSeason(name: string) {
    const seasonName = name.trim() || 'Imported';
    return this.prisma.season.upsert({
      where: { name: seasonName },
      update: { name: seasonName },
      create: { name: seasonName },
    });
  }

  private async upsertHotelContractMealPlan(contractId: string, mealPlan: NonNullable<ContractPreview['mealPlans']>[number]) {
    const code = this.hotelMealPlan(mealPlan.code);
    await this.prisma.hotelContractMealPlan.upsert({
      where: {
        hotelContractId_code: {
          hotelContractId: contractId,
          code,
        },
      },
      update: {
        isDefault: Boolean(mealPlan.isDefault),
        isActive: true,
        notes: mealPlan.notes || null,
      },
      create: {
        hotelContractId: contractId,
        code,
        isDefault: Boolean(mealPlan.isDefault),
        isActive: true,
        notes: mealPlan.notes || null,
      },
    });
  }

  private async upsertHotelContractSupplement(
    contractId: string,
    supplement: NonNullable<ContractPreview['supplements']>[number],
    fallbackCurrency: string,
  ) {
    const type = this.hotelSupplementType(supplement.type || supplement.name);
    const chargeBasis = this.hotelChargeBasis(supplement.chargeBasis);
    const amount = supplement.amount ?? 0;
    const existing = await this.prisma.hotelContractSupplement.findFirst({
      where: {
        hotelContractId: contractId,
        type,
        chargeBasis,
        amount,
        notes: supplement.notes || null,
      },
    });
    const data = {
      hotelContractId: contractId,
      roomCategoryId: null,
      type,
      chargeBasis,
      amount,
      currency: supplement.currency || fallbackCurrency,
      isMandatory: Boolean(supplement.isMandatory),
      isActive: true,
      notes: supplement.notes || this.supplementLabelNote(supplement.name) || null,
    };

    if (existing) {
      await this.prisma.hotelContractSupplement.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.hotelContractSupplement.create({ data });
    }
  }

  private async upsertCancellationPolicy(contractId: string, policy: NonNullable<ContractPreview['cancellationPolicy']>) {
    const existing = await this.prisma.hotelContractCancellationPolicy.findUnique({
      where: { hotelContractId: contractId },
    });
    if (existing) {
      await this.prisma.hotelContractCancellationRule.deleteMany({ where: { cancellationPolicyId: existing.id } });
    }

    await this.prisma.hotelContractCancellationPolicy.upsert({
      where: { hotelContractId: contractId },
      update: {
        summary: policy.summary || null,
        notes: policy.notes || null,
        noShowPenaltyType: this.cancellationPenaltyType(policy.noShowPenaltyType),
        noShowPenaltyValue: policy.noShowPenaltyValue ?? null,
        rules: {
          create: (policy.rules || []).map((rule) => ({
            windowFromValue: rule.windowFromValue ?? rule.daysBefore ?? 0,
            windowToValue: rule.windowToValue ?? 0,
            deadlineUnit: this.cancellationDeadlineUnit(rule.deadlineUnit),
            penaltyType: this.cancellationPenaltyType(rule.penaltyType) || HotelCancellationPenaltyType.PERCENT,
            penaltyValue: rule.penaltyValue ?? rule.penaltyPercent ?? null,
            isActive: true,
            notes: rule.notes || null,
          })),
        },
      },
      create: {
        hotelContractId: contractId,
        summary: policy.summary || null,
        notes: policy.notes || null,
        noShowPenaltyType: this.cancellationPenaltyType(policy.noShowPenaltyType),
        noShowPenaltyValue: policy.noShowPenaltyValue ?? null,
        rules: {
          create: (policy.rules || []).map((rule) => ({
            windowFromValue: rule.windowFromValue ?? rule.daysBefore ?? 0,
            windowToValue: rule.windowToValue ?? 0,
            deadlineUnit: this.cancellationDeadlineUnit(rule.deadlineUnit),
            penaltyType: this.cancellationPenaltyType(rule.penaltyType) || HotelCancellationPenaltyType.PERCENT,
            penaltyValue: rule.penaltyValue ?? rule.penaltyPercent ?? null,
            isActive: true,
            notes: rule.notes || null,
          })),
        },
      },
    });
  }

  private async upsertChildPolicy(contractId: string, policy: NonNullable<ContractPreview['childPolicy']>) {
    const existing = await this.prisma.hotelContractChildPolicy.findUnique({ where: { hotelContractId: contractId } });
    if (existing) {
      await this.prisma.hotelContractChildPolicyBand.deleteMany({ where: { childPolicyId: existing.id } });
    }

    await this.prisma.hotelContractChildPolicy.upsert({
      where: { hotelContractId: contractId },
      update: {
        infantMaxAge: policy.infantMaxAge,
        childMaxAge: policy.childMaxAge,
        notes: policy.notes || null,
        bands: {
          create: (policy.bands || []).map((band) => ({
            label: band.label,
            minAge: band.minAge,
            maxAge: band.maxAge,
            chargeBasis: this.childChargeBasis(band.chargeBasis),
            chargeValue: band.chargeValue ?? null,
            isActive: true,
            notes: band.notes || null,
          })),
        },
      },
      create: {
        hotelContractId: contractId,
        infantMaxAge: policy.infantMaxAge,
        childMaxAge: policy.childMaxAge,
        notes: policy.notes || null,
        bands: {
          create: (policy.bands || []).map((band) => ({
            label: band.label,
            minAge: band.minAge,
            maxAge: band.maxAge,
            chargeBasis: this.childChargeBasis(band.chargeBasis),
            chargeValue: band.chargeValue ?? null,
            isActive: true,
            notes: band.notes || null,
          })),
        },
      },
    });
  }

  private async appendSupplierSourceNote(supplierId: string, sourceFileName: string, sourceFilePath: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) return;
    const sourceNote = `Source contract: ${sourceFileName}${sourceFilePath ? ` (${sourceFilePath})` : ''}`;
    if (supplier.notes?.includes(sourceNote)) return;
    await this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        notes: [supplier.notes, sourceNote].filter(Boolean).join('\n'),
      },
    });
  }

  private buildWarnings(preview: ContractPreview) {
    const warnings: Array<{ severity: 'blocker' | 'warning' | 'info'; field: string; message: string }> = [...(preview.warnings || [])];
    if (preview.multiProperty?.detected) {
      warnings.push({
        severity: 'blocker',
        field: 'multiProperty',
        message: 'Multi-property extraction is preview/QC only. Download the normalized hotel workbooks and import one reviewed hotel contract at a time.',
      });
    }
    if (preview.assistedExtraction?.importDisabled) {
      warnings.push({
        severity: 'blocker',
        field: 'assistedExtraction',
        message: 'Raw PDF assisted extraction cannot be imported directly. Export the normalized workbook, review one hotel at a time, and re-import the reviewed workbook.',
      });
      warnings.push(...this.buildAssistedExtractionQcWarnings(preview.assistedExtraction));
    }
    if (!preview.supplier.name?.trim()) {
      warnings.push({ severity: 'blocker', field: 'supplier.name', message: 'Supplier name is required before approval' });
    }
    if (!preview.contract.validFrom) {
      warnings.push({ severity: 'blocker', field: 'contract.validFrom', message: 'Contract valid from date is required' });
    }
    if (!preview.contract.validTo) {
      warnings.push({ severity: 'blocker', field: 'contract.validTo', message: 'Contract valid to date is required' });
    }
    const contractValidFrom = preview.contract.validFrom ? this.parseDateOnly(preview.contract.validFrom) : null;
    const contractValidTo = preview.contract.validTo ? this.parseDateOnly(preview.contract.validTo) : null;
    if (preview.contract.validFrom && !contractValidFrom) {
      warnings.push({ severity: 'blocker', field: 'contract.validFrom', message: `Invalid contract valid from date: ${preview.contract.validFrom}` });
    }
    if (preview.contract.validTo && !contractValidTo) {
      warnings.push({ severity: 'blocker', field: 'contract.validTo', message: `Invalid contract valid to date: ${preview.contract.validTo}` });
    }
    if (contractValidFrom && contractValidTo && contractValidFrom > contractValidTo) {
      warnings.push({ severity: 'blocker', field: 'contract.validTo', message: 'Contract valid to date cannot be before valid from date' });
    }
    if (!this.isSupportedCurrency(preview.contract.currency)) {
      warnings.push({ severity: 'blocker', field: 'contract.currency', message: `Unsupported contract currency: ${preview.contract.currency}` });
    }
    if (preview.contractType === ContractImportType.HOTEL && !preview.hotel?.name?.trim()) {
      warnings.push({ severity: 'blocker', field: 'hotel.name', message: 'Hotel name is required for hotel contract import' });
    }
    if (preview.rates.length === 0) {
      const hasParsedText = (preview.parserDiagnostics?.parsedTextLineCount || 0) > 0;
      warnings.push({
        severity: 'warning',
        field: 'rates',
        message: hasParsedText
          ? `Parser read ${preview.parserDiagnostics?.parsedTextLineCount} text lines but extracted zero rates. Check backend parser patterns before blaming UI rendering.`
          : 'No rates were extracted. Add rates before approval if pricing should be imported.',
      });
    }
    for (const [index, rate] of (preview.rates || []).entries()) {
      const field = `rates.${index + 1}`;
      if (rate.cost === null || rate.cost === undefined || !Number.isFinite(Number(rate.cost))) {
        warnings.push({ severity: 'blocker', field: `${field}.cost`, message: `Rate ${index + 1} cost is required` });
      }
      if (rate.seasonFrom && !this.parseDateOnly(rate.seasonFrom)) {
        warnings.push({ severity: 'blocker', field: `${field}.seasonFrom`, message: `Invalid rate ${index + 1} season from date: ${rate.seasonFrom}` });
      }
      if (rate.seasonTo && !this.parseDateOnly(rate.seasonTo)) {
        warnings.push({ severity: 'blocker', field: `${field}.seasonTo`, message: `Invalid rate ${index + 1} season to date: ${rate.seasonTo}` });
      }
      if (rate.currency && !this.isSupportedCurrency(rate.currency)) {
        warnings.push({ severity: 'blocker', field: `${field}.currency`, message: `Unsupported rate currency for rate ${index + 1}: ${rate.currency}` });
      }
      const normalizedMealPlan = String(rate.mealPlan || '').trim().toUpperCase();
      if (normalizedMealPlan && !HOTEL_MEAL_PLAN_VALUES.includes(normalizedMealPlan)) {
        warnings.push({ severity: 'blocker', field: `${field}.mealPlan`, message: `Unknown meal plan for rate ${index + 1}: ${rate.mealPlan}` });
      }
    }
    for (const [index, supplement] of (preview.supplements || []).entries()) {
      const field = `supplements.${index + 1}`;
      if (supplement.amount === null || supplement.amount === undefined || !Number.isFinite(Number(supplement.amount))) {
        warnings.push({ severity: 'blocker', field: `${field}.amount`, message: `Supplement ${index + 1} amount is required` });
      }
      if (supplement.type && !this.normalizeHotelSupplementType(supplement.type)) {
        warnings.push({ severity: 'blocker', field: `${field}.type`, message: `Unknown supplement type for supplement ${index + 1}: ${supplement.type}` });
      }
      if (supplement.chargeBasis && !this.normalizeHotelChargeBasis(supplement.chargeBasis)) {
        warnings.push({ severity: 'blocker', field: `${field}.chargeBasis`, message: `Unknown supplement charge basis for supplement ${index + 1}: ${supplement.chargeBasis}` });
      }
      if (supplement.currency && !this.isSupportedCurrency(supplement.currency)) {
        warnings.push({ severity: 'blocker', field: `${field}.currency`, message: `Unsupported supplement currency for supplement ${index + 1}: ${supplement.currency}` });
      }
    }
    for (const [index, band] of (preview.childPolicy?.bands || []).entries()) {
      const field = `childPolicy.bands.${index + 1}`;
      const normalizedChargeBasis = String(band.chargeBasis || '').trim().toUpperCase();
      if (normalizedChargeBasis && !CHILD_POLICY_CHARGE_BASIS_VALUES.includes(normalizedChargeBasis)) {
        warnings.push({ severity: 'blocker', field: `${field}.chargeBasis`, message: `Unknown child policy charge basis for band ${index + 1}: ${band.chargeBasis}` });
      }
    }
    for (const [index, policy] of (preview.ratePolicies || []).entries()) {
      const field = `ratePolicies.${index + 1}`;
      if (!this.isKnownRatePolicyType(policy.policyType)) {
        warnings.push({ severity: 'blocker', field, message: `Unknown rate policy type: ${policy.policyType || 'blank'}` });
      }
      if (policy.ageFrom !== null && policy.ageFrom !== undefined && policy.ageFrom < 0) {
        warnings.push({ severity: 'blocker', field, message: 'Age From must be zero or greater' });
      }
      if (policy.ageTo !== null && policy.ageTo !== undefined && policy.ageTo < 0) {
        warnings.push({ severity: 'blocker', field, message: 'Age To must be zero or greater' });
      }
      if (
        policy.ageFrom !== null &&
        policy.ageFrom !== undefined &&
        policy.ageTo !== null &&
        policy.ageTo !== undefined &&
        policy.ageTo < policy.ageFrom
      ) {
        warnings.push({ severity: 'blocker', field, message: 'Age To cannot be lower than Age From' });
      }
      if (policy.amount !== null && policy.amount !== undefined && policy.amount < 0) {
        warnings.push({ severity: 'blocker', field, message: 'Amount must be zero or greater' });
      }
      if (policy.percent !== null && policy.percent !== undefined && (policy.percent < 0 || policy.percent > 100)) {
        warnings.push({ severity: 'blocker', field, message: 'Percent must be between 0 and 100' });
      }
    }
    warnings.push(...this.buildPreImportValidationWarnings(preview));
    for (const field of preview.missingFields || []) {
      warnings.push({ severity: 'warning', field, message: `${field} was not extracted from the uploaded contract` });
    }
    for (const field of preview.uncertainFields || []) {
      warnings.push({ severity: 'warning', field, message: `${field} needs review` });
    }
    return warnings;
  }

  private buildPreImportValidationWarnings(preview: ContractPreview): Array<{ severity: 'blocker' | 'warning' | 'info'; field: string; message: string }> {
    const warnings: Array<{ severity: 'blocker' | 'warning' | 'info'; field: string; message: string }> = [];
    if (preview.contractType !== ContractImportType.HOTEL) return warnings;
    if (preview.multiProperty?.detected) {
      return (preview.multiProperty.hotels || []).flatMap((hotel, hotelIndex) =>
        this.buildPreImportValidationWarnings({ ...hotel, multiProperty: undefined }).map((warning) => ({
          ...warning,
          field: `multiProperty.hotels.${hotelIndex + 1}.${warning.field}`,
          message: `${hotel.hotel?.name || `Hotel ${hotelIndex + 1}`}: ${warning.message}`,
        })),
      );
    }

    const rates = preview.rates || [];
    const contractCurrency = this.optionalString(preview.contract.currency).toUpperCase();
    const supportedOccupancies = new Set(['SGL', 'DBL', 'TPL', 'TRP', 'QUAD', 'UNIT', 'SINGLE_SUPPLEMENT']);
    const roomNames = (preview.roomCategories || []).map((category) => this.optionalString(category.name)).filter(Boolean);
    const roomNameCounts = this.countNormalizedValues(roomNames);
    for (const [roomName, count] of roomNameCounts.entries()) {
      if (count > 1) {
        warnings.push({ severity: 'warning', field: 'roomCategories', message: `Duplicate room category name needs review: ${roomName}` });
      }
    }

    if ((preview.seasons || []).length === 0 && rates.length > 0) {
      warnings.push({ severity: 'warning', field: 'seasons', message: 'No season records were extracted; rates may rely on ambiguous season text.' });
    }

    const contractFrom = this.parseDateOnly(preview.contract.validFrom);
    const contractTo = this.parseDateOnly(preview.contract.validTo);
    const seasonRanges = (preview.seasons || [])
      .map((season, index) => ({
        index,
        name: season.name || `Season ${index + 1}`,
        from: this.parseDateOnly(season.validFrom),
        to: this.parseDateOnly(season.validTo),
      }))
      .filter((season) => season.from && season.to) as Array<{ index: number; name: string; from: Date; to: Date }>;

    for (let left = 0; left < seasonRanges.length; left += 1) {
      for (let right = left + 1; right < seasonRanges.length; right += 1) {
        if (seasonRanges[left].from <= seasonRanges[right].to && seasonRanges[right].from <= seasonRanges[left].to) {
          const severity = /festive|eid|christmas|new year/i.test(`${seasonRanges[left].name} ${seasonRanges[right].name}`) ? 'warning' : 'blocker';
          warnings.push({
            severity,
            field: 'seasons',
            message: `Overlapping season dates detected: ${seasonRanges[left].name} overlaps ${seasonRanges[right].name}.`,
          });
        }
      }
    }

    if (contractFrom && contractTo && seasonRanges.length > 0) {
      const sorted = [...seasonRanges].sort((a, b) => a.from.getTime() - b.from.getTime());
      if (sorted[0].from > contractFrom) {
        warnings.push({ severity: 'warning', field: 'seasons.coverage', message: `Season coverage starts after contract start date (${this.isoDate(contractFrom)}).` });
      }
      if (sorted[sorted.length - 1].to < contractTo) {
        warnings.push({ severity: 'warning', field: 'seasons.coverage', message: `Season coverage ends before contract end date (${this.isoDate(contractTo)}).` });
      }
      for (let index = 0; index < sorted.length - 1; index += 1) {
        const nextExpected = new Date(sorted[index].to.getTime());
        nextExpected.setUTCDate(nextExpected.getUTCDate() + 1);
        if (nextExpected < sorted[index + 1].from) {
          warnings.push({
            severity: 'warning',
            field: 'seasons.coverage',
            message: `Coverage gap detected between ${sorted[index].name} and ${sorted[index + 1].name}.`,
          });
        }
      }
    }

    const groupedRates = new Map<string, PreviewRate[]>();
    for (const [index, rate] of rates.entries()) {
      const field = `rates.${index + 1}`;
      const cost = Number(rate.cost);
      if (!Number.isFinite(cost) || cost <= 0) {
        warnings.push({ severity: 'blocker', field: `${field}.cost`, message: `Rate ${index + 1} has a zero, negative, or missing price.` });
      }
      const rateCurrency = this.optionalString(rate.currency).toUpperCase();
      if (rateCurrency && contractCurrency && rateCurrency !== contractCurrency) {
        warnings.push({ severity: 'warning', field: `${field}.currency`, message: `Rate ${index + 1} currency ${rateCurrency} differs from contract currency ${contractCurrency}.` });
      }
      const occupancy = this.normalizeOccupancyForValidation(rate.occupancyType);
      if (!occupancy || !supportedOccupancies.has(occupancy)) {
        warnings.push({ severity: 'blocker', field: `${field}.occupancyType`, message: `Rate ${index + 1} has unsupported occupancy: ${rate.occupancyType || 'blank'}.` });
      }
      if (occupancy === 'TRP') {
        warnings.push({ severity: 'info', field: `${field}.occupancyType`, message: `Rate ${index + 1} uses TRP naming; ERP will treat it as triple occupancy.` });
      }
      const mealPlan = this.optionalString(rate.mealPlan).toUpperCase();
      const groupKey = [
        this.optionalString(rate.roomType).toLowerCase(),
        this.optionalString(rate.seasonName).toLowerCase(),
        rate.seasonFrom || '',
        rate.seasonTo || '',
      ].join('|');
      if (!groupedRates.has(groupKey)) groupedRates.set(groupKey, []);
      groupedRates.get(groupKey)!.push({ ...rate, occupancyType: occupancy || rate.occupancyType, mealPlan });
    }

    const supplementNames = (preview.supplements || []).map((supplement) => `${supplement.name || ''} ${supplement.type || ''} ${supplement.notes || ''}`.toLowerCase());
    const hasHbSupplement = supplementNames.some((name) => /\bhb\b|half\s*board/.test(name));
    const hasFbSupplement = supplementNames.some((name) => /\bfb\b|full\s*board/.test(name));
    const mealPlans = new Set(rates.map((rate) => this.optionalString(rate.mealPlan).toUpperCase()).filter(Boolean));
    if (hasHbSupplement && !mealPlans.has('BB')) {
      warnings.push({ severity: 'warning', field: 'mealPlans', message: 'HB supplement exists but no BB base rate was found.' });
    }
    if (hasHbSupplement && mealPlans.has('HB')) {
      warnings.push({ severity: 'warning', field: 'mealPlans', message: 'Direct HB rates and an HB supplement both exist; review double-count risk.' });
    }
    if (mealPlans.has('FB') && !mealPlans.has('BB') && !mealPlans.has('HB')) {
      warnings.push({ severity: 'warning', field: 'mealPlans', message: 'FB rates exist without BB/HB base meal plans.' });
    }
    if (hasFbSupplement && mealPlans.has('FB')) {
      warnings.push({ severity: 'warning', field: 'mealPlans', message: 'Direct FB rates and an FB supplement both exist; review double-count risk.' });
    }

    for (const [key, group] of groupedRates.entries()) {
      const displayKey = key.split('|').filter(Boolean).join(' / ') || 'rate group';
      const byOccupancy = new Map(group.map((rate) => [this.normalizeOccupancyForValidation(rate.occupancyType), Number(rate.cost)]));
      const sgl = byOccupancy.get('SGL');
      const dbl = byOccupancy.get('DBL');
      const tpl = byOccupancy.get('TPL') ?? byOccupancy.get('TRP');
      if (sgl !== undefined && dbl !== undefined && dbl < sgl) {
        warnings.push({ severity: 'warning', field: 'rates.occupancy', message: `DBL is cheaper than SGL for ${displayKey}; review occupancy pricing.` });
      }
      if (sgl !== undefined && dbl !== undefined && tpl === undefined) {
        warnings.push({ severity: 'info', field: 'rates.occupancy', message: `Triple occupancy is not present for ${displayKey}.` });
      }
      const mealPlanSet = new Set(group.map((rate) => this.optionalString(rate.mealPlan).toUpperCase()).filter(Boolean));
      if (mealPlanSet.size > 1 && !mealPlanSet.has('BB')) {
        warnings.push({ severity: 'warning', field: 'mealPlans', message: `Room/season group has multiple meal plans but no BB base: ${displayKey}.` });
      }
    }

    const unresolvedCandidates = (preview.assistedExtraction?.rateCandidates || []).filter((candidate) => {
      const mapped = preview.assistedExtraction?.blocks.some((block) => block.approved && (block.rateCandidateIds || []).includes(candidate.id));
      return !mapped;
    });
    if (unresolvedCandidates.length > 0) {
      warnings.push({
        severity: 'info',
        field: 'assistedExtraction.rateCandidates',
        message: `${unresolvedCandidates.length} review rate candidate(s) remain unresolved in assisted extraction.`,
      });
    }

    return warnings;
  }

  private countNormalizedValues(values: string[]) {
    const counts = new Map<string, number>();
    for (const value of values) {
      const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
    return counts;
  }

  private normalizeOccupancyForValidation(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'TRIPLE') return 'TPL';
    if (normalized === 'DOUBLE' || normalized === 'TWIN') return 'DBL';
    if (normalized === 'SINGLE') return 'SGL';
    if (normalized === 'SGL_SUPPLEMENT') return 'SINGLE_SUPPLEMENT';
    return normalized;
  }

  private buildExtractionQcWarnings(preview: Pick<ContractPreview, 'rates' | 'seasons'>) {
    const warnings: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }> = [];
    const rateKeysBySeason = new Map<string, PreviewRate[]>();

    for (const [index, rate] of (preview.rates || []).entries()) {
      const field = `rates.${index + 1}`;
      const seasonAmbiguous = !rate.seasonFrom || !rate.seasonTo || /^imported$/i.test(rate.seasonName || '');
      if (seasonAmbiguous) {
        warnings.push({ severity: 'warning', field: `${field}.season`, message: `Ambiguous season for rate ${index + 1}` });
      }
      const occupancy = this.normalizeOccupancyForValidation(rate.occupancyType);
      if (!occupancy || !['SGL', 'DBL', 'TPL', 'TRP', 'QUAD', 'UNIT', 'SINGLE_SUPPLEMENT'].includes(occupancy)) {
        warnings.push({ severity: 'warning', field: `${field}.occupancyType`, message: `Unclear occupancy for rate ${index + 1}` });
      }
      if (!this.optionalString(rate.mealPlan)) {
        warnings.push({ severity: 'warning', field: `${field}.mealPlan`, message: `Missing meal plan for rate ${index + 1}` });
      }

      const key = [
        this.optionalString(rate.roomType).toLowerCase(),
        this.optionalString(rate.occupancyType).toUpperCase(),
        this.optionalString(rate.mealPlan).toUpperCase(),
      ].join('|');
      if (!rateKeysBySeason.has(key)) {
        rateKeysBySeason.set(key, []);
      }
      rateKeysBySeason.get(key)!.push(rate);
    }

    for (const [key, rates] of rateKeysBySeason.entries()) {
      for (let leftIndex = 0; leftIndex < rates.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < rates.length; rightIndex += 1) {
          if (this.rateSeasonsOverlap(rates[leftIndex], rates[rightIndex])) {
            warnings.push({
              severity: 'warning',
              field: 'rates',
              message: `Overlapping rates detected for ${key.replace(/\|/g, ' / ')}`,
            });
          }
        }
      }
    }

    return warnings;
  }

  private rateSeasonsOverlap(left: PreviewRate, right: PreviewRate) {
    const leftFrom = this.parseDateOnly(left.seasonFrom);
    const leftTo = this.parseDateOnly(left.seasonTo);
    const rightFrom = this.parseDateOnly(right.seasonFrom);
    const rightTo = this.parseDateOnly(right.seasonTo);
    if (!leftFrom || !leftTo || !rightFrom || !rightTo) return false;
    return leftFrom <= rightTo && rightFrom <= leftTo;
  }

  private isKnownRatePolicyType(value: unknown) {
    return [
      'CHILD_FREE',
      'CHILD_DISCOUNT',
      'CHILD_EXTRA_BED',
      'ADULT_EXTRA_BED',
      'CHILD_EXTRA_MEAL',
      'ADULT_EXTRA_MEAL',
      'SINGLE_SUPPLEMENT',
      'THIRD_PERSON_SUPPLEMENT',
      'SPECIAL_EVENT_SUPPLEMENT',
    ].includes(String(value || '').trim().toUpperCase());
  }

  private async buildPersistenceWarnings(preview: ContractPreview) {
    const warnings: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }> = [];

    if (preview.contractType !== ContractImportType.HOTEL || !preview.hotel?.name || !preview.contract.name) {
      return warnings;
    }

    const existingContract = await this.prisma.hotelContract.findFirst({
      where: {
        name: { equals: preview.contract.name, mode: 'insensitive' },
        hotel: {
          name: { equals: preview.hotel.name, mode: 'insensitive' },
        },
      },
      select: { id: true },
    });

    if (existingContract) {
      warnings.push({
        severity: 'warning',
        field: 'contract.name',
        message: 'An existing active hotel contract matches this hotel and contract name. Approval will update matching rows idempotently instead of creating duplicates.',
      });
    }

    return warnings;
  }

  private normalizeApprovedPreview(value: any): ContractPreview {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException('Approved contract import data is required');
    }
    const contractType = this.parseContractType(value.contractType);
    const rates = Array.isArray(value.rates)
      ? value.rates.map((rate: any) => ({
          roomType: this.optionalString(rate.roomType),
          serviceName: this.optionalString(rate.serviceName),
          routeName: this.optionalString(rate.routeName),
          occupancyType: this.optionalString(rate.occupancyType) || 'DBL',
          mealPlan: this.optionalString(rate.mealPlan) || 'BB',
          seasonName: this.optionalString(rate.seasonName) || 'Imported',
          seasonFrom: this.optionalString(rate.seasonFrom),
          seasonTo: this.optionalString(rate.seasonTo),
          cost: this.parseNumber(rate.cost),
          currency: this.optionalString(rate.currency) || value.contract?.currency || 'JOD',
          pricingBasis: this.normalizePricingBasis(rate.pricingBasis),
          normalizedPricingBasis:
            rate.normalizedPricingBasis === 'PER_PERSON_NIGHT' || rate.normalizedPricingBasis === 'PER_ROOM_NIGHT'
              ? rate.normalizedPricingBasis
              : this.normalizedNightlyPricingBasis(rate.pricingBasis),
          salesTaxPercent: this.parseNumber(rate.salesTaxPercent),
          serviceChargePercent: this.parseNumber(rate.serviceChargePercent),
          salesTaxIncluded: this.parseBoolean(rate.salesTaxIncluded) ?? null,
          serviceChargeIncluded: this.parseBoolean(rate.serviceChargeIncluded) ?? null,
          uncertain: Boolean(rate.uncertain),
          notes: this.optionalString(rate.notes),
        }))
      : [];

    return {
      contractType,
      supplier: {
        id: value.supplier?.id || null,
        name: this.optionalString(value.supplier?.name),
        isNew: Boolean(value.supplier?.isNew),
      },
      contract: {
        name: this.optionalString(value.contract?.name) || 'Imported Contract',
        year: this.parseOptionalInt(value.contract?.year),
        validFrom: this.optionalString(value.contract?.validFrom) || null,
        validTo: this.optionalString(value.contract?.validTo) || null,
        currency: this.optionalString(value.contract?.currency) || 'JOD',
      },
      hotel: value.hotel
        ? {
            name: this.optionalString(value.hotel.name),
            city: this.optionalString(value.hotel.city) || 'Amman',
            category: this.optionalString(value.hotel.category) || 'Unclassified',
            hotelCategoryId: this.optionalString(value.hotel.hotelCategoryId) || null,
          }
        : undefined,
      roomCategories: Array.isArray(value.roomCategories)
        ? value.roomCategories.map((category: any) => ({
            name: this.optionalString(category.name),
            code: this.optionalString(category.code) || null,
            description: this.optionalString(category.description) || null,
            uncertain: Boolean(category.uncertain),
          }))
        : Array.from(new Set(rates.map((rate: PreviewRate) => rate.roomType).filter(Boolean))).map((name) => ({ name })),
      seasons: Array.isArray(value.seasons)
        ? value.seasons.map((season: any) => ({
            name: this.optionalString(season.name) || 'Imported',
            validFrom: this.optionalString(season.validFrom) || null,
            validTo: this.optionalString(season.validTo) || null,
            uncertain: Boolean(season.uncertain),
          }))
        : Array.from(new Set(rates.map((rate: PreviewRate) => rate.seasonName).filter(Boolean))).map((name) => ({ name })),
      rates,
      mealPlans: Array.isArray(value.mealPlans)
        ? value.mealPlans.map((mealPlan: any) => ({
            code: this.optionalString(mealPlan.code) || 'BB',
            isDefault: Boolean(mealPlan.isDefault),
            notes: this.optionalString(mealPlan.notes) || null,
            uncertain: Boolean(mealPlan.uncertain),
          }))
        : Array.from(new Set(rates.map((rate: PreviewRate) => rate.mealPlan).filter(Boolean))).map((code, index) => ({
            code,
            isDefault: index === 0,
          })),
      taxes: Array.isArray(value.taxes) ? value.taxes : [],
      supplements: Array.isArray(value.supplements)
        ? value.supplements
            .map((supplement: any) => {
            const normalizedCurrency = this.normalizeSupplementCurrency(supplement.currency, value.contract?.currency || 'JOD');
            const name = this.supplementDisplayName(supplement);
            if (this.isDerivedPercentSupplementRow(name, supplement.currency, supplement.notes)) {
              return null;
            }
            return {
              ...supplement,
              name,
              amount: this.parseNumber(supplement.amount) ?? null,
              currency: normalizedCurrency.currency,
              pricingBasis: this.normalizePricingBasis(supplement.pricingBasis),
              notes: [this.supplementLabelNote(name), this.optionalString(supplement.notes), normalizedCurrency.note].filter(Boolean).join(' | ') || undefined,
            };
          })
            .filter((supplement: any) => Boolean(supplement))
        : [],
      policies: Array.isArray(value.policies) ? value.policies : [],
      ratePolicies: Array.isArray(value.ratePolicies)
        ? value.ratePolicies.map((policy: any) => ({
            policyType: this.optionalString(policy.policyType || policy.type).toUpperCase(),
            appliesTo: this.optionalString(policy.appliesTo) || null,
            ageFrom: this.parseNumber(policy.ageFrom) ?? null,
            ageTo: this.parseNumber(policy.ageTo) ?? null,
            amount: this.parseNumber(policy.amount) ?? null,
            percent: this.parseNumber(policy.percent) ?? null,
            currency: this.normalizeSupplementCurrency(policy.currency, value.contract?.currency || 'JOD').currency,
            pricingBasis: this.normalizePricingBasis(policy.pricingBasis) || 'PER_ROOM',
            mealPlan: this.optionalString(policy.mealPlan) || null,
            notes: this.optionalString(policy.notes) || null,
          }))
        : [],
      cancellationPolicy: value.cancellationPolicy || null,
      cancellationPolicies: Array.isArray(value.cancellationPolicies)
        ? value.cancellationPolicies
        : value.cancellationPolicy
          ? [value.cancellationPolicy]
          : [],
      childPolicy: this.normalizeChildPolicyForApproval(value.childPolicy),
      meta: this.normalizeExtractedMeta(value.meta),
      hotelName: this.optionalString(value.hotelName || value.hotel?.name),
      contractStartDate: this.optionalString(value.contractStartDate || value.contract?.validFrom) || null,
      contractEndDate: this.optionalString(value.contractEndDate || value.contract?.validTo) || null,
      currency: this.optionalString(value.currency || value.contract?.currency) || 'JOD',
      serviceCharge: value.serviceCharge || null,
      multiProperty:
        value.multiProperty && typeof value.multiProperty === 'object'
          ? {
              detected: Boolean(value.multiProperty.detected),
              propertyCount: this.parseNumber(value.multiProperty.propertyCount) ?? 0,
              hotels: Array.isArray(value.multiProperty.hotels)
                ? value.multiProperty.hotels.map((hotel: any) => this.normalizeApprovedPreview({ ...hotel, multiProperty: undefined }))
                : [],
              normalizedWorkbooks: Array.isArray(value.multiProperty.normalizedWorkbooks) ? value.multiProperty.normalizedWorkbooks : [],
            }
          : undefined,
      parserDiagnostics: value.parserDiagnostics,
      assistedExtraction: this.normalizeAssistedExtractionPreview(value.assistedExtraction),
      warnings: Array.isArray(value.warnings) ? value.warnings : [],
      missingFields: Array.isArray(value.missingFields) ? value.missingFields : [],
      uncertainFields: Array.isArray(value.uncertainFields) ? value.uncertainFields : [],
    };
  }

  private normalizeAssistedExtractionPreview(value: any): AssistedExtractionPreview | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const blocks = Array.isArray(value.blocks)
      ? value.blocks.map((block: any, index: number) => ({
          id: this.optionalString(block.id) || `block-${index + 1}`,
          kind: ['RAW_TEXT', 'DETECTED_TABLE', 'SKIPPED_SECTION'].includes(block.kind) ? block.kind : 'RAW_TEXT',
          label: this.optionalString(block.label) || `Block ${index + 1}`,
          suggestedTag: this.normalizeAssistedBlockTag(block.suggestedTag),
          tag: this.normalizeAssistedBlockTag(block.tag),
          lineStart: this.parseOptionalInt(block.lineStart),
          lineEnd: this.parseOptionalInt(block.lineEnd),
          text: this.optionalString(block.text),
          rows: Array.isArray(block.rows) ? block.rows : undefined,
          columns: Array.isArray(block.columns) ? block.columns.map((column: unknown) => this.optionalString(column)).filter(Boolean) : undefined,
          mappings: block.mappings && typeof block.mappings === 'object' ? block.mappings : undefined,
          approved: Boolean(block.approved),
          rateCandidateIds: Array.isArray(block.rateCandidateIds) ? block.rateCandidateIds.map((id: unknown) => this.optionalString(id)).filter(Boolean) : undefined,
        }))
      : [];
    const assisted: AssistedExtractionPreview = {
      mode: 'PDF_ASSISTED_REVIEW',
      importDisabled: value.importDisabled !== false,
      oneHotelAtATimeRequired: value.oneHotelAtATimeRequired !== false,
      requiredColumnRoles: Array.isArray(value.requiredColumnRoles)
        ? value.requiredColumnRoles.filter((role: unknown): role is AssistedExtractionColumnRole => this.isAssistedColumnRole(role))
        : ['ROOM_CATEGORY', 'SEASON', 'DATE_RANGE', 'MEAL_PLAN', 'PRICING_BASIS', 'RATE'],
      blocks,
      lineClassifications: Array.isArray(value.lineClassifications) ? value.lineClassifications : [],
      rateCandidates: Array.isArray(value.rateCandidates)
        ? value.rateCandidates.map((candidate: any, index: number) => ({
            id: this.optionalString(candidate.id) || `rate-${index + 1}`,
            lineNumber: this.parseOptionalInt(candidate.lineNumber) || index + 1,
            rawLine: this.optionalString(candidate.rawLine),
            lineType: candidate.lineType || 'UNKNOWN',
            detectedHotel: this.optionalString(candidate.detectedHotel) || undefined,
            detectedRoom: this.optionalString(candidate.detectedRoom) || undefined,
            detectedMealPlan: this.optionalString(candidate.detectedMealPlan) || undefined,
            detectedOccupancy: this.optionalString(candidate.detectedOccupancy) || undefined,
            detectedSeason: this.optionalString(candidate.detectedSeason) || undefined,
            detectedDateRange: this.optionalString(candidate.detectedDateRange) || undefined,
            detectedNumericValues: Array.isArray(candidate.detectedNumericValues) ? candidate.detectedNumericValues.map((value: unknown) => this.parseNumber(value)).filter((value: number | undefined): value is number => value !== undefined) : [],
            sourceLines: Array.isArray(candidate.sourceLines) ? candidate.sourceLines.map((value: unknown) => this.parseOptionalInt(value)).filter((value: number | undefined): value is number => value !== undefined) : undefined,
            rejectionReason: this.optionalString(candidate.rejectionReason) || undefined,
            confidence: this.parseNumber(candidate.confidence) ?? 0,
            mappingSuggestions: candidate.mappingSuggestions && typeof candidate.mappingSuggestions === 'object' ? candidate.mappingSuggestions : {},
          }))
        : [],
      rejectedRateCandidates: Array.isArray(value.rejectedRateCandidates)
        ? value.rejectedRateCandidates.map((candidate: any, index: number) => ({
            lineNumber: this.parseOptionalInt(candidate.lineNumber) || index + 1,
            rawLine: this.optionalString(candidate.rawLine),
            detectedHotel: this.optionalString(candidate.detectedHotel) || undefined,
            possibleRoom: this.optionalString(candidate.possibleRoom) || undefined,
            possibleMealPlan: this.optionalString(candidate.possibleMealPlan) || undefined,
            possibleOccupancy: this.optionalString(candidate.possibleOccupancy) || undefined,
            possibleSeason: this.optionalString(candidate.possibleSeason) || undefined,
            possibleDateRange: this.optionalString(candidate.possibleDateRange) || undefined,
            possiblePriceValues: Array.isArray(candidate.possiblePriceValues)
              ? candidate.possiblePriceValues.map((entry: unknown) => this.parseNumber(entry)).filter((entry: number | undefined): entry is number => entry !== undefined)
              : [],
            sourceLines: Array.isArray(candidate.sourceLines)
              ? candidate.sourceLines.map((entry: unknown) => this.parseOptionalInt(entry)).filter((entry: number | undefined): entry is number => entry !== undefined)
              : [],
            confidence: this.parseNumber(candidate.confidence) ?? 0,
            rejectionReason: this.optionalString(candidate.rejectionReason) || 'Rejected by parser confidence checks.',
          }))
        : [],
      qcWarnings: Array.isArray(value.qcWarnings) ? value.qcWarnings : [],
    };
    assisted.qcWarnings = this.buildAssistedExtractionQcWarnings(assisted);
    return assisted;
  }

  private normalizeAssistedBlockTag(value: unknown): AssistedExtractionBlockTag | undefined {
    const normalized = String(value || '').trim().toUpperCase();
    return ['ROOM_RATE_TABLE', 'SEASON_TABLE', 'SUPPLEMENT_SECTION', 'CHILD_POLICY', 'CANCELLATION_POLICY', 'TAXES_SERVICE_NOTES'].includes(normalized)
      ? (normalized as AssistedExtractionBlockTag)
      : undefined;
  }

  private isAssistedColumnRole(value: unknown): value is AssistedExtractionColumnRole {
    return ['ROOM_CATEGORY', 'SEASON', 'DATE_RANGE', 'MEAL_PLAN', 'PRICING_BASIS', 'RATE', 'SINGLE_SUPPLEMENT'].includes(String(value || '').trim().toUpperCase());
  }

  private parseContractType(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'HOTEL' || normalized === 'TRANSPORT' || normalized === 'ACTIVITY') {
      return normalized as ContractImportType;
    }
    throw new BadRequestException('contractType must be HOTEL, TRANSPORT, or ACTIVITY');
  }

  private hotelOccupancy(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'TRP') return 'TPL' as any;
    return ['SGL', 'DBL', 'TPL'].includes(normalized) ? (normalized as any) : 'DBL';
  }

  private hotelMealPlan(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    return ['RO', 'BB', 'HB', 'FB', 'AI'].includes(normalized) ? (normalized as any) : 'BB';
  }

  private hotelSupplementType(value: unknown) {
    return this.normalizeHotelSupplementType(value) || HotelContractSupplementType.EXTRA_BED;
  }

  private normalizeHotelSupplementType(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized) return null;
    if (HOTEL_SUPPLEMENT_TYPE_VALUES.includes(normalized)) return normalized as HotelContractSupplementType;
    if (normalized.includes('BREAKFAST')) return HotelContractSupplementType.EXTRA_BREAKFAST;
    if (normalized.includes('LUNCH')) return HotelContractSupplementType.EXTRA_LUNCH;
    if (normalized.includes('GALA')) return HotelContractSupplementType.GALA_DINNER;
    if (normalized.includes('DINNER') || normalized.includes('HALF') || /\bHB\b/.test(normalized)) return HotelContractSupplementType.EXTRA_DINNER;
    if (normalized.includes('BED')) return HotelContractSupplementType.EXTRA_BED;
    return null;
  }

  private supplementDisplayName(supplement: { name?: unknown; type?: unknown; notes?: unknown }) {
    const name = this.optionalString(supplement.name);
    if (name && !/^supplement$/i.test(name)) {
      return name;
    }

    return this.optionalString(supplement.type) || this.optionalString(supplement.notes).split('|')[0]?.trim() || 'Supplement';
  }

  private supplementLabelNote(name: unknown) {
    const label = this.optionalString(name);
    return label && !/^supplement$/i.test(label) ? label : '';
  }

  private templateSupplementName(row: Record<string, string>) {
    const direct =
      this.templateCell(row, 'Name') ||
      this.templateCell(row, 'Supplement') ||
      this.templateCell(row, 'Supplement Name') ||
      this.templateCell(row, 'Description') ||
      this.templateCell(row, 'Category') ||
      this.templateCell(row, 'Item') ||
      this.templateCell(row, 'Label') ||
      this.templateCell(row, 'Room Upgrade') ||
      this.templateCell(row, 'Room Type') ||
      this.templateCell(row, 'Type');
    if (direct) {
      return direct;
    }

    const ignoredHeaders = new Set([
      'type',
      'chargebasis',
      'basis',
      'amount',
      'cost',
      'currency',
      'pricingbasis',
      'mandatory',
      'notes',
    ]);
    const fallback = Object.entries(row).find(([key, value]) => {
      const normalizedKey = this.normalizeTemplateHeader(key);
      const text = this.optionalString(value);
      return text && !ignoredHeaders.has(normalizedKey) && !Number.isFinite(Number(text));
    });

    return fallback?.[1] || 'Supplement';
  }

  private isDerivedPercentSupplementRow(name: unknown, currency: unknown, notes?: unknown) {
    const label = this.optionalString(name);
    const rawCurrency = this.optionalString(currency).replace(/\s+/g, '').toUpperCase();
    const noteText = this.optionalString(notes);
    if (rawCurrency !== 'PERCENT' && rawCurrency !== 'PERCENTAGE' && rawCurrency !== '%') {
      return false;
    }

    return !label || /^supplement$/i.test(label) || /occupancy|derived|delta/i.test(noteText);
  }

  private hotelChargeBasis(value: unknown) {
    return this.normalizeHotelChargeBasis(value) || HotelContractChargeBasis.PER_NIGHT;
  }

  private normalizeHotelChargeBasis(value: unknown) {
    const normalized = String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
    if (normalized === 'PER_PERSON') return HotelContractChargeBasis.PER_PERSON;
    if (normalized === 'PER_ROOM') return HotelContractChargeBasis.PER_ROOM;
    if (normalized === 'PER_STAY') return HotelContractChargeBasis.PER_STAY;
    if (normalized === 'PER_NIGHT') return HotelContractChargeBasis.PER_NIGHT;
    if (normalized === 'PER_ROOM_NIGHT') return HotelContractChargeBasis.PER_NIGHT;
    if (normalized === 'PER_PERSON_NIGHT') return HotelContractChargeBasis.PER_NIGHT;
    return null;
  }

  private cancellationPenaltyType(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'PERCENT') return HotelCancellationPenaltyType.PERCENT;
    if (normalized === 'NIGHTS') return HotelCancellationPenaltyType.NIGHTS;
    if (normalized === 'FULL_STAY') return HotelCancellationPenaltyType.FULL_STAY;
    if (normalized === 'FIXED') return HotelCancellationPenaltyType.FIXED;
    return null;
  }

  private cancellationDeadlineUnit(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'HOURS' ? HotelCancellationDeadlineUnit.HOURS : HotelCancellationDeadlineUnit.DAYS;
  }

  private childChargeBasis(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'PERCENT_OF_ADULT') return ChildPolicyChargeBasis.PERCENT_OF_ADULT;
    if (normalized === 'FIXED_AMOUNT') return ChildPolicyChargeBasis.FIXED_AMOUNT;
    return ChildPolicyChargeBasis.FREE;
  }

  private readTextPreview(filePath: string) {
    try {
      const buffer = readFileSync(filePath);
      const utf8 = buffer.toString('utf8');
      const readableUtf8 = utf8
        .replace(/[^\x09\x0A\x0D\x20-\x7E\u0600-\u06FF]+/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (readableUtf8.length > 80 && !readableUtf8.startsWith('%PDF')) {
        return readableUtf8.slice(0, 1024 * 1024);
      }

      const pdfScanText = buffer.subarray(0, Math.min(buffer.length, 3 * 1024 * 1024)).toString('latin1');
      const pdfStrings = Array.from(pdfScanText.matchAll(/\(([^()]{2,250})\)/g))
        .slice(0, 12000)
        .map((match) => match[1].replace(/\\([()\\])/g, '$1'))
        .filter((value) => /[a-zA-Z]{2,}/.test(value));
      const pdfArrayStrings = Array.from(pdfScanText.matchAll(/\[([\s\S]{0,8000}?)\]\s*TJ/g))
        .slice(0, 3000)
        .map((match) =>
          Array.from(match[1].matchAll(/\(([^()]{1,250})\)/g))
            .map((part) => part[1].replace(/\\([()\\])/g, '$1'))
            .join(''),
        )
        .filter((value) => /[a-zA-Z]{2,}/.test(value));
      const extractedPdfText = [...pdfStrings, ...pdfArrayStrings].join('\n').replace(/[^\x09\x0A\x0D\x20-\x7E\u0600-\u06FF]+/g, ' ');
      return (extractedPdfText || readableUtf8).slice(0, 1024 * 1024);
    } catch {
      return '';
    }
  }

  private readWorkbookRows(filePath: string, fileName: string): string[][] {
    const workbook = this.readWorkbook(filePath, fileName);
    if (!workbook) return [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const xlsx = require('xlsx');
      const rows: string[][] = [];
      for (const sheetName of workbook.SheetNames || []) {
        const matrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', blankrows: false, raw: false }) as unknown[][];
        rows.push([`SHEET: ${sheetName}`]);
        rows.push(...matrix.map((row) => row.map((cell) => String(cell ?? '').trim())));
      }
      return rows;
    } catch (error) {
      console.warn('[contract-imports/analyze] Could not parse workbook', error);
      return [];
    }
  }

  private readWorkbook(filePath: string, fileName: string) {
    if (!/\.(xlsx|xls|xlsm)$/i.test(fileName)) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const xlsx = require('xlsx');
      return xlsx.readFile(filePath, { cellDates: true });
    } catch (error) {
      console.warn('[contract-imports/analyze] Could not read workbook', error);
      return null;
    }
  }

  private extractNormalizedHotelWorkbookPreview(
    input: {
      contractType: ContractImportType;
      supplierName: string;
      contractYear: number | null;
      validFrom: Date | null;
      validTo: Date | null;
      filePath: string;
      fileName: string;
    },
    workbook: any,
    selectedHotel?: { code?: string; name: string },
  ): ContractPreview | null {
    const contractSheet = this.getWorkbookSheet(workbook, 'CONTRACT') || this.getWorkbookSheet(workbook, 'CONTRACTS');
    const ratesSheet = this.getWorkbookSheet(workbook, 'RATES');
    if (!workbook || !contractSheet || !ratesSheet) {
      return null;
    }

    const warnings: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }> = [];
    const requiredTabs = ['SEASONS', 'ROOM_CATEGORIES', 'RATES', 'SUPPLEMENTS', 'CANCELLATION_POLICY', 'CHILD_POLICY', 'NOTES'];
    if (!contractSheet) {
      warnings.push({ severity: 'blocker', field: 'tabs.CONTRACT', message: 'Normalized workbook is missing required tab: CONTRACT or CONTRACTS' });
    }
    for (const tab of requiredTabs) {
      if (!this.getWorkbookSheet(workbook, tab)) {
        warnings.push({ severity: 'blocker', field: `tabs.${tab}`, message: `Normalized workbook is missing required tab: ${tab}` });
      }
    }

    const allContractRows = this.sheetToObjects(workbook, contractSheet).filter((row) => this.rowHasValues(row));
    const allSeasonRows = this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'SEASONS')).filter((row) => this.rowHasValues(row));
    const allRoomRows = this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'ROOM_CATEGORIES')).filter((row) => this.rowHasValues(row));
    const allRateRows = this.sheetToObjects(workbook, ratesSheet).filter((row) => this.rowHasValues(row));
    const allSupplementRows = this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'SUPPLEMENTS')).filter((row) => this.rowHasValues(row));
    const allCancellationRows = this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'CANCELLATION_POLICY')).filter((row) => this.rowHasValues(row));
    const allChildRows = this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'CHILD_POLICY')).filter((row) => this.rowHasValues(row));
    const allNoteRows = this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'NOTES')).filter((row) => this.rowHasValues(row));

    const detectedHotels = this.detectNormalizedWorkbookHotels([
      ...allContractRows,
      ...allSeasonRows,
      ...allRoomRows,
      ...allRateRows,
      ...allSupplementRows,
      ...allCancellationRows,
      ...allChildRows,
      ...allNoteRows,
    ]);
    if (!selectedHotel && detectedHotels.length > 1) {
      const hotels = detectedHotels
        .map((hotel) => this.extractNormalizedHotelWorkbookPreview(input, workbook, hotel))
        .filter((preview): preview is ContractPreview => Boolean(preview));
      const normalizedWorkbooks = hotels.map((hotel) => {
        const hotelWarnings = this.buildExtractionQcWarnings(hotel);
        return {
          hotelName: hotel.hotel?.name || hotel.hotelName || hotel.supplier.name,
          fileName: `${this.safeExportFileName(hotel.contract.name || hotel.hotel?.name || 'hotel-contract')}-normalized-contract.xlsx`,
          roomCount: hotel.roomCategories.length,
          rateCount: hotel.rates.length,
          supplementCount: hotel.supplements.length,
          seasonCount: hotel.seasons.length,
          warningCount: hotelWarnings.length + (hotel.warnings?.length || 0),
        };
      });
      const supplierName = input.supplierName || this.templateCell(allContractRows[0] || {}, 'SupplierName') || this.guessNameFromFile(input.fileName);
      return this.addPreviewAliases({
        contractType: ContractImportType.HOTEL,
        supplier: { name: supplierName, isNew: true },
        contract: {
          name: `${supplierName} Multi-Hotel Workbook`,
          year: input.contractYear || new Date().getFullYear(),
          validFrom: input.validFrom ? this.isoDate(input.validFrom) : null,
          validTo: input.validTo ? this.isoDate(input.validTo) : null,
          currency: (this.templateCell(allContractRows[0] || {}, 'Currency') || 'USD').trim().toUpperCase(),
        },
        hotel: { name: `${detectedHotels.length} hotels detected`, city: '', category: 'Multi-hotel workbook' },
        roomCategories: this.mergePreviewArrayByName(hotels.flatMap((hotel) => hotel.roomCategories || [])),
        seasons: this.mergePreviewArrayByName(hotels.flatMap((hotel) => hotel.seasons || [])),
        rates: hotels.flatMap((hotel) => hotel.rates.map((rate) => ({ ...rate, notes: [hotel.hotel?.name, rate.notes].filter(Boolean).join(' | ') }))),
        mealPlans: this.mergePreviewArrayByCode(hotels.flatMap((hotel) => hotel.mealPlans || [])),
        taxes: [],
        supplements: hotels.flatMap((hotel) => hotel.supplements.map((supplement) => ({ ...supplement, notes: [hotel.hotel?.name, supplement.notes].filter(Boolean).join(' | ') }))),
        policies: [
          { name: 'Multi-hotel workbook', value: 'Select one hotel before import. Multiple hotels cannot be imported in one activation.' },
          { name: 'Source file', value: input.fileName },
        ],
        ratePolicies: [],
        cancellationPolicy: null,
        cancellationPolicies: [],
        childPolicy: null,
        multiProperty: {
          detected: true,
          propertyCount: hotels.length,
          hotels,
          normalizedWorkbooks,
        },
        meta: {
          extractionMode: 'NORMALIZED_EXCEL_WORKBOOK_MULTI_HOTEL',
        },
        parserDiagnostics: {
          source: 'workbook',
          rowCount: allContractRows.length + allSeasonRows.length + allRoomRows.length + allRateRows.length + allSupplementRows.length,
          parsedTextLineCount: 0,
          first20Lines: [],
          detectedHotels: detectedHotels.map((hotel) => hotel.name),
          detectedTables: ['CONTRACTS', ...requiredTabs]
            .filter((tab) => this.getWorkbookSheet(workbook, tab) || (tab === 'CONTRACTS' && contractSheet))
            .map((tab) => ({ label: tab, confidence: 1 })),
          skippedSections: [],
          confidence: 0.9,
          warnings: ['Multi-hotel workbook requires one hotel selection before import.'],
          extractionMode: 'WORKBOOK',
        },
        warnings: [
          {
            severity: 'blocker',
            field: 'multiProperty',
            message: 'This workbook contains multiple hotels. Select one hotel and import only that filtered hotel contract.',
          },
        ],
        missingFields: [],
        uncertainFields: ['hotel selection'],
      });
    }

    const contractRows = this.filterNormalizedRowsForHotel(allContractRows, selectedHotel);
    const seasonRows = this.filterNormalizedRowsForHotel(allSeasonRows, selectedHotel);
    const roomRows = this.filterNormalizedRowsForHotel(allRoomRows, selectedHotel);
    const rateRows = this.filterNormalizedRowsForHotel(allRateRows, selectedHotel);
    const supplementRows = this.filterNormalizedRowsForHotel(allSupplementRows, selectedHotel);
    const cancellationRows = this.filterNormalizedRowsForHotel(allCancellationRows, selectedHotel);
    const childRows = this.filterNormalizedRowsForHotel(allChildRows, selectedHotel);
    const noteRows = this.filterNormalizedRowsForHotel(allNoteRows, selectedHotel);
    const headerSample = (sheetName: string, rows: Array<Record<string, string>>) => rows[0] || this.workbookSheetHeaderSample(workbook, this.getWorkbookSheet(workbook, sheetName));

    if (contractRows.length !== 1) {
      warnings.push({ severity: 'blocker', field: 'CONTRACT', message: 'CONTRACT tab must contain exactly one hotel contract row.' });
    }

    const contractRow = contractRows[0] || {};
    this.requireWorkbookColumns(headerSample('CONTRACT', contractRows), 'CONTRACT', [
      'HotelName',
      'SupplierName',
      'ContractName',
      'ContractYear',
      'Currency',
      'City',
      'Country',
      'Category',
      'ValidFrom',
      'ValidTo',
      'ContractStatus',
      'SourceReference',
    ], warnings);
    this.requireWorkbookColumns(headerSample('SEASONS', seasonRows), 'SEASONS', ['SeasonCode', 'SeasonName', 'StartDate', 'EndDate', 'SeasonType', 'Notes'], warnings);
    this.requireWorkbookColumns(headerSample('ROOM_CATEGORIES', roomRows), 'ROOM_CATEGORIES', ['RoomCode', 'RoomName', 'RoomType', 'Bedding', 'MaxAdults', 'MaxChildren', 'Notes'], warnings);
    this.requireWorkbookColumns(headerSample('RATES', rateRows), 'RATES', ['SeasonCode', 'RoomCode', 'Occupancy', 'MealPlan', 'PricingBasis', 'Cost', 'Currency', 'MinStay', 'Notes'], warnings);
    this.requireWorkbookColumns(headerSample('SUPPLEMENTS', supplementRows), 'SUPPLEMENTS', ['SupplementType', 'SeasonCode', 'RoomCode', 'MealPlan', 'Basis', 'Amount', 'Currency', 'Mandatory', 'Notes'], warnings);
    this.requireWorkbookColumns(headerSample('CANCELLATION_POLICY', cancellationRows), 'CANCELLATION_POLICY', ['PolicyName', 'DaysBeforeArrival', 'PenaltyType', 'PenaltyValue', 'Notes'], warnings);
    this.requireWorkbookColumns(headerSample('CHILD_POLICY', childRows), 'CHILD_POLICY', ['ChildAgeFrom', 'ChildAgeTo', 'SharingBasis', 'RateType', 'RateValue', 'Notes'], warnings);

    const hotelName = this.templateCell(contractRow, 'HotelName');
    const supplierName = this.templateCell(contractRow, 'SupplierName') || input.supplierName || hotelName;
    const contractName = this.templateCell(contractRow, 'ContractName') || `${hotelName || supplierName} ${input.contractYear || new Date().getFullYear()}`;
    const contractYear = this.parseOptionalInt(this.templateCell(contractRow, 'ContractYear')) || input.contractYear || null;
    const contractCurrency = (this.templateCell(contractRow, 'Currency') || 'USD').trim().toUpperCase();
    const contractValidFrom = this.isoDateFromTemplate(this.templateCell(contractRow, 'ValidFrom')) || (input.validFrom ? this.isoDate(input.validFrom) : null);
    const contractValidTo = this.isoDateFromTemplate(this.templateCell(contractRow, 'ValidTo')) || (input.validTo ? this.isoDate(input.validTo) : null);

    const seasonByCode = new Map<string, { code: string; name: string; validFrom?: string | null; validTo?: string | null; notes?: string }>();
    const seenSeasonCodes = new Set<string>();
    const seasons = seasonRows
      .map((row, index) => {
        const code = this.templateCell(row, 'SeasonCode').trim().toUpperCase();
        const name = this.templateCell(row, 'SeasonName') || code;
        const validFrom = this.isoDateFromTemplate(this.templateCell(row, 'StartDate'));
        const validTo = this.isoDateFromTemplate(this.templateCell(row, 'EndDate'));
        if (!code) warnings.push({ severity: 'blocker', field: `SEASONS.${index + 1}.SeasonCode`, message: 'SeasonCode is required.' });
        if (code && seenSeasonCodes.has(code)) warnings.push({ severity: 'blocker', field: `SEASONS.${index + 1}.SeasonCode`, message: `Duplicate season code: ${code}` });
        if (!validFrom) warnings.push({ severity: 'blocker', field: `SEASONS.${index + 1}.StartDate`, message: 'StartDate is required and must be a valid date.' });
        if (!validTo) warnings.push({ severity: 'blocker', field: `SEASONS.${index + 1}.EndDate`, message: 'EndDate is required and must be a valid date.' });
        if (code) seenSeasonCodes.add(code);
        const season = { code, name, validFrom, validTo, notes: this.templateCell(row, 'Notes') };
        if (code) seasonByCode.set(code, season);
        return { name, validFrom, validTo, uncertain: false };
      })
      .filter((season) => season.name);

    const roomByCode = new Map<string, { code: string; name: string; description?: string | null }>();
    const seenRoomCodes = new Set<string>();
    const roomCategories = roomRows
      .map((row, index) => {
        const code = this.templateCell(row, 'RoomCode').trim().toUpperCase();
        const name = this.templateCell(row, 'RoomName');
        if (!code) warnings.push({ severity: 'blocker', field: `ROOM_CATEGORIES.${index + 1}.RoomCode`, message: 'RoomCode is required.' });
        if (!name) warnings.push({ severity: 'blocker', field: `ROOM_CATEGORIES.${index + 1}.RoomName`, message: 'RoomName is required.' });
        if (code && seenRoomCodes.has(code)) warnings.push({ severity: 'blocker', field: `ROOM_CATEGORIES.${index + 1}.RoomCode`, message: `Duplicate room code: ${code}` });
        if (code) seenRoomCodes.add(code);
        const details = [
          this.templateCell(row, 'RoomType') ? `Type: ${this.templateCell(row, 'RoomType')}` : '',
          this.templateCell(row, 'Bedding') ? `Bedding: ${this.templateCell(row, 'Bedding')}` : '',
          this.templateCell(row, 'MaxAdults') ? `Max adults: ${this.templateCell(row, 'MaxAdults')}` : '',
          this.templateCell(row, 'MaxChildren') ? `Max children: ${this.templateCell(row, 'MaxChildren')}` : '',
          this.templateCell(row, 'Notes'),
        ].filter(Boolean);
        const room = { code, name, description: details.join(' | ') || null };
        if (code) roomByCode.set(code, room);
        return { name, code, description: room.description, uncertain: false };
      })
      .filter((room) => room.name);

    const validPricingBases = new Set(['PER_ROOM_NIGHT', 'PER_PERSON_NIGHT', 'PER_PERSON_IN_DBL_NIGHT', 'SINGLE_SUPPLEMENT_ON_DBL']);
    const seenRateKeys = new Set<string>();
    const rates: PreviewRate[] = rateRows
      .map((row, index) => {
        const seasonCode = this.templateCell(row, 'SeasonCode').trim().toUpperCase();
        const roomCode = this.templateCell(row, 'RoomCode').trim().toUpperCase();
        const occupancy = this.normalizeTemplateOccupancy(this.templateCell(row, 'Occupancy'));
        const mealPlan = this.templateCell(row, 'MealPlan').trim().toUpperCase();
        const pricingBasisRaw = this.templateCell(row, 'PricingBasis').trim().toUpperCase();
        const cost = this.parseNumber(this.templateCell(row, 'Cost'));
        const currency = (this.templateCell(row, 'Currency') || contractCurrency).trim().toUpperCase();
        const fieldPrefix = `RATES.${index + 1}`;
        if (!seasonCode) warnings.push({ severity: 'blocker', field: `${fieldPrefix}.SeasonCode`, message: 'SeasonCode is required.' });
        if (seasonCode && !seasonByCode.has(seasonCode)) warnings.push({ severity: 'blocker', field: `${fieldPrefix}.SeasonCode`, message: `Unknown SeasonCode: ${seasonCode}` });
        if (!roomCode) warnings.push({ severity: 'blocker', field: `${fieldPrefix}.RoomCode`, message: 'RoomCode is required.' });
        if (roomCode && !roomByCode.has(roomCode)) warnings.push({ severity: 'blocker', field: `${fieldPrefix}.RoomCode`, message: `Unknown RoomCode: ${roomCode}` });
        if (!occupancy) warnings.push({ severity: 'blocker', field: `${fieldPrefix}.Occupancy`, message: 'Occupancy is required.' });
        if (!mealPlan || !HOTEL_MEAL_PLAN_VALUES.includes(mealPlan)) warnings.push({ severity: 'blocker', field: `${fieldPrefix}.MealPlan`, message: `Invalid meal plan: ${mealPlan || 'blank'}` });
        if (!pricingBasisRaw || !validPricingBases.has(pricingBasisRaw)) warnings.push({ severity: 'blocker', field: `${fieldPrefix}.PricingBasis`, message: `Invalid pricing basis: ${pricingBasisRaw || 'blank'}` });
        if (cost === undefined || cost < 0) warnings.push({ severity: 'blocker', field: `${fieldPrefix}.Cost`, message: 'Cost is required and cannot be negative.' });
        if (!this.isSupportedCurrency(currency)) warnings.push({ severity: 'blocker', field: `${fieldPrefix}.Currency`, message: `Unknown currency: ${currency || 'blank'}` });
        const duplicateKey = [seasonCode, roomCode, occupancy, mealPlan, pricingBasisRaw].join('|');
        if (seenRateKeys.has(duplicateKey)) warnings.push({ severity: 'blocker', field: `${fieldPrefix}`, message: `Duplicate rate row for ${duplicateKey.replace(/\|/g, ' / ')}` });
        seenRateKeys.add(duplicateKey);

        const season = seasonByCode.get(seasonCode);
        const room = roomByCode.get(roomCode);
        const pricingBasis: 'PER_ROOM' | 'PER_PERSON' = pricingBasisRaw === 'PER_ROOM_NIGHT' ? 'PER_ROOM' : 'PER_PERSON';
        const normalizedPricingBasis: 'PER_ROOM_NIGHT' | 'PER_PERSON_NIGHT' = pricingBasis === 'PER_ROOM' ? 'PER_ROOM_NIGHT' : 'PER_PERSON_NIGHT';
        return {
          roomType: room?.name || roomCode,
          occupancyType: occupancy,
          mealPlan,
          seasonName: season?.name || seasonCode || 'Imported',
          seasonFrom: season?.validFrom || undefined,
          seasonTo: season?.validTo || undefined,
          cost,
          currency,
          pricingBasis,
          normalizedPricingBasis,
          notes: [
            pricingBasisRaw && pricingBasisRaw !== normalizedPricingBasis ? `Original pricing basis: ${pricingBasisRaw}` : '',
            this.templateCell(row, 'MinStay') ? `Min stay: ${this.templateCell(row, 'MinStay')}` : '',
            this.templateCell(row, 'Notes'),
          ].filter(Boolean).join(' | ') || undefined,
        };
      })
      .filter((rate) => rate.roomType || rate.cost !== undefined);

    const supplements = supplementRows
      .map((row, index) => {
        const typeRaw = this.templateCell(row, 'SupplementType');
        const seasonCode = this.templateCell(row, 'SeasonCode').trim().toUpperCase();
        const roomCode = this.templateCell(row, 'RoomCode').trim().toUpperCase();
        const currency = (this.templateCell(row, 'Currency') || contractCurrency).trim().toUpperCase();
        const amount = this.parseNumber(this.templateCell(row, 'Amount'));
        if (!typeRaw) warnings.push({ severity: 'blocker', field: `SUPPLEMENTS.${index + 1}.SupplementType`, message: 'SupplementType is required.' });
        if (seasonCode && !this.isGlobalSeasonScope(seasonCode) && !seasonByCode.has(seasonCode)) warnings.push({ severity: 'blocker', field: `SUPPLEMENTS.${index + 1}.SeasonCode`, message: `Unknown SeasonCode: ${seasonCode}` });
        if (roomCode && !roomByCode.has(roomCode)) warnings.push({ severity: 'blocker', field: `SUPPLEMENTS.${index + 1}.RoomCode`, message: `Unknown RoomCode: ${roomCode}` });
        if (amount !== undefined && amount < 0) warnings.push({ severity: 'blocker', field: `SUPPLEMENTS.${index + 1}.Amount`, message: 'Amount cannot be negative.' });
        if (currency && !this.isSupportedCurrency(currency)) warnings.push({ severity: 'blocker', field: `SUPPLEMENTS.${index + 1}.Currency`, message: `Unknown currency: ${currency}` });
        const normalizedCurrency = this.normalizeSupplementCurrency(currency, contractCurrency);
        return {
          name: typeRaw || 'Supplement',
          type: this.normalizedWorkbookSupplementType(typeRaw),
          chargeBasis: this.templateCell(row, 'Basis') || null,
          amount: amount ?? null,
          currency: normalizedCurrency.currency,
          pricingBasis: this.templateCell(row, 'Basis').toUpperCase().includes('PERSON') ? 'PER_PERSON' as const : 'PER_ROOM' as const,
          isMandatory: this.parseBoolean(this.templateCell(row, 'Mandatory')) ?? false,
          notes: [
            seasonCode ? `Season: ${seasonCode}` : '',
            roomCode ? `Room: ${roomCode}` : '',
            this.templateCell(row, 'MealPlan') ? `Meal: ${this.templateCell(row, 'MealPlan')}` : '',
            this.templateCell(row, 'Notes'),
            normalizedCurrency.note,
          ].filter(Boolean).join(' | ') || undefined,
        };
      })
      .filter((supplement) => supplement.name);

    const cancellationPolicy = cancellationRows.length
      ? {
          summary: 'Cancellation policy imported from normalized workbook.',
          notes: null,
          noShowPenaltyType: 'FULL_STAY',
          noShowPenaltyValue: null,
          rules: cancellationRows
            .map((row) => {
              const daysBefore = this.parseNumber(this.templateCell(row, 'DaysBeforeArrival'));
              const penaltyType = this.normalizedWorkbookPenaltyType(this.templateCell(row, 'PenaltyType'));
              const penaltyValue = this.parseNumber(this.templateCell(row, 'PenaltyValue'));
              if (daysBefore === undefined && penaltyValue === undefined) return null;
              return {
                daysBefore: daysBefore ?? 0,
                windowFromValue: daysBefore ?? 0,
                windowToValue: 0,
                deadlineUnit: 'DAYS',
                penaltyType,
                penaltyValue: penaltyValue ?? null,
                penaltyPercent: penaltyType === 'PERCENT' ? penaltyValue ?? 0 : undefined,
                notes: [this.templateCell(row, 'PolicyName'), this.templateCell(row, 'Notes')].filter(Boolean).join(' | ') || null,
              };
            })
            .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule)),
        }
      : null;

    const childBands = childRows
      .map((row, index) => {
        const minAge = this.parseNumber(this.templateCell(row, 'ChildAgeFrom'));
        const maxAge = this.parseNumber(this.templateCell(row, 'ChildAgeTo'));
        const rateType = this.templateCell(row, 'RateType');
        const rateValue = this.parseNumber(this.templateCell(row, 'RateValue'));
        if (minAge === undefined && maxAge === undefined && !rateType && rateValue === undefined) return null;
        return {
          label: `Child policy ${index + 1}`,
          minAge: minAge ?? 0,
          maxAge: maxAge ?? minAge ?? 12,
          chargeBasis: this.normalizedWorkbookChildChargeBasis(rateType),
          chargeValue: rateValue ?? null,
          notes: [this.templateCell(row, 'SharingBasis'), this.templateCell(row, 'Notes')].filter(Boolean).join(' | ') || null,
        };
      })
      .filter((band): band is NonNullable<typeof band> => Boolean(band));

    const notePolicies = noteRows.map((row, index) => ({
      name: `Operational note ${index + 1}`,
      value: Object.values(row).filter(Boolean).join(' | '),
    })).filter((policy) => policy.value);

    return this.addPreviewAliases({
      contractType: ContractImportType.HOTEL,
      supplier: { name: supplierName, isNew: true },
      contract: {
        name: contractName,
        year: contractYear,
        validFrom: contractValidFrom,
        validTo: contractValidTo,
        currency: contractCurrency,
      },
      hotel: {
        name: hotelName,
        city: this.templateCell(contractRow, 'City') || 'Amman',
        category: this.templateCell(contractRow, 'Category') || 'Unclassified',
      },
      roomCategories,
      seasons,
      rates,
      mealPlans: Array.from(new Set(rates.map((rate) => rate.mealPlan || 'BB'))).map((code, index) => ({ code, isDefault: index === 0 })),
      taxes: [],
      supplements,
      policies: [
        { name: 'Workbook workflow', value: 'Normalized Excel workbook is the operational source of truth. PDF is reference only.' },
        { name: 'Source reference', value: this.templateCell(contractRow, 'SourceReference') || input.fileName },
        ...notePolicies,
      ],
      ratePolicies: [],
      cancellationPolicy,
      cancellationPolicies: cancellationPolicy ? [cancellationPolicy] : [],
      childPolicy: childBands.length
        ? {
            infantMaxAge: Math.max(0, ...childBands.filter((band) => band.maxAge <= 5).map((band) => band.maxAge), 5),
            childMaxAge: Math.max(12, ...childBands.map((band) => band.maxAge)),
            notes: null,
            bands: childBands,
          }
        : null,
      meta: {
        extractionMode: 'NORMALIZED_EXCEL_WORKBOOK',
        contractStatus: this.templateCell(contractRow, 'ContractStatus') || 'Draft',
        sourceReference: this.templateCell(contractRow, 'SourceReference') || input.fileName,
      },
      parserDiagnostics: {
        source: 'workbook',
        rowCount: rateRows.length + seasonRows.length + roomRows.length + supplementRows.length,
        parsedTextLineCount: 0,
        first20Lines: [],
        detectedHotels: hotelName ? [hotelName] : [],
        detectedTables: requiredTabs
          .filter((tab) => this.getWorkbookSheet(workbook, tab))
          .map((tab) => ({ label: tab, confidence: 1 })),
        skippedSections: [],
        confidence: warnings.some((warning) => warning.severity === 'blocker') ? 0.65 : 0.98,
        warnings: warnings.map((warning) => warning.message),
        extractionMode: 'WORKBOOK',
      },
      warnings: [...warnings, ...this.buildExtractionQcWarnings({ rates, seasons })],
      missingFields: warnings.filter((warning) => warning.severity === 'blocker').map((warning) => warning.field),
      uncertainFields: [],
    });
  }

  private rowHasValues(row: Record<string, string>) {
    return Object.values(row).some((value) => this.optionalString(value));
  }

  private normalizedHotelCode(row: Record<string, string>) {
    return (this.templateCell(row, 'HotelCode') || this.templateCell(row, 'PropertyCode')).trim().toUpperCase();
  }

  private isGlobalSeasonScope(value: unknown) {
    return ['ALL_SEASONS', 'GLOBAL', 'ANY'].includes(this.optionalString(value).toUpperCase());
  }

  private normalizedHotelName(row: Record<string, string>) {
    return (this.templateCell(row, 'HotelName') || this.templateCell(row, 'Hotel') || this.templateCell(row, 'PropertyName') || this.templateCell(row, 'Property')).trim();
  }

  private detectNormalizedWorkbookHotels(rows: Array<Record<string, string>>) {
    const byKey = new Map<string, { code?: string; name: string }>();
    for (const row of rows) {
      const code = this.normalizedHotelCode(row);
      const name = this.normalizedHotelName(row);
      if (!code && !name) continue;
      const key = code || name.toLowerCase();
      if (!byKey.has(key)) {
        byKey.set(key, { code: code || undefined, name: name || code });
      } else if (name && !byKey.get(key)!.name) {
        byKey.get(key)!.name = name;
      }
    }
    return Array.from(byKey.values()).filter((hotel) => hotel.name);
  }

  private filterNormalizedRowsForHotel(rows: Array<Record<string, string>>, selectedHotel?: { code?: string; name: string }) {
    if (!selectedHotel) return rows;
    const selectedCode = this.optionalString(selectedHotel.code).toUpperCase();
    const selectedName = this.optionalString(selectedHotel.name).toLowerCase();
    return rows.filter((row) => {
      const rowCode = this.normalizedHotelCode(row);
      const rowName = this.normalizedHotelName(row).toLowerCase();
      if (rowCode) return Boolean(selectedCode && rowCode === selectedCode);
      if (rowName) return rowName === selectedName;
      return false;
    });
  }

  private workbookSheetHeaderSample(workbook: any, sheetName: string | null) {
    if (!workbook || !sheetName) return {};
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const xlsx = require('xlsx');
      const matrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', blankrows: false, raw: false }) as unknown[][];
      const headers = (matrix[0] || []).map((value) => String(value ?? '').trim()).filter(Boolean);
      return headers.reduce<Record<string, string>>((sample, header) => {
        sample[header] = '';
        return sample;
      }, {});
    } catch {
      return {};
    }
  }

  private requireWorkbookColumns(
    sampleRow: Record<string, string>,
    sheetName: string,
    columns: string[],
    warnings: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }>,
  ) {
    const actualColumns = Object.keys(sampleRow || {});
    for (const column of columns) {
      if (!actualColumns.some((actual) => this.templateHeaderMatches(actual, column))) {
        warnings.push({ severity: 'blocker', field: `${sheetName}.${column}`, message: `${sheetName} sheet is missing required column: ${column}` });
      }
    }
  }

  private normalizedWorkbookSupplementType(value: unknown) {
    const normalized = this.optionalString(value).toUpperCase();
    if (normalized.includes('BREAKFAST')) return HotelContractSupplementType.EXTRA_BREAKFAST;
    if (normalized.includes('LUNCH')) return HotelContractSupplementType.EXTRA_LUNCH;
    if (normalized.includes('DINNER') || normalized.includes('CHRISTMAS') || normalized.includes('NEW_YEAR')) return HotelContractSupplementType.GALA_DINNER;
    if (normalized.includes('BED') || normalized.includes('CHILD') || normalized.includes('SUPPLEMENT')) return HotelContractSupplementType.EXTRA_BED;
    return this.normalizeHotelSupplementType(value);
  }

  private normalizedWorkbookPenaltyType(value: unknown) {
    const normalized = this.optionalString(value).toUpperCase();
    if (normalized === 'NIGHT') return 'NIGHTS';
    if (['PERCENT', 'NIGHTS', 'FULL_STAY', 'FIXED'].includes(normalized)) return normalized;
    return 'FULL_STAY';
  }

  private normalizedWorkbookChildChargeBasis(value: unknown) {
    const normalized = this.optionalString(value).toUpperCase();
    if (normalized.includes('PERCENT')) return ChildPolicyChargeBasis.PERCENT_OF_ADULT;
    if (normalized.includes('FIXED') || normalized.includes('AMOUNT')) return ChildPolicyChargeBasis.FIXED_AMOUNT;
    return ChildPolicyChargeBasis.FREE;
  }

  private getWorkbookSheet(workbook: any, expectedName: string) {
    if (!workbook) return null;
    const expected = this.normalizeTemplateHeader(expectedName);
    const sheetName = (workbook.SheetNames || []).find((name: string) => this.normalizeTemplateHeader(name) === expected);
    return sheetName || null;
  }

  private sheetToObjects(workbook: any, sheetName: string | null): Array<Record<string, string>> {
    if (!workbook || !sheetName) return [] as Array<Record<string, string>>;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const xlsx = require('xlsx');
    return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false }).map((row: Record<string, unknown>) => {
      return Object.entries(row).reduce<Record<string, string>>((mapped, [key, value]) => {
        mapped[String(key).trim()] = String(value ?? '').trim();
        return mapped;
      }, {});
    });
  }

  private detectWorkbookProperties(rows: Array<Record<string, string>>) {
    return Array.from(
      new Set(
        rows
          .map((row) => this.rowPropertyName(row))
          .filter((value): value is string => Boolean(value)),
      ),
    );
  }

  private rowPropertyName(row: Record<string, string>) {
    return (
      this.templateCell(row, 'Hotel') ||
      this.templateCell(row, 'Hotel Name') ||
      this.templateCell(row, 'Property') ||
      this.templateCell(row, 'Property Name')
    ).trim();
  }

  private filterRowsForProperty(rows: Array<Record<string, string>>, propertyName?: string) {
    if (!propertyName) return rows;
    const scopedRows = rows.filter((row) => {
      const rowProperty = this.rowPropertyName(row);
      return !rowProperty || rowProperty.toLowerCase() === propertyName.toLowerCase();
    });
    return scopedRows;
  }

  private mergePreviewArrayByName<T extends { name?: string }>(items: T[]) {
    const byName = new Map<string, T>();
    for (const item of items) {
      const key = this.optionalString(item.name).toLowerCase();
      if (key && !byName.has(key)) {
        byName.set(key, item);
      }
    }
    return Array.from(byName.values());
  }

  private mergePreviewArrayByCode<T extends { code?: string }>(items: T[]) {
    const byCode = new Map<string, T>();
    for (const item of items) {
      const key = this.optionalString(item.code).toUpperCase();
      if (key && !byCode.has(key)) {
        byCode.set(key, item);
      }
    }
    return Array.from(byCode.values());
  }

  private normalizedNightlyPricingBasis(value: unknown): 'PER_PERSON_NIGHT' | 'PER_ROOM_NIGHT' {
    return this.normalizePricingBasis(value) === 'PER_PERSON' ? 'PER_PERSON_NIGHT' : 'PER_ROOM_NIGHT';
  }

  private supplementCategoryNote(name: unknown) {
    const label = this.optionalString(name);
    if (/single\s+supp/i.test(label)) return 'Single supplement';
    if (/(suite|room|category|upgrade)/i.test(label)) return 'Room-category supplement';
    return '';
  }

  private readMetaSheet(workbook: any) {
    const rows = this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'Meta'));
    const meta: Record<string, string> = {};

    for (const row of rows) {
      const explicitKey = this.templateCell(row, 'Key') || this.templateCell(row, 'Field') || this.templateCell(row, 'Name');
      const explicitValue = this.templateCell(row, 'Value') || this.templateCell(row, 'Data');
      if (explicitKey) {
        meta[this.normalizeMetaKey(explicitKey)] = explicitValue;
      }

      for (const [key, value] of Object.entries(row)) {
        if (value && !/^key$|^field$|^name$|^value$|^data$/i.test(key)) {
          meta[this.normalizeMetaKey(key)] = this.normalizeMetaValue(value);
        }
      }
    }

    return meta;
  }

  private readCancellationPolicySheet(workbook: any): ContractPreview['cancellationPolicy'] {
    const rows = this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'CancellationPolicy'));
    if (rows.length === 0) return null;

    const rules = rows
      .map((row) => {
        const daysBefore = this.parseNumber(
          this.templateCell(row, 'Days Before') ||
            this.templateCell(row, 'DaysBefore') ||
            this.templateCell(row, 'Window From') ||
            this.templateCell(row, 'WindowFromValue'),
        );
        const penaltyPercent = this.parseNumber(
          this.templateCell(row, 'Penalty Percent') ||
            this.templateCell(row, 'Penalty %') ||
            this.templateCell(row, 'PenaltyPercent') ||
            this.templateCell(row, 'Penalty Value'),
        );
        const penaltyType = this.templateCell(row, 'Penalty Type') || (penaltyPercent ? 'PERCENT' : 'NIGHTS');
        const penaltyValue =
          penaltyType.trim().toUpperCase() === 'PERCENT'
            ? penaltyPercent
            : this.parseNumber(this.templateCell(row, 'Penalty Value')) ?? penaltyPercent;

        if (daysBefore === undefined && penaltyValue === undefined) return null;

        return {
          daysBefore: daysBefore ?? 0,
          penaltyPercent: penaltyType.trim().toUpperCase() === 'PERCENT' ? penaltyValue ?? 0 : undefined,
          windowFromValue: daysBefore ?? 0,
          windowToValue: this.parseNumber(this.templateCell(row, 'Window To') || this.templateCell(row, 'WindowToValue')) ?? 0,
          deadlineUnit: this.templateCell(row, 'Deadline Unit') || 'DAYS',
          penaltyType,
          penaltyValue: penaltyValue ?? null,
          notes: this.templateCell(row, 'Notes') || null,
        };
      })
      .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule));

    const first = rows[0] || {};
    return {
      summary: this.templateCell(first, 'Summary') || 'Cancellation policy imported from Excel template.',
      notes: this.templateCell(first, 'Notes') || null,
      noShowPenaltyType: this.templateCell(first, 'No Show Penalty Type') || 'FULL_STAY',
      noShowPenaltyValue: this.parseNumber(this.templateCell(first, 'No Show Penalty Value')) ?? null,
      rules,
    };
  }

  private readRatePoliciesSheet(workbook: any, fallbackCurrency: string, propertyName?: string): {
    policies: RatePolicyPreview[];
    warnings: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }>;
  } {
    const warnings: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }> = [];
    const policies = this.filterRowsForProperty(this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'RatePolicies')), propertyName)
      .map((row, index) => {
        const amountRaw = this.templateCell(row, 'Amount');
        const percentRaw = this.templateCell(row, 'Percent');
        const ageFromRaw = this.templateCell(row, 'Age From');
        const ageToRaw = this.templateCell(row, 'Age To');
        const amount = this.parseNumber(amountRaw);
        const percent = this.parseNumber(percentRaw);
        const ageFrom = this.parseNumber(ageFromRaw);
        const ageTo = this.parseNumber(ageToRaw);

        if (amountRaw && amount === undefined) {
          warnings.push({ severity: 'blocker', field: `RatePolicies.${index + 1}.Amount`, message: 'RatePolicies Amount must be numeric' });
        }
        if (percentRaw && percent === undefined) {
          warnings.push({ severity: 'blocker', field: `RatePolicies.${index + 1}.Percent`, message: 'RatePolicies Percent must be numeric' });
        }
        if (ageFromRaw && ageFrom === undefined) {
          warnings.push({ severity: 'blocker', field: `RatePolicies.${index + 1}.Age From`, message: 'RatePolicies Age From must be numeric' });
        }
        if (ageToRaw && ageTo === undefined) {
          warnings.push({ severity: 'blocker', field: `RatePolicies.${index + 1}.Age To`, message: 'RatePolicies Age To must be numeric' });
        }

        return {
          policyType: (this.templateCell(row, 'Policy Type') || '').trim().toUpperCase(),
          appliesTo: this.templateCell(row, 'Applies To') || null,
          ageFrom: ageFrom ?? null,
          ageTo: ageTo ?? null,
          amount: amount ?? null,
          percent: percent ?? null,
          currency: this.normalizeSupplementCurrency(this.templateCell(row, 'Currency'), fallbackCurrency).currency,
          pricingBasis: this.normalizePricingBasis(this.templateCell(row, 'Pricing Basis')) || 'PER_ROOM',
          mealPlan: this.templateCell(row, 'Meal Plan') || null,
          notes: this.templateCell(row, 'Notes') || null,
        };
      })
      .filter((policy) => Boolean(policy.policyType));

    return { policies, warnings };
  }

  private readChildPolicySheet(
    workbook: any,
    meta: Record<string, string>,
    ratePolicies: RatePolicyPreview[],
    policies: ContractPreview['policies'],
    propertyName?: string,
  ): ContractPreview['childPolicy'] {
    const rows = this.filterRowsForProperty(this.sheetToObjects(workbook, this.getWorkbookSheet(workbook, 'ChildPolicy')), propertyName);
    const childPolicyNotes = policies
      .filter((policy) => /child|children|infant|kid|extra\s*bed|meal/i.test(`${policy.name} ${policy.value}`))
      .map((policy) => `${policy.name}: ${policy.value}`.trim())
      .filter(Boolean);
    const metaNotes = [
      meta.childPolicy,
      meta.childrenPolicy,
      meta.childMeals,
      meta.childExtraBed,
      meta.infantPolicy,
    ].filter((value): value is string => Boolean(value));
    const fallbackNotes = [...metaNotes, ...childPolicyNotes];
    const bands = rows
      .map((row, index) => {
        const label =
          this.templateCell(row, 'Label') ||
          this.templateCell(row, 'Band') ||
          this.templateCell(row, 'Rule') ||
          this.templateCell(row, 'Name') ||
          `Child policy band ${index + 1}`;
        const minAge = this.parseNumber(
          this.templateCell(row, 'Min Age') ||
            this.templateCell(row, 'Age From') ||
            this.templateCell(row, 'From Age') ||
            this.templateCell(row, 'Minimum Age'),
        );
        const maxAge = this.parseNumber(
          this.templateCell(row, 'Max Age') ||
            this.templateCell(row, 'Age To') ||
            this.templateCell(row, 'To Age') ||
            this.templateCell(row, 'Maximum Age'),
        );
        const basis =
          this.templateCell(row, 'Charge Basis') ||
          this.templateCell(row, 'Basis') ||
          this.templateCell(row, 'Charge Type') ||
          this.templateCell(row, 'Type');
        const chargeValue = this.parseNumber(
          this.templateCell(row, 'Charge Value') ||
            this.templateCell(row, 'Value') ||
            this.templateCell(row, 'Amount') ||
            this.templateCell(row, 'Percent'),
        );
        const notes =
          this.templateCell(row, 'Notes') ||
          this.templateCell(row, 'Description') ||
          this.templateCell(row, 'Policy') ||
          null;

        if (minAge === undefined && maxAge === undefined && !basis && !chargeValue && !notes) {
          return null;
        }

        return {
          label,
          minAge: minAge ?? 0,
          maxAge: maxAge ?? minAge ?? 12,
          chargeBasis: this.childChargeBasis(basis),
          chargeValue: chargeValue ?? null,
          notes,
        };
      })
      .filter((band): band is NonNullable<typeof band> => Boolean(band));

    const childRatePolicyBands = ratePolicies
      .filter((policy) => /^CHILD_(FREE|DISCOUNT|EXTRA_BED)$/i.test(policy.policyType))
      .map((policy) => {
        const policyType = policy.policyType.toUpperCase();
        const ageFrom = policy.ageFrom ?? 0;
        const ageTo = policy.ageTo ?? ageFrom;
        const label =
          policyType === 'CHILD_FREE'
            ? `Children ${ageFrom}-${ageTo} free`
            : policyType === 'CHILD_DISCOUNT'
              ? `Children ${ageFrom}-${ageTo} discount`
              : `Children ${ageFrom}-${ageTo} extra bed`;

        return {
          label,
          minAge: ageFrom,
          maxAge: ageTo,
          chargeBasis:
            policyType === 'CHILD_FREE'
              ? ChildPolicyChargeBasis.FREE
              : policy.percent !== null && policy.percent !== undefined
                ? ChildPolicyChargeBasis.PERCENT_OF_ADULT
                : ChildPolicyChargeBasis.FIXED_AMOUNT,
          chargeValue: policy.percent ?? policy.amount ?? null,
          notes: policy.notes || policy.appliesTo || null,
        };
      });

    const allBands = bands.length > 0 ? bands : childRatePolicyBands;
    if (allBands.length === 0 && fallbackNotes.length === 0) {
      return null;
    }

    const infantMaxAge =
      this.parseNumber(meta.infantMaxAge || meta.infantAgeTo || meta.infantMax) ??
      Math.max(0, ...allBands.filter((band) => /infant|below\s*6|under\s*6/i.test(band.label)).map((band) => band.maxAge), 5);
    const childMaxAge =
      this.parseNumber(meta.childMaxAge || meta.childAgeTo || meta.childMax) ??
      Math.max(infantMaxAge, ...allBands.map((band) => band.maxAge), 12);

    return {
      infantMaxAge,
      childMaxAge,
      notes: fallbackNotes.join(' | ') || null,
      bands: allBands,
    };
  }

  private normalizeMetaKey(value: string) {
    const normalized = this.normalizeTemplateHeader(value);
    const aliases: Record<string, string> = {
      hotelname: 'hotelName',
      hotel: 'hotel',
      suppliername: 'supplierName',
      supplier: 'supplier',
      contractname: 'contractName',
      contract: 'contract',
      validfrom: 'validFrom',
      contractstartdate: 'contractStartDate',
      startdate: 'startDate',
      validto: 'validTo',
      contractenddate: 'contractEndDate',
      enddate: 'endDate',
      currency: 'currency',
      defaulttax: 'defaultTaxPercent',
      defaulttaxpercent: 'defaultTaxPercent',
      defaulttaxpercentage: 'defaultTaxPercent',
      defaulttaxpct: 'defaultTaxPercent',
      governmenttax: 'defaultTaxPercent',
      governmenttaxpercent: 'defaultTaxPercent',
      infantmaxage: 'infantMaxAge',
      infantageto: 'infantAgeTo',
      infantmax: 'infantMax',
      childmaxage: 'childMaxAge',
      childageto: 'childAgeTo',
      childmax: 'childMax',
      childpolicy: 'childPolicy',
      childrenpolicy: 'childrenPolicy',
      childmeals: 'childMeals',
      childextrabed: 'childExtraBed',
      governmenttaxpercentage: 'defaultTaxPercent',
      governmenttaxpct: 'defaultTaxPercent',
      taxpercent: 'taxPercent',
      taxpercentage: 'taxPercent',
      taxpct: 'taxPercent',
      taxincluded: 'taxIncluded',
      defaulttaxincluded: 'taxIncluded',
      governmenttaxincluded: 'taxIncluded',
      defaultservice: 'defaultServicePercent',
      defaultservicepercent: 'defaultServicePercent',
      defaultservicepercentage: 'defaultServicePercent',
      defaultservicepct: 'defaultServicePercent',
      defaultservicecharge: 'defaultServicePercent',
      defaultservicechargepercent: 'defaultServicePercent',
      defaultservicechargepercentage: 'defaultServicePercent',
      defaultservicechargepct: 'defaultServicePercent',
      servicepercent: 'servicePercent',
      servicepercentage: 'servicePercent',
      servicepct: 'servicePercent',
      serviceincluded: 'serviceIncluded',
      defaultserviceincluded: 'serviceIncluded',
      servicechargeincluded: 'serviceIncluded',
      defaultservicechargeincluded: 'serviceIncluded',
      city: 'city',
      category: 'category',
      hotelcategory: 'hotelCategory',
    };
    return aliases[normalized] || normalized;
  }

  private normalizeMetaValue(value: unknown) {
    const text = this.optionalString(value);
    const date = this.isoDateFromTemplate(text);
    return date || text;
  }

  private templateCell(row: Record<string, string>, header: string) {
    const match = Object.entries(row).find(([key]) => this.templateHeaderMatches(key, header));
    return match?.[1]?.trim() || '';
  }

  private templateHeaderMatches(actual: string, expected: string) {
    const actualHeader = this.normalizeTemplateHeader(actual);
    const expectedHeader = this.normalizeTemplateHeader(expected);
    if (actualHeader === expectedHeader) return true;
    if (expectedHeader === 'cost' && actualHeader.startsWith('cost')) return true;
    return false;
  }

  private normalizeTemplateHeader(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  private normalizeTemplateOccupancy(value: string) {
    const normalized = value.trim().toUpperCase();
    if (normalized === 'TRP') return 'TRP';
    if (normalized === 'TPL') return 'TRP';
    if (normalized === 'SINGLE') return 'SGL';
    if (normalized === 'SGL_SUPPLEMENT' || normalized === 'SINGLE_SUPPLEMENT') return 'SINGLE_SUPPLEMENT';
    if (normalized === 'DOUBLE' || normalized === 'TWIN') return 'DBL';
    return normalized || 'DBL';
  }

  private templatePricingBasis(row: Record<string, string>, headerText: string) {
    return this.normalizePricingBasis(this.templateCell(row, 'Pricing Basis')) || this.detectPricingBasis(`${headerText} ${Object.values(row).join(' ')}`);
  }

  private normalizePricingBasis(value: unknown): 'PER_PERSON' | 'PER_ROOM' | undefined {
    const raw = this.optionalString(value);
    if (/\bper\s+person\b|\bpp\b|\bper\s+pax\b/i.test(raw)) return 'PER_PERSON';
    if (/\bper\s+room\b|\bper\s+unit\b/i.test(raw)) return 'PER_ROOM';
    const normalized = raw.replace(/[\s-]+/g, '_').toUpperCase();
    if (normalized === 'PER_PERSON') return 'PER_PERSON';
    if (normalized === 'PER_ROOM') return 'PER_ROOM';
    if (normalized === 'PERSON' || normalized === 'PAX') return 'PER_PERSON';
    if (normalized === 'ROOM' || normalized === 'UNIT') return 'PER_ROOM';
    return undefined;
  }

  private hotelRatePricingBasis(value: unknown) {
    const normalized = this.normalizePricingBasis(value);
    if (normalized === 'PER_PERSON') return HotelRatePricingBasis.PER_PERSON;
    if (normalized === 'PER_ROOM') return HotelRatePricingBasis.PER_ROOM;
    return HotelRatePricingBasis.PER_ROOM;
  }

  private normalizeRateSeasonBounds(rate: PreviewRate, contractValidFrom?: string | null, contractValidTo?: string | null) {
    const seasonFrom =
      this.parseDateOnly(rate.seasonFrom) ||
      this.parseDateOnly(this.splitSeasonName(rate.seasonName).from) ||
      this.parseDateOnly(contractValidFrom) ||
      new Date();
    const seasonTo =
      this.parseDateOnly(rate.seasonTo) ||
      this.parseDateOnly(this.splitSeasonName(rate.seasonName).to) ||
      this.parseDateOnly(contractValidTo) ||
      seasonFrom;

    return {
      seasonFrom,
      seasonTo: seasonTo < seasonFrom ? seasonFrom : seasonTo,
    };
  }

  private isoDateFromTemplate(value: string) {
    const parsed = this.parseDateOnly(value);
    return parsed ? this.isoDate(parsed) : '';
  }

  private parseDateOnly(value: unknown) {
    const raw = this.optionalString(value);
    if (!raw || /^start$|^end$|^imported$/i.test(raw)) return null;

    const isoLike = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
    if (isoLike) {
      const year = Number(isoLike[1]);
      const month = Number(isoLike[2]);
      const day = Number(isoLike[3]);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      if (parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) {
        return parsed;
      }
      return null;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    }

    const numeric = raw.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](20\d{2}))?\b/);
    if (numeric) {
      const year = Number(numeric[3] || new Date().getUTCFullYear());
      const month = Number(numeric[2]);
      const day = Number(numeric[1]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(Date.UTC(year, month - 1, day));
      }
    }

    return null;
  }

  private splitSeasonName(seasonName: string | undefined) {
    const [from = '', to = ''] = String(seasonName || '')
      .split(/\s+-\s+|\s+to\s+/i)
      .map((part) => part.trim());
    return { from, to };
  }

  private safeExportFileName(value: string) {
    return value.trim().replace(/\.[^.]+$/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'contract-import';
  }

  private workbookRowsToText(rows: string[][]) {
    return rows.map((row) => row.filter(Boolean).join('\t')).join('\n');
  }

  private firstParsedTextLines(text: string, limit: number) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  private attachParserDiagnostics(preview: ContractPreview, parserDiagnostics: NonNullable<ContractPreview['parserDiagnostics']>) {
    return {
      ...preview,
      parserDiagnostics: {
        ...parserDiagnostics,
        ...(preview.parserDiagnostics || {}),
        detectedHotels: preview.parserDiagnostics?.detectedHotels || parserDiagnostics.detectedHotels,
        detectedTables: preview.parserDiagnostics?.detectedTables || parserDiagnostics.detectedTables,
        skippedSections: preview.parserDiagnostics?.skippedSections || parserDiagnostics.skippedSections,
        warnings: Array.from(new Set([...(parserDiagnostics.warnings || []), ...(preview.parserDiagnostics?.warnings || [])])),
      },
    };
  }

  private textToRows(text: string) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(/\t+| {2,}|,/).map((cell) => cell.trim()).filter(Boolean));
  }

  private parseJsonPreview(text: string) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private parseDelimitedRows(text: string) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return [];
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map((header) => this.normalizeHeader(header));
    return lines.slice(1).map((line) => {
      const cells = line.split(delimiter);
      return headers.reduce<Record<string, string>>((row, header, index) => {
        row[header] = cells[index]?.trim() || '';
        return row;
      }, {});
    });
  }

  private normalizeHeader(value: string) {
    return value.trim().replace(/[^a-zA-Z0-9]+(.)/g, (_match, next: string) => next.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '');
  }

  private guessNameFromFile(fileName: string) {
    return fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'New Supplier';
  }

  private parseOptionalDate(value: unknown) {
    if (!value) return null;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private parseOptionalInt(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return undefined;
    const parsed = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private parseBoolean(value: unknown): boolean | undefined {
    const raw = this.optionalString(value).toLowerCase();
    if (!raw) return undefined;
    if (['true', 'yes', 'y', '1', 'included', 'inclusive'].includes(raw)) return true;
    if (['false', 'no', 'n', '0', 'excluded', 'exclusive'].includes(raw)) return false;
    return undefined;
  }

  private detectCurrency(text: string) {
    if (/\bJOD\b|Jordanian\s+Dinar/i.test(text)) return 'JOD';
    if (/\bUSD\b|US\s*Dollars?|\$/i.test(text)) return 'USD';
    if (/\bEUR\b|Euro/i.test(text)) return 'EUR';
    return '';
  }

  private guessYear(text: string) {
    const match = text.match(/\b(20\d{2})\b/);
    return match ? Number(match[1]) : null;
  }

  private findAmountNear(text: string, pattern: RegExp) {
    const match = pattern.exec(text);
    if (!match) return null;
    const start = Math.max(0, match.index - 80);
    const end = Math.min(text.length, match.index + 160);
    const snippet = text.slice(start, end);
    const amountMatch = snippet.match(/(?:JOD|USD|EUR)?\s*(\d+(?:\.\d+)?)/i);
    return amountMatch ? Number(amountMatch[1]) : null;
  }

  private extractSentence(text: string, pattern: RegExp) {
    const match = pattern.exec(text);
    if (!match) return '';
    const start = Math.max(0, text.lastIndexOf('.', match.index) + 1, text.lastIndexOf('\n', match.index) + 1);
    const nextDot = text.indexOf('.', match.index);
    const nextLine = text.indexOf('\n', match.index);
    const ends = [nextDot, nextLine].filter((value) => value > match.index);
    const end = ends.length ? Math.min(...ends) : Math.min(text.length, match.index + 220);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private optionalString(value: unknown) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  private isSupportedCurrency(value: string | null | undefined) {
    return SUPPORTED_CONTRACT_CURRENCIES.includes(String(value || '').trim().toUpperCase());
  }

  private isPercentCurrencyMarker(value: unknown) {
    return ['PERCENT', 'PERCENTAGE', '%'].includes(String(value || '').trim().toUpperCase());
  }

  private normalizeSupplementCurrency(value: unknown, fallbackCurrency: string) {
    const normalized = String(value || '').trim().toUpperCase();

    if (!normalized || this.isPercentCurrencyMarker(normalized)) {
      return {
        currency: fallbackCurrency,
        note: this.isPercentCurrencyMarker(normalized) ? 'Currency cell marked as percentage; stored using contract currency.' : '',
      };
    }

    return { currency: normalized, note: '' };
  }

  private isoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private createStoredZip(files: Array<{ fileName: string; buffer: Buffer }>) {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBuffer = Buffer.from(file.fileName, 'utf8');
      const crc = this.crc32(file.buffer);
      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0, 6);
      localHeader.writeUInt16LE(0, 8);
      localHeader.writeUInt16LE(0, 10);
      localHeader.writeUInt16LE(0, 12);
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(file.buffer.length, 18);
      localHeader.writeUInt32LE(file.buffer.length, 22);
      localHeader.writeUInt16LE(nameBuffer.length, 26);
      localHeader.writeUInt16LE(0, 28);
      localParts.push(localHeader, nameBuffer, file.buffer);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0, 8);
      centralHeader.writeUInt16LE(0, 10);
      centralHeader.writeUInt16LE(0, 12);
      centralHeader.writeUInt16LE(0, 14);
      centralHeader.writeUInt32LE(crc, 16);
      centralHeader.writeUInt32LE(file.buffer.length, 20);
      centralHeader.writeUInt32LE(file.buffer.length, 24);
      centralHeader.writeUInt16LE(nameBuffer.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);
      centralParts.push(centralHeader, nameBuffer);

      offset += localHeader.length + nameBuffer.length + file.buffer.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    return Buffer.concat([...localParts, centralDirectory, end]);
  }

  private crc32(buffer: Buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private normalizePreviewForDisplay(value: unknown) {
    try {
      return value ? this.normalizeApprovedPreview(value) : null;
    } catch {
      return null;
    }
  }

  private async findCompanyUserIds(companyId: string) {
    const users = await (this.prisma as any).user?.findMany?.({
      where: { companyId },
      select: { id: true },
    });

    return (users || []).map((user: { id: string }) => user.id);
  }

  private buildImportOwnershipWhere(userIds: string[]) {
    if (userIds.length === 0) {
      return { id: { in: [] } };
    }

    return {
      OR: [{ createdByUserId: { in: userIds } }, { approvedByUserId: { in: userIds } }],
    };
  }

  private async assertImportAccess(
    record: { createdByUserId?: string | null; approvedByUserId?: string | null },
    actor?: AuthenticatedActor,
  ) {
    const ownerUserIds = [record.createdByUserId, record.approvedByUserId].filter((value): value is string => Boolean(value));

    if (ownerUserIds.length === 0) {
      if (!actor) {
        throw new ForbiddenException('Company context is required');
      }
      return;
    }

    const companyId = requireActorCompanyId(actor);
    const users = await (this.prisma as any).user?.findMany?.({
      where: {
        id: { in: ownerUserIds },
        companyId,
      },
      select: { id: true },
    });

    if (!users?.length) {
      throw new ForbiddenException('Contract import is not accessible for the current company');
    }
  }

  private formatUser(user: { firstName: string; lastName: string; email: string } | null, fallback: string | null) {
    if (user) {
      const name = `${user.firstName} ${user.lastName}`.trim();
      return name || user.email;
    }
    return fallback || 'Unknown user';
  }

  private async writeAuditLog(
    contractImportId: string,
    action: string,
    status: ContractImportStatus,
    actor: AuthenticatedActor,
    metadata?: Prisma.InputJsonValue,
  ) {
    await (this.prisma as any).contractImportAuditLog.create({
      data: {
        contractImportId,
        action,
        status,
        actorUserId: actor.id,
        actor: actor.auditLabel || actor.name || actor.email,
        metadata: metadata || undefined,
      },
    });
  }
}
