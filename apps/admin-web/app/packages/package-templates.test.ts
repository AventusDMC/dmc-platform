import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const listPageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const detailPageSource = readFileSync(new URL('./[id]/page.tsx', import.meta.url), 'utf8');
const componentFormSource = readFileSync(new URL('./PackageTemplateComponentForm.tsx', import.meta.url), 'utf8');
const displaySource = readFileSync(new URL('./package-template-display.ts', import.meta.url), 'utf8');
const apiServiceSource = readFileSync(new URL('../../../api/src/package-templates/package-templates.service.ts', import.meta.url), 'utf8');
const prismaSchemaSource = readFileSync(new URL('../../../api/prisma/schema.prisma', import.meta.url), 'utf8');

describe('package productization phase one', () => {
  it('adds a first-class package template list and detail workspace', () => {
    assert.match(listPageSource, /title="Package Templates"/);
    assert.match(listPageSource, /\/api\/package-templates/);
    assert.match(listPageSource, /<PackageTemplateForm apiBaseUrl="\/api" \/>/);
    assert.match(detailPageSource, /title=\{template\.name\}/);
    assert.match(detailPageSource, /Linked itinerary structure/);
    assert.match(detailPageSource, /<PackageTemplateComponentForm/);
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
    assert.match(prismaSchemaSource, /model PackageTemplateComponent \{/);
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
    assert.match(displaySource, /groupPackageComponentsByDay/);
    assert.match(detailPageSource, /groupedDays\.map/);
    assert.match(detailPageSource, /Day \{day\.dayNumber\}/);
  });
});
