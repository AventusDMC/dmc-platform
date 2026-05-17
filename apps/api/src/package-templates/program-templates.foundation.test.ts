import test = require('node:test');
import assert = require('node:assert/strict');
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schemaSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
const packageSource = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
const seedSource = readFileSync(join(__dirname, '..', '..', 'prisma', 'seeds', 'seed-program-templates.ts'), 'utf8');

test('program template phase one reuses PackageTemplate as the multi-day program model', () => {
  assert.match(schemaSource, /model PackageTemplate\s+\{/);
  assert.match(schemaSource, /code\s+String\?\s+@unique/);
  assert.match(schemaSource, /destination\s+String\?/);
  assert.match(schemaSource, /hotelCategoryNotes\s+String\?/);
  assert.match(schemaSource, /guideRules\s+String\?/);
  assert.match(schemaSource, /categoryTags\s+Json\?/);
  assert.match(schemaSource, /model PackageTemplateDay\s+\{/);
  assert.match(schemaSource, /model PackageTemplateComponent\s+\{/);
  assert.match(schemaSource, /EXCURSION_TEMPLATE/);
  assert.match(schemaSource, /TOURING_ROUTE/);
  assert.match(schemaSource, /TRANSPORT/);
  assert.doesNotMatch(schemaSource, /model ProgramTemplate\s+\{/);
});

test('classic Jordan focused seed defines day-by-day package and links existing building blocks', () => {
  assert.match(packageSource, /"seed:program-templates": "ts-node prisma\/seeds\/seed-program-templates\.ts"/);
  assert.match(seedSource, /PROGRAM-CLASSIC-JORDAN-8D7N/);
  assert.match(seedSource, /Classic Jordan 8D7N Program Template/);
  assert.match(seedSource, /durationDays: 8/);
  assert.match(seedSource, /PackageTemplate is used as the Program Template model/);
  assert.match(seedSource, /Petra Full Day/);
  assert.match(seedSource, /Jerash & Ajloun Full Day/);
  assert.match(seedSource, /Madaba, Nebo & Dead Sea/);
  assert.match(seedSource, /Wadi Rum Jeep Experience/);
  assert.match(seedSource, /Dead Sea Relaxation Day/);
  assert.match(seedSource, /PETRA_FULL_DAY/);
  assert.match(seedSource, /JERASH_AJLOUN_FULL_DAY/);
  assert.match(seedSource, /MADABA_NEBO_DEAD_SEA/);
  assert.match(seedSource, /WADI_RUM_JEEP_EXPERIENCE/);
  assert.match(seedSource, /DEAD_SEA_RELAXATION_DAY/);
  assert.match(seedSource, /JOR-TR-SOUTH-KERAK-PETRA-ON/);
  assert.match(seedSource, /JOR-TR-SOUTH-PETRA-WADI-RUM-ON/);
  assert.match(seedSource, /hotelCategoryNotes/);
  assert.match(seedSource, /guideRules/);
  assert.match(seedSource, /packageTemplate\.upsert/);
  assert.match(seedSource, /packageTemplateComponent\.deleteMany/);
  assert.match(seedSource, /packageTemplateComponent\.create/);
  assert.match(seedSource, /validatedComponents/);
  assert.match(seedSource, /unresolvedLinks/);
  assert.doesNotMatch(seedSource, /excursionTemplate\.upsert/);
  assert.doesNotMatch(seedSource, /activity\.upsert/);
  assert.doesNotMatch(seedSource, /touringRoute\.upsert/);
  assert.doesNotMatch(seedSource, /quote\./);
  assert.doesNotMatch(seedSource, /invoice\./);
  assert.doesNotMatch(seedSource, /payment\./);
});
