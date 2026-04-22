-- CreateEnum
CREATE TYPE "HotelContractSupplementType" AS ENUM ('EXTRA_BREAKFAST', 'EXTRA_LUNCH', 'EXTRA_DINNER', 'GALA_DINNER', 'EXTRA_BED');

-- CreateEnum
CREATE TYPE "HotelContractChargeBasis" AS ENUM ('PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT');

-- CreateEnum
CREATE TYPE "HotelCancellationPenaltyType" AS ENUM ('PERCENT', 'NIGHTS', 'FULL_STAY', 'FIXED');

-- CreateEnum
CREATE TYPE "HotelCancellationDeadlineUnit" AS ENUM ('DAYS', 'HOURS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "HotelMealPlan" ADD VALUE 'RO';
ALTER TYPE "HotelMealPlan" ADD VALUE 'AI';

-- CreateTable
CREATE TABLE "hotel_contract_cancellation_policies" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "summary" TEXT,
    "notes" TEXT,
    "noShowPenaltyType" "HotelCancellationPenaltyType",
    "noShowPenaltyValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_contract_cancellation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contract_cancellation_rules" (
    "id" UUID NOT NULL,
    "cancellationPolicyId" UUID NOT NULL,
    "windowFromValue" INTEGER NOT NULL,
    "windowToValue" INTEGER NOT NULL,
    "deadlineUnit" "HotelCancellationDeadlineUnit" NOT NULL,
    "penaltyType" "HotelCancellationPenaltyType" NOT NULL,
    "penaltyValue" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_contract_cancellation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contract_cancellation_audit_logs" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "cancellationPolicyId" UUID,
    "cancellationRuleId" UUID,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "actorUserId" UUID NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_contract_cancellation_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contract_meal_plans" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "code" "HotelMealPlan" NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_contract_meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contract_meal_plan_audit_logs" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "mealPlanId" UUID,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "actorUserId" UUID NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_contract_meal_plan_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contract_supplements" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "roomCategoryId" UUID,
    "type" "HotelContractSupplementType" NOT NULL,
    "chargeBasis" "HotelContractChargeBasis" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_contract_supplements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contract_supplement_audit_logs" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "supplementId" UUID,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "actorUserId" UUID NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_contract_supplement_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hotel_contract_cancellation_policies_hotelContractId_key" ON "hotel_contract_cancellation_policies"("hotelContractId");

-- CreateIndex
CREATE INDEX "hotel_contract_cancellation_rules_cancellationPolicyId_isAc_idx" ON "hotel_contract_cancellation_rules"("cancellationPolicyId", "isActive", "deadlineUnit", "windowFromValue", "windowToValue");

-- CreateIndex
CREATE INDEX "hotel_contract_cancellation_audit_logs_hotelContractId_crea_idx" ON "hotel_contract_cancellation_audit_logs"("hotelContractId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_cancellation_audit_logs_cancellationPolicyId_idx" ON "hotel_contract_cancellation_audit_logs"("cancellationPolicyId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_cancellation_audit_logs_cancellationRuleId_c_idx" ON "hotel_contract_cancellation_audit_logs"("cancellationRuleId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_cancellation_audit_logs_actorUserId_createdA_idx" ON "hotel_contract_cancellation_audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_meal_plans_hotelContractId_isDefault_idx" ON "hotel_contract_meal_plans"("hotelContractId", "isDefault");

-- CreateIndex
CREATE INDEX "hotel_contract_meal_plans_hotelContractId_isActive_idx" ON "hotel_contract_meal_plans"("hotelContractId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_contract_meal_plans_hotelContractId_code_key" ON "hotel_contract_meal_plans"("hotelContractId", "code");

-- CreateIndex
CREATE INDEX "hotel_contract_meal_plan_audit_logs_hotelContractId_created_idx" ON "hotel_contract_meal_plan_audit_logs"("hotelContractId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_meal_plan_audit_logs_mealPlanId_createdAt_idx" ON "hotel_contract_meal_plan_audit_logs"("mealPlanId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_meal_plan_audit_logs_actorUserId_createdAt_idx" ON "hotel_contract_meal_plan_audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_supplements_hotelContractId_type_isActive_idx" ON "hotel_contract_supplements"("hotelContractId", "type", "isActive");

-- CreateIndex
CREATE INDEX "hotel_contract_supplements_hotelContractId_roomCategoryId_idx" ON "hotel_contract_supplements"("hotelContractId", "roomCategoryId");

-- CreateIndex
CREATE INDEX "hotel_contract_supplements_hotelContractId_roomCategoryId_t_idx" ON "hotel_contract_supplements"("hotelContractId", "roomCategoryId", "type", "isActive");

-- CreateIndex
CREATE INDEX "hotel_contract_supplements_roomCategoryId_type_idx" ON "hotel_contract_supplements"("roomCategoryId", "type");

-- CreateIndex
CREATE INDEX "hotel_contract_supplement_audit_logs_hotelContractId_create_idx" ON "hotel_contract_supplement_audit_logs"("hotelContractId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_supplement_audit_logs_supplementId_createdAt_idx" ON "hotel_contract_supplement_audit_logs"("supplementId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_supplement_audit_logs_actorUserId_createdAt_idx" ON "hotel_contract_supplement_audit_logs"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "hotel_contract_cancellation_policies" ADD CONSTRAINT "hotel_contract_cancellation_policies_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_cancellation_rules" ADD CONSTRAINT "hotel_contract_cancellation_rules_cancellationPolicyId_fkey" FOREIGN KEY ("cancellationPolicyId") REFERENCES "hotel_contract_cancellation_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_cancellation_audit_logs" ADD CONSTRAINT "hotel_contract_cancellation_audit_logs_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_cancellation_audit_logs" ADD CONSTRAINT "hotel_contract_cancellation_audit_logs_cancellationPolicyI_fkey" FOREIGN KEY ("cancellationPolicyId") REFERENCES "hotel_contract_cancellation_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_cancellation_audit_logs" ADD CONSTRAINT "hotel_contract_cancellation_audit_logs_cancellationRuleId_fkey" FOREIGN KEY ("cancellationRuleId") REFERENCES "hotel_contract_cancellation_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_meal_plans" ADD CONSTRAINT "hotel_contract_meal_plans_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_meal_plan_audit_logs" ADD CONSTRAINT "hotel_contract_meal_plan_audit_logs_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_meal_plan_audit_logs" ADD CONSTRAINT "hotel_contract_meal_plan_audit_logs_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "hotel_contract_meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_supplements" ADD CONSTRAINT "hotel_contract_supplements_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_supplements" ADD CONSTRAINT "hotel_contract_supplements_roomCategoryId_fkey" FOREIGN KEY ("roomCategoryId") REFERENCES "hotel_room_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_supplement_audit_logs" ADD CONSTRAINT "hotel_contract_supplement_audit_logs_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_supplement_audit_logs" ADD CONSTRAINT "hotel_contract_supplement_audit_logs_supplementId_fkey" FOREIGN KEY ("supplementId") REFERENCES "hotel_contract_supplements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
