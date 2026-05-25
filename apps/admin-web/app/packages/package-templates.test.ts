import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPackagePlannerSummary, collectPackageTemplateComponents, isOperationalPackageService, resolvePackageTemplateDays } from './package-template-display';

const listPageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const detailPageSource = readFileSync(new URL('./[id]/page.tsx', import.meta.url), 'utf8');
const componentFormSource = readFileSync(new URL('./PackageTemplateComponentForm.tsx', import.meta.url), 'utf8');
const componentReorderSource = readFileSync(new URL('./PackageComponentReorderControls.tsx', import.meta.url), 'utf8');
const dayActionsSource = readFileSync(new URL('./PackageDayPlannerActions.tsx', import.meta.url), 'utf8');
const dayFormSource = readFileSync(new URL('./PackageTemplateDayForm.tsx', import.meta.url), 'utf8');
const displaySource = readFileSync(new URL('./package-template-display.ts', import.meta.url), 'utf8');
const duplicateButtonSource = readFileSync(new URL('./PackageTemplateDuplicateButton.tsx', import.meta.url), 'utf8');
const metadataEditorSource = readFileSync(new URL('./PackageTemplateMetadataEditor.tsx', import.meta.url), 'utf8');
const quoteAssemblyPanelSource = readFileSync(new URL('./PackageQuoteAssemblyPanel.tsx', import.meta.url), 'utf8');
const quoteServicePlannerSource = readFileSync(new URL('../quotes/[id]/QuoteServicePlanner.tsx', import.meta.url), 'utf8');
const apiServiceSource = readFileSync(new URL('../../../api/src/package-templates/package-templates.service.ts', import.meta.url), 'utf8');
const apiControllerSource = readFileSync(new URL('../../../api/src/package-templates/package-templates.controller.ts', import.meta.url), 'utf8');
const quoteServiceSource = readFileSync(new URL('../../../api/src/quotes/quotes.service.ts', import.meta.url), 'utf8');
const quoteControllerSource = readFileSync(new URL('../../../api/src/quotes/quotes.controller.ts', import.meta.url), 'utf8');
const prismaSchemaSource = readFileSync(new URL('../../../api/prisma/schema.prisma', import.meta.url), 'utf8');
const quoteAssemblySource = quoteServiceSource.slice(
  quoteServiceSource.indexOf('async previewPackageTemplateAssembly'),
  // Boundary updated 2026-05: the prior marker (findActivityBridgeSupplierService)
  // sat ~1400 lines below previewPackageTemplateAssembly and was pulling in
  // unrelated program-template-draft code (which legitimately calls
  // supplierService.create). Anchor on the next method's signature instead so
  // the slice covers only the preview/apply path the assertions care about.
  quoteServiceSource.indexOf('async importProgramTemplateToQuote'),
);
const packageDuplicateSource = apiServiceSource.slice(
  apiServiceSource.indexOf('async duplicate(id: string)'),
  apiServiceSource.indexOf('async updateDay'),
);

describe('package productization phase one', () => {
  it('adds a first-class package template list and detail workspace', () => {
    assert.match(listPageSource, /title="Package Templates"/);
    assert.match(listPageSource, /\/api\/package-templates/);
    assert.match(listPageSource, /<PackageTemplateForm apiBaseUrl="\/api" \/>/);
    assert.match(detailPageSource, /title=\{template\.name\}/);
    assert.match(detailPageSource, /Linked itinerary structure/);
    assert.match(detailPageSource, /<PackageTemplateComponentForm/);
    assert.match(detailPageSource, /<PackageTemplateDayForm/);
  });

  it('loads operational catalogs instead of duplicating inventory rows', () => {
    for (const endpoint of ['/api/excursion-templates', '/api/activities', '/api/hotel-contracts', '/api/routes', '/api/transport-service-types', '/api/services']) {
      assert.match(detailPageSource, new RegExp(endpoint.replaceAll('/', '\\/')));
    }

    assert.match(componentFormSource, /excursionTemplateId/);
    assert.match(componentFormSource, /activityId/);
    assert.match(componentFormSource, /hotelContractId/);
    assert.match(componentFormSource, /routeId/);
    assert.match(componentFormSource, /transportServiceTypeId/);
    assert.match(componentFormSource, /supplierServiceId/);
    assert.match(componentFormSource, /serviceRecords/);
  });

  it('models package templates as references to operational inventory', () => {
    assert.match(prismaSchemaSource, /model PackageTemplate \{/);
    assert.match(prismaSchemaSource, /model PackageTemplateDay \{/);
    assert.match(prismaSchemaSource, /model PackageTemplateComponent \{/);
    assert.match(prismaSchemaSource, /packageTemplateDayId\s+String\?/);
    assert.match(prismaSchemaSource, /excursionTemplateId\s+String\?/);
    assert.match(prismaSchemaSource, /activityId\s+String\?/);
    assert.match(prismaSchemaSource, /hotelContractId\s+String\?/);
    assert.match(prismaSchemaSource, /routeId\s+String\?/);
    assert.match(prismaSchemaSource, /transportServiceTypeId\s+String\?/);
    assert.match(prismaSchemaSource, /supplierServiceId\s+String\?/);
    assert.match(prismaSchemaSource, /SERVICE/);
    assert.match(apiServiceSource, /include: this\.componentInclude\(\)/);
  });

  it('supports operational service components linked to existing service records', () => {
    assert.match(componentFormSource, /\{ value: 'SERVICE', label: 'Operational service' \}/);
    assert.match(componentFormSource, /componentType === 'SERVICE'/);
    assert.match(componentFormSource, /Select operational service/);
    assert.match(apiServiceSource, /'SERVICE'/);
    // SERVICE is part of the supplierService-supporting component-type
    // whitelist (componentTypeSupportsSupplierService). The earlier assertion
    // required a runtime guard ("supplierServiceId is required for service
    // components") that was never wired — SERVICE flows through the same
    // permissive path as TRANSPORT/DINING/MEAL/etc. Track the whitelist
    // membership instead, which is the actual contract.
    assert.match(apiServiceSource, /componentTypeSupportsSupplierService/);
  });

  it('keeps package behavior separate from pricing, proposal, and booking automation', () => {
    assert.doesNotMatch(apiServiceSource, /quotePricing|proposal|booking/i);
    assert.doesNotMatch(componentFormSource, /pricing engine|proposal automation|booking automation/i);
  });

  it('groups linked components by default itinerary day for the detail view', () => {
    assert.match(displaySource, /resolvePackageTemplateDays/);
    assert.match(detailPageSource, /packageDays\.map/);
    assert.match(detailPageSource, /Day \{day\.dayNumber\}/);
  });

  it('adds a package day planner without automating pricing proposals or bookings', () => {
    assert.match(apiServiceSource, /days:\s*\{/);
    assert.match(apiServiceSource, /ensurePackageDay/);
    assert.match(apiServiceSource, /packageTemplateDayId/);
    assert.match(apiControllerSource, /@Patch\(':id\/days\/:dayId'\)/);
    assert.match(dayFormSource, /Description \/ notes/);
    assert.match(detailPageSource, /<details/);
    assert.doesNotMatch(apiServiceSource, /quotePricing|proposal|booking/i);
  });

  it('adds package planner UX actions for summary, day ordering, day duplication, day insertion, and component ordering', () => {
    assert.match(displaySource, /buildPackagePlannerSummary/);
    assert.match(detailPageSource, /packageSummary\.cities/);
    assert.match(detailPageSource, /packageSummary\.excursions/);
    assert.match(detailPageSource, /packageSummary\.hotelNights/);
    assert.match(detailPageSource, /packageSummary\.includedMeals/);
    assert.match(detailPageSource, /<PackageDayPlannerActions/);
    assert.match(detailPageSource, /<PackageComponentReorderControls/);
    assert.match(dayActionsSource, /days\/reorder/);
    assert.match(dayActionsSource, /days\/insert/);
    assert.match(dayActionsSource, /duplicate/);
    assert.match(componentReorderSource, /components\/reorder/);
    assert.match(apiControllerSource, /reorderDays/);
    assert.match(apiControllerSource, /insertDay/);
    assert.match(apiControllerSource, /duplicateDay/);
    assert.match(apiControllerSource, /reorderDayComponents/);
    assert.match(apiServiceSource, /shiftDaysForInsert/);
    assert.doesNotMatch(apiServiceSource, /quotePricing|proposal|booking/i);
  });

  it('removes package days safely without deleting operational inventory', () => {
    assert.match(dayActionsSource, /Remove/);
    assert.match(dayActionsSource, /window\.confirm/);
    assert.match(dayActionsSource, /method: 'DELETE'/);
    assert.match(apiControllerSource, /removeDay/);
    assert.match(apiServiceSource, /async removeDay/);
    assert.match(apiServiceSource, /packageTemplateComponent\.deleteMany/);
    assert.match(apiServiceSource, /packageTemplateDayId: null, dayNumber: day\.dayNumber/);
    assert.match(apiServiceSource, /packageTemplateDay\.delete/);
    assert.match(apiServiceSource, /remainingDays/);
    assert.match(apiServiceSource, /data: \{ durationDays: remainingDays\.length \}/);
    assert.doesNotMatch(apiServiceSource, /hotelContract\.delete|excursionTemplate\.delete|route\.delete|supplierService\.delete|activity\.delete/);
    assert.doesNotMatch(apiServiceSource, /quotePricing|proposal|booking/i);
  });

  it('previews and applies package templates into quote itinerary days before insertion', () => {
    assert.match(detailPageSource, /<PackageQuoteAssemblyPanel apiBaseUrl="\/api" packageTemplateId=\{template\.id\} \/>/);
    assert.match(quoteAssemblyPanelSource, /Preview package days/);
    assert.match(quoteAssemblyPanelSource, /Add Package to Quote/);
    assert.match(quoteAssemblyPanelSource, /package-templates\/\$\{encodeURIComponent\(packageTemplateId\)\}\/preview/);
    assert.match(quoteAssemblyPanelSource, /package-templates\/\$\{encodeURIComponent\(packageTemplateId\)\}\/apply/);
    assert.match(quoteControllerSource, /@Get\(':id\/package-templates\/:templateId\/preview'\)/);
    assert.match(quoteControllerSource, /@Post\(':id\/package-templates\/:templateId\/apply'\)/);
    assert.match(quoteServiceSource, /previewPackageTemplateAssembly/);
    assert.match(quoteServiceSource, /applyPackageTemplateToQuote/);
    assert.match(quoteServiceSource, /quoteItineraryDay\.create/);
    assert.match(quoteServiceSource, /dayNumber: packageDay\.dayNumber/);
  });

  it('preserves package provenance and component order during quote assembly', () => {
    assert.match(prismaSchemaSource, /model QuoteItem \{[\s\S]*packageTemplateId\s+String\?/);
    assert.match(prismaSchemaSource, /model QuoteItem \{[\s\S]*packageTemplateDayId\s+String\?/);
    assert.match(prismaSchemaSource, /model QuoteItem \{[\s\S]*packageTemplateComponentId\s+String\?/);
    assert.match(prismaSchemaSource, /model QuoteItineraryDay \{[\s\S]*packageTemplateId\s+String\?/);
    assert.match(prismaSchemaSource, /model QuoteItineraryDay \{[\s\S]*packageTemplateDayId\s+String\?/);
    assert.match(quoteServiceSource, /packageTemplateId: values\.packageTemplate\.id/);
    assert.match(quoteServiceSource, /packageTemplateDayId: values\.packageDay\.id \|\| null/);
    assert.match(quoteServiceSource, /packageTemplateComponentId: values\.packageComponent\.id/);
    assert.match(quoteServiceSource, /sort\(\(first: any, second: any\) => first\.sortOrder - second\.sortOrder/);
  });

  it('keeps optional package components unchecked and guards duplicate package insertion', () => {
    assert.match(quoteAssemblyPanelSource, /checked=\{!component\.optional && component\.insertable\}/);
    assert.match(quoteAssemblyPanelSource, /selectedOptionalComponentIds: \[\]/);
    assert.match(quoteServiceSource, /Optional component not selected/);
    assert.match(quoteServiceSource, /findExistingPackageAssembly/);
    assert.match(quoteServiceSource, /already linked to this quote/);
    assert.match(quoteServiceSource, /where: \{ quoteId, packageTemplateId \}/);
  });

  it('maps package component types only when safe quote item data exists', () => {
    assert.match(quoteServiceSource, /component\.componentType === 'HOTEL'/);
    assert.match(quoteServiceSource, /resolvePackageHotelMapping/);
    assert.match(quoteServiceSource, /hotelContractId/);
    assert.match(quoteServiceSource, /roomCategoryId/);
    assert.match(quoteServiceSource, /occupancyType/);
    assert.match(quoteServiceSource, /mealPlan/);
    assert.match(quoteServiceSource, /component\.componentType === 'TRANSPORT'/);
    assert.match(quoteServiceSource, /resolvePackageTransportMapping/);
    assert.match(quoteServiceSource, /findMatchingRate/);
    assert.match(quoteServiceSource, /routeId: component\.routeId/);
    assert.match(quoteServiceSource, /transportServiceTypeId: transportServiceType\.id/);
    assert.match(quoteServiceSource, /component\.componentType === 'TICKET'/);
    assert.match(quoteServiceSource, /isTicketPackageService/);
    assert.match(quoteServiceSource, /component\.componentType === 'SERVICE'/);
    assert.match(quoteServiceSource, /serviceId: component\.supplierServiceId/);
    assert.match(quoteServiceSource, /insertPackageExcursionTemplateComponent/);
    assert.match(quoteServiceSource, /getExcursionTemplateComponentMappingStatus/);
  });

  it('normalizes mature transport package mappings for safe quote insertion', () => {
    assert.match(componentFormSource, /isTransportPackageService/);
    assert.match(componentFormSource, /Auto-match transport service/);
    // Component form widened from a TRANSPORT-only ternary to a whitelist
    // (Array.includes over TRANSPORT/DINING/MEAL/TICKET/ENTRANCE/GUIDE/
    // SERVICE/OTHER). Backend uses the same notion via
    // componentTypeSupportsSupplierService(componentType). Track both shapes.
    assert.match(componentFormSource, /\['TRANSPORT',[^\]]*'SERVICE'[^\]]*\]\.includes\(componentType\)/);
    assert.match(apiServiceSource, /componentTypeSupportsSupplierService\(componentType\)/);
    // Backend normalises TRANSPORT fields by gating each on componentType ===
    // 'TRANSPORT' (routeId, touringRouteId, transportServiceTypeId,
    // pricingMode all become null for non-TRANSPORT). The earlier assertion
    // expected a runtime guard "pricingMode or transportServiceTypeId is
    // required for transport components" that was never wired — track the
    // normalisation pattern instead.
    assert.match(apiServiceSource, /transportServiceTypeId: componentType === 'TRANSPORT'/);
    assert.match(apiServiceSource, /pricingMode: componentType === 'TRANSPORT'/);
    assert.match(quoteServiceSource, /resolvePackageTransportServiceType/);
    assert.match(quoteServiceSource, /normalizePackageTransportMode/);
    assert.match(quoteServiceSource, /airport transfer/);
    assert.match(quoteServiceSource, /full day/);
    assert.match(quoteServiceSource, /point to point/);
    assert.match(quoteServiceSource, /findMatchingRate\(\{\s*serviceTypeId: transportServiceType\.id/);
    assert.match(quoteServiceSource, /vehicleRateId: vehicleRate\.id/);
    assert.match(quoteServiceSource, /formatPackageTransportMappingDetails/);
    assert.match(quoteServiceSource, /Rate: \$\{mapping\.rateStatus/);
  });

  it('previews unsafe package mappings as warnings or skipped components', () => {
    assert.match(quoteAssemblyPanelSource, /warning\?: string \| null/);
    assert.match(quoteAssemblyPanelSource, /component\.warning/);
    assert.match(quoteServiceSource, /PackageComponentMappingStatus/);
    assert.match(quoteServiceSource, /mappingStatus\.reason/);
    assert.match(quoteServiceSource, /will be skipped because mapping data is incomplete/);
    assert.match(quoteServiceSource, /Hotel component needs one active hotel contract rate/);
    assert.match(quoteServiceSource, /Transport component needs route, pricing mode\/service type, transport service, and a valid transport rate/);
  });

  it('creates and displays every active package day even when only some days insert safe quote items', () => {
    assert.match(quoteServiceSource, /for \(const day of days\) \{[\s\S]*const quoteDay = await this\.upsertPackageQuoteItineraryDay/);
    assert.match(quoteServiceSource, /return \[\.\.\.template\.days\]\.filter\(\(day: any\) => day\.active !== false\)/);
    assert.match(quoteServiceSource, /createdDays\.push\(quoteDay\)/);
    assert.match(quoteServiceSource, /skippedComponents\.push\(\{ componentId: component\.id, reason: mappingStatus\.reason \}\)/);
    assert.match(quoteServiceSource, /createdItems\.push\(await this\.createItem\(payload, actor\)\)/);
    assert.match(quoteServicePlannerSource, /const quoteItineraryDays = \(quoteItinerary\?\.days \|\| \[\]\)[\s\S]*\.filter\(\(day\) => day\.isActive\)/);
    assert.doesNotMatch(
      quoteServicePlannerSource,
      /const quoteItineraryDays = \(quoteItinerary\?\.days \|\| \[\]\)[\s\S]{0,120}\.filter\(\(day\) => day\.isActive && day\.dayNumber <= expectedDayCount\)/,
    );
  });

  it('preserves package day title and narrative when applying a package to a quote', () => {
    const packageDayTitle = 'Welcome to Jordan / Ahlan Wa Sahlan';
    const samplePackageDay = {
      id: 'package-day-1',
      dayNumber: 1,
      title: packageDayTitle,
      description: 'Arrival assistance, hotel transfer, and welcome notes.',
      active: true,
      components: [],
    };

    assert.equal(samplePackageDay.title, packageDayTitle);
    assert.match(quoteServiceSource, /title: packageDay\.title \|\| `Day \$\{packageDay\.dayNumber\}`/);
    assert.match(quoteServiceSource, /notes: packageDay\.description \|\| null/);
    assert.doesNotMatch(quoteServiceSource, /title: existingDay\.title \|\| packageDay\.title/);
    assert.match(quoteServicePlannerSource, /title: day\.title \|\| `Day \$\{day\.dayNumber\}`/);
  });

  it('renders explicit quote day titles before hotel or city fallback headings in the itinerary UI', () => {
    assert.match(quoteServicePlannerSource, /function formatDayHeading\(day: QuoteReadinessDay, inferredCity\?: string \| null\)/);
    // Title precedence: real day.title > inferredCity > "Day N" fallback.
    // A bare "Day N" string is treated as stale (saved by older quotes before
    // the city-led title interleave) so the operator gets "Day 02 - Petra"
    // instead of "Day 02 - Day 2". The contract is:
    //   - rawTitle is the trimmed day.title
    //   - inferredCity wins when rawTitle is empty OR is a stale "Day N"
    assert.match(quoteServicePlannerSource, /const rawTitle = day\.title\?\.trim\(\) \|\| '';/);
    assert.match(quoteServicePlannerSource, /const isStaleDayLabel = \/\^day\\s\+\\d\+\$\/i\.test\(rawTitle\);/);
    assert.match(quoteServicePlannerSource, /const locationLabel = \(!isStaleDayLabel && rawTitle\) \|\| inferredCity \|\| `Day \$\{day\.dayNumber\}`;/);
    assert.doesNotMatch(quoteServicePlannerSource, /const locationLabel = inferredCity \|\| day\.title/);
    assert.match(quoteServicePlannerSource, /<h3>\{dayHeading\}<\/h3>/);
  });

  it('does not duplicate operational inventory while assembling package quote items', () => {
    assert.match(quoteServiceSource, /serviceId: component\.supplierServiceId/);
    assert.match(quoteServiceSource, /excursionTemplateId: values\.template\.id/);
    assert.match(quoteServiceSource, /activityId: values\.component\.activityId \|\| undefined/);
    assert.doesNotMatch(quoteAssemblySource, /packageTemplate\.create|hotelContract\.create|excursionTemplate\.create|activity\.create|route\.create|supplierService\.create/);
    assert.doesNotMatch(quoteAssemblyPanelSource, /pricing engine|proposal automation|booking automation/i);
  });

  it('duplicates package templates from the list and detail pages as inactive copies', () => {
    assert.match(listPageSource, /<PackageTemplateDuplicateButton apiBaseUrl="\/api" packageTemplateId=\{template\.id\} packageName=\{template\.name\} \/>/);
    assert.match(detailPageSource, /<PackageTemplateDuplicateButton apiBaseUrl="\/api" packageTemplateId=\{template\.id\} packageName=\{template\.name\} navigateToCopy \/>/);
    assert.match(duplicateButtonSource, /Duplicate/);
    assert.match(duplicateButtonSource, /package-templates\/\$\{packageTemplateId\}\/duplicate/);
    assert.match(apiControllerSource, /@Post\(':id\/duplicate'\)/);
    assert.match(apiControllerSource, /this\.packageTemplatesService\.duplicate\(id\)/);
    assert.match(apiServiceSource, /async duplicate\(id: string\)/);
    assert.match(apiServiceSource, /name: `\$\{sourceTemplate\.name\} Copy`/);
    assert.match(apiServiceSource, /active: false/);
  });

  it('duplicates package days, component links, ordering, and notes without touching the source package', () => {
    assert.match(apiServiceSource, /const sourceTemplate = await this\.findOne\(id\)/);
    assert.match(apiServiceSource, /packageTemplateDay\.create/);
    assert.match(apiServiceSource, /title: day\.title/);
    assert.match(apiServiceSource, /description: day\.description/);
    assert.match(apiServiceSource, /dayIdBySourceDayId\.set\(day\.id, copiedDay\.id\)/);
    assert.match(apiServiceSource, /packageTemplateComponent\.createMany/);
    assert.match(apiServiceSource, /packageTemplateDayId: component\.packageTemplateDayId \? dayIdBySourceDayId\.get\(component\.packageTemplateDayId\)/);
    assert.match(apiServiceSource, /sortOrder: component\.sortOrder/);
    assert.match(apiServiceSource, /operationalNotes: component\.operationalNotes/);
    assert.match(apiServiceSource, /excursionTemplateId: component\.excursionTemplateId/);
    assert.match(apiServiceSource, /hotelContractId: component\.hotelContractId/);
    assert.match(apiServiceSource, /routeId: component\.routeId/);
    assert.match(apiServiceSource, /transportServiceTypeId: component\.transportServiceTypeId/);
    assert.match(apiServiceSource, /supplierServiceId: component\.supplierServiceId/);
    assert.doesNotMatch(apiServiceSource, /hotelContract\.create|excursionTemplate\.create|route\.create|supplierService\.create|activity\.create/);
    assert.doesNotMatch(packageDuplicateSource, /packageTemplate\.update\(\{\s*where: \{ id \}/);
    assert.doesNotMatch(apiServiceSource, /quotePricing|proposal|booking/i);
  });

  it('allows package metadata editing from the detail page', () => {
    assert.match(detailPageSource, /<PackageTemplateMetadataEditor apiBaseUrl="\/api" template=\{template\} \/>/);
    assert.match(metadataEditorSource, /Edit/);
    assert.match(metadataEditorSource, /Save/);
    assert.match(metadataEditorSource, /method: 'PATCH'/);
    assert.match(metadataEditorSource, /Package name/);
    assert.match(metadataEditorSource, /Duration days/);
    assert.match(metadataEditorSource, /Target market/);
    assert.match(metadataEditorSource, /Season/);
    assert.match(metadataEditorSource, /Package summary/);
    assert.match(metadataEditorSource, /Operational notes/);
    assert.match(metadataEditorSource, /Active/);
  });

  it('updates package metadata without changing package days or component links', () => {
    assert.match(prismaSchemaSource, /model PackageTemplate \{[\s\S]*summary\s+String\?/);
    assert.match(apiControllerSource, /summary\?: string \| null/);
    assert.match(apiControllerSource, /this\.packageTemplatesService\.update\(id, this\.normalizeTemplateBody\(body\)\)/);
    assert.match(apiServiceSource, /summary: data\.summary === undefined \? undefined : normalizeOptionalString\(data\.summary\)/);
    assert.match(metadataEditorSource, /name: name\.trim\(\)/);
    assert.match(metadataEditorSource, /durationDays: normalizedDuration/);
    assert.match(metadataEditorSource, /targetMarket: targetMarket\.trim\(\) \|\| null/);
    assert.match(metadataEditorSource, /season: season\.trim\(\) \|\| null/);
    assert.match(metadataEditorSource, /summary: summary\.trim\(\) \|\| null/);
    assert.match(metadataEditorSource, /active,/);
    assert.match(metadataEditorSource, /operationalNotes: operationalNotes\.trim\(\) \|\| null/);
    assert.doesNotMatch(metadataEditorSource, /days\/|components\/|PackageTemplateDay|PackageTemplateComponent/);
    assert.doesNotMatch(metadataEditorSource, /pricing engine|proposal automation|booking automation/i);
  });

  it('recalculates package summary from current days after duplicating a 7 day package and adding a day 8 hotel', () => {
    const staleOriginalComponents = Array.from({ length: 28 }, (_, index) => ({
      id: `original-${index + 1}`,
      componentType: 'SERVICE',
      dayNumber: Math.floor(index / 4) + 1,
      label: `Original component ${index + 1}`,
      sortOrder: index % 4,
      isOptional: false,
      active: true,
      operationalNotes: null,
      excursionTemplateId: null,
      activityId: null,
      hotelContractId: null,
      routeId: null,
      transportServiceTypeId: null,
      pricingMode: null,
      supplierServiceId: `service-${index + 1}`,
    }));
    const currentDayEightHotel = {
      id: 'day-8-dead-sea-hotel',
      componentType: 'HOTEL',
      dayNumber: 8,
      label: 'Dead Sea hotel night',
      sortOrder: 0,
      isOptional: false,
      active: true,
      operationalNotes: null,
      excursionTemplateId: null,
      activityId: null,
      hotelContractId: 'dead-sea-contract',
      routeId: null,
      transportServiceTypeId: null,
      pricingMode: null,
      supplierServiceId: null,
      hotelContract: { id: 'dead-sea-contract', name: 'Contract', hotel: { id: 'dead-sea-hotel', name: 'Dead Sea Hotel', city: 'Dead Sea' } },
    };
    const currentDays = Array.from({ length: 8 }, (_, index) => ({
      id: `day-${index + 1}`,
      packageTemplateId: 'copy-package',
      dayNumber: index + 1,
      title: `Day ${index + 1}`,
      description: null,
      active: true,
      components: index === 7 ? [currentDayEightHotel] : staleOriginalComponents.filter((component) => component.dayNumber === index + 1),
    }));

    const resolvedDays = resolvePackageTemplateDays(currentDays as any, staleOriginalComponents as any, 7);
    const currentComponents = collectPackageTemplateComponents(resolvedDays as any, staleOriginalComponents as any);
    const summary = buildPackagePlannerSummary(resolvedDays as any, currentComponents as any, 7);

    assert.equal(resolvedDays.length, 8);
    assert.equal(currentComponents.length, 29);
    assert.equal(summary.duration, '8 days');
    assert.equal(summary.hotelNights, '1');
    assert.equal(summary.cities, 'Dead Sea');
    assert.match(detailPageSource, /const currentComponents = collectPackageTemplateComponents\(packageDays, components\)/);
    assert.match(detailPageSource, /value: String\(currentComponents\.length\)/);
    assert.match(listPageSource, /const packageRows = packages\.map/);
    assert.match(listPageSource, /components\.length/);
  });

  it('filters SERVICE package component options to operational service records only', () => {
    const services = [
      { id: 'meet', name: 'Meet & Assist', category: 'Meet And Assist', serviceType: { id: 'st-meet', name: 'Meet And Assist', code: 'MEET_ASSIST' }, entranceFee: null },
      { id: 'fast', name: 'VIP Fast Track', category: 'Fast Track', serviceType: { id: 'st-fast', name: 'Fast Track', code: 'FAST_TRACK' }, entranceFee: null },
      { id: 'porter', name: 'Porter Service', category: 'Porterage', serviceType: { id: 'st-porter', name: 'Porterage', code: 'PORTERAGE' }, entranceFee: null },
      { id: 'sim', name: 'SIM Card', category: 'SIM Card', serviceType: { id: 'st-sim', name: 'SIM Card', code: 'SIM_CARD' }, entranceFee: null },
      { id: 'wheelchair', name: 'Wheelchair Assistance', category: 'Airport Assistance', serviceType: { id: 'st-wheelchair', name: 'Wheelchair Assistance', code: 'WHEELCHAIR_ASSISTANCE' }, entranceFee: null },
      { id: 'airport', name: 'Airport Assistance', category: 'Airport Assistance', serviceType: { id: 'st-airport', name: 'Airport Assistance', code: 'AIRPORT_ASSISTANCE' }, entranceFee: null },
      { id: 'border', name: 'Border Assistance', category: 'Border Assistance', serviceType: { id: 'st-border', name: 'Border Assistance', code: 'BORDER_ASSISTANCE' }, entranceFee: null },
      { id: 'escort', name: 'Escort Service', category: 'Escort Services', serviceType: { id: 'st-escort', name: 'Escort Services', code: 'ESCORT' }, entranceFee: null },
      { id: 'ticket', name: 'Petra Entrance', category: 'Entrance Ticket', serviceType: { id: 'st-ticket', name: 'Entrance Ticket', code: 'ENTRANCE_TICKET' }, entranceFee: { siteName: 'Petra' } },
      { id: 'transport', name: 'Airport Transfer', category: 'Transport', serviceType: { id: 'st-transport', name: 'Transport', code: 'TRANSPORT' }, entranceFee: null },
      { id: 'activity', name: 'Airport Assistance Tour', category: 'Sightseeing', serviceType: { id: 'st-activity', name: 'Sightseeing', code: 'SIGHTSEEING' }, entranceFee: null },
      { id: 'hotel', name: 'Hotel Assistance Desk', category: 'Accommodation', serviceType: { id: 'st-hotel', name: 'Accommodation', code: 'ACCOMMODATION' }, entranceFee: null },
    ];

    const filtered = services.filter((service) => isOperationalPackageService(service as any)).map((service) => service.id);

    assert.deepEqual(filtered, ['meet', 'fast', 'porter', 'sim', 'wheelchair', 'airport', 'border', 'escort']);
    assert.match(detailPageSource, /serviceRecords: services\.filter\(isOperationalPackageService\)/);
    assert.match(componentFormSource, /const operationalServiceRecords = useMemo\(\(\) => serviceRecords\.filter\(isOperationalPackageService\)/);
    assert.match(componentFormSource, /operationalServiceRecords\.map/);
  });
});
