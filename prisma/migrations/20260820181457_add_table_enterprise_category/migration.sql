/*
  Warnings:

  - You are about to drop the column `token_invite` on the `user_token_invite` table. All the data in the column will be lost.
  - You are about to drop the `enterprise_toggle_url` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `toggle_url_schedule` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[name,email,personal_url,slug]` on the table `influencer` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category_id` to the `enterprise_url` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slug` to the `influencer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `token_invite_id` to the `user_token_invite` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "enterprise_toggle_url" DROP CONSTRAINT "enterprise_toggle_url_enterprise_id_fkey";

-- DropForeignKey
ALTER TABLE "toggle_url_schedule" DROP CONSTRAINT "toggle_url_schedule_enterprise_url_id_fkey";

-- DropForeignKey
ALTER TABLE "user_token_invite" DROP CONSTRAINT "user_token_invite_token_invite_fkey";

-- DropIndex
DROP INDEX "influencer_name_email_personal_url_key";

-- AlterTable
ALTER TABLE "enterprise_url" ADD COLUMN     "category_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "influencer" ADD COLUMN     "slug" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "user_token_invite" DROP COLUMN "token_invite",
ADD COLUMN     "token_invite_id" UUID NOT NULL;

-- DropTable
DROP TABLE "enterprise_toggle_url";

-- DropTable
DROP TABLE "toggle_url_schedule";

-- CreateTable
CREATE TABLE "url_schedule" (
    "id" UUID NOT NULL,
    "enterprise_url_id" UUID NOT NULL,
    "date_time" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "url_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "enterprise_id" UUID NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_rotation" (
    "id" UUID NOT NULL,
    "toggle_type" "ToggleType" NOT NULL,
    "limit_clicks" INTEGER,
    "timer_in_minutes" INTEGER,
    "timer_started_at" TIMESTAMP(3),
    "category_id" UUID NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_rotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_category_name_enterprise_id_key" ON "enterprise_category"("name", "enterprise_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_rotation_category_id_key" ON "category_rotation"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "influencer_name_email_personal_url_slug_key" ON "influencer"("name", "email", "personal_url", "slug");

-- AddForeignKey
ALTER TABLE "user_token_invite" ADD CONSTRAINT "user_token_invite_token_invite_id_fkey" FOREIGN KEY ("token_invite_id") REFERENCES "enterprise_token_invite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_url" ADD CONSTRAINT "enterprise_url_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "enterprise_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_schedule" ADD CONSTRAINT "url_schedule_enterprise_url_id_fkey" FOREIGN KEY ("enterprise_url_id") REFERENCES "enterprise_url"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_category" ADD CONSTRAINT "enterprise_category_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_rotation" ADD CONSTRAINT "category_rotation_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "enterprise_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
