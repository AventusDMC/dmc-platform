import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildActivityVM,
  changeSummary,
  deriveSeverity,
  isSensitiveValue,
} from './ops-activity-vm';
import { EMPTY_ACTIVITY, REDACTED_RAW, SAMPLE_ACTIVITY } from './ops-activity.fixtures';

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
