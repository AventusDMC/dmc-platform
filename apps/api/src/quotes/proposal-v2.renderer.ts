import PDFDocument = require('pdfkit');
import { ProposalPricingViewModel } from './proposal-pricing';

export type ProposalV2Branding = {
  displayName: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  softColor: string;
  dividerColor: string;
};

export type ProposalV2ServiceItem = {
  title: string;
  description?: string | null;
  meta?: string | null;
};

export type ProposalV2ServiceGroup = {
  label: string;
  items: ProposalV2ServiceItem[];
};

export type ProposalV2Day = {
  dayNumber: number;
  title: string;
  summary?: string | null;
  overnightLocation?: string | null;
  groups: ProposalV2ServiceGroup[];
};

export type ProposalV2Document = {
  branding: ProposalV2Branding;
  title: string;
  quoteReference: string;
  travelerName: string;
  destinationLine: string;
  durationLabel: string;
  travelDatesLabel: string;
  subtitle: string;
  proposalDate: string;
  travelerCountLabel: string;
  servicesCountLabel: string;
  totalDays: number;
  journeySummary: string;
  highlights: string[];
  pricing: ProposalPricingViewModel;
  days: ProposalV2Day[];
  inclusions: string[];
  exclusions: string[];
  notes: string[];
};

type RendererOptions = {
  loadImageBuffer?: (logoUrl: string) => Promise<Buffer>;
};

export class ProposalV2Renderer {
  private readonly doc: PDFKit.PDFDocument;
  private readonly proposal: ProposalV2Document;
  private readonly options: RendererOptions;
  private pageNumber = 1;

  constructor(doc: PDFKit.PDFDocument, proposal: ProposalV2Document, options: RendererOptions = {}) {
    this.doc = doc;
    this.proposal = proposal;
    this.options = options;
  }

  async render() {
    console.info('[quote-pdf] renderer', {
      renderer: 'proposal-v2',
      event: 'render-start',
      quoteReference: this.proposal.quoteReference,
    });
    await this.renderCoverPage();
    this.renderJourneySummaryPage();
    this.renderItineraryPages();
    this.renderInvestmentPage();
    this.renderSupportPage();
    console.info('[quote-pdf] renderer', {
      renderer: 'proposal-v2',
      event: 'render-complete',
      totalPages: this.pageNumber,
      quoteReference: this.proposal.quoteReference,
    });
  }

  private async renderCoverPage() {
    const doc = this.doc;
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    doc.save();
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f8f5ef');
    doc.rect(0, 0, doc.page.width, 18).fill(this.proposal.branding.primaryColor);
    doc.roundedRect(left, 120, width, 470, 30).fill('#fffdfa');
    doc.roundedRect(left, 120, width, 150, 30).fill(this.proposal.branding.softColor);
    doc.roundedRect(left + width - 120, 54, 70, 70, 18).fill(this.proposal.branding.softColor);
    doc.restore();

    if (this.proposal.branding.logoUrl && this.options.loadImageBuffer) {
      try {
        const imageBuffer = await this.options.loadImageBuffer(this.proposal.branding.logoUrl);
        doc.image(imageBuffer, left + width - 108, 66, {
          fit: [46, 46],
          align: 'center',
          valign: 'center',
        });
      } catch {
        this.drawBrandMark(left + width - 108, 66, 46, 46);
      }
    } else {
      this.drawBrandMark(left + width - 108, 66, 46, 46);
    }

    doc.font('Helvetica-Bold').fontSize(10).fillColor(this.proposal.branding.primaryColor).text(this.proposal.branding.displayName.toUpperCase(), left, 64, {
      width: 240,
      characterSpacing: 1.2,
    });
    doc.font('Helvetica').fontSize(9).fillColor('#867a6e').text(this.proposal.quoteReference, left, 84, {
      width: 240,
    });

    doc.font('Helvetica-Bold').fontSize(11).fillColor(this.proposal.branding.primaryColor).text('TRAVEL PROPOSAL', left + 28, 156, {
      width: width - 56,
      characterSpacing: 1.8,
    });
    doc.font('Helvetica').fontSize(10.5).fillColor('#7a6f63').text(this.proposal.destinationLine.toUpperCase(), left + 28, 188, {
      width: width - 56,
      characterSpacing: 1.1,
    });
    doc.font('Helvetica-Bold').fontSize(30).fillColor('#1f1a17').text(this.proposal.title, left + 28, 228, {
      width: width - 56,
      lineGap: 4,
    });
    doc.font('Helvetica').fontSize(11).fillColor('#5f574f').text(this.proposal.subtitle, left + 28, doc.y + 16, {
      width: width - 56,
      lineGap: 4,
    });

    const cardY = 420;
    const cardWidth = (width - 42) / 3;
    const coverFacts = [
      { label: 'Presented for', value: this.proposal.travelerName },
      { label: 'Trip dates', value: this.proposal.travelDatesLabel },
      { label: 'Duration', value: this.proposal.durationLabel },
    ];
    coverFacts.forEach((fact, index) => {
      const x = left + 28 + index * (cardWidth + 14);
      doc.roundedRect(x, cardY, cardWidth, 94, 18).fill('#f7f2ea');
      doc.font('Helvetica').fontSize(7.4).fillColor('#8a7f72').text(fact.label.toUpperCase(), x + 14, cardY + 14, {
        width: cardWidth - 28,
        characterSpacing: 1.1,
      });
      doc.font('Helvetica-Bold').fontSize(12.2).fillColor('#1f1a17').text(fact.value, x + 14, cardY + 34, {
        width: cardWidth - 28,
        lineGap: 2,
      });
    });

    console.info('[quote-pdf] page-sequence', {
      renderer: 'proposal-v2',
      pageNumber: this.pageNumber,
      reason: 'cover',
    });
    this.drawPageChrome();
  }

  private renderJourneySummaryPage() {
    this.startContentPage();
    this.drawSectionKicker('Client Info');
    this.drawClientInfoBlock();
    this.addVerticalSpace(16);

    this.drawSectionKicker('Trip Overview');

    const contentWidth = this.getContentWidth();
    this.doc.font('Helvetica').fontSize(11).fillColor('#544d45').text(this.proposal.journeySummary, this.getLeft(), this.doc.y, {
      width: contentWidth,
      lineGap: 4,
    });
    this.addVerticalSpace(16);

    const metrics = [
      { label: 'Duration', value: this.proposal.durationLabel, helper: this.proposal.travelDatesLabel },
      { label: 'Destinations', value: this.proposal.destinationLine, helper: `${this.proposal.totalDays} itinerary day${this.proposal.totalDays === 1 ? '' : 's'}` },
      { label: 'Travelers', value: this.proposal.travelerCountLabel, helper: `Prepared for ${this.proposal.travelerName}` },
      { label: 'Services', value: this.proposal.servicesCountLabel, helper: this.proposal.pricing.snapshotHelper },
    ];
    this.drawMetricGrid(metrics);
    this.addVerticalSpace(18);

    const left = this.getLeft();
    const width = this.getContentWidth();
    const leftColumn = width * 0.58;
    const rightColumn = width - leftColumn - 16;
    const panelTop = this.doc.y;
    const highlightsHeight = Math.max(128, 36 + this.proposal.highlights.length * 26);
    const pricingHeight = 128;
    const panelHeight = Math.max(highlightsHeight, pricingHeight);

    this.ensureSpace(panelHeight + 12);
    this.doc.roundedRect(left, panelTop, leftColumn, panelHeight, 20).fill('#fffaf3');
    this.doc.roundedRect(left + leftColumn + 16, panelTop, rightColumn, panelHeight, 20).fill(this.proposal.branding.softColor);

    this.doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f1a17').text('Highlights', left + 18, panelTop + 18, {
      width: leftColumn - 36,
    });
    let currentY = panelTop + 46;
    const highlights = this.proposal.highlights.length > 0 ? this.proposal.highlights : ['Tailored routing and service planning aligned to the itinerary.'];
    highlights.forEach((highlight) => {
      this.doc.font('Helvetica').fontSize(10).fillColor('#5b534b').text('•', left + 20, currentY);
      this.doc.text(highlight, left + 34, currentY, {
        width: leftColumn - 52,
        lineGap: 3,
      });
      currentY = this.doc.y + 8;
    });

    const pricingX = left + leftColumn + 16;
    this.doc.font('Helvetica').fontSize(7.6).fillColor(this.proposal.branding.primaryColor).text(this.proposal.pricing.snapshotLabel.toUpperCase(), pricingX + 18, panelTop + 18, {
      width: rightColumn - 36,
      characterSpacing: 1.1,
    });
    this.doc.font('Helvetica-Bold').fontSize(24).fillColor('#1f1a17').text(this.proposal.pricing.snapshotValue, pricingX + 18, panelTop + 42, {
      width: rightColumn - 36,
      lineGap: 2,
    });
    this.doc.font('Helvetica').fontSize(9.5).fillColor('#5b534b').text(this.proposal.pricing.snapshotHelper, pricingX + 18, panelTop + 86, {
      width: rightColumn - 36,
      lineGap: 3,
    });

    this.doc.y = panelTop + panelHeight + 14;
  }

  private renderItineraryPages() {
    this.startContentPage();
    this.drawSectionKicker('Services / Itinerary');

    if (this.proposal.days.length === 0) {
      this.doc.font('Helvetica').fontSize(10.5).fillColor('#655d55').text('The itinerary structure is being finalized and will be shared in the next revision.', this.getLeft(), this.doc.y, {
        width: this.getContentWidth(),
        lineGap: 4,
      });
      return;
    }

    for (const day of this.proposal.days) {
      this.renderDay(day);
    }
  }

  private renderDay(day: ProposalV2Day) {
    const baseHeaderHeight = 94 + (day.summary ? 30 : 0) + (day.overnightLocation ? 16 : 0);
    this.ensureSpace(baseHeaderHeight);

    const dayTitle = `Day ${String(day.dayNumber).padStart(2, '0')} · ${day.title}`;
    const drawHeader = (continued = false) => {
      this.ensureSpace(86);
      const headerTop = this.doc.y;
      this.doc.roundedRect(this.getLeft(), headerTop, this.getContentWidth(), 72, 20).fill('#f8f4ed');
      this.doc.rect(this.getLeft(), headerTop, 10, 72).fill(this.proposal.branding.primaryColor);
      this.doc.font('Helvetica-Bold').fontSize(16).fillColor('#1f1a17').text(continued ? `${dayTitle} (continued)` : dayTitle, this.getLeft() + 26, headerTop + 16, {
        width: this.getContentWidth() - 52,
      });
      if (!continued && day.summary) {
        this.doc.font('Helvetica').fontSize(10).fillColor('#5e564e').text(day.summary, this.getLeft() + 26, headerTop + 38, {
          width: this.getContentWidth() - 52,
          lineGap: 3,
        });
      } else if (!continued && day.overnightLocation) {
        this.doc.font('Helvetica').fontSize(9.5).fillColor('#7b7063').text(`Overnight: ${day.overnightLocation}`, this.getLeft() + 26, headerTop + 42, {
          width: this.getContentWidth() - 52,
        });
      }
      this.doc.y = headerTop + 86;
    };

    drawHeader(false);

    for (const group of day.groups) {
      if (group.items.length === 0) {
        continue;
      }

      let paged = this.ensureSpace(34);
      if (paged) {
        drawHeader(true);
      }

      this.doc.font('Helvetica-Bold').fontSize(10.5).fillColor(this.proposal.branding.primaryColor).text(group.label.toUpperCase(), this.getLeft(), this.doc.y, {
        width: this.getContentWidth(),
        characterSpacing: 1.1,
      });
      this.addVerticalSpace(8);

      for (const item of group.items) {
        const cardHeight = this.measureServiceCardHeight(item);
        paged = this.ensureSpace(cardHeight + 10);
        if (paged) {
          drawHeader(true);
          this.doc.font('Helvetica-Bold').fontSize(10.5).fillColor(this.proposal.branding.primaryColor).text(group.label.toUpperCase(), this.getLeft(), this.doc.y, {
            width: this.getContentWidth(),
            characterSpacing: 1.1,
          });
          this.addVerticalSpace(8);
        }

        this.drawServiceCard(item, cardHeight);
        this.addVerticalSpace(8);
      }

      this.addVerticalSpace(6);
    }

    this.addVerticalSpace(10);
  }

  private renderInvestmentPage() {
    this.startContentPage();
    this.drawSectionKicker('Pricing Summary');

    const cardTop = this.doc.y;
    this.ensureSpace(172);
    this.doc.roundedRect(this.getLeft(), cardTop, this.getContentWidth(), 148, 24).fill('#fffaf3');
    this.doc.roundedRect(this.getLeft() + 18, cardTop + 20, this.getContentWidth() - 36, 82, 18).fill(this.proposal.branding.softColor);
    this.doc.font('Helvetica').fontSize(7.8).fillColor(this.proposal.branding.primaryColor).text(this.proposal.pricing.snapshotLabel.toUpperCase(), this.getLeft() + 34, cardTop + 32, {
      width: this.getContentWidth() - 68,
      characterSpacing: 1.2,
      align: 'center',
    });
    this.doc.font('Helvetica-Bold').fontSize(28).fillColor('#1f1a17').text(this.proposal.pricing.snapshotValue, this.getLeft() + 34, cardTop + 54, {
      width: this.getContentWidth() - 68,
      align: 'center',
      lineGap: 2,
    });
    this.doc.font('Helvetica').fontSize(10).fillColor('#5b534b').text(this.proposal.pricing.snapshotHelper, this.getLeft() + 34, cardTop + 112, {
      width: this.getContentWidth() - 68,
      align: 'center',
      lineGap: 3,
    });
    this.doc.y = cardTop + 166;

    if (this.proposal.pricing.mode === 'group' && this.proposal.pricing.slabLines.length > 0) {
      this.renderGroupPricingTable();
    } else {
      this.renderPricingNotesBlock();
    }
  }

  private renderGroupPricingTable() {
    this.ensureSpace(56 + this.proposal.pricing.slabLines.length * 28);
    this.doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f1a17').text('Investment by Group Size', this.getLeft(), this.doc.y, {
      width: this.getContentWidth(),
    });
    this.addVerticalSpace(10);

    const tableTop = this.doc.y;
    const width = this.getContentWidth();
    const columns = [width * 0.28, width * 0.22, width * 0.22, width * 0.28];
    const headers = ['Group size', 'Per guest', 'Total', 'Note'];

    this.doc.roundedRect(this.getLeft(), tableTop, width, 34, 14).fill('#f5efe6');
    let currentX = this.getLeft() + 12;
    headers.forEach((header, index) => {
      this.doc.font('Helvetica-Bold').fontSize(8).fillColor('#6d6357').text(header.toUpperCase(), currentX, tableTop + 12, {
        width: columns[index] - 12,
        characterSpacing: 1,
      });
      currentX += columns[index];
    });

    let currentY = tableTop + 40;
    this.proposal.pricing.slabLines.forEach((line) => {
      const rowHeight = 28;
      this.doc.roundedRect(this.getLeft(), currentY, width, rowHeight, 12).fill(line.isSelected ? this.proposal.branding.softColor : '#fffaf3');
      let x = this.getLeft() + 12;
      const values = [
        line.label,
        line.perPerson || 'To be confirmed',
        line.total || 'To be confirmed',
        line.note || '',
      ];
      values.forEach((value, index) => {
        this.doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.2).fillColor('#1f1a17').text(value, x, currentY + 9, {
          width: columns[index] - 12,
          lineGap: 2,
        });
        x += columns[index];
      });
      currentY += rowHeight + 6;
    });

    this.doc.y = currentY + 4;
    this.renderPricingNotesBlock();
  }

  private renderPricingNotesBlock() {
    const lines = [...this.proposal.pricing.basisLines, ...this.proposal.pricing.noteLines];
    if (lines.length === 0) {
      return;
    }

    this.ensureSpace(48 + lines.length * 16);
    this.doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f1a17').text('Basis & Notes', this.getLeft(), this.doc.y, {
      width: this.getContentWidth(),
    });
    this.addVerticalSpace(8);
    lines.forEach((line) => {
      this.doc.font('Helvetica').fontSize(9.6).fillColor('#5e564e').text(`• ${line}`, this.getLeft(), this.doc.y, {
        width: this.getContentWidth(),
        lineGap: 3,
      });
      this.addVerticalSpace(4);
    });
  }

  private renderSupportPage() {
    this.startContentPage();
    this.drawSectionKicker('Inclusions, Exclusions & Notes');

    this.renderBulletSection('Included', this.proposal.inclusions);
    this.addVerticalSpace(10);
    this.renderBulletSection('Excluded', this.proposal.exclusions);
    this.addVerticalSpace(10);
    this.renderBulletSection('Important Notes', this.proposal.notes);
  }

  private drawClientInfoBlock() {
    const rows = [
      { label: 'Client', value: this.proposal.travelerName },
      { label: 'Quote', value: this.proposal.quoteReference },
      { label: 'Prepared by', value: this.proposal.branding.displayName },
      { label: 'Contact', value: [this.proposal.branding.email, this.proposal.branding.phone].filter(Boolean).join(' | ') || 'Contact details to be confirmed' },
    ];
    this.drawMetricGrid(rows);
  }

  private renderBulletSection(title: string, items: string[]) {
    this.ensureSpace(40);
    this.doc.font('Helvetica-Bold').fontSize(12).fillColor('#1f1a17').text(title, this.getLeft(), this.doc.y, {
      width: this.getContentWidth(),
    });
    this.addVerticalSpace(8);

    const values = items.length > 0 ? items : ['Details to be confirmed in the final proposal version.'];
    values.forEach((item) => {
      this.ensureSpace(20);
      this.doc.font('Helvetica').fontSize(9.8).fillColor('#5c544d').text('•', this.getLeft() + 4, this.doc.y);
      this.doc.text(item, this.getLeft() + 18, this.doc.y - 1, {
        width: this.getContentWidth() - 18,
        lineGap: 3,
      });
      this.addVerticalSpace(4);
    });
  }

  private drawMetricGrid(metrics: Array<{ label: string; value: string; helper?: string | null }>) {
    const gap = 12;
    const cardWidth = (this.getContentWidth() - gap) / 2;
    for (let index = 0; index < metrics.length; index += 2) {
      const row = metrics.slice(index, index + 2);
      this.ensureSpace(110);
      const rowTop = this.doc.y;
      row.forEach((metric, rowIndex) => {
        const x = this.getLeft() + rowIndex * (cardWidth + gap);
        this.doc.roundedRect(x, rowTop, cardWidth, 96, 20).fill('#fffaf3');
        this.doc.font('Helvetica').fontSize(7.2).fillColor('#8a7f72').text(metric.label.toUpperCase(), x + 16, rowTop + 16, {
          width: cardWidth - 32,
          characterSpacing: 1.1,
        });
        this.doc.font('Helvetica-Bold').fontSize(15).fillColor('#1f1a17').text(metric.value, x + 16, rowTop + 34, {
          width: cardWidth - 32,
          lineGap: 3,
        });
        if (metric.helper) {
          this.doc.font('Helvetica').fontSize(8.7).fillColor('#645c54').text(metric.helper, x + 16, rowTop + 62, {
            width: cardWidth - 32,
            lineGap: 2,
          });
        }
      });
      this.doc.y = rowTop + 108;
    }
  }

  private measureServiceCardHeight(item: ProposalV2ServiceItem) {
    const width = this.getContentWidth() - 36;
    const titleHeight = this.doc.font('Helvetica-Bold').fontSize(10.5).heightOfString(item.title, {
      width,
      lineGap: 2,
    });
    const descriptionHeight = item.description
      ? this.doc.font('Helvetica').fontSize(9.2).heightOfString(item.description, {
          width,
          lineGap: 2,
        })
      : 0;
    const metaHeight = item.meta
      ? this.doc.font('Helvetica').fontSize(8).heightOfString(item.meta, {
          width,
          lineGap: 2,
        })
      : 0;
    return 18 + titleHeight + (descriptionHeight ? descriptionHeight + 8 : 0) + (metaHeight ? metaHeight + 8 : 0) + 12;
  }

  private drawServiceCard(item: ProposalV2ServiceItem, height: number) {
    const top = this.doc.y;
    const left = this.getLeft();
    const width = this.getContentWidth();
    this.doc.roundedRect(left, top, width, height, 16).fill('#fffdf9');
    this.doc.roundedRect(left, top, 6, height, 3).fill(this.proposal.branding.secondaryColor);
    this.doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#1f1a17').text(item.title, left + 18, top + 14, {
      width: width - 36,
      lineGap: 2,
    });
    let currentY = this.doc.y + 6;
    if (item.description) {
      this.doc.font('Helvetica').fontSize(9.2).fillColor('#5b534b').text(item.description, left + 18, currentY, {
        width: width - 36,
        lineGap: 2,
      });
      currentY = this.doc.y + 6;
    }
    if (item.meta) {
      this.doc.font('Helvetica').fontSize(8).fillColor('#8a7f72').text(item.meta, left + 18, currentY, {
        width: width - 36,
        lineGap: 2,
      });
    }
    this.doc.y = top + height;
  }

  private startContentPage() {
    this.startNewPage('content');
    this.doc.x = this.getLeft();
    this.doc.y = this.doc.page.margins.top;
  }

  private ensureSpace(minimumHeight: number) {
    const pageBottom = this.doc.page.height - this.doc.page.margins.bottom;
    if (this.doc.y + minimumHeight <= pageBottom) {
      return false;
    }

    this.startNewPage(`ensure-space:${minimumHeight}`);
    this.doc.x = this.getLeft();
    this.doc.y = this.doc.page.margins.top;
    return true;
  }

  private startNewPage(reason: string) {
    this.pageNumber += 1;
    console.info('[quote-pdf] startNewPage', {
      template: 'proposal-v2',
      pageNumber: this.pageNumber,
      reason,
    });
    this.doc.addPage();
    this.drawPageChrome();
  }

  private drawSectionKicker(title: string) {
    this.doc.roundedRect(this.getLeft(), this.doc.y + 8, 30, 3, 2).fill(this.proposal.branding.primaryColor);
    this.doc.font('Helvetica-Bold').fontSize(18).fillColor('#1f1a17').text(title, this.getLeft() + 48, this.doc.y, {
      width: this.getContentWidth() - 48,
    });
    this.addVerticalSpace(10);
    this.doc.strokeColor(this.proposal.branding.dividerColor).lineWidth(0.8).moveTo(this.getLeft(), this.doc.y).lineTo(this.getLeft() + this.getContentWidth(), this.doc.y).stroke();
    this.addVerticalSpace(12);
  }

  private drawPageChrome() {
    console.info('[quote-pdf] drawPageChrome', {
      renderer: 'proposal-v2',
      pageNumber: this.pageNumber,
    });
    this.withPreservedCursor(() => {
      this.renderPageHeader();
      this.renderPageFooter();
      this.renderPageNumber(this.pageNumber);
    });
  }

  private renderPageHeader() {
    console.info('[quote-pdf] drawPageHeader', {
      renderer: 'proposal-v2',
      pageNumber: this.pageNumber,
    });
    const left = this.getLeft();
    const right = this.doc.page.width - this.doc.page.margins.right;
    const topY = 26;
    this.doc.font('Helvetica-Bold').fontSize(9).fillColor(this.proposal.branding.primaryColor).text(this.proposal.branding.displayName.toUpperCase(), left, topY, {
      width: 220,
      lineBreak: false,
      characterSpacing: 0.9,
    });
    this.doc.font('Helvetica').fontSize(8.2).fillColor('#786f65').text(this.proposal.quoteReference, right - 180, topY, {
      width: 180,
      align: 'right',
      lineBreak: false,
    });
    this.doc.strokeColor(this.proposal.branding.dividerColor).lineWidth(0.8).moveTo(left, topY + 18).lineTo(right, topY + 18).stroke();
  }

  private renderPageFooter() {
    console.info('[quote-pdf] drawPageFooter', {
      renderer: 'proposal-v2',
      pageNumber: this.pageNumber,
    });
    const left = this.getLeft();
    const right = this.doc.page.width - this.doc.page.margins.right;
    const footerY = this.doc.page.height - this.doc.page.margins.bottom - 14;
    const details = [this.proposal.branding.website, this.proposal.branding.email, this.proposal.branding.phone]
      .filter((value): value is string => Boolean(value?.trim()))
      .join('  •  ');

    this.doc.strokeColor(this.proposal.branding.dividerColor).lineWidth(0.8).moveTo(left, footerY - 10).lineTo(right, footerY - 10).stroke();
    this.doc.font('Helvetica').fontSize(8).fillColor('#8a7f72').text(details || this.proposal.branding.displayName, left, footerY, {
      width: right - left - 52,
      lineBreak: false,
    });
  }

  private renderPageNumber(pageNumber: number) {
    console.info('[quote-pdf] drawPageNumber', {
      renderer: 'proposal-v2',
      pageNumber,
    });
    const right = this.doc.page.width - this.doc.page.margins.right;
    const footerY = this.doc.page.height - this.doc.page.margins.bottom - 14;
    this.doc.font('Helvetica').fontSize(8).fillColor('#8a7f72').text(String(pageNumber), right - 24, footerY, {
      width: 24,
      align: 'right',
      lineBreak: false,
    });
  }

  private drawBrandMark(x: number, y: number, width: number, height: number) {
    this.doc.roundedRect(x, y, width, height, 14).fill(this.proposal.branding.softColor);
    this.doc.font('Helvetica-Bold').fontSize(8).fillColor(this.proposal.branding.primaryColor).text(this.proposal.branding.displayName.slice(0, 10).toUpperCase(), x + 4, y + 17, {
      width: width - 8,
      align: 'center',
      characterSpacing: 0.5,
    });
  }

  private addVerticalSpace(amount: number) {
    this.doc.y += amount;
  }

  private withPreservedCursor(draw: () => void) {
    const previousX = this.doc.x;
    const previousY = this.doc.y;
    draw();
    this.doc.x = previousX;
    this.doc.y = previousY;
  }

  private getLeft() {
    return this.doc.page.margins.left;
  }

  private getContentWidth() {
    return this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right;
  }
}
