import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { QuotesService } from './quotes.service';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { ProposalV3ViewModel } from './proposal-v3.types';
import { proposalLabel, resolveProposalLanguage } from './proposal-i18n';
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

  async getProposalHtml(quoteId: string, actor?: AuthenticatedActor, language?: string) {
    console.info('[proposal-v3] getProposalHtml:start', { quoteId });
    const quote = await this.quotesService.findOne(quoteId, actor);

    if (!quote) {
      console.warn('[proposal-v3] getProposalHtml:not-found', { quoteId });
      return null;
    }

    try {
      const html = await this.renderProposalHtml(quote, 'quoteId', quoteId, language);
      console.info('[proposal-v3] getProposalHtml:success', {
        quoteId,
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

  async getPublicProposalHtml(token: string) {
    console.info('[proposal-v3] getPublicProposalHtml:start', { token });
    const quote = await this.quotesService.findPublicProposalQuote(token);

    if (!quote) {
      console.warn('[proposal-v3] getPublicProposalHtml:not-found', { token });
      return null;
    }

    try {
      const html = await this.renderProposalHtml(quote, 'token', token);
      console.info('[proposal-v3] getPublicProposalHtml:success', {
        token,
        htmlLength: html.length,
      });
      return html;
    } catch (error) {
      console.error('[proposal-v3] getPublicProposalHtml:error', {
        token,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getProposalPdf(quoteId: string, actor?: AuthenticatedActor, language?: string) {
    console.info('[proposal-v3] getProposalPdf:start', { quoteId });
    const quote = await this.quotesService.findOne(quoteId, actor);

    if (!quote) {
      console.warn('[proposal-v3] getProposalPdf:no-html', { quoteId });
      return null;
    }

    const viewModel = mapQuoteToProposalV3(quote as any, language);
    const html = await this.renderHtml(viewModel);
    return this.renderPdfFromHtml(html, 'quoteId', quoteId, viewModel.footerLine);
  }

  async getPublicProposalPdf(token: string) {
    console.info('[proposal-v3] getPublicProposalPdf:start', { token });
    const quote = await this.quotesService.findPublicProposalQuote(token);

    if (!quote) {
      console.warn('[proposal-v3] getPublicProposalPdf:no-html', { token });
      return null;
    }

    const viewModel = mapQuoteToProposalV3(quote as any);
    const html = await this.renderHtml(viewModel);
    return this.renderPdfFromHtml(html, 'token', token, viewModel.footerLine);
  }

  private async renderProposalHtml(quote: unknown, contextKey: 'quoteId' | 'token', contextValue: string, language?: string) {
    const viewModel = mapQuoteToProposalV3(quote as any, language);
    console.info('[proposal-v3] renderProposalHtml:view-model', {
      [contextKey]: contextValue,
      title: viewModel.documentTitle,
      reference: viewModel.quoteReference,
    });
    return this.renderHtml(viewModel);
  }

  private async renderPdfFromHtml(html: string, contextKey: 'quoteId' | 'token', contextValue: string, footerLine = 'Travel Proposal') {
    const logContext = { [contextKey]: contextValue };

    let puppeteer: PuppeteerModule;
    try {
      puppeteer = await this.loadPuppeteer();
      console.info('[proposal-v3] getProposalPdf:puppeteer-loaded', logContext);
    } catch (error) {
      console.error('[proposal-v3] getProposalPdf:puppeteer-load-error', {
        ...logContext,
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
        ...logContext,
        hasExecutablePath: Boolean(executablePath),
      });
      browser = await puppeteer.launch(launchOptions);
    } catch (error) {
      console.error('[proposal-v3] getProposalPdf:launch-error', {
        ...logContext,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new InternalServerErrorException('Proposal PDF browser could not be started.');
    }

    try {
      console.info('[proposal-v3] getProposalPdf:new-page', logContext);
      const page = await browser.newPage();

      try {
        console.info('[proposal-v3] getProposalPdf:set-content', {
          ...logContext,
          htmlLength: html.length,
        });
        await page.setContent(html, { waitUntil: 'load' });
        console.info('[proposal-v3] getProposalPdf:emulate-print', logContext);
        await page.emulateMediaType('print');

        console.info('[proposal-v3] getProposalPdf:render-pdf', logContext);
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          margin: {
            top: '14mm',
            right: '12mm',
            bottom: '16mm',
            left: '12mm',
          },
          headerTemplate: `
            <div style="width:100%; font-size:1px; color:transparent;">
              &nbsp;
            </div>
          `,
          footerTemplate: `
            <div style="width:100%; padding:0 12mm; font-family:Arial, sans-serif; font-size:8px; color:#6B6B6B; display:flex; justify-content:space-between; align-items:center;">
              <span>${this.escapeHtml(footerLine)}</span>
              <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
            </div>
          `,
        });

        const resolvedBuffer = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
        console.info('[proposal-v3] getProposalPdf:success', {
          ...logContext,
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
    console.info('[proposal-v3] renderHtml:template-debug', {
      templatePath,
      cssPath,
      templatePreview: template.slice(0, 200),
      containsVersionMarker: template.includes('2026-04-24-final-v2'),
    });

    const loc = resolveProposalLanguage(viewModel.language);
    const L = (key: Parameters<typeof proposalLabel>[1]) => this.escapeHtml(proposalLabel(loc, key));

    // TODO: Replace this token renderer with full Handlebars runtime if/when the API workspace adds handlebars as a direct dependency.
    return this.renderTemplate(template, {
      metaTitle: this.escapeHtml(viewModel.metaTitle),
      styles: css,
      documentLanguage: this.escapeHtml(viewModel.language),
      textDirection: this.escapeHtml(viewModel.textDirection),
      labelReference: L('reference'),
      labelPrepared: L('prepared'),
      labelPreparedFor: L('preparedFor'),
      labelTravelDates: L('travelDates'),
      labelDuration: L('duration'),
      labelGuests: L('guests'),
      labelPricingSummary: L('pricingSummary'),
      labelTotalPackagePrice: L('totalPackagePrice'),
      labelPricePerPerson: L('pricePerPerson'),
      labelQuoteCurrency: L('quoteCurrency'),
      labelJourneyOverview: L('journeyOverview'),
      labelTravelers: L('travelers'),
      labelServices: L('services'),
      labelItinerary: L('itinerary'),
      labelHighlights: L('highlights'),
      labelKeyMoments: L('keyMoments'),
      labelAccommodation: L('accommodation'),
      labelStayOverview: L('stayOverview'),
      labelTableDay: L('tableDay'),
      labelTableHotel: L('tableHotel'),
      labelTableLocation: L('tableLocation'),
      labelTableRoom: L('tableRoom'),
      labelTableNotes: L('tableNotes'),
      labelDayByDay: L('dayByDay'),
      labelFinalDetails: L('finalDetails'),
      labelInclusionsAndPricing: L('inclusionsAndPricing'),
      labelIncluded: L('included'),
      labelInclusions: L('inclusions'),
      labelPricingNotesEyebrow: L('pricingNotesEyebrow'),
      labelNotes: L('notes'),
      documentTitle: this.escapeHtml(viewModel.documentTitle),
      brandName: this.escapeHtml(viewModel.brandName),
      logoUrl: this.escapeHtml(viewModel.logoUrl),
      accentColor: this.escapeHtml(viewModel.accentColor),
      footerLine: this.escapeHtml(viewModel.footerLine),
      contactLine: this.escapeHtml(viewModel.contactLine),
      quoteReference: this.escapeHtml(viewModel.quoteReference),
      travelerName: this.escapeHtml(viewModel.travelerName),
      coverSubtitle: this.escapeHtml(viewModel.coverSubtitle),
      destinationLine: this.escapeHtml(viewModel.destinationLine),
      durationLabel: this.escapeHtml(viewModel.durationLabel),
      travelDatesLabel: this.escapeHtml(viewModel.travelDatesLabel),
      coverIntro: this.escapeHtml(viewModel.coverIntro),
      coverSignature: this.escapeHtml(viewModel.coverSignature),
      dayByDayIntro: this.escapeHtml(viewModel.dayByDayIntro),
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
      hotelOptionSetsHtml: this.renderHotelOptionSets(viewModel),
      itineraryDaysHtml: this.renderItineraryDays(viewModel),
      investmentHtml: this.renderInvestment(viewModel),
      inclusionsHtml: this.renderList(viewModel.inclusions),
      notesHtml: this.renderList(viewModel.notes),
    });
  }

  private resolveTemplateAssetPath(fileName: 'proposal-v3.hbs' | 'proposal-v3.css') {
    const candidatePaths = [
      resolve(process.cwd(), 'src', 'quotes', fileName),
      resolve(process.cwd(), 'apps', 'api', 'src', 'quotes', fileName),
      resolve(process.cwd(), 'dist', 'quotes', fileName),
      resolve(process.cwd(), 'apps', 'api', 'dist', 'quotes', fileName),
    ];
    const resolvedPath = candidatePaths.find((candidatePath) => existsSync(candidatePath)) ?? candidatePaths[0];

    if (fileName === 'proposal-v3.hbs') {
      console.log('TEMPLATE PATH:', resolvedPath);
    } else {
      console.log('CSS PATH:', resolvedPath);
    }
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
      const message = viewModel.hotelOptionSets.length > 0
        ? 'Hotel options are outlined below for review and selection.'
        : 'Accommodation details will be confirmed with the final operating revision.';

      return `
        <tr class="proposal-table-empty-row">
          <td colspan="5">${this.escapeHtml(message)}</td>
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

  private renderHotelOptionSets(viewModel: ProposalV3ViewModel) {
    if (viewModel.hotelOptionSets.length === 0) {
      return '';
    }

    const matrixHtml = this.renderAccommodationMatrix(viewModel);

    return `
      <div class="proposal-hotel-options">
        <header class="proposal-subsection-header">
          <p class="proposal-eyebrow">Accommodation Options</p>
          <h3>Accommodation Options</h3>
        </header>
        ${matrixHtml}
        <div class="proposal-hotel-option-set-list">
          ${viewModel.hotelOptionSets
            .map((optionSet) => {
              const optionsHtml = optionSet.options.length > 0
                ? optionSet.options
                    .map((hotelOption) => {
                      const factsHtml = this.renderHotelOptionFacts(hotelOption);
                      const hotelOptionNightLabel = this.formatHotelOptionNightLabel(hotelOption.nights);
                      const meta = this.joinInlineParts([
                        hotelOption.city,
                        hotelOption.room,
                        hotelOption.mealPlan,
                        hotelOptionNightLabel,
                      ]);

                      return `
                        <article class="proposal-hotel-option-card${hotelOption.isPrimary ? ' proposal-hotel-option-card-primary' : ''}">
                          <div class="proposal-hotel-option-card-head">
                            <div>
                              <h4>${this.escapeHtml(this.getDisplayText(hotelOption.hotelName, 'Stay'))}</h4>
                              ${meta ? `<p>${this.escapeHtml(meta)}</p>` : ''}
                            </div>
                            <span class="proposal-hotel-option-badge${hotelOption.isPrimary ? ' proposal-hotel-option-badge-primary' : ''}">
                              ${hotelOption.isPrimary ? 'Recommended' : 'Alternative'}
                            </span>
                          </div>
                          ${factsHtml}
                        </article>
                      `;
                    })
                    .join('')
                : '<p class="proposal-hotel-option-empty">Accommodation options to be confirmed.</p>';

              return `
                <section class="proposal-hotel-option-set avoid-break">
                  <div class="proposal-hotel-option-set-head">
                    <div>
                      <h4>${this.escapeHtml(optionSet.name)}</h4>
                      ${optionSet.notes ? `<p>${this.escapeHtml(optionSet.notes)}</p>` : ''}
                    </div>
                    <span>${optionSet.options.length} option${optionSet.options.length === 1 ? '' : 's'}</span>
                  </div>
                  <div class="proposal-hotel-option-card-list">${optionsHtml}</div>
                </section>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  }

  private renderAccommodationMatrix(viewModel: ProposalV3ViewModel) {
    const matrix = viewModel.accommodationMatrix;
    if (!matrix) {
      return '';
    }

    const optionSetHeaders = matrix.optionSets
      .map((optionSet) => `<th scope="col">${this.escapeHtml(optionSet.name)}</th>`)
      .join('');
    const cityRows = matrix.rows
      .map(
        (row) => `
          <tr class="proposal-accommodation-matrix-city-row">
            <th scope="row">${this.escapeHtml(row.city)}</th>
            ${row.cells.map((cell) => `<td>${this.renderAccommodationMatrixCell(cell)}</td>`).join('')}
          </tr>
        `,
      )
      .join('');

    return `
      <section class="proposal-accommodation-matrix-shell">
        <div class="proposal-hotel-option-set-head proposal-accommodation-matrix-head">
          <div>
            <h4>Accommodation Comparison</h4>
            <p>Primary stays by city and option set.</p>
          </div>
          <span>${matrix.optionSets.length} option sets</span>
        </div>
        <div class="proposal-table-shell proposal-accommodation-matrix-wrap">
          <table class="proposal-table proposal-accommodation-matrix">
            <colgroup>
              <col class="proposal-accommodation-matrix-city-col" />
              ${matrix.optionSets.map(() => '<col class="proposal-accommodation-matrix-option-col" />').join('')}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">City</th>
                ${optionSetHeaders}
              </tr>
            </thead>
            <tbody>${cityRows}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  private renderAccommodationMatrixCell(
    cell: NonNullable<ProposalV3ViewModel['accommodationMatrix']>['rows'][number]['cells'][number],
  ) {
    if (!cell.primaryHotel) {
      return '<p class="proposal-accommodation-matrix-empty">To be confirmed</p>';
    }

    const detailParts = [
      cell.room,
      cell.mealPlan,
      this.formatHotelOptionNightLabel(cell.nights),
    ];
    const details = this.joinInlineParts(detailParts);
    const alternativesHtml =
      cell.alternativeHotels.length > 0 || cell.hasMoreAlternatives
        ? `
          <div class="proposal-accommodation-matrix-alternatives">
            <span>Alternatives</span>
            ${
              cell.alternativeHotels.length > 0
                ? `<ul>${cell.alternativeHotels.map((hotel) => `<li>${this.escapeHtml(hotel)}</li>`).join('')}</ul>`
                : ''
            }
            ${cell.hasMoreAlternatives ? '<p>Alternatives available</p>' : ''}
          </div>
        `
        : '';

    return `
      <div class="proposal-accommodation-matrix-cell">
        <div class="proposal-accommodation-matrix-cell-head">
          <strong>${this.escapeHtml(this.getDisplayText(cell.primaryHotel, 'Stay'))}</strong>
          ${cell.isRecommended ? '<span>Recommended</span>' : ''}
        </div>
        ${details ? `<p>${this.escapeHtml(details)}</p>` : ''}
        ${alternativesHtml}
      </div>
    `;
  }

  private formatHotelOptionNightLabel(nights: number | null) {
    return nights ? `${nights} night${nights === 1 ? '' : 's'}` : null;
  }

  private renderHotelOptionFacts(option: ProposalV3ViewModel['hotelOptionSets'][number]['options'][number]) {
    const descriptionHtml = option.shortDescription
      ? `<p class="proposal-hotel-option-description">${this.escapeHtml(option.shortDescription)}</p>`
      : '';
    const highlightsHtml = option.highlights.length > 0
      ? `
        <div class="proposal-hotel-option-facts">
          <span>Highlights</span>
          <ul>${option.highlights.map((highlight) => `<li>${this.escapeHtml(highlight)}</li>`).join('')}</ul>
        </div>
      `
      : '';
    const amenitiesHtml = option.amenities.length > 0
      ? `
        <div class="proposal-hotel-option-facts">
          <span>Amenities</span>
          <p>${this.escapeHtml(option.amenities.join(', '))}</p>
        </div>
      `
      : '';

    return [descriptionHtml, highlightsHtml, amenitiesHtml].filter(Boolean).join('');
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

    // Only group the itinerary by country when the trip genuinely spans 2+
    // resolved countries — single-country (or unresolved) proposals render
    // exactly as before, so this is a no-op for the common case.
    const resolvedDayCountries = Array.from(
      new Set(viewModel.days.map((day) => (day.country || '').trim()).filter(Boolean)),
    );
    const showCountryGroups = resolvedDayCountries.length >= 2;

    return viewModel.days
      .map((day, index, allDays) => {
        const previousCountry = index > 0 ? allDays[index - 1].country : null;
        const countryHeading =
          showCountryGroups && day.country && day.country !== previousCountry
            ? `<h2 class="proposal-country-heading" style="margin:1.6rem 0 0.4rem;font-size:0.95rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${this.escapeHtml(viewModel.accentColor)};border-bottom:2px solid ${this.escapeHtml(viewModel.accentColor)};padding-bottom:0.3rem;">${this.escapeHtml(day.country as string)}</h2>`
            : '';
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
          ${countryHeading}
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
        <p class="investment-summary-note">${this.escapeHtml(investment.summaryNote)}</p>
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
      .join(' | ');
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
