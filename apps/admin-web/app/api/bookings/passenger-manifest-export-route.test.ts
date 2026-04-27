import test = require('node:test');
import assert = require('node:assert/strict');
import { buildPassengerManifestExportApiUrl } from './passenger-manifest-export-url';

test('passenger manifest proxy forwards to extensionless API export URL', () => {
  assert.equal(
    buildPassengerManifestExportApiUrl('https://api.example.test', 'booking-1'),
    'https://api.example.test/bookings/booking-1/passengers/export',
  );
});
