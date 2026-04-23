CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "companyId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "invitedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_token_key" ON "invitations"("token");
CREATE INDEX "invitations_companyId_createdAt_idx" ON "invitations"("companyId", "createdAt");
CREATE INDEX "invitations_companyId_email_idx" ON "invitations"("companyId", "email");
CREATE INDEX "invitations_token_expiresAt_idx" ON "invitations"("token", "expiresAt");

ALTER TABLE "invitations"
ADD CONSTRAINT "invitations_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
