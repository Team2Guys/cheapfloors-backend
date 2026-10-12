-- Product stock is now tracked in SQM (fractional) instead of whole boxes.
-- Accessories keep their integer piece count.
ALTER TABLE "Products" ALTER COLUMN "stock" TYPE DOUBLE PRECISION;

-- Convert the existing box counts to SQM using each product's SQM-per-carton.
-- Products whose coverage is blank or not numeric are left as-is; the Google
-- Sheet stock sync rewrites them from its "Total SQM" column on its next run.
UPDATE "Products"
SET "stock" = ROUND("stock"::NUMERIC * TRIM("boxCoverage")::NUMERIC, 2)
WHERE TRIM(COALESCE("boxCoverage", '')) ~ '^[0-9]+(\.[0-9]+)?$';
