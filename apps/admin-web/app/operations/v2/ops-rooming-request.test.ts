import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  ROOM_OCCUPANCIES,
  buildRoomCreateRequest,
  buildRoomDeleteRequest,
  buildRoomUpdateRequest,
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

// --- V2 rooming proxies: JSON forward (not redirect), whitelist, Classic untouched

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const v2 = (p: string) => path.join(HERE, '../../api/bookings/[id]/v2/rooming', p);
const readV2 = (p: string) => readFileSync(v2(p), 'utf8');
const readClassic = (p: string) => readFileSync(path.join(HERE, '../../api/bookings/[id]/rooming', p), 'utf8');

const createSrc = readV2('route.ts');
const idSrc = readV2('[roomingEntryId]/route.ts');

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

  it('PR-2c-1 adds NO assignment / auto-assign V2 proxies (deferred to PR-2c-2)', () => {
    for (const p of ['auto-assign/route.ts', '[roomingEntryId]/assignments/route.ts']) {
      let exists = true;
      try {
        readFileSync(v2(p), 'utf8');
      } catch {
        exists = false;
      }
      assert.equal(exists, false, `V2 proxy ${p} must not exist in PR-2c-1`);
    }
  });
});

describe('V2 rooming proxies — Classic rooming proxies untouched', () => {
  it('the Classic rooming proxies still use formData + redirect (unmodified)', () => {
    assert.match(readClassic('route.ts'), /formData/);
    assert.match(readClassic('[roomingEntryId]/route.ts'), /formData/);
    assert.match(readClassic('[roomingEntryId]/route.ts'), /NextResponse\.redirect/);
  });
});
