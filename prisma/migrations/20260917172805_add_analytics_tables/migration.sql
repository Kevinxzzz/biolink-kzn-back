-- CreateTable
CREATE TABLE "url_count_daily_clicks" (
    "id" UUID NOT NULL,
    "daily_clicks" INTEGER NOT NULL,
    "reference_date" DATE NOT NULL,
    "enterprise_url_id" UUID NOT NULL,
    "enterprise_id" UUID NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "url_count_daily_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_count_daily_clicks" (
    "id" UUID NOT NULL,
    "daily_clicks" INTEGER NOT NULL,
    "reference_date" DATE NOT NULL,
    "category_id" UUID NOT NULL,
    "enterprise_id" UUID NOT NULL,
    "create_at" TIMESTAMP(3) NOT NULL,
    "update_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_count_daily_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "url_count_daily_clicks_enterprise_url_id_reference_date_key" ON "url_count_daily_clicks"("enterprise_url_id", "reference_date");

-- CreateIndex
CREATE UNIQUE INDEX "category_count_daily_clicks_category_id_reference_date_key" ON "category_count_daily_clicks"("category_id", "reference_date");

-- AddForeignKey
ALTER TABLE "url_count_daily_clicks" ADD CONSTRAINT "url_count_daily_clicks_enterprise_url_id_fkey" FOREIGN KEY ("enterprise_url_id") REFERENCES "enterprise_url"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "url_count_daily_clicks" ADD CONSTRAINT "url_count_daily_clicks_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_count_daily_clicks" ADD CONSTRAINT "category_count_daily_clicks_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "enterprise_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_count_daily_clicks" ADD CONSTRAINT "category_count_daily_clicks_enterprise_id_fkey" FOREIGN KEY ("enterprise_id") REFERENCES "enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
