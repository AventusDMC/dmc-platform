import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';

// Hotels Engine — contract Excel IMPORT, preview (dry-run) phase.
//
// Round-trip step 2 of 2: consume a workbook produced by
// HotelContractExportService. This service is the NON-DESTRUCTIVE half —
// it parses + validates an uploaded workbook and reports what an import
// WOULD do (create / update / delete per entity), writing nothing. The
// apply phase (transactional create/update/delete + audit) lands in a
// follow-up, gated behind an explicit confirm of this preview.
//
// Scope today: the Supplements sheet (a clean flat list with a hidden
// _id per row). The other sheets follow the identical _id-diff pattern.

// Keep in sync with hotel-contract-export.service.ts (WORKBOOK_SCHEMA_VERSION
// and the _Reference metadata labels). A schema-version mismatch rejects
// the file rather than risk importing against a changed layout.
const WORKBOOK_SCHEMA_VERSION = 1;
const SHEET_REFERENCE = '_Reference';
const SHEET_SUPPLEMENTS = 'Supplements';

const SUPPLEMENT_TYPES = new Set(['EXTRA_BREAKFAST', 'EXTRA_LUNCH', 'EXTRA_DINNER', 'GALA_DINNER', 'EXTRA_BED']);
const SUPPLEMENT_CHARGE_BASES = new Set(['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT']);

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
  // Blocking problems with the file as a whole (wrong contract, wrong
  // schema, not a contract export). When non-empty the per-entity diff is
  // not computed — fix these and re-upload.
  errors: string[];
  entities: { supplements: EntityDiff };
};

@Injectable()
export class HotelContractImportService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(contractId: string, buffer: Buffer): Promise<ImportPreviewResult> {
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

    // --- Validate the workbook's identity from the hidden _Reference sheet ---
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

    const identityOk = errors.length === 0;
    const supplements = await this.previewSupplements(workbook, contractId, identityOk);

    return { schemaVersion, schemaOk, contractIdInFile, contractMatch, errors, entities: { supplements } };
  }

  private async previewSupplements(workbook: ExcelJS.Workbook, contractId: string, identityOk: boolean): Promise<EntityDiff> {
    const diff: EntityDiff = { fileRows: 0, toCreate: 0, toUpdate: 0, toDelete: 0, rowErrors: [] };
    const sheet = workbook.getWorksheet(SHEET_SUPPLEMENTS);
    if (!sheet) {
      return diff;
    }

    // Resolve columns by header text so the parser survives column
    // reordering (only the hidden _id is positionally column 1).
    const colByHeader: Record<string, number> = {};
    sheet.getRow(1).eachCell((cell, col) => {
      colByHeader[String(cell.value ?? '').trim()] = col;
    });
    const idCol = colByHeader['_id'] || 1;
    const typeCol = colByHeader['Type'];
    const basisCol = colByHeader['Charge Basis'];
    const amountCol = colByHeader['Amount'];

    const fileIds = new Set<string>();
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const id = String(row.getCell(idCol).value ?? '').trim();
      const type = String(typeCol ? row.getCell(typeCol).value ?? '' : '').trim();
      const amount = String(amountCol ? row.getCell(amountCol).value ?? '' : '').trim();
      // Ignore fully-blank trailing rows.
      if (!id && !type && !amount) return;

      diff.fileRows += 1;
      if (type && !SUPPLEMENT_TYPES.has(type.toUpperCase())) {
        diff.rowErrors.push({ row: rowNumber, message: `Type "${type}" is not one of ${[...SUPPLEMENT_TYPES].join(', ')}` });
      }
      const basis = String(basisCol ? row.getCell(basisCol).value ?? '' : '').trim();
      if (basis && !SUPPLEMENT_CHARGE_BASES.has(basis.toUpperCase())) {
        diff.rowErrors.push({ row: rowNumber, message: `Charge Basis "${basis}" is not valid` });
      }
      if (amount && !(Number.isFinite(Number(amount)) && Number(amount) >= 0)) {
        diff.rowErrors.push({ row: rowNumber, message: `Amount "${amount}" must be a non-negative number` });
      }

      if (id) {
        fileIds.add(id);
        diff.toUpdate += 1;
      } else {
        diff.toCreate += 1;
      }
    });

    if (identityOk) {
      const existing: Array<{ id: string }> = await (this.prisma as any).hotelContractSupplement.findMany({
        where: { hotelContractId: contractId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((s) => s.id));
      // Rows present in the DB but absent from the file → deleted on import.
      existingIds.forEach((id) => {
        if (!fileIds.has(id)) diff.toDelete += 1;
      });
      // A row carrying an _id we don't recognize can't be matched — flag it
      // rather than silently treat it as a create.
      fileIds.forEach((id) => {
        if (!existingIds.has(id)) {
          diff.rowErrors.push({ row: 0, message: `A supplement row references an unknown _id (${id.slice(0, 8)}…)` });
          diff.toUpdate -= 1;
        }
      });
    }

    return diff;
  }
}
