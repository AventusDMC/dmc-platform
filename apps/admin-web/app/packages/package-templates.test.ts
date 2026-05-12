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
const apiServiceSource = readFileSync(new URL('../../../api/src/package-templates/package-templates.service.ts', import.meta.url), 'utf8');
const apiControllerSource = readFileSync(new URL('../../../api/src/package-templates/package-templates.controller.ts', import.meta.url), 'utf8');
const prismaSchemaSource = readFileSync(new URL('../../../api/prisma/schema.prisma', import.meta.url), 'utf8');

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
});
