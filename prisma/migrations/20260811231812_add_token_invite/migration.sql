/*
  Warnings:

  - You are about to drop the column `platform` on the `influencer_platform_url` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `user` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email,phone_number]` on the table `enterprise` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[enterprise_id,reference_date]` on the table `enterprise_count_daily_clicks` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name,email,personal_url]` on the table `influencer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[influencer_id,reference_date]` on the table `influencer_count_daily_clicks` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email]` on the table `user` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `toggle_type` on the `enterprise_toggle_url` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `platform_id` to the `influencer_platform_url` table without a default value. This is not possible if the table is not empty.
  - Added the required column `role_id` to the `user` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ToggleType" AS ENUM ('MANUAL', 'LIMITCLICKS', 'SCHEDULE', 'TIMER');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'OWNER';

-- AlterTable
ALTER TABLE "enterprise_toggle_url" ALTER COLUMN "limit_clicks" DROP NOT NULL,
ALTER COLUMN "timer_in_minutes" DROP NOT NULL,
DROP COLUMN "toggle_type",
ADD COLUMN     "toggle_type" "ToggleType" NOT NULL;

-- AlterTable
ALTER TABLE "influencer" ALTER COLUMN "url_img_profile" DROP NOT NULL,
ALTER COLUMN "img_key" DROP NOT NULL;

-- AlterTable
ALTER TABLE "influencer_platform_url" DROP COLUMN "platform",
ADD COLUMN     "platform_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "user" DROP COLUMN "role",
ADD COLUMN     "role_id" UUID NOT NULL;

-- DropEnum
DROP TYPE "ToogleType";

-- CreateTable
CREATE TABLE "enterprise_token_invite" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "max_uses" INTEGER,
    "created_by_id" UUID NOT NULL,
    "enterprise_id" UUID NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_token_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_token_invite" (
    "id" UUID NOT NULL,
    "used_by" UUID NOT NULL,
    "token_invite" UUID NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_token_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform" (
    "id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_token_invite_token_key" ON "enterprise_token_invite"("token");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_email_phone_number_key" ON "enterprise"("email", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_count_daily_clicks_enterprise_id_reference_date_key" ON "enterprise_count_daily_clicks"("enterprise_id", "reference_date");

-- CreateIndex
CREATE UNIQUE INDEX "influencer_name_email_personal_url_key" ON "influencer"("name", "email", "personal_url");

-- CreateIndex
CREATE UNIQUE INDEX "influencer_count_daily_clicks_influencer_id_reference_date_key" ON "influencer_count_daily_clicks"("influencer_id", "reference_date");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- AddForeignKey
ALTER TABLE "enterprise_token_invite" ADD CONSTRAINT "enterprise_token_invite_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_token_invite" ADD CONSTRAINT "enterprise_token_invite_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_token_invite" ADD CONSTRAINT "user_token_invite_token_invite_fkey" FOREIGN KEY ("token_invite") REFERENCES "enterprise_token_invite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_token_invite" ADD CONSTRAINT "user_token_invite_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_platform_url" ADD CONSTRAINT "influencer_platform_url_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "platform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
