import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const listPageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const detailPageSource = readFileSync(new URL('./[id]/page.tsx', import.meta.url), 'utf8');
const componentFormSource = readFileSync(new URL('./PackageTemplateComponentForm.tsx', import.meta.url), 'utf8');
const componentReorderSource = readFileSync(new URL('./PackageComponentReorderControls.tsx', import.meta.url), 'utf8');
const dayActionsSource = readFileSync(new URL('./PackageDayPlannerActions.tsx', import.meta.url), 'utf8');
const dayFormSource = readFileSync(new URL('./PackageTemplateDayForm.tsx', import.meta.url), 'utf8');
const displaySource = readFileSync(new URL('./package-template-display.ts', import.meta.url), 'utf8');
const duplicateButtonSource = readFileSync(new URL('./PackageTemplateDuplicateButton.tsx', import.meta.url), 'utf8');
const quoteAssemblyPanelSource = readFileSync(new URL('./PackageQuoteAssemblyPanel.tsx', import.meta.url), 'utf8');
const apiServiceSource = readFileSync(new URL('../../../api/src/package-templates/package-templates.service.ts', import.meta.url), 'utf8');
const apiControllerSource = readFileSync(new URL('../../../api/src/package-templates/package-templates.controller.ts', import.meta.url), 'utf8');
const quoteServiceSource = readFileSync(new URL('../../../api/src/quotes/quotes.service.ts', import.meta.url), 'utf8');
const quoteControllerSource = readFileSync(new URL('../../../api/src/quotes/quotes.controller.ts', import.meta.url), 'utf8');
const prismaSchemaSource = readFileSync(new URL('../../../api/prisma/schema.prisma', import.meta.url), 'utf8');
const quoteAssemblySource = quoteServiceSource.slice(
  quoteServiceSource.indexOf('async previewPackageTemplateAssembly'),
  quoteServiceSource.indexOf('private async findActivityBridgeSupplierService'),
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
    assert.match(apiServiceSource, /supplierServiceId is required for service components/);
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
});
