-- DropForeignKey
ALTER TABLE "category_rotation" DROP CONSTRAINT "category_rotation_category_id_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_category" DROP CONSTRAINT "enterprise_category_enterprise_id_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_count_daily_clicks" DROP CONSTRAINT "enterprise_count_daily_clicks_enterprise_id_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_token_invite" DROP CONSTRAINT "enterprise_token_invite_enterprise_id_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_url" DROP CONSTRAINT "enterprise_url_category_id_fkey";

-- DropForeignKey
ALTER TABLE "enterprise_url" DROP CONSTRAINT "enterprise_url_enterprise_id_fkey";

-- DropForeignKey
ALTER TABLE "influencer" DROP CONSTRAINT "influencer_enterprise_id_fkey";

-- DropForeignKey
ALTER TABLE "influencer_count_daily_clicks" DROP CONSTRAINT "influencer_count_daily_clicks_influencer_id_fkey";

-- DropForeignKey
ALTER TABLE "influencer_platform_url" DROP CONSTRAINT "influencer_platform_url_influencer_id_fkey";

-- DropForeignKey
ALTER TABLE "url_schedule" DROP CONSTRAINT "url_schedule_enterprise_url_id_fkey";

-- DropForeignKey
ALTER TABLE "user" DROP CONSTRAINT "user_enterprise_id_fkey";

-- DropForeignKey
ALTER TABLE "user_token_invite" DROP CONSTRAINT "user_token_invite_token_invite_id_fkey";

-- AddForeignKey
ALTER TABLE "enterprise_token_invite" ADD CONSTRAINT "enterprise_token_invite_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_token_invite" ADD CONSTRAINT "user_token_invite_token_invite_id_fkey" FOREIGN KEY ("token_invite_id") REFERENCES "enterprise_token_invite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer" ADD CONSTRAINT "influencer_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_platform_url" ADD CONSTRAINT "influencer_platform_url_influencer_id_fkey" FOREIGN KEY ("influencer_id") REFERENCES "influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_count_daily_clicks" ADD CONSTRAINT "influencer_count_daily_clicks_influencer_id_fkey" FOREIGN KEY ("influencer_id") REFERENCES "influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_url" ADD CONSTRAINT "enterprise_url_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_url" ADD CONSTRAINT "enterprise_url_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "enterprise_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_schedule" ADD CONSTRAINT "url_schedule_enterprise_url_id_fkey" FOREIGN KEY ("enterprise_url_id") REFERENCES "enterprise_url"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_category" ADD CONSTRAINT "enterprise_category_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_rotation" ADD CONSTRAINT "category_rotation_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "enterprise_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_count_daily_clicks" ADD CONSTRAINT "enterprise_count_daily_clicks_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
