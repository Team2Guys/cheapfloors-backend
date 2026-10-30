-- Editable H2 shown above the product / accessory description (falls back to the name).
ALTER TABLE "Products" ADD COLUMN "Description_Heading" TEXT;

ALTER TABLE "Acessories" ADD COLUMN "Description_Heading" TEXT;
