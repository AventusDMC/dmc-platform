import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNicheTransportService, selectGeneralTransportService } from './transport-service-select';

// Emergency fix — the tailor-made transport service resolver (and Auto Builder)
// must attach a GENERAL transport container, never a niche row like "Petra
// Overnight" (which then surfaced as the item label for transfers).
describe('transport-service-select', () => {
  const services = [
    { id: 'petra-overnight', name: 'Petra Overnight', category: 'Transport' },
    { id: 'border', name: 'Border Transfer', category: 'Transport' },
    { id: 'jptsvc', name: 'Jordan Private Transfer Service', category: 'Transport' },
    { id: 'airport', name: 'Airport Transfer', category: 'Transport' },
  ];

  it('1/2. skips "Petra Overnight" and selects the first general transport service', () => {
    const picked = selectGeneralTransportService(services);
    assert.equal(picked?.id, 'jptsvc');
    assert.notEqual(picked?.name, 'Petra Overnight');
  });

  it('flags niche/add-on transport services, passes general ones', () => {
    for (const name of ['Petra Overnight', 'Stationary / Waiting', 'Extra KM', 'Extra Hour', 'Border Transfer', 'Driver Overnight']) {
      assert.equal(isNicheTransportService({ name }), true, `niche: ${name}`);
    }
    for (const name of ['Airport Transfer', 'Point-to-Point', 'Daily Full Day', 'Half Day', 'Private Transfer', 'Jordan Private Transfer Service']) {
      assert.equal(isNicheTransportService({ name }), false, `general: ${name}`);
    }
  });

  it('falls back to the first match when every service is niche, and handles empty', () => {
    assert.equal(selectGeneralTransportService([{ id: 'a', name: 'Petra Overnight' }])?.id, 'a');
    assert.equal(selectGeneralTransportService([]), null);
  });
});
