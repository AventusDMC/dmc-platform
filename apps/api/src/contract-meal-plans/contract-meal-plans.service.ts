import { BadRequestException, Injectable } from '@nestjs/common';
import { HotelMealPlan } from '@prisma/client';
import { throwIfNotFound } from '../common/crud.helpers';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateContractMealPlanDto,
  MealPlanCodeValue,
  UpdateContractMealPlanDto,
} from './contract-meal-plans.dto';

type AuditActor = {
  id: string;
  auditLabel: string;
} | null;

type ContractMealPlanRecord = {
  id: string;
  hotelContractId: string;
  code: MealPlanCodeValue;
  isDefault: boolean;
  isActive: boolean;
  notes: string | null;
};

const MEAL_PLAN_CODES: MealPlanCodeValue[] = ['RO', 'BB', 'HB', 'FB', 'AI'];

@Injectable()
export class ContractMealPlansService {
  constructor(private readonly prisma: PrismaService) {}

  private get mealPlanModel() {
    return (this.prisma as any).hotelContractMealPlan;
  }

  async findAll(contractId: string) {
    await this.ensureContractExists(contractId);

    return this.mealPlanModel.findMany({
      where: {
        hotelContractId: contractId,
      },
      orderBy: [{ code: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(contractId: string, data: CreateContractMealPlanDto, actor?: AuditActor) {
    await this.ensureContractExists(contractId);
    const normalized = await this.normalizePayload(contractId, data);
    await this.assertActiveMealPlanInvariant(contractId, normalized);
    const requiredActor = this.requireActor(actor);

    return this.prisma.$transaction(async (tx) => {
      const created = await (tx as any).hotelContractMealPlan.create({
        data: normalized,
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        mealPlanId: created.id,
        action: 'contract_meal_plan_created',
        oldValue: null,
        newValue: this.formatMealPlanSummary(created),
        actor: requiredActor,
      });

      return created;
    });
  }

  async update(contractId: string, mealPlanId: string, data: UpdateContractMealPlanDto, actor?: AuditActor) {
    await this.ensureContractExists(contractId);
    const existing = await this.findMealPlan(contractId, mealPlanId);
    const normalized = await this.normalizePayload(contractId, {
      code: data.code ?? existing.code,
      isDefault: data.isDefault ?? existing.isDefault,
      isActive: data.isActive ?? existing.isActive,
      notes: data.notes === undefined ? existing.notes : data.notes,
    }, mealPlanId);
    this.assertDefaultMealPlanState(existing, normalized);
    await this.assertActiveMealPlanInvariant(contractId, normalized, mealPlanId);
    const requiredActor = this.requireActor(actor);

    return this.prisma.$transaction(async (tx) => {
      const updated = await (tx as any).hotelContractMealPlan.update({
        where: { id: mealPlanId },
        data: normalized,
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        mealPlanId,
        action: 'contract_meal_plan_updated',
        oldValue: this.formatMealPlanSummary(existing),
        newValue: this.formatMealPlanSummary(updated),
        actor: requiredActor,
      });

      return updated;
    });
  }

  async remove(contractId: string, mealPlanId: string, actor?: AuditActor) {
    const existing = await this.findMealPlan(contractId, mealPlanId);
    await this.assertMealPlanNotUsedInRates(contractId, existing.code);
    await this.assertActiveMealPlanInvariant(contractId, { ...existing, isActive: false }, mealPlanId);
    const requiredActor = this.requireActor(actor);

    await this.prisma.$transaction(async (tx) => {
      await (tx as any).hotelContractMealPlan.delete({
        where: { id: mealPlanId },
      });

      await this.writeAuditLog(tx, {
        hotelContractId: contractId,
        mealPlanId,
        action: 'contract_meal_plan_deleted',
        oldValue: this.formatMealPlanSummary(existing),
        newValue: null,
        actor: requiredActor,
      });
    });

    return { id: mealPlanId };
  }

  private async findMealPlan(contractId: string, mealPlanId: string): Promise<ContractMealPlanRecord> {
    const mealPlan = await this.mealPlanModel.findFirst({
      where: {
        id: mealPlanId,
        hotelContractId: contractId,
      },
    });

    return throwIfNotFound(mealPlan, 'Contract meal plan');
  }

  private async normalizePayload(contractId: string, data: CreateContractMealPlanDto, ignoreMealPlanId?: string) {
    if (!MEAL_PLAN_CODES.includes(data.code)) {
      throw new BadRequestException('Invalid meal plan code');
    }

    const duplicate = await this.mealPlanModel.findFirst({
      where: {
        hotelContractId: contractId,
        code: data.code,
        ...(ignoreMealPlanId ? { id: { not: ignoreMealPlanId } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      throw new BadRequestException('Meal plan already exists for this contract');
    }

    if (data.isDefault) {
      if (data.isActive === false) {
        throw new BadRequestException('A default meal plan must always be active');
      }

      const existingDefault = await this.mealPlanModel.findFirst({
        where: {
          hotelContractId: contractId,
          isDefault: true,
          ...(ignoreMealPlanId ? { id: { not: ignoreMealPlanId } } : {}),
        },
        select: {
          id: true,
        },
      });

      if (existingDefault) {
        throw new BadRequestException('Only one default meal plan is allowed per contract');
      }
    }

    return {
      hotelContractId: contractId,
      code: data.code,
      isDefault: data.isDefault ?? false,
      isActive: data.isActive ?? true,
      notes: data.notes?.trim() || null,
    };
  }

  private assertDefaultMealPlanState(
    existing: Pick<ContractMealPlanRecord, 'isDefault'>,
    nextMealPlan: { isDefault: boolean; isActive: boolean },
  ) {
    if (nextMealPlan.isDefault && !nextMealPlan.isActive) {
      throw new BadRequestException('A default meal plan must always be active');
    }

    if (existing.isDefault && !nextMealPlan.isActive) {
      throw new BadRequestException('Default meal plan cannot be deactivated until another active meal plan is set as default');
    }
  }

  private async assertActiveMealPlanInvariant(
    contractId: string,
    nextMealPlan: { isActive: boolean },
    ignoreMealPlanId?: string,
  ) {
    if (nextMealPlan.isActive) {
      return;
    }

    const activeMealPlanCount = await this.mealPlanModel.count({
      where: {
        hotelContractId: contractId,
        isActive: true,
        ...(ignoreMealPlanId ? { id: { not: ignoreMealPlanId } } : {}),
      },
    });

    if (activeMealPlanCount === 0) {
      throw new BadRequestException('At least one active meal plan must exist per contract');
    }
  }

  private async assertMealPlanNotUsedInRates(contractId: string, code: MealPlanCodeValue) {
    const linkedRate = await this.prisma.hotelRate.findFirst({
      where: {
        contractId,
        mealPlan: code as HotelMealPlan,
      },
      select: {
        id: true,
      },
    });

    if (linkedRate) {
      throw new BadRequestException('Cannot delete meal plan because it is used in hotel rates');
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

  private requireActor(actor?: AuditActor) {
    if (!actor?.id) {
      throw new BadRequestException('Authenticated actor is required for audited writes');
    }

    return actor;
  }

  private formatMealPlanSummary(
    mealPlan: { code: MealPlanCodeValue; isDefault?: boolean; isActive?: boolean; notes?: string | null } | null,
  ) {
    if (!mealPlan) {
      return null;
    }

    return `${mealPlan.code} | ${mealPlan.isDefault ? 'Default' : 'Secondary'} | ${mealPlan.isActive === false ? 'Inactive' : 'Active'}`;
  }

  private async writeAuditLog(
    prismaClient: PrismaService | any,
    data: {
      hotelContractId: string;
      mealPlanId?: string | null;
      action: string;
      oldValue: string | null;
      newValue: string | null;
      actor: NonNullable<AuditActor>;
    },
  ) {
    await prismaClient.hotelContractMealPlanAuditLog.create({
      data: {
        hotelContractId: data.hotelContractId,
        mealPlanId: data.mealPlanId ?? null,
        action: data.action,
        oldValue: data.oldValue,
        newValue: data.newValue,
        actorUserId: data.actor.id,
        actor: data.actor.auditLabel || null,
      },
    });
  }
}
