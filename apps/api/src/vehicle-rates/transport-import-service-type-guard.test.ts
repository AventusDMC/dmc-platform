import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTransportPricingMode } from '../common/transport-pricing-mode-normalization';

// NB: use __dirname (CommonJS) rather than import.meta.url — the API's
// production build (tsconfig module: commonjs) compiles this file and
// import.meta is illegal there, which breaks `nest build` / the Railway deploy.
const serviceSource = readFileSync(join(__dirname, 'vehicle-rates.service.ts'), 'utf8');

describe('transport import service-type guard', () => {
  it('normalizes the import aliases that previously created duplicate service types', () => {
    // These are the imported names that spawned duplicate TransportServiceType rows.
    assert.equal(normalizeTransportPricingMode('Full Day'), 'Daily Full Day');
    assert.equal(normalizeTransportPricingMode('Daily FD'), 'Daily Full Day');
    assert.equal(normalizeTransportPricingMode('Day Tour'), 'Daily Full Day');
    assert.equal(normalizeTransportPricingMode('Transfer'), 'Point-to-Point');
    assert.equal(normalizeTransportPricingMode('Private Transfer'), 'Point-to-Point');
    assert.equal(normalizeTransportPricingMode('Stationary'), 'Stationary / Waiting');
    // A genuinely unknown name must NOT be force-mapped — it falls back to raw create.
    assert.equal(normalizeTransportPricingMode('Border Transfer'), null);
  });

  it('routes the import creator and matcher through the canonical resolver before creating a raw type', () => {
    // The create path must try the canonical service type first.
    assert.match(
      serviceSource,
      /findOrCreateTransportImportServiceType[\s\S]*?resolveCanonicalTransportPricingModeServiceType\(\{ id: '', name: serviceName, code: serviceName \}\)/,
    );
    // The match path is canonical-aware too, so preview agrees with create.
    assert.match(serviceSource, /findTransportImportServiceTypeMatch[\s\S]*?normalizeTransportPricingMode\(serviceName\)/);
  });
});
