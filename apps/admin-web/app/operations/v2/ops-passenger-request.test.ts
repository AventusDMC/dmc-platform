import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  ALLOWED_PASSENGER_FIELDS,
  buildPassengerCreateRequest,
  buildPassengerDeleteRequest,
  buildPassengerUpdateRequest,
  buildSetLeadRequest,
  passengersBasePath,
  pickAllowedPassengerFields,
  resolvePassengerErrorMessage,
} from './ops-passenger-request';

const PII_FIELDS = [
  'passportNumber',
  'passportIssueDate',
  'passportExpiryDate',
  'dateOfBirth',
  'gender',
  'entryPoint',
  'visaStatus',
  'emergencyContactName',
  'emergencyContactPhone',
];

describe('ops-passenger-request — create', () => {
  it('POSTs to the V2 passengers path with a whitelisted body', () => {
    const req = buildPassengerCreateRequest('bk-1', { firstName: 'Ana', lastName: 'Lopez', title: 'Ms', nationality: 'ESP' });
    assert.equal(req.url, '/api/bookings/bk-1/v2/passengers');
    assert.equal(req.method, 'POST');
    assert.deepEqual(req.body, { firstName: 'Ana', lastName: 'Lopez', title: 'Ms', nationality: 'ESP' });
  });

  it('excludes passport/DOB/gender/entry/visa/emergency and isLead from the body', () => {
    const req = buildPassengerCreateRequest('bk-1', {
      firstName: 'Ana',
      lastName: 'Lopez',
      isLead: true,
      passportNumber: 'X123',
      passportIssueDate: '2020-01-01',
      passportExpiryDate: '2030-01-01',
      dateOfBirth: '1990-01-01',
      gender: 'F',
      entryPoint: 'QAIA',
      visaStatus: 'ok',
      emergencyContactName: 'Bob',
      emergencyContactPhone: '123',
    });
    const keys = Object.keys(req.body ?? {});
    for (const pii of PII_FIELDS) assert.ok(!keys.includes(pii), `body leaked ${pii}`);
    assert.ok(!keys.includes('isLead'), 'body leaked isLead');
    assert.deepEqual(req.body, { firstName: 'Ana', lastName: 'Lopez' });
  });
});

describe('ops-passenger-request — update', () => {
  it('PATCHes the V2 passenger id path with a whitelisted body (no PII / isLead)', () => {
    const req = buildPassengerUpdateRequest('bk-1', 'p-2', {
      nationality: 'IRL',
      arrivalFlight: 'RJ1',
      isLead: true,
      passportNumber: 'Z',
      dateOfBirth: '1980-01-01',
    });
    assert.equal(req.url, '/api/bookings/bk-1/v2/passengers/p-2');
    assert.equal(req.method, 'PATCH');
    assert.deepEqual(req.body, { nationality: 'IRL', arrivalFlight: 'RJ1' });
  });

  it('normalizes empty / whitespace strings to null', () => {
    const req = buildPassengerUpdateRequest('b', 'p', { title: '', nationality: '  ' });
    assert.deepEqual(req.body, { title: null, nationality: null });
  });
});

describe('ops-passenger-request — delete + set-lead', () => {
  it('DELETEs the V2 passenger id path with no body', () => {
    const req = buildPassengerDeleteRequest('bk-1', 'p-3');
    assert.equal(req.url, '/api/bookings/bk-1/v2/passengers/p-3');
    assert.equal(req.method, 'DELETE');
    assert.equal(req.body, undefined);
  });

  it('POSTs set-lead to the dedicated sub-path with no body', () => {
    const req = buildSetLeadRequest('bk-1', 'p-4');
    assert.equal(req.url, '/api/bookings/bk-1/v2/passengers/p-4/set-lead');
    assert.equal(req.method, 'POST');
    assert.equal(req.body, undefined);
  });
});

describe('ops-passenger-request — whitelist + errors', () => {
  it('ALLOWED_PASSENGER_FIELDS contains no PII field', () => {
    for (const pii of PII_FIELDS) assert.ok(!ALLOWED_PASSENGER_FIELDS.includes(pii as never), `allowlist contains ${pii}`);
    assert.ok(!ALLOWED_PASSENGER_FIELDS.includes('isLead' as never));
  });

  it('pickAllowedPassengerFields drops everything not allowlisted', () => {
    const out = pickAllowedPassengerFields({ firstName: 'A', passportNumber: 'X', isLead: true, foo: 'bar' });
    assert.deepEqual(out, { firstName: 'A' });
  });

  it('passes backend error messages through (delete-lead + rooming guards)', () => {
    assert.equal(
      resolvePassengerErrorMessage({ message: 'Set another passenger as lead before deleting the lead passenger.' }),
      'Set another passenger as lead before deleting the lead passenger.',
    );
    assert.equal(
      resolvePassengerErrorMessage({ message: ['Unassign the passenger from rooming before deleting the passenger record.'] }),
      'Unassign the passenger from rooming before deleting the passenger record.',
    );
    assert.equal(resolvePassengerErrorMessage(null), 'Could not save passenger changes.');
  });

  it('base path targets the V2 namespace (not the Classic proxy)', () => {
    assert.equal(passengersBasePath('bk'), '/api/bookings/bk/v2/passengers');
  });
});

// --- V2 proxy routes: JSON forward (not redirect), whitelist, Classic untouched -

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const v2 = (p: string) => readFileSync(path.join(HERE, '../../api/bookings/[id]/v2/passengers', p), 'utf8');
const classic = (p: string) => readFileSync(path.join(HERE, '../../api/bookings/[id]/passengers', p), 'utf8');

const createSrc = v2('route.ts');
const idSrc = v2('[passengerId]/route.ts');
const setLeadSrc = v2('[passengerId]/set-lead/route.ts');

describe('V2 passenger proxies — JSON forward, never redirect', () => {
  it('create proxy POSTs to backend /passengers, whitelists, returns JSON', () => {
    assert.match(createSrc, /export async function POST/);
    assert.match(createSrc, /\/bookings\/\$\{id\}\/passengers`/);
    assert.match(createSrc, /forwardProxyJsonResponse/);
    assert.match(createSrc, /pickAllowedPassengerFields/);
    assert.ok(!/NextResponse\.redirect|status:\s*303|formData/.test(createSrc), 'create proxy must not redirect or use formData');
  });

  it('id proxy exposes PATCH (update) + DELETE, JSON forward, whitelist on PATCH', () => {
    assert.match(idSrc, /export async function PATCH/);
    assert.match(idSrc, /export async function DELETE/);
    assert.match(idSrc, /\/passengers\/\$\{passengerId\}`/);
    assert.match(idSrc, /forwardProxyJsonResponse/);
    assert.match(idSrc, /pickAllowedPassengerFields/);
    assert.ok(!/NextResponse\.redirect|status:\s*303|formData/.test(idSrc));
  });

  it('set-lead proxy POSTs to backend set-lead, JSON forward, sends no body', () => {
    assert.match(setLeadSrc, /export async function POST/);
    assert.match(setLeadSrc, /\/passengers\/\$\{passengerId\}\/set-lead`/);
    assert.match(setLeadSrc, /forwardProxyJsonResponse/);
    assert.ok(!/pickAllowedPassengerFields|JSON\.stringify/.test(setLeadSrc), 'set-lead sends no body');
  });
});

describe('V2 passenger proxies — Classic proxies untouched', () => {
  it('the Classic passenger proxies still use formData + redirect (unmodified)', () => {
    const classicCreate = classic('route.ts');
    const classicId = classic('[passengerId]/route.ts');
    assert.match(classicCreate, /formData/);
    assert.match(classicId, /formData/);
    assert.match(classicId, /NextResponse\.redirect/);
  });
});
