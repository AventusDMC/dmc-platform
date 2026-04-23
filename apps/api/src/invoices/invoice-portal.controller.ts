import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { Public } from '../auth/auth.decorators';
import { BookingsService } from '../bookings/bookings.service';

const { diskStorage } = require('multer');
const PAYMENT_PROOF_UPLOAD_DIR = join(process.cwd(), 'apps', 'api', 'uploads', 'payment-proofs');

@Controller('invoice')
export class InvoicePortalController {
  constructor(private readonly bookingsService: BookingsService) {}

  private normalizeUserAgent(value: string | string[] | undefined) {
    if (Array.isArray(value)) {
      return value[0]?.trim() || null;
    }

    return value?.trim() || null;
  }

  private normalizeReference(value: string | undefined) {
    const normalized = value?.trim() || '';
    return normalized || null;
  }

  private normalizeAmount(value: string | undefined) {
    const normalized = value?.trim() || '';
    if (!normalized) {
      return null;
    }

    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    return Number(amount.toFixed(2));
  }

  @Get(':token')
  @Public()
  async findInvoice(@Param('token') token: string, @Headers('user-agent') userAgent?: string | string[]) {
    const invoice = await this.bookingsService.findInvoicePortalByToken(token, {
      trackView: true,
      userAgent: this.normalizeUserAgent(userAgent),
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  @Get(':token/pdf')
  @Public()
  async downloadInvoicePdf(@Param('token') token: string, @Res({ passthrough: true }) response: any) {
    const invoice = await this.bookingsService.generateInvoicePdfByToken(token);
    const fileName =
      `${invoice.bookingRef || 'booking'}-invoice`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'booking-invoice';

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);

    return new StreamableFile(invoice.pdfBuffer);
  }

  @Post(':token/acknowledge')
  @Public()
  acknowledgeInvoice(@Param('token') token: string, @Headers('user-agent') userAgent?: string | string[]) {
    return this.bookingsService.acknowledgeInvoicePortal(token, {
      userAgent: this.normalizeUserAgent(userAgent),
    });
  }

  @Post(':token/payment-proof')
  @Public()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req: any, _file: any, callback: any) => {
          mkdirSync(PAYMENT_PROOF_UPLOAD_DIR, { recursive: true });
          callback(null, PAYMENT_PROOF_UPLOAD_DIR);
        },
        filename: (req: any, file: any, callback: any) => {
          const token = String(req.params.token || 'invoice').replace(/[^a-zA-Z0-9_-]/g, '');
          const extension = extname(file.originalname || '').toLowerCase() || '.bin';
          callback(null, `${token}-${Date.now()}${extension}`);
        },
      }),
      limits: {
        fileSize: 8 * 1024 * 1024,
      },
      fileFilter: (_req: any, file: any, callback: any) => {
        const allowed =
          file.mimetype.startsWith('image/') ||
          file.mimetype === 'application/pdf';
        callback(allowed ? null : new BadRequestException('Only image or PDF receipt uploads are supported'), allowed);
      },
    }),
  )
  submitPaymentProof(
    @Param('token') token: string,
    @Body('reference') reference: string | undefined,
    @Body('amount') amount: string | undefined,
    @Headers('user-agent') userAgent?: string | string[],
    @UploadedFile() file?: any,
  ) {
    const receiptUrl = file ? `/uploads/payment-proofs/${file.filename}` : null;
    return this.bookingsService.submitInvoicePaymentProof(token, {
      reference: this.normalizeReference(reference),
      amount: this.normalizeAmount(amount),
      receiptUrl,
      userAgent: this.normalizeUserAgent(userAgent),
    });
  }
}
