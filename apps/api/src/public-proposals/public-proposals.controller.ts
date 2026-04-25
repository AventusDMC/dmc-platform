import { Controller, Get, NotFoundException, Param, Res, StreamableFile } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { ProposalV3Service } from '../quotes/proposal-v3.service';

@Public()
@Controller('public/proposals')
export class PublicProposalsController {
  constructor(private readonly proposalV3Service: ProposalV3Service) {}

  @Get(':token')
  async getProposalHtml(@Param('token') token: string, @Res({ passthrough: true }) response: any) {
    const html = await this.proposalV3Service.getPublicProposalHtml(token);

    if (!html) {
      throw new NotFoundException('Proposal not found');
    }

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return html;
  }

  @Get(':token/pdf')
  async getProposalPdf(@Param('token') token: string, @Res({ passthrough: true }) response: any) {
    const pdfBuffer = await this.proposalV3Service.getPublicProposalPdf(token);

    if (!pdfBuffer) {
      throw new NotFoundException('Proposal not found');
    }

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'inline; filename="travel-proposal.pdf"');
    return new StreamableFile(pdfBuffer);
  }
}
