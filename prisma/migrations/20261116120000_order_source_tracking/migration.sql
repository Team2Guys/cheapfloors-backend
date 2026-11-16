-- Order source tracking: where each order came from (all columns nullable,
-- so rows placed before tracking keep working), the CCAvenue result for
-- failed vs abandoned checkouts, a normalised phone for WhatsApp matching,
-- and a WhatsApp click log. Additive only.

-- AlterTable
ALTER TABLE "salesProducts" ADD COLUMN     "channel" TEXT,
ADD COLUMN     "fbclid" TEXT,
ADD COLUMN     "firstTouchChannel" TEXT,
ADD COLUMN     "firstTouchDetail" TEXT,
ADD COLUMN     "firstVisit" TIMESTAMP(3),
ADD COLUMN     "gatewayStatus" TEXT,
ADD COLUMN     "gclid" TEXT,
ADD COLUMN     "landingPage" TEXT,
ADD COLUMN     "lastTouchChannel" TEXT,
ADD COLUMN     "lastTouchDetail" TEXT,
ADD COLUMN     "phoneE164" TEXT,
ADD COLUMN     "referrer" TEXT,
ADD COLUMN     "sourceTracked" TEXT,
ADD COLUMN     "touchPath" JSONB;

-- CreateTable
CREATE TABLE "WhatsAppClick" (
    "id" SERIAL NOT NULL,
    "ref" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppClick_channel_createdAt_idx" ON "WhatsAppClick"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "salesProducts_channel_checkoutDate_idx" ON "salesProducts"("channel", "checkoutDate");

-- CreateIndex
CREATE INDEX "salesProducts_phoneE164_idx" ON "salesProducts"("phoneE164");

