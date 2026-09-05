import assert = require('node:assert/strict');
import test = require('node:test');
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuotesController } from './quotes.controller';

// CP-N4a — strict read-only Viewer: backend mutation & capability denial.
// Table-driven controller-boundary suite. For every generic internal quote WRITE /
// CAPABILITY / EXPORT / DELETE handler, Viewer (read-only) + agent + agent_admin +
// missing + unknown + future-unlisted roles are rejected with 403 BEFORE any service,
// snapshot, token, PDF, email, booking, invoice or database call. The currently
// authorized roles still reach the service unchanged. Version READS stay open to Viewer
// while version WRITES are denied. Retired raw routes stay 404. Safe reads unchanged.
// Synthetic actors/quotes only — no real data.

const ALL_DENIABLE = ['agent', 'agent_admin', 'some-unknown-future-role', undefined] as const;

function makeActor(role: string | undefined) {
  return (role === undefined ? { id: 'u1', companyId: 'dmc' } : { id: 'u1', companyId: 'dmc', role }) as any;
}

// Benign return usable by any handler (supports the property reads the handlers do).
const BENIGN: any = {
  id: 'x', quoteId: 'q1', versionNumber: 3, label: 'l', createdAt: 'ts', title: 't',
  status: 'READY', ok: true, bookingId: 'b1', publicEnabled: true, publicToken: 'tok',
};

// A response stub for the PDF/export handlers.
const RES: any = { setHeader() {} };

// The controller under test, with a call-counting service + proposal service. Every
// service/proposal method increments `calls.total`; a handler that reaches any of them
// has passed its gate. For denied roles the gate throws first and `calls.total` stays 0.
function createController() {
  const calls = { total: 0 };
  const bump = (v: any = BENIGN) => { calls.total += 1; return v; };
  const quotesService: any = new Proxy(
    {
      // explicit ones whose return shape matters for pdf/proposal paths
      findOne: async () => bump(BENIGN),
      generatePdf: async () => bump(Buffer.from('pdf')),
    },
    {
      get(target, prop: string) {
        if (prop in target) return (target as any)[prop];
        // default: any other service method just counts + returns benign
        return async () => bump(BENIGN);
      },
    },
  );
  const proposalV3Service: any = {
    getProposalPdf: async () => { calls.total += 1; return Buffer.from('pdf'); },
    getProposalHtml: async () => { calls.total += 1; return '<html></html>'; },
  };
  return { controller: new QuotesController(quotesService, proposalV3Service), calls };
}

// ---- Handler invokers grouped by authorization policy ---------------------------

type Invoker = (c: any, actor: any) => Promise<unknown>;

const WRITE_HANDLERS: Record<string, Invoker> = {
  create: (c, a) => c.create({ title: 't' }, {}, a),
  update: (c, a) => c.update('q1', {}, {}, a),
  updateStatus: (c, a) => c.updateStatus('q1', { status: 'SENT' }, {}, a),
  cancelQuote: (c, a) => c.cancelQuote('q1', a),
  reorderItems: (c, a) => c.reorderItems('q1', { day: 1, serviceType: 'HOTEL', orderedItemIds: [] }, a),
  moveItem: (c, a) => c.moveItem('q1', 'i1', { day: 1, serviceType: 'HOTEL' }, a),
  requote: (c, a) => c.requote('q1', a),
  createInvoice: (c, a) => c.createInvoice('q1', a),
  createPricingSlab: (c, a) => c.createPricingSlab('q1', { minPax: 1, maxPax: 2, price: 3 }, {}, a),
  updatePricingSlab: (c, a) => c.updatePricingSlab('q1', 's1', {}, {}, a),
  removePricingSlab: (c, a) => c.removePricingSlab('q1', 's1', {}, a),
  convertToBooking: (c, a) => c.convertToBooking('q1', a),
  createVersion: (c, a) => c.createVersion('q1', { label: 'l' }, {}, a),
  createItem: (c, a) => c.createItem('q1', {}, {}, a),
  applyPackageTemplateAssembly: (c, a) => c.applyPackageTemplateAssembly('q1', 't1', {}, a),
  importProgramTemplate: (c, a) => c.importProgramTemplate('q1', { packageTemplateId: 't1' }, a),
  expandExcursionTemplate: (c, a) => c.expandExcursionTemplate('q1', 't1', {}, a),
  setExcursionPackageRate: (c, a) => c.setExcursionPackageRate('q1', { value: true }, a),
  updateItem: (c, a) => c.updateItem('q1', 'i1', {}, {}, a),
  assignService: (c, a) => c.assignService('q1', 'i1', { serviceId: 's1' }, {}, a),
  removeItem: (c, a) => c.removeItem('q1', 'i1', {}, a),
  detachItemHotelContract: (c, a) => c.detachItemHotelContract('q1', 'i1', a),
  updateItemDisplayText: (c, a) => c.updateItemDisplayText('q1', 'i1', {}, a),
  createOption: (c, a) => c.createOption('q1', {}, {}, a),
  updateOption: (c, a) => c.updateOption('q1', 'o1', {}, {}, a),
  removeOption: (c, a) => c.removeOption('q1', 'o1', undefined, {}, a),
  createHotelOptionAlternative: (c, a) => c.createHotelOptionAlternative('q1', 'o1', {}, a),
  updateHotelOptionAlternative: (c, a) => c.updateHotelOptionAlternative('q1', 'o1', 'h1', {}, a),
  removeHotelOptionAlternative: (c, a) => c.removeHotelOptionAlternative('q1', 'o1', 'h1', a),
  createOptionItem: (c, a) => c.createOptionItem('q1', 'o1', {}, {}, a),
  updateOptionItem: (c, a) => c.updateOptionItem('q1', 'o1', 'i1', {}, {}, a),
  removeOptionItem: (c, a) => c.removeOptionItem('q1', 'o1', 'i1', {}, a),
  generateScenarios: (c, a) => c.generateScenarios('q1', { paxCounts: [] }, {}, a),
  enablePublicLink: (c, a) => c.enablePublicLink('q1', a),
  disablePublicLink: (c, a) => c.disablePublicLink('q1', a),
  regeneratePublicLink: (c, a) => c.regeneratePublicLink('q1', a),
};

const OPERATIONAL_WRITE_HANDLERS: Record<string, Invoker> = {
  createPassenger: (c, a) => c.createPassenger('q1', {}, a),
  updatePassenger: (c, a) => c.updatePassenger('q1', 'p1', {}, a),
  removePassenger: (c, a) => c.removePassenger('q1', 'p1', a),
  createRoomingGroup: (c, a) => c.createRoomingGroup('q1', {}, a),
  updateRoomingGroup: (c, a) => c.updateRoomingGroup('q1', 'r1', {}, a),
  deleteRoomingGroup: (c, a) => c.deleteRoomingGroup('q1', 'r1', a),
  assignPassengerToRoomingGroup: (c, a) => c.assignPassengerToRoomingGroup('q1', 'r1', { quotePassengerId: 'p1' }, a),
  removePassengerFromRoomingGroup: (c, a) => c.removePassengerFromRoomingGroup('q1', 'r1', 'p1', a),
  previewItem: (c, a) => c.previewItem('q1', 'i1', {}, a),
  applyPreviewItem: (c, a) => c.applyPreviewItem('q1', 'i1', {}, a),
  sendProposalEmail: (c, a) => c.sendProposalEmail('q1', {}, a),
};

const EXPORT_HANDLERS: Record<string, Invoker> = {
  downloadPdf: (c, a) => c.downloadPdf('q1', RES, a),
  exportQuotePdf: (c, a) => c.exportQuotePdf('q1', RES, a),
  downloadProposalV2Pdf: (c, a) => c.downloadProposalV2Pdf('q1', RES, a),
  previewProposalV3Html: (c, a) => c.previewProposalV3Html('q1', RES, a),
  downloadProposalV3Pdf: (c, a) => c.downloadProposalV3Pdf('q1', RES, a),
};

const DELETE_HANDLERS: Record<string, Invoker> = {
  remove: (c, a) => c.remove('q1', a),
};

const VERSION_READ_HANDLERS: Record<string, Invoker> = {
  findVersions: (c, a) => c.findVersions('q1', a),
  getVersionReadiness: (c, a) => c.getVersionReadiness('q1', a),
  findVersionSummary: (c, a) => c.findVersionSummary('q1', 'v1', a),
};

// Currently-authorized roles per group (must still reach the service; never widened).
const ALLOW = {
  write: ['admin', 'super_admin', 'finance'],
  operational: ['admin', 'super_admin', 'operations'],
  export: ['admin', 'super_admin', 'finance', 'operations'],
  delete: ['admin', 'super_admin'],
  versionRead: ['admin', 'super_admin', 'finance', 'viewer'],
} as const;

// Roles that MUST be denied per group (includes viewer everywhere a write/capability/
// export/delete is concerned; also the always-denied agent/agent_admin/missing/unknown).
function deniedFor(allowed: readonly string[]): (string | undefined)[] {
  const universe = ['admin', 'super_admin', 'finance', 'operations', 'viewer', ...ALL_DENIABLE];
  return universe.filter((r) => !allowed.includes(r as string));
}

const GROUPS: Array<{ name: string; handlers: Record<string, Invoker>; allowed: readonly string[] }> = [
  { name: 'write', handlers: WRITE_HANDLERS, allowed: ALLOW.write },
  { name: 'operational-write', handlers: OPERATIONAL_WRITE_HANDLERS, allowed: ALLOW.operational },
  { name: 'export', handlers: EXPORT_HANDLERS, allowed: ALLOW.export },
  { name: 'delete', handlers: DELETE_HANDLERS, allowed: ALLOW.delete },
];

// 1 + 2 + 9 + 10. Every write/capability/export/delete handler denies viewer + agent +
// agent_admin + missing + unknown + future BEFORE any service call (direct invocation
// cannot bypass the in-handler gate). Export/PDF handlers reject before generation.
for (const group of GROUPS) {
  for (const [name, invoke] of Object.entries(group.handlers)) {
    for (const role of deniedFor(group.allowed)) {
      test(`${group.name}: "${name}" denies "${role ?? 'missing'}" (403) before any service call`, async () => {
        const { controller, calls } = createController();
        // async wrapper: some handlers are non-async and throw the gate synchronously;
        // wrapping normalizes that to a rejection for assert.rejects.
        await assert.rejects(async () => { await invoke(controller, makeActor(role)); }, ForbiddenException);
        assert.equal(calls.total, 0, `${name}/${role ?? 'missing'} must not reach the service`);
      });
    }
  }
}

// 3 + 4. Each currently-authorized role still reaches the service (no widening: only the
// listed roles are allowed; every other role is covered by the denial tests above).
for (const group of GROUPS) {
  for (const [name, invoke] of Object.entries(group.handlers)) {
    for (const role of group.allowed) {
      test(`${group.name}: "${name}" allows "${role}" (reaches service)`, async () => {
        const { controller, calls } = createController();
        await invoke(controller, makeActor(role));
        assert.ok(calls.total >= 1, `${name}/${role} should reach the service`);
      });
    }
  }
}

// 5. Version READS remain available to viewer; version WRITES deny viewer.
for (const [name, invoke] of Object.entries(VERSION_READ_HANDLERS)) {
  for (const role of ALLOW.versionRead) {
    test(`version-read: "${name}" allows "${role}" (viewer retains read)`, async () => {
      const { controller, calls } = createController();
      await invoke(controller, makeActor(role));
      assert.ok(calls.total >= 1);
    });
  }
  test(`version-read: "${name}" denies agent_admin before service`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(async () => { await invoke(controller, makeActor('agent_admin')); }, ForbiddenException);
    assert.equal(calls.total, 0);
  });
}
for (const name of ['createVersion', 'convertToBooking', 'updateStatus']) {
  test(`version-write: "${name}" denies viewer before service`, async () => {
    const { controller, calls } = createController();
    await assert.rejects(async () => { await WRITE_HANDLERS[name](controller, makeActor('viewer')); }, ForbiddenException);
    assert.equal(calls.total, 0);
  });
}

// 6. Retired raw routes stay 404 (main quote detail + raw version detail).
test('retired: raw GET /quotes/:id returns 404 for every role, no service call', async () => {
  for (const role of ['admin', 'viewer', 'operations', 'finance', 'agent', undefined]) {
    const { controller, calls } = createController();
    await assert.rejects(() => (controller as any).findOne('q1', makeActor(role)), NotFoundException);
    assert.equal(calls.total, 0);
  }
});
test('retired: raw version detail returns 404 for every role, no service call', async () => {
  for (const role of ['admin', 'viewer', 'finance', 'operations', 'agent_admin', undefined]) {
    const { controller, calls } = createController();
    await assert.rejects(() => (controller as any).findVersion('q1', 'v1', makeActor(role)), NotFoundException);
    assert.equal(calls.total, 0);
  }
});

// 7. Safe operational / finance-detail / version-summary reads unchanged.
test('safe reads: operational allows viewer; finance-detail denies viewer', async () => {
  const { controller, calls } = createController();
  await controller.findOneOperational('q1', makeActor('viewer'));
  assert.ok(calls.total >= 1);
  const fresh = createController();
  await assert.rejects(() => fresh.controller.findOneFinanceDetail('q1', makeActor('viewer')), ForbiddenException);
  assert.equal(fresh.calls.total, 0);
});

// 8. Public-link enable/regenerate/disable cannot expose a token/URL to viewer — the
//    handler throws before the service that would mint/return the token runs.
for (const name of ['enablePublicLink', 'regeneratePublicLink', 'disablePublicLink']) {
  test(`public-link: "${name}" denies viewer before any token generation`, async () => {
    const { controller, calls } = createController();
    let returned: any = 'NONE';
    await assert.rejects(async () => { returned = await WRITE_HANDLERS[name](controller, makeActor('viewer')); }, ForbiddenException);
    assert.equal(returned, 'NONE', 'no payload (no token/URL) returned to viewer');
    assert.equal(calls.total, 0, 'token-minting service never reached');
  });
}
