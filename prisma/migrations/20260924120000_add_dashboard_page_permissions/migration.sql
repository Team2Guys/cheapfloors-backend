-- Dashboard page access flags for admins (one per sidebar page).
ALTER TABLE "Admins"
  ADD COLUMN "canViewAccessories" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewOrders" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewFreeSampleOrders" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewAbandonedOrders" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewMeasurementAppointments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewInstallationAppointments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewBlogs" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewRedirectUrls" BOOLEAN NOT NULL DEFAULT false;
