import { BadRequestException, Injectable } from '@nestjs/common';
import { throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChildPolicyChargeBasisValue,
  CreateContractChildPolicyBandDto,
  UpdateContractChildPolicyBandDto,
  UpsertContractChildPolicyDto,
} from './contract-child-policy.dto';

type AuditActor = {
  id: string;
  auditLabel: string;
} | null;

type ChildPolicyRecord = {
  id: string;
  hotelContractId: string;
  infantMaxAge: number;
  childMaxAge: number;
  notes: string | null;
  bands: ChildPolicyBandRecord[];
};

type ChildPolicyBandRecord = {
  id: string;
  childPolicyId: string;
  label: string;
  minAge: number;
  maxAge: number;
  chargeBasis: ChildPolicyChargeBasisValue;
  chargeValue: number | null;
  isActive: boolean;
  notes: string | null;
};

@Injectable()
export class ContractChildPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  private get childPolicyModel() {
    return (this.prisma as any).hotelContractChildPolicy;
  }

  private get childPolicyBandModel() {
    return (this.prisma as any).hotelContractChildPolicyBand;
  }

  private get childPolicyAuditModel() {
    return (this.prisma as any).hotelContractChildPolicyAuditLog;
  }

  async findOne(contractId: string) {
    await this.ensureContractExists(contractId);

    return this.childPolicyModel.findUnique({
      where: {
        hotelContractId: contractId,
      },
      include: {
        bands: {
          orderBy: [{ minAge: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });
  }

  async upsert(contractId: string, data: UpsertContractChildPolicyDto, actor?: AuditActor) {
    await this.ensureContractExists(contractId);
    const normalized = this.normalizePolicyInput(data);
    const existing = await this.findOne(contractId);
    const requiredActor = this.requireActor(actor);

    if (existing?.bands.some((band: ChildPolicyBandRecord) => band.isActive && band.maxAge > normalized.childMaxAge)) {
      throw new BadRequestException('Existing active child policy bands exceed the updated childMaxAge');
    }

    const policy = await this.prisma.$transaction(async (tx) => {
      const nextPolicy = existing
        ? await (tx as any).hotelContractChildPolicy.update({
            where: { id: existing.id },
            data: normalized,
            include: {
              bands: {
                orderBy: [{ minAge: 'asc' }, { createdAt: 'asc' }],
              },
            },
          })
        : await (tx as any).hotelContractChildPolicy.create({
            data: {
              hotelContractId: contractId,
              ...normalized,
            },
            include: {
              bands: {
                orderBy: [{ minAge: 'asc' }, { createdAt: 'asc' }],
              },
            },
          });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        childPolicyId: nextPolicy.id,
        action: existing ? 'child_policy_updated' : 'child_policy_created',
        oldValue: existing ? this.formatPolicySummary(existing) : null,
        newValue: this.formatPolicySummary(nextPolicy),
        actor: requiredActor,
      });

      return nextPolicy;
    });

    return policy;
  }

  async createBand(contractId: string, data: CreateContractChildPolicyBandDto, actor?: AuditActor) {
    const policy = await this.findPolicyOrThrow(contractId);
    const normalized = this.normalizeBandInput(data, policy);
    await this.assertNoOverlappingBand(policy, normalized);
    const requiredActor = this.requireActor(actor);

    const created = await this.prisma.$transaction(async (tx) => {
      const createdBand = await (tx as any).hotelContractChildPolicyBand.create({
        data: {
          childPolicyId: policy.id,
          ...normalized,
        },
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        childPolicyId: policy.id,
        childPolicyBandId: createdBand.id,
        action: 'child_policy_band_created',
        oldValue: null,
        newValue: this.formatBandSummary(createdBand),
        actor: requiredActor,
      });

      return createdBand;
    });

    return created;
  }

  async updateBand(contractId: string, bandId: string, data: UpdateContractChildPolicyBandDto, actor?: AuditActor) {
    const policy = await this.findPolicyOrThrow(contractId);
    const existing = policy.bands.find((band) => band.id === bandId);

    if (!existing) {
      throw new BadRequestException('Contract child policy band not found');
    }

    const normalized = this.normalizeBandInput(
      {
        label: data.label ?? existing.label,
        minAge: data.minAge ?? existing.minAge,
        maxAge: data.maxAge ?? existing.maxAge,
        chargeBasis: data.chargeBasis ?? existing.chargeBasis,
        chargeValue: data.chargeValue === undefined ? existing.chargeValue : data.chargeValue,
        isActive: data.isActive ?? existing.isActive,
        notes: data.notes === undefined ? existing.notes : data.notes,
      },
      policy,
    );
    await this.assertNoOverlappingBand(policy, normalized, bandId);
    const requiredActor = this.requireActor(actor);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedBand = await (tx as any).hotelContractChildPolicyBand.update({
        where: { id: bandId },
        data: normalized,
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        childPolicyId: policy.id,
        childPolicyBandId: bandId,
        action: 'child_policy_band_updated',
        oldValue: this.formatBandSummary(existing),
        newValue: this.formatBandSummary(updatedBand),
        actor: requiredActor,
      });

      return updatedBand;
    });

    return updated;
  }

  async removeBand(contractId: string, bandId: string, actor?: AuditActor) {
    const policy = await this.findPolicyOrThrow(contractId);
    const existing = policy.bands.find((band) => band.id === bandId);

    if (!existing) {
      throw new BadRequestException('Contract child policy band not found');
    }

    const requiredActor = this.requireActor(actor);

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).hotelContractChildPolicyBand.delete({
        where: { id: bandId },
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        childPolicyId: policy.id,
        childPolicyBandId: bandId,
        action: 'child_policy_band_deleted',
        oldValue: this.formatBandSummary(existing),
        newValue: null,
        actor: requiredActor,
      });
    });

    return { id: bandId };
  }

  private normalizePolicyInput(data: UpsertContractChildPolicyDto) {
    const infantMaxAge = Number(data.infantMaxAge);
    const childMaxAge = Number(data.childMaxAge);

    if (![infantMaxAge, childMaxAge].every(Number.isInteger)) {
      throw new BadRequestException('Policy ages must be whole numbers');
    }

    if (infantMaxAge < 0 || childMaxAge < 0) {
      throw new BadRequestException('Policy ages cannot be negative');
    }

    if (childMaxAge <= infantMaxAge) {
      throw new BadRequestException('childMaxAge must be greater than infantMaxAge');
    }

    return {
      infantMaxAge,
      childMaxAge,
      notes: data.notes?.trim() || null,
    };
  }

  private normalizeBandInput(data: CreateContractChildPolicyBandDto, policy: ChildPolicyRecord) {
    const minAge = Number(data.minAge);
    const maxAge = Number(data.maxAge);
    const chargeValue = data.chargeValue == null ? null : Number(data.chargeValue);

    if (!['FREE', 'PERCENT_OF_ADULT', 'FIXED_AMOUNT'].includes(data.chargeBasis)) {
      throw new BadRequestException('Invalid charge basis');
    }

    if (!data.label?.trim()) {
      throw new BadRequestException('Band label is required');
    }

    if (![minAge, maxAge].every(Number.isInteger)) {
      throw new BadRequestException('Band ages must be whole numbers');
    }

    if (minAge < 0 || maxAge < 0) {
      throw new BadRequestException('Band ages cannot be negative');
    }

    if (chargeValue !== null && !Number.isFinite(chargeValue)) {
      throw new BadRequestException('chargeValue must be a finite number');
    }

    if (maxAge < minAge) {
      throw new BadRequestException('maxAge cannot be lower than minAge');
    }

    if (maxAge > policy.childMaxAge) {
      throw new BadRequestException('Band ages must stay within the contract child policy range');
    }

    if (chargeValue !== null && chargeValue < 0) {
      throw new BadRequestException('chargeValue cannot be negative');
    }

    if (data.chargeBasis === 'FREE' && chargeValue !== null && chargeValue !== 0) {
      throw new BadRequestException('FREE charge basis cannot include a non-zero charge value');
    }

    if ((data.chargeBasis === 'FIXED_AMOUNT' || data.chargeBasis === 'PERCENT_OF_ADULT') && chargeValue === null) {
      throw new BadRequestException('chargeValue is required for priced child policy bands');
    }

    return {
      label: data.label.trim(),
      minAge,
      maxAge,
      chargeBasis: data.chargeBasis,
      chargeValue: data.chargeBasis === 'FREE' ? null : chargeValue,
      isActive: data.isActive ?? true,
      notes: data.notes?.trim() || null,
    };
  }

  private async assertNoOverlappingBand(
    policy: ChildPolicyRecord,
    data: { minAge: number; maxAge: number; isActive: boolean },
    ignoreBandId?: string,
  ) {
    const overlappingBand = policy.bands.find((band) => {
      if (ignoreBandId && band.id === ignoreBandId) {
        return false;
      }

      if (!band.isActive || !data.isActive) {
        return false;
      }

      return data.minAge <= band.maxAge && data.maxAge >= band.minAge;
    });

    if (overlappingBand) {
      throw new BadRequestException('Child policy band overlaps an existing active age band');
    }
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

  private async findPolicyOrThrow(contractId: string): Promise<ChildPolicyRecord> {
    const policy = await this.findOne(contractId);
    return throwIfNotFound(policy, 'Contract child policy');
  }

  private formatPolicySummary(policy: { infantMaxAge: number; childMaxAge: number; notes?: string | null } | null) {
    if (!policy) {
      return null;
    }

    return `Infant age 0-${policy.infantMaxAge} | Child age up to ${policy.childMaxAge}`;
  }

  private formatBandSummary(band: {
    label: string;
    minAge: number;
    maxAge: number;
    chargeBasis: ChildPolicyChargeBasisValue;
    chargeValue?: number | null;
    isActive?: boolean;
  } | null) {
    if (!band) {
      return null;
    }

    const chargeValue =
      band.chargeBasis === 'FREE'
        ? 'free'
        : band.chargeBasis === 'FIXED_AMOUNT'
          ? `fixed ${Number(band.chargeValue || 0).toFixed(2)}`
          : `${Number(band.chargeValue || 0).toFixed(2)}% adult`;
    const status = band.isActive === false ? 'Inactive' : 'Active';

    return `${band.label} | age ${band.minAge}-${band.maxAge} | ${chargeValue} | ${status}`;
  }

  private requireActor(actor?: AuditActor) {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated actor is required for audited writes');
    }

    return actor;
  }

  private async writeAuditLog(
    prismaClient: PrismaService | any,
    data: {
      hotelContractId: string;
      childPolicyId?: string | null;
      childPolicyBandId?: string | null;
      action: string;
      oldValue: string | null;
      newValue: string | null;
      actor: NonNullable<AuditActor>;
    },
  ) {
    await prismaClient.hotelContractChildPolicyAuditLog.create({
      data: {
        hotelContractId: data.hotelContractId,
        childPolicyId: data.childPolicyId ?? null,
        childPolicyBandId: data.childPolicyBandId ?? null,
        action: data.action,
        oldValue: data.oldValue,
        newValue: data.newValue,
        actorUserId: data.actor.id,
        actor: data.actor.auditLabel || null,
      },
    });
  }
}
