/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `enterprise` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[phone_number]` on the table `enterprise` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[application_id]` on the table `enterprise` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[token,enterprise_id]` on the table `enterprise_token_invite` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[url,enterprise_id]` on the table `enterprise_url` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email,enterprise_id]` on the table `influencer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug,enterprise_id]` on the table `influencer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[personal_url,enterprise_id]` on the table `influencer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email,enterprise_id]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "enterprise_email_phone_number_application_id_key";

-- DropIndex
DROP INDEX "enterprise_token_invite_token_key";

-- DropIndex
DROP INDEX "enterprise_url_url_key";

-- DropIndex
DROP INDEX "influencer_name_email_personal_url_slug_key";

-- DropIndex
DROP INDEX "user_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_email_key" ON "enterprise"("email");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_phone_number_key" ON "enterprise"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_application_id_key" ON "enterprise"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_token_invite_token_enterprise_id_key" ON "enterprise_token_invite"("token", "enterprise_id");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_url_url_enterprise_id_key" ON "enterprise_url"("url", "enterprise_id");

-- CreateIndex
CREATE UNIQUE INDEX "influencer_email_enterprise_id_key" ON "influencer"("email", "enterprise_id");

-- CreateIndex
CREATE UNIQUE INDEX "influencer_slug_enterprise_id_key" ON "influencer"("slug", "enterprise_id");

-- CreateIndex
CREATE UNIQUE INDEX "influencer_personal_url_enterprise_id_key" ON "influencer"("personal_url", "enterprise_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_enterprise_id_key" ON "user"("email", "enterprise_id");
