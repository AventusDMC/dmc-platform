import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { QuotesService } from './quotes.service';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { ProposalV3ViewModel } from './proposal-v3.types';
import { AuthenticatedActor } from '../auth/auth.types';

type TemplateTokens = Record<string, string>;
type PuppeteerBrowser = {
  newPage(): Promise<{
    setContent(html: string, options?: { waitUntil?: 'domcontentloaded' | 'load' | 'networkidle0' | 'networkidle2' }): Promise<void>;
    emulateMediaType(type?: 'screen' | 'print' | null): Promise<void>;
    pdf(options?: Record<string, unknown>): Promise<Uint8Array | Buffer>;
    close(): Promise<void>;
  }>;
  close(): Promise<void>;
};
type PuppeteerModule = {
  launch(options?: Record<string, unknown>): Promise<PuppeteerBrowser>;
};

@Injectable()
export class ProposalV3Service {
  constructor(private readonly quotesService: QuotesService) {}

  async getProposalHtml(quoteId: string, actor?: AuthenticatedActor) {
    console.info('[proposal-v3] getProposalHtml:start', { quoteId });
    const quote = await this.quotesService.findOne(quoteId, actor);

    if (!quote) {
      console.warn('[proposal-v3] getProposalHtml:not-found', { quoteId });
      return null;
    }

    try {
      const viewModel = mapQuoteToProposalV3(quote as any);
      console.info('[proposal-v3] getProposalHtml:view-model', JSON.stringify(viewModel, null, 2));
      const html = await this.renderHtml(viewModel);
      console.info('[proposal-v3] getProposalHtml:success', {
        quoteId,
        title: viewModel.documentTitle,
        htmlLength: html.length,
      });
      return html;
    } catch (error) {
      console.error('[proposal-v3] getProposalHtml:error', {
        quoteId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getProposalPdf(quoteId: string, actor?: AuthenticatedActor) {
    console.info('[proposal-v3] getProposalPdf:start', { quoteId });
    const html = await this.getProposalHtml(quoteId, actor);

    if (!html) {
      console.warn('[proposal-v3] getProposalPdf:no-html', { quoteId });
      return null;
    }

    let puppeteer: PuppeteerModule;
    try {
      puppeteer = await this.loadPuppeteer();
      console.info('[proposal-v3] getProposalPdf:puppeteer-loaded', { quoteId });
    } catch (error) {
      console.error('[proposal-v3] getProposalPdf:puppeteer-load-error', {
        quoteId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Proposal PDF renderer is unavailable.');
    }

    let browser: PuppeteerBrowser;
    try {
      const launchOptions: Record<string, unknown> = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }
      // TODO: Adjust launch args or executablePath per deployment environment if Chromium is provided externally.
      console.info('[proposal-v3] getProposalPdf:launch', {
        quoteId,
        hasExecutablePath: Boolean(executablePath),
      });
      browser = await puppeteer.launch(launchOptions);
    } catch (error) {
      console.error('[proposal-v3] getProposalPdf:launch-error', {
        quoteId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Proposal PDF browser could not be started.');
    }

    try {
      console.info('[proposal-v3] getProposalPdf:new-page', { quoteId });
      const page = await browser.newPage();

      try {
        console.info('[proposal-v3] getProposalPdf:set-content', {
          quoteId,
          htmlLength: html.length,
        });
        await page.setContent(html, { waitUntil: 'load' });
        console.info('[proposal-v3] getProposalPdf:emulate-print', { quoteId });
        await page.emulateMediaType('print');

        console.info('[proposal-v3] getProposalPdf:render-pdf', { quoteId });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          margin: {
            top: '18mm',
            right: '12mm',
            bottom: '20mm',
            left: '12mm',
          },
          headerTemplate: `
            <div style="width:100%; padding:0 12mm; font-family:Arial, sans-serif; font-size:9px; color:#6b625b; text-align:left;">
              Aventus DMC
            </div>
          `,
          footerTemplate: `
            <div style="width:100%; padding:0 12mm; font-family:Arial, sans-serif; font-size:8px; color:#8c837a; display:flex; justify-content:space-between; align-items:center;">
              <span>Aventus DMC · Tailored travel experiences in Jordan</span>
              <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
            </div>
          `,
        });

        const resolvedBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
        console.info('[proposal-v3] getProposalPdf:success', {
          quoteId,
          byteLength: resolvedBuffer.byteLength,
        });

        return resolvedBuffer;
      } finally {
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }

  private async renderHtml(viewModel: ProposalV3ViewModel) {
    const templatePath = this.resolveTemplateAssetPath('proposal-v3.hbs');
    const cssPath = this.resolveTemplateAssetPath('proposal-v3.css');
    console.info('[proposal-v3] renderHtml:assets', { templatePath, cssPath });

    const [template, css] = await Promise.all([
      readFile(templatePath, 'utf8'),
      readFile(cssPath, 'utf8'),
    ]);

    // TODO: Replace this token renderer with full Handlebars runtime if/when the API workspace adds handlebars as a direct dependency.
    return this.renderTemplate(template, {
      metaTitle: this.escapeHtml(viewModel.metaTitle),
      styles: css,
      documentTitle: this.escapeHtml(viewModel.documentTitle),
      brandName: this.escapeHtml(viewModel.brandName),
      accentColor: this.escapeHtml(viewModel.accentColor),
      quoteReference: this.escapeHtml(viewModel.quoteReference),
      travelerName: this.escapeHtml(viewModel.travelerName),
      coverSubtitle: this.escapeHtml(viewModel.coverSubtitle),
      destinationLine: this.escapeHtml(viewModel.destinationLine),
      durationLabel: this.escapeHtml(viewModel.durationLabel),
      travelDatesLabel: this.escapeHtml(viewModel.travelDatesLabel),
      coverIntro: this.escapeHtml(viewModel.coverIntro),
      subtitle: this.escapeHtml(viewModel.subtitle),
      proposalDateLabel: this.escapeHtml(viewModel.proposalDateLabel),
      travelerCountLabel: this.escapeHtml(viewModel.travelerCountLabel),
      servicesCountLabel: this.escapeHtml(viewModel.servicesCountLabel),
      totalDaysLabel: this.escapeHtml(viewModel.totalDaysLabel),
      pricingHighlightTotal: this.escapeHtml(viewModel.pricingHighlightTotal),
      pricingHighlightPerPax: this.escapeHtml(viewModel.pricingHighlightPerPax),
      pricingHighlightCurrency: this.escapeHtml(viewModel.pricingHighlightCurrency),
      journeySummary: this.escapeHtml(viewModel.journeySummary),
      highlightsHtml: this.renderList(viewModel.highlights),
      accommodationRowsHtml: this.renderAccommodationRows(viewModel),
      itineraryDaysHtml: this.renderItineraryDays(viewModel),
      investmentHtml: this.renderInvestment(viewModel),
      inclusionsHtml: this.renderList(viewModel.inclusions),
      notesHtml: this.renderList(viewModel.notes),
    });
  }

  private resolveTemplateAssetPath(fileName: 'proposal-v3.hbs' | 'proposal-v3.css') {
    const resolvedPath = resolve(__dirname, fileName);
    console.log('TEMPLATE PATH:', resolvedPath);
    return resolvedPath;
  }

  private renderTemplate(template: string, tokens: TemplateTokens) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => tokens[key] ?? '');
  }

  private async loadPuppeteer(): Promise<PuppeteerModule> {
    try {
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (
        specifier: string,
      ) => Promise<unknown>;
      const puppeteerModule = (await dynamicImport('puppeteer')) as {
        default?: PuppeteerModule;
        launch?: PuppeteerModule['launch'];
      };
      const resolvedModule = puppeteerModule.default ?? puppeteerModule;

      if (!resolvedModule || typeof resolvedModule.launch !== 'function') {
        throw new Error('Puppeteer module loaded without a launch function.');
      }

      return resolvedModule as PuppeteerModule;
    } catch (error) {
      console.error('[proposal-v3] loadPuppeteer:error', {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private renderList(items: string[]) {
    if (items.length === 0) {
      return '<li class="proposal-empty-list-item">Details will be finalized in the confirmed proposal.</li>';
    }

    return items.map((item) => `<li>${this.escapeHtml(this.getDisplayText(item))}</li>`).join('');
  }

  private renderAccommodationRows(viewModel: ProposalV3ViewModel) {
    if (viewModel.accommodationRows.length === 0) {
      return `
        <tr class="proposal-table-empty-row">
          <td colspan="5">Accommodation details will be confirmed with the final operating revision.</td>
        </tr>
      `;
    }

    return viewModel.accommodationRows
      .map(
        (row) => `
          <tr>
            <td>${this.escapeHtml(row.dayLabel)}</td>
            <td>${this.escapeHtml(this.getDisplayText(row.hotelName, 'Stay'))}</td>
            <td>${this.escapeHtml(row.location || 'To be confirmed')}</td>
            <td>${this.escapeHtml(row.room || 'To be confirmed')}</td>
            <td>${this.escapeHtml(this.joinInlineParts([row.meals, row.note]) || 'To be confirmed')}</td>
          </tr>
        `,
      )
      .join('');
  }

  private renderItineraryDays(viewModel: ProposalV3ViewModel) {
    if (viewModel.days.length === 0) {
      return `
        <section class="proposal-day-card proposal-day-card-empty">
          <div class="proposal-day-intro">
            <div class="proposal-day-heading">
              <h3>Daily itinerary</h3>
            </div>
            <p class="proposal-day-summary">The itinerary structure is being finalized and will be shared in the confirmed proposal.</p>
          </div>
        </section>
      `;
    }

    return viewModel.days
      .map((day) => {
        const groupsHtml = day.groups
          .map(
            (group) => `
              <section class="proposal-day-group">
                <h4>${this.escapeHtml(group.label)}</h4>
                ${group.items
                  .map(
                    (item) => `
                      <article class="proposal-service-card">
                        <h5>${this.escapeHtml(this.getDisplayText(item.title, group.label))}</h5>
                        ${item.description ? `<p>${this.escapeHtml(this.getDisplayText(item.description, group.label))}</p>` : ''}
                        ${item.meta ? `<p class="proposal-service-meta">${this.escapeHtml(item.meta)}</p>` : ''}
                      </article>
                    `,
                  )
                  .join('')}
              </section>
            `,
          )
          .join('');

        return `
          <section class="proposal-day-card">
            <div class="proposal-day-intro">
              <header class="proposal-day-heading">
                <div>
                  <span class="proposal-day-number">Day ${String(day.dayNumber).padStart(2, '0')}</span>
                  <h3>${this.escapeHtml(day.title)}</h3>
                </div>
                ${day.overnightLocation ? `<p class="proposal-day-overnight">Overnight: ${this.escapeHtml(day.overnightLocation)}</p>` : ''}
              </header>
              ${day.summary ? `<p class="proposal-day-summary">${this.escapeHtml(day.summary)}</p>` : ''}
            </div>
            <div class="proposal-day-services">
              ${groupsHtml || '<p class="proposal-empty-state">Program details will be finalized in the confirmed proposal.</p>'}
            </div>
          </section>
        `;
      })
      .join('');
  }

  private renderInvestment(viewModel: ProposalV3ViewModel) {
    const investment = viewModel.investment;

    if (investment.isPending) {
      return `
        <section class="investment-card investment-card-pending">
          <p class="investment-kicker">${this.escapeHtml(investment.snapshotLabel)}</p>
          <h3>${this.escapeHtml(investment.snapshotValue)}</h3>
          <p>${this.escapeHtml(investment.snapshotHelper)}</p>
        </section>
      `;
    }

    const slabTable =
      investment.mode === 'group' && investment.slabRows.length > 0
        ? `
          <table class="proposal-table investment-table">
            <thead>
              <tr>
                <th>Group size</th>
                <th>Per guest</th>
                <th>Total</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              ${investment.slabRows
                .map(
                  (row) => `
                    <tr>
                      <td>${this.escapeHtml(row.label)}</td>
                      <td>${this.escapeHtml(row.perGuest)}</td>
                      <td>${this.escapeHtml(row.total || 'To be confirmed')}</td>
                      <td>${this.escapeHtml(row.note || 'Included as quoted')}</td>
                    </tr>
                  `,
                )
                .join('')}
            </tbody>
          </table>
        `
        : '';

    const basisHtml = investment.basisLines.length
      ? `<ul class="proposal-list proposal-list-tight">${investment.basisLines.map((line) => `<li>${this.escapeHtml(line)}</li>`).join('')}</ul>`
      : '';
    const noteHtml = investment.noteLines.length
      ? `<ul class="proposal-list proposal-list-tight">${investment.noteLines.map((line) => `<li>${this.escapeHtml(line)}</li>`).join('')}</ul>`
      : '';

    return `
      <section class="investment-card">
        <p class="investment-kicker">${this.escapeHtml(investment.snapshotLabel)}</p>
        <h3>${this.escapeHtml(investment.snapshotValue)}</h3>
        <p>${this.escapeHtml(investment.snapshotHelper)}</p>
      </section>
      ${slabTable}
      ${basisHtml}
      ${noteHtml}
    `;
  }

  private joinInlineParts(parts: Array<string | null | undefined>) {
    return parts
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(' Ã‚Â· ');
  }

  private getDisplayText(value: string, groupLabel?: string) {
    const normalized = value
      .replace(/^Imported\s+(Hotel|Meal|Transport|Activity|Guide|Stay|Transfer|Experience|Other)\b[:\-]?\s*/i, '')
      .replace(/^Imported\b[:\-]?\s*/i, '')
      .replace(/\bImported\s+(Hotel|Meal|Transport|Activity|Guide)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (normalized) {
      return normalized;
    }

    switch (groupLabel) {
      case 'Stay':
        return 'Stay details';
      case 'Transfer':
        return 'Transfer details';
      case 'Meal':
        return 'Dining details';
      case 'Experience':
        return 'Experience details';
      case 'Guide':
        return 'Guide services';
      default:
        return value.trim();
    }
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
