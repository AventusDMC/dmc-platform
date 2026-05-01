import { BadRequestException, Injectable } from '@nestjs/common';
import { blockDelete, ensureValidNumber, requireTrimmedString, throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { buildRouteNormalizedKey, formatRouteName } from '../routes/route-normalization';
import * as XLSX from 'xlsx';

type CreateVehicleRateInput = {
  vehicleId: string;
  serviceTypeId: string;
  supplierId?: string | null;
  routeId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  minPax: number;
  maxPax: number;
  price: number;
  currency: string;
  active?: boolean;
  validFrom: Date;
  validTo: Date;
};

type UpdateVehicleRateInput = {
  vehicleId?: string;
  serviceTypeId?: string;
  supplierId?: string | null;
  routeId?: string | null;
  fromPlaceId?: string | null;
  toPlaceId?: string | null;
  routeName?: string;
  minPax?: number;
  maxPax?: number;
  price?: number;
  currency?: string;
  active?: boolean;
  validFrom?: Date;
  validTo?: Date;
};

type VehicleRatePricingSyncData = {
  supplierId: string | null;
  serviceTypeId: string;
  routeId: string | null;
  vehicleId: string;
  maxPax: number;
  price: number;
  currency: string;
  active: boolean;
};

type TransportContractImportMode = 'preview' | 'import';
type TransportContractMergeMode = 'keep' | 'merge';
type TransportServiceClassification = 'ROUTE_TRANSFER' | 'FULL_DAY' | 'HALF_DAY' | 'DAILY_PACKAGE' | 'ADD_ON';
type TransportContractImportOptions = {
  contractMergeMode?: TransportContractMergeMode;
  contractNameOverride?: string;
};

type TransportContractImportRow = {
  supplierName: string;
  supplierContactName: string;
  supplierEmail: string;
  supplierPhone: string;
  supplierWebsite: string;
  contractName: string;
  contractValidFrom: string;
  contractValidTo: string;
  country: string;
  serviceName: string;
  routeName: string;
  origin: string;
  destination: string;
  vehicleType: string;
  maxPaxPerUnit: string;
  pricingMode: string;
  cost: string;
  currency: string;
  active: string;
  notes: string;
};

type NormalizedTransportContractImportRow = {
  supplierName: string;
  supplierContactName: string;
  supplierEmail: string;
  supplierPhone: string;
  supplierWebsite: string;
  contractName: string;
  contractValidFrom: Date;
  contractValidTo: Date;
  country: string;
  serviceName: string;
  routeName: string;
  origin: string;
  destination: string;
  vehicleType: string;
  maxPaxPerUnit: number;
  pricingMode: 'PER_GROUP';
  cost: number;
  currency: string;
  active: boolean;
  notes: string;
};

type ParsedTransportImportRow = {
  rowNumber: number;
  normalized: NormalizedTransportContractImportRow;
};

const TRANSPORT_CONTRACT_IMPORT_COLUMNS = [
  'supplierName',
  'supplierContactName',
  'supplierEmail',
  'supplierPhone',
  'supplierWebsite',
  'contractName',
  'contractValidFrom',
  'contractValidTo',
  'country',
  'serviceName',
  'routeName',
  'origin',
  'destination',
  'vehicleType',
  'maxPaxPerUnit',
  'pricingMode',
  'cost',
  'currency',
  'active',
  'notes',
] as const;

const REQUIRED_TRANSPORT_CONTRACT_IMPORT_COLUMNS = [
  'supplierName',
  'contractName',
  'contractValidFrom',
  'contractValidTo',
  'country',
  'serviceName',
  'origin',
  'destination',
  'vehicleType',
  'maxPaxPerUnit',
  'pricingMode',
  'cost',
  'currency',
  'active',
] as const;

function normalizeImportKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeImportText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeImportName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function formatImportDate(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeCode(value: string) {
  return normalizeImportName(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'TRANSPORT';
}

function parseImportBoolean(value: string) {
  const normalized = value.trim().toLowerCase();

  return !['false', 'no', 'n', '0', 'inactive'].includes(normalized);
}

function isEmptyImportRow(row: Record<string, unknown>) {
  return TRANSPORT_CONTRACT_IMPORT_COLUMNS.every((column) => !normalizeImportText(row[column]));
}

function buildRouteName(fromPlaceName: string, toPlaceName: string) {
  return `${fromPlaceName.trim()} → ${toPlaceName.trim()}`;
}

function classifyTransportServiceName(serviceName: string): TransportServiceClassification {
  const normalized = serviceName.trim().toLowerCase();

  if (/\b(daily\s*fd|daily\s+full\s+day|daily\s+package)\b/.test(normalized)) return 'DAILY_PACKAGE';
  if (/\b(full\s+day|fd)\b/.test(normalized)) return 'FULL_DAY';
  if (/\b(half\s+day|hd)\b/.test(normalized)) return 'HALF_DAY';
  if (/\b(driver\s+overnight|stationary|waiting|daily\s+charge)\b/.test(normalized)) return 'ADD_ON';
  if (/\b(airport\s+transfer|transfer|pick[-\s]?up|drop[-\s]?off)\b/.test(normalized)) return 'ROUTE_TRANSFER';

  return 'ROUTE_TRANSFER';
}

function formatExportDate(value: Date | string) {
  return formatImportDate(value);
}

function sanitizeExportFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 70) || 'transport_contract'
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTransportExportFileName(supplierName: string, contractName: string, currency: string) {
  const normalizedCurrency = currency.trim().toUpperCase();
  const supplierPart = sanitizeExportFileName(supplierName).slice(0, 40);
  const supplierPattern = new RegExp(`\\b${escapeRegExp(supplierName.trim())}\\b`, 'ig');
  const currencyPattern = new RegExp(`\\b${escapeRegExp(normalizedCurrency)}\\b`, 'ig');
  const contractPart = sanitizeExportFileName(
    contractName
      .replace(supplierPattern, ' ')
      .replace(new RegExp(`\\brates?\\s+in\\s+${escapeRegExp(normalizedCurrency)}\\b`, 'ig'), ' ')
      .replace(new RegExp(`\\bin\\s+${escapeRegExp(normalizedCurrency)}\\b`, 'ig'), ' ')
      .replace(currencyPattern, ' ')
      .replace(/\brates?\b/gi, ' ')
      .replace(/\btransport\s+contract\b/gi, 'Transport')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, 70);

  return `${supplierPart}_${contractPart || 'Transport'}_${sanitizeExportFileName(normalizedCurrency)}.xlsx`;
}

function getExportSupplierName(rate: { supplier?: { name?: string | null } | null }) {
  return rate.supplier?.name?.trim() || 'Unknown supplier';
}

function getExportRouteCategory(rates: Array<{ serviceType: { classification?: TransportServiceClassification | string | null }; vehicle: { name: string }; routeName: string }>) {
  const classifications = new Set(rates.map((rate) => rate.serviceType.classification || 'ROUTE_TRANSFER'));

  if (classifications.size > 1) {
    return 'Transport contract';
  }

  if (classifications.size === 1 && classifications.has('ADD_ON')) {
    return 'Add-ons';
  }

  if (classifications.has('FULL_DAY') || classifications.has('DAILY_PACKAGE')) {
    return 'Full-day packages';
  }

  const joinedText = rates.map((rate) => `${rate.vehicle.name} ${rate.routeName}`).join(' ').toLowerCase();

  if (joinedText.includes('bus') || joinedText.includes('coach')) {
    return 'Buses';
  }

  return 'Transport';
}

function getExportRateCardKey(rate: {
  supplier?: { name?: string | null } | null;
  serviceType: { classification?: TransportServiceClassification | string | null };
  vehicle: { name: string };
  routeName: string;
  currency: string;
  validFrom: Date;
  validTo: Date;
}) {
  return [
    getExportSupplierName(rate).trim().toLowerCase() || 'unassigned supplier',
    rate.currency,
    formatExportDate(rate.validFrom),
    formatExportDate(rate.validTo),
  ].join('|');
}

@Injectable()
export class VehicleRatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.vehicleRate.findMany({
      include: {
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        toPlace: true,
      },
      orderBy: [
        {
          routeName: 'asc',
        },
        {
          minPax: 'asc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const vehicleRate = await this.prisma.vehicleRate.findUnique({
      where: { id },
      include: {
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
        toPlace: true,
        _count: {
          select: {
            quoteItems: true,
          },
        },
      },
    });

    return throwIfNotFound(vehicleRate, 'Vehicle rate');
  }

  async create(data: CreateVehicleRateInput) {
    if (data.minPax > data.maxPax) {
      throw new BadRequestException('minPax cannot be greater than maxPax');
    }

    if (data.validFrom > data.validTo) {
      throw new BadRequestException('validFrom cannot be after validTo');
    }

    const [vehicle, serviceType, route, fromPlace, toPlace, supplier] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: data.vehicleId },
      }),
      this.prisma.transportServiceType.findUnique({
        where: { id: data.serviceTypeId },
      }),
      data.routeId
        ? this.prisma.route.findUnique({
            where: { id: data.routeId },
            include: {
              fromPlace: {
                select: { id: true, name: true },
              },
              toPlace: {
                select: { id: true, name: true },
              },
            },
          })
        : Promise.resolve(null),
      data.fromPlaceId
        ? this.prisma.place.findUnique({
            where: { id: data.fromPlaceId },
          })
        : Promise.resolve(null),
      data.toPlaceId
        ? this.prisma.place.findUnique({
            where: { id: data.toPlaceId },
          })
        : Promise.resolve(null),
      data.supplierId
        ? this.prisma.supplier.findUnique({
            where: { id: data.supplierId },
          })
        : Promise.resolve(null),
    ]);

    if (!vehicle) {
      throw new BadRequestException('Vehicle not found');
    }

    if (!serviceType) {
      throw new BadRequestException('Transport service type not found');
    }

    if (data.supplierId && !supplier) {
      throw new BadRequestException('Supplier not found');
    }

    const routeData = this.resolveRouteFields(
      {
        routeId: data.routeId,
        fromPlaceId: data.fromPlaceId,
        toPlaceId: data.toPlaceId,
        routeName: data.routeName,
      },
      route,
      fromPlace,
      toPlace,
    );

    const vehicleRate = await this.prisma.vehicleRate.create({
      data: {
        vehicleId: data.vehicleId,
        serviceTypeId: data.serviceTypeId,
        supplierId: data.supplierId ?? null,
        routeId: routeData.routeId,
        fromPlaceId: routeData.fromPlaceId,
        toPlaceId: routeData.toPlaceId,
        routeName: routeData.routeName,
        minPax: data.minPax,
        maxPax: data.maxPax,
        price: ensureValidNumber(data.price, 'price', { min: 0 }),
        currency: data.currency.trim().toUpperCase(),
        active: data.active ?? true,
        validFrom: data.validFrom,
        validTo: data.validTo,
      },
      include: {
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        supplier: true,
        toPlace: true,
      },
    });

    await this.syncCapacityPricingRuleForVehicleRate(this.toVehicleRatePricingSyncData(vehicleRate));

    return vehicleRate;
  }

  async duplicate(id: string) {
    const existing = await this.findOne(id);

    return this.create({
      vehicleId: existing.vehicleId,
      serviceTypeId: existing.serviceTypeId,
      supplierId: existing.supplierId,
      routeId: existing.routeId,
      fromPlaceId: existing.fromPlaceId,
      toPlaceId: existing.toPlaceId,
      routeName: existing.routeName,
      minPax: existing.minPax,
      maxPax: existing.maxPax,
      price: existing.price,
      currency: existing.currency,
      active: existing.active,
      validFrom: existing.validFrom,
      validTo: existing.validTo,
    });
  }

  async update(id: string, data: UpdateVehicleRateInput) {
    const existing = await this.findOne(id);
    const previousSyncData = this.toVehicleRatePricingSyncData(existing);
    const vehicleId = data.vehicleId ?? existing.vehicleId;
    const serviceTypeId = data.serviceTypeId ?? existing.serviceTypeId;
    const supplierId = data.supplierId === undefined ? existing.supplierId : data.supplierId;
    const routeId = data.routeId === undefined ? existing.routeId : data.routeId;
    const minPax = data.minPax ?? existing.minPax;
    const maxPax = data.maxPax ?? existing.maxPax;
    const validFrom = data.validFrom ?? existing.validFrom;
    const validTo = data.validTo ?? existing.validTo;
    const fromPlaceId = data.fromPlaceId === undefined ? existing.fromPlaceId : data.fromPlaceId;
    const toPlaceId = data.toPlaceId === undefined ? existing.toPlaceId : data.toPlaceId;
    const active = data.active ?? existing.active;

    if (minPax > maxPax) {
      throw new BadRequestException('minPax cannot be greater than maxPax');
    }

    if (validFrom > validTo) {
      throw new BadRequestException('validFrom cannot be after validTo');
    }

    const [vehicle, serviceType, route, fromPlace, toPlace, supplier] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
      }),
      this.prisma.transportServiceType.findUnique({
        where: { id: serviceTypeId },
      }),
      routeId
        ? this.prisma.route.findUnique({
            where: { id: routeId },
            include: {
              fromPlace: {
                select: { id: true, name: true },
              },
              toPlace: {
                select: { id: true, name: true },
              },
            },
          })
        : Promise.resolve(null),
      fromPlaceId
        ? this.prisma.place.findUnique({
            where: { id: fromPlaceId },
          })
        : Promise.resolve(null),
      toPlaceId
        ? this.prisma.place.findUnique({
            where: { id: toPlaceId },
          })
        : Promise.resolve(null),
      supplierId
        ? this.prisma.supplier.findUnique({
            where: { id: supplierId },
          })
        : Promise.resolve(null),
    ]);

    if (!vehicle) {
      throw new BadRequestException('Vehicle not found');
    }

    if (!serviceType) {
      throw new BadRequestException('Transport service type not found');
    }

    if (supplierId && !supplier) {
      throw new BadRequestException('Supplier not found');
    }

    const routeData = this.resolveRouteFields(
      {
        routeId,
        fromPlaceId,
        toPlaceId,
        routeName: data.routeName ?? existing.routeName,
      },
      route,
      fromPlace,
      toPlace,
    );

    const vehicleRate = await this.prisma.vehicleRate.update({
      where: { id },
      data: {
        vehicleId,
        serviceTypeId,
        supplierId,
        routeId: routeData.routeId,
        fromPlaceId: routeData.fromPlaceId,
        toPlaceId: routeData.toPlaceId,
        routeName: routeData.routeName,
        minPax,
        maxPax,
        price: data.price === undefined ? undefined : ensureValidNumber(data.price, 'price', { min: 0 }),
        currency: data.currency === undefined ? undefined : data.currency.trim().toUpperCase(),
        active,
        validFrom,
        validTo,
      },
      include: {
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        supplier: true,
        toPlace: true,
      },
    });

    await this.syncCapacityPricingRuleForVehicleRate(this.toVehicleRatePricingSyncData(vehicleRate), previousSyncData);

    return vehicleRate;
  }

  async remove(id: string) {
    const vehicleRate = await this.findOne(id);

    blockDelete('vehicle rate', 'quote items', vehicleRate._count.quoteItems);

    await this.deactivateCapacityPricingRulesForVehicleRate(this.toVehicleRatePricingSyncData(vehicleRate));

    return this.prisma.vehicleRate.delete({
      where: { id },
    });
  }

  getTransportContractImportTemplate() {
    const rows = [
      {
        supplierName: 'AlphaBus',
        supplierContactName: 'Operations Team',
        supplierEmail: 'ops@alphabus.example',
        supplierPhone: '+962000000000',
        supplierWebsite: 'https://alphabus.example',
        contractName: 'AlphaBus 2026 Transport Contract',
        contractValidFrom: '2026-01-01',
        contractValidTo: '2026-12-31',
        country: 'Jordan',
        serviceName: 'Intercity Transfer',
        routeName: 'Amman City Center -> Petra Visitor Center',
        origin: 'Amman City Center',
        destination: 'Petra Visitor Center',
        vehicleType: 'Coach',
        maxPaxPerUnit: 45,
        pricingMode: 'PER_GROUP',
        cost: 350,
        currency: 'USD',
        active: 'TRUE',
        notes: 'One row per route and vehicle capacity.',
      },
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...TRANSPORT_CONTRACT_IMPORT_COLUMNS] });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transport Rates');

    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  }

  async exportTransportRateCard(rateCardId: string) {
    if (!rateCardId?.trim()) {
      throw new BadRequestException('rateCardId is required');
    }

    const allRates = await this.prisma.vehicleRate.findMany({
      include: {
        supplier: true,
        vehicle: true,
        serviceType: true,
        route: {
          include: {
            fromPlace: true,
            toPlace: true,
          },
        },
        fromPlace: true,
        toPlace: true,
      },
      orderBy: [{ routeName: 'asc' }, { maxPax: 'asc' }],
    });
    const decodedRateCardId = decodeURIComponent(rateCardId);
    const rates = allRates.filter((rate) => getExportRateCardKey(rate) === decodedRateCardId);

    if (rates.length === 0) {
      throw new BadRequestException('Supplier rate card not found');
    }

    const supplier = rates[0].supplier;
    const supplierName = getExportSupplierName(rates[0]);
    const category = getExportRouteCategory(rates);
    const currency = rates[0].currency;
    const contractValidFrom = formatExportDate(rates[0].validFrom);
    const contractValidTo = formatExportDate(rates[0].validTo);
    const country = rates[0].route?.fromPlace?.country || rates[0].fromPlace?.country || rates[0].route?.toPlace?.country || rates[0].toPlace?.country || '';
    const contractName = `${supplierName} - ${category} ${new Date(rates[0].validFrom).getFullYear()} Rates in ${currency}`;
    const notes = supplier?.notes || '';

    const toImportRow = (rate: (typeof rates)[number]) => {
      const origin = rate.route?.fromPlace?.name || rate.fromPlace?.name || '';
      const destination = rate.route?.toPlace?.name || rate.toPlace?.name || '';

      return {
        supplierName,
        supplierContactName: '',
        supplierEmail: supplier?.email || '',
        supplierPhone: supplier?.phone || '',
        supplierWebsite: '',
        contractName,
        contractValidFrom,
        contractValidTo,
        country: rate.route?.fromPlace?.country || rate.fromPlace?.country || country,
        serviceName: rate.serviceType.name,
        routeName: rate.route?.name || rate.routeName,
        origin,
        destination,
        vehicleType: rate.vehicle.name,
        maxPaxPerUnit: rate.maxPax,
        pricingMode: 'PER_GROUP',
        cost: rate.price,
        currency: rate.currency,
        active: rate.active ? 'TRUE' : 'FALSE',
        notes,
      };
    };
    const importRows = rates.map(toImportRow);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(importRows, { header: [...TRANSPORT_CONTRACT_IMPORT_COLUMNS] }), 'Import Compatible');
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          supplierName,
          contractName,
          contractValidFrom,
          contractValidTo,
          country,
          currency,
          notes,
        },
      ]),
      'Contract Summary',
    );

    const rowWithClassification = (row: ReturnType<typeof toImportRow>, rate: (typeof rates)[number]) => ({
      ...row,
      classification: rate.serviceType.classification || 'ROUTE_TRANSFER',
    });
    const routeTransferRows = importRows
      .map((row, index) => rowWithClassification(row, rates[index]))
      .filter((row) => row.classification === 'ROUTE_TRANSFER');
    const fullDayRows = importRows
      .map((row, index) => ({
        ...rowWithClassification(row, rates[index]),
        minimumDays: rates[index].serviceType.classification === 'DAILY_PACKAGE' ? 3 : '',
      }))
      .filter((row) => row.classification === 'FULL_DAY' || row.classification === 'DAILY_PACKAGE');
    const addOnRows = importRows
      .map((row, index) => ({
        ...rowWithClassification(row, rates[index]),
        type: this.getTransportAddOnExportType(row.serviceName, row.routeName),
      }))
      .filter((row) => row.classification === 'ADD_ON');

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(routeTransferRows), 'Route Transfers');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fullDayRows), 'Full Day Packages');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(addOnRows), 'Add-ons');

    return {
      buffer: XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer,
      fileName: buildTransportExportFileName(supplierName, contractName, currency),
    };
  }

  async previewTransportContractImport(file: { buffer?: Buffer; path?: string; originalname?: string }, options: TransportContractImportOptions = {}) {
    return this.processTransportContractImport(file, 'preview', options);
  }

  async importTransportContract(file: { buffer?: Buffer; path?: string; originalname?: string }, options: TransportContractImportOptions = {}) {
    return this.processTransportContractImport(file, 'import', options);
  }

  private async processTransportContractImport(
    file: { buffer?: Buffer; path?: string; originalname?: string },
    mode: TransportContractImportMode,
    options: TransportContractImportOptions = {},
  ) {
    const parsedRows = this.parseTransportContractWorkbook(file);
    const summary = {
      mode,
      rows: parsedRows.length,
      createdSuppliers: 0,
      createdRoutes: 0,
      createdServices: 0,
      createdRates: 0,
      updatedRates: 0,
      skippedRows: 0,
      errors: [] as Array<{ row: number; message: string }>,
      previewRows: [] as Array<Record<string, unknown>>,
      contractWarnings: [] as Array<{
        supplierName: string;
        currency: string;
        contractValidFrom: string;
        contractValidTo: string;
        contractNames: string[];
        suggestedContractName: string;
        message: string;
      }>,
    };
    const seenRateKeys = new Set<string>();
    const validRows: ParsedTransportImportRow[] = [];

    for (const parsed of parsedRows) {
      if (parsed.empty) {
        summary.skippedRows += 1;
        continue;
      }

      const errors = this.validateTransportContractImportRow(parsed.row, parsed.rowNumber);
      if (errors.length > 0) {
        summary.errors.push(...errors.map((message) => ({ row: parsed.rowNumber, message })));
        summary.skippedRows += 1;
        continue;
      }

      const normalized = this.normalizeTransportContractImportRow(parsed.row);
      const rateKey = [
        normalizeImportKey(normalized.supplierName),
        normalizeImportKey(normalized.serviceName),
        normalizeImportKey(normalized.country),
        normalizeImportKey(normalized.origin),
        normalizeImportKey(normalized.destination),
        normalizeImportKey(normalized.vehicleType),
        normalized.maxPaxPerUnit,
      ].join('|');

      if (seenRateKeys.has(rateKey)) {
        summary.errors.push({ row: parsed.rowNumber, message: 'Duplicate rate row in upload.' });
        summary.skippedRows += 1;
        continue;
      }
      seenRateKeys.add(rateKey);

      validRows.push({ rowNumber: parsed.rowNumber, normalized });
    }

    summary.contractWarnings = this.detectTransportContractNameWarnings(validRows);

    if (options.contractMergeMode === 'merge' && summary.contractWarnings.length > 0) {
      const overrideName = normalizeImportName(options.contractNameOverride || '');
      if (!overrideName) {
        throw new BadRequestException('Choose a contract name before merging imported contract rows.');
      }

      const warningKeys = new Set(summary.contractWarnings.map((warning) => this.getContractPeriodKey(warning)));
      for (const entry of validRows) {
        if (warningKeys.has(this.getContractPeriodKey(entry.normalized))) {
          entry.normalized.contractName = overrideName;
        }
      }
      summary.contractWarnings = [];
    }

    for (const { rowNumber, normalized } of validRows) {
      summary.previewRows.push({
        row: rowNumber,
        supplierName: normalized.supplierName,
        contractName: normalized.contractName,
        contractValidFrom: formatImportDate(normalized.contractValidFrom),
        contractValidTo: formatImportDate(normalized.contractValidTo),
        country: normalized.country,
        serviceName: normalized.serviceName,
        classification: classifyTransportServiceName(normalized.serviceName),
        routeName: normalized.routeName,
        vehicleType: normalized.vehicleType,
        maxPaxPerUnit: normalized.maxPaxPerUnit,
        pricingMode: 'PER_GROUP',
        cost: normalized.cost,
        currency: normalized.currency,
        active: normalized.active,
      });

      if (!normalized.active) {
        summary.skippedRows += 1;
        continue;
      }

      if (mode === 'preview') {
        continue;
      }

      const supplierResult = await this.findOrCreateTransportImportSupplier(normalized);
      if (supplierResult.created) summary.createdSuppliers += 1;

      const serviceResult = await this.findOrCreateTransportImportService(supplierResult.supplier, normalized);
      if (serviceResult.created) summary.createdServices += 1;

      const routeResult = await this.findOrCreateTransportImportRoute(normalized);
      if (routeResult.created) summary.createdRoutes += 1;

      const serviceType = await this.findOrCreateTransportImportServiceType(normalized.serviceName);
      const vehicle = await this.findOrCreateTransportImportVehicle(supplierResult.supplier, normalized);
      const rateResult = await this.upsertTransportImportVehicleRate({
        supplierId: supplierResult.supplier.id,
        serviceTypeId: serviceType.id,
        vehicleId: vehicle.id,
        routeId: routeResult.route.id,
        fromPlaceId: routeResult.route.fromPlaceId,
        toPlaceId: routeResult.route.toPlaceId,
        routeName: normalized.routeName,
        maxPaxPerUnit: normalized.maxPaxPerUnit,
        cost: normalized.cost,
        currency: normalized.currency,
        validFrom: normalized.contractValidFrom,
        validTo: normalized.contractValidTo,
      });
      await this.upsertTransportImportCapacityRule({
        supplierId: supplierResult.supplier.id,
        serviceTypeId: serviceType.id,
        vehicleId: vehicle.id,
        routeId: routeResult.route.id,
        maxPaxPerUnit: normalized.maxPaxPerUnit,
        cost: normalized.cost,
        currency: normalized.currency,
      });

      if (rateResult.created) {
        summary.createdRates += 1;
      } else {
        summary.updatedRates += 1;
      }
    }

    return summary;
  }

  private detectTransportContractNameWarnings(rows: ParsedTransportImportRow[]) {
    const groups = new Map<string, { sample: NormalizedTransportContractImportRow; contractNames: Map<string, string> }>();

    for (const { normalized } of rows) {
      const key = this.getContractPeriodKey(normalized);
      const group = groups.get(key) || { sample: normalized, contractNames: new Map<string, string>() };
      const contractName = normalizeImportName(normalized.contractName);
      group.contractNames.set(contractName.toLowerCase(), contractName);
      groups.set(key, group);
    }

    return Array.from(groups.values())
      .filter((group) => group.contractNames.size > 1)
      .map((group) => {
        const supplierName = group.sample.supplierName;
        const currency = group.sample.currency;
        const contractValidFrom = formatImportDate(group.sample.contractValidFrom);
        const contractValidTo = formatImportDate(group.sample.contractValidTo);

        return {
          supplierName,
          currency,
          contractValidFrom,
          contractValidTo,
          contractNames: Array.from(group.contractNames.values()).sort((left, right) => left.localeCompare(right)),
          suggestedContractName: this.buildSuggestedTransportContractName(group.sample),
          message: 'Multiple contract names detected for the same supplier and validity period. This will create separate rate cards.',
        };
      });
  }

  private getContractPeriodKey(row: { supplierName: string; currency: string; contractValidFrom: Date | string; contractValidTo: Date | string }) {
    return [
      normalizeImportKey(row.supplierName),
      row.currency.trim().toUpperCase(),
      formatImportDate(row.contractValidFrom),
      formatImportDate(row.contractValidTo),
    ].join('|');
  }

  private buildSuggestedTransportContractName(row: { supplierName: string; currency: string; contractValidFrom: Date | string }) {
    return normalizeImportName(`${row.supplierName} Transport ${new Date(row.contractValidFrom).getFullYear()} ${row.currency.trim().toUpperCase()}`);
  }

  private parseTransportContractWorkbook(file: { buffer?: Buffer; path?: string; originalname?: string }) {
    if (!file?.buffer && !file?.path) {
      throw new BadRequestException('Transport contract Excel file is required');
    }

    const workbook = file.buffer ? XLSX.read(file.buffer, { type: 'buffer', cellDates: true }) : XLSX.readFile(file.path!, { cellDates: true });
    const sheetName = workbook.SheetNames.find((name) => normalizeImportKey(name) === normalizeImportKey('Import Compatible')) || workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('Workbook does not contain any sheets');
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '', raw: false, blankrows: false });
    const headerMap = new Map<string, string>();
    for (const sourceHeader of Object.keys(rawRows[0] || {})) {
      headerMap.set(normalizeImportKey(sourceHeader), sourceHeader);
    }

    const missingColumns = TRANSPORT_CONTRACT_IMPORT_COLUMNS.filter((column) => !headerMap.has(normalizeImportKey(column)));
    if (missingColumns.length > 0) {
      throw new BadRequestException(`Missing import columns: ${missingColumns.join(', ')}`);
    }

    return rawRows.map((rawRow, index) => {
      const row = TRANSPORT_CONTRACT_IMPORT_COLUMNS.reduce((accumulator, column) => {
        const sourceHeader = headerMap.get(normalizeImportKey(column));
        accumulator[column] = normalizeImportText(sourceHeader ? rawRow[sourceHeader] : '');
        return accumulator;
      }, {} as TransportContractImportRow);

      return {
        rowNumber: index + 2,
        row,
        empty: isEmptyImportRow(row),
      };
    });
  }

  private validateTransportContractImportRow(row: TransportContractImportRow, rowNumber: number) {
    const errors: string[] = [];

    for (const column of REQUIRED_TRANSPORT_CONTRACT_IMPORT_COLUMNS) {
      if (!row[column]) {
        errors.push(`${column} is required.`);
      }
    }

    const maxPaxPerUnit = Number(row.maxPaxPerUnit);
    const cost = Number(row.cost);
    const validFrom = new Date(row.contractValidFrom);
    const validTo = new Date(row.contractValidTo);

    if (row.maxPaxPerUnit && (!Number.isInteger(maxPaxPerUnit) || maxPaxPerUnit < 1)) {
      errors.push('maxPaxPerUnit must be a positive whole number.');
    }
    if (row.cost && (!Number.isFinite(cost) || cost < 0)) {
      errors.push('cost must be zero or greater.');
    }
    if (row.contractValidFrom && Number.isNaN(validFrom.getTime())) {
      errors.push('contractValidFrom must be a valid date.');
    }
    if (row.contractValidTo && Number.isNaN(validTo.getTime())) {
      errors.push('contractValidTo must be a valid date.');
    }
    if (!Number.isNaN(validFrom.getTime()) && !Number.isNaN(validTo.getTime()) && validFrom > validTo) {
      errors.push('contractValidFrom cannot be after contractValidTo.');
    }
    if (row.currency && !['USD', 'EUR', 'JOD'].includes(row.currency.trim().toUpperCase())) {
      errors.push('currency must be one of USD, EUR, or JOD.');
    }

    return errors.map((error) => `Row ${rowNumber}: ${error}`);
  }

  private normalizeTransportContractImportRow(row: TransportContractImportRow) {
    const origin = normalizeImportName(row.origin);
    const destination = normalizeImportName(row.destination);

    return {
      supplierName: normalizeImportName(row.supplierName),
      supplierContactName: normalizeImportName(row.supplierContactName),
      supplierEmail: normalizeImportName(row.supplierEmail),
      supplierPhone: normalizeImportName(row.supplierPhone),
      supplierWebsite: normalizeImportName(row.supplierWebsite),
      contractName: normalizeImportName(row.contractName),
      contractValidFrom: new Date(row.contractValidFrom),
      contractValidTo: new Date(row.contractValidTo),
      country: normalizeImportName(row.country),
      serviceName: normalizeImportName(row.serviceName),
      routeName: normalizeImportName(row.routeName) || formatRouteName(origin, destination),
      origin,
      destination,
      vehicleType: normalizeImportName(row.vehicleType),
      maxPaxPerUnit: Number(row.maxPaxPerUnit),
      pricingMode: 'PER_GROUP' as const,
      cost: Number(row.cost),
      currency: row.currency.trim().toUpperCase(),
      active: parseImportBoolean(row.active),
      notes: normalizeImportName(row.notes),
    };
  }

  private getTransportAddOnExportType(serviceName: string, routeName: string) {
    const normalized = `${serviceName} ${routeName}`.toLowerCase();

    if (normalized.includes('overnight')) return 'overnight';
    if (normalized.includes('stationary')) return 'stationary';
    if (normalized.includes('waiting')) return 'waiting';
    if (normalized.includes('daily charge')) return 'daily charge';

    return 'add-on';
  }

  private async findOrCreateTransportImportSupplier(row: NormalizedTransportContractImportRow) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        name: { equals: row.supplierName, mode: 'insensitive' },
      },
    });

    if (supplier) {
      return { supplier, created: false };
    }

    const notes = [
      row.contractName ? `Contract: ${row.contractName}` : null,
      row.supplierContactName ? `Contact: ${row.supplierContactName}` : null,
      row.supplierWebsite ? `Website: ${row.supplierWebsite}` : null,
      row.notes || null,
    ].filter(Boolean).join('\n');

    return {
      supplier: await this.prisma.supplier.create({
        data: {
          name: row.supplierName,
          type: 'transport',
          email: row.supplierEmail || null,
          phone: row.supplierPhone || null,
          notes: notes || null,
        },
      }),
      created: true,
    };
  }

  private async findOrCreateTransportImportService(
    supplier: { id: string; name: string },
    row: NormalizedTransportContractImportRow,
  ) {
    const existing = await this.prisma.supplierService.findFirst({
      where: {
        supplierId: supplier.id,
        name: { equals: row.serviceName, mode: 'insensitive' },
      },
    });

    if (existing) {
      return { service: existing, created: false };
    }

    const serviceType = await this.findOrCreateCatalogTransportServiceType();
    return {
      service: await this.prisma.supplierService.create({
        data: {
          supplierId: supplier.id,
          resolvedSupplierId: supplier.id,
          name: row.serviceName,
          category: 'Transport',
          serviceTypeId: serviceType.id,
          unitType: 'per_group',
          baseCost: row.cost,
          currency: row.currency,
          costBaseAmount: row.cost,
          costCurrency: row.currency,
        },
      }),
      created: true,
    };
  }

  private async findOrCreateCatalogTransportServiceType() {
    const existing = await this.prisma.serviceType.findFirst({
      where: {
        OR: [
          { code: { equals: 'TRANSPORT', mode: 'insensitive' } },
          { name: { equals: 'Transport', mode: 'insensitive' } },
        ],
      },
    });

    return existing || this.prisma.serviceType.create({ data: { name: 'Transport', code: 'TRANSPORT', isActive: true } });
  }

  private async findOrCreateTransportImportServiceType(serviceName: string) {
    const code = normalizeCode(serviceName);
    const classification = classifyTransportServiceName(serviceName);
    const existing = await this.prisma.transportServiceType.findFirst({
      where: {
        OR: [
          { name: { equals: serviceName, mode: 'insensitive' } },
          { code: { equals: code, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      return this.prisma.transportServiceType.update({
        where: { id: existing.id },
        data: { classification } as any,
      });
    }

    return this.prisma.transportServiceType.create({ data: { name: serviceName, code, classification } as any });
  }

  private async findOrCreateTransportImportVehicle(
    supplier: { id: string; name: string },
    row: NormalizedTransportContractImportRow,
  ) {
    const existing = await this.prisma.vehicle.findFirst({
      where: {
        name: { equals: row.vehicleType, mode: 'insensitive' },
        maxPax: row.maxPaxPerUnit,
        OR: [{ supplierId: supplier.id }, { resolvedSupplierId: supplier.id }, { supplierName: { equals: supplier.name, mode: 'insensitive' } }],
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.vehicle.create({
      data: {
        supplierId: supplier.id,
        resolvedSupplierId: supplier.id,
        supplierName: supplier.name,
        name: row.vehicleType,
        maxPax: row.maxPaxPerUnit,
        luggageCapacity: 0,
      },
    });
  }

  private async findOrCreateTransportImportRoute(row: NormalizedTransportContractImportRow) {
    const [fromPlace, toPlace] = await Promise.all([
      this.findOrCreateTransportImportPlace(row.origin, row.country),
      this.findOrCreateTransportImportPlace(row.destination, row.country),
    ]);
    const existing = await this.prisma.route.findFirst({
      where: {
        fromPlaceId: fromPlace.id,
        toPlaceId: toPlace.id,
      },
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });

    if (existing) {
      return { route: existing, created: false };
    }

    const route = await this.prisma.route.create({
      data: {
        fromPlaceId: fromPlace.id,
        toPlaceId: toPlace.id,
        name: row.routeName,
        normalizedKey: buildRouteNormalizedKey(`${row.country} ${row.origin}`, `${row.country} ${row.destination}`),
        routeType: 'transfer',
        notes: row.notes || null,
        isActive: true,
      },
      include: {
        fromPlace: true,
        toPlace: true,
      },
    });

    return { route, created: true };
  }

  private async findOrCreateTransportImportPlace(name: string, country: string) {
    const existing = await this.prisma.place.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        country: { equals: country, mode: 'insensitive' },
      },
    });

    return existing || this.prisma.place.create({
      data: {
        name,
        type: 'Transport hub',
        country,
        isActive: true,
      },
    });
  }

  private async upsertTransportImportVehicleRate(data: {
    supplierId: string;
    serviceTypeId: string;
    vehicleId: string;
    routeId: string;
    fromPlaceId: string;
    toPlaceId: string;
    routeName: string;
    maxPaxPerUnit: number;
    cost: number;
    currency: string;
    validFrom: Date;
    validTo: Date;
  }) {
    const existing = await this.prisma.vehicleRate.findFirst({
      where: {
        supplierId: data.supplierId,
        serviceTypeId: data.serviceTypeId,
        routeId: data.routeId,
        vehicleId: data.vehicleId,
        maxPax: data.maxPaxPerUnit,
      },
    });

    if (existing) {
      return {
        rate: await this.prisma.vehicleRate.update({
          where: { id: existing.id },
          data: {
            fromPlaceId: data.fromPlaceId,
            toPlaceId: data.toPlaceId,
            routeName: data.routeName,
            minPax: 1,
            maxPax: data.maxPaxPerUnit,
            price: data.cost,
            currency: data.currency,
            active: true,
            validFrom: data.validFrom,
            validTo: data.validTo,
          },
        }),
        created: false,
      };
    }

    return {
      rate: await this.prisma.vehicleRate.create({
        data: {
          supplierId: data.supplierId,
          serviceTypeId: data.serviceTypeId,
          vehicleId: data.vehicleId,
          routeId: data.routeId,
          fromPlaceId: data.fromPlaceId,
          toPlaceId: data.toPlaceId,
          routeName: data.routeName,
          minPax: 1,
          maxPax: data.maxPaxPerUnit,
          price: data.cost,
          currency: data.currency,
          active: true,
          validFrom: data.validFrom,
          validTo: data.validTo,
        },
      }),
      created: true,
    };
  }

  private async upsertTransportImportCapacityRule(data: {
    supplierId: string;
    serviceTypeId: string;
    vehicleId: string;
    routeId: string;
    maxPaxPerUnit: number;
    cost: number;
    currency: string;
  }) {
    return this.upsertCapacityPricingRuleForVehicleRate({
      supplierId: data.supplierId,
      serviceTypeId: data.serviceTypeId,
      routeId: data.routeId,
      vehicleId: data.vehicleId,
      maxPax: data.maxPaxPerUnit,
      price: data.cost,
      currency: data.currency,
      active: true,
    });
  }

  private toVehicleRatePricingSyncData(rate: {
    supplierId: string | null;
    serviceTypeId: string;
    routeId: string | null;
    vehicleId: string;
    maxPax: number;
    price: number;
    currency: string;
    active?: boolean | null;
  }): VehicleRatePricingSyncData {
    return {
      supplierId: rate.supplierId ?? null,
      serviceTypeId: rate.serviceTypeId,
      routeId: rate.routeId ?? null,
      vehicleId: rate.vehicleId,
      maxPax: rate.maxPax,
      price: rate.price,
      currency: rate.currency,
      active: rate.active ?? true,
    };
  }

  private vehicleRatePricingKeysMatch(left: VehicleRatePricingSyncData, right: VehicleRatePricingSyncData) {
    return (
      left.supplierId === right.supplierId &&
      left.serviceTypeId === right.serviceTypeId &&
      left.routeId === right.routeId &&
      left.vehicleId === right.vehicleId &&
      left.maxPax === right.maxPax
    );
  }

  private capacityPricingRuleWhere(data: VehicleRatePricingSyncData) {
    if (!data.routeId) {
      return null;
    }

    return {
      supplierId: data.supplierId,
      transportServiceTypeId: data.serviceTypeId,
      routeId: data.routeId,
      vehicleId: data.vehicleId,
      pricingMode: 'capacity_unit' as const,
      unitCapacity: data.maxPax,
    };
  }

  private async findCapacityPricingRulesForVehicleRate(data: VehicleRatePricingSyncData) {
    const where = this.capacityPricingRuleWhere(data);

    if (!where) {
      return [];
    }

    return this.prisma.transportPricingRule.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  private async upsertCapacityPricingRuleForVehicleRate(data: VehicleRatePricingSyncData) {
    const where = this.capacityPricingRuleWhere(data);

    if (!where) {
      return null;
    }

    const routeId = data.routeId;
    if (!routeId) {
      return null;
    }

    const [primaryRule, ...duplicateRules] = await this.findCapacityPricingRulesForVehicleRate(data);
    const ruleData = {
      supplierId: data.supplierId,
      transportServiceTypeId: data.serviceTypeId,
      routeId,
      vehicleId: data.vehicleId,
      pricingMode: 'capacity_unit' as const,
      minPax: 1,
      maxPax: 999,
      unitCapacity: data.maxPax,
      baseCost: data.price,
      discountPercent: 0,
      currency: data.currency.trim().toUpperCase(),
      isActive: data.active,
    };

    await Promise.all(
      duplicateRules.map((rule) =>
        this.prisma.transportPricingRule.update({
          where: { id: rule.id },
          data: { isActive: false },
        }),
      ),
    );

    if (primaryRule) {
      return this.prisma.transportPricingRule.update({
        where: { id: primaryRule.id },
        data: ruleData,
      });
    }

    return this.prisma.transportPricingRule.create({ data: ruleData });
  }

  private async deactivateCapacityPricingRulesForVehicleRate(data: VehicleRatePricingSyncData) {
    const rules = await this.findCapacityPricingRulesForVehicleRate(data);

    await Promise.all(
      rules.map((rule) =>
        this.prisma.transportPricingRule.update({
          where: { id: rule.id },
          data: { isActive: false },
        }),
      ),
    );
  }

  private async syncCapacityPricingRuleForVehicleRate(
    vehicleRate: VehicleRatePricingSyncData,
    previous?: VehicleRatePricingSyncData,
  ) {
    if (previous && !this.vehicleRatePricingKeysMatch(previous, vehicleRate)) {
      await this.deactivateCapacityPricingRulesForVehicleRate(previous);
    }

    return this.upsertCapacityPricingRuleForVehicleRate(vehicleRate);
  }

  private resolveRouteFields(
    data: { routeId?: string | null; fromPlaceId?: string | null; toPlaceId?: string | null; routeName?: string },
    route:
      | {
          id: string;
          name: string;
          fromPlaceId: string;
          toPlaceId: string;
          fromPlace: { id: string; name: string };
          toPlace: { id: string; name: string };
        }
      | null,
    fromPlace: { id: string; name: string } | null,
    toPlace: { id: string; name: string } | null,
  ) {
    if (data.routeId) {
      if (!route) {
        throw new BadRequestException('Route not found');
      }

      return {
        routeId: route.id,
        fromPlaceId: route.fromPlaceId,
        toPlaceId: route.toPlaceId,
        routeName: route.name || buildRouteName(route.fromPlace.name, route.toPlace.name),
      };
    }

    const hasFromPlace = Boolean(data.fromPlaceId);
    const hasToPlace = Boolean(data.toPlaceId);

    if (hasFromPlace !== hasToPlace) {
      throw new BadRequestException('fromPlaceId and toPlaceId must be provided together');
    }

    if (hasFromPlace && hasToPlace) {
      if (!fromPlace) {
        throw new BadRequestException('From place not found');
      }

      if (!toPlace) {
        throw new BadRequestException('To place not found');
      }

      return {
        routeId: null,
        fromPlaceId: fromPlace.id,
        toPlaceId: toPlace.id,
        routeName: buildRouteName(fromPlace.name, toPlace.name),
      };
    }

    return {
      routeId: null,
      fromPlaceId: null,
      toPlaceId: null,
      routeName: requireTrimmedString(data.routeName || '', 'routeName'),
    };
  }
}
