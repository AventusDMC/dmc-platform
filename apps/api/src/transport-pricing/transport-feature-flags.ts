// Transport feature flags (PR5 of the contract-regime refactor). All default OFF.
//
// `transport.packageEligibilityShadow` gates the read-only package-eligibility shadow
// diagnostic endpoint. When OFF (the default), the shadow path does not run at all.

export const PACKAGE_ELIGIBILITY_SHADOW_FLAG = 'transport.packageEligibilityShadow';

function readBooleanEnv(name: string): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

// OFF unless TRANSPORT_PACKAGE_ELIGIBILITY_SHADOW is explicitly truthy.
export function isPackageEligibilityShadowEnabled(): boolean {
  return readBooleanEnv('TRANSPORT_PACKAGE_ELIGIBILITY_SHADOW');
}
