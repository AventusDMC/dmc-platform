import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/auth.decorators';
import { RouteStandardInput, RouteStandardsService, computeRouteTimingConfidence } from './route-standards.service';

// CommonJS interop — matches the pattern used by touring-routes.controller.ts.
// Avoids the TS config quirk that breaks `import ExcelJS from 'exceljs'`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require('exceljs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { memoryStorage } = require('multer');

type CreateBody = RouteStandardInput;
type UpdateBody = Partial<RouteStandardInput>;

const SHEET_NAME = 'Route Standards';
const COLUMN_HEADERS = [
  'Route Code',
  'Route Name',
  'From City',
  'To City',
  'Destination Area',
  'Standard Distance (km)',
  'Standard Duration (hours)',
  'Operational Buffer (minutes)',
  'Long Distance Flag',
  'Overnight Risk',
  'Mountain Road Flag',
  'Border Crossing Flag',
  'Airport Route Flag',
  'Notes',
  'Active',
  'Timing Confidence (derived, read-only)',
] as const;

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const str = String(value ?? '').trim().toLowerCase();
  return str === 'true' || str === 'yes' || str === '1' || str === 'y';
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

@Controller('route-standards')
export class RouteStandardsController {
  constructor(private readonly routeStandardsService: RouteStandardsService) {}

  @Get()
  findAll() {
    return this.routeStandardsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.routeStandardsService.findOne(id);
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: CreateBody) {
    return this.routeStandardsService.create(body);
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: UpdateBody) {
    return this.routeStandardsService.update(id, body);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.routeStandardsService.remove(id);
  }

  /**
   * Auto-bootstrap RouteStandard rows from existing TouringRoute +
   * TRANSFER_ROUTE entries. Never overwrites existing standards. Returns
   * a summary the admin UI surfaces to the operator.
   */
  @Post('bootstrap')
  @Roles('admin', 'operations')
  bootstrap() {
    return this.routeStandardsService.bootstrapFromExistingRoutes();
  }

  /**
   * Excel export — one row per route standard. Sheet name fixed at
   * "Route Standards" so the import path can validate it.
   */
  @Get('workbook/export')
  async exportWorkbook(): Promise<StreamableFile> {
    const rows = await this.routeStandardsService.findAll();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(SHEET_NAME);
    sheet.addRow([...COLUMN_HEADERS]);
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow([
        row.routeCode,
        row.routeName,
        row.fromCity ?? '',
        row.toCity ?? '',
        row.destinationArea ?? '',
        row.standardDistanceKm ?? '',
        row.standardDurationHours ?? '',
        row.operationalBufferMinutes ?? '',
        row.longDistanceFlag ? 'Yes' : 'No',
        row.overnightRisk ? 'Yes' : 'No',
        row.mountainRoadFlag ? 'Yes' : 'No',
        row.borderCrossingFlag ? 'Yes' : 'No',
        row.airportRouteFlag ? 'Yes' : 'No',
        row.notes ?? '',
        row.isActive ? 'Yes' : 'No',
        computeRouteTimingConfidence(row),
      ]);
    }
    sheet.columns.forEach((column: any) => {
      column.width = 22;
    });
    const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="route-standards.xlsx"',
    });
  }

  /**
   * Excel import — preview returns parsed rows without persisting. Lets the
   * operator review what's about to land before committing.
   */
  @Post('workbook/preview')
  @Roles('admin', 'operations')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  async previewImport(@UploadedFile() file: { buffer: Buffer } | undefined) {
    const rows = await this.parseWorkbook(file);
    return { rows, count: rows.length };
  }

  @Post('workbook/import')
  @Roles('admin', 'operations')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  async runImport(@UploadedFile() file: { buffer: Buffer } | undefined) {
    const rows = await this.parseWorkbook(file);
    return this.routeStandardsService.bulkUpsert(rows);
  }

  private async parseWorkbook(file: { buffer: Buffer } | undefined): Promise<RouteStandardInput[]> {
    if (!file?.buffer) {
      throw new BadRequestException('Upload a .xlsx file under "file"');
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException(`Workbook is missing the "${SHEET_NAME}" sheet`);
    }

    const rows: RouteStandardInput[] = [];
    sheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
      if (rowNumber === 1) return; // header

      const cell = (n: number) => {
        const value = row.getCell(n).value;
        if (value === null || value === undefined) return '';
        if (typeof value === 'object' && 'text' in value) return String(value.text);
        if (typeof value === 'object' && 'result' in value) return String(value.result);
        return String(value);
      };

      const routeCode = cell(1).trim();
      const routeName = cell(2).trim();
      if (!routeCode || !routeName) return; // skip blank rows

      rows.push({
        routeCode,
        routeName,
        fromCity: cell(3).trim() || null,
        toCity: cell(4).trim() || null,
        destinationArea: cell(5).trim() || null,
        standardDistanceKm: parseOptionalNumber(cell(6)),
        standardDurationHours: parseOptionalNumber(cell(7)),
        operationalBufferMinutes: parseOptionalNumber(cell(8)),
        longDistanceFlag: parseBoolean(cell(9)),
        overnightRisk: parseBoolean(cell(10)),
        mountainRoadFlag: parseBoolean(cell(11)),
        borderCrossingFlag: parseBoolean(cell(12)),
        airportRouteFlag: parseBoolean(cell(13)),
        notes: cell(14).trim() || null,
        isActive: cell(15).trim().toLowerCase() === 'no' ? false : true,
      });
    });
    return rows;
  }
}
