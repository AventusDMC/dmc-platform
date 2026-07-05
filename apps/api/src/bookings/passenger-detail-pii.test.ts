import test = require('node:test');
import assert = require('node:assert/strict');
import {
  REDACTED_PASSENGER_PII_FIELDS,
  mapPassengerForDetail,
  maskPassportNumber,
} from './passenger-detail-pii';

function rawPassenger() {
  return {
    id: 'pax-1',
    bookingId: 'bk-1',
    fullName: 'Lina Haddad',
    firstName: 'Lina',
    lastName: 'Haddad',
    title: 'Ms',
    isLead: true,
    gender: 'F',
    dateOfBirth: '1990-05-01',
    nationality: 'JO',
    passportNumber: 'P1234567',
    passportIssueDate: '2020-01-01',
    passportExpiryDate: '2030-01-01',
    arrivalFlight: 'RJ123',
    departureFlight: 'RJ456',
    entryPoint: 'QAIA',
    visaStatus: 'issued',
    emergencyContactName: 'Sami Haddad',
    emergencyContactPhone: '+962790000000',
    dietaryNotes: 'vegetarian',
    roomingNotes: 'high floor',
    notes: 'medical: none',
  };
}

const FULL_PII_ROLES = ['admin', 'operations', 'super_admin'] as const;
const RESTRICTED_ROLES = ['agent_admin', 'agent', 'viewer', 'finance'] as const;

test('maskPassportNumber keeps last 4 and masks the rest; blank -> null', () => {
  assert.equal(maskPassportNumber('P1234567'), '****4567');
  assert.equal(maskPassportNumber(''), null);
  assert.equal(maskPassportNumber(null), null);
  assert.equal(maskPassportNumber(undefined), null);
});

test('raw passportNumber is never returned for any role', () => {
  for (const role of [...FULL_PII_ROLES, ...RESTRICTED_ROLES, null, undefined] as const) {
    const mapped = mapPassengerForDetail(rawPassenger(), role) as any;
    assert.equal(mapped.passportNumber, undefined, `role=${role}`);
    assert.notEqual(mapped.passportNumberMasked, 'P1234567', `role=${role}`);
  }
});

for (const role of FULL_PII_ROLES) {
  test(`full-PII role (${role}) keeps masked passport + all manifest fields`, () => {
    const mapped = mapPassengerForDetail(rawPassenger(), role) as any;
    assert.equal(mapped.passportNumberMasked, '****4567');
    assert.equal(mapped.dateOfBirth, '1990-05-01');
    assert.equal(mapped.gender, 'F');
    assert.equal(mapped.nationality, 'JO');
    assert.equal(mapped.passportExpiryDate, '2030-01-01');
    assert.equal(mapped.passportIssueDate, '2020-01-01');
    assert.equal(mapped.entryPoint, 'QAIA');
    assert.equal(mapped.visaStatus, 'issued');
    assert.equal(mapped.emergencyContactName, 'Sami Haddad');
    assert.equal(mapped.emergencyContactPhone, '+962790000000');
    assert.equal(mapped.dietaryNotes, 'vegetarian');
    assert.equal(mapped.roomingNotes, 'high floor');
    assert.equal(mapped.arrivalFlight, 'RJ123');
    assert.equal(mapped.departureFlight, 'RJ456');
    // Identity preserved
    assert.equal(mapped.firstName, 'Lina');
    assert.equal(mapped.lastName, 'Haddad');
    assert.equal(mapped.isLead, true);
  });
}

for (const role of RESTRICTED_ROLES) {
  test(`restricted role (${role}) nulls every sensitive manifest field`, () => {
    const mapped = mapPassengerForDetail(rawPassenger(), role) as any;
    for (const field of REDACTED_PASSENGER_PII_FIELDS) {
      assert.equal(mapped[field], null, `${field} should be null for ${role}`);
    }
    // Minimal operational identity is retained
    assert.equal(mapped.id, 'pax-1');
    assert.equal(mapped.firstName, 'Lina');
    assert.equal(mapped.lastName, 'Haddad');
    assert.equal(mapped.title, 'Ms');
    assert.equal(mapped.isLead, true);
    assert.equal(mapped.fullName, 'Lina Haddad');
    // Raw passport still gone
    assert.equal(mapped.passportNumber, undefined);
  });
}

test('missing role (internal / server-side caller) keeps full data', () => {
  const mapped = mapPassengerForDetail(rawPassenger(), undefined) as any;
  assert.equal(mapped.passportNumberMasked, '****4567');
  assert.equal(mapped.dateOfBirth, '1990-05-01');
  assert.equal(mapped.emergencyContactPhone, '+962790000000');
  assert.equal(mapped.nationality, 'JO');
});

test('redaction is non-destructive to the input object', () => {
  const input = rawPassenger();
  mapPassengerForDetail(input, 'agent_admin');
  assert.equal(input.dateOfBirth, '1990-05-01');
  assert.equal(input.passportNumber, 'P1234567');
});
