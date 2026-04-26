import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ChildPolicyChargeBasis,
  ContractImportStatus,
  ContractImportType,
  HotelCancellationDeadlineUnit,
  HotelCancellationPenaltyType,
  HotelContractChargeBasis,
  HotelContractSupplementType,
  HotelMealPlan,
  HotelRatePricingMode,
  Prisma,
} from '@prisma/client';
import { readFileSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedActor } from '../auth/auth.types';

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

type PreviewRate = {
  roomType?: string;
  serviceName?: string;
  routeName?: string;
  occupancyType?: string;
  mealPlan?: string;
  seasonName?: string;
  cost?: number;
  currency?: string;
  uncertain?: boolean;
  notes?: string;
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
    amount?: number | null;
    currency?: string | null;
    isMandatory?: boolean;
    notes?: string;
    uncertain?: boolean;
  }>;
  policies: Array<{ name: string; value: string; uncertain?: boolean }>;
  cancellationPolicy?: {
    summary?: string | null;
    notes?: string | null;
    noShowPenaltyType?: string | null;
    noShowPenaltyValue?: number | null;
    rules?: Array<{
      windowFromValue: number;
      windowToValue: number;
      deadlineUnit: string;
      penaltyType: string;
      penaltyValue?: number | null;
      notes?: string | null;
    }>;
  } | null;
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
  hotelName?: string;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  currency?: string;
  serviceCharge?: { name: string; value: number; included: boolean; uncertain?: boolean } | null;
  warnings?: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }>;
  parserDiagnostics?: {
    source: 'workbook' | 'text';
    rowCount: number;
    parsedTextLineCount: number;
    first20Lines: string[];
  };
  missingFields: string[];
  uncertainFields: string[];
};

@Injectable()
export class ContractImportsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const records: any[] = await (this.prisma as any).contractImport.findMany({
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
    console.log('[contract-imports/analyze] mapped extractedJson', JSON.stringify(preview, null, 2));
    const warnings = [...this.buildWarnings(preview), ...(await this.buildPersistenceWarnings(preview))];
    preview.warnings = warnings;
    console.log('[contract-imports/analyze] extractedJson summary', {
      ratesLength: preview.rates.length,
      supplementsLength: preview.supplements.length,
      policiesLength: preview.policies.length,
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
    return record;
  }

  async findOne(id: string) {
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
    return record;
  }

  async approve(id: string, approvedData: unknown, actor: AuthenticatedActor) {
    const record = await this.findOne(id);
    if (
      record.status !== ContractImportStatus.ANALYZED &&
      record.status !== ContractImportStatus.APPROVED &&
      record.status !== ContractImportStatus.FAILED
    ) {
      throw new BadRequestException('Only analyzed imports can be approved');
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
    await this.writeAuditLog(id, 'IMPORTED', ContractImportStatus.IMPORTED, actor, {
      importedEntityId,
      warnings: warnings.length,
    });
    return updated;
  }

  async reimport(id: string, actor: AuthenticatedActor) {
    const record = await this.findOne(id);
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
      source: workbookRows.length > 0 ? 'workbook' : 'text',
      rowCount: workbookRows.length,
      parsedTextLineCount: text.split(/\r?\n/).filter((line) => line.trim()).length,
      first20Lines: parsedTextLines,
    };
    console.log('[contract-imports/analyze] raw parsed text', {
      fileName: input.fileName,
      source: workbookRows.length > 0 ? 'workbook' : 'text',
      rowCount: workbookRows.length,
      textPreview: text.slice(0, 8000),
    });
    console.log('[contract-imports/analyze] first 20 parsed text lines', parsedTextLines);
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

  private async importApprovedPreview(preview: ContractPreview, record: { supplierId: string | null; sourceFileName: string; sourceFilePath: string }) {
    const supplier = await this.ensureSupplier(record.supplierId, preview.supplier.name, preview.contractType);

    if (preview.contractType === ContractImportType.HOTEL) {
      return this.importHotelPreview(preview, supplier.id, record.sourceFileName, record.sourceFilePath);
    }

    return this.importServicePreview(preview, supplier.id, record.sourceFileName);
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
  }): ContractPreview | null {
    const text = input.text;
    const lowerText = text.toLowerCase();
    const isGrandHyatt = lowerText.includes('grand hyatt') || input.fileName.toLowerCase().includes('grand-hyatt');
    const year = input.contractYear || this.guessYear(text) || new Date().getFullYear();
    const supplierName = input.supplierName || (isGrandHyatt ? 'Grand Hyatt Amman' : this.guessNameFromFile(input.fileName));
    const hotelName = isGrandHyatt ? 'Grand Hyatt Amman' : supplierName;
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
      if (numbers.length >= 2 || occupancyLabels.includes('single') || occupancyLabels.includes('double') || /\bsgl\b|\bdbl\b/i.test(occupancyLabels)) {
        rates.push({
          roomType: roomName,
          occupancyType: 'SGL',
          mealPlan,
          seasonName: currentSeasonName,
          cost: numbers[0],
          currency,
        });
        if (numbers[1]) {
          rates.push({
            roomType: roomName,
            occupancyType: 'DBL',
            mealPlan,
            seasonName: currentSeasonName,
            cost: numbers[1],
            currency,
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
          uncertain: true,
          notes: 'Occupancy was not explicit in the source row.',
        });
      }
    }

    return this.dedupeRates(rates);
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
    ].filter((row) => row.length > 0);
    let activeHeader: Array<{ occupancyType: string; index: number; amountOffset: number }> = [];
    let activeSplitPattern: RegExp = /\s+/;

    for (const rawCells of tableLines) {
      const line = rawCells.join(' ').trim();
      const header = this.detectRateHeader(line);
      if (header.columns.length > 0) {
        console.log('TABLE HEADER DETECTED:', line);
        activeHeader = header.columns;
        activeSplitPattern = header.splitPattern;
        continue;
      }

      const strictCells = line
        .split(activeSplitPattern)
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (strictCells.length < 2) {
        rates.push(...this.extractFlattenedTableRates(line, fallbackCurrency));
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
          seasonName: 'Imported',
          cost: amount.amount,
          currency: amount.currency || fallbackCurrency,
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
    ].filter((row) => row.length > 0);
    let headerDetected = false;

    for (const rawCells of tableLines) {
      const line = rawCells.join(' ').trim();
      if (this.isSeasonMealPlanHeader(line)) {
        console.log('SEASON MEAL PLAN HEADER DETECTED:', line);
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
      });
      rates.push({
        roomType: 'Standard',
        occupancyType: 'DBL',
        mealPlan: 'BB',
        seasonName: parsed.seasonName,
        cost: parsed.bb,
        currency: parsed.currency,
      });
      if (typeof parsed.singleSupplement === 'number') {
        rates.push({
          roomType: 'Standard',
          occupancyType: 'SGL',
          mealPlan: 'BB',
          seasonName: parsed.seasonName,
          cost: parsed.bb + parsed.singleSupplement,
          currency: parsed.currency,
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

  private extractFlattenedTableRates(line: string, fallbackCurrency: string): PreviewRate[] {
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
      seasonName: 'Imported',
      cost,
      currency: fallbackCurrency,
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

      if (amounts.length >= 2 && !explicitOccupancy) {
        rates.push({
          roomType: roomName,
          occupancyType: 'SGL',
          mealPlan,
          seasonName,
          cost: amounts[0].amount,
          currency: amounts[0].currency || fallbackCurrency,
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
        uncertain: !explicitOccupancy,
        notes: explicitOccupancy ? 'Extracted from text line.' : 'Occupancy defaulted to DBL from table-like text line.',
      });
    }

    return this.dedupeRates(rates);
  }

  private detectRoomName(line: string) {
    const roomPattern =
      /\b((?:standard|deluxe|superior|executive|classic|premium|family|grand|twin|double|triple)\s+(?:room|suite)|(?:junior|executive|grand|family)\s+suite|suite|twin|double|triple)\b/i;
    const match = line.match(roomPattern);
    if (!match) return '';
    return match[1].replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  private normalizeRoomName(value: string) {
    const cleaned = value
      .replace(/\b(room|type|category|rates?|rate|price|prices?|nett|net|jod|usd|eur)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || /^\d/.test(cleaned)) return '';

    const detected = this.detectRoomName(cleaned);
    if (detected) return detected;

    if (/\b(standard|deluxe|suite|twin|double|triple|superior|executive|classic|premium|family|grand)\b/i.test(cleaned)) {
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
        isMandatory: false,
        notes: 'Extracted dinner or half-board supplement.',
      });
    }

    return supplements;
  }

  private extractCancellationPolicy(text: string, isGrandHyatt: boolean): ContractPreview['cancellationPolicy'] {
    if (!/cancel|no[\s-]?show/i.test(text) && !isGrandHyatt) return null;
    const daysMatch = text.match(/(\d+)\s*days?.{0,80}(?:one|1)\s*night/i);
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

  private async importHotelPreview(preview: ContractPreview, supplierId: string, sourceFileName: string, sourceFilePath: string) {
    if (!preview.hotel?.name || !preview.contract.validFrom || !preview.contract.validTo) {
      throw new BadRequestException('Hotel imports require hotel name, validFrom, and validTo before approval');
    }

    const hotel = await this.ensureHotel(preview, supplierId);
    const existingActive = await this.prisma.hotelContract.findFirst({
      where: {
        hotelId: hotel.id,
        name: { equals: preview.contract.name, mode: 'insensitive' },
      },
    });

    const contractData = {
      hotelId: hotel.id,
      name: preview.contract.name.trim(),
      validFrom: new Date(preview.contract.validFrom),
      validTo: new Date(preview.contract.validTo),
      currency: preview.contract.currency.trim().toUpperCase(),
    };
    const contract = existingActive
      ? await this.prisma.hotelContract.update({ where: { id: existingActive.id }, data: contractData })
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
      const taxPercent = preview.taxes.find((tax) => /tax/i.test(tax.name))?.value || 0;
      const taxIncluded = preview.taxes.find((tax) => /tax/i.test(tax.name))?.included || false;
      const serviceChargePercent = preview.taxes.find((tax) => /service/i.test(tax.name))?.value || 0;
      const serviceChargeIncluded = preview.taxes.find((tax) => /service/i.test(tax.name))?.included || false;
      const existingRate = await this.prisma.hotelRate.findFirst({
        where: {
          contractId: contract.id,
          roomCategoryId,
          seasonName: rate.seasonName || 'Imported',
          occupancyType: this.hotelOccupancy(rate.occupancyType),
          mealPlan: this.hotelMealPlan(rate.mealPlan),
        },
      });
      const rateData = {
        contractId: contract.id,
        roomCategoryId,
        seasonId: season.id,
        seasonName: rate.seasonName || 'Imported',
        occupancyType: this.hotelOccupancy(rate.occupancyType),
        mealPlan: this.hotelMealPlan(rate.mealPlan),
        pricingMode: HotelRatePricingMode.PER_ROOM_PER_NIGHT,
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
    const existing = await this.prisma.hotel.findFirst({
      where: {
        supplierId,
        name: { equals: name, mode: 'insensitive' },
      },
    });
    const data = {
      name,
      city: preview.hotel?.city?.trim() || 'Amman',
      category: preview.hotel?.category?.trim() || 'Unclassified',
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
      notes: supplement.notes || supplement.name || null,
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
            windowFromValue: rule.windowFromValue,
            windowToValue: rule.windowToValue,
            deadlineUnit: this.cancellationDeadlineUnit(rule.deadlineUnit),
            penaltyType: this.cancellationPenaltyType(rule.penaltyType) || HotelCancellationPenaltyType.NIGHTS,
            penaltyValue: rule.penaltyValue ?? null,
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
            windowFromValue: rule.windowFromValue,
            windowToValue: rule.windowToValue,
            deadlineUnit: this.cancellationDeadlineUnit(rule.deadlineUnit),
            penaltyType: this.cancellationPenaltyType(rule.penaltyType) || HotelCancellationPenaltyType.NIGHTS,
            penaltyValue: rule.penaltyValue ?? null,
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
    const warnings: Array<{ severity: 'blocker' | 'warning'; field: string; message: string }> = [];
    if (!preview.supplier.name?.trim()) {
      warnings.push({ severity: 'blocker', field: 'supplier.name', message: 'Supplier name is required before approval' });
    }
    if (!preview.contract.validFrom) {
      warnings.push({ severity: 'blocker', field: 'contract.validFrom', message: 'Contract valid from date is required' });
    }
    if (!preview.contract.validTo) {
      warnings.push({ severity: 'blocker', field: 'contract.validTo', message: 'Contract valid to date is required' });
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
    for (const field of preview.missingFields || []) {
      warnings.push({ severity: 'warning', field, message: `${field} was not extracted from the uploaded contract` });
    }
    for (const field of preview.uncertainFields || []) {
      warnings.push({ severity: 'warning', field, message: `${field} needs review` });
    }
    return warnings;
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
          cost: this.parseNumber(rate.cost),
          currency: this.optionalString(rate.currency) || value.contract?.currency || 'JOD',
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
      supplements: Array.isArray(value.supplements) ? value.supplements : [],
      policies: Array.isArray(value.policies) ? value.policies : [],
      cancellationPolicy: value.cancellationPolicy || null,
      childPolicy: value.childPolicy || null,
      hotelName: this.optionalString(value.hotelName || value.hotel?.name),
      contractStartDate: this.optionalString(value.contractStartDate || value.contract?.validFrom) || null,
      contractEndDate: this.optionalString(value.contractEndDate || value.contract?.validTo) || null,
      currency: this.optionalString(value.currency || value.contract?.currency) || 'JOD',
      serviceCharge: value.serviceCharge || null,
      warnings: Array.isArray(value.warnings) ? value.warnings : [],
      missingFields: Array.isArray(value.missingFields) ? value.missingFields : [],
      uncertainFields: Array.isArray(value.uncertainFields) ? value.uncertainFields : [],
    };
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
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized.includes('BREAKFAST')) return HotelContractSupplementType.EXTRA_BREAKFAST;
    if (normalized.includes('LUNCH')) return HotelContractSupplementType.EXTRA_LUNCH;
    if (normalized.includes('DINNER') || normalized.includes('HALF')) return HotelContractSupplementType.EXTRA_DINNER;
    if (normalized.includes('GALA')) return HotelContractSupplementType.GALA_DINNER;
    return HotelContractSupplementType.EXTRA_BED;
  }

  private hotelChargeBasis(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'PER_PERSON') return HotelContractChargeBasis.PER_PERSON;
    if (normalized === 'PER_ROOM') return HotelContractChargeBasis.PER_ROOM;
    if (normalized === 'PER_STAY') return HotelContractChargeBasis.PER_STAY;
    return HotelContractChargeBasis.PER_NIGHT;
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
        .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (readableUtf8.length > 80 && !readableUtf8.startsWith('%PDF')) {
        return readableUtf8.slice(0, 1024 * 1024);
      }

      const latinText = buffer.toString('latin1');
      const pdfStrings = Array.from(latinText.matchAll(/\(([^()]{2,250})\)/g))
        .map((match) => match[1].replace(/\\([()\\])/g, '$1'))
        .filter((value) => /[a-zA-Z]{2,}/.test(value));
      const extractedPdfText = pdfStrings.join('\n').replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ');
      return (extractedPdfText || readableUtf8).slice(0, 1024 * 1024);
    } catch {
      return '';
    }
  }

  private readWorkbookRows(filePath: string, fileName: string): string[][] {
    if (!/\.(xlsx|xls|xlsm)$/i.test(fileName)) {
      return [];
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const xlsx = require('xlsx');
      const workbook = xlsx.readFile(filePath, { cellDates: true });
      const rows: string[][] = [];

      for (const sheetName of workbook.SheetNames || []) {
        const matrix = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          defval: '',
          blankrows: false,
          raw: false,
        }) as unknown[][];
        rows.push([`SHEET: ${sheetName}`]);
        for (const row of matrix) {
          rows.push(row.map((cell) => String(cell ?? '').trim()));
        }
      }

      return rows;
    } catch (error) {
      console.warn('[contract-imports/analyze] Could not parse workbook', error);
      return [];
    }
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
      parserDiagnostics,
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

  private isoDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private normalizePreviewForDisplay(value: unknown) {
    try {
      return value ? this.normalizeApprovedPreview(value) : null;
    } catch {
      return null;
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
