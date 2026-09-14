/*
  Warnings:

  - Added the required column `expires_at` to the `enterprise_token_invite` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "enterprise_token_invite" ADD COLUMN     "expires_at" TIMESTAMP(3) NOT NULL;
