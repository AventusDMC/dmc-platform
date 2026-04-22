-- CreateEnum
CREATE TYPE "ChildPolicyChargeBasis" AS ENUM ('FREE', 'PERCENT_OF_ADULT', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "hotel_contract_occupancy_rules" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "roomCategoryId" UUID,
    "occupancyType" "HotelOccupancyType" NOT NULL,
    "minAdults" INTEGER NOT NULL,
    "maxAdults" INTEGER NOT NULL,
    "maxChildren" INTEGER NOT NULL DEFAULT 0,
    "maxOccupants" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_contract_occupancy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contract_occupancy_audit_logs" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "occupancyRuleId" UUID,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "actorUserId" UUID NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_contract_occupancy_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contract_child_policies" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "infantMaxAge" INTEGER NOT NULL,
    "childMaxAge" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_contract_child_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contract_child_policy_bands" (
    "id" UUID NOT NULL,
    "childPolicyId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "minAge" INTEGER NOT NULL,
    "maxAge" INTEGER NOT NULL,
    "chargeBasis" "ChildPolicyChargeBasis" NOT NULL,
    "chargeValue" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotel_contract_child_policy_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_contract_child_policy_audit_logs" (
    "id" UUID NOT NULL,
    "hotelContractId" UUID NOT NULL,
    "childPolicyId" UUID,
    "childPolicyBandId" UUID,
    "action" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "note" TEXT,
    "actorUserId" UUID NOT NULL,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_contract_child_policy_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hotel_contract_occupancy_rules_hotelContractId_occupancyTyp_idx" ON "hotel_contract_occupancy_rules"("hotelContractId", "occupancyType", "isActive");

-- CreateIndex
CREATE INDEX "hotel_contract_occupancy_rules_hotelContractId_roomCategory_idx" ON "hotel_contract_occupancy_rules"("hotelContractId", "roomCategoryId", "occupancyType", "isActive");

-- CreateIndex
CREATE INDEX "hotel_contract_occupancy_rules_roomCategoryId_occupancyType_idx" ON "hotel_contract_occupancy_rules"("roomCategoryId", "occupancyType");

-- CreateIndex
CREATE INDEX "hotel_contract_occupancy_audit_logs_hotelContractId_created_idx" ON "hotel_contract_occupancy_audit_logs"("hotelContractId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_occupancy_audit_logs_occupancyRuleId_created_idx" ON "hotel_contract_occupancy_audit_logs"("occupancyRuleId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_occupancy_audit_logs_actorUserId_createdAt_idx" ON "hotel_contract_occupancy_audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "hotel_contract_child_policies_hotelContractId_key" ON "hotel_contract_child_policies"("hotelContractId");

-- CreateIndex
CREATE INDEX "hotel_contract_child_policy_bands_childPolicyId_isActive_mi_idx" ON "hotel_contract_child_policy_bands"("childPolicyId", "isActive", "minAge", "maxAge");

-- CreateIndex
CREATE INDEX "hotel_contract_child_policy_audit_logs_hotelContractId_crea_idx" ON "hotel_contract_child_policy_audit_logs"("hotelContractId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_child_policy_audit_logs_childPolicyId_create_idx" ON "hotel_contract_child_policy_audit_logs"("childPolicyId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_child_policy_audit_logs_childPolicyBandId_cr_idx" ON "hotel_contract_child_policy_audit_logs"("childPolicyBandId", "createdAt");

-- CreateIndex
CREATE INDEX "hotel_contract_child_policy_audit_logs_actorUserId_createdA_idx" ON "hotel_contract_child_policy_audit_logs"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "hotel_contract_occupancy_rules" ADD CONSTRAINT "hotel_contract_occupancy_rules_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_occupancy_rules" ADD CONSTRAINT "hotel_contract_occupancy_rules_roomCategoryId_fkey" FOREIGN KEY ("roomCategoryId") REFERENCES "hotel_room_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_occupancy_audit_logs" ADD CONSTRAINT "hotel_contract_occupancy_audit_logs_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_occupancy_audit_logs" ADD CONSTRAINT "hotel_contract_occupancy_audit_logs_occupancyRuleId_fkey" FOREIGN KEY ("occupancyRuleId") REFERENCES "hotel_contract_occupancy_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_child_policies" ADD CONSTRAINT "hotel_contract_child_policies_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_child_policy_bands" ADD CONSTRAINT "hotel_contract_child_policy_bands_childPolicyId_fkey" FOREIGN KEY ("childPolicyId") REFERENCES "hotel_contract_child_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_child_policy_audit_logs" ADD CONSTRAINT "hotel_contract_child_policy_audit_logs_hotelContractId_fkey" FOREIGN KEY ("hotelContractId") REFERENCES "hotel_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_child_policy_audit_logs" ADD CONSTRAINT "hotel_contract_child_policy_audit_logs_childPolicyId_fkey" FOREIGN KEY ("childPolicyId") REFERENCES "hotel_contract_child_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_contract_child_policy_audit_logs" ADD CONSTRAINT "hotel_contract_child_policy_audit_logs_childPolicyBandId_fkey" FOREIGN KEY ("childPolicyBandId") REFERENCES "hotel_contract_child_policy_bands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
