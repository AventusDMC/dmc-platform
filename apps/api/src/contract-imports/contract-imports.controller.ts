import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { Actor } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { ContractImportsService } from './contract-imports.service';

const { diskStorage } = require('multer');

const CONTRACT_UPLOAD_DIR = join(process.cwd(), 'apps', 'api', 'uploads', 'contracts');

type AnalyzeBody = {
  contractType?: 'HOTEL' | 'TRANSPORT' | 'ACTIVITY';
  supplierId?: string;
  supplierName?: string;
  contractYear?: string;
  validFrom?: string;
  validTo?: string;
};

type ApproveBody = {
  data?: unknown;
  mode?: 'replace' | 'version' | 'cancel';
};

@Controller('contract-imports')
export class ContractImportsController {
  constructor(private readonly contractImportsService: ContractImportsService) {}

  @Get()
  findAll() {
    return this.contractImportsService.findAll();
  }

  @Post('analyze')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, callback: any) => {
          mkdirSync(CONTRACT_UPLOAD_DIR, { recursive: true });
          callback(null, CONTRACT_UPLOAD_DIR);
        },
        filename: (_req: any, file: any, callback: any) => {
          const extension = extname(file.originalname || '').toLowerCase();
          const safeBase = String(file.originalname || 'contract')
            .replace(extension, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80);
          callback(null, `${safeBase || 'contract'}-${Date.now()}${extension || '.dat'}`);
        },
      }),
      limits: {
        fileSize: 25 * 1024 * 1024,
      },
    }),
  )
  analyze(@Body() body: AnalyzeBody, @UploadedFile() file: any, @Actor() actor: AuthenticatedActor) {
    if (!file) {
      throw new BadRequestException('Contract file is required');
    }

    return this.contractImportsService.analyze(
      {
        contractType: body.contractType,
        supplierId: body.supplierId,
        supplierName: body.supplierName,
        contractYear: body.contractYear,
        validFrom: body.validFrom,
        validTo: body.validTo,
        file,
      },
      actor,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractImportsService.findOne(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: ApproveBody, @Actor() actor: AuthenticatedActor) {
    return this.contractImportsService.approve(id, body.data, actor, body.mode === 'replace' || body.mode === 'version' ? body.mode : undefined);
  }

  @Post(':id/reimport')
  reimport(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.contractImportsService.reimport(id, actor);
  }

  @Post(':id/export-excel')
  async exportExcel(@Param('id') id: string, @Res({ passthrough: true }) response: any) {
    const exported = await this.contractImportsService.exportExcel(id);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename="${exported.fileName}"`);
    return new StreamableFile(exported.buffer);
  }
}
