import { BadRequestException, NotFoundException } from '@nestjs/common';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'JOD'] as const;

export function normalizeOptionalString(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  return value?.trim() || null;
}

export function requireTrimmedString(value: string, fieldLabel: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new BadRequestException(`${fieldLabel} is required`);
  }

  return normalized;
}

export function ensureValidNumber(value: number, fieldLabel: string, options?: { min?: number }) {
  if (Number.isNaN(value)) {
    throw new BadRequestException(`${fieldLabel} must be a valid number`);
  }

  if (options?.min !== undefined && value < options.min) {
    throw new BadRequestException(`${fieldLabel} must be at least ${options.min}`);
  }

  return value;
}

export function throwIfNotFound<T>(record: T | null, label: string) {
  if (!record) {
    throw new NotFoundException(`${label} not found`);
  }

  return record;
}

export function blockDelete(resourceLabel: string, linkedLabel: string, count: number) {
  if (count > 0) {
    throw new BadRequestException(
      `Cannot delete ${resourceLabel} because ${count} linked ${linkedLabel} ${count === 1 ? 'exists' : 'exist'}`,
    );
  }
}

export function requireSupportedCurrency(value: string, fieldLabel: string) {
  const trimmed = requireTrimmedString(value, fieldLabel);

  if (trimmed !== trimmed.toUpperCase()) {
    throw new BadRequestException(`${fieldLabel} must be one of USD, EUR, or JOD`);
  }

  const normalized = trimmed.toUpperCase();

  if (!SUPPORTED_CURRENCIES.includes(normalized as (typeof SUPPORTED_CURRENCIES)[number])) {
    throw new BadRequestException(`${fieldLabel} must be one of USD, EUR, or JOD`);
  }

  return normalized;
}

export function normalizeOptionalSupportedCurrency(value: string | null | undefined, fieldLabel: string) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return requireSupportedCurrency(value, fieldLabel);
}
