import { BadRequestException, Injectable } from '@nestjs/common';
import { throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  ContractChargeBasisValue,
  ContractSupplementTypeValue,
  CreateContractSupplementDto,
  UpdateContractSupplementDto,
} from './contract-supplements.dto';

type AuditActor = {
  id: string;
  auditLabel: string;
} | null;

type SupplementRecord = {
  id: string;
  hotelContractId: string;
  roomCategoryId: string | null;
  type: ContractSupplementTypeValue;
  chargeBasis: ContractChargeBasisValue;
  amount: number;
  currency: string;
  isMandatory: boolean;
  isActive: boolean;
  notes: string | null;
  roomCategory?: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

const SUPPLEMENT_TYPES: ContractSupplementTypeValue[] = [
  'EXTRA_BREAKFAST',
  'EXTRA_LUNCH',
  'EXTRA_DINNER',
  'GALA_DINNER',
  'EXTRA_BED',
];
const CHARGE_BASIS_VALUES: ContractChargeBasisValue[] = ['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT'];

@Injectable()
export class ContractSupplementsService {
  constructor(private readonly prisma: PrismaService) {}

  private get supplementModel() {
    return (this.prisma as any).hotelContractSupplement;
  }

  async findAll(contractId: string) {
    await this.ensureContractExists(contractId);

    return this.supplementModel.findMany({
      where: {
        hotelContractId: contractId,
      },
      include: {
        roomCategory: true,
      },
      orderBy: [{ type: 'asc' }, { roomCategoryId: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(contractId: string, data: CreateContractSupplementDto, actor?: AuditActor) {
    const contract = await this.ensureContractExists(contractId);
    const normalized = await this.normalizePayload(contract.id, contract.hotelId, contract.currency, data);
    await this.assertNoConflictingSupplement(contractId, normalized);
    const requiredActor = this.requireActor(actor);

    return this.prisma.$transaction(async (tx) => {
      const created = await (tx as any).hotelContractSupplement.create({
        data: normalized,
        include: {
          roomCategory: true,
        },
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        supplementId: created.id,
        action: 'contract_supplement_created',
        oldValue: null,
        newValue: this.formatSupplementSummary(created),
        actor: requiredActor,
      });

      return created;
    });
  }

  async update(contractId: string, supplementId: string, data: UpdateContractSupplementDto, actor?: AuditActor) {
    const contract = await this.ensureContractExists(contractId);
    const existing = await this.findSupplement(contractId, supplementId);
    const normalized = await this.normalizePayload(contract.id, contract.hotelId, contract.currency, {
      roomCategoryId: data.roomCategoryId === undefined ? existing.roomCategoryId : data.roomCategoryId,
      type: data.type ?? existing.type,
      chargeBasis: data.chargeBasis ?? existing.chargeBasis,
      amount: data.amount ?? existing.amount,
      currency: data.currency ?? existing.currency,
      isMandatory: data.isMandatory ?? existing.isMandatory,
      isActive: data.isActive ?? existing.isActive,
      notes: data.notes === undefined ? existing.notes : data.notes,
    });
    await this.assertNoConflictingSupplement(contractId, normalized, supplementId);
    const requiredActor = this.requireActor(actor);

    return this.prisma.$transaction(async (tx) => {
      const updated = await (tx as any).hotelContractSupplement.update({
        where: { id: supplementId },
        data: normalized,
        include: {
          roomCategory: true,
        },
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        supplementId,
        action: 'contract_supplement_updated',
        oldValue: this.formatSupplementSummary(existing),
        newValue: this.formatSupplementSummary(updated),
        actor: requiredActor,
      });

      return updated;
    });
  }

  async remove(contractId: string, supplementId: string, actor?: AuditActor) {
    const existing = await this.findSupplement(contractId, supplementId);

    if (existing.isActive) {
      throw new BadRequestException('Deactivate supplement before deleting it');
    }

    const requiredActor = this.requireActor(actor);

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).hotelContractSupplement.delete({
        where: { id: supplementId },
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        supplementId,
        action: 'contract_supplement_deleted',
        oldValue: this.formatSupplementSummary(existing),
        newValue: null,
        actor: requiredActor,
      });
    });

    return { id: supplementId };
  }

  private async findSupplement(contractId: string, supplementId: string): Promise<SupplementRecord> {
    const supplement = await this.supplementModel.findFirst({
      where: {
        id: supplementId,
        hotelContractId: contractId,
      },
      include: {
        roomCategory: true,
      },
    });

    return throwIfNotFound(supplement, 'Contract supplement');
  }

  private async normalizePayload(contractId: string, hotelId: string, contractCurrency: string, data: CreateContractSupplementDto) {
    if (!SUPPLEMENT_TYPES.includes(data.type)) {
      throw new BadRequestException('Invalid supplement type');
    }

    if (!CHARGE_BASIS_VALUES.includes(data.chargeBasis)) {
      throw new BadRequestException('Invalid charge basis');
    }

    if (!Number.isFinite(data.amount)) {
      throw new BadRequestException('Supplement amount must be a finite number');
    }

    if (data.amount < 0) {
      throw new BadRequestException('Supplement amount cannot be negative');
    }

    const currency = data.currency?.trim().toUpperCase();

    if (!currency) {
      throw new BadRequestException('currency is required');
    }

    if (currency !== contractCurrency) {
      throw new BadRequestException('Supplement currency must match the hotel contract currency');
    }

    this.assertChargeBasisAllowed(data.type, data.chargeBasis);

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
      type: data.type,
      chargeBasis: data.chargeBasis,
      amount: data.amount,
      currency,
      isMandatory: data.isMandatory ?? false,
      isActive: data.isActive ?? true,
      notes: data.notes?.trim() || null,
    };
  }

  private async assertNoConflictingSupplement(
    contractId: string,
    data: {
      roomCategoryId: string | null;
      type: ContractSupplementTypeValue;
      isMandatory: boolean;
      isActive: boolean;
    },
    ignoreSupplementId?: string,
  ) {
    const existingSupplements: SupplementRecord[] = await this.supplementModel.findMany({
      where: {
        hotelContractId: contractId,
        type: data.type,
        OR: data.roomCategoryId
          ? [{ roomCategoryId: data.roomCategoryId }, { roomCategoryId: null }]
          : [{ roomCategoryId: null }, { roomCategoryId: { not: null } }],
        ...(ignoreSupplementId ? { id: { not: ignoreSupplementId } } : {}),
      },
    });

    const conflictingSupplement = existingSupplements.find((supplement) => supplement.isActive && data.isActive);

    if (conflictingSupplement) {
      throw new BadRequestException('Supplement conflicts with an existing active supplement for this contract scope');
    }

    if (data.isMandatory) {
      const conflictingMandatorySupplement = existingSupplements.find(
        (supplement) => supplement.isActive && supplement.isMandatory,
      );

      if (conflictingMandatorySupplement) {
        throw new BadRequestException('An active mandatory supplement of this type already exists for this contract scope');
      }
    }
  }

  private async ensureContractExists(contractId: string) {
    const contract = await this.prisma.hotelContract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        hotelId: true,
        currency: true,
      },
    });

    return throwIfNotFound(contract, 'Hotel contract');
  }

  private requireActor(actor?: AuditActor) {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated actor is required for audited writes');
    }

    return actor;
  }

  private assertChargeBasisAllowed(type: ContractSupplementTypeValue, chargeBasis: ContractChargeBasisValue) {
    if (type === 'EXTRA_BED' && !['PER_ROOM', 'PER_NIGHT', 'PER_STAY'].includes(chargeBasis)) {
      throw new BadRequestException('EXTRA_BED allows only PER_ROOM, PER_NIGHT, or PER_STAY charge basis');
    }

    if (
      ['EXTRA_BREAKFAST', 'EXTRA_LUNCH', 'EXTRA_DINNER', 'GALA_DINNER'].includes(type) &&
      !['PER_PERSON', 'PER_ROOM'].includes(chargeBasis)
    ) {
      throw new BadRequestException(`${type} allows only PER_PERSON or PER_ROOM charge basis`);
    }
  }

  private formatSupplementSummary(
    supplement: {
      type: ContractSupplementTypeValue;
      amount: number;
      currency: string;
      chargeBasis: ContractChargeBasisValue;
      isMandatory?: boolean;
      isActive?: boolean;
      roomCategory?: { name: string; code: string | null } | null;
    } | null,
  ) {
    if (!supplement) {
      return null;
    }

    const roomCategoryLabel = supplement.roomCategory
      ? supplement.roomCategory.code
        ? `${supplement.roomCategory.name} (${supplement.roomCategory.code})`
        : supplement.roomCategory.name
      : 'All room categories';

    return `${roomCategoryLabel} | ${supplement.type} | ${supplement.amount.toFixed(2)} ${supplement.currency} | ${supplement.chargeBasis} | ${supplement.isMandatory ? 'Mandatory' : 'Optional'} | ${supplement.isActive === false ? 'Inactive' : 'Active'}`;
  }

  private async writeAuditLog(
    prismaClient: PrismaService | any,
    data: {
      hotelContractId: string;
      supplementId?: string | null;
      action: string;
      oldValue: string | null;
      newValue: string | null;
      actor: NonNullable<AuditActor>;
    },
  ) {
    await prismaClient.hotelContractSupplementAuditLog.create({
      data: {
        hotelContractId: data.hotelContractId,
        supplementId: data.supplementId ?? null,
        action: data.action,
        oldValue: data.oldValue,
        newValue: data.newValue,
        actorUserId: data.actor.id,
        actor: data.actor.auditLabel || null,
      },
    });
  }
}
