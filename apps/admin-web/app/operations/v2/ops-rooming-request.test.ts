import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  ROOM_OCCUPANCIES,
  assignmentsPath,
  buildAssignPassengerRequest,
  buildAutoAssignRequest,
  buildRoomCreateRequest,
  buildRoomDeleteRequest,
  buildRoomUpdateRequest,
  buildUnassignPassengerRequest,
  normalizeRoomOccupancy,
  pickAllowedRoomFields,
  resolveRoomingErrorMessage,
  roomingBasePath,
} from './ops-rooming-request';

describe('ops-rooming-request — create / update / delete', () => {
  it('create → POST V2 rooming path with a whitelisted body', () => {
    const req = buildRoomCreateRequest('bk-1', { roomType: 'DBL', occupancy: 'double', notes: 'high floor', sortOrder: 3 });
    assert.equal(req.url, '/api/bookings/bk-1/v2/rooming');
    assert.equal(req.method, 'POST');
    assert.deepEqual(req.body, { roomType: 'DBL', occupancy: 'double', notes: 'high floor', sortOrder: 3 });
  });

  it('update → PATCH V2 rooming id path; invalid occupancy is dropped', () => {
    const req = buildRoomUpdateRequest('bk-1', 'r-2', { occupancy: 'twin', roomType: 'TWN' });
    assert.equal(req.url, '/api/bookings/bk-1/v2/rooming/r-2');
    assert.equal(req.method, 'PATCH');
    assert.deepEqual(req.body, { roomType: 'TWN' }); // 'twin' is not an enum value → dropped
  });

  it('delete → DELETE V2 rooming id path, no body', () => {
    const req = buildRoomDeleteRequest('bk-1', 'r-3');
    assert.equal(req.url, '/api/bookings/bk-1/v2/rooming/r-3');
    assert.equal(req.method, 'DELETE');
    assert.equal(req.body, undefined);
  });
});

describe('ops-rooming-request — whitelist + occupancy enum', () => {
  it('drops any field not in the allowlist (roomType/occupancy/notes/sortOrder)', () => {
    assert.deepEqual(
      pickAllowedRoomFields({ roomType: 'DBL', bookingId: 'x', passengerId: 'y', foo: 1 }),
      { roomType: 'DBL' },
    );
  });

  it('occupancy enum whitelist: valid kept, invalid dropped', () => {
    assert.deepEqual(pickAllowedRoomFields({ occupancy: 'triple' }), { occupancy: 'triple' });
    assert.deepEqual(pickAllowedRoomFields({ occupancy: 'penthouse' }), {});
    assert.equal(normalizeRoomOccupancy('QUAD'), 'quad');
    assert.equal(normalizeRoomOccupancy('nope'), undefined);
    assert.deepEqual([...ROOM_OCCUPANCIES], ['single', 'double', 'triple', 'quad', 'unknown']);
  });

  it('empty / whitespace strings normalize to null', () => {
    assert.deepEqual(pickAllowedRoomFields({ roomType: '', notes: '  ' }), { roomType: null, notes: null });
  });

  it('passes backend error messages through (delete-with-occupants guard)', () => {
    assert.equal(
      resolveRoomingErrorMessage({ message: 'Unassign passengers from the room before deleting the rooming entry.' }),
      'Unassign passengers from the room before deleting the rooming entry.',
    );
    assert.equal(resolveRoomingErrorMessage(null), 'Could not save rooming changes.');
  });

  it('base path targets the V2 namespace (not the Classic proxy)', () => {
    assert.equal(roomingBasePath('bk'), '/api/bookings/bk/v2/rooming');
  });
});

describe('ops-rooming-request — assignments + auto-assign (PR-2c-2)', () => {
  it('assign → POST V2 assignments path; body carries ONLY passengerId', () => {
    const req = buildAssignPassengerRequest('bk-1', 'r-2', 'p-9');
    assert.equal(req.url, '/api/bookings/bk-1/v2/rooming/r-2/assignments');
    assert.equal(req.method, 'POST');
    assert.deepEqual(req.body, { passengerId: 'p-9' });
    assert.deepEqual(Object.keys(req.body ?? {}), ['passengerId']); // nothing else
  });

  it('unassign → DELETE V2 assignments/:passengerId path, no body', () => {
    const req = buildUnassignPassengerRequest('bk-1', 'r-2', 'p-9');
    assert.equal(req.url, '/api/bookings/bk-1/v2/rooming/r-2/assignments/p-9');
    assert.equal(req.method, 'DELETE');
    assert.equal(req.body, undefined);
  });

  it('auto-assign → POST V2 auto-assign path, no body', () => {
    const req = buildAutoAssignRequest('bk-1');
    assert.equal(req.url, '/api/bookings/bk-1/v2/rooming/auto-assign');
    assert.equal(req.method, 'POST');
    assert.equal(req.body, undefined);
  });

  it('assignmentsPath targets the V2 namespace', () => {
    assert.equal(assignmentsPath('bk', 'r'), '/api/bookings/bk/v2/rooming/r/assignments');
  });
});

// --- V2 rooming proxies: JSON forward (not redirect), whitelist, Classic untouched

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const v2 = (p: string) => path.join(HERE, '../../api/bookings/[id]/v2/rooming', p);
const readV2 = (p: string) => readFileSync(v2(p), 'utf8');
const readClassic = (p: string) => readFileSync(path.join(HERE, '../../api/bookings/[id]/rooming', p), 'utf8');

const createSrc = readV2('route.ts');
const idSrc = readV2('[roomingEntryId]/route.ts');
const assignSrc = readV2('[roomingEntryId]/assignments/route.ts');
const unassignSrc = readV2('[roomingEntryId]/assignments/[passengerId]/route.ts');
const autoAssignSrc = readV2('auto-assign/route.ts');

describe('V2 rooming proxies — JSON forward, never redirect (CRUD only)', () => {
  it('create proxy POSTs to backend /rooming, whitelists, returns JSON', () => {
    assert.match(createSrc, /export async function POST/);
    assert.match(createSrc, /\/bookings\/\$\{id\}\/rooming`/);
    assert.match(createSrc, /forwardProxyJsonResponse/);
    assert.match(createSrc, /pickAllowedRoomFields/);
    assert.ok(!/NextResponse\.redirect|status:\s*303|formData/.test(createSrc));
  });

  it('id proxy exposes PATCH + DELETE, JSON forward, whitelist on PATCH', () => {
    assert.match(idSrc, /export async function PATCH/);
    assert.match(idSrc, /export async function DELETE/);
    assert.match(idSrc, /\/rooming\/\$\{roomingEntryId\}`/);
    assert.match(idSrc, /forwardProxyJsonResponse/);
    assert.match(idSrc, /pickAllowedRoomFields/);
    assert.ok(!/NextResponse\.redirect|status:\s*303|formData/.test(idSrc));
  });

  it('assign proxy POSTs passengerId to backend /assignments, returns JSON', () => {
    assert.match(assignSrc, /export async function POST/);
    assert.match(assignSrc, /\/rooming\/\$\{roomingEntryId\}\/assignments`/);
    assert.match(assignSrc, /forwardProxyJsonResponse/);
    assert.match(assignSrc, /passengerId/);
    assert.ok(!/NextResponse\.redirect|status:\s*303|formData/.test(assignSrc));
  });

  it('unassign proxy DELETEs backend /assignments/:passengerId, returns JSON, no body', () => {
    assert.match(unassignSrc, /export async function DELETE/);
    assert.match(unassignSrc, /\/rooming\/\$\{roomingEntryId\}\/assignments\/\$\{passengerId\}`/);
    assert.match(unassignSrc, /forwardProxyJsonResponse/);
    assert.ok(!/NextResponse\.redirect|status:\s*303|formData|JSON\.stringify/.test(unassignSrc));
  });

  it('auto-assign proxy POSTs backend /rooming/auto-assign, returns JSON, no body', () => {
    assert.match(autoAssignSrc, /export async function POST/);
    assert.match(autoAssignSrc, /\/rooming\/auto-assign`/);
    assert.match(autoAssignSrc, /forwardProxyJsonResponse/);
    assert.ok(!/NextResponse\.redirect|status:\s*303|formData|JSON\.stringify/.test(autoAssignSrc));
  });
});

describe('V2 rooming proxies — Classic rooming proxies untouched', () => {
  it('the Classic rooming proxies still use formData + redirect (unmodified)', () => {
    assert.match(readClassic('route.ts'), /formData/);
    assert.match(readClassic('[roomingEntryId]/route.ts'), /formData/);
    assert.match(readClassic('[roomingEntryId]/route.ts'), /NextResponse\.redirect/);
  });

  it('the Classic assignment + auto-assign proxies still use formData/redirect (unmodified)', () => {
    assert.match(readClassic('[roomingEntryId]/assignments/route.ts'), /formData/);
    assert.match(readClassic('[roomingEntryId]/assignments/route.ts'), /NextResponse\.redirect/);
    assert.match(readClassic('auto-assign/route.ts'), /NextResponse\.redirect/);
  });
});
