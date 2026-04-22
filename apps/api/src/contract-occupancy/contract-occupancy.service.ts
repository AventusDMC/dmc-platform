import { BadRequestException, Injectable } from '@nestjs/common';
import { HotelOccupancyType } from '@prisma/client';
import { throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractOccupancyRuleDto, UpdateContractOccupancyRuleDto } from './contract-occupancy.dto';

type AuditActor = {
  id: string;
  auditLabel: string;
} | null;

type OccupancyRuleRecord = {
  id: string;
  hotelContractId: string;
  roomCategoryId: string | null;
  occupancyType: HotelOccupancyType;
  minAdults: number;
  maxAdults: number;
  maxChildren: number;
  maxOccupants: number;
  isActive: boolean;
  notes: string | null;
  roomCategory?: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

@Injectable()
export class ContractOccupancyService {
  constructor(private readonly prisma: PrismaService) {}

  private get occupancyRuleModel() {
    return (this.prisma as any).hotelContractOccupancyRule;
  }

  private get occupancyAuditModel() {
    return (this.prisma as any).hotelContractOccupancyAuditLog;
  }

  async findAll(contractId: string) {
    await this.ensureContractExists(contractId);

    return this.occupancyRuleModel.findMany({
      where: { hotelContractId: contractId },
      include: {
        roomCategory: true,
      },
      orderBy: [{ roomCategoryId: 'asc' }, { occupancyType: 'asc' }, { minAdults: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(contractId: string, data: CreateContractOccupancyRuleDto, actor?: AuditActor) {
    const contract = await this.ensureContractExists(contractId);
    const normalized = await this.normalizeRuleInput(contract.id, contract.hotelId, data);
    await this.assertNoOverlappingRule(contractId, normalized);
    const requiredActor = this.requireActor(actor);

    const created = await this.prisma.$transaction(async (tx) => {
      const createdRule = await (tx as any).hotelContractOccupancyRule.create({
        data: {
          ...normalized,
        },
        include: {
          roomCategory: true,
        },
      });

      await this.writeAuditLog(
        tx,
        contractId,
        createdRule.id,
        'occupancy_rule_created',
        null,
        this.formatRuleSummary(createdRule),
        requiredActor,
      );

      return createdRule;
    });

    return created;
  }

  async update(contractId: string, ruleId: string, data: UpdateContractOccupancyRuleDto, actor?: AuditActor) {
    const contract = await this.ensureContractExists(contractId);
    const existing = await this.findRule(contractId, ruleId);
    const normalized = await this.normalizeRuleInput(contract.id, contract.hotelId, {
      roomCategoryId: data.roomCategoryId === undefined ? existing.roomCategoryId : data.roomCategoryId,
      occupancyType: data.occupancyType ?? existing.occupancyType,
      minAdults: data.minAdults ?? existing.minAdults,
      maxAdults: data.maxAdults ?? existing.maxAdults,
      maxChildren: data.maxChildren ?? existing.maxChildren,
      maxOccupants: data.maxOccupants ?? existing.maxOccupants,
      isActive: data.isActive ?? existing.isActive,
      notes: data.notes === undefined ? existing.notes : data.notes,
    });
    await this.assertNoOverlappingRule(contractId, normalized, ruleId);
    const requiredActor = this.requireActor(actor);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedRule = await (tx as any).hotelContractOccupancyRule.update({
        where: { id: ruleId },
        data: normalized,
        include: {
          roomCategory: true,
        },
      });

      await this.writeAuditLog(
        tx,
        contractId,
        ruleId,
        'occupancy_rule_updated',
        this.formatRuleSummary(existing),
        this.formatRuleSummary(updatedRule),
        requiredActor,
      );

      return updatedRule;
    });

    return updated;
  }

  async remove(contractId: string, ruleId: string, actor?: AuditActor) {
    const existing = await this.findRule(contractId, ruleId);
    const requiredActor = this.requireActor(actor);

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).hotelContractOccupancyRule.delete({
        where: { id: ruleId },
      });

      await this.writeAuditLog(
        tx,
        contractId,
        ruleId,
        'occupancy_rule_deleted',
        this.formatRuleSummary(existing),
        null,
        requiredActor,
      );
    });

    return { id: ruleId };
  }

  private async findRule(contractId: string, ruleId: string): Promise<OccupancyRuleRecord> {
    const rule = await this.occupancyRuleModel.findFirst({
      where: {
        id: ruleId,
        hotelContractId: contractId,
      },
      include: {
        roomCategory: true,
      },
    });

    return throwIfNotFound(rule, 'Contract occupancy rule');
  }

  private async normalizeRuleInput(contractId: string, hotelId: string, data: CreateContractOccupancyRuleDto) {
    const minAdults = Number(data.minAdults);
    const maxAdults = Number(data.maxAdults);
    const maxChildren = data.maxChildren === undefined ? 0 : Number(data.maxChildren);
    const maxOccupants = Number(data.maxOccupants);

    if (!Object.values(HotelOccupancyType).includes(data.occupancyType)) {
      throw new BadRequestException('Invalid occupancy type');
    }

    if (![minAdults, maxAdults, maxChildren, maxOccupants].every(Number.isInteger)) {
      throw new BadRequestException('Occupancy values must be whole numbers');
    }

    if (minAdults <= 0) {
      throw new BadRequestException('minAdults must be at least 1');
    }

    if (maxAdults < minAdults) {
      throw new BadRequestException('maxAdults cannot be lower than minAdults');
    }

    if (maxOccupants < maxAdults) {
      throw new BadRequestException('maxOccupants cannot be lower than maxAdults');
    }

    if (maxChildren > maxOccupants - minAdults) {
      throw new BadRequestException('maxChildren exceeds the remaining occupancy after adults are allocated');
    }

    const roomCategoryId = data.roomCategoryId?.trim() || null;

    if (roomCategoryId) {
      const roomCategory = await this.prisma.hotelRoomCategory.findFirst({
        where: {
          id: roomCategoryId,
          hotelId,
        },
      });

      if (!roomCategory) {
        throw new BadRequestException('Room category does not belong to this hotel contract');
      }
    }

    return {
      hotelContractId: contractId,
      roomCategoryId,
      occupancyType: data.occupancyType,
      minAdults,
      maxAdults,
      maxChildren,
      maxOccupants,
      isActive: data.isActive ?? true,
      notes: data.notes?.trim() || null,
    };
  }

  private async assertNoOverlappingRule(
    contractId: string,
    data: {
      roomCategoryId: string | null;
      occupancyType: HotelOccupancyType;
      minAdults: number;
      maxAdults: number;
      isActive: boolean;
    },
    ignoreRuleId?: string,
  ) {
    const existingRules: OccupancyRuleRecord[] = await this.occupancyRuleModel.findMany({
      where: {
        hotelContractId: contractId,
        occupancyType: data.occupancyType,
        OR: data.roomCategoryId
          ? [{ roomCategoryId: data.roomCategoryId }, { roomCategoryId: null }]
          : [{ roomCategoryId: null }, { roomCategoryId: { not: null } }],
        ...(ignoreRuleId ? { id: { not: ignoreRuleId } } : {}),
      },
    });

    const overlappingRule = existingRules.find((rule) => {
      if (!rule.isActive || !data.isActive) {
        return false;
      }

      return data.minAdults <= rule.maxAdults && data.maxAdults >= rule.minAdults;
    });

    if (overlappingRule) {
      throw new BadRequestException('Occupancy rule overlaps an existing rule for this room category and occupancy type');
    }
  }

  private async ensureContractExists(contractId: string) {
    const contract = await this.prisma.hotelContract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        hotelId: true,
      },
    });

    return throwIfNotFound(contract, 'Hotel contract');
  }

  private formatRuleSummary(rule: {
    occupancyType: HotelOccupancyType;
    minAdults: number;
    maxAdults: number;
    maxChildren: number;
    maxOccupants: number;
    roomCategory?: { name: string; code: string | null } | null;
    roomCategoryId?: string | null;
    notes?: string | null;
    isActive?: boolean;
  } | null) {
    if (!rule) {
      return null;
    }

    const roomCategoryLabel = rule.roomCategory ? rule.roomCategory.code ? `${rule.roomCategory.name} (${rule.roomCategory.code})` : rule.roomCategory.name : 'All room categories';
    const status = rule.isActive === false ? 'Inactive' : 'Active';

    return `${roomCategoryLabel} | ${rule.occupancyType} | adults ${rule.minAdults}-${rule.maxAdults} | children ${rule.maxChildren} | occupants ${rule.maxOccupants} | ${status}`;
  }

  private requireActor(actor?: AuditActor) {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated actor is required for audited writes');
    }

    return actor;
  }

  private async writeAuditLog(
    prismaClient: PrismaService | any,
    contractId: string,
    occupancyRuleId: string | null,
    action: string,
    oldValue: string | null,
    newValue: string | null,
    actor: NonNullable<AuditActor>,
  ) {
    await prismaClient.hotelContractOccupancyAuditLog.create({
      data: {
        hotelContractId: contractId,
        occupancyRuleId,
        action,
        oldValue,
        newValue,
        actorUserId: actor.id,
        actor: actor.auditLabel || null,
      },
    });
  }
}
