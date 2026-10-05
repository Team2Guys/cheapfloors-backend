-- JSON-LD structured data entered from the dashboard forms.
ALTER TABLE "Category" ADD COLUMN "Schema_Json" TEXT;

ALTER TABLE "Products" ADD COLUMN "Schema_Json" TEXT;

ALTER TABLE "subCategories" ADD COLUMN "Schema_Json" TEXT;

ALTER TABLE "Acessories" ADD COLUMN "Schema_Json" TEXT;
