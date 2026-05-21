import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const apiMainPath = resolve(process.cwd(), 'dist/src/main.js');
const vehicleRatesServicePath = resolve(process.cwd(), 'dist/src/vehicle-rates/vehicle-rates.service.js');
const staleTopLevelServicePath = resolve(process.cwd(), 'dist/vehicle-rates/vehicle-rates.service.js');

if (!existsSync(apiMainPath)) {
  console.error(`Expected API build output was not found: ${apiMainPath}`);
  console.error('Run `npm --workspace @dmc/api run build` before starting production.');
  process.exit(1);
}

if (!existsSync(vehicleRatesServicePath)) {
  console.error(`Expected runtime vehicle rates service build output was not found: ${vehicleRatesServicePath}`);
  process.exit(1);
}

if (existsSync(staleTopLevelServicePath)) {
  console.error(`Stale top-level API build tree detected: ${staleTopLevelServicePath}`);
  console.error('Clean dist before building so production cannot load stale compiled artifacts.');
  process.exit(1);
}

const vehicleRatesService = readFileSync(vehicleRatesServicePath, 'utf8');
if (!vehicleRatesService.includes('buildCanonicalTransferTariffRouteCode')) {
  console.error(`Runtime vehicle rates service is missing buildCanonicalTransferTariffRouteCode: ${vehicleRatesServicePath}`);
  process.exit(1);
}

if (vehicleRatesService.includes('buildTariffMatrixRouteCode')) {
  console.error(`Runtime vehicle rates service still contains legacy buildTariffMatrixRouteCode: ${vehicleRatesServicePath}`);
  process.exit(1);
}

if (!vehicleRatesService.includes('transferTariffMatrixRouteCodeDiagnostic')) {
  console.error(`Runtime vehicle rates service is missing transfer tariff route-code diagnostics: ${vehicleRatesServicePath}`);
  process.exit(1);
}

console.log(`Verified API build output: ${apiMainPath}`);
