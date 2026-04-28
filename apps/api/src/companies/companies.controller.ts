import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { Actor } from '../auth/auth.decorators';
import { AuthenticatedActor } from '../auth/auth.types';
import { CompaniesService } from './companies.service';

const { diskStorage } = require('multer');

type CreateCompanyBody = {
  name: string;
  type?: string;
  website?: string;
  logoUrl?: string;
  primaryColor?: string;
  country?: string;
  city?: string;
};

type UpdateCompanyBody = {
  name?: string;
  type?: string;
  website?: string;
  logoUrl?: string;
  primaryColor?: string;
  country?: string;
  city?: string;
};

type UpdateBrandingBody = {
  displayName?: string | null;
  logoUrl?: string | null;
  headerTitle?: string | null;
  headerSubtitle?: string | null;
  footerText?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

const BRANDING_UPLOAD_DIR = join(process.cwd(), 'apps', 'api', 'uploads', 'branding');

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  findAll(@Actor() actor: AuthenticatedActor) {
    return this.companiesService.findAll(actor);
  }

  @Get(':id/performance')
  getPerformance(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.companiesService.getPerformance(id, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.companiesService.findOne(id, actor);
  }

  @Get(':id/branding')
  getBranding(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.companiesService.getBranding(id, actor);
  }

  @Post()
  create(@Body() body: CreateCompanyBody, @Actor() actor: AuthenticatedActor) {
    return this.companiesService.create(body, actor);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCompanyBody, @Actor() actor: AuthenticatedActor) {
    return this.companiesService.update(id, body, actor);
  }

  @Patch(':id/branding')
  updateBranding(@Param('id') id: string, @Body() body: UpdateBrandingBody, @Actor() actor: AuthenticatedActor) {
    return this.companiesService.updateBranding(id, body, actor);
  }

  @Post(':id/branding/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, callback: any) => {
          mkdirSync(BRANDING_UPLOAD_DIR, { recursive: true });
          callback(null, BRANDING_UPLOAD_DIR);
        },
        filename: (req: any, file: any, callback: any) => {
          const companyId = String(req.params.id || 'company').replace(/[^a-zA-Z0-9_-]/g, '');
          const extension = extname(file.originalname || '').toLowerCase() || '.png';
          callback(null, `${companyId}-${Date.now()}${extension}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (_req: any, file: any, callback: any) => {
        callback(null, file.mimetype.startsWith('image/'));
      },
    }),
  )
  async uploadBrandingLogo(@Param('id') id: string, @UploadedFile() file?: any, @Actor() actor?: AuthenticatedActor) {
    if (!file) {
      throw new BadRequestException('A logo image file is required');
    }

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are supported for company branding');
    }

    const logoUrl = `/uploads/branding/${file.filename}`;
    return this.companiesService.updateBrandingLogo(id, logoUrl, actor);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Actor() actor: AuthenticatedActor) {
    return this.companiesService.remove(id, actor);
  }
}
