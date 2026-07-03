import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildActivityVM,
  buildVoucherEmailedSummary,
  changeSummary,
  deriveSeverity,
  humanizeAuditValue,
  isSensitiveValue,
} from './ops-activity-vm';
import {
  EMPTY_ACTIVITY,
  REDACTED_RAW,
  SAMPLE_ACTIVITY,
  SUPPLIER_ASSIGN_ACTIVITY,
  SUPPLIER_ASSIGN_UUID,
} from './ops-activity.fixtures';

describe('ops-activity-vm — mapping', () => {
  const vm = buildActivityVM(SAMPLE_ACTIVITY);
  const byId = Object.fromEntries(vm.items.map((i) => [i.id, i]));

  it('maps actor / action label / entity / timestamp', () => {
    const it0 = byId['a-text'];
    assert.equal(it0.actor, 'ops@dmc');
    assert.equal(it0.action, 'Pickup Time Updated');
    assert.equal(it0.entityLabel, 'Service');
    assert.equal(it0.timestamp, '2026-06-28T11:00:00Z');
    assert.ok(it0.timestampLabel && it0.timestampLabel !== '—');
  });

  it('sorts newest first', () => {
    // newest entry is a-financial-action @ 14:00
    assert.equal(vm.items[0].id, 'a-financial-action');
    const times = vm.items.map((i) => (i.timestamp ? Date.parse(i.timestamp) : 0));
    const sorted = [...times].sort((a, b) => b - a);
    assert.deepEqual(times, sorted);
  });

  it('handles a missing actor safely (→ System)', () => {
    assert.equal(byId['a-reference'].actor, 'System');
  });

  it('renders old → new for safe text values', () => {
    assert.equal(byId['a-text'].changeSummary, '08:00 → 09:00');
    assert.equal(byId['a-status'].changeSummary, 'draft → confirmed');
  });

  it('handles missing old/new values safely', () => {
    assert.equal(byId['a-note'].changeSummary, null);
    assert.equal(byId['a-note'].detail, 'Guest requested early check-in');
  });

  it('redacts financial / sensitive values to "Value updated"', () => {
    assert.equal(byId['a-financial-action'].changeSummary, 'Value updated'); // action has "payment"/"paid"
    assert.equal(byId['a-amount'].changeSummary, 'Value updated'); // decimal amount
    assert.equal(byId['a-json'].changeSummary, 'Value updated'); // JSON blob
    assert.equal(byId['a-reference'].changeSummary, 'Value updated'); // reference / long number
  });

  it('redacts a financial free-text note', () => {
    assert.equal(byId['a-note-financial'].detail, 'Note updated');
  });

  it('derives severity from the action (action-based, not value-based)', () => {
    assert.equal(byId['a-rejected'].severity, 'critical'); // "rejected"
    assert.equal(byId['a-financial-action'].severity, 'success'); // "paid"
    assert.equal(byId['a-status'].severity, 'info'); // "status_updated" has no success/critical keyword
    assert.equal(byId['a-text'].severity, 'info');
  });

  it('NEVER leaks raw financial / JSON / reference values', () => {
    const serialized = JSON.stringify(vm);
    for (const raw of REDACTED_RAW) {
      assert.ok(!serialized.includes(raw), `activity VM leaked redacted value "${raw}"`);
    }
  });
});

describe('ops-activity-vm — unit helpers', () => {
  it('isSensitiveValue flags financial/JSON/long-number/currency', () => {
    assert.equal(isSensitiveValue('1450.00'), true);
    assert.equal(isSensitiveValue('{"a":1}'), true);
    assert.equal(isSensitiveValue('USD 500'), true);
    assert.equal(isSensitiveValue('IBAN JO12'), true);
    assert.equal(isSensitiveValue('AB123456'), true); // long number
    assert.equal(isSensitiveValue('09:00'), false);
    assert.equal(isSensitiveValue('confirmed'), false);
    assert.equal(isSensitiveValue(null), false);
  });

  it('changeSummary set/cleared/none', () => {
    assert.equal(changeSummary('x', null, 'Petra'), 'Set to Petra');
    assert.equal(changeSummary('x', 'Petra', null), 'Cleared (was Petra)');
    assert.equal(changeSummary('x', null, null), null);
  });

  it('deriveSeverity', () => {
    assert.equal(deriveSeverity('booking_cancelled'), 'critical');
    assert.equal(deriveSeverity('guide_assigned'), 'success');
    assert.equal(deriveSeverity('pickup_time_updated'), 'info');
  });
});

describe('ops-activity-vm — UUID sanitization (Activity display)', () => {
  const vm = buildActivityVM(SUPPLIER_ASSIGN_ACTIVITY);
  const byId = Object.fromEntries(vm.items.map((i) => [i.id, i]));

  it('1) named supplier value: keeps the name, strips the UUID', () => {
    const s = byId['sa-named'].changeSummary!;
    assert.equal(s, 'ASSIGNED: Almushtari Logistics Services → UNASSIGNED: unassigned');
    assert.ok(s.includes('Almushtari Logistics Services'), 'name must remain');
    assert.ok(!s.includes(SUPPLIER_ASSIGN_UUID), 'UUID must be gone');
  });

  it('2) bare UUID-only value → "Internal reference updated"', () => {
    assert.equal(byId['sa-bare'].changeSummary, 'Internal reference updated');
  });

  it('3) note containing a UUID: UUID gone, safe text remains', () => {
    assert.equal(byId['sa-note'].detail, 'Assigned via portal request');
    assert.ok(!String(byId['sa-note'].detail).includes(SUPPLIER_ASSIGN_UUID));
  });

  it('4) financial / JSON redaction is unchanged', () => {
    assert.equal(changeSummary('total_sell_updated', '1200.00', '1450.00'), 'Value updated');
    assert.equal(changeSummary('snapshot_updated', null, '{"a":1}'), 'Value updated');
  });

  it('5) safe operational value stays readable', () => {
    assert.equal(changeSummary('supplier_confirmation_updated', 'REQUESTED', 'CONFIRMED'), 'REQUESTED → CONFIRMED');
  });

  it('humanizeAuditValue: strips UUIDs, keeps text, null when only a reference', () => {
    assert.equal(humanizeAuditValue(`Almushtari Logistics Services (${SUPPLIER_ASSIGN_UUID})`), 'Almushtari Logistics Services');
    assert.equal(humanizeAuditValue(SUPPLIER_ASSIGN_UUID), null);
    assert.equal(humanizeAuditValue('REQUESTED'), 'REQUESTED');
    assert.equal(humanizeAuditValue(null), null);
  });

  it('the whole VM never serializes the raw UUID', () => {
    assert.ok(!JSON.stringify(vm).includes(SUPPLIER_ASSIGN_UUID));
  });
});

describe('ops-activity-vm — voucher-send audit display (Phase 2F-B)', () => {
  const note = JSON.stringify({
    supplierName: 'Almushtari Logistics Services',
    recipientDomains: ['@axisdmc.com'],
    recipientCount: 1,
    messageId: '49a3999c-0ce1-4ea6-ab68-afcd095a396b',
    attachedPdf: true,
  });
  const vm = buildActivityVM({
    auditLogs: [
      {
        id: 've-1',
        entityType: 'booking_service',
        entityId: 'svc-1',
        action: 'operational_voucher_emailed',
        oldValue: null,
        newValue: 'a1b2c3d4-0000-4000-8000-000000000000 → 1 recipient(s) [@axisdmc.com]',
        note,
        actor: 'ops@dmc',
        createdAt: '2026-07-03T02:00:00Z',
      },
    ],
  });
  const item = vm.items[0];

  it('maps operational_voucher_emailed to the friendly label', () => {
    assert.equal(item.action, 'Voucher emailed to supplier');
  });

  it('shows a safe recipient summary (count + domain only), no redundant note', () => {
    assert.equal(item.changeSummary, 'Emailed to 1 recipient · @axisdmc.com');
    assert.equal(item.detail, null);
  });

  it('never exposes messageId / full email / PDF / raw JSON note / finance', () => {
    const serialized = JSON.stringify(vm);
    for (const bad of [
      '49a3999c', 'messageId', 'attachedPdf', 'supplierName', 'recipientDomains',
      'ziad@axisdmc.com', '%PDF', 'unitCost', 'totalCost', 'payable', 'margin', 'IBAN',
    ]) {
      assert.ok(!serialized.includes(bad), `voucher-send activity leaked "${bad}"`);
    }
  });

  it('pluralizes and joins multiple recipient domains safely', () => {
    const n = JSON.stringify({ recipientDomains: ['@axisdmc.com', '@ops.example'], recipientCount: 2, messageId: 'x' });
    const v = buildActivityVM({
      auditLogs: [{ id: 've-2', entityType: 'booking_service', action: 'operational_voucher_emailed', note: n, newValue: null }],
    });
    assert.equal(v.items[0].changeSummary, 'Emailed to 2 recipients · @axisdmc.com, @ops.example');
  });

  it('falls back safely (still friendly label) when the note is not the expected JSON', () => {
    const v = buildActivityVM({
      auditLogs: [{ id: 've-3', entityType: 'booking_service', action: 'operational_voucher_emailed', note: 'plain note', newValue: null }],
    });
    assert.equal(v.items[0].action, 'Voucher emailed to supplier');
    assert.equal(v.items[0].detail, 'plain note'); // generic (non-financial) note passes through
  });

  it('buildVoucherEmailedSummary: only @domains + count; null on bad shapes', () => {
    assert.equal(
      buildVoucherEmailedSummary(JSON.stringify({ recipientCount: 1, recipientDomains: ['@x.co'] })),
      'Emailed to 1 recipient · @x.co',
    );
    assert.equal(buildVoucherEmailedSummary(JSON.stringify({ recipientCount: 0, recipientDomains: [] })), null);
    assert.equal(buildVoucherEmailedSummary('not json'), null);
    assert.equal(buildVoucherEmailedSummary(null), null);
    // A full address in recipientDomains (bad shape) is dropped — only @domains kept.
    assert.equal(
      buildVoucherEmailedSummary(JSON.stringify({ recipientCount: 1, recipientDomains: ['ziad@axisdmc.com'] })),
      'Emailed to 1 recipient',
    );
  });
});

describe('ops-activity-vm — empty', () => {
  it('empty auditLogs → empty VM', () => {
    const vm = buildActivityVM(EMPTY_ACTIVITY);
    assert.equal(vm.hasItems, false);
    assert.deepEqual(vm.items, []);
  });
  it('null detail does not throw', () => {
    assert.equal(buildActivityVM(null).hasItems, false);
  });
});
