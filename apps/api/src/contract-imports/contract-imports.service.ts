import { BadRequestException, Injectable } from '@nestjs/common';
import { ContractImportStatus, ContractImportType, Prisma } from '@prisma/client';
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
  rates: PreviewRate[];
  taxes: Array<{ name: string; value: number; included: boolean; uncertain?: boolean }>;
  supplements: Array<{ name: string; amount?: number | null; notes?: string; uncertain?: boolean }>;
  policies: Array<{ name: string; value: string; uncertain?: boolean }>;
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
    const warnings = [...this.buildWarnings(preview), ...(await this.buildPersistenceWarnings(preview))];

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
    const text = this.readTextPreview(input.filePath);
    const parsedJson = this.parseJsonPreview(text);
    if (parsedJson) {
      return this.normalizeApprovedPreview({
        ...parsedJson,
        contractType: parsedJson.contractType || input.contractType,
      });
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

    return {
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
    };
  }

  private async importApprovedPreview(preview: ContractPreview, record: { supplierId: string | null; sourceFileName: string; sourceFilePath: string }) {
    const supplier = await this.ensureSupplier(record.supplierId, preview.supplier.name, preview.contractType);

    if (preview.contractType === ContractImportType.HOTEL) {
      return this.importHotelPreview(preview, supplier.id, record.sourceFileName, record.sourceFilePath);
    }

    return this.importServicePreview(preview, supplier.id, record.sourceFileName);
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

    for (const rate of preview.rates) {
      if (!rate.cost) continue;
      const roomCategory = await this.ensureRoomCategory(hotel.id, rate.roomType || 'Standard');
      const existingRate = await this.prisma.hotelRate.findFirst({
        where: {
          contractId: contract.id,
          roomCategoryId: roomCategory.id,
          seasonName: rate.seasonName || 'Imported',
          occupancyType: this.hotelOccupancy(rate.occupancyType),
          mealPlan: this.hotelMealPlan(rate.mealPlan),
        },
      });
      const rateData = {
        contractId: contract.id,
        roomCategoryId: roomCategory.id,
        seasonName: rate.seasonName || 'Imported',
        occupancyType: this.hotelOccupancy(rate.occupancyType),
        mealPlan: this.hotelMealPlan(rate.mealPlan),
        pricingMode: 'PER_ROOM_PER_NIGHT' as any,
        currency: rate.currency || preview.contract.currency,
        cost: rate.cost,
        costBaseAmount: rate.cost,
        costCurrency: rate.currency || preview.contract.currency,
      };

      if (existingRate) {
        await this.prisma.hotelRate.update({ where: { id: existingRate.id }, data: rateData });
      } else {
        await this.prisma.hotelRate.create({ data: rateData });
      }
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

  private async ensureRoomCategory(hotelId: string, name: string) {
    const existing = await this.prisma.hotelRoomCategory.findFirst({
      where: { hotelId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return existing;
    return this.prisma.hotelRoomCategory.create({
      data: {
        hotelId,
        name,
        isActive: true,
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
      warnings.push({ severity: 'warning', field: 'rates', message: 'No rates were extracted. Add rates before approval if pricing should be imported.' });
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
      rates,
      taxes: Array.isArray(value.taxes) ? value.taxes : [],
      supplements: Array.isArray(value.supplements) ? value.supplements : [],
      policies: Array.isArray(value.policies) ? value.policies : [],
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
    return ['SGL', 'DBL', 'TPL'].includes(normalized) ? (normalized as any) : 'DBL';
  }

  private hotelMealPlan(value: unknown) {
    const normalized = String(value || '').trim().toUpperCase();
    return ['RO', 'BB', 'HB', 'FB', 'AI'].includes(normalized) ? (normalized as any) : 'BB';
  }

  private readTextPreview(filePath: string) {
    try {
      return readFileSync(filePath, 'utf8').slice(0, 1024 * 1024);
    } catch {
      return '';
    }
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
