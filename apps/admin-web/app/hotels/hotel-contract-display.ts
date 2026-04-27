export type DisplayChildPolicy = {
  policyType?: string | null;
  type?: string | null;
  ageFrom?: number | string | null;
  ageTo?: number | string | null;
  amount?: number | string | null;
  percent?: number | string | null;
  currency?: string | null;
  notes?: string | null;
};

export type DisplayCancellationRule = {
  id?: string | null;
  daysBefore?: number | string | null;
  penaltyPercent?: number | string | null;
  windowFromValue?: number | string | null;
  windowToValue?: number | string | null;
  deadlineUnit?: string | null;
  penaltyType?: string | null;
  penaltyValue?: number | string | null;
  isActive?: boolean | null;
  notes?: string | null;
};

export type DisplayCancellationPolicy = {
  rules?: DisplayCancellationRule[] | null;
} | null | undefined;

export type DisplaySupplement = {
  type?: string | null;
  chargeBasis?: string | null;
  amount?: number | string | null;
  currency?: string | null;
};

export const CHILD_POLICY_TYPES = ['CHILD_FREE', 'CHILD_DISCOUNT', 'CHILD_EXTRA_BED', 'CHILD_EXTRA_MEAL'];

export function toDisplayArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function formatPricingBasis(value: unknown) {
  return String(value || '').trim().toUpperCase() === 'PER_PERSON' ? 'per person/night' : 'per room/night';
}

export function formatDisplayNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Number.isInteger(numeric) ? numeric : Number(numeric.toFixed(2))) : String(value);
}

export function formatPolicyLabel(policy: DisplayChildPolicy) {
  return policy.policyType || policy.type || 'Policy';
}

function formatAgeRange(policy: DisplayChildPolicy) {
  if (policy.ageFrom !== null && policy.ageFrom !== undefined && policy.ageTo !== null && policy.ageTo !== undefined) {
    return `${policy.ageFrom}-${policy.ageTo}`;
  }

  if (policy.ageFrom !== null && policy.ageFrom !== undefined) {
    return `${policy.ageFrom}+`;
  }

  if (policy.ageTo !== null && policy.ageTo !== undefined) {
    return `0-${policy.ageTo}`;
  }

  return '';
}

function formatPolicyValue(policy: DisplayChildPolicy) {
  const amount =
    policy.amount === null || policy.amount === undefined || policy.amount === ''
      ? null
      : `${policy.amount}${policy.currency ? ` ${policy.currency}` : ''}`;
  const percent = policy.percent === null || policy.percent === undefined || policy.percent === '' ? null : `${policy.percent}%`;
  const ageRange =
    policy.ageFrom !== null && policy.ageFrom !== undefined && policy.ageTo !== null && policy.ageTo !== undefined
      ? `Ages ${policy.ageFrom}-${policy.ageTo}`
      : null;

  return [ageRange, percent || amount, policy.notes].filter(Boolean).join(' | ') || 'No details';
}

export function formatChildPolicyValue(policy: DisplayChildPolicy, fallbackCurrency: string) {
  const policyType = String(policy.policyType || policy.type || '').trim().toUpperCase();
  const ageRange = formatAgeRange(policy);
  const amount = formatDisplayNumber(policy.amount);
  const percent = formatDisplayNumber(policy.percent);
  const currency = policy.currency || fallbackCurrency;

  if (policyType === 'CHILD_FREE') {
    return `Children ${ageRange || 'eligible ages'} free`;
  }

  if (policyType === 'CHILD_DISCOUNT') {
    return `Children ${ageRange || 'eligible ages'} pay ${percent !== null ? `${percent}%` : 'discounted rate'}`;
  }

  if (policyType === 'CHILD_EXTRA_BED') {
    return `Child extra bed: ${amount !== null ? `${amount} ${currency}` : percent !== null ? `${percent}%` : policy.notes || 'No details'}`;
  }

  if (policyType === 'CHILD_EXTRA_MEAL') {
    return `Child extra meal: ${amount !== null ? `${amount} ${currency}` : percent !== null ? `${percent}%` : policy.notes || 'No details'}`;
  }

  return formatPolicyValue(policy);
}

export function getChildPolicies(ratePolicies: unknown) {
  return toDisplayArray<DisplayChildPolicy>(ratePolicies).filter((policy) =>
    CHILD_POLICY_TYPES.includes(String(policy.policyType || policy.type || '').trim().toUpperCase()),
  );
}

function formatCancellationPenalty(rule: DisplayCancellationRule) {
  const penaltyType = String(rule.penaltyType || '').trim().toUpperCase();
  const penaltyPercent = rule.penaltyPercent ?? (penaltyType === 'PERCENT' ? rule.penaltyValue : null);

  if (penaltyPercent !== null && penaltyPercent !== undefined) {
    return `${formatDisplayNumber(penaltyPercent) ?? 0}%`;
  }

  if (penaltyType === 'FULL_STAY') {
    return '100%';
  }

  return rule.penaltyValue === null || rule.penaltyValue === undefined
    ? 'No penalty'
    : `${formatDisplayNumber(rule.penaltyValue)} ${penaltyType.toLowerCase()}`;
}

export function formatCancellationRule(rule: DisplayCancellationRule) {
  const deadlineUnit = String(rule.deadlineUnit || 'DAYS').trim().toUpperCase();
  const daysBefore = rule.daysBefore ?? (deadlineUnit === 'DAYS' ? rule.windowFromValue : null);
  const deadline =
    daysBefore !== null && daysBefore !== undefined
      ? `${daysBefore} days before arrival`
      : `${rule.windowFromValue ?? 0} ${deadlineUnit.toLowerCase()} before arrival`;
  const notes = rule.notes ? ` | ${rule.notes}` : '';

  return `${deadline}: ${formatCancellationPenalty(rule)}${notes}`;
}

export function getCancellationRules(policy: DisplayCancellationPolicy) {
  return toDisplayArray<DisplayCancellationRule>(policy?.rules);
}

export function getCancellationFallback(policy: DisplayCancellationPolicy) {
  return policy ? 'No cancellation rules' : 'No cancellation policy available';
}

function humanizeEnum(value: unknown, fallback: string) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallback;
  }

  return normalized
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatSupplementType(value: unknown) {
  return humanizeEnum(value, 'Supplement');
}

export function formatChargeBasis(value: unknown) {
  const normalized = String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
  if (normalized === 'PER_ROOM') {
    return 'per room';
  }
  if (normalized === 'PER_PERSON') {
    return 'per person';
  }
  if (normalized === 'PER_STAY') {
    return 'one-time';
  }
  if (normalized === 'PER_NIGHT') {
    return 'per night';
  }

  return humanizeEnum(value, 'Charge basis');
}

export function formatSupplementCharge(supplement: DisplaySupplement) {
  const numericAmount = Number(supplement.amount);
  const amountLabel =
    supplement.amount === null || supplement.amount === undefined || supplement.amount === '' || !Number.isFinite(numericAmount)
      ? 'No amount'
      : `${numericAmount.toFixed(2)} ${supplement.currency || 'USD'}`;

  return {
    amountLabel,
    basisLabel: formatChargeBasis(supplement.chargeBasis),
  };
}
