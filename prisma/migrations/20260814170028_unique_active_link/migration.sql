-- CreateIndex
CREATE UNIQUE INDEX "enterprise_url_url_key" ON "enterprise_url"("url");

-- CreateIndex
CREATE UNIQUE INDEX "enterprise_url_active_key" ON "enterprise_url"("enterprise_id") WHERE "active" = true;