-- CreateTable
CREATE TABLE "enterprise" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "enterprise_id" UUID NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "counter_entries" INTEGER NOT NULL,
    "personal_url" TEXT NOT NULL,
    "url_img_profile" TEXT NOT NULL,
    "img_key" TEXT NOT NULL,
    "enterprise_id" UUID NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "influencer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer_platform_url" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "influencer_id" UUID NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "influencer_platform_url_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer_count_daily_clicks" (
    "id" UUID NOT NULL,
    "daily_clicks" INTEGER NOT NULL,
    "reference_date" DATE NOT NULL,
    "influencer_id" UUID NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "influencer_count_daily_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_url" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "count_clicks" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "order" INTEGER NOT NULL,
    "in_rotation_pool" BOOLEAN NOT NULL,
    "enterprise_id" UUID NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_url_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toggle_url_schedule" (
    "id" UUID NOT NULL,
    "enterprise_url_id" UUID NOT NULL,
    "date_time" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "toggle_url_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_toggle_url" (
    "id" UUID NOT NULL,
    "toggle_type" TEXT NOT NULL,
    "limit_clicks" INTEGER NOT NULL,
    "timer_in_minutes" INTEGER NOT NULL,
    "enterprise_id" UUID NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_toggle_url_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enterprise_count_daily_clicks" (
    "id" UUID NOT NULL,
    "daily_clicks" INTEGER NOT NULL,
    "reference_date" DATE NOT NULL,
    "enterprise_id" UUID NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enterprise_count_daily_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_toggle_url_enterprise_id_key" ON "enterprise_toggle_url"("enterprise_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer" ADD CONSTRAINT "influencer_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_platform_url" ADD CONSTRAINT "influencer_platform_url_influencer_id_fkey" FOREIGN KEY ("influencer_id") REFERENCES "influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_count_daily_clicks" ADD CONSTRAINT "influencer_count_daily_clicks_influencer_id_fkey" FOREIGN KEY ("influencer_id") REFERENCES "influencer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_url" ADD CONSTRAINT "enterprise_url_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toggle_url_schedule" ADD CONSTRAINT "toggle_url_schedule_enterprise_url_id_fkey" FOREIGN KEY ("enterprise_url_id") REFERENCES "enterprise_url"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_toggle_url" ADD CONSTRAINT "enterprise_toggle_url_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enterprise_count_daily_clicks" ADD CONSTRAINT "enterprise_count_daily_clicks_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
