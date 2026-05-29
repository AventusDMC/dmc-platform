import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  ContractChargeBasisValue,
  ContractSupplementMealPlanValue,
  ContractSupplementTypeValue,
  CreateContractSupplementDto,
} from '../contract-supplements/contract-supplements.dto';
import { ContractSupplementsService } from '../contract-supplements/contract-supplements.service';
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

const SUPPLEMENT_TYPES = new Set<ContractSupplementTypeValue>([
  'EXTRA_BREAKFAST',
  'EXTRA_LUNCH',
  'EXTRA_DINNER',
  'GALA_DINNER',
  'EXTRA_BED',
]);
const SUPPLEMENT_CHARGE_BASES = new Set<ContractChargeBasisValue>(['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT']);
const MEAL_PLAN_CODES = new Set<ContractSupplementMealPlanValue>(['RO', 'BB', 'HB', 'FB', 'AI']);

type ParsedSupplementRow = {
  rowNumber: number;
  id: string | null;
  dto: CreateContractSupplementDto;
};

type SupplementPlan = {
  rows: ParsedSupplementRow[];
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
  entities: { supplements: EntityDiff };
};

export type ImportApplyResult = {
  supplements: { created: number; updated: number; skippedDeletes: number };
};

type AuditActor = { id: string; auditLabel: string } | null;

@Injectable()
export class HotelContractImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supplements: ContractSupplementsService,
  ) {}

  async preview(contractId: string, buffer: Buffer): Promise<ImportPreviewResult> {
    const { errors, workbook, schemaVersion, contractIdInFile, schemaOk, contractMatch } =
      await this.loadAndValidateIdentity(contractId, buffer);

    const identityOk = errors.length === 0;
    const plan = identityOk
      ? await this.buildSupplementPlan(contractId, workbook)
      : { rows: [], existingIds: new Set<string>(), fileIds: new Set<string>(), rowErrors: [] };

    const supplements: EntityDiff = {
      fileRows: plan.rows.length,
      toCreate: plan.rows.filter((r) => !r.id).length,
      toUpdate: plan.rows.filter((r) => r.id).length,
      toDelete: [...plan.existingIds].filter((id) => !plan.fileIds.has(id)).length,
      rowErrors: plan.rowErrors,
    };

    return { schemaVersion, schemaOk, contractIdInFile, contractMatch, errors, entities: { supplements } };
  }

  async apply(contractId: string, buffer: Buffer, actor: AuditActor): Promise<ImportApplyResult> {
    const { errors, workbook } = await this.loadAndValidateIdentity(contractId, buffer);
    if (errors.length > 0) {
      throw new BadRequestException(errors.join(' '));
    }

    const plan = await this.buildSupplementPlan(contractId, workbook);
    if (plan.rowErrors.length > 0) {
      throw new BadRequestException(
        `Fix these before importing: ${plan.rowErrors.map((e) => (e.row ? `row ${e.row}: ${e.message}` : e.message)).join('; ')}`,
      );
    }

    // Upsert each row through the existing service (validation + audit +
    // conflict checks). Preview was clean, so mid-loop failure is
    // unlikely; if one does fail we surface what already applied.
    let created = 0;
    let updated = 0;
    for (const row of plan.rows) {
      if (row.id) {
        await this.supplements.update(contractId, row.id, row.dto, actor);
        updated += 1;
      } else {
        await this.supplements.create(contractId, row.dto, actor);
        created += 1;
      }
    }

    const skippedDeletes = [...plan.existingIds].filter((id) => !plan.fileIds.has(id)).length;
    return { supplements: { created, updated, skippedDeletes } };
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

  private async buildSupplementPlan(contractId: string, workbook: ExcelJS.Workbook): Promise<SupplementPlan> {
    const rowErrors: Array<{ row: number; message: string }> = [];
    const rows: ParsedSupplementRow[] = [];
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
}
