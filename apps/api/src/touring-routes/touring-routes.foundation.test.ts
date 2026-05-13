import test = require('node:test');
import assert = require('node:assert/strict');
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schemaSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
const controllerSource = readFileSync(join(__dirname, 'touring-routes.controller.ts'), 'utf8');
const serviceSource = readFileSync(join(__dirname, 'touring-routes.service.ts'), 'utf8');

test('touring route foundation defines separate inventory, stops, pricing, and transport classification', () => {
  assert.match(schemaSource, /model TouringRoute\s+\{/);
  assert.match(schemaSource, /model TouringRouteStop\s+\{/);
  assert.match(schemaSource, /model TouringRoutePricing\s+\{/);
  assert.match(schemaSource, /TOURING_ROUTE/);
  assert.match(schemaSource, /includedKm\s+Float\?/);
  assert.match(schemaSource, /includedHours\s+Float\?/);
  assert.match(schemaSource, /extraKmRate\s+Float\?/);
  assert.match(schemaSource, /extraHourRate\s+Float\?/);
});

test('touring route API exposes reusable catalog without using transfer routes', () => {
  assert.match(controllerSource, /@Controller\('touring-routes'\)/);
  assert.match(controllerSource, /@Get\(\)/);
  assert.match(controllerSource, /@Post\(\)/);
  assert.match(serviceSource, /touringRoute\.findMany/);
  assert.match(serviceSource, /touringRoute\.create/);
  assert.doesNotMatch(serviceSource, /prisma\.route\.create/);
});
