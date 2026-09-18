/*
  Warnings:

  - You are about to drop the `category_count_daily_clicks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "category_count_daily_clicks" DROP CONSTRAINT "category_count_daily_clicks_category_id_fkey";

-- DropForeignKey
ALTER TABLE "category_count_daily_clicks" DROP CONSTRAINT "category_count_daily_clicks_enterprise_id_fkey";

-- DropForeignKey
ALTER TABLE "url_count_daily_clicks" DROP CONSTRAINT "url_count_daily_clicks_enterprise_id_fkey";

-- DropTable
DROP TABLE "category_count_daily_clicks";
