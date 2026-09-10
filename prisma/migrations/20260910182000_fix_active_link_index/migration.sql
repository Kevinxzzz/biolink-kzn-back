DROP INDEX IF EXISTS "enterprise_url_active_key";

CREATE UNIQUE INDEX "enterprise_url_active_key"
ON "enterprise_url"("enterprise_id", "category_id")
WHERE "active" = true;
