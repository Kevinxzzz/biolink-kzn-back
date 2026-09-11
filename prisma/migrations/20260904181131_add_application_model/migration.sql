-- AlterTable
ALTER TABLE "enterprise" ADD COLUMN     "application_id" UUID;

-- CreateTable
CREATE TABLE "application" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_domain_key" ON "application"("domain");

-- AddForeignKey
ALTER TABLE "enterprise" ADD CONSTRAINT "enterprise_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
