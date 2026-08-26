-- CreateTable
CREATE TABLE "Blogs" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "posterImageUrl" JSONB,
    "Images_Alt_Text" TEXT,
    "Meta_Title" TEXT,
    "Meta_Description" TEXT,
    "Canonical_Tag" TEXT,
    "custom_url" TEXT NOT NULL,
    "last_editedBy" TEXT,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "status" "BlogStatus" DEFAULT 'PUBLISHED',

    CONSTRAINT "Blogs_pkey" PRIMARY KEY ("id")
);
