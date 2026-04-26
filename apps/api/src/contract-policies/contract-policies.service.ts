import { BadRequestException, Injectable } from '@nestjs/common';
import { throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  CancellationDeadlineUnitValue,
  CancellationPenaltyTypeValue,
  CreateContractCancellationRuleDto,
  UpdateContractCancellationRuleDto,
  UpsertContractCancellationPolicyDto,
} from './contract-policies.dto';

type AuditActor = {
  id: string;
  auditLabel: string;
} | null;

type CancellationRuleRecord = {
  id: string;
  cancellationPolicyId: string;
  windowFromValue: number;
  windowToValue: number;
  deadlineUnit: CancellationDeadlineUnitValue;
  penaltyType: CancellationPenaltyTypeValue;
  penaltyValue: number | null;
  isActive: boolean;
  notes: string | null;
};

type CancellationPolicyRecord = {
  id: string;
  hotelContractId: string;
  summary: string | null;
  notes: string | null;
  noShowPenaltyType: CancellationPenaltyTypeValue | null;
  noShowPenaltyValue: number | null;
  rules: CancellationRuleRecord[];
};

type CancellationPenaltyRuleInput = {
  windowFromValue: number;
  windowToValue: number;
  deadlineUnit: CancellationDeadlineUnitValue;
  penaltyType: CancellationPenaltyTypeValue;
  penaltyValue: number | null;
  isActive?: boolean;
};

const PENALTY_TYPES: CancellationPenaltyTypeValue[] = ['PERCENT', 'NIGHTS', 'FULL_STAY', 'FIXED'];
const DEADLINE_UNITS: CancellationDeadlineUnitValue[] = ['DAYS', 'HOURS'];

export function calculateCancellationPenalty(
  arrivalDate: Date | string,
  cancelDate: Date | string,
  rules: CancellationPenaltyRuleInput[] = [],
) {
  const arrival = normalizePenaltyDate(arrivalDate);
  const cancelledAt = normalizePenaltyDate(cancelDate);
  const hoursBeforeArrival = Math.max(0, Math.floor((arrival.getTime() - cancelledAt.getTime()) / 36e5));
  const daysBefore = Math.floor(hoursBeforeArrival / 24);
  const matchedRule = rules
    .filter((rule) => rule.isActive !== false)
    .find((rule) => {
      const factor = rule.deadlineUnit === 'DAYS' ? 24 : 1;
      const from = rule.windowFromValue * factor;
      const to = rule.windowToValue * factor;
      return hoursBeforeArrival <= from && hoursBeforeArrival >= to;
    });

  return {
    daysBefore,
    hoursBeforeArrival,
    applies: Boolean(matchedRule),
    penaltyType: matchedRule?.penaltyType ?? null,
    penaltyValue: matchedRule?.penaltyValue ?? null,
    penaltyPercent: matchedRule?.penaltyType === 'PERCENT' ? matchedRule.penaltyValue ?? 0 : null,
  };
}

function normalizePenaltyDate(value: Date | string) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid cancellation penalty date');
  }
  return date;
}

@Injectable()
export class ContractPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  private get cancellationPolicyModel() {
    return (this.prisma as any).hotelContractCancellationPolicy;
  }

  private get cancellationRuleModel() {
    return (this.prisma as any).hotelContractCancellationRule;
  }

  async findOne(contractId: string) {
    await this.ensureContractExists(contractId);

    return this.cancellationPolicyModel.findUnique({
      where: {
        hotelContractId: contractId,
      },
      include: {
        rules: {
          orderBy: [{ deadlineUnit: 'asc' }, { windowFromValue: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async upsert(contractId: string, data: UpsertContractCancellationPolicyDto, actor?: AuditActor) {
    await this.ensureContractExists(contractId);
    const normalized = this.normalizePolicyInput(data);
    const existing = await this.findOne(contractId);
    const requiredActor = this.requireActor(actor);

    return this.prisma.$transaction(async (tx) => {
      const nextPolicy = existing
        ? await (tx as any).hotelContractCancellationPolicy.update({
            where: { id: existing.id },
            data: normalized,
            include: {
              rules: {
                orderBy: [{ deadlineUnit: 'asc' }, { windowFromValue: 'asc' }, { createdAt: 'asc' }],
              },
            },
          })
        : await (tx as any).hotelContractCancellationPolicy.create({
            data: {
              hotelContractId: contractId,
              ...normalized,
            },
            include: {
              rules: {
                orderBy: [{ deadlineUnit: 'asc' }, { windowFromValue: 'asc' }, { createdAt: 'asc' }],
              },
            },
          });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        cancellationPolicyId: nextPolicy.id,
        action: existing ? 'cancellation_policy_updated' : 'cancellation_policy_created',
        oldValue: existing ? this.formatPolicySummary(existing) : null,
        newValue: this.formatPolicySummary(nextPolicy),
        actor: requiredActor,
      });

      return nextPolicy;
    });
  }

  async createRule(contractId: string, data: CreateContractCancellationRuleDto, actor?: AuditActor) {
    const policy = await this.findPolicyOrThrow(contractId);
    const normalized = this.normalizeRuleInput(data);
    await this.assertNoOverlappingRule(policy, normalized);
    const requiredActor = this.requireActor(actor);

    return this.prisma.$transaction(async (tx) => {
      const created = await (tx as any).hotelContractCancellationRule.create({
        data: {
          cancellationPolicyId: policy.id,
          ...normalized,
        },
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        cancellationPolicyId: policy.id,
        cancellationRuleId: created.id,
        action: 'cancellation_rule_created',
        oldValue: null,
        newValue: this.formatRuleSummary(created),
        actor: requiredActor,
      });

      return created;
    });
  }

  async updateRule(contractId: string, ruleId: string, data: UpdateContractCancellationRuleDto, actor?: AuditActor) {
    const policy = await this.findPolicyOrThrow(contractId);
    const existing = policy.rules.find((rule) => rule.id === ruleId);

    if (!existing) {
      throw new BadRequestException('Contract cancellation rule not found');
    }

    const normalized = this.normalizeRuleInput({
      windowFromValue: data.windowFromValue ?? existing.windowFromValue,
      windowToValue: data.windowToValue ?? existing.windowToValue,
      deadlineUnit: data.deadlineUnit ?? existing.deadlineUnit,
      penaltyType: data.penaltyType ?? existing.penaltyType,
      penaltyValue: data.penaltyValue === undefined ? existing.penaltyValue : data.penaltyValue,
      isActive: data.isActive ?? existing.isActive,
      notes: data.notes === undefined ? existing.notes : data.notes,
    });
    await this.assertNoOverlappingRule(policy, normalized, ruleId);
    const requiredActor = this.requireActor(actor);

    return this.prisma.$transaction(async (tx) => {
      const updated = await (tx as any).hotelContractCancellationRule.update({
        where: { id: ruleId },
        data: normalized,
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        cancellationPolicyId: policy.id,
        cancellationRuleId: ruleId,
        action: 'cancellation_rule_updated',
        oldValue: this.formatRuleSummary(existing),
        newValue: this.formatRuleSummary(updated),
        actor: requiredActor,
      });

      return updated;
    });
  }

  async removeRule(contractId: string, ruleId: string, actor?: AuditActor) {
    const policy = await this.findPolicyOrThrow(contractId);
    const existing = policy.rules.find((rule) => rule.id === ruleId);

    if (!existing) {
      throw new BadRequestException('Contract cancellation rule not found');
    }

    const requiredActor = this.requireActor(actor);

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).hotelContractCancellationRule.delete({
        where: { id: ruleId },
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        cancellationPolicyId: policy.id,
        cancellationRuleId: ruleId,
        action: 'cancellation_rule_deleted',
        oldValue: this.formatRuleSummary(existing),
        newValue: null,
        actor: requiredActor,
      });
    });

    return { id: ruleId };
  }

  private normalizePolicyInput(data: UpsertContractCancellationPolicyDto) {
    const noShowPenaltyType = data.noShowPenaltyType ?? null;
    const noShowPenaltyValue = data.noShowPenaltyValue === undefined ? undefined : data.noShowPenaltyValue;

    return {
      summary: data.summary?.trim() || null,
      notes: data.notes?.trim() || null,
      noShowPenaltyType,
      noShowPenaltyValue: this.normalizePenaltyValue(noShowPenaltyType, noShowPenaltyValue, 'No-show'),
    };
  }

  private normalizeRuleInput(data: CreateContractCancellationRuleDto) {
    const windowFromValue = Number(data.windowFromValue);
    const windowToValue = Number(data.windowToValue);

    if (![windowFromValue, windowToValue].every(Number.isInteger)) {
      throw new BadRequestException('Cancellation window values must be whole numbers');
    }

    if (windowFromValue < 0 || windowToValue < 0) {
      throw new BadRequestException('Cancellation window values cannot be negative');
    }

    if (windowToValue < windowFromValue) {
      throw new BadRequestException('windowToValue cannot be lower than windowFromValue');
    }

    if (!DEADLINE_UNITS.includes(data.deadlineUnit)) {
      throw new BadRequestException('Invalid deadline unit');
    }

    return {
      windowFromValue,
      windowToValue,
      deadlineUnit: data.deadlineUnit,
      penaltyType: this.normalizePenaltyType(data.penaltyType),
      penaltyValue: this.normalizePenaltyValue(data.penaltyType, data.penaltyValue, 'Cancellation rule'),
      isActive: data.isActive ?? true,
      notes: data.notes?.trim() || null,
    };
  }

  private normalizePenaltyType(value: CancellationPenaltyTypeValue | null | undefined) {
    if (!value || !PENALTY_TYPES.includes(value)) {
      throw new BadRequestException('Invalid penalty type');
    }

    return value;
  }

  private normalizePenaltyValue(
    penaltyType: CancellationPenaltyTypeValue | null,
    penaltyValue: number | null | undefined,
    label: string,
  ) {
    if (!penaltyType) {
      if (penaltyValue !== undefined && penaltyValue !== null) {
        throw new BadRequestException(`${label} penalty value requires a penalty type`);
      }

      return null;
    }

    if (penaltyType === 'FULL_STAY') {
      if (penaltyValue !== undefined && penaltyValue !== null) {
        throw new BadRequestException(`${label} FULL_STAY penalty cannot include a penalty value`);
      }

      return null;
    }

    if (penaltyValue == null || !Number.isFinite(penaltyValue)) {
      throw new BadRequestException(`${label} penalty value must be a finite number`);
    }

    if (penaltyType === 'PERCENT') {
      if (penaltyValue <= 0 || penaltyValue > 100) {
        throw new BadRequestException(`${label} percent penalty must be greater than 0 and at most 100`);
      }

      return penaltyValue;
    }

    if (penaltyType === 'NIGHTS') {
      if (!Number.isInteger(penaltyValue) || penaltyValue <= 0) {
        throw new BadRequestException(`${label} nights penalty must be a whole number greater than 0`);
      }

      return penaltyValue;
    }

    if (penaltyValue <= 0) {
      throw new BadRequestException(`${label} fixed penalty must be greater than 0`);
    }

    return penaltyValue;
  }

  private async assertNoOverlappingRule(
    policy: CancellationPolicyRecord,
    data: {
      windowFromValue: number;
      windowToValue: number;
      deadlineUnit: CancellationDeadlineUnitValue;
      isActive: boolean;
    },
    ignoreRuleId?: string,
  ) {
    const nextWindow = this.toHoursWindow(data.windowFromValue, data.windowToValue, data.deadlineUnit);
    const overlappingRule = policy.rules.find((rule) => {
      if (ignoreRuleId && rule.id === ignoreRuleId) {
        return false;
      }

      if (!rule.isActive || !data.isActive) {
        return false;
      }

      const currentWindow = this.toHoursWindow(rule.windowFromValue, rule.windowToValue, rule.deadlineUnit);
      return nextWindow.from <= currentWindow.to && nextWindow.to >= currentWindow.from;
    });

    if (overlappingRule) {
      throw new BadRequestException('Cancellation rule overlaps an existing active cancellation window');
    }
  }

  private toHoursWindow(fromValue: number, toValue: number, deadlineUnit: CancellationDeadlineUnitValue) {
    const factor = deadlineUnit === 'DAYS' ? 24 : 1;
    return {
      from: fromValue * factor,
      to: toValue * factor,
    };
  }

  private async ensureContractExists(contractId: string) {
    const contract = await this.prisma.hotelContract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
      },
    });

    return throwIfNotFound(contract, 'Hotel contract');
  }

  private async findPolicyOrThrow(contractId: string): Promise<CancellationPolicyRecord> {
    const policy = await this.findOne(contractId);
    return throwIfNotFound(policy, 'Contract cancellation policy');
  }

  private requireActor(actor?: AuditActor) {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated actor is required for audited writes');
    }

    return actor;
  }

  private formatPolicySummary(
    policy: { summary?: string | null; noShowPenaltyType?: CancellationPenaltyTypeValue | null; noShowPenaltyValue?: number | null } | null,
  ) {
    if (!policy) {
      return null;
    }

    const noShow =
      !policy.noShowPenaltyType
        ? 'No-show not configured'
        : policy.noShowPenaltyType === 'FULL_STAY'
          ? 'No-show FULL_STAY'
          : `No-show ${policy.noShowPenaltyType} ${Number(policy.noShowPenaltyValue || 0).toFixed(2)}`;

    return `${policy.summary || 'No summary'} | ${noShow}`;
  }

  private formatRuleSummary(
    rule: {
      windowFromValue: number;
      windowToValue: number;
      deadlineUnit: CancellationDeadlineUnitValue;
      penaltyType: CancellationPenaltyTypeValue;
      penaltyValue?: number | null;
      isActive?: boolean;
    } | null,
  ) {
    if (!rule) {
      return null;
    }

    const penalty =
      rule.penaltyType === 'FULL_STAY'
        ? 'FULL_STAY'
        : `${rule.penaltyType} ${Number(rule.penaltyValue || 0).toFixed(2)}`;
    const status = rule.isActive === false ? 'Inactive' : 'Active';

    return `${rule.windowFromValue}-${rule.windowToValue} ${rule.deadlineUnit} | ${penalty} | ${status}`;
  }

  private async writeAuditLog(
    prismaClient: PrismaService | any,
    data: {
      hotelContractId: string;
      cancellationPolicyId?: string | null;
      cancellationRuleId?: string | null;
      action: string;
      oldValue: string | null;
      newValue: string | null;
      actor: NonNullable<AuditActor>;
    },
  ) {
    await prismaClient.hotelContractCancellationAuditLog.create({
      data: {
        hotelContractId: data.hotelContractId,
        cancellationPolicyId: data.cancellationPolicyId ?? null,
        cancellationRuleId: data.cancellationRuleId ?? null,
        action: data.action,
        oldValue: data.oldValue,
        newValue: data.newValue,
        actorUserId: data.actor.id,
        actor: data.actor.auditLabel || null,
      },
    });
  }
}
