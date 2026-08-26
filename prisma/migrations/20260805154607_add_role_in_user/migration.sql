/*
  Warnings:

  - Changed the type of `toggle_type` on the `enterprise_toggle_url` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `platform` on the `influencer_platform_url` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `role` to the `user` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ToogleType" AS ENUM ('MANUAL', 'LIMITCLICKS', 'SCHEDULE', 'TIMER');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('TIKTOK', 'INSTAGRAM', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN');

-- AlterTable
ALTER TABLE "enterprise_toggle_url" DROP COLUMN "toggle_type",
ADD COLUMN     "toggle_type" "ToogleType" NOT NULL;

-- AlterTable
ALTER TABLE "influencer_platform_url" DROP COLUMN "platform",
ADD COLUMN     "platform" "Platform" NOT NULL;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" "UserRole" NOT NULL;
