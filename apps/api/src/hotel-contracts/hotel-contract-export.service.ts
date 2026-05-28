import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// CommonJS interop — matches the pattern used by route-standards and
// vehicle-rates exporters. Avoids the TS config quirk that breaks
// `import ExcelJS from 'exceljs'`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require('exceljs');

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Brand-style colors for header / system / editable column fills. Same
// palette as the supplier tariff matrix exporter so the workbook visual
// language stays consistent across exports.
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } } as const;
const SYSTEM_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } } as const;
const EDITABLE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F8E8' } } as const;
const README_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } } as const;

// Sheet name constants — also serve as the contract the future import
// flow will validate against. Don't rename without updating import too.
const SHEETS = {
  README: 'README',
  MASTER: 'Master',
  RATES: 'Rates',
  SUPPLEMENTS: 'Supplements',
  CANCELLATION: 'Cancellation',
  CHILD_POLICY: 'ChildPolicy',
  MEAL_PLANS: 'MealPlans',
  // Hidden sheet — drives the Room Category dropdown via a range
  // reference. See buildReferenceSheet for why it can't be inline.
  REFERENCE: '_Reference',
} as const;

type ContractExportResult = {
  buffer: Buffer;
  fileName: string;
};

@Injectable()
export class HotelContractExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a multi-sheet Excel workbook capturing every operator-editable
   * field on a hotel contract — rates, supplements, cancellation policy
   * + rules, child policy + bands, meal plans. The Master sheet holds
   * the contract metadata. Each entity sheet has a hidden _id column as
   * column A so the future import flow can match rows on re-upload
   * (rows with an _id update; rows with blank _id are created; rows
   * removed from the sheet are deleted on import — same semantics as
   * established by route-standards and supplier-tariff-matrix).
   */
  async exportContract(contractId: string): Promise<ContractExportResult> {
    const contract = await this.prisma.hotelContract.findUnique({
      where: { id: contractId },
      include: {
        hotel: {
          select: {
            id: true,
            name: true,
            city: true,
            roomCategories: {
              orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
              select: { id: true, name: true, code: true, isActive: true },
            },
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException(`Hotel contract ${contractId} not found`);
    }

    // Pull every editable child entity in parallel. Each list query is
    // small (contracts carry tens to hundreds of rows per entity, not
    // thousands) so a single round-trip is fine.
    const supplementModel = (this.prisma as any).hotelContractSupplement;
    const cancellationModel = (this.prisma as any).hotelContractCancellationPolicy;
    const childPolicyModel = (this.prisma as any).hotelContractChildPolicy;
    const mealPlanModel = (this.prisma as any).hotelContractMealPlan;

    const [rates, supplements, cancellationPolicy, childPolicy, mealPlans] = await Promise.all([
      this.prisma.hotelRate.findMany({
        where: { contractId },
        include: { roomCategory: { select: { id: true, name: true, code: true } } },
        orderBy: [{ seasonFrom: 'asc' }, { seasonName: 'asc' }, { createdAt: 'asc' }],
      }),
      supplementModel.findMany({
        where: { hotelContractId: contractId },
        include: { roomCategory: { select: { id: true, name: true, code: true } } },
        orderBy: [{ type: 'asc' }, { roomCategoryId: 'asc' }, { createdAt: 'asc' }],
      }),
      cancellationModel.findUnique({
        where: { hotelContractId: contractId },
        include: {
          rules: {
            orderBy: [{ deadlineUnit: 'asc' }, { windowFromValue: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
      childPolicyModel.findUnique({
        where: { hotelContractId: contractId },
        include: {
          bands: {
            orderBy: [{ minAge: 'asc' }, { createdAt: 'asc' }],
          },
        },
      }),
      mealPlanModel.findMany({
        where: { hotelContractId: contractId },
        orderBy: [{ code: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DMC Platform — Hotels';
    workbook.created = new Date();

    this.buildReadmeSheet(workbook, contract);
    this.buildMasterSheet(workbook, contract);
    this.buildRatesSheet(workbook, rates, contract.hotel.roomCategories);
    this.buildSupplementsSheet(workbook, supplements, contract.hotel.roomCategories);
    this.buildCancellationSheet(workbook, cancellationPolicy);
    this.buildChildPolicySheet(workbook, childPolicy);
    this.buildMealPlansSheet(workbook, mealPlans);

    // Reference sheet drives the Room Category dropdowns (names can
    // contain commas which would break an inline list) — built last so
    // it sits at the end of the workbook, then hidden so the contract
    // manager doesn't see it. Sheet order: README → Master → entity
    // sheets → (hidden) Reference.
    this.buildReferenceSheet(workbook, contract.hotel.roomCategories);
    this.applyAllDropdowns(workbook);

    const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;
    const safeName = String(contract.name || 'contract').replace(/[^a-z0-9-_]+/gi, '_');
    const fileName = `Contract_${safeName}_${contract.id.slice(0, 8)}.xlsx`;
    return { buffer: Buffer.from(buffer), fileName };
  }

  // -------- per-sheet builders --------

  private buildReadmeSheet(workbook: any, contract: any) {
    const sheet = workbook.addWorksheet(SHEETS.README, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [{ header: 'How to use this workbook', key: 'info', width: 110 }];
    this.styleHeaderRow(sheet, 1, README_FILL);

    const lines = [
      `Contract: ${contract.name}`,
      `Hotel: ${contract.hotel.name} (${contract.hotel.city || 'no city'})`,
      `Validity: ${formatDate(contract.validFrom)} → ${formatDate(contract.validTo)}`,
      `Currency: ${contract.currency}`,
      `Exported: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
      '',
      '— Editing rules —',
      '• Each sheet (Rates, Supplements, Cancellation, ChildPolicy, MealPlans) is a separate entity.',
      '• Column A on every entity sheet is the hidden system ID (_id). DO NOT edit or reorder column A.',
      '• Rows with an existing _id will be updated on re-import.',
      '• Rows with a blank _id will be created on re-import.',
      '• Rows you delete here will be deleted from the contract on re-import.',
      '• Master sheet is read-only context — changes there are ignored on import.',
      '• Re-import on the same contract: open the contract in the admin app and use "Upload Excel".',
      '',
      '— Validation —',
      '• Currency: 3-letter ISO code (USD / JOD / AED / EUR / GBP).',
      '• Occupancy: SGL / DBL / TPL.',
      '• Meal plan: RO / BB / HB / FB / AI.',
      '• Pricing basis: PER_ROOM / PER_PERSON.',
      '• Penalty type: PERCENT / NIGHTS / FULL_STAY / FIXED.',
      '• Cancellation deadline unit: DAYS / HOURS.',
      '• Child policy charge basis: FREE / PERCENT_OF_ADULT / FIXED_AMOUNT.',
      '• Supplement type: EXTRA_BREAKFAST / EXTRA_LUNCH / EXTRA_DINNER / GALA_DINNER / EXTRA_BED.',
      '• Supplement charge basis: PER_PERSON / PER_ROOM / PER_STAY / PER_NIGHT.',
      '• Yes/No columns accept Yes / No (case-insensitive).',
      '',
      '— Round-trip safety —',
      '• The import flow validates first and shows a preview diff before writing anything.',
      '• Validation errors block the import — you fix the file and re-upload.',
      '• Audit log records who imported, when, and what changed.',
    ];
    for (const line of lines) {
      sheet.addRow([line]);
    }
  }

  private buildMasterSheet(workbook: any, contract: any) {
    const sheet = workbook.addWorksheet(SHEETS.MASTER, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: 'Field', key: 'field', width: 24 },
      { header: 'Value', key: 'value', width: 60 },
    ];
    this.styleHeaderRow(sheet, 1);

    const rows: Array<[string, string]> = [
      ['Contract ID', contract.id],
      ['Contract name', contract.name],
      ['Hotel ID', contract.hotelId],
      ['Hotel name', contract.hotel.name],
      ['Hotel city', contract.hotel.city || ''],
      ['Valid from', formatDate(contract.validFrom)],
      ['Valid to', formatDate(contract.validTo)],
      ['Currency', contract.currency],
      ['Confidence', contract.confidence ?? ''],
      ['Verified by', contract.verifiedBy ?? ''],
      ['Last verified', contract.lastVerifiedAt ? formatDate(contract.lastVerifiedAt) : ''],
      ['Verification notes', contract.verificationNotes ?? ''],
    ];
    for (const [field, value] of rows) {
      sheet.addRow({ field, value });
    }
    // Master sheet is read-only context — paint everything grey so the
    // contract manager doesn't try to edit it.
    sheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
      if (rowNumber === 1) return;
      row.eachCell((cell: any) => {
        cell.fill = SYSTEM_FILL;
      });
    });
  }

  private buildRatesSheet(workbook: any, rates: any[], _rooms: any[]) {
    const sheet = workbook.addWorksheet(SHEETS.RATES, {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
    });
    sheet.columns = [
      { header: '_id', key: 'id', width: 38 },
      { header: 'Room Category', key: 'roomCategory', width: 28 },
      { header: 'Room Code', key: 'roomCode', width: 12 },
      { header: 'Occupancy', key: 'occupancyType', width: 11 },
      { header: 'Meal Plan', key: 'mealPlan', width: 11 },
      { header: 'Season Name', key: 'seasonName', width: 22 },
      { header: 'Season From', key: 'seasonFrom', width: 14 },
      { header: 'Season To', key: 'seasonTo', width: 14 },
      { header: 'Pricing Basis', key: 'pricingBasis', width: 14 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Cost', key: 'cost', width: 12 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];
    this.styleHeaderRow(sheet, 1);

    for (const rate of rates) {
      sheet.addRow({
        id: rate.id,
        roomCategory: rate.roomCategory?.name ?? '',
        roomCode: rate.roomCategory?.code ?? '',
        occupancyType: rate.occupancyType,
        mealPlan: rate.mealPlan,
        seasonName: rate.seasonName,
        seasonFrom: formatDate(rate.seasonFrom),
        seasonTo: formatDate(rate.seasonTo),
        pricingBasis: rate.pricingBasis || 'PER_ROOM',
        currency: rate.currency,
        cost: rate.cost,
        notes: '',
      });
    }
    this.paintEditableColumns(sheet, ['_id', 'Room Code']);
  }

  private buildSupplementsSheet(workbook: any, supplements: any[], _rooms: any[]) {
    const sheet = workbook.addWorksheet(SHEETS.SUPPLEMENTS, {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
    });
    sheet.columns = [
      { header: '_id', key: 'id', width: 38 },
      { header: 'Room Category (blank = all rooms)', key: 'roomCategory', width: 32 },
      { header: 'Type', key: 'type', width: 18 },
      { header: 'Charge Basis', key: 'chargeBasis', width: 14 },
      { header: 'Amount', key: 'amount', width: 12 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Mandatory', key: 'isMandatory', width: 11 },
      { header: 'Active', key: 'isActive', width: 9 },
      { header: 'Notes', key: 'notes', width: 36 },
    ];
    this.styleHeaderRow(sheet, 1);

    for (const supplement of supplements) {
      sheet.addRow({
        id: supplement.id,
        roomCategory: supplement.roomCategory?.name ?? '',
        type: supplement.type,
        chargeBasis: supplement.chargeBasis,
        amount: supplement.amount,
        currency: supplement.currency,
        isMandatory: supplement.isMandatory ? 'Yes' : 'No',
        isActive: supplement.isActive ? 'Yes' : 'No',
        notes: supplement.notes ?? '',
      });
    }
    this.paintEditableColumns(sheet, ['_id']);
  }

  private buildCancellationSheet(workbook: any, policy: any) {
    const sheet = workbook.addWorksheet(SHEETS.CANCELLATION, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: '_id', key: 'id', width: 38 },
      { header: 'Row Type', key: 'rowType', width: 12 },
      { header: 'Summary / Rule Notes', key: 'summary', width: 40 },
      { header: 'No-show Penalty Type', key: 'noShowPenaltyType', width: 20 },
      { header: 'No-show Penalty Value', key: 'noShowPenaltyValue', width: 20 },
      { header: 'Window From', key: 'windowFromValue', width: 12 },
      { header: 'Window To', key: 'windowToValue', width: 12 },
      { header: 'Deadline Unit', key: 'deadlineUnit', width: 14 },
      { header: 'Penalty Type', key: 'penaltyType', width: 14 },
      { header: 'Penalty Value', key: 'penaltyValue', width: 14 },
      { header: 'Active', key: 'isActive', width: 9 },
      { header: 'Policy Notes', key: 'policyNotes', width: 30 },
    ];
    this.styleHeaderRow(sheet, 1);

    if (policy) {
      // First row: the policy header itself (single row per contract).
      sheet.addRow({
        id: policy.id,
        rowType: 'POLICY',
        summary: policy.summary ?? '',
        noShowPenaltyType: policy.noShowPenaltyType ?? '',
        noShowPenaltyValue: policy.noShowPenaltyValue ?? '',
        windowFromValue: '',
        windowToValue: '',
        deadlineUnit: '',
        penaltyType: '',
        penaltyValue: '',
        isActive: '',
        policyNotes: policy.notes ?? '',
      });
      // Then each rule on its own row.
      for (const rule of policy.rules || []) {
        sheet.addRow({
          id: rule.id,
          rowType: 'RULE',
          summary: rule.notes ?? '',
          noShowPenaltyType: '',
          noShowPenaltyValue: '',
          windowFromValue: rule.windowFromValue,
          windowToValue: rule.windowToValue,
          deadlineUnit: rule.deadlineUnit,
          penaltyType: rule.penaltyType,
          penaltyValue: rule.penaltyValue ?? '',
          isActive: rule.isActive ? 'Yes' : 'No',
          policyNotes: '',
        });
      }
    }
    this.paintEditableColumns(sheet, ['_id', 'Row Type']);
  }

  private buildChildPolicySheet(workbook: any, policy: any) {
    const sheet = workbook.addWorksheet(SHEETS.CHILD_POLICY, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: '_id', key: 'id', width: 38 },
      { header: 'Row Type', key: 'rowType', width: 12 },
      { header: 'Infant Max Age', key: 'infantMaxAge', width: 14 },
      { header: 'Child Max Age', key: 'childMaxAge', width: 14 },
      { header: 'Band Label', key: 'label', width: 24 },
      { header: 'Band Min Age', key: 'minAge', width: 12 },
      { header: 'Band Max Age', key: 'maxAge', width: 12 },
      { header: 'Charge Basis', key: 'chargeBasis', width: 18 },
      { header: 'Charge Value', key: 'chargeValue', width: 14 },
      { header: 'Active', key: 'isActive', width: 9 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];
    this.styleHeaderRow(sheet, 1);

    if (policy) {
      sheet.addRow({
        id: policy.id,
        rowType: 'POLICY',
        infantMaxAge: policy.infantMaxAge,
        childMaxAge: policy.childMaxAge,
        label: '',
        minAge: '',
        maxAge: '',
        chargeBasis: '',
        chargeValue: '',
        isActive: '',
        notes: policy.notes ?? '',
      });
      for (const band of policy.bands || []) {
        sheet.addRow({
          id: band.id,
          rowType: 'BAND',
          infantMaxAge: '',
          childMaxAge: '',
          label: band.label,
          minAge: band.minAge,
          maxAge: band.maxAge,
          chargeBasis: band.chargeBasis,
          chargeValue: band.chargeValue ?? '',
          isActive: band.isActive ? 'Yes' : 'No',
          notes: band.notes ?? '',
        });
      }
    }
    this.paintEditableColumns(sheet, ['_id', 'Row Type']);
  }

  private buildMealPlansSheet(workbook: any, mealPlans: any[]) {
    const sheet = workbook.addWorksheet(SHEETS.MEAL_PLANS, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.columns = [
      { header: '_id', key: 'id', width: 38 },
      { header: 'Code', key: 'code', width: 8 },
      { header: 'Default', key: 'isDefault', width: 9 },
      { header: 'Active', key: 'isActive', width: 9 },
      { header: 'Notes', key: 'notes', width: 36 },
    ];
    this.styleHeaderRow(sheet, 1);

    for (const mp of mealPlans) {
      sheet.addRow({
        id: mp.id,
        code: mp.code,
        isDefault: mp.isDefault ? 'Yes' : 'No',
        isActive: mp.isActive ? 'Yes' : 'No',
        notes: mp.notes ?? '',
      });
    }
    this.paintEditableColumns(sheet, ['_id', 'Default']);
  }

  // -------- styling helpers --------

  private styleHeaderRow(sheet: any, rowNumber: number, fill: any = HEADER_FILL) {
    sheet.getRow(rowNumber).eachCell((cell: any) => {
      cell.font = { bold: true };
      cell.fill = fill;
    });
    sheet.getRow(rowNumber).commit?.();
  }

  /**
   * Color body cells so the contract manager visually distinguishes
   * editable green cells from greyed system-managed cells like _id.
   * Pass the column HEADER names (not keys) that should stay system-grey;
   * the rest are painted editable green.
   */
  private paintEditableColumns(sheet: any, systemColumnHeaders: string[]) {
    const systemSet = new Set(systemColumnHeaders);
    sheet.columns.forEach((column: any, index: number) => {
      const headerCell = sheet.getRow(1).getCell(index + 1);
      const isSystem = systemSet.has(String(headerCell.value || ''));
      column.eachCell({ includeEmpty: false }, (cell: any, rowNumber: number) => {
        if (rowNumber === 1) return;
        cell.fill = isSystem ? SYSTEM_FILL : EDITABLE_FILL;
      });
    });
  }

  // -------- Reference sheet + dropdown wiring --------

  /**
   * Hidden Reference sheet at the back of the workbook. Holds the list
   * of Room Category names for this contract's hotel so the Rates and
   * Supplements dropdowns can reference a range (room names may contain
   * commas, which would break an inline list formula). All other enum
   * dropdowns use inline lists since their values are short and stable.
   */
  private buildReferenceSheet(workbook: any, roomCategories: Array<{ name: string; isActive: boolean }>) {
    const sheet = workbook.addWorksheet(SHEETS.REFERENCE);
    sheet.columns = [
      { header: 'Room Category', key: 'roomCategory', width: 36 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const room of roomCategories) {
      sheet.addRow({ roomCategory: room.name });
    }
    // Hide the sheet so the contract manager only sees the seven
    // operator-facing tabs. exceljs honors 'veryHidden' which can't be
    // un-hidden from the Excel UI (only via VBA / dev tools), keeping
    // the workbook visually clean.
    sheet.state = 'veryHidden';
  }

  /**
   * Apply every enum dropdown across the workbook in one place. Keeps
   * the validation contract centralized so adding a new enum is a
   * one-line change rather than digging through five buildXxxSheet
   * methods. Dropdowns are applied to rows 2-1000 so the contract
   * manager can add new rows below the exported data and still get the
   * dropdown picker.
   */
  private applyAllDropdowns(workbook: any) {
    const rates = workbook.getWorksheet(SHEETS.RATES);
    if (rates) {
      this.applyRangeDropdown(rates, 'roomCategory', { type: 'range', range: `'${SHEETS.REFERENCE}'!$A$2:$A$1000` });
      this.applyEnumDropdown(rates, 'occupancyType', ['SGL', 'DBL', 'TPL']);
      this.applyEnumDropdown(rates, 'mealPlan', ['RO', 'BB', 'HB', 'FB', 'AI']);
      this.applyEnumDropdown(rates, 'pricingBasis', ['PER_ROOM', 'PER_PERSON']);
      this.applyEnumDropdown(rates, 'currency', CURRENCY_CODES);
    }
    const supplements = workbook.getWorksheet(SHEETS.SUPPLEMENTS);
    if (supplements) {
      this.applyRangeDropdown(supplements, 'roomCategory', {
        type: 'range',
        range: `'${SHEETS.REFERENCE}'!$A$2:$A$1000`,
        allowBlank: true,
      });
      this.applyEnumDropdown(supplements, 'type', [
        'EXTRA_BREAKFAST',
        'EXTRA_LUNCH',
        'EXTRA_DINNER',
        'GALA_DINNER',
        'EXTRA_BED',
      ]);
      this.applyEnumDropdown(supplements, 'chargeBasis', ['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT']);
      this.applyEnumDropdown(supplements, 'currency', CURRENCY_CODES);
      this.applyEnumDropdown(supplements, 'isMandatory', ['Yes', 'No']);
      this.applyEnumDropdown(supplements, 'isActive', ['Yes', 'No']);
    }
    const cancellation = workbook.getWorksheet(SHEETS.CANCELLATION);
    if (cancellation) {
      this.applyEnumDropdown(cancellation, 'rowType', ['POLICY', 'RULE']);
      this.applyEnumDropdown(cancellation, 'noShowPenaltyType', ['PERCENT', 'NIGHTS', 'FULL_STAY', 'FIXED'], { allowBlank: true });
      this.applyEnumDropdown(cancellation, 'deadlineUnit', ['DAYS', 'HOURS'], { allowBlank: true });
      this.applyEnumDropdown(cancellation, 'penaltyType', ['PERCENT', 'NIGHTS', 'FULL_STAY', 'FIXED'], { allowBlank: true });
      this.applyEnumDropdown(cancellation, 'isActive', ['Yes', 'No'], { allowBlank: true });
    }
    const childPolicy = workbook.getWorksheet(SHEETS.CHILD_POLICY);
    if (childPolicy) {
      this.applyEnumDropdown(childPolicy, 'rowType', ['POLICY', 'BAND']);
      this.applyEnumDropdown(childPolicy, 'chargeBasis', ['FREE', 'PERCENT_OF_ADULT', 'FIXED_AMOUNT'], { allowBlank: true });
      this.applyEnumDropdown(childPolicy, 'isActive', ['Yes', 'No'], { allowBlank: true });
    }
    const mealPlans = workbook.getWorksheet(SHEETS.MEAL_PLANS);
    if (mealPlans) {
      this.applyEnumDropdown(mealPlans, 'code', ['RO', 'BB', 'HB', 'FB', 'AI']);
      this.applyEnumDropdown(mealPlans, 'isDefault', ['Yes', 'No']);
      this.applyEnumDropdown(mealPlans, 'isActive', ['Yes', 'No']);
    }
  }

  /**
   * Inline dropdown — values become a comma-separated list embedded
   * directly in the worksheet. Excel caps this at 255 characters; all
   * the enum lists we use are well under (5 currencies, 5 meal plans,
   * 4 penalty types, etc.). Use applyRangeDropdown if the list could
   * grow long or contain commas (e.g. room category names).
   */
  private applyEnumDropdown(
    sheet: any,
    columnKey: string,
    values: string[],
    opts?: { allowBlank?: boolean },
  ) {
    const range = this.columnRange(sheet, columnKey);
    if (!range) return;
    sheet.dataValidations.add(range, {
      type: 'list',
      allowBlank: opts?.allowBlank !== false,
      formulae: [`"${values.join(',')}"`],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Invalid value',
      error: `Pick one of: ${values.join(', ')}`,
    });
  }

  private applyRangeDropdown(
    sheet: any,
    columnKey: string,
    config: { type: 'range'; range: string; allowBlank?: boolean },
  ) {
    const range = this.columnRange(sheet, columnKey);
    if (!range) return;
    sheet.dataValidations.add(range, {
      type: 'list',
      allowBlank: config.allowBlank !== false,
      formulae: [config.range],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Invalid value',
      error: 'Pick a value from the dropdown (or leave blank where allowed).',
    });
  }

  /**
   * Resolve a column key (e.g. 'occupancyType') to its A1-style range
   * spanning rows 2 to 1000 (e.g. 'D2:D1000'). The wide row range lets
   * new rows added below the exported data still inherit the dropdown
   * without the contract manager having to copy-paste validation.
   */
  private columnRange(sheet: any, columnKey: string): string | null {
    const column = sheet.getColumn(columnKey);
    if (!column || !column.letter) return null;
    return `${column.letter}2:${column.letter}1000`;
  }
}

// Centralized so the same list drives the create form on the v2 pages,
// the Excel dropdown, and (next PR) the import validator. Plain string[]
// (not `as const`) so the dropdown helpers can pass it without TS
// readonly-array friction.
const CURRENCY_CODES: string[] = ['USD', 'JOD', 'AED', 'EUR', 'GBP'];

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

export { EXCEL_MIME };
