/*
  Warnings:

  - A unique constraint covering the columns `[email,phone_number,application_id]` on the table `enterprise` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "enterprise_email_phone_number_key";

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_email_phone_number_application_id_key" ON "enterprise"("email", "phone_number", "application_id");
