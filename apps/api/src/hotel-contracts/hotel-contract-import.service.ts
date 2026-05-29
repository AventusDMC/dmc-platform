import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  ContractChargeBasisValue,
  ContractSupplementMealPlanValue,
  ContractSupplementTypeValue,
  CreateContractSupplementDto,
} from '../contract-supplements/contract-supplements.dto';
import { ContractSupplementsService } from '../contract-supplements/contract-supplements.service';
import { CreateContractMealPlanDto, MealPlanCodeValue } from '../contract-meal-plans/contract-meal-plans.dto';
import { ContractMealPlansService } from '../contract-meal-plans/contract-meal-plans.service';
import { HotelRatesService } from '../hotel-rates/hotel-rates.service';
import { PrismaService } from '../prisma/prisma.service';

// Hotels Engine — contract Excel IMPORT (round-trip step 2 of 2).
//
// Consumes a workbook produced by HotelContractExportService.
//   - preview(): NON-DESTRUCTIVE dry-run — reports what an import would do.
//   - apply():   UPSERT (create + update) the Supplements sheet, reusing
//                ContractSupplementsService so every write gets the same
//                validation + conflict checks + audit logging as the UI.
//
// DELETES (rows present in the DB but absent from the file) are previewed
// but deliberately NOT applied yet — bulk delete-by-absence is the
// dangerous edge, so it stays a manual action until a dedicated,
// extra-confirmed pass. Scope today is the Supplements sheet; the other
// sheets follow the identical _id-keyed pattern.

// Keep in sync with hotel-contract-export.service.ts.
const WORKBOOK_SCHEMA_VERSION = 1;
const SHEET_REFERENCE = '_Reference';
const SHEET_SUPPLEMENTS = 'Supplements';
const SHEET_RATES = 'Rates';
const SHEET_MEAL_PLANS = 'MealPlans';

const SUPPLEMENT_TYPES = new Set<ContractSupplementTypeValue>([
  'EXTRA_BREAKFAST',
  'EXTRA_LUNCH',
  'EXTRA_DINNER',
  'GALA_DINNER',
  'EXTRA_BED',
]);
const SUPPLEMENT_CHARGE_BASES = new Set<ContractChargeBasisValue>(['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT']);
const MEAL_PLAN_CODES = new Set<ContractSupplementMealPlanValue>(['RO', 'BB', 'HB', 'FB', 'AI']);
const OCCUPANCY_TYPES = new Set(['SGL', 'DBL', 'TPL']);
const RATE_MEAL_PLANS = new Set(['RO', 'BB', 'HB', 'FB', 'AI']);
const RATE_PRICING_BASES = new Set(['PER_ROOM', 'PER_PERSON']);
const TOURISM_FEE_MODES = new Set(['PER_NIGHT_PER_PERSON', 'PER_NIGHT_PER_ROOM']);

type ParsedRow<TDto> = {
  rowNumber: number;
  id: string | null;
  dto: TDto;
};

type EntityPlan<TDto> = {
  rows: Array<ParsedRow<TDto>>;
  existingIds: Set<string>;
  fileIds: Set<string>;
  rowErrors: Array<{ row: number; message: string }>;
};

type EntityDiff = {
  fileRows: number;
  toCreate: number;
  toUpdate: number;
  toDelete: number;
  rowErrors: Array<{ row: number; message: string }>;
};

export type ImportPreviewResult = {
  schemaVersion: number | null;
  schemaOk: boolean;
  contractIdInFile: string | null;
  contractMatch: boolean;
  errors: string[];
  entities: { supplements: EntityDiff; rates: EntityDiff; mealPlans: EntityDiff };
};

type ApplyCounts = { created: number; updated: number; skippedDeletes: number };
export type ImportApplyResult = { supplements: ApplyCounts; rates: ApplyCounts; mealPlans: ApplyCounts };

function diffFromPlan(plan: EntityPlan<unknown>): EntityDiff {
  return {
    fileRows: plan.rows.length,
    toCreate: plan.rows.filter((r) => !r.id).length,
    toUpdate: plan.rows.filter((r) => r.id).length,
    toDelete: [...plan.existingIds].filter((id) => !plan.fileIds.has(id)).length,
    rowErrors: plan.rowErrors,
  };
}

const EMPTY_PLAN: EntityPlan<any> = { rows: [], existingIds: new Set(), fileIds: new Set(), rowErrors: [] };

type AuditActor = { id: string; auditLabel: string } | null;

@Injectable()
export class HotelContractImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supplements: ContractSupplementsService,
    private readonly rates: HotelRatesService,
    private readonly mealPlans: ContractMealPlansService,
  ) {}

  async preview(contractId: string, buffer: Buffer): Promise<ImportPreviewResult> {
    const { errors, workbook, schemaVersion, contractIdInFile, schemaOk, contractMatch } =
      await this.loadAndValidateIdentity(contractId, buffer);

    const identityOk = errors.length === 0;
    const supplementPlan = identityOk ? await this.buildSupplementPlan(contractId, workbook) : EMPTY_PLAN;
    const ratePlan = identityOk ? await this.buildRatePlan(contractId, workbook) : EMPTY_PLAN;
    const mealPlanPlan = identityOk ? await this.buildMealPlanPlan(contractId, workbook) : EMPTY_PLAN;

    return {
      schemaVersion,
      schemaOk,
      contractIdInFile,
      contractMatch,
      errors,
      entities: {
        supplements: diffFromPlan(supplementPlan),
        rates: diffFromPlan(ratePlan),
        mealPlans: diffFromPlan(mealPlanPlan),
      },
    };
  }

  async apply(contractId: string, buffer: Buffer, actor: AuditActor): Promise<ImportApplyResult> {
    const { errors, workbook } = await this.loadAndValidateIdentity(contractId, buffer);
    if (errors.length > 0) {
      throw new BadRequestException(errors.join(' '));
    }

    const supplementPlan = await this.buildSupplementPlan(contractId, workbook);
    const ratePlan = await this.buildRatePlan(contractId, workbook);
    const mealPlanPlan = await this.buildMealPlanPlan(contractId, workbook);
    const allRowErrors = [...supplementPlan.rowErrors, ...ratePlan.rowErrors, ...mealPlanPlan.rowErrors];
    if (allRowErrors.length > 0) {
      throw new BadRequestException(
        `Fix these before importing: ${allRowErrors.map((e) => (e.row ? `row ${e.row}: ${e.message}` : e.message)).join('; ')}`,
      );
    }

    // Upsert through the existing services (their own validation + audit +
    // conflict checks). Preview was clean, so a mid-loop failure is
    // unlikely; if one happens we surface what already applied.
    const supplements: ApplyCounts = { created: 0, updated: 0, skippedDeletes: 0 };
    for (const row of supplementPlan.rows) {
      if (row.id) {
        await this.supplements.update(contractId, row.id, row.dto, actor);
        supplements.updated += 1;
      } else {
        await this.supplements.create(contractId, row.dto, actor);
        supplements.created += 1;
      }
    }
    supplements.skippedDeletes = [...supplementPlan.existingIds].filter((id) => !supplementPlan.fileIds.has(id)).length;

    const rates: ApplyCounts = { created: 0, updated: 0, skippedDeletes: 0 };
    for (const row of ratePlan.rows) {
      if (row.id) {
        await this.rates.update(row.id, row.dto as any);
        rates.updated += 1;
      } else {
        await this.rates.create(row.dto as any);
        rates.created += 1;
      }
    }
    rates.skippedDeletes = [...ratePlan.existingIds].filter((id) => !ratePlan.fileIds.has(id)).length;

    const mealPlans: ApplyCounts = { created: 0, updated: 0, skippedDeletes: 0 };
    for (const row of mealPlanPlan.rows) {
      if (row.id) {
        await this.mealPlans.update(contractId, row.id, row.dto as CreateContractMealPlanDto, actor);
        mealPlans.updated += 1;
      } else {
        await this.mealPlans.create(contractId, row.dto as CreateContractMealPlanDto, actor);
        mealPlans.created += 1;
      }
    }
    mealPlans.skippedDeletes = [...mealPlanPlan.existingIds].filter((id) => !mealPlanPlan.fileIds.has(id)).length;

    return { supplements, rates, mealPlans };
  }

  // -------- shared parsing / validation --------

  private async loadAndValidateIdentity(contractId: string, buffer: Buffer) {
    const contract = await this.prisma.hotelContract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contract) {
      throw new NotFoundException(`Hotel contract ${contractId} not found`);
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('Could not read the uploaded file as an Excel (.xlsx) workbook.');
    }

    const errors: string[] = [];
    const ref = workbook.getWorksheet(SHEET_REFERENCE);
    let schemaVersion: number | null = null;
    let contractIdInFile: string | null = null;
    if (!ref) {
      errors.push(
        'This file is missing its hidden reference sheet — it does not look like a contract export. Re-download the contract Excel and edit that copy.',
      );
    } else {
      ref.eachRow((row) => {
        const key = String(row.getCell(1).value ?? '').trim();
        const value = String(row.getCell(2).value ?? '').trim();
        if (key === 'Schema Version') schemaVersion = Number(value);
        if (key === 'Contract ID') contractIdInFile = value;
      });
    }

    const schemaOk = schemaVersion === WORKBOOK_SCHEMA_VERSION;
    if (ref && !schemaOk) {
      errors.push(
        `Workbook is schema v${schemaVersion ?? '?'}, but this system expects v${WORKBOOK_SCHEMA_VERSION}. Re-download the latest contract Excel.`,
      );
    }
    const contractMatch = contractIdInFile === contractId;
    if (ref && schemaOk && !contractMatch) {
      errors.push(
        `This workbook belongs to a different contract (${contractIdInFile ?? 'unknown'}). Upload it on that contract, or re-download this one's Excel.`,
      );
    }

    return { errors, workbook, schemaVersion, contractIdInFile, schemaOk, contractMatch };
  }

  private async buildSupplementPlan(
    contractId: string,
    workbook: ExcelJS.Workbook,
  ): Promise<EntityPlan<CreateContractSupplementDto>> {
    const rowErrors: Array<{ row: number; message: string }> = [];
    const rows: Array<ParsedRow<CreateContractSupplementDto>> = [];
    const fileIds = new Set<string>();

    const [contract, existing] = await Promise.all([
      this.prisma.hotelContract.findUnique({ where: { id: contractId }, select: { hotelId: true, currency: true } }),
      (this.prisma as any).hotelContractSupplement.findMany({
        where: { hotelContractId: contractId },
        select: { id: true },
      }) as Promise<Array<{ id: string }>>,
    ]);
    const existingIds = new Set((existing || []).map((s) => s.id));

    // Room name → id map (the export writes the room NAME, not its id).
    const roomCategories = await this.prisma.hotelRoomCategory.findMany({
      where: { hotelId: contract?.hotelId },
      select: { id: true, name: true },
    });
    const roomIdByName = new Map(roomCategories.map((r) => [r.name.trim().toLowerCase(), r.id]));

    const sheet = workbook.getWorksheet(SHEET_SUPPLEMENTS);
    if (!sheet) {
      return { rows, existingIds, fileIds, rowErrors };
    }

    const col: Record<string, number> = {};
    sheet.getRow(1).eachCell((cell, c) => {
      col[String(cell.value ?? '').trim()] = c;
    });
    const cellText = (row: ExcelJS.Row, header: string) =>
      col[header] ? String(row.getCell(col[header]).value ?? '').trim() : '';

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const id = String(row.getCell(col['_id'] || 1).value ?? '').trim();
      const type = cellText(row, 'Type');
      const amountRaw = cellText(row, 'Amount');
      if (!id && !type && !amountRaw) return; // blank trailing row

      const errorsBefore = rowErrors.length;

      const typeUpper = type.toUpperCase() as ContractSupplementTypeValue;
      if (!SUPPLEMENT_TYPES.has(typeUpper)) {
        rowErrors.push({ row: rowNumber, message: `Type "${type}" is not valid` });
      }
      const basis = cellText(row, 'Charge Basis').toUpperCase() as ContractChargeBasisValue;
      if (!SUPPLEMENT_CHARGE_BASES.has(basis)) {
        rowErrors.push({ row: rowNumber, message: `Charge Basis "${cellText(row, 'Charge Basis')}" is not valid` });
      } else if (
        // Mirror the service's type↔basis rule so the preview catches what
        // apply would reject: EXTRA_BED is room/stay/night; meal & gala
        // types are per-person or per-room only.
        typeUpper === 'EXTRA_BED'
          ? !['PER_ROOM', 'PER_NIGHT', 'PER_STAY'].includes(basis)
          : !['PER_PERSON', 'PER_ROOM'].includes(basis)
      ) {
        rowErrors.push({
          row: rowNumber,
          message:
            typeUpper === 'EXTRA_BED'
              ? `EXTRA_BED allows only PER_ROOM, PER_NIGHT or PER_STAY`
              : `${typeUpper} allows only PER_PERSON or PER_ROOM`,
        });
      }
      const amount = Number(amountRaw);
      if (!(Number.isFinite(amount) && amount >= 0)) {
        rowErrors.push({ row: rowNumber, message: `Amount "${amountRaw}" must be a non-negative number` });
      }
      const currency = (cellText(row, 'Currency') || contract?.currency || '').toUpperCase();

      const roomName = cellText(row, 'Room Category (blank = all rooms)');
      let roomCategoryId: string | null = null;
      if (roomName) {
        const resolved = roomIdByName.get(roomName.toLowerCase());
        if (!resolved) {
          rowErrors.push({ row: rowNumber, message: `Room "${roomName}" is not a room category on this hotel` });
        } else {
          roomCategoryId = resolved;
        }
      }

      const mealRaw = cellText(row, 'Meal Plan').toUpperCase();
      let mealPlanCode: ContractSupplementMealPlanValue | null = null;
      if (mealRaw) {
        if (!MEAL_PLAN_CODES.has(mealRaw as ContractSupplementMealPlanValue)) {
          rowErrors.push({ row: rowNumber, message: `Meal Plan "${mealRaw}" is not valid` });
        } else {
          mealPlanCode = mealRaw as ContractSupplementMealPlanValue;
        }
      }

      if (id && !existingIds.has(id)) {
        rowErrors.push({ row: rowNumber, message: `references an unknown _id (${id.slice(0, 8)}…) — re-download the Excel` });
      }

      if (id) fileIds.add(id);

      // Only build a row to apply if it passed its own validation.
      if (rowErrors.length === errorsBefore) {
        rows.push({
          rowNumber,
          id: id || null,
          dto: {
            roomCategoryId,
            type: typeUpper,
            mealPlanCode,
            chargeBasis: basis,
            amount,
            currency,
            appliesFrom: this.parseDateCell(cellText(row, 'Applies From')),
            appliesTo: this.parseDateCell(cellText(row, 'Applies To')),
            isMandatory: this.parseYesNo(cellText(row, 'Mandatory')),
            isActive: this.parseYesNo(cellText(row, 'Active'), true),
            notes: cellText(row, 'Notes') || null,
          },
        });
      }
    });

    return { rows, existingIds, fileIds, rowErrors };
  }

  private async buildRatePlan(contractId: string, workbook: ExcelJS.Workbook): Promise<EntityPlan<any>> {
    const rowErrors: Array<{ row: number; message: string }> = [];
    const rows: Array<ParsedRow<any>> = [];
    const fileIds = new Set<string>();

    const [contract, existing] = await Promise.all([
      this.prisma.hotelContract.findUnique({ where: { id: contractId }, select: { hotelId: true, currency: true } }),
      this.prisma.hotelRate.findMany({ where: { contractId }, select: { id: true } }),
    ]);
    const existingIds = new Set((existing || []).map((r) => r.id));

    const roomCategories = await this.prisma.hotelRoomCategory.findMany({
      where: { hotelId: contract?.hotelId },
      select: { id: true, name: true },
    });
    const roomIdByName = new Map(roomCategories.map((r) => [r.name.trim().toLowerCase(), r.id]));

    const sheet = workbook.getWorksheet(SHEET_RATES);
    if (!sheet) {
      return { rows, existingIds, fileIds, rowErrors };
    }

    const col: Record<string, number> = {};
    sheet.getRow(1).eachCell((cell, c) => {
      col[String(cell.value ?? '').trim()] = c;
    });
    const text = (row: ExcelJS.Row, header: string) =>
      col[header] ? String(row.getCell(col[header]).value ?? '').trim() : '';

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const id = String(row.getCell(col['_id'] || 1).value ?? '').trim();
      const roomName = text(row, 'Room Category');
      const costRaw = text(row, 'Cost');
      if (!id && !roomName && !costRaw) return; // blank trailing row

      const errorsBefore = rowErrors.length;
      const err = (message: string) => rowErrors.push({ row: rowNumber, message });

      let roomCategoryId: string | null = null;
      const resolved = roomName ? roomIdByName.get(roomName.toLowerCase()) : undefined;
      if (!roomName) err('Room Category is required');
      else if (!resolved) err(`Room "${roomName}" is not a room category on this hotel`);
      else roomCategoryId = resolved;

      const occupancyType = text(row, 'Occupancy').toUpperCase();
      if (!OCCUPANCY_TYPES.has(occupancyType)) err(`Occupancy "${text(row, 'Occupancy')}" must be SGL / DBL / TPL`);
      const mealPlan = text(row, 'Meal Plan').toUpperCase();
      if (!RATE_MEAL_PLANS.has(mealPlan)) err(`Meal Plan "${text(row, 'Meal Plan')}" is not valid`);
      const cost = Number(costRaw);
      if (!(Number.isFinite(cost) && cost >= 0)) err(`Cost "${costRaw}" must be a non-negative number`);

      const pricingBasisRaw = text(row, 'Pricing Basis').toUpperCase();
      if (pricingBasisRaw && !RATE_PRICING_BASES.has(pricingBasisRaw)) err(`Pricing Basis "${pricingBasisRaw}" is not valid`);
      const tourismModeRaw = text(row, 'Tourism Fee Mode').toUpperCase();
      if (tourismModeRaw && !TOURISM_FEE_MODES.has(tourismModeRaw)) err(`Tourism Fee Mode "${tourismModeRaw}" is not valid`);

      const seasonName = text(row, 'Season Name');
      if (!seasonName) err('Season Name is required');

      if (id && !existingIds.has(id)) err(`references an unknown _id (${id.slice(0, 8)}…) — re-download the Excel`);
      if (id) fileIds.add(id);

      if (rowErrors.length === errorsBefore) {
        const tourismFee = text(row, 'Tourism Fee');
        rows.push({
          rowNumber,
          id: id || null,
          dto: {
            contractId,
            roomCategoryId,
            occupancyType,
            mealPlan,
            seasonName,
            seasonFrom: this.parseDateObj(text(row, 'Season From')),
            seasonTo: this.parseDateObj(text(row, 'Season To')),
            pricingBasis: pricingBasisRaw || 'PER_ROOM',
            currency: (text(row, 'Currency') || contract?.currency || '').toUpperCase(),
            cost,
            salesTaxPercent: this.parseOptionalNumber(text(row, 'Sales Tax %')) ?? 0,
            salesTaxIncluded: this.parseYesNo(text(row, 'Sales Tax Incl')),
            serviceChargePercent: this.parseOptionalNumber(text(row, 'Service Charge %')) ?? 0,
            serviceChargeIncluded: this.parseYesNo(text(row, 'Service Charge Incl')),
            tourismFeeAmount: tourismFee ? this.parseOptionalNumber(tourismFee) : null,
            tourismFeeCurrency: text(row, 'Tourism Fee Ccy').toUpperCase() || null,
            tourismFeeMode: tourismModeRaw || null,
          },
        });
      }
    });

    return { rows, existingIds, fileIds, rowErrors };
  }

  private async buildMealPlanPlan(contractId: string, workbook: ExcelJS.Workbook): Promise<EntityPlan<any>> {
    const rowErrors: Array<{ row: number; message: string }> = [];
    const rows: Array<ParsedRow<any>> = [];
    const fileIds = new Set<string>();

    const existing: Array<{ id: string }> = await (this.prisma as any).hotelContractMealPlan.findMany({
      where: { hotelContractId: contractId },
      select: { id: true },
    });
    const existingIds = new Set((existing || []).map((m) => m.id));

    const sheet = workbook.getWorksheet(SHEET_MEAL_PLANS);
    if (!sheet) {
      return { rows, existingIds, fileIds, rowErrors };
    }

    const col: Record<string, number> = {};
    sheet.getRow(1).eachCell((cell, c) => {
      col[String(cell.value ?? '').trim()] = c;
    });
    const text = (row: ExcelJS.Row, header: string) =>
      col[header] ? String(row.getCell(col[header]).value ?? '').trim() : '';

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const id = String(row.getCell(col['_id'] || 1).value ?? '').trim();
      const code = text(row, 'Code').toUpperCase();
      if (!id && !code) return;

      const errorsBefore = rowErrors.length;
      if (!MEAL_PLAN_CODES.has(code as ContractSupplementMealPlanValue)) {
        rowErrors.push({ row: rowNumber, message: `Code "${text(row, 'Code')}" must be RO / BB / HB / FB / AI` });
      }
      if (id && !existingIds.has(id)) {
        rowErrors.push({ row: rowNumber, message: `references an unknown _id (${id.slice(0, 8)}…) — re-download the Excel` });
      }
      if (id) fileIds.add(id);

      if (rowErrors.length === errorsBefore) {
        // isDefault is intentionally not imported (matches the UI, which
        // doesn't let you set it here); Code / Active / Notes round-trip.
        rows.push({
          rowNumber,
          id: id || null,
          dto: {
            code: code as MealPlanCodeValue,
            isActive: this.parseYesNo(text(row, 'Active'), true),
            notes: text(row, 'Notes') || null,
          },
        });
      }
    });

    return { rows, existingIds, fileIds, rowErrors };
  }

  private parseOptionalNumber(value: string): number | null {
    if (!value.trim()) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  private parseYesNo(value: string, defaultValue = false): boolean {
    const v = value.trim().toLowerCase();
    if (v === 'yes' || v === 'true') return true;
    if (v === 'no' || v === 'false') return false;
    return defaultValue;
  }

  private parseDateCell(value: string): string | null {
    if (!value) return null;
    // Export writes YYYY-MM-DD; re-emit at noon UTC like the rest of the app.
    const date = new Date(`${value}T12:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  // Date-object variant for services (e.g. HotelRatesService) that expect
  // a Date rather than an ISO string for season boundaries.
  private parseDateObj(value: string): Date | null {
    const iso = this.parseDateCell(value);
    return iso ? new Date(iso) : null;
  }
}
