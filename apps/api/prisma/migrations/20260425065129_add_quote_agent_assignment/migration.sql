-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "agentId" UUID;

-- AlterTable
ALTER TABLE "service_rates" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "quotes_agentId_idx" ON "quotes"("agentId");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
