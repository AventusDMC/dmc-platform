ALTER TABLE "quotes"
ADD COLUMN "inclusionsText" TEXT,
ADD COLUMN "exclusionsText" TEXT,
ADD COLUMN "termsNotesText" TEXT;

CREATE TABLE "support_text_templates" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "templateType" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_text_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "support_text_templates_templateType_title_idx"
ON "support_text_templates"("templateType", "title");
