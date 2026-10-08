-- FAQ section on category / subcategory pages, edited from the dashboard.
ALTER TABLE "Category" ADD COLUMN "FAQS" JSONB[] DEFAULT ARRAY[]::JSONB[];

ALTER TABLE "subCategories" ADD COLUMN "FAQS" JSONB[] DEFAULT ARRAY[]::JSONB[];
