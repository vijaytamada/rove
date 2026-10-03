-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Staff sign in with email + password; customers sign in with their phone number.
ALTER TABLE "User"
  ADD CONSTRAINT "User_staff_has_credentials"
  CHECK ("role" = 'CUSTOMER' OR ("email" IS NOT NULL AND "passwordHash" IS NOT NULL)),
  ADD CONSTRAINT "User_customer_has_phone"
  CHECK ("role" <> 'CUSTOMER' OR "phone" IS NOT NULL);
